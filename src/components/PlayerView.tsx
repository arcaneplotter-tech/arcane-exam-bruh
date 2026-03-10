import React, { useState, useEffect, useRef } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Trophy, AlertCircle, Timer } from 'lucide-react';
import { GameState, MessageType } from '../types';
import { clsx } from 'clsx';

interface PlayerViewProps {
  onBack: () => void;
}

export function PlayerView({ onBack }: PlayerViewProps) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [gameState, setGameState] = useState<GameState | 'JOINING'>('JOINING');
  const [error, setError] = useState<string | null>(null);
  
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; score: number; correctAnswer: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [myScore, setMyScore] = useState(0);

  // QUICK mode state
  const [quickQuestions, setQuickQuestions] = useState<any[]>([]);
  const [quickAnswers, setQuickAnswers] = useState<Record<string, string>>({});
  const [quickCurrentIndex, setQuickCurrentIndex] = useState(0);
  const [quickTimeLeft, setQuickTimeLeft] = useState(0);
  const [quickSubmitted, setQuickSubmitted] = useState(false);
  const [quickTotalTime, setQuickTotalTime] = useState(0);
  const [showReview, setShowReview] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const quickTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    return () => {
      peer.destroy();
      if (quickTimerRef.current) clearInterval(quickTimerRef.current);
    };
  }, []);

  const joinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !roomCode || !peerRef.current) return;
    
    setError(null);
    setGameState('JOINING');

    const conn = peerRef.current.connect(`arcane-exam-${roomCode}`);
    
    conn.on('open', () => {
      setConnection(conn);
      conn.send({ type: 'JOIN', name });
    });

    conn.on('data', (data: any) => {
      handleHostMessage(data);
    });

    conn.on('close', () => {
      setError('Connection to host lost.');
      setGameState('JOINING');
      setConnection(null);
    });

    conn.on('error', (err) => {
      setError('Failed to connect to host.');
      setGameState('JOINING');
      setConnection(null);
    });
  };

  const handleHostMessage = (data: MessageType) => {
    if (data.type === 'JOIN_SUCCESS') {
      setGameState(data.gameState);
    }
    
    if (data.type === 'STATE_UPDATE') {
      setGameState(data.state);
      if (data.state === 'QUESTION') {
        setCurrentQuestion(data.data.question);
        setCurrentQuestionIndex(data.data.questionIndex || 0);
        setTotalQuestions(data.data.totalQuestions || 0);
        setSelectedAnswer(null);
        setAnswerResult(null);
      }
      if (data.state === 'QUICK_EXAM') {
        setQuickQuestions(data.data.questions);
        setQuickTotalTime(data.data.totalTime);
        setQuickTimeLeft(data.data.totalTime);
        setQuickAnswers({});
        setQuickCurrentIndex(0);
        setQuickSubmitted(false);
        setShowReview(false);
        
        if (quickTimerRef.current) clearInterval(quickTimerRef.current);
        quickTimerRef.current = setInterval(() => {
          setQuickTimeLeft(prev => {
            if (prev <= 1) {
              if (quickTimerRef.current) clearInterval(quickTimerRef.current);
              // Auto submit if time runs out
              if (!quickSubmitted && connection) {
                submitQuickExam(true);
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
      if (data.state === 'LEADERBOARD' || data.state === 'FINISHED') {
        setLeaderboard(data.data.leaderboard);
        if (data.data.fullQuestions) {
          setQuickQuestions(data.data.fullQuestions);
        }
        const me = data.data.leaderboard.find((p: any) => p.id === peerRef.current?.id);
        if (me) setMyScore(me.score);
        if (quickTimerRef.current) clearInterval(quickTimerRef.current);
      }
    }

    if (data.type === 'ANSWER_RESULT') {
      setAnswerResult({
        correct: data.correct,
        score: data.score,
        correctAnswer: data.correctAnswer
      });
      setMyScore(prev => prev + data.score);
    }
  };

  const submitAnswer = (answer: string) => {
    if (selectedAnswer || !connection) return;
    setSelectedAnswer(answer);
    connection.send({ type: 'SUBMIT_ANSWER', answer });
  };

  const handleQuickAnswer = (answer: string) => {
    if (quickSubmitted) return;
    const q = quickQuestions[quickCurrentIndex];
    setQuickAnswers(prev => ({ ...prev, [q.id]: answer }));
  };

  const submitQuickExam = (force = false) => {
    if (!connection || (quickSubmitted && !force)) return;
    setQuickSubmitted(true);
    if (quickTimerRef.current) clearInterval(quickTimerRef.current);
    
    const timeTaken = quickTotalTime - quickTimeLeft;
    connection.send({ 
      type: 'SUBMIT_EXAM', 
      answers: quickAnswers,
      timeTaken
    });
  };

  // Option colors for Kahoot-like feel
  const optionColors = [
    'bg-red-500 hover:bg-red-400',
    'bg-blue-500 hover:bg-blue-400',
    'bg-yellow-500 hover:bg-yellow-400 text-black',
    'bg-green-500 hover:bg-green-400'
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      <header className="p-6 flex items-center justify-between border-b border-white/5">
        <button onClick={onBack} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Exit
        </button>
        {connection && (
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium">{name}</div>
            <div className="bg-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full text-sm font-bold">
              {myScore} pts
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        {!connection ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold mb-2">Join Game</h2>
              <p className="text-zinc-400">Enter the room code to play</p>
            </div>

            <form onSubmit={joinGame} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
              
              <div>
                <input
                  type="text"
                  placeholder="Room Code (e.g. 123456)"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.trim())}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-4 text-center text-2xl font-mono tracking-widest focus:outline-none focus:border-indigo-500 transition-colors"
                  maxLength={6}
                  required
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Your Nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl p-4 text-center text-xl focus:outline-none focus:border-indigo-500 transition-colors"
                  maxLength={15}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={!name || !roomCode}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white p-4 rounded-xl font-bold text-lg transition-all"
              >
                Enter
              </button>
            </form>
          </motion.div>
        ) : (
          <div className="w-full max-w-4xl flex flex-col items-center justify-center h-full">
            {gameState === 'LOBBY' && (
              <div className="text-center">
                <h2 className="text-4xl font-bold mb-4">You're in!</h2>
                <p className="text-xl text-zinc-400 flex items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Waiting for host to start...
                </p>
              </div>
            )}

            {gameState === 'STARTING' && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <h2 className="text-5xl font-bold mb-4">Get Ready!</h2>
                <p className="text-xl text-zinc-400">Look at the host's screen</p>
              </motion.div>
            )}

            {gameState === 'QUICK_EXAM' && quickQuestions.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                <p className="text-xl text-zinc-400">Loading exam...</p>
              </div>
            )}

            {gameState === 'QUICK_EXAM' && quickQuestions.length > 0 && (
              <div className="w-full h-full flex flex-col max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8 bg-zinc-900/80 backdrop-blur-md p-5 rounded-3xl border border-white/10 shadow-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xl">
                      {quickCurrentIndex + 1}
                    </div>
                    <div className="text-zinc-400 font-medium">
                      of {quickQuestions.length}
                    </div>
                  </div>
                  <div className={clsx(
                    "px-6 py-3 rounded-2xl font-mono text-2xl font-bold flex items-center gap-3",
                    quickTimeLeft <= 10 ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-white/5 text-white"
                  )}>
                    <Timer className="w-6 h-6 opacity-50" />
                    {Math.floor(quickTimeLeft / 60)}:{(quickTimeLeft % 60).toString().padStart(2, '0')}
                  </div>
                </div>

                <div className="flex-1 flex flex-col">
                  <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-8 md:p-12 shadow-2xl mb-8">
                    <h2 className="text-3xl md:text-4xl font-medium leading-tight">
                      {quickQuestions[quickCurrentIndex].text}
                    </h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {quickQuestions[quickCurrentIndex].options.map((opt: string, i: number) => {
                      const isSelected = quickAnswers[quickQuestions[quickCurrentIndex].id] === opt;
                      const labels = ['A', 'B', 'C', 'D'];
                      return (
                        <button
                          key={i}
                          onClick={() => handleQuickAnswer(opt)}
                          disabled={quickSubmitted}
                          className={clsx(
                            "p-6 md:p-8 rounded-3xl text-xl font-medium transition-all text-left border-2 flex items-center gap-6 group",
                            isSelected 
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-[0_0_30px_rgba(79,70,229,0.3)]" 
                              : "bg-zinc-900/50 border-white/10 hover:bg-zinc-800 hover:border-white/20 text-zinc-300",
                            quickSubmitted && !isSelected && "opacity-50"
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
                    onClick={() => setQuickCurrentIndex(prev => Math.max(0, prev - 1))}
                    disabled={quickCurrentIndex === 0}
                    className="px-6 py-3 rounded-xl font-medium bg-zinc-800 text-white disabled:opacity-50 hover:bg-zinc-700 transition-colors"
                  >
                    Previous
                  </button>
                  
                  {!quickSubmitted ? (
                    <button
                      onClick={() => {
                        if (quickCurrentIndex === quickQuestions.length - 1) {
                          if (Object.keys(quickAnswers).length < quickQuestions.length) {
                            if (!confirm('You have unanswered questions. Are you sure you want to submit?')) return;
                          }
                          submitQuickExam();
                        } else {
                          setQuickCurrentIndex(prev => Math.min(quickQuestions.length - 1, prev + 1));
                        }
                      }}
                      className={clsx(
                        "px-8 py-3 rounded-xl font-bold transition-colors",
                        quickCurrentIndex === quickQuestions.length - 1
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white"
                      )}
                    >
                      {quickCurrentIndex === quickQuestions.length - 1 ? 'Submit Exam' : 'Next'}
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
                  {quickQuestions.map((q, i) => (
                    <button
                      key={q.id}
                      onClick={() => setQuickCurrentIndex(i)}
                      className={clsx(
                        "w-10 h-10 rounded-lg font-medium text-sm flex items-center justify-center transition-colors border",
                        quickCurrentIndex === i ? "border-indigo-500 ring-2 ring-indigo-500/50" : "border-transparent",
                        quickAnswers[q.id] ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gameState === 'QUESTION' && currentQuestion && !answerResult && (
              <div className="w-full h-full flex flex-col max-w-5xl mx-auto">
                <div className="text-center mb-12">
                  <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 text-white/70 font-medium text-sm mb-6 tracking-widest uppercase">
                    Question {currentQuestionIndex + 1} of {totalQuestions}
                  </span>
                  <h2 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">{currentQuestion.text}</h2>
                </div>
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {currentQuestion.options.map((opt: string, i: number) => {
                    const colors = [
                      'bg-rose-500 hover:bg-rose-400 shadow-[0_6px_0_rgb(159,18,57)]',
                      'bg-blue-500 hover:bg-blue-400 shadow-[0_6px_0_rgb(30,58,138)]',
                      'bg-amber-500 hover:bg-amber-400 shadow-[0_6px_0_rgb(146,64,14)]',
                      'bg-emerald-500 hover:bg-emerald-400 shadow-[0_6px_0_rgb(6,78,59)]'
                    ];
                    const selectedColors = [
                      'bg-rose-600 shadow-[0_0px_0_rgb(159,18,57)] translate-y-[6px]',
                      'bg-blue-600 shadow-[0_0px_0_rgb(30,58,138)] translate-y-[6px]',
                      'bg-amber-600 shadow-[0_0px_0_rgb(146,64,14)] translate-y-[6px]',
                      'bg-emerald-600 shadow-[0_0px_0_rgb(6,78,59)] translate-y-[6px]'
                    ];
                    const labels = ['A', 'B', 'C', 'D'];
                    
                    const isSelected = selectedAnswer === opt;
                    const isDisabled = !!selectedAnswer;

                    return (
                      <button
                        key={i}
                        onClick={() => submitAnswer(opt)}
                        disabled={isDisabled}
                        className={clsx(
                          "relative p-6 md:p-8 rounded-3xl text-xl md:text-2xl font-bold transition-all flex items-center gap-6 min-h-[120px] md:min-h-[160px] group",
                          isSelected ? selectedColors[i % 4] : colors[i % 4],
                          isDisabled && !isSelected ? "opacity-40 grayscale-[0.5]" : "",
                          !isDisabled && "active:translate-y-[6px] active:shadow-none"
                        )}
                      >
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white/20 flex items-center justify-center text-2xl md:text-3xl flex-shrink-0">
                          {labels[i]}
                        </div>
                        <span className="text-left leading-tight drop-shadow-md">{opt}</span>
                      </button>
                    );
                  })}
                </div>
                
                {selectedAnswer && (
                  <div className="mt-12 text-center text-xl font-medium text-zinc-400 flex items-center justify-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Waiting for others...
                  </div>
                )}
              </div>
            )}

            {gameState === 'QUESTION' && answerResult && (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={clsx(
                  "w-full max-w-md rounded-3xl p-8 text-center",
                  answerResult.correct ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                )}
              >
                {answerResult.correct ? (
                  <CheckCircle2 className="w-24 h-24 mx-auto mb-6" />
                ) : (
                  <XCircle className="w-24 h-24 mx-auto mb-6" />
                )}
                
                <h2 className="text-4xl font-bold mb-2">
                  {answerResult.correct ? "Correct!" : "Incorrect"}
                </h2>
                
                <div className="text-xl opacity-90 mb-8">
                  {answerResult.correct ? `+${answerResult.score} points` : "0 points"}
                </div>
                
                {!answerResult.correct && (
                  <div className="bg-black/20 rounded-xl p-4">
                    <div className="text-sm uppercase tracking-wider opacity-80 mb-1">Correct Answer</div>
                    <div className="font-bold text-lg">{answerResult.correctAnswer}</div>
                  </div>
                )}
              </motion.div>
            )}

            {gameState === 'LEADERBOARD' && (
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-8">Current Standings</h2>
                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 inline-block min-w-[300px]">
                  <div className="text-sm text-zinc-400 uppercase tracking-widest mb-2">Your Score</div>
                  <div className="text-5xl font-bold text-indigo-400 mb-4">{myScore}</div>
                  
                  <div className="text-zinc-400 flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5" />
                    Rank: #{leaderboard.findIndex(p => p.id === peerRef.current?.id) + 1} of {leaderboard.length}
                  </div>
                </div>
                
                {quickQuestions.length > 0 && (
                  <div className="mt-8">
                    <button
                      onClick={() => setShowReview(true)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-xl font-medium transition-colors"
                    >
                      Review Exam
                    </button>
                  </div>
                )}
              </div>
            )}

            {gameState === 'FINISHED' && (
              <div className="text-center">
                <h2 className="text-4xl font-bold mb-8">Final Results</h2>
                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 inline-block min-w-[300px]">
                  <div className="text-sm text-zinc-400 uppercase tracking-widest mb-2">Final Score</div>
                  <div className="text-6xl font-bold text-indigo-400 mb-6">{myScore}</div>
                  
                  <div className="text-xl font-medium flex items-center justify-center gap-2">
                    <Trophy className="w-6 h-6 text-yellow-400" />
                    Final Rank: #{leaderboard.findIndex(p => p.id === peerRef.current?.id) + 1}
                  </div>
                </div>
                
                {quickQuestions.length > 0 && (
                  <div className="mt-8">
                    <button
                      onClick={() => setShowReview(true)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-xl font-medium transition-colors"
                    >
                      Review Exam
                    </button>
                  </div>
                )}
              </div>
            )}
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
              {quickQuestions.map((q, index) => {
                const userAnswer = quickAnswers[q.id];
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-0 md:pl-18">
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
