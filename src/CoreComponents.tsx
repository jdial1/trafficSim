import React, { useState, useEffect, useMemo } from 'react';
import { BRAND, CTA, METRIC, manualRibbonLabel } from './branding';
import { APP_BUILD_VERSION } from './generatedVersion';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, Check, AlertTriangle, RefreshCw, Trophy, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { BriefingContent } from './types';
import { BriefingParser } from './BriefingParser';
import { useGlobalState } from './GlobalStateContext';
import { supabase } from './lib/supabase';
import { MANUAL_APPENDIX, type AppendixBlock } from './manualAppendix';
import { segmentManualText } from './manualKeywordGlossary';

export const Histogram = ({ title, value, unit, color, min, max, levelId, dbColumn }: { title: string; value: number; unit: string; color: string; min: number; max: number; levelId?: string; dbColumn?: string; }) => {
  const [realBars, setRealBars] = useState<number[] | null>(null);
  const [botBuckets, setBotBuckets] = useState<Record<string, number>>({});
  
  useEffect(() => {
    if (levelId && dbColumn) {
      supabase.from('scores').select('*').eq('level_id', levelId).then(({ data }) => {
        if (data && data.length > 0) {
          const counts = new Array(30).fill(0);
          const bots: Record<string, number> = {};
          const range = max - min;
          data.forEach(row => {
            const val = row[dbColumn as keyof typeof row] as number | undefined;
            const username = (row.profiles as { username?: string | null } | null | undefined)?.username;
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

const ManualKeyword = ({ label, tip, normalCase }: { label: string; tip: string; normalCase?: boolean }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = React.useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const el = e.target as Node | null;
      if (el && wrapRef.current?.contains(el)) return;
      setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline align-baseline">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Definition: ${label}`}
        title={tip}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`cursor-pointer border-0 border-b border-dotted border-current bg-transparent p-0 font-mono text-[0.92em] font-semibold text-inherit underline-offset-2 hover:bg-[#2c2b29]/10 ${normalCase ? 'normal-case' : ''}`}
      >
        {label}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-[calc(100%+6px)] z-[120] max-w-[min(20rem,calc(100vw-3rem))] border-2 border-[#2c2b29] bg-[#efebd8] p-2.5 font-sans text-xs font-normal normal-case leading-snug tracking-normal text-[#2c2b29] shadow-[4px_4px_0_#2c2b29]"
        >
          {tip}
        </span>
      )}
    </span>
  );
};

const ManualRichText = ({ text, className, variant = 'body' }: { text: string; className?: string; variant?: 'body' | 'heading' }) => {
  const segs = useMemo(() => segmentManualText(text), [text]);
  const isHeading = variant === 'heading';
  return (
    <span className={`${className ?? ''} ${isHeading ? 'uppercase' : ''}`.trim()}>
      {segs.map((s, idx) =>
        s.kind === 'plain' ? (
          <span key={idx}>{s.text}</span>
        ) : (
          <ManualKeyword key={idx} label={s.text} tip={s.tip} normalCase={isHeading} />
        ),
      )}
    </span>
  );
};

const ManualAppendixBlock = ({ block }: { block: AppendixBlock }) => {
  if (block.t === 'h2') {
    return (
      <h2 className="text-xl font-bold mt-8 mb-4 border-b border-[#2c2b29]/30 pb-2 font-mono first:mt-0">
        <ManualRichText text={block.text} variant="heading" />
      </h2>
    );
  }
  if (block.t === 'p') {
    return (
      <p className="mb-4 leading-relaxed">
        <ManualRichText text={block.text} />
      </p>
    );
  }
  if (block.t === 'code') {
    return (
      <div className="mb-6 border-l-4 border-[#2c2b29] bg-[#2c2b29]/5 p-4 font-mono text-sm whitespace-pre text-[#2c2b29]">
        <ManualRichText text={block.text} />
      </div>
    );
  }
  return (
    <ul className="list-disc pl-6 mb-6 space-y-2">
      {block.items.map((item, j) => (
        <li key={j} className="text-[#2c2b29]">
          <ManualRichText text={item} />
        </li>
      ))}
    </ul>
  );
};

export const ManualOverlay = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { highscores, unlockedLevels } = useGlobalState();
  const [pageIndex, setPageIndex] = useState(0);

  const pages = useMemo(
    () =>
      MANUAL_APPENDIX.filter((p) => {
        if (p.alwaysVisible) return true;
        if (p.unlockLevelId && highscores[p.unlockLevelId]) return true;
        if (p.unlockSandbox && unlockedLevels.includes('sandbox')) return true;
        return false;
      }),
    [highscores, unlockedLevels],
  );

  useEffect(() => {
    if (isOpen) setPageIndex(0);
  }, [isOpen]);

  const safeIndex = pages.length ? Math.min(pageIndex, pages.length - 1) : 0;
  const page = pages[safeIndex];

  return (
    <AnimatePresence>
      {isOpen && page && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[100] flex justify-center bg-black/80 backdrop-blur-md overflow-hidden p-2 sm:p-8"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="w-full max-w-4xl h-full flex flex-col bg-[#efebd8] text-[#2c2b29] rounded-sm shadow-2xl border-4 border-[#2c2b29] font-serif overflow-hidden"
          >
            <div className="flex items-center justify-between bg-[#2c2b29] text-[#efebd8] px-4 py-2 font-mono font-bold tracking-widest shrink-0">
              <span>{manualRibbonLabel()}</span>
              <button type="button" onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors">
                <X size={20} />
              </button>
            </div>
            {pages.length > 1 && (
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b-2 border-[#2c2b29] bg-[#efebd8] px-2 py-2 font-mono text-[10px] font-bold uppercase tracking-wider">
                {pages.map((p, i) => (
                  <button
                    key={p.tab + i}
                    type="button"
                    onClick={() => setPageIndex(i)}
                    className={`shrink-0 rounded-sm px-3 py-1.5 transition-colors ${
                      safeIndex === i ? 'bg-[#2c2b29] text-[#efebd8]' : 'text-[#2c2b29] hover:bg-[#2c2b29]/10'
                    }`}
                  >
                    {p.tab}
                  </button>
                ))}
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto p-6 sm:p-10">
                <h1 className="mb-8 border-b-2 border-[#2c2b29] pb-4 font-mono text-3xl font-bold sm:text-4xl">
                  <ManualRichText text={page.title} variant="heading" />
                </h1>
                {page.blocks.map((block, i) => (
                  <ManualAppendixBlock key={i} block={block} />
                ))}
              </div>
              {pages.length > 1 && (
                <div className="flex shrink-0 items-center justify-between gap-4 border-t-2 border-[#2c2b29] bg-[#2c2b29]/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-[#2c2b29]">
                  <button
                    type="button"
                    onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                    disabled={safeIndex <= 0}
                    className="flex items-center gap-1 rounded-sm border border-[#2c2b29] px-3 py-2 transition-colors enabled:hover:bg-[#2c2b29]/10 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                    Prev
                  </button>
                  <span className="tabular-nums">
                    {safeIndex + 1} / {pages.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
                    disabled={safeIndex >= pages.length - 1}
                    className="flex items-center gap-1 rounded-sm border border-[#2c2b29] px-3 py-2 transition-colors enabled:hover:bg-[#2c2b29]/10 disabled:opacity-40"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

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
  const visibleLevels = levels.filter((l, i) => unlockedLevels.includes(l.id) || i === 0);
  const rawActiveLevel = levels.find(l => l.id === activeLevelId) ?? levels[0];
  const activeIdx = levels.findIndex(l => l.id === rawActiveLevel.id);
  const isActiveUnlocked = unlockedLevels.includes(rawActiveLevel.id) || activeIdx === 0;
  const score = highscores[rawActiveLevel.id];
  const activeLevel = isActiveUnlocked
    ? BriefingParser.parseBriefing(rawActiveLevel, {
        clearCars: rawActiveLevel.winCondition?.clearCars || 0
      })
    : null;
  return (
    <div className="flex flex-col h-full bg-[#1A1D23] p-4 text-[#C9D1D9] font-mono overflow-y-auto scrollbar-hide">
      <div className="text-[10px] text-[#8B949E] uppercase tracking-wider mb-2 truncate border-b border-[#2D333B] pb-2 font-bold">
        {rawActiveLevel.title}
      </div>
      <div className="flex gap-2 mb-4 shrink-0 overflow-x-auto pb-1">
        {visibleLevels.map((l) => {
          const completed = Boolean(highscores[l.id]);
          const active = l.id === activeLevelId;
          const tabClass =
            active && completed
              ? 'border-[#3FB950] bg-[#3FB950]/12 text-[#3FB950]'
              : active && !completed
                ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]'
                : !active && completed
                  ? 'border-[#3FB950]/40 bg-black/20 text-[#7ee787] hover:border-[#3FB950]/65'
                  : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5';
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onSelectLevel(l.id)}
              className={`relative flex-1 min-w-[60px] overflow-hidden py-2 text-center text-[10px] font-bold border rounded-none transition-colors ${tabClass}`}
            >
              {completed && (
                <Check
                  className="pointer-events-none absolute left-1/2 top-1/2 z-0 size-9 -translate-x-1/2 -translate-y-1/2 text-[#3FB950] opacity-[0.18]"
                  strokeWidth={2.75}
                  aria-hidden
                />
              )}
              <span className="relative z-10">{l.id}</span>
            </button>
          );
        })}
      </div>
      {isActiveUnlocked && activeLevel && (
        <div className="border-2 border-[#2D333B] bg-black/40 p-4 relative shadow-xl">
          {score ? <div className="absolute top-0 right-0 px-2 py-0.5 bg-[#3FB950] text-[#0D0F12] text-[9px] font-bold tracking-widest flex items-center gap-1"><CheckCircle2 size={14} /> COMPLETED</div> : <div className="absolute top-0 right-0 px-2 py-0.5 bg-[#F85149] text-black text-[9px] font-bold tracking-widest uppercase">Confidential</div>}
          <div className="text-xs text-[#8B949E] mb-1 mt-2 uppercase">From: <span className="text-[#58A6FF]">{activeLevel.from}</span></div>
          <div className="text-xs text-[#8B949E] mb-3 border-b border-[#2D333B] pb-3 uppercase">Subject: <span className="text-[#C9D1D9]">{activeLevel.subject}</span></div>
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{activeLevel.body}</div>
          <ul className="mt-4 space-y-2 list-disc pl-5 text-[12px] text-[#3FB950]">{activeLevel.bullets.map((b, i) => (<li key={i}><span className="text-[#C9D1D9]">{b}</span></li>))}</ul>
          {score && <div className="mt-6 pt-4 border-t-2 border-[#2D333B] border-dashed space-y-3"><Histogram title={METRIC.THROUGHPUT} value={score.secondsToClear} unit="s" color="#3FB950" min={10} max={120} levelId={activeLevel.id} dbColumn="seconds_to_clear" /><Histogram title={METRIC.INSTRUCTION_COUNT} value={score.instructionCount} unit="LINES" color="#58A6FF" min={2} max={30} levelId={activeLevel.id} dbColumn="instruction_count" /><Histogram title={METRIC.HARDWARE_COST} value={score.hardwareCost} unit="¥" color="#D29922" min={100} max={2000} levelId={activeLevel.id} dbColumn="hardware_cost" /></div>}
          <Rankings levelId={activeLevel.id} />
        </div>
      )}
    </div>
  );
};

export const GameIntro = ({
  showInstallPrompt,
  onInstallApp,
  onEnterGame,
}: {
  showInstallPrompt: boolean;
  onInstallApp: () => void | Promise<void>;
  onEnterGame: () => void;
}) => {
  const { user } = useGlobalState();

  const handleLogin = async () => {
    const fromEnv = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
    const redirectTo = fromEnv
      ? new URL(fromEnv).href
      : import.meta.env.PROD && window.location.hostname === 'jdial1.github.io'
        ? 'https://jdial1.github.io/trafficSim/'
        : new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) console.error(error);
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const introCta =
    'min-h-[52px] w-full border-2 px-3 py-3 text-[12px] font-bold uppercase tracking-wide transition-colors font-mono flex items-center justify-center gap-2 leading-none';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-[#0a0b0e] px-6 py-12 font-mono text-[#d1d5db] crt-bezel crt-snap">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="border border-[#c5922e] px-5 py-3 text-2xl font-bold tracking-tight text-[#c5922e]">{BRAND.SECTOR_NUM}</div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#8B949E]">{BRAND.ORG}</p>
            <h1 className="text-xl font-bold uppercase tracking-tight text-[#d1d5db] sm:text-2xl">{BRAND.PRODUCT}</h1>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#d1d5db]">System ready</p>
          </div>
        </div>
        <div className="w-full border border-[#2D333B] bg-[#12141a] bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:100%_4px] p-5 text-[11px] leading-relaxed">
          <div className="mb-4 flex justify-between border-b border-[#2D333B] pb-2 text-[10px] text-[#8B949E]">
            <span>{BRAND.REF_DOC}</span>
            <span>{APP_BUILD_VERSION}</span>
          </div>
          <p className="mb-2">1. PROTOCOL 01: Author signal phases.</p>
          <p className="mb-2">2. PROTOCOL 02: Monitor demand and queues.</p>
          <p>3. PROTOCOL 03: Achieve target throughput.</p>
        </div>
        <div className="flex w-full flex-col gap-3">
          {showInstallPrompt && (
            <button
              type="button"
              onClick={() => void onInstallApp()}
              className={`${introCta} border-[#c5922e] bg-[#c5922e]/10 text-[#c5922e] hover:bg-[#c5922e]/20`}
            >
              <Download size={16} strokeWidth={2} className="size-4 shrink-0" />
              <span className="min-w-0 text-center">{CTA.INSTALL_APP}</span>
            </button>
          )}
          {user ? (
            <div className="flex flex-col gap-3">
              <div className="text-center text-[11px] text-[#8B949E]">
                Logged in as <span className="text-[#d1d5db]">{user.email}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className={`${introCta} flex-1 border-[#8B949E] bg-transparent text-[#8B949E] hover:bg-[#8B949E]/10`}
                >
                  {CTA.SIGN_OUT}
                </button>
                <button
                  type="button"
                  onClick={onEnterGame}
                  className={`${introCta} flex-[2] border-[#47a85d] bg-[#47a85d]/10 text-[#47a85d] hover:bg-[#47a85d]/25`}
                >
                  {CTA.ENTER_TERMINAL}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleLogin()}
                className={`${introCta} border-[#5ba4e5] bg-[#5ba4e5]/10 text-[#5ba4e5] hover:bg-[#5ba4e5]/25`}
              >
                {CTA.LOGIN_GOOGLE}
              </button>
              <button
                type="button"
                onClick={onEnterGame}
                className={`${introCta} border-[#47a85d] bg-[#47a85d]/10 text-[#47a85d] hover:bg-[#47a85d]/25`}
              >
                {CTA.ENTER_GUEST}
              </button>
            </>
          )}
        </div>
      </div>
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
