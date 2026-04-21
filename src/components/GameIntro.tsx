import { motion } from 'motion/react';
import { Play, TrafficCone } from 'lucide-react';

type GameIntroProps = {
  phase: 'splash' | 'home';
  onDismissSplash: () => void;
  onEnterGame: () => void;
};

export function GameIntro({ phase, onDismissSplash, onEnterGame }: GameIntroProps) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0D0F12] text-[#C9D1D9] crt-bezel">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#2D333B_1px,transparent_1px)] bg-[size:24px_24px] opacity-50"
        aria-hidden
      />
      <div className="relative flex flex-1 flex-col">
        {phase === 'splash' ? (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            onClick={onDismissSplash}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-8 px-6 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3FB950] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0F12]"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5, type: 'spring', stiffness: 260, damping: 22 }}
              className="flex flex-col items-center gap-5"
            >
              <img
                src={`${import.meta.env.BASE_URL}favicon.svg`}
                alt=""
                className="h-16 w-16 drop-shadow-[0_0_20px_rgba(63,185,80,0.35)]"
                width={64}
                height={64}
              />
              <div>
                <p className="font-mono text-[11px] font-bold tracking-[0.35em] text-[#8B949E]">OMNICORP</p>
                <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#C9D1D9] sm:text-3xl">TRAFFIC TERMINAL</h1>
                <p className="mt-3 max-w-md font-mono text-xs leading-relaxed text-[#8B949E] sm:text-[13px]">
                  Authorized personnel only. Programming traffic control firmware for live intersection deployment.
                </p>
              </div>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.85, duration: 0.4 }}
              className="font-mono text-[11px] tracking-widest text-[#3FB950]/90"
            >
              TAP OR WAIT TO CONTINUE
            </motion.p>
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-1 flex-col items-center justify-center px-6 py-10"
          >
            <div className="flex w-full max-w-lg flex-col items-center gap-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <TrafficCone className="h-10 w-10 text-[#D29922]" strokeWidth={1.75} aria-hidden />
                <h2 className="font-mono text-xl font-bold tracking-tight text-[#C9D1D9] sm:text-2xl">SECTOR CONTROLLER</h2>
                <p className="font-mono text-xs leading-relaxed text-[#8B949E] sm:text-[13px]">
                  Compile phase scripts, tune timings, and keep the corridor clear. Crashes lock the board until reset.
                </p>
              </div>
              <ul className="w-full space-y-3 border border-[#2D333B] bg-[#1A1D23]/80 px-4 py-4 text-left font-mono text-[11px] text-[#C9D1D9] sm:text-xs">
                <li className="flex gap-2">
                  <span className="shrink-0 text-[#3FB950]">01</span>
                  <span>Author signal phases in the engineering console</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 text-[#58A6FF]">02</span>
                  <span>Monitor demand, queues, and adaptive loop timing</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 text-[#D29922]">03</span>
                  <span>Run the intersection and iterate until stable flow</span>
                </li>
              </ul>
              <button
                type="button"
                onClick={onEnterGame}
                className="group flex w-full max-w-sm items-center justify-center gap-2 border-2 border-[#3FB950] bg-[#3FB950]/15 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-[#3FB950] shadow-[0_0_24px_rgba(63,185,80,0.2)] transition-colors hover:bg-[#3FB950]/25 sm:text-[15px]"
              >
                <Play className="h-5 w-5 transition-transform group-hover:scale-105" strokeWidth={2.5} />
                Enter terminal
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
