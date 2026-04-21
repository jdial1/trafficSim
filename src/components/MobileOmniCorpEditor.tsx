import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type Dir = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
type Expect =
  | { kind: 'idle' }
  | { kind: 'dir'; ctx: 'if_metric' }
  | { kind: 'turn'; ctx: 'vehicle' | 'if_metric' | 'insert'; dir: Dir }
  | { kind: 'action'; ctx: 'vehicle' | 'insert'; base: string }
  | { kind: 'cw_dir' }
  | { kind: 'cw_action'; card: Dir }
  | { kind: 'if_gt'; metric: string };

const DIRS: Dir[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
const TURNS = ['_LEFT', '_STRAIGHT', '_RIGHT'] as const;

type Props = {
  programCode: string;
  setProgramCode: React.Dispatch<React.SetStateAction<string>>;
  appendPhase: () => void;
  deleteLastLine: () => void;
};

export function MobileOmniCorpEditor({ programCode, setProgramCode, appendPhase, deleteLastLine }: Props) {
  const preRef = useRef<HTMLPreElement>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(true);
  const [expect, setExpect] = useState<Expect>({ kind: 'idle' });
  const [insertActive, setInsertActive] = useState(false);
  const insertActiveRef = useRef(false);
  const insertCommaNextRef = useRef(false);

  const setInsertActiveSynced = useCallback((v: boolean) => {
    insertActiveRef.current = v;
    setInsertActive(v);
  }, []);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [programCode]);

  const resetFlow = useCallback(() => {
    setExpect({ kind: 'idle' });
  }, []);

  const appendRaw = useCallback(
    (chunk: string) => {
      setProgramCode((prev) => prev + chunk);
    },
    [setProgramCode],
  );

  const commitMovementLine = useCallback(
    (base: string, action: 'GO' | 'YIELD') => {
      const line = `${base}.${action}`;
      const indent = '    ';
      setProgramCode((prev) => {
        if (insertActiveRef.current) {
          const prefix = insertCommaNextRef.current ? ', ' : '';
          insertCommaNextRef.current = true;
          return prev + prefix + line;
        }
        const t = prev.replace(/\s+$/, '');
        return t + (t ? '\n' : '') + indent + line + '\n';
      });
      resetFlow();
    },
    [resetFlow, setProgramCode],
  );

  const openInsert = () => {
    appendRaw('phase_insert(');
    setInsertActiveSynced(true);
    insertCommaNextRef.current = false;
  };

  const closeInsert = () => {
    appendRaw(')\n');
    setInsertActiveSynced(false);
    insertCommaNextRef.current = false;
  };

  const onPhase = () => {
    appendPhase();
    resetFlow();
  };

  const onIfStart = () => {
    if (insertActive) return;
    appendRaw('if (QUEUE.');
    setExpect({ kind: 'dir', ctx: 'if_metric' });
  };

  const onQueueGt = () => {
    if (expect.kind !== 'if_gt') return;
    appendRaw(`${expect.metric} > 10):\n    phase_insert(`);
    setInsertActiveSynced(true);
    insertCommaNextRef.current = false;
    resetFlow();
  };

  const onPhaseInsertToken = () => {
    if (insertActive) {
      closeInsert();
      resetFlow();
      return;
    }
    if (expect.kind !== 'idle') return;
    openInsert();
  };

  const onDir = (dir: Dir) => {
    if (expect.kind === 'dir' && expect.ctx === 'if_metric') {
      setExpect({ kind: 'turn', ctx: 'if_metric', dir });
      return;
    }
    if (expect.kind === 'cw_dir') {
      setExpect({ kind: 'cw_action', card: dir });
      return;
    }
    if (expect.kind === 'idle') {
      const ctx: 'vehicle' | 'insert' = insertActive ? 'insert' : 'vehicle';
      setExpect({ kind: 'turn', ctx, dir });
    }
  };

  const onTurn = (turn: (typeof TURNS)[number]) => {
    if (expect.kind !== 'turn') return;
    const suf = turn.slice(1);
    const base = `${expect.dir}_${suf}`;
    if (expect.ctx === 'if_metric') {
      setExpect({ kind: 'if_gt', metric: base });
      return;
    }
    setExpect({ kind: 'action', ctx: expect.ctx === 'insert' ? 'insert' : 'vehicle', base });
  };

  const onCrosswalkPrefix = () => {
    if (expect.kind === 'turn') return;
    if (expect.kind === 'dir') return;
    setExpect({ kind: 'cw_dir' });
  };

  const onPedestrian = () => {
    const indent = '    ';
    setProgramCode((prev) => {
      const t = prev.replace(/\s+$/, '');
      return t + (t ? '\n' : '') + indent + 'EXCLUSIVE_PEDESTRIAN_PHASE.GO\n';
    });
    resetFlow();
  };

  const onAction = (action: 'GO' | 'YIELD') => {
    if (expect.kind === 'cw_action') {
      commitMovementLine(`CROSSWALK_${expect.card}`, action);
      return;
    }
    if (expect.kind === 'action') {
      commitMovementLine(expect.base, action);
    }
  };

  const onDelete = () => {
    deleteLastLine();
    resetFlow();
  };

  const onNewline = () => {
    appendRaw('\n');
  };

  const rowWrap = 'flex flex-wrap gap-1 justify-center';
  const keyBase =
    'min-h-[36px] px-2 py-1.5 rounded-none font-mono text-[10px] sm:text-[11px] border transition-colors shrink-0';
  const keyNeutral = 'border-[#2D333B] bg-black/40 text-[#C9D1D9] active:bg-white/10';
  const keySnap = 'border-[#3FB950] bg-[#3FB950]/20 text-[#3FB950] shadow-[0_0_12px_rgba(63,185,80,0.25)]';
  const keyDim = 'border-[#2D333B]/50 bg-black/20 text-[#8B949E]/40 opacity-45 pointer-events-none';

  const snapRowDirs = expect.kind === 'dir' || expect.kind === 'cw_dir' || (expect.kind === 'idle' && insertActive);
  const snapRowTurns = expect.kind === 'turn';
  const snapRowActions = expect.kind === 'action' || expect.kind === 'cw_action';
  const snapQueueGt = expect.kind === 'if_gt';
  const crosswalkEnabled = expect.kind === 'idle' || expect.kind === 'cw_dir';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <button
        type="button"
        onClick={() => setKeyboardOpen((o) => !o)}
        className="flex w-full items-center justify-between border border-[#2D333B] bg-black/30 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[#8B949E]"
      >
        <span>SRC_BUF // tap</span>
        {keyboardOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      <div
        className="relative min-h-[28vh] flex-1 overflow-hidden border-2 border-[#2D333B] bg-[#0D1117]"
        onClick={() => setKeyboardOpen(true)}
      >
        <pre
          ref={preRef}
          className="scrollbar-hide h-full overflow-auto p-3 font-mono text-[12px] leading-relaxed whitespace-pre text-[#C9D1D9]"
        >
          {programCode}
          <span className="inline-block h-[1em] w-2 animate-pulse bg-[#3FB950]/80 align-middle" />
        </pre>
      </div>

      <AnimatePresence>
        {keyboardOpen && (
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="border-t-2 border-[#3FB950]/40 bg-[#0A0C0F] shadow-[0_-8px_32px_rgba(0,0,0,0.6)]"
          >
            <div className="border-b border-[#2D333B] px-2 py-1 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-[#3FB950]/90">
              OmniCorp Terminal Keyboard
            </div>
            <div className="max-h-[42vh] overflow-y-auto p-2 scrollbar-hide">
              <div className={`${rowWrap} mb-2`}>
                <button type="button" onClick={onPhase} className={`${keyBase} ${keyNeutral}`}>
                  phase()
                </button>
                <button
                  type="button"
                  onClick={onIfStart}
                  disabled={insertActive || expect.kind !== 'idle'}
                  className={`${keyBase} ${insertActive || expect.kind !== 'idle' ? keyDim : keyNeutral}`}
                >
                  if ()
                </button>
                <button
                  type="button"
                  onClick={onQueueGt}
                  disabled={!snapQueueGt}
                  className={`${keyBase} ${snapQueueGt ? keySnap : keyDim}`}
                >
                  QUEUE &gt;
                </button>
                <button type="button" onClick={onPhaseInsertToken} className={`${keyBase} ${keyNeutral}`}>
                  phase_insert()
                </button>
              </div>

              <div className={`${rowWrap} mb-2`}>
                {DIRS.map((d) => {
                  const offTurn = expect.kind === 'turn';
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onDir(d)}
                      disabled={offTurn}
                      className={`${keyBase} ${offTurn ? keyDim : snapRowDirs ? keySnap : keyNeutral}`}
                    >
                      {d}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={onPedestrian}
                  disabled={expect.kind !== 'idle' || insertActive}
                  className={`${keyBase} ${expect.kind === 'idle' && !insertActive ? keyNeutral : keyDim}`}
                >
                  PEDESTRIAN
                </button>
              </div>

              <div className={`${rowWrap} mb-2`}>
                {TURNS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTurn(t)}
                    disabled={!snapRowTurns}
                    className={`${keyBase} ${snapRowTurns ? keySnap : keyDim}`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onCrosswalkPrefix}
                  disabled={!crosswalkEnabled}
                  className={`${keyBase} ${expect.kind === 'cw_dir' ? keySnap : crosswalkEnabled ? keyNeutral : keyDim}`}
                >
                  CROSSWALK_
                </button>
              </div>

              <div className={rowWrap}>
                <button
                  type="button"
                  onClick={() => onAction('GO')}
                  disabled={!snapRowActions}
                  className={`${keyBase} ${snapRowActions ? keySnap : keyDim}`}
                >
                  .GO
                </button>
                <button
                  type="button"
                  onClick={() => onAction('YIELD')}
                  disabled={!snapRowActions}
                  className={`${keyBase} ${snapRowActions ? keySnap : keyDim}`}
                >
                  .YIELD
                </button>
                <button type="button" onClick={onDelete} className={`${keyBase} ${keyNeutral}`}>
                  DELETE
                </button>
                <button type="button" onClick={onNewline} className={`${keyBase} ${keyNeutral}`}>
                  NEWLINE
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
