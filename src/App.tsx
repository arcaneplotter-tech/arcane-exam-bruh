import React, { useState } from 'react';
import { HostView } from './components/HostView';
import { PlayerView } from './components/PlayerView';
import { motion } from 'framer-motion';
import { GraduationCap, Users, Play } from 'lucide-react';

function App() {
  const [mode, setMode] = useState<'HOME' | 'HOST' | 'PLAYER'>('HOME');

  if (mode === 'HOST') return <HostView onBack={() => setMode('HOME')} />;
  if (mode === 'PLAYER') return <PlayerView onBack={() => setMode('HOME')} />;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-8 text-center"
      >
        <div className="space-y-4">
          <div className="mx-auto w-20 h-20 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30">
            <GraduationCap className="w-10 h-10 text-indigo-400" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Arcane Exams</h1>
          <p className="text-zinc-400">Multiplayer learning platform</p>
        </div>

        <div className="grid gap-4">
          <button
            onClick={() => setMode('PLAYER')}
            className="w-full group relative flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-xl font-medium transition-all"
          >
            <Play className="w-5 h-5" />
            Join Game
          </button>
          
          <button
            onClick={() => setMode('HOST')}
            className="w-full group relative flex items-center justify-center gap-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 p-4 rounded-xl font-medium transition-all"
          >
            <Users className="w-5 h-5" />
            Host Game
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default App;
