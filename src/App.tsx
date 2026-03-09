import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock, Upload, CheckCircle, Flag, ChevronLeft, ChevronRight,
  LayoutGrid, Eye, Play, LogOut, Check, Timer, HelpCircle, Trophy,
  Users, Copy, User, Shuffle, Zap, XCircle, BarChart3, Download, Sparkles
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
  const [appState, setAppState] = useState<'welcome' | 'lobby' | 'countdown' | 'playing' | 'leaderboard' | 'review'>('welcome');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState<any>(null);
  const [isHost, setIsHost] = useState(false);
  
  // Exam State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [countdown, setCountdown] = useState(5);
  const [hasFinished, setHasFinished] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [isPasteModalOpen, setPasteModalOpen] = useState(false);

  const copyAITemplate = () => {
    const template = `Generate exactly in strict CSV format using the following schema:

ID;Question;Options(separated by |);Answer;Image;Explanation;Category;Difficulty

STRICT OUTPUT RULES (MANDATORY):
1. Output ONLY raw CSV rows.
2. Do NOT include code blocks, markdown, comments, headings, or explanations outside the CSV.
3. Do NOT include a header row.
4. Each row must contain exactly 8 columns separated by semicolons (;).
5. Never leave required columns missing. Use empty field only for Image if none applies.

COLUMN DEFINITIONS:
• ID: Unique numeric or alphanumeric identifier (no spaces). Example: Q001
• Question: Clear, precise, exam-level question. No ambiguity.
• Options(separated by |): For MCQ: provide exactly 4 options. Format: A) Option text|B) Option text|C) Option text|D) Option text. For essay questions: write exactly: ESSAY
• Answer: For MCQ: write the FULL correct option text including its letter. Example: B) Mitochondria. For essay: write a concise model answer.
• Image: Leave empty unless an image URL is necessary.
• Explanation: Clear, educational explanation of WHY the answer is correct.
• Category: Specific subject category related to the topic.
• Difficulty: Must be exactly one of: Easy, Medium, Hard

FORMAT EXAMPLE (FOLLOW EXACT STRUCTURE):
Q001;What is the functional unit of the kidney?;A) Nephron|B) Neuron|C) Alveolus|D) Glomerulus;A) Nephron;;The nephron is the microscopic structural and functional unit of the kidney responsible for filtration and urine formation.;Physiology;Easy
Q002;Explain how oxygen is transported in blood.;ESSAY;Oxygen is transported primarily bound to hemoglobin in red blood cells, with a small portion dissolved in plasma.;;Hemoglobin enables efficient oxygen transport and release based on pressure gradients.;Physiology;Medium

Generate 10 questions about [INSERT TOPIC HERE]:`;
    
    navigator.clipboard.writeText(template)
      .then(() => alert("AI prompt copied to clipboard! Paste it into ChatGPT."))
      .catch(() => alert("Failed to copy to clipboard."));
  };

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
      setAppState('countdown');
      setCountdown(5);
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
    if (appState === 'countdown') {
      interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            setAppState('playing');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (appState === 'playing' && timeRemaining > 0 && !hasFinished) {
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

  const handleReviewExam = () => {
    setAppState('review');
    setCurrentQuestionIndex(0);
  };

  // --- Renderers ---
  if (appState === 'welcome') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4"
      >
        <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl p-8 rounded-3xl border border-slate-700 shadow-2xl space-y-8">
          <motion.div 
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
            className="text-center"
          >
            <h1 className="text-4xl font-black tracking-tight mb-2">Arcane<span className="text-indigo-400">EXAMS</span></h1>
            <p className="text-slate-400">Multiplayer Exam Platform</p>
          </motion.div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-slate-400 block mb-1">Your Name</label>
              <input 
                type="text" 
                value={playerName} 
                onChange={e => setPlayerName(e.target.value)}
                className="w-full p-3 bg-slate-900/50 rounded-xl border border-slate-700 focus:border-indigo-500 outline-none transition-colors"
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
                  className="flex-1 p-3 bg-slate-900/50 rounded-xl border border-slate-700 focus:border-indigo-500 outline-none uppercase transition-colors"
                  placeholder="ROOM CODE"
                  maxLength={6}
                />
                <Button variant="secondary" onClick={handleJoinRoom}>Join</Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (appState === 'lobby') {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8"
      >
        <div className="max-w-4xl mx-auto space-y-6">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4"
          >
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
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700 shadow-xl space-y-4"
            >
              <h3 className="text-lg font-bold flex items-center gap-2"><Users size={20}/> Players ({room?.players.length})</h3>
              <div className="space-y-2">
                <AnimatePresence>
                  {room?.players.map((p: any) => (
                    <motion.div 
                      key={p.id} 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-700"
                    >
                      <span className="font-medium">{p.name} {p.id === socket?.id ? '(You)' : ''}</span>
                      {p.id === room.hostId && <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded-full font-bold">HOST</span>}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>

            <motion.div 
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700 shadow-xl space-y-4"
            >
              <h3 className="text-lg font-bold flex items-center gap-2"><LayoutGrid size={20}/> Exam Settings</h3>
              
              {isHost ? (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-slate-400">Questions Loaded</span>
                      <span className="font-bold text-indigo-400">{room?.examData?.length || 0}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setPasteModalOpen(true)}>
                        <Upload size={16} className="mr-2"/> Load CSV
                      </Button>
                      <Button variant="ai" size="icon" onClick={copyAITemplate} title="Copy AI Prompt">
                        <Sparkles size={16} />
                      </Button>
                    </div>
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
            </motion.div>
          </div>
        </div>

        {/* Paste Modal */}
        <AnimatePresence>
          {isPasteModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl p-6 flex flex-col max-h-[90vh]"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">Paste CSV Questions</h2>
                  <button onClick={() => setPasteModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><XCircle size={24}/></button>
                </div>
                <textarea
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste your CSV content here..."
                  className="w-full flex-1 p-4 bg-slate-900 rounded-xl border border-slate-700 font-mono text-sm resize-none outline-none focus:border-indigo-500 transition-colors"
                />
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" onClick={() => setPasteContent(SAMPLE_CSV)} className="flex-1">Load Sample</Button>
                  <Button variant="ai" onClick={copyAITemplate} className="flex-1">
                    <Sparkles size={16} className="mr-2" /> Copy AI Prompt
                  </Button>
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (appState === 'countdown') {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4"
      >
        <div className="text-center space-y-8">
          <h2 className="text-3xl font-bold text-slate-400">Exam starting in...</h2>
          <motion.div 
            key={countdown}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            className="text-9xl font-black text-indigo-500"
          >
            {countdown}
          </motion.div>
          <p className="text-slate-500">Get ready!</p>
        </div>
      </motion.div>
    );
  }

  if (appState === 'playing' && !hasFinished) {
    const currentQuestion = room?.examData[currentQuestionIndex];
    if (!currentQuestion) return <div>Loading...</div>;

    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-slate-900 text-slate-100 flex flex-col"
      >
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

          <AnimatePresence mode="wait">
            <motion.div 
              key={currentQuestionIndex}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-3 flex-1"
            >
              <div className="bg-slate-800/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-slate-700 shadow-xl mb-6">
                <h3 className="text-lg md:text-xl font-semibold leading-relaxed">{currentQuestion.text}</h3>
              </div>

              {currentQuestion.isEssay ? (
                <textarea
                  value={userAnswers[currentQuestionIndex] || ''}
                  onChange={(e) => setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: e.target.value }))}
                  placeholder="Type your answer here..."
                  className="w-full flex-1 min-h-[200px] p-6 rounded-2xl bg-slate-800/50 border border-slate-700 outline-none focus:border-indigo-500 resize-none transition-colors"
                />
              ) : (
                currentQuestion.options.map((option: string, idx: number) => {
                  const isSelected = userAnswers[currentQuestionIndex] === option;
                  return (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      key={idx}
                      onClick={() => setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: option }))}
                      className={cn(
                        "flex items-center gap-4 p-4 md:p-5 rounded-xl border-2 text-left transition-all duration-200",
                        isSelected ? "border-indigo-500 bg-indigo-500/10" : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
                      )}
                    >
                      <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors", isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-500")}>
                        {isSelected && <motion.div layoutId="selectedDot" className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                      <span className="text-base md:text-lg font-medium">{option}</span>
                    </motion.button>
                  );
                })
              )}
            </motion.div>
          </AnimatePresence>

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
      </motion.div>
    );
  }

  if (appState === 'review') {
    const currentQuestion = room?.examData[currentQuestionIndex];
    if (!currentQuestion) return <div>Loading...</div>;

    const userAnswer = userAnswers[currentQuestionIndex];
    const isCorrect = essayEvaluator.isCorrect(userAnswer, currentQuestion.correctAnswer, currentQuestion.isEssay);

    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-slate-900 text-slate-100 flex flex-col"
      >
        <header className="sticky top-0 z-40 w-full bg-slate-800/80 backdrop-blur-md border-b border-slate-700 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="font-bold text-lg">Arcane<span className="text-indigo-400">EXAMS</span> <span className="text-slate-500 text-sm ml-2">Review Mode</span></div>
            <Button variant="outline" size="sm" onClick={() => setAppState('leaderboard')}>
              Back to Leaderboard
            </Button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-3xl mx-auto p-4 md:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-indigo-400">{String(currentQuestionIndex + 1).padStart(2, '0')}</span>
              <span className="text-slate-500 font-medium text-lg">/ {room.examData.length}</span>
            </div>
            <div className={cn(
              "px-4 py-1.5 rounded-full font-bold text-sm flex items-center gap-2",
              isCorrect ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
            )}>
              {isCorrect ? <><CheckCircle size={16} /> Correct</> : <><XCircle size={16} /> Incorrect</>}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div 
              key={`review-${currentQuestionIndex}`}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-3 flex-1"
            >
              <div className="bg-slate-800/50 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-slate-700 shadow-xl mb-6">
                <h3 className="text-lg md:text-xl font-semibold leading-relaxed">{currentQuestion.text}</h3>
              </div>

              {currentQuestion.isEssay ? (
                <div className="space-y-4">
                  <div className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700">
                    <h4 className="text-sm font-bold text-slate-400 mb-2">Your Answer:</h4>
                    <p className={cn("text-lg", !userAnswer && "text-slate-500 italic")}>{userAnswer || "No answer provided"}</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <h4 className="text-sm font-bold text-emerald-400 mb-2">Expected Answer:</h4>
                    <p className="text-lg text-slate-200">{currentQuestion.correctAnswer}</p>
                  </div>
                </div>
              ) : (
                currentQuestion.options.map((option: string, idx: number) => {
                  const isSelected = userAnswer === option;
                  const isOptionCorrect = essayEvaluator.isCorrect(option, currentQuestion.correctAnswer, false);
                  
                  let optionStyle = "border-slate-700 bg-slate-800/50 opacity-50";
                  let iconStyle = "border-slate-600";
                  let Icon = null;

                  if (isOptionCorrect) {
                    optionStyle = "border-emerald-500 bg-emerald-500/20 text-emerald-100 shadow-lg shadow-emerald-500/10";
                    iconStyle = "border-emerald-500 bg-emerald-500 text-white";
                    Icon = Check;
                  } else if (isSelected && !isOptionCorrect) {
                    optionStyle = "border-red-500 bg-red-500/20 text-red-100";
                    iconStyle = "border-red-500 bg-red-500 text-white";
                    Icon = XCircle;
                  }

                  return (
                    <motion.div
                      initial={{ scale: 0.98, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      key={idx}
                      className={cn(
                        "flex items-center gap-4 p-4 md:p-5 rounded-xl border-2 text-left transition-all duration-200",
                        optionStyle
                      )}
                    >
                      <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0", iconStyle)}>
                        {Icon && <Icon size={14} strokeWidth={3} />}
                      </div>
                      <span className="text-base md:text-lg font-medium">{option}</span>
                    </motion.div>
                  );
                })
              )}

              {currentQuestion.explanation && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-4 p-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/30"
                >
                  <h4 className="text-sm font-bold text-indigo-400 mb-2 flex items-center gap-2">
                    <HelpCircle size={16} /> Explanation
                  </h4>
                  <p className="text-slate-300 leading-relaxed">{currentQuestion.explanation}</p>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-800">
            <Button 
              variant="outline" 
              onClick={() => setCurrentQuestionIndex(p => p - 1)} 
              disabled={currentQuestionIndex === 0}
            >
              <ChevronLeft className="mr-2" size={20} /> Previous
            </Button>
            
            <Button 
              variant="primary" 
              onClick={() => setCurrentQuestionIndex(p => p + 1)}
              disabled={currentQuestionIndex === room.examData.length - 1}
            >
              Next <ChevronRight className="ml-2" size={20} />
            </Button>
          </div>
        </main>
      </motion.div>
    );
  }

  if (appState === 'leaderboard' || hasFinished) {
    // Sort players by score descending, then time taken ascending
    const sortedPlayers = [...(room?.players || [])].sort((a: any, b: any) => {
      const aScore = a.score !== null ? a.score : -1;
      const bScore = b.score !== null ? b.score : -1;
      
      if (bScore !== aScore) return bScore - aScore;
      
      const aTime = a.timeTaken !== null ? a.timeTaken : Infinity;
      const bTime = b.timeTaken !== null ? b.timeTaken : Infinity;
      
      return aTime - bTime;
    });

    const allFinished = room?.players?.length > 0 && room.players.every((p: any) => p.finished);
    let subtitle = "Waiting for other players to finish...";
    
    if (allFinished) {
      if (sortedPlayers.length === 1) {
        subtitle = `🏆 ${sortedPlayers[0].name} wins!`;
      } else if (sortedPlayers.length > 1) {
        const first = sortedPlayers[0];
        const second = sortedPlayers[1];
        if (first.score > second.score || (first.score === second.score && first.timeTaken < second.timeTaken)) {
          subtitle = `🏆 ${first.name} wins!`;
        } else if (first.score === second.score && first.timeTaken === second.timeTaken) {
          subtitle = "🤝 It's a tie!";
        } else {
          subtitle = "Exam completed by all players";
        }
      } else {
        subtitle = "Exam completed by all players";
      }
    }

    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 flex flex-col items-center"
      >
        <div className="max-w-3xl w-full space-y-8">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center space-y-2"
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
              transition={{ duration: 1, delay: 0.5 }}
            >
              <Trophy size={64} className="mx-auto text-yellow-500 mb-4" />
            </motion.div>
            <h1 className="text-4xl font-black tracking-tight">Leaderboard</h1>
            <p className="text-slate-400 text-lg">{subtitle}</p>
          </motion.div>

          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700 shadow-2xl overflow-hidden"
          >
            <div className="grid grid-cols-12 gap-4 p-4 bg-slate-800 border-b border-slate-700 font-bold text-slate-400 text-sm uppercase tracking-wider">
              <div className="col-span-2 text-center">Rank</div>
              <div className="col-span-5">Player</div>
              <div className="col-span-3 text-center">Score</div>
              <div className="col-span-2 text-center">Time</div>
            </div>
            
            <div className="divide-y divide-slate-700/50">
              <AnimatePresence>
                {sortedPlayers.map((p: any, idx: number) => (
                  <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.4 + (idx * 0.1) }}
                    key={p.id} 
                    className={cn("grid grid-cols-12 gap-4 p-4 items-center transition-colors hover:bg-slate-800/30", p.id === socket?.id && "bg-indigo-500/10")}
                  >
                  <div className="col-span-2 flex justify-center">
                    {idx === 0 ? <span className="w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center font-bold border border-yellow-500/50">1</span> :
                     idx === 1 ? <span className="w-8 h-8 rounded-full bg-slate-300/20 text-slate-300 flex items-center justify-center font-bold border border-slate-300/50">2</span> :
                     idx === 2 ? <span className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center font-bold border border-orange-500/50">3</span> :
                     <span className="w-8 h-8 flex items-center justify-center font-bold text-slate-500">{idx + 1}</span>}
                  </div>
                  <div className="col-span-5 font-medium flex items-center gap-2">
                    {p.name}
                    {p.id === socket?.id && <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">You</span>}
                    {idx === 0 && allFinished && subtitle.includes('wins!') && <span className="text-yellow-500">👑</span>}
                  </div>
                  <div className="col-span-3 text-center font-bold text-lg text-emerald-400">
                    {p.score !== null ? `${p.score}%` : '-'}
                  </div>
                  <div className="col-span-2 text-center text-slate-400 font-mono text-sm">
                    {p.timeTaken ? formatTime(p.timeTaken) : '-'}
                  </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex justify-center gap-4 pt-4"
          >
            <Button size="lg" variant="outline" onClick={handleReviewExam}>
              <Eye size={20} className="mr-2" /> Review Answers
            </Button>
            {isHost && (
              <Button size="lg" onClick={handleRestartExam}>
                <Shuffle size={20} className="mr-2" /> Play Again
              </Button>
            )}
          </motion.div>
          {!isHost && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="text-center text-slate-400 pt-4"
            >
              Waiting for host to restart or close the room...
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  }

  return null;
}
