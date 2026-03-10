import React, { useState, useEffect, useRef } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Users, Play, ArrowLeft, Trophy, CheckCircle2, XCircle, Loader2, Copy, Check, Timer, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import Papa from 'papaparse';
import { Question, Player, GameState, MessageType, GameSettings } from '../types';
import { clsx } from 'clsx';

interface HostViewProps {
  onBack: () => void;
}

export function HostView({ onBack }: HostViewProps) {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [copied, setCopied] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [hostName, setHostName] = useState('');
  const [settings, setSettings] = useState<GameSettings>({
    timePerQuestion: 20,
    examType: 'NORMAL',
    shuffleQuestions: false,
    shuffleOptions: false,
    showCorrectAnswer: true,
    canSkipQuestions: true,
    pointMultiplier: 1,
    penaltyPoints: 0
  });
  
  const [hostQuickCurrentIndex, setHostQuickCurrentIndex] = useState(0);
  const [hostQuickAnswers, setHostQuickAnswers] = useState<Record<string, string>>({});
  const [hostQuickSubmitted, setHostQuickSubmitted] = useState(false);
  const [showHostControls, setShowHostControls] = useState(false);
  const [showReview, setShowReview] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playersRef = useRef<Player[]>([]);
  const timeLeftRef = useRef(0);
  const currentQuestionIndexRef = useRef(0);
  const questionsRef = useRef<Question[]>([]);
  const settingsRef = useRef<GameSettings>(settings);

  // Keep ref updated for callbacks
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    // Generate a 6 digit random code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const newPeer = new Peer(`arcane-exam-${code}`);
    
    newPeer.on('open', (id) => {
      setRoomCode(code);
      setPeer(newPeer);
    });

    newPeer.on('connection', (conn) => {
      conn.on('data', (data: any) => {
        handlePlayerMessage(conn, data);
      });
      
      conn.on('close', () => {
        setPlayers(prev => prev.filter(p => p.id !== conn.peer));
      });
    });

    newPeer.on('error', (err) => {
      console.error('PeerJS error:', err);
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      newPeer.destroy();
    };
  }, []);

  const broadcast = (message: MessageType) => {
    playersRef.current.forEach(p => {
      if (p.connection && p.connection.open) {
        p.connection.send(message);
      }
    });
  };

  const handlePlayerMessage = (conn: DataConnection, data: MessageType) => {
    if (data.type === 'JOIN') {
      const newPlayer: Player = {
        id: conn.peer,
        name: data.name,
        score: 0,
        hasAnswered: false,
        currentAnswer: null,
        connection: conn
      };
      
      setPlayers(prev => {
        // Prevent duplicates
        if (prev.some(p => p.id === conn.peer)) return prev;
        return [...prev, newPlayer];
      });

      conn.send({ 
        type: 'JOIN_SUCCESS', 
        playerId: conn.peer,
        gameState: gameState,
        settings: settingsRef.current
      });

      if (gameState === 'QUICK_EXAM') {
        setTimeout(() => {
          conn.send({ 
            type: 'STATE_UPDATE', 
            state: 'QUICK_EXAM', 
            data: { 
              questions: questionsRef.current.map(q => ({ id: q.id, text: q.text, options: q.options, timeLimit: q.timeLimit })),
              totalTime: questionsRef.current.reduce((acc, q) => acc + q.timeLimit, 0),
              settings: settingsRef.current
            } 
          });
        }, 500);
      } else if (gameState === 'QUESTION') {
        setTimeout(() => {
          conn.send({ 
            type: 'STATE_UPDATE', 
            state: 'QUESTION', 
            data: { 
              question: {
                id: questionsRef.current[currentQuestionIndexRef.current].id,
                text: questionsRef.current[currentQuestionIndexRef.current].text,
                options: questionsRef.current[currentQuestionIndexRef.current].options,
                timeLimit: questionsRef.current[currentQuestionIndexRef.current].timeLimit
              },
              questionIndex: currentQuestionIndexRef.current,
              totalQuestions: questionsRef.current.length,
              settings: settingsRef.current
            } 
          });
        }, 500);
      }
      
      // Broadcast updated player list
      setTimeout(() => {
        broadcast({
          type: 'PLAYER_LIST',
          players: playersRef.current.map(p => ({ id: p.id, name: p.name, score: p.score }))
        });
      }, 500);
    }

    if (data.type === 'SUBMIT_ANSWER') {
      setPlayers(prev => prev.map(p => {
        if (p.id === conn.peer && !p.hasAnswered) {
          const q = questionsRef.current[currentQuestionIndexRef.current];
          const isCorrect = data.answer === q.correctAnswer;
          let points = 0;
          
          if (isCorrect) {
            points = Math.round(1000 * (timeLeftRef.current / q.timeLimit) * settingsRef.current.pointMultiplier);
          } else {
            points = -settingsRef.current.penaltyPoints;
          }
          
          if (conn.open) {
            conn.send({
              type: 'ANSWER_RESULT',
              correct: isCorrect,
              score: points,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation
            });
          }
          
          return { ...p, hasAnswered: true, currentAnswer: data.answer, score: Math.max(0, p.score + points) };
        }
        return p;
      }));
    }

    if (data.type === 'SUBMIT_EXAM') {
      setPlayers(prev => prev.map(p => {
        if (p.id === conn.peer && !p.hasAnswered) {
          let totalScore = 0;
          const questions = questionsRef.current;
          const totalTime = questions.reduce((acc, q) => acc + q.timeLimit, 0);
          
          let correctAnswers = 0;
          let wrongAnswers = 0;
          questions.forEach(q => {
            const answer = data.answers[q.id];
            if (answer === q.correctAnswer) {
              correctAnswers++;
            } else if (answer) {
              wrongAnswers++;
            }
          });

          const timeBonus = Math.max(0, Math.round(1000 * ((totalTime - data.timeTaken) / totalTime)));
          totalScore = (correctAnswers * 1000 * settingsRef.current.pointMultiplier) 
                       - (wrongAnswers * settingsRef.current.penaltyPoints)
                       + (correctAnswers > 0 ? timeBonus : 0);

          return { ...p, hasAnswered: true, score: Math.max(0, totalScore), timeTaken: data.timeTaken };
        }
        return p;
      }));
    }
  };

  const SAMPLE_CSV = `ID;Question;Options(separated by |);Answer;Explanation
1;What is the capital of France?;Paris|London|Berlin|Madrid;Paris;Paris is the capital and most populous city of France.
2;Which planet is known as the Red Planet?;Mars|Venus|Jupiter|Saturn;Mars;Mars is often called the Red Planet because of iron oxide on its surface.
3;What is the largest ocean on Earth?;Pacific Ocean|Atlantic Ocean|Indian Ocean|Arctic Ocean;Pacific Ocean;The Pacific Ocean is the largest and deepest of Earth's oceanic divisions.`;

  const parseCSV = (text: string) => {
    Papa.parse(text, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
      complete: (results) => {
        const parsedQuestions: Question[] = results.data.map((row: any, index) => {
          const options = row['Options(separated by |)'] || row['Options'] || '';
          return {
            id: row.ID || `q-${index}`,
            text: row.Question || '',
            options: typeof options === 'string' ? options.split('|').map((o: string) => o.trim()) : [],
            correctAnswer: row.Answer || '',
            explanation: row.Explanation || '',
            timeLimit: settings.timePerQuestion // Use global setting
          };
        }).filter(q => q.text && q.options.length > 0);
        
        if (parsedQuestions.length > 0) {
          setQuestions(parsedQuestions);
        } else {
          alert('No valid questions found. Please check the format: ID;Question;Options(separated by |);Answer;Explanation');
        }
      },
      error: (error) => {
        console.error('CSV Parsing Error:', error);
        alert('Error parsing CSV: ' + error.message);
      }
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const handleTextLoad = () => {
    if (!csvText.trim()) return;
    parseCSV(csvText);
  };

  const loadSample = () => {
    setCsvText(SAMPLE_CSV);
    parseCSV(SAMPLE_CSV);
  };

  const handleHostJoin = () => {
    if (!hostName.trim()) return;
    const newPlayer: Player = {
      id: 'host',
      name: hostName.trim(),
      score: 0,
      hasAnswered: false,
      currentAnswer: null,
      connection: null as any
    };
    setPlayers(prev => [...prev, newPlayer]);
  };

  const startGame = () => {
    if (questions.length === 0) return alert('Please upload questions first');
    if (players.length === 0) return alert('Waiting for players to join');
    
    let finalQuestions = [...questions];
    
    // Shuffle questions if enabled
    if (settings.shuffleQuestions) {
      finalQuestions = finalQuestions.sort(() => Math.random() - 0.5);
    }
    
    // Shuffle options if enabled
    if (settings.shuffleOptions) {
      finalQuestions = finalQuestions.map(q => ({
        ...q,
        options: [...q.options].sort(() => Math.random() - 0.5)
      }));
    }
    
    setQuestions(finalQuestions);
    setGameState('STARTING');
    broadcast({ type: 'STATE_UPDATE', state: 'STARTING' });
    
    let countdown = 3;
    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        if (settingsRef.current.examType === 'QUICK') {
          startQuickExam();
        } else {
          startQuestion(0);
        }
      }
    }, 1000);
  };

  const startQuickExam = () => {
    setGameState('QUICK_EXAM');
    
    // Reset player answers
    setPlayers(prev => prev.map(p => ({ ...p, hasAnswered: false, currentAnswer: null, score: 0, timeTaken: 0 })));
    
    // Reset host quick exam state
    setHostQuickCurrentIndex(0);
    setHostQuickAnswers({});
    setHostQuickSubmitted(false);
    setShowHostControls(false);
    
    // Apply timePerQuestion setting to all questions if needed, or just calculate total time
    const totalTime = questionsRef.current.reduce((acc, q) => acc + q.timeLimit, 0);
    setTimeLeft(totalTime);
    
    broadcast({ 
      type: 'STATE_UPDATE', 
      state: 'QUICK_EXAM', 
      data: { 
        questions: questionsRef.current.map(q => ({ id: q.id, text: q.text, options: q.options, timeLimit: q.timeLimit })),
        totalTime,
        settings: settingsRef.current
      } 
    });

    if (timerRef.current) clearInterval(timerRef.current);
    
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleQuickExamEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleQuickExamEnd = () => {
    setGameState('LEADERBOARD');
    broadcast({ 
      type: 'STATE_UPDATE', 
      state: 'LEADERBOARD',
      data: {
        leaderboard: playersRef.current.map(p => ({ id: p.id, name: p.name, score: p.score, timeTaken: p.timeTaken })).sort((a, b) => b.score - a.score),
        fullQuestions: questionsRef.current // Send full questions including correct answers for review
      }
    });
  };

  const handleHostQuickAnswer = (answer: string) => {
    if (hostQuickSubmitted) return;
    const q = questions[hostQuickCurrentIndex];
    setHostQuickAnswers(prev => ({ ...prev, [q.id]: answer }));
  };

  const submitHostQuickExam = (force = false) => {
    if (hostQuickSubmitted && !force) return;
    setHostQuickSubmitted(true);
    
    const timeTaken = questions.reduce((acc, q) => acc + q.timeLimit, 0) - timeLeft;
    
    let totalScore = 0;
    let correctAnswers = 0;
    const totalTime = questions.reduce((acc, q) => acc + q.timeLimit, 0);

    questions.forEach(q => {
      const answer = hostQuickAnswers[q.id];
      if (answer === q.correctAnswer) {
        correctAnswers++;
      }
    });

    const timeBonus = Math.max(0, Math.round(1000 * ((totalTime - timeTaken) / totalTime)));
    totalScore = (correctAnswers * 1000) + (correctAnswers > 0 ? timeBonus : 0);

    setPlayers(prev => prev.map(p => {
      if (p.id === 'host') {
        return { ...p, hasAnswered: true, score: totalScore, timeTaken };
      }
      return p;
    }));
  };

  const startQuestion = (index: number) => {
    setCurrentQuestionIndex(index);
    setGameState('QUESTION');
    setShowAnswer(false);
    
    // Reset player answers
    setPlayers(prev => prev.map(p => ({ ...p, hasAnswered: false, currentAnswer: null })));
    
    const q = questions[index];
    setTimeLeft(q.timeLimit);
    
    broadcast({ 
      type: 'STATE_UPDATE', 
      state: 'QUESTION', 
      data: { 
        question: { text: q.text, options: q.options, timeLimit: q.timeLimit },
        questionIndex: index,
        totalQuestions: questions.length,
        settings: settingsRef.current
      } 
    });

    if (timerRef.current) clearInterval(timerRef.current);
    
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleQuestionEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Check if all players answered
  useEffect(() => {
    if (gameState === 'QUESTION' && players.length > 0 && players.every(p => p.hasAnswered)) {
      if (timerRef.current) clearInterval(timerRef.current);
      handleQuestionEnd();
    }
    if (gameState === 'QUICK_EXAM' && players.length > 0) {
      if (players.every(p => p.hasAnswered)) {
        if (timerRef.current) clearInterval(timerRef.current);
        handleQuickExamEnd();
      }
    }
  }, [players, gameState]);

  const handleQuestionEnd = () => {
    setShowAnswer(true);
    const q = questionsRef.current[currentQuestionIndexRef.current];
    
    // Send result to players who didn't answer
    playersRef.current.forEach(p => {
      if (!p.hasAnswered && p.connection && p.connection.open) {
        p.connection.send({
          type: 'ANSWER_RESULT',
          correct: false,
          score: 0,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation
        });
      }
    });
  };

  const nextPhase = () => {
    if (gameState === 'QUESTION') {
      setGameState('LEADERBOARD');
      broadcast({ 
        type: 'STATE_UPDATE', 
        state: 'LEADERBOARD',
        data: {
          leaderboard: playersRef.current.map(p => ({ id: p.id, name: p.name, score: p.score })).sort((a, b) => b.score - a.score)
        }
      });
    } else if (gameState === 'LEADERBOARD') {
      if (settings.examType === 'QUICK' || currentQuestionIndex + 1 >= questions.length) {
        setGameState('FINISHED');
        broadcast({ 
          type: 'STATE_UPDATE', 
          state: 'FINISHED',
          data: {
            leaderboard: playersRef.current.map(p => ({ id: p.id, name: p.name, score: p.score })).sort((a, b) => b.score - a.score),
            fullQuestions: questionsRef.current
          }
        });
      } else {
        startQuestion(currentQuestionIndex + 1);
      }
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      <header className="p-6 flex items-center justify-between border-b border-white/5">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Exit
        </button>
        <div className="flex items-center gap-4">
          <div className="text-sm text-zinc-400">Room Code</div>
          <div className="flex items-center gap-2 bg-zinc-900 px-4 py-2 rounded-lg border border-white/10">
            <span className="font-mono text-2xl font-bold tracking-widest text-indigo-400">{roomCode || '...'}</span>
            <button onClick={copyRoomCode} className="text-zinc-400 hover:text-white ml-2">
              {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        {gameState === 'LOBBY' && (
          <div className="w-full max-w-4xl grid md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-bold mb-2">Host a Game</h2>
                <p className="text-zinc-400">Upload your questions and wait for players to join.</p>
              </div>

              <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-medium mb-4 flex items-center justify-center gap-2">
                  <Upload className="w-5 h-5 text-zinc-400" />
                  Load Questions (CSV)
                </h3>
                <div className="space-y-4">
                  <label className="cursor-pointer block w-full bg-white text-black px-4 py-3 rounded-xl font-medium text-center hover:bg-zinc-200 transition-colors">
                    Upload CSV File
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  </label>
                  
                  <div className="flex items-center gap-4 text-sm text-zinc-500">
                    <div className="flex-1 h-px bg-white/10"></div>
                    OR PASTE TEXT
                    <div className="flex-1 h-px bg-white/10"></div>
                  </div>
                  
                  <textarea 
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-sm font-mono text-zinc-300 h-32 focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="ID;Question;Options(separated by |);Answer;Explanation&#10;1;What is 2+2?;3|4|5|6;4;Basic addition"
                    value={csvText}
                    onChange={e => setCsvText(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={handleTextLoad}
                      disabled={!csvText.trim()}
                      className="bg-zinc-800 text-white px-4 py-3 rounded-xl font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                    >
                      Load from Text
                    </button>
                    <button 
                      onClick={loadSample}
                      className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-4 py-3 rounded-xl font-medium hover:bg-indigo-600/30 transition-colors"
                    >
                      Load Sample
                    </button>
                  </div>
                </div>
                {questions.length > 0 && (
                  <div className="mt-4 text-emerald-400 flex items-center justify-center gap-2 bg-emerald-500/10 py-2 rounded-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    {questions.length} questions loaded
                  </div>
                )}
              </div>

              <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-medium mb-4">Game Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Exam Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSettings({ ...settings, examType: 'NORMAL' })}
                        className={clsx(
                          "py-2 px-4 rounded-xl text-sm font-medium transition-colors border",
                          settings.examType === 'NORMAL' 
                            ? "bg-indigo-600 border-indigo-500 text-white" 
                            : "bg-zinc-800 border-white/10 text-zinc-400 hover:bg-zinc-700"
                        )}
                      >
                        Normal (Host Controlled)
                      </button>
                      <button
                        onClick={() => setSettings({ ...settings, examType: 'QUICK' })}
                        className={clsx(
                          "py-2 px-4 rounded-xl text-sm font-medium transition-colors border",
                          settings.examType === 'QUICK' 
                            ? "bg-indigo-600 border-indigo-500 text-white" 
                            : "bg-zinc-800 border-white/10 text-zinc-400 hover:bg-zinc-700"
                        )}
                      >
                        Quick (Self-Paced)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-zinc-400 mb-2">Time Limit (sec)</label>
                      <input 
                        type="number" 
                        value={settings.timePerQuestion}
                        onChange={e => setSettings({ ...settings, timePerQuestion: parseInt(e.target.value) || 20 })}
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={settings.shuffleQuestions}
                            onChange={e => setSettings({ ...settings, shuffleQuestions: e.target.checked })}
                          />
                          <div className={clsx(
                            "w-10 h-6 rounded-full transition-colors",
                            settings.shuffleQuestions ? "bg-indigo-600" : "bg-zinc-800"
                          )}></div>
                          <div className={clsx(
                            "absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform",
                            settings.shuffleQuestions ? "translate-x-4" : "translate-x-0"
                          )}></div>
                        </div>
                        <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">Shuffle Questions</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only" 
                          checked={settings.shuffleOptions}
                          onChange={e => setSettings({ ...settings, shuffleOptions: e.target.checked })}
                        />
                        <div className={clsx(
                          "w-10 h-6 rounded-full transition-colors",
                          settings.shuffleOptions ? "bg-indigo-600" : "bg-zinc-800"
                        )}></div>
                        <div className={clsx(
                          "absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform",
                          settings.shuffleOptions ? "translate-x-4" : "translate-x-0"
                        )}></div>
                      </div>
                      <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">Shuffle Options</span>
                    </label>

                    {settings.examType === 'NORMAL' ? (
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={settings.showCorrectAnswer}
                            onChange={e => setSettings({ ...settings, showCorrectAnswer: e.target.checked })}
                          />
                          <div className={clsx(
                            "w-10 h-6 rounded-full transition-colors",
                            settings.showCorrectAnswer ? "bg-indigo-600" : "bg-zinc-800"
                          )}></div>
                          <div className={clsx(
                            "absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform",
                            settings.showCorrectAnswer ? "translate-x-4" : "translate-x-0"
                          )}></div>
                        </div>
                        <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">Show Answers</span>
                      </label>
                    ) : (
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                          <input 
                            type="checkbox" 
                            className="sr-only" 
                            checked={settings.canSkipQuestions}
                            onChange={e => setSettings({ ...settings, canSkipQuestions: e.target.checked })}
                          />
                          <div className={clsx(
                            "w-10 h-6 rounded-full transition-colors",
                            settings.canSkipQuestions ? "bg-indigo-600" : "bg-zinc-800"
                          )}></div>
                          <div className={clsx(
                            "absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform",
                            settings.canSkipQuestions ? "translate-x-4" : "translate-x-0"
                          )}></div>
                        </div>
                        <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">Allow Navigation</span>
                      </label>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">Point Multiplier</label>
                      <select 
                        value={settings.pointMultiplier}
                        onChange={e => setSettings({ ...settings, pointMultiplier: parseFloat(e.target.value) })}
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="0.5">0.5x (Easy)</option>
                        <option value="1">1x (Standard)</option>
                        <option value="1.5">1.5x (Hard)</option>
                        <option value="2">2x (Pro)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">Penalty Points</label>
                      <select 
                        value={settings.penaltyPoints}
                        onChange={e => setSettings({ ...settings, penaltyPoints: parseInt(e.target.value) })}
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="0">None</option>
                        <option value="250">Low (-250)</option>
                        <option value="500">Medium (-500)</option>
                        <option value="1000">High (-1000)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-medium mb-4">Join as Player</h3>
                {!players.some(p => p.id === 'host') ? (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Your Nickname" 
                      value={hostName}
                      onChange={e => setHostName(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <button 
                      onClick={handleHostJoin}
                      disabled={!hostName.trim()}
                      className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                    >
                      Join
                    </button>
                  </div>
                ) : (
                  <div className="text-emerald-400 flex items-center gap-2 bg-emerald-500/10 py-3 px-4 rounded-xl">
                    <CheckCircle2 className="w-5 h-5" />
                    Joined as <span className="font-bold text-white">{players.find(p => p.id === 'host')?.name}</span>
                  </div>
                )}
              </div>

              <button
                onClick={startGame}
                disabled={questions.length === 0 || players.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all"
              >
                <Play className="w-6 h-6" />
                Start Game
              </button>
            </div>

            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-400" />
                  Players ({players.length})
                </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {players.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p>Waiting for players to join...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <AnimatePresence>
                      {players.map(p => (
                        <motion.div
                          key={p.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="bg-zinc-800/50 border border-white/5 rounded-lg p-3 flex items-center gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium truncate">{p.name}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {gameState === 'STARTING' && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <h2 className="text-6xl font-bold mb-4">Get Ready!</h2>
            <p className="text-2xl text-zinc-400">Look at the screen</p>
          </motion.div>
        )}

        {gameState === 'QUESTION' && questions[currentQuestionIndex] && (
          <div className="w-full max-w-6xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-8">
              <span className="inline-block px-5 py-2 rounded-full bg-white/10 text-white/70 font-medium tracking-widest uppercase">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>
              <div className={clsx(
                "w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold border-4 shadow-xl",
                timeLeft <= 5 ? "border-red-500 text-red-500 bg-red-500/10 animate-pulse" : "border-indigo-500 text-indigo-400 bg-indigo-500/10"
              )}>
                {timeLeft}
              </div>
            </div>

            <div className="w-full bg-zinc-900 border border-white/10 rounded-[3rem] p-10 md:p-16 shadow-2xl mb-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-white/5">
                <motion.div 
                  className="h-full bg-indigo-500"
                  initial={{ width: '100%' }}
                  animate={{ width: `${(timeLeft / questions[currentQuestionIndex].timeLimit) * 100}%` }}
                  transition={{ duration: 1, ease: "linear" }}
                />
              </div>
              <h2 className="text-4xl md:text-6xl font-medium text-center leading-tight">
                {questions[currentQuestionIndex].text}
              </h2>
            </div>

            {showAnswer && questions[currentQuestionIndex].explanation && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-4xl bg-indigo-500/10 border border-indigo-500/30 p-6 rounded-2xl mb-8 text-center"
              >
                <h4 className="text-indigo-400 font-bold uppercase tracking-widest text-xs mb-2">Explanation</h4>
                <p className="text-zinc-200 text-lg italic leading-relaxed">
                  {questions[currentQuestionIndex].explanation}
                </p>
              </motion.div>
            )}

            <div className="w-full grid md:grid-cols-2 gap-6 mb-12">
              {questions[currentQuestionIndex].options.map((opt, i) => {
                const isCorrect = showAnswer && opt === questions[currentQuestionIndex].correctAnswer;
                const isWrong = showAnswer && !isCorrect;
                
                const hostPlayer = players.find(p => p.id === 'host');
                const isHostPlayer = !!hostPlayer;
                const hostHasAnswered = hostPlayer?.hasAnswered;
                const isHostSelected = hostPlayer?.currentAnswer === opt;
                
                const labels = ['A', 'B', 'C', 'D'];
                const colors = [
                  'bg-rose-500 hover:bg-rose-400 shadow-[0_8px_0_rgb(159,18,57)]',
                  'bg-blue-500 hover:bg-blue-400 shadow-[0_8px_0_rgb(30,58,138)]',
                  'bg-amber-500 hover:bg-amber-400 shadow-[0_8px_0_rgb(146,64,14)]',
                  'bg-emerald-500 hover:bg-emerald-400 shadow-[0_8px_0_rgb(6,78,59)]'
                ];
                const selectedColors = [
                  'bg-rose-600 shadow-[0_0px_0_rgb(159,18,57)] translate-y-[8px]',
                  'bg-blue-600 shadow-[0_0px_0_rgb(30,58,138)] translate-y-[8px]',
                  'bg-amber-600 shadow-[0_0px_0_rgb(146,64,14)] translate-y-[8px]',
                  'bg-emerald-600 shadow-[0_0px_0_rgb(6,78,59)] translate-y-[8px]'
                ];

                const handleHostAnswer = () => {
                  if (!isHostPlayer || hostHasAnswered || showAnswer) return;
                  
                  const q = questions[currentQuestionIndex];
                  const isCorrect = opt === q.correctAnswer;
                  const points = isCorrect ? Math.round(1000 * (timeLeftRef.current / q.timeLimit)) : 0;

                  setPlayers(prev => prev.map(p => {
                    if (p.id === 'host') {
                      return { ...p, hasAnswered: true, currentAnswer: opt, score: p.score + points };
                    }
                    return p;
                  }));
                };
                
                let btnClass = "relative p-8 rounded-3xl text-2xl font-bold transition-all flex items-center gap-6 min-h-[140px] group text-white ";
                
                if (showAnswer) {
                  if (isCorrect) {
                    btnClass += "bg-emerald-500 shadow-[0_0px_0_rgb(6,78,59)] translate-y-[8px] ring-4 ring-emerald-400 ring-offset-4 ring-offset-zinc-950";
                  } else if (isHostSelected) {
                    btnClass += "bg-red-600 shadow-[0_0px_0_rgb(153,27,27)] translate-y-[8px] opacity-50";
                  } else {
                    btnClass += "bg-zinc-800 shadow-[0_0px_0_rgb(39,39,42)] translate-y-[8px] opacity-30 grayscale";
                  }
                } else {
                  if (isHostPlayer) {
                    if (hostHasAnswered) {
                      if (isHostSelected) {
                        btnClass += selectedColors[i % 4];
                      } else {
                        btnClass += colors[i % 4] + " opacity-50 grayscale-[0.5]";
                      }
                    } else {
                      btnClass += colors[i % 4] + " active:translate-y-[8px] active:shadow-none cursor-pointer";
                    }
                  } else {
                    btnClass += colors[i % 4] + " cursor-default";
                  }
                }
                
                return (
                  <button
                    key={i}
                    onClick={handleHostAnswer}
                    disabled={showAnswer || (isHostPlayer && hostHasAnswered) || !isHostPlayer}
                    className={btnClass}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl flex-shrink-0">
                      {labels[i]}
                    </div>
                    <span className="text-left leading-tight drop-shadow-md flex-1">{opt}</span>
                    {showAnswer && isCorrect && <CheckCircle2 className="w-10 h-10 text-white drop-shadow-md flex-shrink-0" />}
                    {showAnswer && !isCorrect && isHostSelected && <XCircle className="w-10 h-10 text-white/50 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="w-full flex items-center justify-between">
              <div className="text-zinc-400">
                Answers: <span className="text-white font-bold">{players.filter(p => p.hasAnswered).length}</span> / {players.length}
              </div>
              {showAnswer && (
                <button
                  onClick={nextPhase}
                  className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-zinc-200 transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        )}

        {gameState === 'QUICK_EXAM' && (
          <div className="w-full max-w-4xl flex flex-col items-center relative">
            {/* Host Controls - Foldable */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
              <AnimatePresence>
                {showHostControls && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    className="bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl w-64 mb-2"
                  >
                    <div className="flex items-center gap-2 mb-4 text-indigo-400 font-bold text-sm uppercase tracking-wider">
                      <Settings className="w-4 h-4" /> Host Controls
                    </div>
                    <div className="space-y-3">
                      <div className="text-xs text-zinc-500 mb-1">Player Progress</div>
                      <div className="max-h-40 overflow-y-auto space-y-2 mb-4">
                        {players.filter(p => p.id !== 'host').map(p => (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="truncate max-w-[100px]">{p.name}</span>
                            {p.hasAnswered ? (
                              <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Done</span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> In Progress</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={handleQuickExamEnd}
                        className="w-full bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                      >
                        End Exam for All
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                onClick={() => setShowHostControls(!showHostControls)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-full shadow-2xl transition-all flex items-center gap-2"
              >
                {showHostControls ? <ChevronDown className="w-6 h-6" /> : <Settings className="w-6 h-6" />}
                {!showHostControls && <span className="font-bold pr-2">Host Controls</span>}
              </button>
            </div>

            {players.some(p => p.id === 'host') ? (
              /* Host as Player UI */
              <div className="w-full h-full flex flex-col">
                <div className="flex items-center justify-between mb-8 bg-zinc-900/80 backdrop-blur-md p-5 rounded-3xl border border-white/10 shadow-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xl">
                      {hostQuickCurrentIndex + 1}
                    </div>
                    <div className="text-zinc-400 font-medium">
                      of {questions.length}
                    </div>
                  </div>
                  <div className={clsx(
                    "px-6 py-3 rounded-2xl font-mono text-2xl font-bold flex items-center gap-3",
                    timeLeft <= 30 ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-white/5 text-white"
                  )}>
                    <Timer className="w-6 h-6 opacity-50" />
                    {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                  </div>
                </div>

                <div className="flex-1 flex flex-col">
                  <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-8 md:p-12 shadow-2xl mb-8">
                    <h2 className="text-3xl md:text-4xl font-medium leading-tight">
                      {questions[hostQuickCurrentIndex].text}
                    </h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {questions[hostQuickCurrentIndex].options.map((opt: string, i: number) => {
                      const isSelected = hostQuickAnswers[questions[hostQuickCurrentIndex].id] === opt;
                      const labels = ['A', 'B', 'C', 'D'];
                      return (
                        <button
                          key={i}
                          onClick={() => handleHostQuickAnswer(opt)}
                          disabled={hostQuickSubmitted}
                          className={clsx(
                            "p-6 md:p-8 rounded-3xl text-xl font-medium transition-all text-left border-2 flex items-center gap-6 group",
                            isSelected 
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-[0_0_30px_rgba(79,70,229,0.3)]" 
                              : "bg-zinc-900/50 border-white/10 hover:bg-zinc-800 hover:border-white/20 text-zinc-300",
                            hostQuickSubmitted && !isSelected && "opacity-50"
                          )}
                        >
                          <div className={clsx(
                            "w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold transition-colors flex-shrink-0",
                            isSelected ? "bg-white/20 text-white" : "bg-white/5 text-zinc-500 group-hover:bg-white/10 group-hover:text-zinc-300"
                          )}>
                            {labels[i]}
                          </div>
                          <span className="flex-1">{opt}</span>
                          {isSelected && <CheckCircle2 className="w-6 h-6 text-white flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-auto pt-6 border-t border-white/10">
                  <button
                    onClick={() => setHostQuickCurrentIndex(prev => Math.max(0, prev - 1))}
                    disabled={hostQuickCurrentIndex === 0}
                    className="px-6 py-3 rounded-xl font-medium bg-zinc-800 text-white disabled:opacity-50 hover:bg-zinc-700 transition-colors"
                  >
                    Previous
                  </button>
                  
                  {!hostQuickSubmitted ? (
                    <button
                      onClick={() => {
                        if (hostQuickCurrentIndex === questions.length - 1) {
                          if (Object.keys(hostQuickAnswers).length < questions.length) {
                            if (!confirm('You have unanswered questions. Are you sure you want to submit?')) return;
                          }
                          submitHostQuickExam();
                        } else {
                          setHostQuickCurrentIndex(prev => Math.min(questions.length - 1, prev + 1));
                        }
                      }}
                      className={clsx(
                        "px-8 py-3 rounded-xl font-bold transition-colors",
                        hostQuickCurrentIndex === questions.length - 1
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white"
                      )}
                    >
                      {hostQuickCurrentIndex === questions.length - 1 ? 'Submit Exam' : 'Next'}
                    </button>
                  ) : (
                    <div className="text-emerald-400 font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Submitted! Waiting for others...
                    </div>
                  )}
                </div>
                
                {/* Question Navigator */}
                <div className="mt-8 flex flex-wrap gap-2 justify-center">
                  {questions.map((q, i) => (
                    <button
                      key={q.id}
                      onClick={() => setHostQuickCurrentIndex(i)}
                      className={clsx(
                        "w-10 h-10 rounded-lg font-medium text-sm flex items-center justify-center transition-colors border",
                        hostQuickCurrentIndex === i ? "border-indigo-500 ring-2 ring-indigo-500/50" : "border-transparent",
                        hostQuickAnswers[q.id] ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Host as Observer UI (Original) */
              <>
                <div className="text-center mb-12">
                  <h2 className="text-5xl font-bold mb-4">Quick Exam in Progress</h2>
                  <p className="text-xl text-zinc-400">Players are answering at their own pace</p>
                </div>

                <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-8 w-full shadow-2xl mb-8">
                  <div className="flex items-center justify-between mb-8">
                    <div className="text-2xl font-medium">Time Remaining</div>
                    <div className={clsx(
                      "text-4xl font-mono font-bold flex items-center gap-3",
                      timeLeft <= 30 ? "text-red-400 animate-pulse" : "text-white"
                    )}>
                      <Timer className="w-8 h-8 opacity-50" />
                      {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between text-sm font-medium text-zinc-400 mb-2 px-2">
                      <span>Player</span>
                      <span>Status</span>
                    </div>
                    {players.filter(p => p.id !== 'host').map(p => (
                      <div key={p.id} className="bg-zinc-800/50 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-lg">{p.name}</span>
                        </div>
                        <div>
                          {p.hasAnswered ? (
                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-medium">
                              <CheckCircle2 className="w-4 h-4" />
                              Finished
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-medium">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              In Progress
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleQuickExamEnd}
                  className="bg-red-600 hover:bg-red-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-colors"
                >
                  End Exam Early
                </button>
              </>
            )}
          </div>
        )}

        {gameState === 'LEADERBOARD' && (
          <div className="w-full max-w-2xl">
            <h2 className="text-4xl font-bold text-center mb-12 flex items-center justify-center gap-4">
              <Trophy className="w-10 h-10 text-yellow-400" />
              Leaderboard
            </h2>
            
            <div className="space-y-4 mb-12">
              {players.sort((a, b) => b.score - a.score).slice(0, 5).map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex items-center justify-between"
                >
                  <div className="flex items-center gap-6">
                    <div className={clsx(
                      "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg",
                      i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                      i === 1 ? "bg-zinc-300/20 text-zinc-300" :
                      i === 2 ? "bg-amber-700/20 text-amber-600" :
                      "bg-zinc-800 text-zinc-500"
                    )}>
                      {i + 1}
                    </div>
                    <span className="text-2xl font-bold">{p.name}</span>
                  </div>
                  <span className="text-2xl font-mono text-indigo-400">{p.score}</span>
                </motion.div>
              ))}
            </div>

            <div className="flex justify-center gap-4">
              {settings.examType === 'QUICK' && (
                <button
                  onClick={() => setShowReview(true)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-colors"
                >
                  Review Exam
                </button>
              )}
              <button
                onClick={nextPhase}
                className="bg-white text-black px-12 py-4 rounded-xl font-bold text-lg hover:bg-zinc-200 transition-colors"
              >
                {settings.examType === 'QUICK' ? 'Finish Game' : (currentQuestionIndex + 1 < questions.length ? 'Next Question' : 'Finish Game')}
              </button>
            </div>
          </div>
        )}

        {gameState === 'FINISHED' && (
          <div className="text-center">
            <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-8" />
            <h2 className="text-5xl font-bold mb-4">Game Over!</h2>
            <p className="text-xl text-zinc-400 mb-12">Thanks for playing</p>
            
            <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-md mx-auto mb-12">
              <div className="text-sm text-zinc-500 uppercase tracking-widest mb-2">Winner</div>
              <div className="text-4xl font-bold text-white mb-2">
                {players.sort((a, b) => b.score - a.score)[0]?.name || 'No one'}
              </div>
              <div className="text-indigo-400 font-mono text-xl">
                {players.sort((a, b) => b.score - a.score)[0]?.score || 0} pts
              </div>
            </div>

            <div className="flex justify-center gap-4">
              {settings.examType === 'QUICK' && (
                <button
                  onClick={() => setShowReview(true)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-3 rounded-xl font-medium transition-colors"
                >
                  Review Exam
                </button>
              )}
              <button
                onClick={onBack}
                className="bg-zinc-800 text-white px-8 py-3 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
              >
                Back to Home
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Review Modal */}
      {showReview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8">
          <div className="bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/50">
              <h2 className="text-2xl font-bold">Exam Review</h2>
              <button 
                onClick={() => setShowReview(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <XCircle className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10">
              {questions.map((q, index) => {
                const userAnswer = hostQuickAnswers[q.id];
                const correctAnswer = q.correctAnswer;
                const isCorrect = userAnswer === correctAnswer;
                
                return (
                  <div key={q.id} className="bg-zinc-900/80 border border-white/10 rounded-[2rem] p-8 shadow-xl">
                    <div className="flex items-start gap-6 mb-8">
                      <div className={clsx(
                        "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl flex-shrink-0 shadow-lg",
                        isCorrect ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
                      )}>
                        {index + 1}
                      </div>
                      <h3 className="text-2xl font-medium pt-2 leading-tight">{q.text}</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {q.options.map((opt: string, i: number) => {
                        const isSelected = userAnswer === opt;
                        const isActualCorrect = correctAnswer === opt;
                        const labels = ['A', 'B', 'C', 'D'];
                        
                        return (
                          <div 
                            key={i}
                            className={clsx(
                              "p-5 rounded-2xl border-2 flex items-center gap-4 transition-all",
                              isActualCorrect
                                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                                : isSelected
                                  ? "bg-red-500/20 border-red-500/50 text-red-100"
                                  : "bg-zinc-950/50 border-white/5 text-zinc-500"
                            )}
                          >
                            <div className={clsx(
                              "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0",
                              isActualCorrect ? "bg-emerald-500/30 text-emerald-300" :
                              isSelected ? "bg-red-500/30 text-red-300" :
                              "bg-white/5 text-zinc-600"
                            )}>
                              {labels[i]}
                            </div>
                            <span className="flex-1 text-lg">{opt}</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isSelected && !isActualCorrect && <span className="text-xs font-bold uppercase tracking-wider opacity-80 text-red-300 mr-2">Your Answer</span>}
                              {isActualCorrect && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                              {isSelected && !isActualCorrect && <XCircle className="w-6 h-6 text-red-400" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {q.explanation && (
                      <div className="mt-6">
                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-6">
                          <h4 className="text-indigo-400 font-bold uppercase tracking-widest text-xs mb-2">Explanation</h4>
                          <p className="text-zinc-300 italic leading-relaxed">{q.explanation}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
