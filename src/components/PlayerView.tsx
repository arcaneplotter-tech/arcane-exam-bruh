import React, { useState, useEffect, useRef } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Trophy, AlertCircle } from 'lucide-react';
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
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; score: number; correctAnswer: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [myScore, setMyScore] = useState(0);

  const peerRef = useRef<Peer | null>(null);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    return () => {
      peer.destroy();
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
        setSelectedAnswer(null);
        setAnswerResult(null);
      }
      if (data.state === 'LEADERBOARD' || data.state === 'FINISHED') {
        setLeaderboard(data.data.leaderboard);
        const me = data.data.leaderboard.find((p: any) => p.id === peerRef.current?.id);
        if (me) setMyScore(me.score);
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

            {gameState === 'QUESTION' && currentQuestion && !answerResult && (
              <div className="w-full h-full flex flex-col">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold mb-2">{currentQuestion.text}</h2>
                  <p className="text-zinc-400">Select your answer</p>
                </div>
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentQuestion.options.map((opt: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => submitAnswer(opt)}
                      disabled={!!selectedAnswer}
                      className={clsx(
                        "p-6 rounded-2xl text-2xl font-bold shadow-lg transition-all active:scale-95 flex items-center justify-center min-h-[120px]",
                        optionColors[i % optionColors.length],
                        selectedAnswer === opt ? "ring-4 ring-white scale-95" : "",
                        selectedAnswer && selectedAnswer !== opt ? "opacity-50" : ""
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                
                {selectedAnswer && (
                  <div className="mt-8 text-center text-xl font-medium text-zinc-400 flex items-center justify-center gap-3">
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
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
