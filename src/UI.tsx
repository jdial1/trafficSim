import React from 'react';
import { BRAND, bureauEfficiencyAuditLabel, METRIC, getMetricTier } from './branding';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronRight, AlertTriangle, RotateCcw, Pause, Play, CircleHelp } from 'lucide-react';
import { Vehicle, Movement, LogEntry } from './types';
import { CrashInfo } from './IntersectionEngine';
import { LANES, LANE_MAP } from './constants';
import { formatTransitUnitTag, hapticHeavy, hapticError, hapticTap, DIRECTIONS, getDirection, getMovementIcon, MovementLabels } from './traffic';
import { Histogram } from './CoreComponents';
import { Phase, PhaseCommand } from './interpreter';
import { translateCompilerError } from './manualAppendix';

export const industrialKeyClass =
  'rounded-none border-2 border-b-[3px] border-[#2D333B] bg-[#161B22] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] font-mono font-bold uppercase tracking-wider transition-colors active:translate-y-px active:border-b-2 active:shadow-inner';

export const IndustrialPanelKey = ({
  children,
  className = '',
  ...props
}: React.ComponentProps<'button'>) => (
  <button type="button" className={`${industrialKeyClass} ${className}`.trim()} {...props}>
    {children}
  </button>
);

export const CrashModal = ({
  info,
  onResetAndEdit,
}: {
  info: CrashInfo;
  onResetAndEdit: () => void;
}) => {
  const isGridlock = info.type === 'OVERFLOW';
  const isOverheat = info.type === 'OVERHEAT';
  
  const title = isGridlock ? 'GRIDLOCK_DETECTED' : isOverheat ? 'THERMAL_SHUNT_TRIP' : 'KINETIC_OVERLAP_EXCEPTION';
  const errorCode = isGridlock ? 'ERROR_0x94' : isOverheat ? 'ERROR_0xAF' : 'ERROR_0x82';
  const fatalLine = isGridlock
    ? 'FATAL: APPROACH GRIDLOCK SATURATION (0x94).'
    : isOverheat
    ? 'FATAL: RELAY THERMAL RUNAWAY (0xAF).'
    : 'FATAL: KINETIC OVERLAP (0x82).';
  const mainHeading = isGridlock ? 'GRIDLOCK SATURATION HALT' : isOverheat ? 'THERMAL SHUNT TRIP' : 'KINETIC OVERLAP LATCH';
  
  const formatMovement = (laneId: string) => {
    const lane = LANE_MAP.get(laneId);
    return lane ? MovementLabels[lane.movement] : laneId;
  };
  const plainEnglishCollision = !isGridlock && !isOverheat && info.laneA && info.laneB ? `CRASH (0x82): ${formatMovement(info.laneA)} and ${formatMovement(info.laneB)} collided.` : '';
  const description = isGridlock 
    ? 'Upstream approach gridlock exceeded guard depth. CRITICAL_HALT asserted to prevent yard cascade.'
    : isOverheat
    ? 'Programmed green sum exceeds OGAS synchronization envelope. Thermal shunt opened; lamp bus frozen.\n\nREMEDIATION: Add a relay bank with + PHASE or phase(n):, move part of the .GO workload into that block, then shorten PHASE DURATION sliders until the green sum is inside the envelope.'
    : `${plainEnglishCollision}\nUnits ${info.vehicleIds.map(formatTransitUnitTag).join(' & ')} co-registered in conflict plane at grid [${info.x.toFixed(0)}, ${info.y.toFixed(0)}]. Form 9 incident record queued.`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[60] flex items-end sm:items-center justify-center bg-red-900/10 sm:bg-red-900/40 backdrop-blur-[1px] sm:backdrop-blur-sm p-4 pointer-events-none">
      <motion.div initial={{ scale: 0.94, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="w-full max-w-md rounded-none border-2 border-[#F85149] bg-[#0D0F12] shadow-[0_0_30px_rgba(248,81,73,0.15)] overflow-hidden font-mono pointer-events-auto mb-16 sm:mb-0">
        <div className="bg-[#F85149] text-black px-4 py-2 font-bold tracking-widest text-sm flex justify-between">
          <span>{title}</span>
          <span>{errorCode}</span>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
              <div className="bg-[#F85149]/10 p-3 border border-[#F85149]/30">
                  <AlertTriangle className="text-[#F85149]" size={32} />
              </div>
              <div>
                  <h2 className="text-[#F85149] text-xl font-bold tracking-wider uppercase">{mainHeading}</h2>
                  <p className="text-[#C9D1D9] text-[12px] leading-tight mt-1 font-bold tracking-wide">{fatalLine}</p>
                  <p className="text-[#8B949E] text-[12px] leading-tight mt-1 whitespace-pre-line">{description}</p>
              </div>
          </div>
          
          <div className="bg-black/40 border border-[#2D333B] p-4 mb-6 space-y-3">
              <div className="flex justify-between text-[10px]">
                  <span className="text-[#8B949E]">LOC_A:</span>
                  <span className="text-[#C9D1D9]">{info.laneA || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                  <span className="text-[#8B949E]">LOC_B:</span>
                  <span className="text-[#C9D1D9]">{info.laneB || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                  <span className="text-[#8B949E]">STATUS:</span>
                  <span className="text-[#F85149] animate-pulse font-bold">CRITICAL_HALT</span>
              </div>

              {isGridlock && info.laneCongestion && (
                <div className="mt-4 pt-3 border-t border-[#2D333B]/50">
                  <div className="text-[9px] text-[#8B949E] uppercase tracking-widest mb-2 font-bold">Gridlock depth snapshot</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(info.laneCongestion)
                      .filter(([_, q]) => q > 0)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 6)
                      .map(([laneId, q]) => (
                        <div key={laneId} className="flex justify-between text-[9px] border-b border-white/5 pb-0.5">
                          <span className="text-[#C9D1D9]">{laneId.replace(/-/g, '_').toUpperCase()}</span>
                          <span className={q > 12 ? 'text-[#F85149] font-bold' : 'text-[#D29922]'}>{q}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
          </div>

          <div className="flex flex-col gap-2">
              <IndustrialPanelKey onClick={onResetAndEdit} className="w-full border-[#F85149]/70 bg-[#F85149]/15 py-3 text-xs text-[#F85149] hover:bg-[#F85149]/25 flex items-center justify-center gap-2">
                  <RotateCcw size={16}/> CLEAR & REVIEW LOGIC
              </IndustrialPanelKey>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const BadgeView = React.memo(({ phases, currentPhase }: { phases: Phase[], currentPhase: number }) => {
  return (
    <div className="flex flex-col gap-3 py-1">
      {phases.map((phase, i) => {
        const isActive = i === (currentPhase % phases.length);
        const groupedCommands = phase.commands.reduce((acc, cmd) => {
          const m = cmd.target;
          const dir = getDirection(m);
          if (!acc[dir]) acc[dir] = [];
          acc[dir].push(cmd);
          return acc;
        }, {} as Record<string, PhaseCommand[]>);

        return (
          <div 
            key={i} 
            className={`p-2 rounded border transition-all ${isActive ? 'border-[#30363D] border-t-[3px] border-t-[#3FB950] bg-[#0d1117] ring-1 ring-[#3FB950]/15' : 'border-[#30363D] bg-[#0d1117]'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-mono font-bold tracking-wider ${isActive ? 'text-[#f0f3f6]' : 'text-[#e6edf3]'}`}>
                {phase.label.startsWith('PHASE_') ? `TRB-${phase.label.slice(6)}` : phase.label}
              </span>
              {isActive && (
                <span className="text-[10px] bg-[#3FB950] text-[#0D0F12] px-1.5 py-0.5 rounded font-bold animate-pulse">
                  ACTIVE
                </span>
              )}
            </div>
            
            <div className="flex flex-col gap-1.5">
              {DIRECTIONS.map(dir => {
                const commands = groupedCommands[dir];
                if (!commands || commands.length === 0) return null;
                const sortedCommands = [...commands].sort((a, b) => {
                  const valA = a.target % 3 === 0 ? 3 : a.target % 3;
                  const valB = b.target % 3 === 0 ? 3 : b.target % 3;
                  return valA - valB;
                });

                return (
                  <div key={dir} className="flex items-center justify-between gap-2 border-b border-[#2D333B]/30 last:border-0 pb-1 last:pb-0">
                    <div className="text-[10px] text-[#b7bdc8] font-mono tracking-tighter uppercase shrink-0">
                      {dir.replace('BOUND', '')}
                    </div>
                    <div className="flex gap-1">
                      {sortedCommands.map(cmd => {
                        const isYield = cmd.action === 'YIELD';
                        const activeClass = isYield 
                          ? 'bg-[#2d1f0a] border-[#a3712f] text-[#f0d9a8]' 
                          : 'bg-[#0d2818] border-[#238636] text-[#7ee787]';
                        const inactiveClass = 'bg-[#161b22] border-[#30363D] text-[#e6edf3]';
                        return (
                        <span 
                          key={cmd.target} 
                          title={MovementLabels[cmd.target]}
                          className={`flex items-center justify-center w-7 h-7 rounded border font-mono transition-colors ${isActive ? activeClass : inactiveClass}`}
                        >
                          {getMovementIcon(cmd.target)}
                        </span>
                      )})}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export const CollapsibleSection = React.memo(({ id, title, isCollapsed, onToggle, children }: { id: string; title: string; isCollapsed: boolean; onToggle: (id: string) => void; children: React.ReactNode; }) => (
  <div className="flex flex-col">
    <button onClick={() => onToggle(id)} className="group mb-2 flex w-full items-center justify-between border-2 border-b-[3px] border-[#2D333B] bg-[#161B22] px-2 py-1.5 text-xs uppercase tracking-widest text-[#C9D1D9] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-[#3FB950]/45 hover:text-white active:translate-y-px">
      <span className="flex items-center gap-2">
        {isCollapsed ? <ChevronRight className="w-3 h-3 text-[#3FB950]" /> : <ChevronDown className="w-3 h-3 text-[#3FB950]" />}
        {title}
      </span>
    </button>
    <AnimatePresence initial={false}>
      {!isCollapsed && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }} className="overflow-hidden">
          <div className="mt-2">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
));

export const LevelCompleteModal = ({
  info,
  levelId,
  levelOrdinal,
  isLastLevel,
  onNext,
  onRetry,
  showWatchReplay,
  onWatchReplay,
}: {
  info: { carsCleared: number; timeSeconds: number; cycleTime: number; linesOfCode: number; hardwareCost: number };
  levelId: string;
  levelOrdinal: number;
  isLastLevel?: boolean;
  onNext: () => void;
  onRetry: () => void;
  showWatchReplay?: boolean;
  onWatchReplay?: () => void;
}) => {
  const tier = getMetricTier(levelOrdinal - 1);
  return (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
    <motion.div initial={{ scale: 0.94, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="w-full max-w-md rounded-none border-2 border-[#3FB950] bg-[#0D0F12] shadow-[0_0_30px_rgba(63,185,80,0.15)] overflow-hidden font-mono">
      <div className="bg-[#3FB950] text-[#0D0F12] px-4 py-2 font-bold tracking-widest text-sm flex justify-between">
        <span>REQUISITION VERIFIED</span>
        <span>{levelId}</span>
      </div>
      <div className="p-6">
        <h2 className="text-[#C9D1D9] text-xl font-bold mb-1 text-center tracking-wider">RESOURCE ALLOCATION REPORT</h2>
        <p className="text-[#8B949E] text-[11px] text-center mb-1 font-mono uppercase tracking-wide">Discharge target satisfied. Safety certification: four consecutive refresh cycles with stable discharge register.</p>
        <p className="text-[#8B949E] text-[10px] text-center mb-6 font-mono uppercase tracking-wide">Intermittent logic variance voids commendation; this filing passed settle gate.</p>
        
        {tier > 1 ? (
          <div className="space-y-2 mt-4 pt-4 border-t border-[#2D333B]">
            <div className="text-[10px] text-[#3FB950] font-bold uppercase tracking-widest mb-3 text-center">Optimization Audit</div>
            {tier >= 2 && (
              <Histogram
                title={METRIC.THROUGHPUT}
                value={info.cycleTime}
                unit="s"
                color="#3FB950"
                min={10}
                max={120}
                levelId={levelId}
                dbColumn="seconds_to_clear"
                distributionLabel={bureauEfficiencyAuditLabel(BRAND.SECTOR)}
              />
            )}
            {tier >= 3 && (
              <>
                <Histogram
                  title={METRIC.INSTRUCTION_COUNT}
                  value={info.linesOfCode}
                  unit="SECT"
                  color="#58A6FF"
                  min={2}
                  max={30}
                  levelId={levelId}
                  dbColumn="instruction_count"
                  distributionLabel={bureauEfficiencyAuditLabel(BRAND.SECTOR)}
                />
                <Histogram
                  title={METRIC.HARDWARE_COST}
                  value={info.hardwareCost}
                  unit="¥"
                  color="#D29922"
                  min={100}
                  max={2000}
                  levelId={levelId}
                  dbColumn="hardware_cost"
                  distributionLabel={bureauEfficiencyAuditLabel(BRAND.SECTOR)}
                />
              </>
            )}
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-[#2D333B] text-center space-y-2">
            <div className="text-[12px] text-[#3FB950] font-bold uppercase tracking-widest">SURVIVAL CONFIRMED</div>
            <div className="text-[10px] text-[#8B949E] uppercase tracking-wide">Efficiency metrics offline for initial run. Focus on base clearance.</div>
          </div>
        )}

        {showWatchReplay && onWatchReplay && (
          <div className="mt-6">
            <IndustrialPanelKey
              onClick={onWatchReplay}
              className="w-full border-[#58A6FF]/55 bg-[#58A6FF]/12 py-2.5 text-[11px] text-[#58A6FF] hover:bg-[#58A6FF]/22"
            >
              WATCH REPLAY (VISUAL)
            </IndustrialPanelKey>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <IndustrialPanelKey onClick={onRetry} className="flex-1 border-[#2D333B] bg-black/30 py-2 text-[11px] text-[#C9D1D9] hover:border-[#58A6FF]/50 hover:text-white">
            AMEND FILING
          </IndustrialPanelKey>
          <IndustrialPanelKey
            onClick={onNext}
            className="flex-1 border-[#3FB950]/70 bg-[#3FB950]/15 py-2 text-[11px] text-[#3FB950] hover:bg-[#3FB950]/28 shadow-[0_0_10px_rgba(63,185,80,0.15)]"
          >
            {isLastLevel ? 'OPEN CORRIDOR (UNAUDITED)' : 'NEXT DOCKET'}
          </IndustrialPanelKey>
        </div>
      </div>
    </motion.div>
  </motion.div>
  );
};

export const MasterSwitch = ({
  isOn,
  onToggle,
  procurementLock = false,
}: {
  isOn: boolean;
  onToggle: () => void;
  procurementLock?: boolean;
}) => {
  const handleClick = () => {
    if (procurementLock && !isOn) {
      hapticError();
      return;
    }
    hapticHeavy();
    onToggle();
  };
  return (
    <div
      onClick={handleClick}
      className={`relative w-20 h-10 sm:w-24 sm:h-12 bg-[#161B22] rounded border-2 border-[#2D333B] shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] flex items-center p-1 shrink-0 ${
        procurementLock && !isOn ? 'cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {procurementLock && !isOn && (
        <div className="pointer-events-none absolute inset-0 z-20 m-0.5 rounded-sm border-2 border-[#F85149] bg-[#F85149]/25 shadow-[inset_0_0_12px_rgba(248,81,73,0.35)] flex items-end justify-center pb-0.5">
          <span className="text-[6px] font-bold tracking-widest text-[#F85149]">PROC_LOCK</span>
        </div>
      )}
      <div className="absolute inset-0 flex justify-between items-center px-2 sm:px-3 pointer-events-none font-mono text-[9px] sm:text-[10px] font-bold tracking-widest">
        <span className={isOn ? 'text-[#3FB950] animate-pulse' : 'text-[#8B949E]'}>ON</span>
        <span className={!isOn ? 'text-[#D29922]' : 'text-[#8B949E]'}>OFF</span>
      </div>
      <motion.div initial={false} animate={{ x: isOn ? '100%' : '0%' }} transition={{ type: "spring", stiffness: 500, damping: 30 }} className={`w-1/2 h-full rounded border-b-4 border-r-2 flex items-center justify-center shadow-lg relative z-10 ${isOn ? 'bg-[#3FB950] border-[#238636]' : 'bg-[#D29922] border-[#a3712f]'}`}>
        <div className="w-1 h-4 sm:h-5 bg-black/30 rounded-full" />
        <div className="w-1 h-4 sm:h-5 bg-black/30 rounded-full ml-1" />
      </motion.div>
    </div>
  );
};

export const PhaseLogList = React.memo(({ logs, maxHeightClass }: { logs: LogEntry[]; maxHeightClass: string }) => (
  <div className={`overflow-y-auto space-y-1 pr-2 scrollbar-hide ${maxHeightClass}`}>
    <AnimatePresence initial={false}>
      {logs.map((log) => (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key={log.id} className="font-mono text-[11px] sm:text-xs flex justify-between gap-2 border-b border-white/5 py-1">
          <span className="text-[#C9D1D9]/60 shrink-0">{log.time}</span>
          <span className="min-w-0 flex-1 whitespace-pre-line break-words text-right leading-tight" style={{ color: log.color || 'var(--major)' }}>{log.event}</span>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
));

export const TrafficFlowRates = React.memo(({ rates, isSandbox, onRateChange }: { rates: Record<string, number>, isSandbox?: boolean, onRateChange?: (dir: string, val: number) => void }) => (
  <div className="grid grid-cols-2 gap-2 mb-2">
    {(['NORTH', 'SOUTH', 'EAST', 'WEST'] as const).map(label => {
      const dir = label[0] as keyof typeof rates;
      const color = (dir === 'N' || dir === 'S') ? 'text-[#58A6FF]' : 'text-[#D29922]';
      return (
        <div key={label} className="bg-black/20 p-2 border border-[#2D333B] rounded">
          <div className="text-[10px] text-[#C9D1D9]/70 mb-1">{label}</div>
          <div className={`text-sm font-mono ${color}`}>{(rates[dir] * 100).toFixed(1)}%</div>
          {isSandbox && (
            <input 
              type="range" 
              min="0" 
              max="0.5" 
              step="0.01" 
              value={rates[dir]} 
              onChange={(e) => onRateChange?.(dir, parseFloat(e.target.value))} 
              className="w-full accent-[#3FB950] h-1 mt-2" 
            />
          )}
        </div>
      );
    })}
  </div>
));

export const ProgramCompileError = ({
  message,
  helpTab,
  onOpenManualHelp,
  compact,
}: {
  message: string;
  helpTab: string | null;
  onOpenManualHelp: (tab: string) => void;
  compact?: boolean;
}) => {
  if (!message) return null;
  if (compact) {
    return (
      <div className="flex gap-1.5 items-center rounded border border-[#F85149]/35 bg-[#F85149]/10 px-2 py-1.5">
        <div className="min-w-0 flex-1 text-[11px] font-mono font-bold leading-snug text-[#F85149]">
          {translateCompilerError(message)}
        </div>
        {helpTab && (
          <button
            type="button"
            title={`Open manual: ${helpTab}`}
            onClick={() => {
              hapticTap();
              onOpenManualHelp(helpTab);
            }}
            className="shrink-0 rounded border border-[#F85149] p-1 text-[#F85149] hover:bg-[#F85149]/20"
          >
            <CircleHelp size={14} />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex gap-2 items-start rounded border border-[#F85149]/30 bg-[#F85149]/10 p-2">
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[11px] font-mono font-bold uppercase tracking-wider text-[#F85149]/80">Logic image validation failure</div>
        <div className="text-[13px] text-[#F85149] font-mono whitespace-pre-wrap leading-tight">{translateCompilerError(message)}</div>
        <div className="text-[10px] text-[#8B949E] mt-2 font-mono whitespace-pre-wrap leading-tight">{message}</div>
      </div>
      {helpTab && (
        <button
          type="button"
          title={`Open manual: ${helpTab}`}
          onClick={() => {
            hapticTap();
            onOpenManualHelp(helpTab);
          }}
          className="shrink-0 rounded border border-[#F85149] p-1.5 text-[#F85149] hover:bg-[#F85149]/20"
        >
          <CircleHelp size={16} />
        </button>
      )}
    </div>
  );
};

export function VehicleInspectTooltip({ vehicle }: { vehicle: Vehicle }) {
  const lane = LANE_MAP.get(vehicle.laneId);
  const movementLabel = lane ? MovementLabels[lane.movement] ?? String(lane.movement) : vehicle.laneId;
  const speed = Math.hypot(vehicle.vx, vehicle.vy);
  const angDeg = (vehicle.angle * 180) / Math.PI;
  const rows: [string, string][] = [['rawId', vehicle.id], ['lane', vehicle.laneId], ['movement', movementLabel], ['type', vehicle.vType], ['x', vehicle.x.toFixed(1)], ['y', vehicle.y.toFixed(1)], ['vx', vehicle.vx.toFixed(2)], ['vy', vehicle.vy.toFixed(2)], ['speed', speed.toFixed(2)], ['angleDeg', angDeg.toFixed(1)], ['cruise', vehicle.cruiseSpeed.toFixed(2)], ['accel', vehicle.accel.toFixed(2)], ['decel', vehicle.decel.toFixed(2)], ['brake', String(vehicle.brakeIntensity ?? 0)], ['delay', vehicle.startDelay.toFixed(2)], ['color', vehicle.color], ['size', `${vehicle.length.toFixed(0)}×${vehicle.width.toFixed(0)}`], ['skins', [vehicle.legendarySkin && 'LEG', vehicle.rareSkin && 'RARE'].filter(Boolean).join(' ') || '—']];
  if (vehicle.targetLaneId) rows.push(['targetLane', vehicle.targetLaneId]);
  if (vehicle.isTurning) {
    rows.push(['turn', 'on']);
    rows.push(['turnProgress', (vehicle.turnProgress ?? 0).toFixed(3)]);
    if (vehicle.turnRadius != null) rows.push(['turnR', vehicle.turnRadius.toFixed(1)]);
    if (vehicle.turnCenterX != null) rows.push(['turnCx', vehicle.turnCenterX.toFixed(1)]);
    if (vehicle.turnCenterY != null) rows.push(['turnCy', vehicle.turnCenterY.toFixed(1)]);
  } else { rows.push(['turn', 'off']); }
  return (
    <div className="pointer-events-auto max-h-[min(70vh,420px)] overflow-y-auto rounded border border-[#58A6FF]/50 bg-[#1A1D23]/98 p-3 font-mono text-[11px] text-[#C9D1D9] shadow-2xl scrollbar-hide">
      <div className="border-b border-[#2D333B] pb-2 text-[10px] font-bold tracking-wider text-[#58A6FF]">UNIT INSPECTION REGISTER</div>
      <div className="mt-2 space-y-1">
        <div className="flex justify-between gap-6 border-b border-[#2D333B]/40 pb-1">
          <span className="text-[#8B949E]">UNIT</span>
          <span className="text-right font-bold text-[#58A6FF]">{formatTransitUnitTag(vehicle.id)}</span>
        </div>
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-6"><span className="text-[#8B949E]">{k}</span><span className="text-right text-[#C9D1D9]">{val}</span></div>
        ))}
      </div>
    </div>
  );
}
