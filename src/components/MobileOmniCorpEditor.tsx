import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';

type Dir = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
const DIRS: Dir[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
const TURNS = ['_LEFT', '_STRAIGHT', '_RIGHT', '_ALL'] as const;

type Props = {
  programCode: string;
  setProgramCode: React.Dispatch<React.SetStateAction<string>>;
  appendPhase: () => void;
  deleteLastLine: () => void;
};

type LineData = { id: string; text: string };

import { hapticTap } from '../haptics';

export function MobileOmniCorpEditor({ programCode, setProgramCode, appendPhase, deleteLastLine }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [composerPath, setComposerPath] = useState<'root' | 'movement_dir' | 'movement_turn' | 'movement_action' | 'cw_action' | 'if_dir' | 'if_turn' | 'if_gt' | 'insert_dir' | 'insert_turn' | 'insert_action'>('root');
  const [builderBase, setBuilderBase] = useState('');
  const [items, setItems] = useState<LineData[]>([]);
  
  const listRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (items.map(i => i.text).join('\n') !== programCode) {
      setItems(programCode.split('\n').map((text, i) => ({ id: `${i}-${Math.random()}`, text })));
    }
  }, [programCode]);

  const handleReorder = (newItems: LineData[]) => {
    setItems(newItems);
    setProgramCode(newItems.map(i => i.text).join('\n'));
  };

  const handleRemove = (idToRemove: string) => {
    const newItems = items.filter(i => i.id !== idToRemove);
    setItems(newItems);
    setProgramCode(newItems.map(i => i.text).join('\n'));
  };

  const handleDoubleTap = (item: LineData) => {
    // For v1, open the sheet pre-seeded for a basic command if it matches
    const t = item.text.trim();
    if (t.endsWith('.GO') || t.endsWith('.YIELD')) {
       // Simple heuristic: just open the sheet for now. 
       // In a full implementation, we'd parse and pre-fill `builderBase` and `composerPath`.
       openSheet();
    }
  };

  const openSheet = () => {
    setComposerPath('root');
    setBuilderBase('');
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
  };

  const appendRaw = (chunk: string) => {
    setProgramCode((prev) => {
      const t = prev.replace(/\s+$/, '');
      return t + (t ? '\n' : '') + chunk + '\n';
    });
    closeSheet();
  };

  const handleRootChoice = (choice: 'phase' | 'movement' | 'condition' | 'pedestrian') => {
    hapticTap();
    if (choice === 'phase') {
      appendPhase();
      closeSheet();
    } else if (choice === 'movement') {
      setComposerPath('movement_dir');
    } else if (choice === 'condition') {
      setComposerPath('if_dir');
    } else if (choice === 'pedestrian') {
      appendRaw('    EXCLUSIVE_PEDESTRIAN_PHASE.GO');
    }
  };

  const handleDir = (dir: Dir | 'CROSSWALK') => {
    hapticTap();
    if (composerPath === 'movement_dir') {
      if (dir === 'CROSSWALK') {
        setBuilderBase('CROSSWALK_');
        setComposerPath('movement_turn');
      } else {
        setBuilderBase(`${dir}`);
        setComposerPath('movement_turn');
      }
    } else if (composerPath === 'if_dir') {
      if (dir === 'CROSSWALK') return;
      setBuilderBase(`if (QUEUE.${dir}`);
      setComposerPath('if_turn');
    } else if (composerPath === 'insert_dir') {
      if (dir === 'CROSSWALK') return;
      setBuilderBase(`${dir}`);
      setComposerPath('insert_turn');
    }
  };

  const handleTurn = (turn: string) => {
    hapticTap();
    if (composerPath === 'movement_turn') {
      setBuilderBase(`${builderBase}${turn}`);
      setComposerPath('movement_action');
    } else if (composerPath === 'if_turn') {
      setBuilderBase(`${builderBase}${turn} > 10):\n    phase_insert(`);
      setComposerPath('insert_dir');
    } else if (composerPath === 'insert_turn') {
      setBuilderBase(`${builderBase}${builderBase.includes('QUEUE') ? '' : turn}`);
      setComposerPath('insert_action');
    }
  };

  const handleAction = (action: 'GO' | 'YIELD') => {
    hapticTap();
    if (composerPath === 'movement_action') {
      appendRaw(`    ${builderBase}.${action}`);
    } else if (composerPath === 'insert_action') {
      appendRaw(`${builderBase}.${action})`);
    }
  };

  const keyBase = 'min-h-[44px] px-2 py-2 rounded font-mono text-[12px] sm:text-[13px] border shadow-lg transition-all active:scale-95 flex items-center justify-center';
  const keyNeutral = 'border-[#30363D] bg-[#161B22] text-[#E6EDF3] hover:bg-[#1c232d]';
  const keyAction = 'border-[#3FB950]/60 bg-[#0d2818] text-[#56D364] font-bold';

  return (
    <div className="flex flex-1 flex-col overflow-hidden gap-2">
      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-hide border border-[#30363D] bg-[#010409] p-2 rounded">
        <Reorder.Group axis="y" values={items} onReorder={handleReorder} className="flex flex-col gap-1 min-h-full">
          {items.map((item) => {
            if (!item.text.trim()) return <div key={item.id} className="h-2" />;
            const isPhase = item.text.trim().startsWith('phase(');
            const isCondition = item.text.trim().startsWith('if ');
            return (
              <Reorder.Item key={item.id} value={item} id={item.id} className="relative">
                <div className="absolute inset-0 bg-[#da3633] flex justify-end items-center px-4 rounded z-0">
                  <Trash2 size={16} className="text-white" strokeWidth={2.25} />
                </div>
                <motion.div
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(e, info) => {
                    if (info.offset.x < -60) handleRemove(item.id);
                  }}
                  onClick={(e) => {
                    if (e.detail === 2) handleDoubleTap(item);
                  }}
                  whileDrag={{ scale: 1.02, boxShadow: '0px 10px 20px rgba(0,0,0,0.5)' }}
                  className={`relative z-10 px-3 py-2.5 font-mono text-[12px] sm:text-[13px] leading-snug rounded border ${isPhase ? 'mt-2 border-[#30363D] border-t-[3px] border-t-[#3FB950] bg-[#0d1117] text-[#f0f3f6] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' : isCondition ? 'border-[#30363D] border-l-4 border-l-[#d29922] bg-[#0d1117] text-[#f0f3f6]' : 'ml-4 border-[#30363D] border-l-[3px] border-l-[#a3712f] bg-[#161b22] text-[#e6edf3]'}`}
                >
                  {item.text.trim()}
                </motion.div>
              </Reorder.Item>
            );
          })}
          <div className="h-12 shrink-0" />
        </Reorder.Group>
      </div>

      <button
        onClick={() => { hapticTap(); openSheet(); }}
        className="w-full h-14 bg-[#3FB950]/20 text-[#3FB950] border-2 border-[#3FB950] rounded font-mono font-bold tracking-widest text-[14px] flex items-center justify-center gap-2 shrink-0 shadow-[0_0_15px_rgba(63,185,80,0.15)]"
      >
        <Plus size={18} /> ADD INSTRUCTION
      </button>

      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="absolute left-0 bottom-0 w-full z-50 bg-[#0A0C0F] border-t-2 border-[#3FB950]/40 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] pb-safe"
          >
            <div className="flex items-center justify-between border-b border-[#2D333B] px-3 py-2 bg-[#1A1D23]">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#3FB950]">TERMINAL INPUT</span>
              <button onClick={closeSheet} className="p-1 text-[#8B949E] hover:text-white"><ChevronDown size={18} /></button>
            </div>
            
            <div className="p-3 min-h-[30vh]">
              {composerPath === 'root' && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleRootChoice('phase')} className={`${keyBase} ${keyNeutral}`}>[ NEW PHASE ]</button>
                  <button onClick={() => handleRootChoice('movement')} className={`${keyBase} ${keyAction}`}>[ MOVEMENT ]</button>
                  <button onClick={() => handleRootChoice('condition')} className={`${keyBase} ${keyNeutral}`}>[ CONDITION ]</button>
                  <button onClick={() => handleRootChoice('pedestrian')} className={`${keyBase} ${keyNeutral}`}>[ PEDESTRIAN ]</button>
                  <button onClick={() => { deleteLastLine(); closeSheet(); }} className={`col-span-2 ${keyBase} border-[#F85149]/30 text-[#F85149] bg-[#F85149]/10 mt-2`}><Trash2 size={16} className="mr-2"/> DELETE LAST</button>
                </div>
              )}

              {(composerPath === 'movement_dir' || composerPath === 'if_dir' || composerPath === 'insert_dir') && (
                <div className="grid grid-cols-2 gap-2">
                  {DIRS.map(d => (
                    <button key={d} onClick={() => handleDir(d)} className={`${keyBase} ${keyNeutral}`}>[ {d} ]</button>
                  ))}
                  {composerPath === 'movement_dir' && (
                    <button onClick={() => handleDir('CROSSWALK')} className={`col-span-2 ${keyBase} border-[#D29922]/30 text-[#D29922] bg-[#D29922]/10 mt-2`}>[ CROSSWALK ]</button>
                  )}
                </div>
              )}

              {(composerPath === 'movement_turn' || composerPath === 'if_turn' || composerPath === 'insert_turn') && (
                <div className="grid grid-cols-2 gap-2">
                  {builderBase === 'CROSSWALK_' ? (
                    DIRS.map(d => (
                      <button key={d} onClick={() => handleTurn(d)} className={`${keyBase} ${keyNeutral}`}>[ {d} ]</button>
                    ))
                  ) : (
                    TURNS.map(t => (
                      <button key={t} onClick={() => handleTurn(t)} className={`${keyBase} ${keyNeutral}`}>[ {t.replace('_', '')} ]</button>
                    ))
                  )}
                </div>
              )}

              {(composerPath === 'movement_action' || composerPath === 'insert_action') && (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button onClick={() => handleAction('GO')} className={`${keyBase} border-[#3FB950] text-[#3FB950] bg-[#3FB950]/20 text-[16px] h-16`}>[ .GO ]</button>
                  <button onClick={() => handleAction('YIELD')} className={`${keyBase} border-[#D29922] text-[#D29922] bg-[#D29922]/20 text-[16px] h-16`}>[ .YIELD ]</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
