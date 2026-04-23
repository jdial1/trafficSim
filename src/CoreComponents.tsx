import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BRAND, bureauEfficiencyAuditLabel, CTA, METRIC, manualRibbonLabel } from './branding';
import { APP_BUILD_VERSION } from './generatedVersion';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertTriangle, RefreshCw, Trophy, Download, ChevronLeft, ChevronRight, ChevronDown, Copy, BookOpen } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { BriefingContent } from './types';
import { BriefingParser } from './BriefingParser';
import { useGlobalState } from './GlobalStateContext';
import { supabase } from './lib/supabase';
import { MANUAL_APPENDIX, type AppendixBlock } from './manualAppendix';
import { segmentManualText, type ManualRichSegment } from './manualKeywordGlossary';

const ManualNavContext = React.createContext<{ jumpToTab: (tab: string) => void } | null>(null);

const manualAppendixTabDisplay = (tab: string, allTabs: string[]) => {
  const m = /^(\d+)-(.+)$/.exec(tab);
  if (!m) return tab;
  const chapter = m[1];
  const rest = m[2];
  for (const t of allTabs) {
    if (t === tab) continue;
    const m2 = /^(\d+)-(.+)$/.exec(t);
    if (m2 && m2[2] === rest) return `${chapter}${rest}`;
  }
  return rest;
};

export const Histogram = ({
  title,
  value,
  unit,
  color,
  min,
  max,
  levelId,
  dbColumn,
  distributionLabel,
}: {
  title: string;
  value: number;
  unit: string;
  color: string;
  min: number;
  max: number;
  levelId?: string;
  dbColumn?: string;
  distributionLabel?: string;
}) => {
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
      {distributionLabel ? (
        <div className="text-[8px] text-[#8B949E]/90 font-mono uppercase tracking-wide mb-1 leading-tight">{distributionLabel}</div>
      ) : null}
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
              {isUserBucket && <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-black z-10 whitespace-nowrap" style={{ color, textShadow: '0 0 5px rgba(0,0,0,0.8)' }}>THIS STATION</div>}
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

const MANUAL_SCROLL_ROOT = 'data-manual-scroll-root';

const ManualTipBody = ({ tip }: { tip: string }) => {
  const i = tip.indexOf(': ');
  if (i === -1 || i > 56) return tip;
  return (
    <>
      <span className="mb-1.5 block font-semibold leading-snug">{tip.slice(0, i + 1)}</span>
      <span className="block">{tip.slice(i + 2)}</span>
    </>
  );
};

const ManualKeyword = ({
  label,
  tip,
  normalCase,
  jumpTab,
}: {
  label: string;
  tip: string;
  normalCase?: boolean;
  jumpTab?: string;
}) => {
  const manualNav = React.useContext(ManualNavContext);
  const [open, setOpen] = useState(false);
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const tipRef = React.useRef<HTMLSpanElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [tipBox, setTipBox] = useState<{ top: number; left: number; width: number } | null>(null);

  const layoutTip = React.useCallback(() => {
    if (!open || !triggerRef.current) return;
    const pad = 12;
    const width = Math.min(20 * 16, window.innerWidth - pad * 2);
    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.left;
    if (left + width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - width);
    else if (left < pad) left = pad;
    setTipBox({ top: rect.bottom + 6, left, width });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setTipBox(null);
      return;
    }
    layoutTip();
  }, [open, layoutTip, label, tip]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => layoutTip();
    window.addEventListener('resize', onScrollOrResize);
    const root = triggerRef.current?.closest(`[${MANUAL_SCROLL_ROOT}]`);
    root?.addEventListener('scroll', onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      root?.removeEventListener('scroll', onScrollOrResize);
    };
  }, [open, layoutTip]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const el = e.target as Node | null;
      if (el && wrapRef.current?.contains(el)) return;
      if (el && tipRef.current?.contains(el)) return;
      setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline align-baseline">
      <button
        ref={triggerRef}
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
      {open &&
        tipBox &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            style={{ position: 'fixed', top: tipBox.top, left: tipBox.left, width: tipBox.width, zIndex: 20000 }}
            className="box-border break-words border-2 border-[#2c2b29] bg-[#efebd8] p-3 font-sans text-sm font-normal normal-case leading-relaxed tracking-normal text-[#2c2b29] shadow-[4px_4px_0_#2c2b29]"
          >
            <ManualTipBody tip={tip} />
            {jumpTab && manualNav && (
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-1 border-2 border-[#2c2b29] bg-[#2c2b29] py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#efebd8] hover:bg-[#3d3a36]"
                onClick={(e) => {
                  e.stopPropagation();
                  manualNav.jumpToTab(jumpTab);
                  setOpen(false);
                }}
              >
                <BookOpen size={12} />
                Open § {jumpTab}
              </button>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
};

const ManualRichText = ({ text, className, variant = 'body' }: { text: string; className?: string; variant?: 'body' | 'heading' }) => {
  const segs = useMemo(() => segmentManualText(text), [text]);
  const isHeading = variant === 'heading';
  return (
    <span className={`${className ?? ''} ${isHeading ? 'uppercase' : ''}`.trim()}>
      {segs.map((s: ManualRichSegment, idx: number) => {
        if (s.kind === 'plain') return <span key={idx}>{s.text}</span>;
        if (s.kind === 'scribble')
          return (
            <span
              key={idx}
              className="my-2 ml-1 inline-block max-w-[95%] -rotate-[0.8deg] border border-dashed border-[#6b5a4b] bg-[#f7f0dc] px-3 py-2 font-mono text-[0.85em] italic leading-snug text-[#4a3728] shadow-[2px_3px_0_#c4b49a]"
            >
              {s.text}
            </span>
          );
        if (s.kind === 'redact')
          return (
            <span
              key={idx}
              className="mx-0.5 inline-block bg-[#1a1814] px-1.5 py-0.5 font-mono text-[0.75em] uppercase tracking-widest text-[#8B949E]"
            >
              {s.text}
            </span>
          );
        if (s.kind === 'strike')
          return (
            <span
              key={idx}
              className="mx-0.5 inline decoration-[#8B4513] decoration-2 line-through opacity-75"
              title="Superseded text — see adjacent ERRATA"
            >
              {s.text}
            </span>
          );
        return <ManualKeyword key={idx} label={s.text} tip={s.tip} jumpTab={s.jumpTab} normalCase={isHeading} />;
      })}
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
      <div className="relative mb-6 border-l-4 border-[#2c2b29] bg-[#2c2b29]/5 p-4 pr-14 font-mono text-sm whitespace-pre text-[#2c2b29]">
        <button
          type="button"
          title="Copy to clipboard"
          onClick={() => void navigator.clipboard?.writeText(block.text)}
          className="absolute right-2 top-2 flex items-center gap-1 border-2 border-[#2c2b29] bg-[#efebd8] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[#2c2b29] hover:bg-[#2c2b29] hover:text-[#efebd8]"
        >
          <Copy size={12} />
          Copy
        </button>
        <ManualRichText text={block.text} />
      </div>
    );
  }
  if (block.t === 'redact') {
    return (
      <p className="mb-4 border-2 border-[#2c2b29] bg-[#1a1814] px-3 py-2 font-mono text-xs uppercase leading-relaxed tracking-widest text-[#8B949E]">
        {block.text}
      </p>
    );
  }
  if (block.t === 'warn') {
    const isRed = block.tone === 'red';
    return (
      <div
        className={`mb-6 flex gap-3 border-4 p-4 font-mono text-sm leading-snug ${
          isRed
            ? 'border-[#F85149] bg-[#F85149]/10 text-[#5c1510]'
            : 'border-[#9a6b2d] bg-[#f4e4c0] text-[#3d2a12]'
        }`}
      >
        <AlertTriangle className={`h-6 w-6 shrink-0 ${isRed ? 'text-[#F85149]' : 'text-[#9a6b2d]'}`} strokeWidth={2.5} />
        <div className="min-w-0 pt-0.5">
          <ManualRichText text={block.text} />
        </div>
      </div>
    );
  }
  if (block.t === 'pre') {
    return (
      <pre className="mb-6 overflow-x-auto border-2 border-[#2c2b29] bg-[#2c2b29]/5 p-4 font-mono text-xs leading-tight text-[#2c2b29]">
        {block.text}
      </pre>
    );
  }
  if (block.t === 'margin') {
    return (
      <p
        className="mb-4 border-l-2 border-[#8b6914]/70 bg-[#f4e8c0]/40 pl-3 py-2 text-xs italic leading-snug text-[#4a3a18]"
        style={{ fontFamily: '"Segoe Script", "Bradley Hand ITC", "Apple Chancery", cursive' }}
      >
        {block.text}
      </p>
    );
  }
  if (block.t === 'table') {
    return (
      <div className="mb-6 overflow-x-auto border-2 border-[#2c2b29]">
        <table className="w-full min-w-[280px] border-collapse font-mono text-xs text-[#2c2b29]">
          <thead>
            <tr className="bg-[#2c2b29] text-[#efebd8]">
              {block.headers.map((h, hi) => (
                <th key={hi} className="border border-[#2c2b29] px-2 py-2 text-left font-bold uppercase tracking-wide">
                  <ManualRichText text={h} variant="heading" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 1 ? 'bg-[#2c2b29]/5' : ''}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-[#2c2b29]/40 px-2 py-2 align-top leading-relaxed">
                    <ManualRichText text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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

export const ManualOverlay = ({
  isOpen,
  onClose,
  initialTab,
  onInitialTabConsumed,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string | null;
  onInitialTabConsumed?: () => void;
}) => {
  const { highscores, unlockedLevels } = useGlobalState();
  const [manualView, setManualView] = useState<'toc' | 'page'>('toc');
  const [pageIndex, setPageIndex] = useState(0);
  const openHandledRef = React.useRef(false);

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

  const jumpToTab = React.useCallback(
    (tab: string) => {
      const idx = pages.findIndex((p) => p.tab === tab);
      if (idx >= 0) {
        setPageIndex(idx);
        setManualView('page');
      }
    },
    [pages],
  );

  const jumpCtx = useMemo(() => ({ jumpToTab }), [jumpToTab]);

  useLayoutEffect(() => {
    if (!isOpen) {
      openHandledRef.current = false;
      return;
    }
    if (openHandledRef.current) return;
    openHandledRef.current = true;
    if (initialTab) {
      const idx = pages.findIndex((p) => p.tab === initialTab);
      if (idx >= 0) {
        setPageIndex(idx);
        setManualView('page');
      } else {
        setManualView('toc');
        setPageIndex(0);
      }
      onInitialTabConsumed?.();
    } else {
      setManualView('toc');
      setPageIndex(0);
    }
  }, [isOpen, initialTab, pages, onInitialTabConsumed]);

  const safeIndex = pages.length ? Math.min(pageIndex, pages.length - 1) : 0;
  const page = pages[safeIndex];
  const pageTabLabels = useMemo(() => {
    const tabs = pages.map((p) => p.tab);
    return tabs.map((tab) => manualAppendixTabDisplay(tab, tabs));
  }, [pages]);

  return (
    <AnimatePresence>
      {isOpen && pages.length > 0 && (
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
              <span>{manualRibbonLabel()} · INDEX</span>
              <button type="button" onClick={onClose} className="p-1 hover:bg-white/20 rounded transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {manualView === 'toc' ? (
                <div {...{ [MANUAL_SCROLL_ROOT]: '' }} className="flex-1 overflow-y-auto p-6 sm:p-10">
                  <h1 className="mb-2 border-b-2 border-[#2c2b29] pb-3 font-mono text-2xl font-bold sm:text-3xl uppercase tracking-tight">
                    Table of contents
                  </h1>
                  <p className="mb-8 font-mono text-xs leading-relaxed text-[#2c2b29]/80">
                    Select a volume entry. Tab ids mirror the help(1) routing table on the SEC-082 filestore.
                  </p>
                  <ol className="list-none space-y-1 p-0 font-mono text-sm">
                    {pages.map((p, i) => (
                      <li key={p.tab}>
                        <button
                          type="button"
                          onClick={() => {
                            setPageIndex(i);
                            setManualView('page');
                          }}
                          className="flex w-full items-baseline gap-3 border border-transparent px-2 py-2 text-left hover:border-[#2c2b29] hover:bg-[#2c2b29]/5"
                        >
                          <span className="shrink-0 font-bold text-[#8B6f4a]">§{p.section}</span>
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-[#5c5346]">{p.tab}</span>
                          <span className="min-w-0 flex-1 leading-snug">{p.title}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <ManualNavContext.Provider value={jumpCtx}>
                  <div {...{ [MANUAL_SCROLL_ROOT]: '' }} className="flex-1 overflow-y-auto p-6 sm:p-10">
                    <div className="mb-6 flex flex-wrap items-center gap-3 border-b-2 border-[#2c2b29] pb-4">
                      <button
                        type="button"
                        onClick={() => setManualView('toc')}
                        className="rounded-sm border-2 border-[#2c2b29] bg-[#2c2b29] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#efebd8] hover:bg-[#3d3a36]"
                      >
                        ← Index
                      </button>
                      <span className="font-mono text-[11px] font-bold text-[#6b5a4b]">§{page.section}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#5c5346]">{page.tab}</span>
                    </div>
                    <h1 className="mb-8 font-mono text-2xl font-bold sm:text-3xl">
                      <ManualRichText text={page.title} variant="heading" />
                    </h1>
                    {page.blocks.map((block, i) => (
                      <ManualAppendixBlock key={i} block={block} />
                    ))}
                  </div>
                </ManualNavContext.Provider>
              )}
              {manualView === 'page' && pages.length > 1 && (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t-2 border-[#2c2b29] bg-[#2c2b29]/5 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-[#2c2b29]">
                  <button
                    type="button"
                    onClick={() => setManualView('toc')}
                    className="rounded-sm border border-[#2c2b29] px-2 py-2 hover:bg-[#2c2b29]/10"
                  >
                    Index
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageIndex((x) => Math.max(0, x - 1))}
                    disabled={safeIndex <= 0}
                    className="flex items-center gap-1 rounded-sm border border-[#2c2b29] px-3 py-2 enabled:hover:bg-[#2c2b29]/10 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                    Prev
                  </button>
                  <span className="tabular-nums">
                    {pageTabLabels[safeIndex]} · {safeIndex + 1}/{pages.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPageIndex((x) => Math.min(pages.length - 1, x + 1))}
                    disabled={safeIndex >= pages.length - 1}
                    className="flex items-center gap-1 rounded-sm border border-[#2c2b29] px-3 py-2 enabled:hover:bg-[#2c2b29]/10 disabled:opacity-40"
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

const readDocketFatal = (levelId: string) => {
  try {
    return sessionStorage.getItem(`traffic_docket_fatal_${levelId}`) === '1';
  } catch {
    return false;
  }
};

export const LevelSelect = ({ levels, activeLevelId, unlockedLevels = [], onSelectLevel }: { levels: BriefingContent[]; activeLevelId: string; unlockedLevels?: string[]; onSelectLevel: (id: string) => void; }) => {
  const { highscores } = useGlobalState();
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const visibleLevels = levels.filter((l, i) => unlockedLevels.includes(l.id) || i === 0);
  const openLevels = visibleLevels.filter((l) => !highscores[l.id]);
  const completedLevels = visibleLevels.filter((l) => Boolean(highscores[l.id]));
  const rawActiveLevel = levels.find(l => l.id === activeLevelId) ?? levels[0];
  const activeIdx = levels.findIndex(l => l.id === rawActiveLevel.id);
  const isActiveUnlocked = unlockedLevels.includes(rawActiveLevel.id) || activeIdx === 0;
  const score = highscores[rawActiveLevel.id];
  const activeLevel = isActiveUnlocked
    ? BriefingParser.parseBriefing(rawActiveLevel, {
        clearCars: rawActiveLevel.winCondition?.clearCars || 0
      })
    : null;

  const renderDirectiveRow = (l: BriefingContent, variant: 'open' | 'completed') => {
    const completed = Boolean(highscores[l.id]);
    const fatalStamp = readDocketFatal(l.id) && !completed;
    const active = l.id === activeLevelId;
    const inactiveBorder =
      variant === 'completed' ? 'border-l-[#30363d] bg-[#161b22]' : 'border-l-[#c4a574] bg-[#1a1d23] hover:bg-[#222833]';
    const tabGradient =
      variant === 'completed'
        ? 'from-[#1a3020] to-[#132a1a] opacity-95'
        : 'from-[#e8d4a8] to-[#c4a574] opacity-90';
    return (
      <button
        key={l.id}
        type="button"
        onClick={() => onSelectLevel(l.id)}
        className={`relative w-full overflow-hidden border-l-4 py-2.5 pl-3 pr-24 text-left transition-colors ${
          active ? 'border-l-[#3FB950] bg-[#1a2332] ring-1 ring-[#3FB950]/35' : inactiveBorder
        }`}
      >
        <div
          className={`absolute left-0 top-0 h-full w-3 bg-gradient-to-b ${tabGradient}`}
          aria-hidden
        />
        <div className="pl-4">
          <div
            className={`text-[11px] font-bold tracking-wide ${variant === 'completed' ? 'text-[#7ee787]' : 'text-[#d29922]'}`}
          >
            {l.id}
          </div>
          <div className="mt-0.5 truncate text-[9px] text-[#8B949E]">{l.title}</div>
        </div>
        {completed && (
          <div
            className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2 rotate-[-14deg] border-[3px] border-[#238636] bg-[#3FB950]/15 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#3FB950] shadow-[0_0_12px_rgba(63,185,80,0.25)]"
            style={{ borderStyle: 'double' }}
          >
            Certified
          </div>
        )}
        {fatalStamp && (
          <div className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2 rotate-[10deg] border-2 border-[#F85149] bg-[#F85149]/20 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#F85149]">
            Fatal error
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#141821] p-4 text-[#C9D1D9] font-mono overflow-y-auto scrollbar-hide">
      <div className="mb-3 truncate border-b border-[#2D333B] pb-2 text-[10px] font-bold uppercase tracking-wider text-[#8B949E]">
        {rawActiveLevel.title}
      </div>
      <div className="mb-4 shrink-0 space-y-4">
        {openLevels.length > 0 && (
          <div>
            <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#d29922]">Open directives</div>
            <div className="space-y-2">{openLevels.map((l) => renderDirectiveRow(l, 'open'))}</div>
          </div>
        )}
        {completedLevels.length > 0 && (
          <div className={openLevels.length > 0 ? 'mt-1 border-t border-[#30363d] pt-3' : ''}>
            <button
              type="button"
              aria-expanded={!completedCollapsed}
              onClick={() => setCompletedCollapsed((c) => !c)}
              className="mb-2 flex w-full items-center justify-between gap-2 rounded border border-[#30363d] bg-[#161b22] px-2 py-2 text-left font-mono transition-colors hover:border-[#484f58] hover:bg-[#1c2128]"
            >
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#6e7681]">
                Completed ({completedLevels.length})
              </span>
              {completedCollapsed ? (
                <ChevronRight size={16} className="shrink-0 text-[#8B949E]" strokeWidth={2.25} aria-hidden />
              ) : (
                <ChevronDown size={16} className="shrink-0 text-[#8B949E]" strokeWidth={2.25} aria-hidden />
              )}
            </button>
            {!completedCollapsed && (
              <div className="max-h-[min(40vh,15rem)] space-y-2 overflow-y-auto pr-0.5 scrollbar-hide">
                {completedLevels.map((l) => renderDirectiveRow(l, 'completed'))}
              </div>
            )}
          </div>
        )}
      </div>
      {isActiveUnlocked && activeLevel && (
        <div className="relative border-2 border-[#2D333B] bg-black/50 p-4 shadow-xl">
          {score ? (
            <div className="absolute right-3 top-3 rotate-[-12deg] border-[3px] border-[#238636] bg-[#3FB950]/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#3FB950] shadow-[0_0_14px_rgba(63,185,80,0.2)]">
              Verified
            </div>
          ) : (
            <div className="absolute top-0 right-0 bg-[#F85149] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-black">Confidential</div>
          )}
          {activeLevel.bureauMemo && (
            <div className="mb-3 border border-[#d29922]/35 bg-[#d29922]/10 p-2 text-[10px] leading-snug text-[#e3c78a]">
              <span className="font-bold uppercase tracking-wider text-[#d29922]">Bureau memo — </span>
              {activeLevel.bureauMemo}
            </div>
          )}
          <div className="text-xs text-[#8B949E] mb-1 mt-1 uppercase">
            From: <span className="text-[#58A6FF]">{activeLevel.from}</span>
          </div>
          <div className="text-xs text-[#8B949E] mb-3 border-b border-[#2D333B] pb-3 uppercase">
            Subject: <span className="text-[#C9D1D9]">{activeLevel.subject}</span>
          </div>
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{activeLevel.body}</div>
          <ul className="mt-4 space-y-2 list-disc pl-5 text-[12px] text-[#3FB950]">{activeLevel.bullets.map((b, i) => (<li key={i}><span className="text-[#C9D1D9]">{b}</span></li>))}</ul>
          {score && (
            <div className="mt-6 pt-4 border-t-2 border-[#2D333B] border-dashed space-y-3">
              <Histogram
                title={METRIC.THROUGHPUT}
                value={score.secondsToClear}
                unit="s"
                color="#3FB950"
                min={10}
                max={120}
                levelId={activeLevel.id}
                dbColumn="seconds_to_clear"
                distributionLabel={bureauEfficiencyAuditLabel(BRAND.SECTOR)}
              />
              <Histogram
                title={METRIC.INSTRUCTION_COUNT}
                value={score.instructionCount}
                unit="SECT"
                color="#58A6FF"
                min={2}
                max={30}
                levelId={activeLevel.id}
                dbColumn="instruction_count"
                distributionLabel={bureauEfficiencyAuditLabel(BRAND.SECTOR)}
              />
              <Histogram
                title={METRIC.HARDWARE_COST}
                value={score.hardwareCost}
                unit="¥"
                color="#D29922"
                min={100}
                max={2000}
                levelId={activeLevel.id}
                dbColumn="hardware_cost"
                distributionLabel={bureauEfficiencyAuditLabel(BRAND.SECTOR)}
              />
            </div>
          )}
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
          </div>
        </div>
        <div className="w-full border border-[#2D333B] bg-[#12141a] bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:100%_4px] p-5 text-[11px] leading-relaxed">
          <div className="mb-4 flex justify-between border-b border-[#2D333B] pb-2 text-[10px] text-[#8B949E]">
            <span>{BRAND.REF_DOC}</span>
            <span>{APP_BUILD_VERSION}</span>
          </div>
          <p className="mb-2">1. PROTOCOL 01: Author phase-sequence logic images.</p>
          <p className="mb-2">2. PROTOCOL 02: Monitor demand and ILC-92 returns.</p>
          <p>3. PROTOCOL 03: Satisfy mandated discharge quota (municipal flow audit).</p>
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
