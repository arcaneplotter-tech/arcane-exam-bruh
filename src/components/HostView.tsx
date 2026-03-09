import React, { useState, useEffect, useRef } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Users, Play, ArrowLeft, Trophy, CheckCircle2, XCircle, Loader2, Copy, Check } from 'lucide-react';
import Papa from 'papaparse';
import { Question, Player, GameState, MessageType } from '../types';
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
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playersRef = useRef<Player[]>([]);
  const timeLeftRef = useRef(0);
  const currentQuestionIndexRef = useRef(0);
  const questionsRef = useRef<Question[]>([]);

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
      if (p.connection.open) {
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
        gameState: gameState 
      });
      
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
          return { ...p, hasAnswered: true, currentAnswer: data.answer };
        }
        return p;
      }));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedQuestions: Question[] = results.data.map((row: any, index) => ({
          id: `q-${index}`,
          text: row.Question || row.question,
          options: [row.Option1 || row.option1, row.Option2 || row.option2, row.Option3 || row.option3, row.Option4 || row.option4].filter(Boolean),
          correctAnswer: row.CorrectAnswer || row.correctAnswer,
          timeLimit: parseInt(row.TimeLimit || row.timeLimit || '20', 10)
        }));
        setQuestions(parsedQuestions);
      }
    });
  };

  const startGame = () => {
    if (questions.length === 0) return alert('Please upload questions first');
    if (players.length === 0) return alert('Waiting for players to join');
    
    setGameState('STARTING');
    broadcast({ type: 'STATE_UPDATE', state: 'STARTING' });
    
    let countdown = 3;
    const interval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(interval);
        startQuestion(0);
      }
    }, 1000);
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
        totalQuestions: questions.length
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
  }, [players, gameState]);

  const handleQuestionEnd = () => {
    setShowAnswer(true);
    const q = questionsRef.current[currentQuestionIndexRef.current];
    
    // Calculate scores
    setPlayers(prev => {
      const updated = prev.map(p => {
        const isCorrect = p.currentAnswer === q.correctAnswer;
        // Simple scoring: 1000 points for correct, scaled by time left
        const points = isCorrect ? Math.round(1000 * (timeLeftRef.current / q.timeLimit)) : 0;
        
        // Send individual result
        if (p.connection.open) {
          p.connection.send({
            type: 'ANSWER_RESULT',
            correct: isCorrect,
            score: points,
            correctAnswer: q.correctAnswer
          });
        }
        
        return { ...p, score: p.score + points };
      });
      return updated;
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
      if (currentQuestionIndex + 1 < questions.length) {
        startQuestion(currentQuestionIndex + 1);
      } else {
        setGameState('FINISHED');
        broadcast({ 
          type: 'STATE_UPDATE', 
          state: 'FINISHED',
          data: {
            leaderboard: playersRef.current.map(p => ({ id: p.id, name: p.name, score: p.score })).sort((a, b) => b.score - a.score)
          }
        });
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

              <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-8 text-center">
                <Upload className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Upload Questions (CSV)</h3>
                <p className="text-sm text-zinc-400 mb-6">
                  Format: Question, Option1, Option2, Option3, Option4, CorrectAnswer, TimeLimit
                </p>
                <label className="cursor-pointer inline-flex items-center justify-center gap-2 bg-white text-black px-6 py-3 rounded-xl font-medium hover:bg-zinc-200 transition-colors">
                  Choose File
                  <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                </label>
                {questions.length > 0 && (
                  <div className="mt-4 text-emerald-400 flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {questions.length} questions loaded
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
          <div className="w-full max-w-5xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-8">
              <div className="text-zinc-400 font-medium">
                Question {currentQuestionIndex + 1} of {questions.length}
              </div>
              <div className={clsx(
                "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold border-4",
                timeLeft <= 5 ? "border-red-500 text-red-500" : "border-indigo-500 text-indigo-500"
              )}>
                {timeLeft}
              </div>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 leading-tight">
              {questions[currentQuestionIndex].text}
            </h2>

            <div className="w-full grid md:grid-cols-2 gap-4 mb-12">
              {questions[currentQuestionIndex].options.map((opt, i) => {
                const isCorrect = showAnswer && opt === questions[currentQuestionIndex].correctAnswer;
                const isWrong = showAnswer && !isCorrect;
                
                return (
                  <div
                    key={i}
                    className={clsx(
                      "p-6 rounded-2xl text-xl font-medium flex items-center justify-between transition-all",
                      showAnswer 
                        ? isCorrect 
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-100 border-2" 
                          : "bg-zinc-900 border-zinc-800 text-zinc-600 border-2 opacity-50"
                        : "bg-zinc-800 border border-white/10"
                    )}
                  >
                    <span>{opt}</span>
                    {isCorrect && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                    {isWrong && <XCircle className="w-6 h-6 text-zinc-600" />}
                  </div>
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

            <div className="flex justify-center">
              <button
                onClick={nextPhase}
                className="bg-white text-black px-12 py-4 rounded-xl font-bold text-lg hover:bg-zinc-200 transition-colors"
              >
                {currentQuestionIndex + 1 < questions.length ? 'Next Question' : 'Finish Game'}
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

            <button
              onClick={onBack}
              className="bg-zinc-800 text-white px-8 py-3 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
            >
              Back to Home
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
