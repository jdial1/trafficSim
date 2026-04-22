import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

type GameIntroProps = {
  phase: 'splash' | 'home';
  onDismissSplash: () => void;
  onEnterGame: () => void;
};

const POST_SEQUENCE = [
  'VRAM 128KB OK',
  'LOGIC GATE 0x82 OK',
  'ESTABLISHING LINK TO SEC-082...',
  'SECURE HANDSHAKE: SUCCESS',
  'GOSAVTOMATIKA OS v4.2.0-STABLE',
  'SYSTEM READY.'
];

const LogicGateIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 12h3m14 0h3M5 7v10c0 1.5 1 3 4 3h2V4H9c-3 0-4 1.5-4 3zm6 13h4c3 0 4-1.5 4-3V7c0-1.5-1-3-4-3h-4v16z" />
    <circle cx="18" cy="12" r="1" fill="currentColor" />
  </svg>
);

export function GameIntro({ phase, onDismissSplash, onEnterGame }: GameIntroProps) {
  const [postIndex, setPostIndex] = useState(0);

  useEffect(() => {
    if (phase === 'splash' && postIndex < POST_SEQUENCE.length) {
      const timer = setTimeout(() => {
        setPostIndex(prev => prev + 1);
      }, 150 + Math.random() * 200);
      return () => clearTimeout(timer);
    }
  }, [phase, postIndex]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0D0F12] text-[#C9D1D9] crt-bezel crt-snap overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#2D333B_1px,transparent_1px)] bg-[size:24px_24px] opacity-30"
        aria-hidden
      />
      
      {/* Corner Technical Data */}
      <div className="pointer-events-none absolute top-4 left-6 font-mono text-[9px] text-[#8B949E] flex flex-col gap-0.5 opacity-60">
        <div>SYS_TEMP: 42.4°C</div>
        <div>CLOCK: 14.2MHz</div>
        <div>V_REF: 5.02V</div>
      </div>
      <div className="pointer-events-none absolute top-4 right-6 font-mono text-[9px] text-[#8B949E] text-right opacity-60">
        <div>v4.2.0-STABLE</div>
        <div>BUILD_2026-04-21</div>
        <div>SEC_082_ACTIVE</div>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-6 font-mono text-[9px] text-[#8B949E] opacity-40">
        <div>COORD_GRID: 52.34N 13.40E</div>
      </div>
      <div className="pointer-events-none absolute bottom-4 right-6 font-mono text-[9px] text-[#8B949E] text-right opacity-40">
        <div>(C) 1986 GOSAVTOMATIKA</div>
      </div>

      <div className="relative flex flex-1 flex-col">
        {phase === 'splash' ? (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismissSplash}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-12 px-6 text-center focus:outline-none"
          >
            <div className="flex flex-col items-center gap-6">
              <img
                src={`${import.meta.env.BASE_URL}favicon.svg`}
                alt=""
                className="h-16 w-16 grayscale brightness-200"
                width={64}
                height={64}
              />
              <div className="space-y-1">
                <p className="font-mono text-[11px] font-bold tracking-[0.4em] text-[#8B949E]">GOSAVTOMATIKA</p>
                <h1 className="font-mono text-2xl font-bold tracking-tighter text-[#C9D1D9] sm:text-3xl">TRAFFIC_TERMINAL_082</h1>
              </div>
            </div>

            <div className="min-h-[120px] flex flex-col items-start font-mono text-[10px] text-[#3FB950] bg-black/40 p-4 border border-[#2D333B] w-full max-w-xs text-left">
              {POST_SEQUENCE.slice(0, postIndex).map((line, i) => (
                <div key={i} className="flex gap-2">
                  <span className="opacity-50">[{i.toString().padStart(2, '0')}]</span>
                  <span>{line}</span>
                </div>
              ))}
              {postIndex < POST_SEQUENCE.length && (
                <div className="animate-pulse">_</div>
              )}
              {postIndex === POST_SEQUENCE.length && (
                <div className="mt-4 text-[9px] text-[#8B949E] uppercase tracking-widest animate-pulse w-full text-center">
                  TAP TO INITIALIZE
                </div>
              )}
            </div>
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-1 flex-col items-center justify-center px-6 py-10"
          >
            <div className="flex w-full max-w-lg flex-col items-center gap-10 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-3 bg-black/40 border-2 border-[#D29922]/40 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[#D29922]/5 opacity-50" />
                  <LogicGateIcon className="h-10 w-10 text-[#D29922]" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-mono text-xl font-bold tracking-tight text-[#C9D1D9] sm:text-2xl uppercase">System Ready</h2>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-[#8B949E] uppercase">Operator's Desk // Sec-082</p>
                </div>
              </div>

              <div className="relative w-full max-w-sm border-2 border-[#2D333B] bg-[#1A1D23] p-6 font-mono shadow-[8px_8px_0_rgba(0,0,0,0.5)] overflow-hidden">
                <div className="absolute -right-4 top-4 rotate-12 border-2 border-[#F85149]/30 px-3 py-1 text-[10px] font-bold text-[#F85149]/30 tracking-[0.2em]">
                  CONFIDENTIAL
                </div>
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]" />
                
                <div className="text-[10px] text-[#8B949E] mb-4 border-b border-[#2D333B] pb-2 flex justify-between">
                  <span>REF: GOS-TRAF-082</span>
                  <span>DATE: 2026-04-21</span>
                </div>

                <ul className="space-y-4 text-left text-[11px] text-[#C9D1D9]">
                  <li className="flex gap-4 items-start">
                    <span className="shrink-0 text-[#3FB950] font-bold">PROTOCOL 01</span>
                    <span className="leading-tight opacity-90">LOAD LOGIC INTO BUFFER: Author signal phases in the engineering console.</span>
                  </li>
                  <li className="flex gap-4 items-start">
                    <span className="shrink-0 text-[#58A6FF] font-bold">PROTOCOL 02</span>
                    <span className="leading-tight opacity-90">MONITOR TICKS/CYCLE: Observe demand, queues, and adaptive loop timing.</span>
                  </li>
                  <li className="flex gap-4 items-start">
                    <span className="shrink-0 text-[#D29922] font-bold">PROTOCOL 03</span>
                    <span className="leading-tight opacity-90">ACHIEVE TARGET THROUGHPUT: Iterate phases until stable flow is established.</span>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                onClick={onEnterGame}
                className="group flex w-full max-w-sm items-center justify-center gap-3 border-4 border-[#3FB950] bg-[#3FB950]/10 py-5 font-mono text-[16px] font-black uppercase tracking-[0.3em] text-[#3FB950] transition-all hover:bg-[#3FB950]/30 hover:shadow-[0_0_40px_rgba(63,185,80,0.3)] active:scale-[0.98]"
              >
                Enter Terminal
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
