import React from 'react';
import { BriefingContent } from '../briefing/level1';
import { useGlobalState } from '../store/GlobalStateContext';
import { Histogram } from './Histogram';
import { CheckCircle2 } from 'lucide-react';

interface LevelSelectProps {
  levels: BriefingContent[];
  activeLevelIndex: number;
  unlockedLevels?: number[];
  onSelectLevel: (idx: number) => void;
}

export const LevelSelect: React.FC<LevelSelectProps> = ({ 
  levels, 
  activeLevelIndex, 
  unlockedLevels = [], // array of indices
  onSelectLevel 
}) => {
  const { highscores } = useGlobalState();
  const activeLevel = levels[activeLevelIndex];
  const score = activeLevel ? highscores[activeLevel.id] : null;

  return (
    <div className="flex flex-col h-full bg-[#1A1D23] p-4 text-[#C9D1D9] font-mono overflow-y-auto scrollbar-hide">
      <div className="flex gap-2 mb-4 shrink-0 overflow-x-auto pb-1">
        {levels.map((l, i) => {
          const isUnlocked = unlockedLevels.includes(i) || i === 0;
          const isCompleted = highscores[l.id];
          return (
            <button
              key={l.id}
              onClick={() => isUnlocked && onSelectLevel(i)}
              disabled={!isUnlocked}
              className={`flex-1 min-w-[60px] py-2 text-center text-[10px] font-bold border rounded-none transition-colors relative ${
                i === activeLevelIndex 
                  ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]' 
                  : isUnlocked
                    ? 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'
                    : 'bg-black/40 border-[#2D333B]/50 text-[#8B949E]/50 cursor-not-allowed'
              }`}
              title={!isUnlocked ? "LOCKED" : l.title}
            >
              {l.id}
              {isCompleted && (
                <div className="absolute -top-2 -right-2">
                  <CheckCircle2 size={14} className="text-[#3FB950] bg-[#1A1D23] rounded-full" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      {activeLevel && (
        <>
          <div className="border-2 border-[#2D333B] bg-black/40 rounded-none p-4 mb-4 shadow-xl relative shrink-0">
            {score ? (
              <div className="absolute top-0 right-0 px-2 py-0.5 bg-[#3FB950] text-[#0D0F12] text-[9px] font-bold tracking-widest flex items-center gap-1">
                <CheckCircle2 size={14} /> DIRECTIVE COMPLETED
              </div>
            ) : (
              <div className="absolute top-0 right-0 px-2 py-0.5 bg-[#F85149] text-black text-[9px] font-bold tracking-widest">
                CONFIDENTIAL
              </div>
            )}
            <div className="text-xs text-[#8B949E] mb-1 mt-2">
              FROM: <span className="text-[#58A6FF]">{activeLevel.from}</span>
            </div>
            <div className="text-xs text-[#8B949E] mb-3 border-b border-[#2D333B] pb-3">
              SUBJECT: <span className="text-[#C9D1D9]">{activeLevel.subject}</span>
            </div>
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
              {activeLevel.body}
            </div>
            <ul className="mt-4 space-y-2 list-disc pl-5 text-[12px] text-[#3FB950]">
              {activeLevel.bullets.map((b, i) => (
                <li key={i}><span className="text-[#C9D1D9]">{b}</span></li>
              ))}
            </ul>
            
            {score && (
              <div className="mt-6 pt-4 border-t-2 border-[#2D333B] border-dashed">
                <div className="text-[10px] text-[#8B949E] font-bold tracking-wider mb-4 text-center uppercase">Best Performance Metrics</div>
                <div className="space-y-3">
                  <Histogram title="THROUGHPUT" value={score.secondsToClear} unit="s" color="#3FB950" min={10} max={120} />
                  <Histogram title="INSTRUCTION COUNT" value={score.instructionCount} unit=" lines" color="#58A6FF" min={2} max={30} />
                  <Histogram title="HARDWARE COST" value={score.hardwareCost} unit=" ¥" color="#D29922" min={100} max={2000} />
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-[#2D333B] pt-3 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-[#8B949E] font-bold tracking-wider mb-1">SUCCESS CRITERIA</div>
                <div className="text-[12px] text-[#3FB950]">CLEAR {activeLevel.winCondition.clearCars} VEHICLES</div>
                {activeLevel.winCondition.minPerDirection && (
                  <div className="text-[10px] text-[#3FB950]/80 mt-1">MIN {activeLevel.winCondition.minPerDirection} PER ACTIVE DIRECTION</div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-[#8B949E] font-bold tracking-wider mb-1">FAILURE CONDITIONS</div>
                <div className="text-[12px] text-[#F85149]">VEHICLE COLLISION</div>
              </div>
            </div>
          </div>
          <div className="mt-auto shrink-0 pb-16" />
        </>
      )}
    </div>
  );
};
