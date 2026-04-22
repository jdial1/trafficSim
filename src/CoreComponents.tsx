import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertTriangle, RefreshCw, Trophy } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { BriefingContent } from './types';
import { BriefingParser } from './BriefingParser';
import { useGlobalState } from './GlobalStateContext';
import { supabase } from './lib/supabase';

export const Histogram = ({ title, value, unit, color, min, max, levelId, dbColumn }: { title: string; value: number; unit: string; color: string; min: number; max: number; levelId?: string; dbColumn?: string; }) => {
  const [realBars, setRealBars] = useState<number[] | null>(null);
  const [botBuckets, setBotBuckets] = useState<Record<string, number>>({});
  
  useEffect(() => {
    if (levelId && dbColumn) {
      supabase.from('scores').select(`${dbColumn}, profiles(username)`).eq('level_id', levelId).then(({ data }) => {
        if (data && data.length > 0) {
          const counts = new Array(30).fill(0);
          const bots: Record<string, number> = {};
          const range = max - min;
          data.forEach(row => {
            const val = row[dbColumn];
            const username = (row.profiles as any)?.username;
            if (val !== undefined && val !== null) {
              const clamped = Math.max(min, Math.min(max, val));
              const percent = (clamped - min) / range;
              const idx = Math.min(29, Math.max(0, Math.floor(percent * 29)));
              counts[idx]++;

              if (username && username.includes('_OPERATOR')) {
                const tier = username.split('_')[0];
                bots[tier] = idx;
              }
            }
          });
          const maxCount = Math.max(...counts, 1);
          setRealBars(counts.map(c => c / maxCount));
          setBotBuckets(bots);
        }
      });
    }
  }, [levelId, dbColumn, min, max]);

  const bars = realBars || Array.from({ length: 30 }, (_, i) => { const x = (i / 29) * 2 - 1; return Math.exp(-x * x * 4) + Math.random() * 0.1; });
  const range = max - min; const clamped = Math.max(min, Math.min(max, value)); const percent = (clamped - min) / range;
  const bucketIndex = Math.min(29, Math.max(0, Math.floor(percent * 29)));
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-end mb-1"><span className="text-[#8B949E] text-[10px] font-bold tracking-wider">{title}</span><span className="font-bold text-lg" style={{ color }}>{value.toLocaleString()}<span className="text-[10px] ml-1 text-[#8B949E] uppercase">{unit}</span></span></div>
      <div className="flex items-end h-12 gap-[1.5px] bg-black/40 p-2 border border-[#2D333B] rounded-sm">
        {bars.map((h, i) => {
          const botsInThisBucket = Object.entries(botBuckets).filter(([_, bucketIdx]) => bucketIdx === i).map(([tier]) => tier[0]);
          const isUserBucket = i === bucketIndex;
          return (
            <div key={i} className="flex-1 flex flex-col justify-end h-full relative group">
              <div 
                style={{ 
                  height: `${Math.min(100, h * 100)}%`, 
                  backgroundColor: isUserBucket ? color : '#2D333B', 
                  boxShadow: isUserBucket ? `0 0 15px ${color}` : 'none',
                  border: isUserBucket ? `1px solid ${color}` : 'none',
                  zIndex: isUserBucket ? 1 : 0
                }} 
                className={`w-full transition-all ${isUserBucket ? 'relative scale-x-110' : ''}`} 
              />
              {isUserBucket && <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-black z-10 whitespace-nowrap" style={{ color, textShadow: '0 0 5px rgba(0,0,0,0.8)' }}>YOU</div>}
              {botsInThisBucket.length > 0 && !isUserBucket && (
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  {Object.entries(botBuckets)
                    .filter(([_, bucketIdx]) => bucketIdx === i)
                    .map(([tier]) => {
                      const tierColor = 
                        tier === 'Platinum' ? '#E5E4E2' :
                        tier === 'Gold' ? '#D29922' :
                        tier === 'Silver' ? '#8B949E' :
                        '#A57164'; // Bronze
                      return (
                        <Trophy 
                          key={tier} 
                          size={8} 
                          style={{ color: tierColor }} 
                          className="drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]"
                        />
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ManualOverlay = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] flex justify-center bg-black/80 backdrop-blur-md overflow-hidden p-2 sm:p-8">
        <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="w-full max-w-4xl h-full flex flex-col bg-[#efebd8] text-[#2c2b29] rounded-sm shadow-2xl border-4 border-[#2c2b29] font-serif overflow-hidden">
          <div className="flex items-center justify-between bg-[#2c2b29] text-[#efebd8] px-4 py-2 font-mono font-bold tracking-widest shrink-0"><span>GOSAVTOMATIKA MANUAL v4.2</span><button onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors"><X size={20} /></button></div>
          <div className="flex-1 overflow-y-auto p-6 sm:p-10">
            <h1 className="text-4xl font-bold font-mono border-b-2 border-[#2c2b29] pb-4 mb-8 uppercase">Sec-082 Protocol</h1>
            <p className="mb-4">Welcome to GOSAVTOMATIKA. Your directive is to maintain flow efficiency using cyclic phase-based control.</p>
            <h2 className="text-xl font-bold mt-8 mb-4 border-b border-[#2c2b29]/30 pb-2 uppercase font-mono">Syntax & Commands</h2>
            <div className="bg-[#2c2b29]/5 p-4 border-l-4 border-[#2c2b29] font-mono text-sm mb-6 whitespace-pre">{"NORTH_LEFT.GO\nSOUTH_LEFT.GO"}</div>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>.GO:</strong> Absolute right-of-way. Conflicting .GO commands will cause a crash.</li>
              <li><strong>.YIELD:</strong> Permissive movement. Vehicles wait for gaps in oncoming traffic.</li>
            </ul>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

export const Rankings = ({ levelId }: { levelId: string }) => {
  const [topScores, setTopScores] = useState<any[]>([]);
  const { user } = useGlobalState();

  useEffect(() => {
    if (levelId) {
      supabase.from('scores')
        .select('seconds_to_clear, profiles(id, username)')
        .eq('level_id', levelId)
        .order('seconds_to_clear', { ascending: true })
        .limit(5)
        .then(({ data }) => {
          if (data) setTopScores(data);
        });
    }
  }, [levelId]);

  if (topScores.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t-2 border-[#2D333B] border-dashed">
      <div className="text-xs text-[#8B949E] mb-2 uppercase tracking-widest font-bold">GLOBAL TOP 5</div>
      <div className="space-y-1 bg-black/20 p-2 border border-[#2D333B]">
        {topScores.map((score, i) => {
          const isCurrentUser = user && score.profiles?.id === user.id;
          return (
            <div 
              key={i} 
              className={`flex justify-between items-center text-[11px] font-mono px-2 py-1 rounded-sm ${
                isCurrentUser 
                  ? 'bg-[#3FB950]/10 border border-[#3FB950]/30 shadow-[0_0_10px_rgba(63,185,80,0.1)]' 
                  : 'border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={isCurrentUser ? "text-[#3FB950] font-bold" : "text-[#8B949E]"}>#{i + 1}</span>
                {score.profiles?.username?.includes('_OPERATOR') && (
                  <Trophy 
                    size={10} 
                    style={{ 
                      color: 
                        score.profiles.username.startsWith('Platinum') ? '#E5E4E2' :
                        score.profiles.username.startsWith('Gold') ? '#D29922' :
                        score.profiles.username.startsWith('Silver') ? '#8B949E' :
                        '#A57164'
                    }} 
                  />
                )}
                <span className={isCurrentUser ? "text-white font-bold" : "text-[#C9D1D9]"}>
                  {score.profiles?.username || score.profiles?.id?.substring(0, 6) || 'ANON'}
                  {isCurrentUser && " (YOU)"}
                </span>
              </div>
              <span className="text-[#3FB950] font-bold">{score.seconds_to_clear}s</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const LevelSelect = ({ levels, activeLevelId, unlockedLevels = [], onSelectLevel }: { levels: BriefingContent[]; activeLevelId: string; unlockedLevels?: string[]; onSelectLevel: (id: string) => void; }) => {
  const { highscores } = useGlobalState();
  const rawActiveLevel = levels.find(l => l.id === activeLevelId) || levels[0];
  const score = rawActiveLevel ? highscores[rawActiveLevel.id] : null;
  const activeLevel = rawActiveLevel ? BriefingParser.parseBriefing(rawActiveLevel, {
    clearCars: rawActiveLevel.winCondition?.clearCars || 0
  }) : null;
  return (
    <div className="flex flex-col h-full bg-[#1A1D23] p-4 text-[#C9D1D9] font-mono overflow-y-auto scrollbar-hide">
      <div className="flex gap-2 mb-4 shrink-0 overflow-x-auto pb-1">{levels.map((l, i) => { const isUnlocked = unlockedLevels.includes(l.id) || i === 0; const isCompleted = highscores[l.id]; return (<button key={l.id} onClick={() => isUnlocked && onSelectLevel(l.id)} disabled={!isUnlocked} className={`flex-1 min-w-[60px] py-2 text-center text-[10px] font-bold border rounded-none transition-colors relative ${l.id === activeLevelId ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]' : isUnlocked ? 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5' : 'bg-black/40 border-[#2D333B]/50 text-[#8B949E]/50 cursor-not-allowed'}`}>{l.id}{isCompleted && <div className="absolute -top-2 -right-2"><CheckCircle2 size={14} className="text-[#3FB950] bg-[#1A1D23] rounded-full" /></div>}</button>); })}</div>
      {activeLevel && (
        <div className="border-2 border-[#2D333B] bg-black/40 p-4 relative shadow-xl">
          {score ? <div className="absolute top-0 right-0 px-2 py-0.5 bg-[#3FB950] text-[#0D0F12] text-[9px] font-bold tracking-widest flex items-center gap-1"><CheckCircle2 size={14} /> COMPLETED</div> : <div className="absolute top-0 right-0 px-2 py-0.5 bg-[#F85149] text-black text-[9px] font-bold tracking-widest uppercase">Confidential</div>}
          <div className="text-xs text-[#8B949E] mb-1 mt-2 uppercase">From: <span className="text-[#58A6FF]">{activeLevel.from}</span></div>
          <div className="text-xs text-[#8B949E] mb-3 border-b border-[#2D333B] pb-3 uppercase">Subject: <span className="text-[#C9D1D9]">{activeLevel.subject}</span></div>
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{activeLevel.body}</div>
          <ul className="mt-4 space-y-2 list-disc pl-5 text-[12px] text-[#3FB950]">{activeLevel.bullets.map((b, i) => (<li key={i}><span className="text-[#C9D1D9]">{b}</span></li>))}</ul>
          {score && <div className="mt-6 pt-4 border-t-2 border-[#2D333B] border-dashed space-y-3"><Histogram title="THROUGHPUT" value={score.secondsToClear} unit="s" color="#3FB950" min={10} max={120} levelId={activeLevel.id} dbColumn="seconds_to_clear" /><Histogram title="INSTRUCTIONS" value={score.instructionCount} unit=" lines" color="#58A6FF" min={2} max={30} levelId={activeLevel.id} dbColumn="instruction_count" /><Histogram title="COST" value={score.hardwareCost} unit=" ¥" color="#D29922" min={100} max={2000} levelId={activeLevel.id} dbColumn="hardware_cost" /></div>}
          <Rankings levelId={activeLevel.id} />
        </div>
      )}
    </div>
  );
};

export const GameIntro = ({ phase, onDismissSplash, onEnterGame }: { phase: 'splash' | 'home'; onDismissSplash: () => void; onEnterGame: () => void; }) => {
  const [postIndex, setPostIndex] = useState(0);
  const { user } = useGlobalState();
  const POST = ['VRAM 128KB OK', 'LOGIC GATE 0x82 OK', 'ESTABLISHING LINK...', 'SUCCESS', 'OS v4.2.0-STABLE', 'SYSTEM READY.'];
  useEffect(() => { if (phase === 'splash' && postIndex < POST.length) { const t = setTimeout(() => setPostIndex(i => i + 1), 150 + Math.random() * 200); return () => clearTimeout(t); } }, [phase, postIndex]);
  
  const handleLogin = async () => {
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) console.error(error);
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0D0F12] text-[#C9D1D9] crt-bezel crt-snap overflow-hidden font-mono">
      {phase === 'splash' ? (
        <button onClick={onDismissSplash} className="flex-1 flex flex-col items-center justify-center gap-12 text-center">
          <div className="flex flex-col items-center gap-6"><img src={`${import.meta.env.BASE_URL}favicon.svg`} className="h-16 w-16 grayscale brightness-200" /><div className="space-y-1"><p className="text-[11px] font-bold tracking-[0.4em] text-[#8B949E]">GOSAVTOMATIKA</p><h1 className="text-2xl font-bold tracking-tighter">TRAFFIC_TERMINAL_082</h1></div></div>
          <div className="min-h-[120px] flex flex-col items-start text-[10px] text-[#3FB950] bg-black/40 p-4 border border-[#2D333B] w-full max-w-xs">{POST.slice(0, postIndex).map((line, i) => (<div key={i} className="flex gap-2"><span className="opacity-50">[{i}]</span><span>{line}</span></div>))}{postIndex === POST.length && <div className="mt-4 text-[9px] text-[#8B949E] uppercase tracking-widest animate-pulse w-full">TAP TO INITIALIZE</div>}</div>
        </button>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-10">
          <div className="p-3 border-2 border-[#D29922]/40 text-[#D29922] font-bold text-2xl">082</div>
          <h2 className="text-xl font-bold uppercase">System Ready</h2>
          <div className="w-full max-w-sm border-2 border-[#2D333B] bg-[#1A1D23] p-6 text-[11px] space-y-4">
            <div className="flex justify-between text-[#8B949E] border-b border-[#2D333B] pb-2 text-[10px]"><span>REF: GOS-TRAF-082</span><span>2026-04-21</span></div>
            <p>1. PROTOCOL 01: Author signal phases.</p><p>2. PROTOCOL 02: Monitor demand and queues.</p><p>3. PROTOCOL 03: Achieve target throughput.</p>
          </div>
          
          <div className="w-full max-w-sm flex flex-col gap-4">
            {user ? (
              <div className="flex flex-col items-center gap-2">
                <div className="text-xs text-[#8B949E]">Logged in as <span className="text-[#C9D1D9]">{user.email}</span></div>
                <div className="flex gap-2 w-full">
                  <button onClick={handleLogout} className="flex-1 border-2 border-[#8B949E] bg-transparent py-3 text-[12px] font-black uppercase tracking-wider text-[#8B949E] hover:bg-[#8B949E]/10 transition-all">Sign Out</button>
                  <button onClick={onEnterGame} className="flex-[2] border-4 border-[#3FB950] bg-[#3FB950]/10 py-3 text-[16px] font-black uppercase tracking-[0.3em] text-[#3FB950] hover:bg-[#3FB950]/30 transition-all">Enter Terminal</button>
                </div>
              </div>
            ) : (
              <>
                <button onClick={handleLogin} className="w-full border-2 border-[#58A6FF] bg-[#58A6FF]/10 py-3 text-[12px] font-black uppercase tracking-wider text-[#58A6FF] hover:bg-[#58A6FF]/30 transition-all">Login with Google</button>
                <button onClick={onEnterGame} className="w-full border-4 border-[#3FB950] bg-[#3FB950]/10 py-5 text-[16px] font-black uppercase tracking-[0.3em] text-[#3FB950] hover:bg-[#3FB950]/30 transition-all">Enter as Guest</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const FirmwareUpdatePrompt = () => {
  const { offlineReady: [or, setOr], needRefresh: [nr, setNr], updateServiceWorker } = useRegisterSW({});
  const close = () => { setOr(false); setNr(false); };
  return (
    <AnimatePresence>
      {(nr || or) && (
        <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-6 right-6 z-50 w-80 rounded border border-[#D29922] bg-[#1A1D23] p-4 font-mono shadow-2xl">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 text-[#D29922]" size={20} /><div className="flex-1"><div className="text-[11px] font-bold tracking-widest text-[#D29922] uppercase">{nr ? 'Update Available' : 'Offline Ready'}</div><div className="mt-1 text-xs text-[#C9D1D9]">{nr ? 'New logic ready. Reboot to apply.' : 'System cached for offline use.'}</div><div className="mt-4 flex gap-2">{nr && <button onClick={() => updateServiceWorker(true)} className="flex-1 flex items-center justify-center gap-2 border border-[#D29922]/50 bg-[#D29922]/20 py-1.5 text-xs text-[#D29922] hover:bg-[#D29922]/30"><RefreshCw size={12} /> REBOOT</button>}<button onClick={close} className="flex-1 border border-[#2D333B] bg-black/20 py-1.5 text-xs text-[#C9D1D9] hover:bg-white/5 uppercase">Dismiss</button></div></div></div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
