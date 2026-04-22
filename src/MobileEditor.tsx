import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { ChevronDown, Plus, Trash2, GripVertical, Cpu } from 'lucide-react';
import { hapticTap } from './traffic';

type Dir = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
const DIRS: Dir[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
const TURNS = ['_LEFT', '_STRAIGHT', '_RIGHT', '_ALL'] as const;

type Props = {
  programCode: string;
  setProgramCode: React.Dispatch<React.SetStateAction<string>>;
  appendPhase: () => void;
  deleteLastLine: () => void;
  activePhaseIndex?: number;
  closedLanes?: string[];
  isPlaying?: boolean;
};

type LineData = { id: string; text: string };
type BlockData = {
  id: string;
  header: LineData | null;
  lines: LineData[];
  phaseIndex?: number;
};

export function MobileEditor({ programCode, setProgramCode, appendPhase, deleteLastLine, activePhaseIndex, closedLanes, isPlaying }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [composerPath, setComposerPath] = useState<'root' | 'movement_dir' | 'movement_turn' | 'movement_action' | 'cw_action' | 'if_dir' | 'if_turn' | 'if_gt' | 'insert_dir' | 'insert_turn' | 'insert_action'>('root');
  const [builderBase, setBuilderBase] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockData[]>([]);

  const closedDirections = new Set<string>();
  if (closedLanes) {
    closedLanes.forEach(laneId => {
      if (laneId.startsWith('nb-')) closedDirections.add('NORTH');
      if (laneId.startsWith('sb-')) closedDirections.add('SOUTH');
      if (laneId.startsWith('eb-')) closedDirections.add('EAST');
      if (laneId.startsWith('wb-')) closedDirections.add('WEST');
    });
  }

  useEffect(() => {
    setBlocks((prevBlocks) => {
      const currentCode = prevBlocks.map(b => {
        const parts = [];
        if (b.header) parts.push(b.header.text);
        b.lines.forEach(l => parts.push(l.text));
        return parts.join('\n');
      }).join('\n');

      if (currentCode === programCode) {
        return prevBlocks;
      }

      const lines = programCode.split('\n');
      const newBlocks: BlockData[] = [];
      let currentBlock: BlockData = { id: `block-${Math.random()}`, header: null, lines: [] };
      let phaseCounter = 0;

      lines.forEach((text, i) => {
        const trimmed = text.trim();
        if (trimmed.startsWith('phase(') || trimmed.startsWith('if ')) {
          if (currentBlock.header || currentBlock.lines.length > 0) {
            newBlocks.push(currentBlock);
          }
          let pIdx = undefined;
          if (trimmed.startsWith('phase(')) {
            pIdx = phaseCounter++;
          }
          currentBlock = { id: `block-${Math.random()}`, header: { id: `${i}-${Math.random()}`, text }, lines: [], phaseIndex: pIdx };
        } else {
          currentBlock.lines.push({ id: `${i}-${Math.random()}`, text });
        }
      });
      if (currentBlock.header || currentBlock.lines.length > 0) {
        newBlocks.push(currentBlock);
      }
      return newBlocks;
    });
  }, [programCode]);

  const handleReorderBlocks = (newBlocks: BlockData[]) => {
    setBlocks(newBlocks);
    const newCode = newBlocks.map(b => {
      const parts = [];
      if (b.header) parts.push(b.header.text);
      b.lines.forEach(l => parts.push(l.text));
      return parts.join('\n');
    }).join('\n');
    setProgramCode(newCode);
  };

  const handleRemoveBlock = (blockId: string) => {
    hapticTap();
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    const newBlocks = blocks.filter(b => b.id !== blockId);
    setBlocks(newBlocks);
    const newCode = newBlocks.map(b => {
      const parts = [];
      if (b.header) parts.push(b.header.text);
      b.lines.forEach(l => parts.push(l.text));
      return parts.join('\n');
    }).join('\n');
    setProgramCode(newCode);
  };

  const handleRemoveLine = (blockId: string, lineId: string) => {
    hapticTap();
    const newBlocks = blocks.map(b => {
      if (b.id === blockId) {
        return { ...b, lines: b.lines.filter(l => l.id !== lineId) };
      }
      return b;
    });
    setBlocks(newBlocks);
    const newCode = newBlocks.map(b => {
      const parts = [];
      if (b.header) parts.push(b.header.text);
      b.lines.forEach(l => parts.push(l.text));
      return parts.join('\n');
    }).join('\n');
    setProgramCode(newCode);
  };

  const openSheet = () => {
    setComposerPath('root');
    setBuilderBase('');
    setSheetOpen(true);
  };

  const closeSheet = () => setSheetOpen(false);

  const appendRaw = (chunk: string) => {
    if (selectedBlockId) {
      const newBlocks = blocks.map(b => {
        if (b.id === selectedBlockId) {
          return { ...b, lines: [...b.lines, { id: `line-${Math.random()}`, text: chunk }] };
        }
        return b;
      });
      const newCode = newBlocks.map(b => {
        const parts = [];
        if (b.header) parts.push(b.header.text);
        b.lines.forEach(l => parts.push(l.text));
        return parts.join('\n');
      }).join('\n');
      setProgramCode(newCode);
    } else {
      setProgramCode((prev) => {
        const t = prev.replace(/\s+$/, '');
        return t + (t ? '\n' : '') + chunk + '\n';
      });
    }
    closeSheet();
  };

  const handleRootChoice = (choice: 'phase' | 'movement' | 'condition' | 'pedestrian') => {
    hapticTap();
    if (choice === 'phase') {
      if (selectedBlockId) {
        const selectedIdx = blocks.findIndex(b => b.id === selectedBlockId);
        if (selectedIdx !== -1) {
          const nextPhaseNum = (programCode.match(/phase\(/g) || []).length + 1;
          const newPhaseBlock: BlockData = {
            id: `block-${Math.random()}`,
            header: { id: `header-${Math.random()}`, text: `phase(${nextPhaseNum}):` },
            lines: [],
            phaseIndex: nextPhaseNum - 1
          };
          const newBlocks = [...blocks];
          newBlocks.splice(selectedIdx + 1, 0, newPhaseBlock);
          
          const newCode = newBlocks.map(b => {
            const parts = [];
            if (b.header) parts.push(b.header.text);
            b.lines.forEach(l => parts.push(l.text));
            return parts.join('\n');
          }).join('\n');
          setProgramCode(newCode);
          setSelectedBlockId(newPhaseBlock.id);
        }
      } else {
        appendPhase();
      }
      closeSheet();
    }
    else if (choice === 'movement') setComposerPath('movement_dir');
    else if (choice === 'condition') setComposerPath('if_dir');
    else if (choice === 'pedestrian') appendRaw('    EXCLUSIVE_PEDESTRIAN_PHASE.GO');
  };

  const handleDir = (dir: Dir | 'CROSSWALK') => {
    hapticTap();
    if (composerPath === 'movement_dir') {
      setBuilderBase(dir === 'CROSSWALK' ? 'CROSSWALK_' : `${dir}`);
      setComposerPath('movement_turn');
    } else if (composerPath === 'if_dir') {
      if (dir !== 'CROSSWALK') {
        setBuilderBase(`if (QUEUE.${dir}`);
        setComposerPath('if_turn');
      }
    } else if (composerPath === 'insert_dir') {
      if (dir !== 'CROSSWALK') {
        setBuilderBase(`${dir}`);
        setComposerPath('insert_turn');
      }
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
    if (composerPath === 'movement_action') appendRaw(`    ${builderBase}.${action}`);
    else if (composerPath === 'insert_action') appendRaw(`${builderBase}.${action})`);
  };

  const keyBase = 'relative min-h-[48px] px-2 py-2 rounded-sm font-mono text-[12px] font-bold tracking-widest border-b-4 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center overflow-hidden';
  const keyNeutral = 'bg-[#2D333B] border-[#1A1D23] text-[#C9D1D9] hover:bg-[#3e4550]';
  const keyAction = 'bg-[#3FB950] border-[#238636] text-[#0D0F12] shadow-[0_0_15px_rgba(63,185,80,0.2)]';
  const keyDither = "after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:bg-[linear-gradient(rgba(0,0,0,0.1)_50%,transparent_50%)] after:bg-[size:100%_2px]";

  const renderModule = (text: string, id: string, isHeader: boolean, block: BlockData) => {
    if (!text.trim()) return <div key={id} className="h-1" />;
    
    const isPhase = text.trim().startsWith('phase(');
    const isCondition = text.trim().startsWith('if ');
    const isSelected = isHeader && (isPhase || isCondition) && selectedBlockId === block.id;
    const isActiveBlock = block.phaseIndex !== undefined && block.phaseIndex === activePhaseIndex;
    const showActiveLed = isActiveBlock && isPlaying;
    
    const activeColor = '#3FB950'; // Green for active phase
    const inactiveColor = '#2D333B';
    const phaseColor = '#3FB950';
    const conditionColor = '#D29922';
    
    return (
      <div key={id} className={`relative group ${!isHeader && block.header ? 'ml-6' : ''} mb-2`}>
        {/* Delete Background Reveal */}
        <div className="absolute inset-0 bg-[#F85149] flex justify-end items-center px-4 rounded-md shadow-inner">
          <Trash2 size={16} className="text-[#0D0F12]" strokeWidth={2.5} />
        </div>
        
        {/* Physical Module Block */}
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragStart={(e) => {
            // Prevent triggering the vertical reorder drag when dragging to delete
            e.stopPropagation();
          }}
          onDragEnd={(e, info) => { 
            if (info.offset.x < -60) {
              if (isHeader) handleRemoveBlock(block.id);
              else handleRemoveLine(block.id, id);
            }
          }}
          onClick={() => {
            if (isHeader && (isPhase || isCondition)) {
              hapticTap();
              setSelectedBlockId(prev => prev === block.id ? null : block.id);
            }
          }}
          whileDrag={{ scale: 1.02, boxShadow: '0px 10px 20px rgba(0,0,0,0.5)' }}
          className={`relative z-10 flex items-stretch border-2 ${isSelected ? 'border-[#3FB950] shadow-[0_0_15px_rgba(63,185,80,0.4)]' : 'border-[#2D333B] shadow-[0_4px_0_rgba(26,29,35,1)]'} bg-[#161B22] rounded-md hover:translate-y-[2px] transition-all ${isHeader && (isPhase || isCondition) ? 'cursor-pointer' : ''}`}
        >
          {/* Grip / Status LED */}
          <div className={`w-8 border-r-2 ${isSelected ? 'border-[#3FB950]' : 'border-[#2D333B]'} flex flex-col items-center justify-between py-2 ${isSelected ? 'bg-[#3FB950]/20' : showActiveLed ? 'bg-[#3FB950]/10' : isCondition ? 'bg-[#D29922]/10' : 'bg-black/20'}`}>
            <div className={`w-2 h-2 rounded-full ${isSelected || showActiveLed ? 'bg-[#3FB950] shadow-[0_0_12px_#3FB950] animate-pulse' : isPhase ? 'bg-[#2D333B]' : isCondition ? 'bg-[#D29922] shadow-[0_0_8px_#D29922]' : 'bg-[#2D333B]'}`} />
            <GripVertical size={14} className={isSelected ? "text-[#3FB950]" : "text-[#444c56]"} />
            <div className="w-[4px] h-[4px] rounded-full bg-[#0D0F12] shadow-inner" /> {/* Fake Screw */}
          </div>

          {/* Code Screen */}
          <div className="p-3 font-mono text-[11px] sm:text-xs flex-1 flex items-center justify-between overflow-hidden">
            <span className={`truncate ${isSelected ? 'text-[#3FB950] font-bold' : showActiveLed ? 'text-[#3FB950]' : isPhase ? 'text-[#8B949E]' : isCondition ? 'text-[#D29922]' : 'text-[#C9D1D9]'}`}>
              {text.trim()}
            </span>
            <div className="shrink-0 ml-2 flex items-center gap-1">
              {text.includes('.GO') && <span className="text-[9px] bg-[#3FB950]/20 text-[#3FB950] px-1 rounded border border-[#3FB950]/40">ACTV</span>}
              {text.includes('.YIELD') && <span className="text-[9px] bg-[#D29922]/20 text-[#D29922] px-1 rounded border border-[#D29922]/40">YLD</span>}
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden gap-3 bg-[#0D0F12] p-2 rounded border border-[#2D333B] shadow-inner crt-bezel">
      
      {/* Hardware Logic Board */}
      <div className="flex-1 overflow-y-auto scrollbar-hide bg-[linear-gradient(#1A1D23_1px,transparent_1px),linear-gradient(90deg,#1A1D23_1px,transparent_1px)] bg-[size:16px_16px]">
        <Reorder.Group axis="y" values={blocks} onReorder={handleReorderBlocks} className="flex flex-col gap-2 min-h-full p-2">
          {blocks.map((block) => (
            <Reorder.Item key={block.id} value={block} id={block.id} className="relative flex flex-col">
              {block.header && renderModule(block.header.text, block.header.id, true, block)}
              {block.lines.map(line => renderModule(line.text, line.id, false, block))}
            </Reorder.Item>
          ))}
          <div className="h-16 shrink-0" />
        </Reorder.Group>
      </div>

      {/* Add Instruction Button (Styled like a heavy physical button) */}
      <button
        onClick={() => { hapticTap(); openSheet(); }}
        className="w-full h-14 bg-[#1A1D23] text-[#C9D1D9] border-t-2 border-l-2 border-[#444c56] border-b-4 border-r-4 border-black rounded font-mono font-bold tracking-widest text-[14px] flex items-center justify-center gap-2 shrink-0 active:translate-y-1 active:border-b-2 active:border-r-2 transition-all"
      >
        <Cpu size={18} className="text-[#58A6FF]" /> [ WIRE NEW MODULE ]
      </button>

      {/* Diegetic Terminal Sheet */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="absolute left-0 bottom-0 w-full z-50 bg-[#0A0C0F] border-t-4 border-[#3FB950] shadow-[0_-10px_40px_rgba(0,0,0,0.9)] pb-safe"
          >
            <div className="flex items-center justify-between border-b-2 border-[#2D333B] px-4 py-3 bg-[#1A1D23]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#3FB950] animate-pulse rounded-sm" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9D1D9]">PATCH BAY ACTIVE</span>
              </div>
              <button onClick={closeSheet} className="text-[#8B949E] hover:text-[#F85149] transition-colors"><ChevronDown size={24} /></button>
            </div>
            
            <div className="p-4 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjMEEwQzBGIj48L3JlY3Q+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMxQTFEMjMiPjwvcmVjdD4KPC9zdmc+')] min-h-[35vh]">
              {composerPath === 'root' && (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => handleRootChoice('phase')} className={`${keyBase} ${keyNeutral}`}>[ TRIGGER: PHASE ]</button>
                  <button onClick={() => handleRootChoice('movement')} className={`${keyBase} ${keyAction} ${keyDither}`}>[ ROUTE: MOVEMENT ]</button>
                  <button onClick={() => handleRootChoice('condition')} className={`${keyBase} ${keyNeutral} ${keyDither} pointer-events-none opacity-50`}>[ SENSOR: IF_QUEUE ]</button>
                  <button onClick={() => handleRootChoice('pedestrian')} className={`${keyBase} ${keyNeutral} ${keyDither} pointer-events-none opacity-50`}>[ ROUTE: PEDESTRIAN ]</button>
                </div>
              )}
              {/* ... The rest of the builder options remain functionally the same, but use the updated keyBase styling ... */}
              {(composerPath === 'movement_dir' || composerPath === 'if_dir' || composerPath === 'insert_dir') && (
                <div className="grid grid-cols-2 gap-3">
                  {DIRS.map(d => {
                    const isClosed = closedDirections.has(d);
                    return (
                      <button 
                        key={d} 
                        onClick={() => !isClosed && handleDir(d)} 
                        className={`${keyBase} ${keyNeutral} ${composerPath === 'if_dir' && !isClosed ? `${keyDither} pointer-events-none opacity-50` : composerPath === 'movement_dir' && !isClosed ? keyDither : ''} ${isClosed ? 'opacity-20 grayscale pointer-events-none' : ''}`}
                      >
                        [ {d} ]
                      </button>
                    );
                  })}
                  {composerPath === 'movement_dir' && (
                    <button 
                      onClick={() => closedDirections.size === 0 && handleDir('CROSSWALK')} 
                      className={`col-span-2 ${keyBase} bg-[#D29922]/20 border-[#D29922]/50 text-[#D29922] mt-2 ${closedDirections.size > 0 ? 'opacity-20 grayscale pointer-events-none' : ''} ${keyDither}`}
                    >
                      [ CROSSWALK ]
                    </button>
                  )}
                </div>
              )}
              {(composerPath === 'movement_turn' || composerPath === 'if_turn' || composerPath === 'insert_turn') && (
                <div className="grid grid-cols-2 gap-3">
                  {builderBase === 'CROSSWALK_' ? (
                    DIRS.map(d => {
                      const isClosed = closedDirections.has(d);
                      return (
                        <button 
                          key={d} 
                          onClick={() => !isClosed && handleTurn(d)} 
                          className={`${keyBase} ${keyNeutral} ${isClosed ? 'opacity-20 grayscale pointer-events-none' : ''}`}
                        >
                          [ {d} ]
                        </button>
                      );
                    })
                  ) : (
                    TURNS.map(t => (
                      <button key={t} onClick={() => handleTurn(t)} className={`${keyBase} ${keyNeutral}`}>[ {t.replace('_', '')} ]</button>
                    ))
                  )}
                </div>
              )}
              {(composerPath === 'movement_action' || composerPath === 'insert_action') && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <button onClick={() => handleAction('GO')} className={`${keyBase} bg-[#3FB950] border-[#238636] text-[#0D0F12] text-[16px] h-20 shadow-[0_0_20px_rgba(63,185,80,0.3)]`}>[ .GO ]</button>
                  <button onClick={() => handleAction('YIELD')} className={`${keyBase} bg-[#D29922] border-[#a3712f] text-[#0D0F12] text-[16px] h-20 shadow-[0_0_20px_rgba(210,153,34,0.3)]`}>[ .YIELD ]</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}