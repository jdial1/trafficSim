import React, { useEffect, useRef, useState } from 'react';
import { motion, Reorder } from 'motion/react';
import { Trash2, GripVertical } from 'lucide-react';
import { LevelManager } from './LevelManager';
import { hapticTap, laneIdFromMovementTriple, getMovementIcon } from './traffic';
import { Movement } from './types';
import { ProgramCompileError } from './UI';

type Dir = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
const DIRS: Dir[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
const TURNS = ['_LEFT', '_STRAIGHT', '_RIGHT', '_ALL'] as const;
const TURN_CHIP_ICON_PX = 22;

const LANE_PREFIX: Record<Dir, string> = { NORTH: 'nb', SOUTH: 'sb', EAST: 'eb', WEST: 'wb' };

function approachKey(d: Dir): 'N' | 'S' | 'E' | 'W' {
  return d === 'NORTH' ? 'N' : d === 'SOUTH' ? 'S' : d === 'EAST' ? 'E' : 'W';
}

function isTurnClosedForDir(closedLanes: string[] | undefined, dir: Dir, turn: (typeof TURNS)[number]): boolean {
  const p = LANE_PREFIX[dir];
  if (turn === '_ALL') {
    return Boolean(closedLanes?.includes(`${p}-left`) || closedLanes?.includes(`${p}-thru`) || closedLanes?.includes(`${p}-right`));
  }
  const lane = turn === '_LEFT' ? 'left' : turn === '_STRAIGHT' ? 'thru' : 'right';
  return Boolean(closedLanes?.includes(`${p}-${lane}`));
}

function turnQuickIcon(t: (typeof TURNS)[number], size: number) {
  if (t === '_ALL') {
    return (
      <span className="inline-flex items-center justify-center gap-0.5 leading-none [&_svg]:shrink-0">
        {getMovementIcon(Movement.NORTHBOUND_LEFT, size)}
        {getMovementIcon(Movement.NORTHBOUND_STRAIGHT, size)}
        {getMovementIcon(Movement.NORTHBOUND_RIGHT, size)}
      </span>
    );
  }
  const m =
    t === '_LEFT' ? Movement.NORTHBOUND_LEFT : t === '_STRAIGHT' ? Movement.NORTHBOUND_STRAIGHT : Movement.NORTHBOUND_RIGHT;
  return getMovementIcon(m, size);
}

function movementLabelToTurnKey(movement: string): (typeof TURNS)[number] | null {
  const u = movement.toUpperCase();
  if (u === 'LEFT') return '_LEFT';
  if (u === 'STRAIGHT') return '_STRAIGHT';
  if (u === 'RIGHT') return '_RIGHT';
  if (u === 'ALL') return '_ALL';
  return null;
}

type Props = {
  programCode: string;
  setProgramCode: React.Dispatch<React.SetStateAction<string>>;
  appendPhase: () => void;
  deleteLastLine: () => void;
  activePhaseIndex?: number;
  closedLanes?: string[];
  isPlaying?: boolean;
  maxPhases?: number;
  allowYield?: boolean;
  highlightSourceLine?: number | null;
  liteChrome?: boolean;
  onMovementLaneFocus?: (laneId: string | null) => void;
  compileError?: string;
  compileErrorHelpTab?: string | null;
  onOpenCompileErrorHelp: (tab: string) => void;
  bomMeter?: React.ReactNode;
  editorQuickRef?: { body: string; attribution?: string };
};

type LineData = { 
  id: string; 
  text: string;
  sourceLine1Based?: number;
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

export function MobileEditor({ programCode, setProgramCode, appendPhase, deleteLastLine, activePhaseIndex, closedLanes, isPlaying, maxPhases, allowYield = true, highlightSourceLine, liteChrome = false, onMovementLaneFocus, compileError = '', compileErrorHelpTab = null, onOpenCompileErrorHelp, bomMeter, editorQuickRef }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [quickDir, setQuickDir] = useState<Dir | null>(null);
  const [quickTurn, setQuickTurn] = useState<(typeof TURNS)[number] | null>(null);

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
          currentBlock = { id: `block-${Math.random()}`, header: { id: `${i}-${Math.random()}`, text, sourceLine1Based: i + 1 }, lines: [], phaseIndex: pIdx };
        } else {
          currentBlock.lines.push({ id: `${i}-${Math.random()}`, text, sourceLine1Based: i + 1 });
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

  const phaseBlocksInOrder = blocks.filter(b => (b.header?.text.trim() ?? '').startsWith('phase('));
  const phaseSlotCount = phaseBlocksInOrder.length;
  const rackOverflow = maxPhases != null && phaseSlotCount > maxPhases;
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
  };

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
    const neutralMovementShell =
      'flex-1 min-w-0 flex items-center justify-center rounded border border-[#30363d] bg-[#161b22] text-[#8b949e] px-1 py-1.5';
    const neutralMovementClass = `${neutralMovementShell} font-bold uppercase tracking-wide text-[10px] sm:text-[11px] truncate`;

    if (!isHeader) {
      const groupedLine = Boolean(opts?.groupedLine);
      const isHighlighted = highlightSourceLine != null && block.lines.find(l => l.id === id)?.sourceLine1Based === highlightSourceLine;
      const triple = parseMovementCommandLine(trimmed);
      const rowShell = groupedLine
        ? `relative z-10 flex items-stretch bg-[#0d1117] ${isHighlighted ? 'ring-2 ring-[#F85149] ring-inset' : ''}`
        : `relative z-10 flex items-stretch border-2 ${isHighlighted ? 'border-[#F85149]' : 'border-[#2D333B]'} bg-[#161B22] rounded-md`;
      const innerPad = groupedLine ? 'py-2 pl-2 pr-1' : 'p-3';
      const tripleGap = groupedLine ? 'gap-1' : 'gap-1.5';
      const delBtnBorder = groupedLine ? 'border-l border-[#30363d]/55' : 'border-l-2 border-[#2D333B]';
      const srcCls = groupedLine
        ? 'flex-1 min-w-0 flex items-center justify-center rounded-sm bg-[#21262d] text-[#b1bac4] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1.5 py-1 truncate'
        : neutralSourceClass;
      const movShellGrouped =
        'flex-1 min-w-0 flex items-center justify-center rounded-sm bg-[#1c2128] text-[#8b949e] px-1.5 py-1';
      const movTextExtras = 'font-bold uppercase tracking-wide text-[10px] sm:text-[11px] truncate';
      const movCls = groupedLine ? `${movShellGrouped} ${movTextExtras}` : neutralMovementClass;
      const movClsIcon = groupedLine ? movShellGrouped : neutralMovementShell;
      const actClsGo = groupedLine
        ? 'flex-1 min-w-0 flex items-center justify-center rounded-sm bg-[#3FB950]/16 text-[#3FB950] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1.5 py-1 truncate'
        : 'flex-1 min-w-0 flex items-center justify-center rounded border border-[#3FB950]/50 bg-[#3FB950]/14 text-[#3FB950] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1 py-1.5 truncate';
      const actClsYield = groupedLine
        ? 'flex-1 min-w-0 flex items-center justify-center rounded-sm bg-[#D29922]/14 text-[#E3B341] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1.5 py-1 truncate'
        : 'flex-1 min-w-0 flex items-center justify-center rounded border border-[#D29922]/55 bg-[#D29922]/16 text-[#E3B341] font-bold uppercase tracking-wide text-[10px] sm:text-[11px] px-1 py-1.5 truncate';
      const srcLine = block.lines.find((l) => l.id === id)?.sourceLine1Based;
      const movementTurnKey = triple ? movementLabelToTurnKey(triple.movement) : null;
      return (
        <div key={id} className={groupedLine ? 'relative' : 'relative mb-2 last:mb-0'} data-source-line={srcLine}>
          <div
            className={rowShell}
            role={triple && onMovementLaneFocus ? 'button' : undefined}
            tabIndex={triple && onMovementLaneFocus ? 0 : undefined}
            onClick={() => {
              if (!triple || !onMovementLaneFocus) return;
              hapticTap();
              const lid = laneIdFromMovementTriple(triple.source, triple.movement);
              onMovementLaneFocus(lid);
            }}
          >
            <div className={`font-mono text-[11px] sm:text-xs flex-1 flex items-center overflow-hidden min-w-0 ${innerPad}`}>
              {triple ? (
                <div className={`flex flex-1 min-w-0 ${tripleGap} items-stretch`} title={trimmed}>
                  <span className={srcCls}>{triple.source}</span>
                  <span
                    className={movementTurnKey ? `${movClsIcon} [&_svg]:shrink-0` : movCls}
                    title={trimmed}
                  >
                    {movementTurnKey ? turnQuickIcon(movementTurnKey, TURN_CHIP_ICON_PX) : triple.movement}
                  </span>
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

    const isHighlightedHeader = isHeader && highlightSourceLine != null && block.header?.sourceLine1Based === highlightSourceLine;

    const headerMotionGrouped = groupedHeader
      ? `relative z-10 flex items-stretch border-0 border-b-2 ${
          isSelected
            ? isCondition
              ? 'border-b-[#D29922]/70'
              : 'border-b-[#3FB950]/55'
            : isCondition
              ? 'border-b-[#D29922]/30'
              : 'border-b-[#3FB950]/25'
        } bg-[#161B22] rounded-t-md rounded-b-none shadow-none ${isPhaseOrConditionHeader ? 'cursor-pointer' : ''} ${isHighlightedHeader ? 'ring-2 ring-[#F85149] ring-inset' : ''}`
      : '';
    const headerMotionStandalone = !groupedHeader
      ? `relative z-10 flex items-stretch border-2 ${isSelected ? 'border-[#3FB950] shadow-[0_0_15px_rgba(63,185,80,0.4)]' : 'border-[#2D333B] shadow-[0_4px_0_rgba(26,29,35,1)]'} bg-[#161B22] rounded-md ${isPhaseOrConditionHeader ? 'cursor-pointer' : ''} ${isHighlightedHeader ? 'border-[#F85149]' : ''}`
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

  const rackPhaseEmptyHint =
    Boolean(compileError) &&
    compileError.toUpperCase().includes('LOGIC_IMAGE_EMPTY') &&
    phaseSlotCount === 0;

  const focusRackPhaseSlot = (slotIndex: number) => {
    const target = phaseBlocksInOrder[slotIndex];
    if (!target) return;
    hapticTap();
    setSelectedBlockId(target.id);
    const id = target.id;
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector(`[data-rack-phase="${id}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  };

  const compileErrNode = compileError ? (
    <ProgramCompileError
      message={compileError}
      helpTab={compileErrorHelpTab}
      onOpenManualHelp={onOpenCompileErrorHelp}
      compact
    />
  ) : null;

  return (
    <div className={`flex flex-1 flex-col overflow-hidden gap-3 bg-[#0D0F12] p-2 rounded border border-[#2D333B] shadow-inner ${liteChrome ? '' : 'crt-bezel'}`}>
      {editorQuickRef && (
        <div className="shrink-0 flex items-start gap-2 bg-[#e8d4a8] p-2.5 shadow-md rotate-[-0.5deg] text-[#3d3a36] border border-[#c9b896]">
          <div className="font-sans text-[13px] font-medium leading-snug italic w-full whitespace-pre-line">
            "{editorQuickRef.body}"
            {editorQuickRef.attribution && (
              <span className="block mt-1 text-right text-[11px] font-bold not-italic">— {editorQuickRef.attribution}</span>
            )}
          </div>
        </div>
      )}
      {maxPhases != null && (
        <div className="shrink-0 rounded border border-[#30363d] bg-[#12151c] px-2 py-2 font-mono">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-[#8B949E] mb-1.5">
            <span>Relay rack</span>
            <span className={rackOverflow ? 'text-[#F85149] font-bold' : 'text-[#58A6FF]'}>
              {rackOverflow ? 'OVERFLOW' : 'OK'}
            </span>
          </div>
          <div className="flex gap-2 sm:gap-2.5 items-end justify-center px-0.5">
            {Array.from({ length: maxPhases }, (_, i) => {
              const n = i + 1;
              const filled = i < phaseSlotCount;
              const pulseFirst = rackPhaseEmptyHint && i === 0 && !filled;
              const slotShell = `min-h-[4.75rem] w-11 sm:min-h-[5.25rem] sm:w-12 rounded-md border-2 shadow-inner flex flex-col ${
                filled
                  ? 'border-[#3FB950]/60 bg-[linear-gradient(180deg,rgba(63,185,80,0.35)_0%,#161b22_45%,#0d1117_100%)]'
                  : pulseFirst
                    ? 'border-[#58A6FF] bg-[#0d1117] border-dashed opacity-100 shadow-[0_0_18px_rgba(88,166,255,0.45)] animate-pulse'
                    : 'border-[#30363d] bg-[#0d1117] border-dashed opacity-70'
              }`;
              if (filled) {
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Phase ${n}, show in editor`}
                    onClick={() => focusRackPhaseSlot(i)}
                    className={`${slotShell} cursor-pointer items-stretch p-0 text-left transition-colors hover:border-[#58A6FF]/55 hover:brightness-110 active:opacity-90`}
                  >
                    <span className="mx-auto mt-1 text-[11px] font-bold tabular-nums leading-none text-[#3FB950]">{n}</span>
                    <div className="mx-auto h-2 w-4 shrink-0 rounded-full bg-[#3FB950] shadow-[0_0_8px_#3FB950]" />
                    <div className="mx-1 mt-1.5 flex-1 min-h-[2.25rem] rounded-[3px] bg-[#21262d] border border-[#30363d]" />
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Add phase ${n}`}
                  onClick={() => {
                    hapticTap();
                    appendPhase();
                  }}
                  className={`${slotShell} cursor-pointer items-stretch p-0 text-[#8B949E] transition-colors hover:border-[#58A6FF]/55 hover:text-[#58A6FF] active:opacity-90`}
                >
                  <span className="mx-auto mt-1 text-[11px] font-bold tabular-nums leading-none text-[#6e7681]">{n}</span>
                  <div
                    className={`mx-auto h-2 w-4 shrink-0 rounded-full ${pulseFirst ? 'bg-[#58A6FF] shadow-[0_0_10px_#58A6FF]' : 'bg-[#30363d]'}`}
                  />
                  <div className="mx-1 mt-1.5 flex flex-1 min-h-0 items-center justify-center rounded-[3px] bg-[#21262d] border border-[#30363d]">
                    <span className="font-mono text-xl sm:text-2xl font-bold leading-none">+</span>
                  </div>
                </button>
              );
            })}
          </div>
          {rackOverflow && (
            <div className="mt-2 flex items-center justify-center gap-1 text-[8px] font-bold uppercase tracking-wider text-[#F85149]">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#F85149] animate-pulse shadow-[0_0_10px_#F85149]" />
              Rack overflow LED
            </div>
          )}
          {compileErrNode && <div className="mt-2">{compileErrNode}</div>}
        </div>
      )}
      {bomMeter}
      {maxPhases == null && compileErrNode && <div className="shrink-0">{compileErrNode}</div>}

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-editor-touch bg-[linear-gradient(#1A1D23_1px,transparent_1px),linear-gradient(90deg,#1A1D23_1px,transparent_1px)] bg-[size:16px_16px]"
      >
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
                  <div
                    data-rack-phase={isPhaseBlock ? block.id : undefined}
                    className={`flex flex-col overflow-hidden rounded-md border-2 bg-[#0d1117] ${groupFrame}`}
                  >
                    {renderModule(block.header!.text, block.header!.id, true, block, { groupedHeader: true })}
                    {nestedLineBox}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2" data-rack-phase={isPhaseBlock ? block.id : undefined}>
                    {block.header && renderModule(block.header.text, block.header.id, true, block)}
                    {nestedLineBox}
                  </div>
                )}
              </Reorder.Item>
            );
          })}
          <div className="h-16 shrink-0" />
        </Reorder.Group>
      </div>

      {hasPhaseBlocks && (
        <div className="flex w-full shrink-0 gap-2 pb-2 px-0.5">
          {(() => {
            const highlightStack: 'dir' | 'turn' | 'action' =
              quickDir == null ? 'dir' : quickTurn == null ? 'turn' : 'action';
            const stackShell = (active: boolean) =>
              `flex flex-1 min-w-0 flex-col gap-1 rounded-md p-1.5 border-2 transition-[box-shadow,background-color,border-color] ${
                active
                  ? 'border-[#58A6FF] bg-[#58A6FF]/10 shadow-[0_0_14px_rgba(88,166,255,0.22)]'
                  : 'border-[#30363d] bg-[#161b22]/90'
              }`;
            const btnBase =
              'w-full min-h-[40px] px-1.5 py-1.5 rounded-sm border-2 font-mono text-[9px] sm:text-[10px] font-bold tracking-wide transition-colors disabled:opacity-25 disabled:pointer-events-none';
            const btnDir = (selected: boolean) =>
              `${btnBase} ${
                selected
                  ? 'border-[#58A6FF] bg-[#58A6FF]/25 text-[#C9D1D9]'
                  : 'border-[#3d444d] bg-[#21262d] text-[#b1bac4] hover:bg-[#30363d]'
              }`;
            const btnTurn = (selected: boolean) =>
              `${btnBase} ${
                selected
                  ? 'border-[#58A6FF] bg-[#58A6FF]/20 text-[#C9D1D9]'
                  : 'border-[#30363d] bg-[#1a1f26] text-[#8b949e] hover:bg-[#21262d]'
              }`;
            return (
              <>
                <div className={stackShell(highlightStack === 'dir')}>
                  {DIRS.map((d) => {
                    const closed = LevelManager.isApproachFullyClosed(closedLanes, approachKey(d));
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={closed}
                        onClick={() => {
                          hapticTap();
                          setQuickDir(d);
                          setQuickTurn(null);
                        }}
                        className={btnDir(quickDir === d)}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div className={stackShell(highlightStack === 'turn')}>
                  {TURNS.map((t) => {
                    const title = t === '_ALL' ? 'ALL' : t.replace('_', '');
                    const disabled = quickDir == null || isTurnClosedForDir(closedLanes, quickDir, t);
                    return (
                      <button
                        key={t}
                        type="button"
                        title={title}
                        disabled={disabled}
                        onClick={() => {
                          if (quickDir == null) return;
                          hapticTap();
                          setQuickTurn(t);
                        }}
                        className={`${btnTurn(quickTurn === t)} flex items-center justify-center`}
                      >
                        {turnQuickIcon(t, TURN_CHIP_ICON_PX)}
                      </button>
                    );
                  })}
                </div>
                <div className={stackShell(highlightStack === 'action')}>
                  <button
                    type="button"
                    disabled={quickDir == null || quickTurn == null}
                    onClick={() => {
                      if (quickDir == null || quickTurn == null) return;
                      hapticTap();
                      appendRaw(`    ${quickDir}${quickTurn}.${'GO'}`);
                      setQuickDir(null);
                      setQuickTurn(null);
                    }}
                    className={`${btnBase} border-[#238636] bg-[#3FB950]/25 text-[#3FB950] hover:bg-[#3FB950]/35`}
                  >
                    .GO
                  </button>
                  <button
                    type="button"
                    disabled={quickDir == null || quickTurn == null || !allowYield}
                    onClick={() => {
                      if (quickDir == null || quickTurn == null) return;
                      hapticTap();
                      appendRaw(`    ${quickDir}${quickTurn}.${'YIELD'}`);
                      setQuickDir(null);
                      setQuickTurn(null);
                    }}
                    className={`${btnBase} border-[#a3712f] bg-[#D29922]/20 text-[#E3B341] hover:bg-[#D29922]/30`}
                  >
                    .YIELD
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}