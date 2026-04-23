import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { ChevronDown, Trash2, GripVertical, Cpu } from 'lucide-react';
import { hapticTap, hapticError } from './traffic';

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
  maxPhases?: number;
};

type LineData = { 
  id: string; 
  text: string 
};

type BlockData = {
  id: string;
  header: LineData | null;
  lines: LineData[];
  phaseIndex?: number;
};

type MovementTriple = { source: string; movement: string; action: 'GO' | 'YIELD' };

function parseMovementCommandLine(trimmed: string): MovementTriple | null {
  const m = trimmed.match(/^(.+)\.(GO|YIELD)$/i);
  if (!m) return null;
  const base = m[1].trim();
  const u = base.indexOf('_');
  if (u < 0) return null;
  return {
    source: base.slice(0, u).toUpperCase(),
    movement: base.slice(u + 1).toUpperCase(),
    action: m[2].toUpperCase() as 'GO' | 'YIELD',
  };
}

export function MobileEditor({ programCode, setProgramCode, appendPhase, deleteLastLine, activePhaseIndex, closedLanes, isPlaying, maxPhases }: Props) {
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

  const phaseBlocksInOrder = blocks.filter(b => (b.header?.text.trim() ?? '').startsWith('phase('));
  const phaseSlotCount = phaseBlocksInOrder.length;
  const rackFull = maxPhases != null && phaseSlotCount >= maxPhases;
  const hasPhaseBlocks = phaseBlocksInOrder.length > 0;
  const defaultPhaseBlockId = hasPhaseBlocks ? phaseBlocksInOrder[phaseBlocksInOrder.length - 1].id : null;
  const explicitPhaseSelection =
    Boolean(selectedBlockId) &&
    blocks.some(b => b.id === selectedBlockId && (b.header?.text.trim() ?? '').startsWith('phase('));
  const movementTargetBlockId =
    explicitPhaseSelection && selectedBlockId ? selectedBlockId : defaultPhaseBlockId;
  const phaseHeaderShowsSelected = (blockId: string) =>
    selectedBlockId === blockId || (!explicitPhaseSelection && defaultPhaseBlockId === blockId);

  const appendRaw = (chunk: string) => {
    const insertBlockId = movementTargetBlockId ?? selectedBlockId;
    if (insertBlockId) {
      const newBlocks = blocks.map(b => {
        if (b.id === insertBlockId) {
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
      if (maxPhases != null && (programCode.match(/phase\(/g) || []).length >= maxPhases) {
        hapticError();
        return;
      }
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
    else if (choice === 'movement') {
      if (!hasPhaseBlocks) return;
      setComposerPath('movement_dir');
    }
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

  const keyBase = 'relative min-h-[48px] px-2 py-2 rounded-sm font-mono text-[12px] font-bold tracking-widest border-2 flex items-center justify-center overflow-hidden';
  const keyNeutral = 'bg-[#2D333B] border-[#1A1D23] text-[#C9D1D9]';
  const keyAction = 'bg-[#3FB950] border-[#238636] text-[#0D0F12]';
  const keyDither = "after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:bg-[linear-gradient(rgba(0,0,0,0.1)_50%,transparent_50%)] after:bg-[size:100%_2px]";

  const renderModule = (text: string, id: string, isHeader: boolean, block: BlockData, opts?: { groupedHeader?: boolean; groupedLine?: boolean }) => {
    const groupedHeader = Boolean(opts?.groupedHeader);
    if (!text.trim()) return <div key={id} className="h-1" />;
    
    const isPhase = text.trim().startsWith('phase(');
    const isCondition = text.trim().startsWith('if ');
    const isPhaseOrConditionHeader = isHeader && (isPhase || isCondition);
    const showLineDelete = !isHeader;
    const showHeaderDelete = isPhaseOrConditionHeader;
    const isSelected =
      isPhaseOrConditionHeader &&
      (isCondition ? selectedBlockId === block.id : isPhase && phaseHeaderShowsSelected(block.id));
    const isActiveBlock = block.phaseIndex !== undefined && block.phaseIndex === activePhaseIndex;
    const showActiveLed = isActiveBlock && isPlaying;

    const trimmed = text.trim();
    const neutralSourceClass =
      'flex-1 min-w-0 flex items-center justify-center rounded border border-[#3d444d] bg-[#1a1f26] text-[#b1bac4] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1 py-1.5 truncate';
    const neutralMovementClass =
      'flex-1 min-w-0 flex items-center justify-center rounded border border-[#30363d] bg-[#161b22] text-[#8b949e] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1 py-1.5 truncate';

    if (!isHeader) {
      const groupedLine = Boolean(opts?.groupedLine);
      const triple = parseMovementCommandLine(trimmed);
      const rowShell = groupedLine
        ? 'relative z-10 flex items-stretch bg-[#0d1117]'
        : 'relative z-10 flex items-stretch border-2 border-[#2D333B] bg-[#161B22] rounded-md';
      const innerPad = groupedLine ? 'py-2 pl-2 pr-1' : 'p-3';
      const tripleGap = groupedLine ? 'gap-1' : 'gap-1.5';
      const delBtnBorder = groupedLine ? 'border-l border-[#30363d]/55' : 'border-l-2 border-[#2D333B]';
      const srcCls = groupedLine
        ? 'flex-1 min-w-0 flex items-center justify-center rounded-sm bg-[#21262d] text-[#b1bac4] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1.5 py-1 truncate'
        : neutralSourceClass;
      const movCls = groupedLine
        ? 'flex-1 min-w-0 flex items-center justify-center rounded-sm bg-[#1c2128] text-[#8b949e] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1.5 py-1 truncate'
        : neutralMovementClass;
      const actClsGo = groupedLine
        ? 'flex-1 min-w-0 flex items-center justify-center rounded-sm bg-[#3FB950]/16 text-[#3FB950] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1.5 py-1 truncate'
        : 'flex-1 min-w-0 flex items-center justify-center rounded border border-[#3FB950]/50 bg-[#3FB950]/14 text-[#3FB950] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1 py-1.5 truncate';
      const actClsYield = groupedLine
        ? 'flex-1 min-w-0 flex items-center justify-center rounded-sm bg-[#D29922]/14 text-[#E3B341] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1.5 py-1 truncate'
        : 'flex-1 min-w-0 flex items-center justify-center rounded border border-[#D29922]/55 bg-[#D29922]/16 text-[#E3B341] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1 py-1.5 truncate';
      return (
        <div key={id} className={groupedLine ? 'relative' : 'relative mb-2 last:mb-0'}>
          <div className={rowShell}>
            <div className={`font-mono text-[11px] sm:text-xs flex-1 flex items-center overflow-hidden min-w-0 ${innerPad}`}>
              {triple ? (
                <div className={`flex flex-1 min-w-0 ${tripleGap} items-stretch`} title={trimmed}>
                  <span className={srcCls}>{triple.source}</span>
                  <span className={movCls}>{triple.movement}</span>
                  <span className={triple.action === 'GO' ? actClsGo : actClsYield}>{triple.action}</span>
                </div>
              ) : (
                <span className="text-[#C9D1D9] truncate">{trimmed}</span>
              )}
            </div>
            {showLineDelete && (
              <button
                type="button"
                aria-label="Delete command"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveLine(block.id, id);
                }}
                className={`shrink-0 w-11 min-h-[44px] flex items-center justify-center ${delBtnBorder} bg-black/20 text-[#F85149]`}
              >
                <Trash2 size={18} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      );
    }

    const headerMotionGrouped = groupedHeader
      ? `relative z-10 flex items-stretch border-0 border-b-2 ${
          isSelected
            ? isCondition
              ? 'border-b-[#D29922]/70'
              : 'border-b-[#3FB950]/55'
            : isCondition
              ? 'border-b-[#D29922]/30'
              : 'border-b-[#3FB950]/25'
        } bg-[#161B22] rounded-t-md rounded-b-none shadow-none ${isPhaseOrConditionHeader ? 'cursor-pointer' : ''}`
      : '';
    const headerMotionStandalone = !groupedHeader
      ? `relative z-10 flex items-stretch border-2 ${isSelected ? 'border-[#3FB950] shadow-[0_0_15px_rgba(63,185,80,0.4)]' : 'border-[#2D333B] shadow-[0_4px_0_rgba(26,29,35,1)]'} bg-[#161B22] rounded-md ${isPhaseOrConditionHeader ? 'cursor-pointer' : ''}`
      : '';
    const railBorderGrouped = groupedHeader
      ? isSelected
        ? isCondition
          ? 'border-r-[#D29922]/45'
          : 'border-r-[#3FB950]/40'
        : 'border-r-[#2D333B]'
      : isSelected
        ? 'border-[#3FB950]'
        : 'border-[#2D333B]';

    return (
      <div key={id} className={`relative group ${groupedHeader ? '' : 'mb-2'}`}>
        <div className={`absolute inset-0 bg-[#F85149] flex justify-end items-center px-4 shadow-inner ${groupedHeader ? 'rounded-t-md' : 'rounded-md'}`}>
          <Trash2 size={16} className="text-[#0D0F12]" strokeWidth={2.5} />
        </div>
        
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragStart={(e) => {
            e.stopPropagation();
          }}
          onDragEnd={(e, info) => { 
            if (info.offset.x < -60 && showHeaderDelete) {
              handleRemoveBlock(block.id);
            }
          }}
          onClick={() => {
            if (isPhaseOrConditionHeader) {
              hapticTap();
              setSelectedBlockId(prev => prev === block.id ? null : block.id);
            }
          }}
          whileDrag={{ scale: 1.02, boxShadow: '0px 10px 20px rgba(0,0,0,0.5)' }}
          className={groupedHeader ? headerMotionGrouped : headerMotionStandalone}
        >
          <div className={`w-8 border-r-2 ${railBorderGrouped} flex flex-col items-center justify-between py-2 ${isSelected ? 'bg-[#3FB950]/20' : showActiveLed ? 'bg-[#3FB950]/10' : isCondition ? 'bg-[#D29922]/10' : 'bg-black/20'}`}>
            <div className={`w-2 h-2 rounded-full ${isSelected || showActiveLed ? 'bg-[#3FB950] shadow-[0_0_12px_#3FB950] animate-pulse' : isPhase ? 'bg-[#2D333B]' : isCondition ? 'bg-[#D29922] shadow-[0_0_8px_#D29922]' : 'bg-[#2D333B]'}`} />
            <GripVertical size={14} className={isSelected ? "text-[#3FB950]" : "text-[#444c56]"} />
            <div className="w-[4px] h-[4px] rounded-full bg-[#0D0F12] shadow-inner" />
          </div>

          <div className={`font-mono text-[11px] sm:text-xs flex-1 flex items-center overflow-hidden min-w-0 ${groupedHeader ? 'py-2 px-2' : 'p-3'}`}>
            <span className={`truncate ${isSelected ? 'text-[#3FB950] font-bold' : showActiveLed ? 'text-[#3FB950]' : isPhase ? 'text-[#8B949E]' : isCondition ? 'text-[#D29922]' : 'text-[#C9D1D9]'}`}>
              {isPhase ? trimmed.replace(/^phase/i, 'PHASE') : trimmed}
            </span>
          </div>

          {showHeaderDelete && (
            <button
              type="button"
              aria-label="Delete phase or block"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveBlock(block.id);
              }}
              className={`shrink-0 w-11 min-h-[44px] flex items-center justify-center bg-black/30 text-[#F85149] ${groupedHeader ? 'border-l border-[#30363d]/55' : 'border-l-2 border-[#2D333B]'}`}
            >
              <Trash2 size={18} strokeWidth={2.5} />
            </button>
          )}
        </motion.div>
      </div>
    );
  };

  const patchBayStatusLine = (() => {
    const fromPhaseHeader = (h: LineData) => h.text.trim().replace(/^phase/i, 'PHASE');
    const primaryId = explicitPhaseSelection && selectedBlockId ? selectedBlockId : defaultPhaseBlockId;
    if (primaryId) {
      const b = blocks.find(x => x.id === primaryId);
      if (b?.header?.text.trim().startsWith('phase(')) return fromPhaseHeader(b.header);
    }
    if (activePhaseIndex !== undefined) {
      const active = blocks.find(
        x => x.phaseIndex === activePhaseIndex && x.header?.text.trim().startsWith('phase(')
      );
      if (active?.header) return fromPhaseHeader(active.header);
    }
    return 'PATCH BAY ACTIVE';
  })();

  return (
    <div className="flex flex-1 flex-col overflow-hidden gap-3 bg-[#0D0F12] p-2 rounded border border-[#2D333B] shadow-inner crt-bezel">
      {maxPhases != null && (
        <div className="shrink-0 rounded border border-[#30363d] bg-[#12151c] px-2 py-2 font-mono">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-[#8B949E] mb-1.5">
            <span>Relay rack</span>
            <span className={rackFull ? 'text-[#F85149] font-bold' : 'text-[#58A6FF]'}>
              {rackFull ? 'OVERFLOW' : 'OK'}
            </span>
          </div>
          <div className="flex gap-1.5 items-end justify-center">
            {Array.from({ length: maxPhases }, (_, i) => {
              const filled = i < phaseSlotCount;
              return (
                <div
                  key={i}
                  className={`h-14 w-7 rounded-sm border-2 shadow-inner ${
                    filled
                      ? 'border-[#3FB950]/60 bg-[linear-gradient(180deg,rgba(63,185,80,0.35)_0%,#161b22_45%,#0d1117_100%)]'
                      : 'border-[#30363d] bg-[#0d1117] border-dashed opacity-70'
                  }`}
                >
                  <div className={`mx-auto mt-1 h-1.5 w-3 rounded-full ${filled ? 'bg-[#3FB950] shadow-[0_0_8px_#3FB950]' : 'bg-[#30363d]'}`} />
                  <div className="mx-0.5 mt-2 h-6 rounded-[2px] bg-[#21262d] border border-[#30363d]" />
                </div>
              );
            })}
          </div>
          {rackFull && (
            <div className="mt-2 flex items-center justify-center gap-1 text-[8px] font-bold uppercase tracking-wider text-[#F85149]">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#F85149] animate-pulse shadow-[0_0_10px_#F85149]" />
              Rack overflow LED
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-editor-touch bg-[linear-gradient(#1A1D23_1px,transparent_1px),linear-gradient(90deg,#1A1D23_1px,transparent_1px)] bg-[size:16px_16px]">
        <Reorder.Group axis="y" values={blocks} onReorder={handleReorderBlocks} className="flex flex-col gap-2 min-h-full p-2">
          {blocks.map((block) => {
            const headerTrim = block.header?.text.trim() ?? '';
            const isPhaseBlock = headerTrim.startsWith('phase(');
            const isConditionBlock = headerTrim.startsWith('if ');
            const chainGrouped =
              Boolean(block.header) && block.lines.length > 0 && (isPhaseBlock || isConditionBlock);
            const headerSelected =
              chainGrouped &&
              (isConditionBlock ? selectedBlockId === block.id : isPhaseBlock && phaseHeaderShowsSelected(block.id));
            const groupFrame = isPhaseBlock
              ? headerSelected
                ? 'border-[#3FB950] shadow-[0_0_15px_rgba(63,185,80,0.35)]'
                : 'border-[#3FB950]/35'
              : isConditionBlock
                ? headerSelected
                  ? 'border-[#D29922] shadow-[0_0_12px_rgba(210,153,34,0.22)]'
                  : 'border-[#D29922]/40'
                : '';
            const lineCells = block.lines.map((line) =>
              renderModule(line.text, line.id, false, block, chainGrouped ? { groupedLine: true } : undefined)
            );
            const nestedLineBox =
              block.header && block.lines.length > 0 ? (
                chainGrouped ? (
                  <div className="divide-y divide-[#30363d]/45">{lineCells}</div>
                ) : (
                  <div
                    className={
                      isPhaseBlock
                        ? 'rounded-md border border-[#3FB950]/20 bg-[#0d1117]/95 p-2'
                        : isConditionBlock
                          ? 'rounded-md border border-[#D29922]/25 bg-[#0d1117]/95 p-2'
                          : 'rounded-md border border-[#2D333B] bg-[#0d1117]/95 p-2'
                    }
                  >
                    {lineCells}
                  </div>
                )
              ) : (
                lineCells
              );
            return (
              <Reorder.Item
                key={block.id}
                value={block}
                id={block.id}
                className={`relative flex flex-col ${chainGrouped ? '' : 'gap-2'}`}
              >
                {chainGrouped ? (
                  <div className={`flex flex-col overflow-hidden rounded-md border-2 bg-[#0d1117] ${groupFrame}`}>
                    {renderModule(block.header!.text, block.header!.id, true, block, { groupedHeader: true })}
                    {nestedLineBox}
                  </div>
                ) : (
                  <>
                    {block.header && renderModule(block.header.text, block.header.id, true, block)}
                    {nestedLineBox}
                  </>
                )}
              </Reorder.Item>
            );
          })}
          <div className="h-16 shrink-0" />
        </Reorder.Group>
      </div>

      {/* Add Instruction Button (Styled like a heavy physical button) */}
      <button
        onClick={() => { hapticTap(); openSheet(); }}
        className="w-full h-14 bg-[#1A1D23] text-[#C9D1D9] border-2 border-[#444c56] rounded font-mono font-bold tracking-widest text-[14px] flex items-center justify-center gap-2 shrink-0"
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
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9D1D9]">{patchBayStatusLine}</span>
              </div>
              <button type="button" onClick={closeSheet} className="text-[#8B949E]"><ChevronDown size={24} /></button>
            </div>
            
            <div className="p-4 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjMEEwQzBGIj48L3JlY3Q+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMxQTFEMjMiPjwvcmVjdD4KPC9zdmc+')] min-h-[35vh]">
              {composerPath === 'root' && (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => handleRootChoice('phase')} className={`${keyBase} ${keyNeutral}`}>[ TRIGGER: PHASE ]</button>
                  <button
                    type="button"
                    onClick={() => handleRootChoice('movement')}
                    disabled={!hasPhaseBlocks}
                    className={`${keyBase} ${hasPhaseBlocks ? `${keyAction} ${keyDither}` : `${keyNeutral} pointer-events-none opacity-50`}`}
                  >
                    [ ROUTE: MOVEMENT ]
                  </button>
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
                  <button type="button" onClick={() => handleAction('GO')} className={`${keyBase} bg-[#3FB950] border-[#238636] text-[#0D0F12] text-[16px] h-20`}>[ .GO ]</button>
                  <button type="button" onClick={() => handleAction('YIELD')} className={`${keyBase} bg-[#D29922] border-[#a3712f] text-[#0D0F12] text-[16px] h-20`}>[ .YIELD ]</button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}