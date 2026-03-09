import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Clock, Upload, CheckCircle, Flag, ChevronLeft, ChevronRight,
  LayoutGrid, Eye, Play, LogOut, Check, Timer, HelpCircle, Trophy,
  Users, Copy, User, Shuffle, Zap, XCircle, BarChart3, Download
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- CSV Parsing ---
const SAMPLE_CSV = `1;What is 2+2?;A) 2|B) 3|C) 4|D) 5;C) 4;;The sum of 2 and 2 is 4. This is basic arithmetic.;Math;Easy
2;Capital of France?;A) London|B) Berlin|C) Paris|D) Madrid;C) Paris;;Paris is the capital and most populous city of France.;Geography;Easy
3;Explain gravity;ESSAY;Gravity is a force that attracts objects with mass toward each other. It's responsible for keeping planets in orbit and objects on Earth's surface.;;Gravity is a fundamental force that attracts two bodies toward each other.;Physics;Hard
4;Earth is round?;A) True|B) False;A) True;;Scientific evidence confirms Earth is an oblate spheroid.;Science;Easy
5;Largest planet?;A) Earth|B) Mars|C) Jupiter;C) Jupiter;;Jupiter is the largest planet in our solar system.;Astronomy;Medium
6;Chemical symbol for Gold?;A) Au|B) Ag|C) Fe;A) Au;;Au comes from Latin 'aurum' meaning gold.;Chemistry;Medium`;

const parseCSV = (text: string) => {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const questions = [];
  let startIndex = 0;
  if (lines.length > 0) {
    const firstLineLower = lines[0].toLowerCase();
    if (firstLineLower.startsWith('id') || firstLineLower.startsWith('question')) startIndex = 1;
  }
  for (let i = startIndex; i < lines.length; i++) {
    const cols = lines[i].split(';').map(c => c.trim());
    if (cols.length < 2) continue;
    const id = cols[0];
    const text = cols[1];
    const optionsRaw = cols[2] || '';
    const correctAnswer = cols[3] || '';
    const imageUrl = cols[4] || undefined;
    const explanation = cols[5] || '';
    const category = cols[6] || 'General';
    const difficulty = cols[7] || 'Medium';
    let options: string[] = [];
    let isEssay = false;
    if (optionsRaw.toUpperCase() === 'ESSAY' || !optionsRaw) {
      isEssay = true;
    } else {
      options = optionsRaw.includes('|') ? optionsRaw.split('|').map(o => o.trim()) : optionsRaw.split(',').map(o => o.trim());
    }
    questions.push({
      id,
      text,
      options,
      correctAnswer,
      imageUrl,
      explanation,
      isEssay,
      category,
      difficulty
    });
  }
  return questions;
};

// --- Evaluator ---
class EssayEvaluator {
  isCorrect(studentAnswer: string, correctAnswer: string, isEssay = false) {
    if (!studentAnswer || !correctAnswer) return false;
    if (isEssay) {
      // Very basic essay evaluation for demo
      return studentAnswer.length > 10 && studentAnswer.toLowerCase().includes(correctAnswer.split(' ')[0].toLowerCase());
    } else {
      return studentAnswer === correctAnswer ||
        studentAnswer.startsWith(correctAnswer) ||
        correctAnswer.startsWith(studentAnswer);
    }
  }
}
const essayEvaluator = new EssayEvaluator();

// --- Components ---
const Button = ({ children, className, variant = 'primary', size = 'md', isLoading, onClick, disabled, ...props }: any) => {
  const variants: any = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg shadow-indigo-500/30 border-transparent',
    secondary: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/30 border-transparent',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30 border-transparent',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-200 border-transparent',
    outline: 'bg-transparent border-indigo-500 text-indigo-400 hover:bg-indigo-500/10 border',
    ai: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/30 border-transparent',
    success: 'bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/30 border-transparent'
  };
  const sizes: any = { sm: 'px-3 py-1.5 text-sm', md: 'px-5 py-2.5 text-base', lg: 'px-8 py-3.5 text-lg', icon: 'p-2.5' };
  return (
    <button
      className={cn('relative overflow-hidden rounded-xl font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none', variants[variant], sizes[size], className)}
      onClick={onClick}
      disabled={isLoading || disabled}
      {...props}
    >
      <div className={cn("flex items-center justify-center gap-2", isLoading && "opacity-0")}>{children}</div>
      {isLoading && <div className="absolute inset-0 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" /></div>}
    </button>
  );
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// --- Main App ---
export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [appState, setAppState] = useState<'welcome' | 'lobby' | 'playing' | 'leaderboard'>('welcome');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState<any>(null);
  const [isHost, setIsHost] = useState(false);
  
  // Exam State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [hasFinished, setHasFinished] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [isPasteModalOpen, setPasteModalOpen] = useState(false);

  useEffect(() => {
    // Connect to the same host/port
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on("roomUpdated", (updatedRoom) => {
      setRoom(updatedRoom);
      if (updatedRoom.status === 'leaderboard') {
        setAppState('leaderboard');
      } else if (updatedRoom.status === 'lobby') {
        setAppState('lobby');
        setHasFinished(false);
        setUserAnswers({});
        setCurrentQuestionIndex(0);
      }
    });

    newSocket.on("examStarted", (updatedRoom) => {
      setRoom(updatedRoom);
      setAppState('playing');
      setTimeRemaining(updatedRoom.settings.durationMinutes * 60);
      setHasFinished(false);
      setUserAnswers({});
      setCurrentQuestionIndex(0);
    });

    newSocket.on("roomClosed", (data) => {
      alert(data.message);
      setAppState('welcome');
      setRoom(null);
      setIsHost(false);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    let interval: any;
    if (appState === 'playing' && timeRemaining > 0 && !hasFinished) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            submitExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appState, timeRemaining, hasFinished]);

  const handleCreateRoom = () => {
    if (!playerName.trim()) return alert("Please enter your name");
    socket?.emit("createRoom", { name: playerName }, (response: any) => {
      if (response.success) {
        setIsHost(true);
        setRoom(response.room);
        setAppState('lobby');
      }
    });
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) return alert("Please enter your name");
    if (!roomCode.trim()) return alert("Please enter a room code");
    socket?.emit("joinRoom", { roomId: roomCode.toUpperCase(), name: playerName }, (response: any) => {
      if (response.success) {
        setIsHost(false);
        setRoom(response.room);
        setAppState('lobby');
      } else {
        alert(response.message);
      }
    });
  };

  const handleLoadQuestions = (questions: any[]) => {
    if (!isHost || !room) return;
    socket?.emit("updateExamData", {
      roomId: room.id,
      examData: questions,
      settings: room.settings
    });
    setPasteModalOpen(false);
  };

  const handleStartExam = () => {
    if (!isHost || !room) return;
    if (room.examData.length === 0) return alert("Please load questions first");
    socket?.emit("startExam", { roomId: room.id });
  };

  const submitExam = () => {
    if (hasFinished || !room) return;
    setHasFinished(true);
    
    let correct = 0;
    room.examData.forEach((q: any, idx: number) => {
      const userAns = userAnswers[idx];
      if (userAns && essayEvaluator.isCorrect(userAns, q.correctAnswer, q.isEssay)) {
        correct++;
      }
    });

    const score = Math.round((correct / Math.max(room.examData.length, 1)) * 100);
    const timeTaken = (room.settings.durationMinutes * 60) - timeRemaining;

    socket?.emit("submitExam", { roomId: room.id, score, timeTaken });
  };

  const handleRestartExam = () => {
    if (!isHost || !room) return;
    socket?.emit("restartExam", { roomId: room.id });
  };

  // --- Renderers ---
  if (appState === 'welcome') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl p-8 rounded-3xl border border-slate-700 shadow-2xl space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-black tracking-tight mb-2">Arcane<span className="text-indigo-400">EXAMS</span></h1>
            <p className="text-slate-400">Multiplayer Exam Platform</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-slate-400 block mb-1">Your Name</label>
              <input 
                type="text" 
                value={playerName} 
                onChange={e => setPlayerName(e.target.value)}
                className="w-full p-3 bg-slate-900/50 rounded-xl border border-slate-700 focus:border-indigo-500 outline-none"
                placeholder="Enter your name"
              />
            </div>
            
            <div className="pt-4 space-y-3">
              <Button className="w-full" onClick={handleCreateRoom}>Create New Room (Host)</Button>
              
              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-700"></div>
                <span className="flex-shrink-0 mx-4 text-slate-500 text-sm">OR</span>
                <div className="flex-grow border-t border-slate-700"></div>
              </div>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={roomCode} 
                  onChange={e => setRoomCode(e.target.value.toUpperCase())}
                  className="flex-1 p-3 bg-slate-900/50 rounded-xl border border-slate-700 focus:border-indigo-500 outline-none uppercase"
                  placeholder="ROOM CODE"
                  maxLength={6}
                />
                <Button variant="secondary" onClick={handleJoinRoom}>Join</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'lobby') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Room Lobby</h2>
              <p className="text-slate-400">Room Code: <span className="font-mono text-indigo-400 font-bold text-xl tracking-widest">{room?.id}</span></p>
            </div>
            {isHost && (
              <Button size="lg" onClick={handleStartExam} disabled={!room?.examData?.length}>
                Start Exam
              </Button>
            )}
            {!isHost && (
              <div className="px-4 py-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></div>
                Waiting for host to start...
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700 shadow-xl space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2"><Users size={20}/> Players ({room?.players.length})</h3>
              <div className="space-y-2">
                {room?.players.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700">
                    <span className="font-medium">{p.name} {p.id === socket?.id ? '(You)' : ''}</span>
                    {p.id === room.hostId && <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded-full font-bold">HOST</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700 shadow-xl space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2"><LayoutGrid size={20}/> Exam Settings</h3>
              
              {isHost ? (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-slate-400">Questions Loaded</span>
                      <span className="font-bold text-indigo-400">{room?.examData?.length || 0}</span>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setPasteModalOpen(true)}>
                      <Upload size={16} className="mr-2"/> Load CSV Questions
                    </Button>
                  </div>
                  
                  <div>
                    <label className="text-sm font-bold text-slate-400 block mb-1">Duration (Minutes)</label>
                    <input 
                      type="number" 
                      value={room?.settings.durationMinutes} 
                      onChange={e => {
                        const val = parseInt(e.target.value) || 30;
                        socket?.emit("updateExamData", { roomId: room.id, examData: room.examData, settings: { ...room.settings, durationMinutes: val } });
                      }}
                      className="w-full p-2 bg-slate-900/50 rounded-xl border border-slate-700 outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700">
                    <span className="text-slate-400">Questions</span>
                    <span className="font-bold">{room?.examData?.length || 0}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700">
                    <span className="text-slate-400">Duration</span>
                    <span className="font-bold">{room?.settings.durationMinutes} mins</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Paste Modal */}
        {isPasteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl p-6 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Paste CSV Questions</h2>
                <button onClick={() => setPasteModalOpen(false)} className="text-slate-400 hover:text-white"><XCircle size={24}/></button>
              </div>
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Paste your CSV content here..."
                className="w-full flex-1 p-4 bg-slate-900 rounded-xl border border-slate-700 font-mono text-sm resize-none outline-none focus:border-indigo-500"
              />
              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={() => setPasteContent(SAMPLE_CSV)} className="flex-1">Load Sample</Button>
                <Button 
                  className="flex-1"
                  onClick={() => {
                    if (pasteContent.trim()) {
                      const questions = parseCSV(pasteContent);
                      if (questions.length > 0) {
                        handleLoadQuestions(questions);
                      } else {
                        alert("No valid questions found.");
                      }
                    }
                  }}
                >
                  Load Questions
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (appState === 'playing' && !hasFinished) {
    const currentQuestion = room?.examData[currentQuestionIndex];
    if (!currentQuestion) return <div>Loading...</div>;

    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
        <header className="sticky top-0 z-40 w-full bg-slate-800/80 backdrop-blur-md border-b border-slate-700 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="font-bold text-lg">Arcane<span className="text-indigo-400">EXAMS</span></div>
            <div className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-lg transition-colors",
                timeRemaining < 300 ? "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse" : "bg-slate-900/80 border-slate-700"
            )}>
              <Clock size={16} />
              <span className="font-mono font-bold tracking-wider">{formatTime(timeRemaining)}</span>
            </div>
            <Button variant="danger" size="sm" onClick={submitExam}>
              Submit Exam
            </Button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-3xl mx-auto p-4 md:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-indigo-400">{String(currentQuestionIndex + 1).padStart(2, '0')}</span>
              <span className="text-slate-500 font-medium text-lg">/ {room.examData.length}</span>
            </div>
            <Button 
              variant={flaggedQuestions.has(currentQuestionIndex) ? 'secondary' : 'ghost'} 
              size="sm" 
              onClick={() => { 
                const newFlags = new Set(flaggedQuestions); 
                if (newFlags.has(currentQuestionIndex)) newFlags.delete(currentQuestionIndex); 
                else newFlags.add(currentQuestionIndex); 
                setFlaggedQuestions(newFlags); 
              }} 
              className="gap-2 border border-slate-700"
            >
              <Flag size={16} fill={flaggedQuestions.has(currentQuestionIndex) ? "currentColor" : "none"} />
              Flag
            </Button>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-slate-700 shadow-xl mb-6">
            <h3 className="text-lg md:text-xl font-semibold leading-relaxed">{currentQuestion.text}</h3>
          </div>

          <div className="flex flex-col gap-3 flex-1">
            {currentQuestion.isEssay ? (
              <textarea
                value={userAnswers[currentQuestionIndex] || ''}
                onChange={(e) => setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: e.target.value }))}
                placeholder="Type your answer here..."
                className="w-full flex-1 min-h-[200px] p-6 rounded-2xl bg-slate-800/50 border border-slate-700 outline-none focus:border-indigo-500 resize-none"
              />
            ) : (
              currentQuestion.options.map((option: string, idx: number) => {
                const isSelected = userAnswers[currentQuestionIndex] === option;
                return (
                  <button
                    key={idx}
                    onClick={() => setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: option }))}
                    className={cn(
                      "flex items-center gap-4 p-4 md:p-5 rounded-xl border-2 text-left transition-all duration-200",
                      isSelected ? "border-indigo-500 bg-indigo-500/10" : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
                    )}
                  >
                    <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0", isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-500")}>
                      {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <span className="text-base md:text-lg font-medium">{option}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800">
            <Button 
              variant="outline" 
              onClick={() => setCurrentQuestionIndex(p => p - 1)} 
              disabled={currentQuestionIndex === 0}
            >
              <ChevronLeft className="mr-2" size={20} /> Previous
            </Button>
            
            {currentQuestionIndex === room.examData.length - 1 ? (
              <Button variant="primary" onClick={submitExam}>
                Submit Exam
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setCurrentQuestionIndex(p => p + 1)}>
                Next <ChevronRight className="ml-2" size={20} />
              </Button>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (appState === 'leaderboard' || hasFinished) {
    // Sort players by score descending, then time taken ascending
    const sortedPlayers = [...(room?.players || [])].sort((a: any, b: any) => {
      if (b.score !== a.score) return (b.score || 0) - (a.score || 0);
      return (a.timeTaken || 0) - (b.timeTaken || 0);
    });

    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 flex flex-col items-center">
        <div className="max-w-3xl w-full space-y-8">
          <div className="text-center space-y-2">
            <Trophy size={64} className="mx-auto text-yellow-500 mb-4" />
            <h1 className="text-4xl font-black tracking-tight">Leaderboard</h1>
            <p className="text-slate-400">Exam completed by all players</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
            <div className="grid grid-cols-12 gap-4 p-4 bg-slate-800 border-b border-slate-700 font-bold text-slate-400 text-sm uppercase tracking-wider">
              <div className="col-span-2 text-center">Rank</div>
              <div className="col-span-5">Player</div>
              <div className="col-span-3 text-center">Score</div>
              <div className="col-span-2 text-center">Time</div>
            </div>
            
            <div className="divide-y divide-slate-700/50">
              {sortedPlayers.map((p: any, idx: number) => (
                <div key={p.id} className={cn("grid grid-cols-12 gap-4 p-4 items-center transition-colors hover:bg-slate-800/30", p.id === socket?.id && "bg-indigo-500/10")}>
                  <div className="col-span-2 flex justify-center">
                    {idx === 0 ? <span className="w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center font-bold border border-yellow-500/50">1</span> :
                     idx === 1 ? <span className="w-8 h-8 rounded-full bg-slate-300/20 text-slate-300 flex items-center justify-center font-bold border border-slate-300/50">2</span> :
                     idx === 2 ? <span className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center font-bold border border-orange-500/50">3</span> :
                     <span className="w-8 h-8 flex items-center justify-center font-bold text-slate-500">{idx + 1}</span>}
                  </div>
                  <div className="col-span-5 font-medium flex items-center gap-2">
                    {p.name}
                    {p.id === socket?.id && <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">You</span>}
                  </div>
                  <div className="col-span-3 text-center font-bold text-lg text-emerald-400">
                    {p.score !== null ? `${p.score}%` : '-'}
                  </div>
                  <div className="col-span-2 text-center text-slate-400 font-mono text-sm">
                    {p.timeTaken ? formatTime(p.timeTaken) : '-'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <div className="flex justify-center gap-4 pt-4">
              <Button size="lg" onClick={handleRestartExam}>
                <Shuffle size={20} className="mr-2" /> Play Again
              </Button>
            </div>
          )}
          {!isHost && (
            <div className="text-center text-slate-400 pt-4">
              Waiting for host to restart or close the room...
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
