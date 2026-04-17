/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, Pause, RotateCcw, Car as CarIcon, ArrowUp, ArrowLeft, ChevronDown, ChevronRight, Activity, PanelLeftClose, PanelLeftOpen, CornerUpLeft, CornerUpRight, Save } from 'lucide-react';
import { Movement, Vehicle, Lane, LightState, MovementTiming } from './types';
import { parseTrafficProgram, Phase } from './interpreter';
import { CANVAS_SIZE, INTERSECTION_SIZE, LANE_WIDTH, LANES, DEFAULT_TIMINGS, DEFAULT_PHASE_GREEN_SECONDS, DEFAULT_BUILTIN_PHASE_TIMINGS, BASE_SPAWN_RATE, SPAWN_DRIFT_SPEED, MIN_PHASE_GREEN_SECONDS, MAX_TOTAL_LOOP_SECONDS, clampPhaseTimingsToLoopCap, PHASE_TEMPLATES } from './constants';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const STOP_LINE = INTERSECTION_SIZE / 2 + 10;
const BASE_SAFE_GAP = 25;
const LANE_MAP = new Map<string, Lane>(LANES.map(l => [l.id, l]));
const VEHICLE_COLORS = ['#0366d6', '#58A6FF', '#3FB950', '#ffcc00', '#D29922', '#f78166', '#F85149'];

const MovementLabels: Record<number, string> = {
  [Movement.NORTHBOUND_LEFT]: 'NORTH_LEFT',
  [Movement.NORTHBOUND_STRAIGHT]: 'NORTH_STRAIGHT',
  [Movement.NORTHBOUND_RIGHT]: 'NORTH_RIGHT',
  [Movement.WESTBOUND_LEFT]: 'WEST_LEFT',
  [Movement.WESTBOUND_STRAIGHT]: 'WEST_STRAIGHT',
  [Movement.WESTBOUND_RIGHT]: 'WEST_RIGHT',
  [Movement.SOUTHBOUND_LEFT]: 'SOUTH_LEFT',
  [Movement.SOUTHBOUND_STRAIGHT]: 'SOUTH_STRAIGHT',
  [Movement.SOUTHBOUND_RIGHT]: 'SOUTH_RIGHT',
  [Movement.EASTBOUND_LEFT]: 'EAST_LEFT',
  [Movement.EASTBOUND_STRAIGHT]: 'EAST_STRAIGHT',
  [Movement.EASTBOUND_RIGHT]: 'EAST_RIGHT',
};

const DIRECTIONS = ['NORTHBOUND', 'SOUTHBOUND', 'EASTBOUND', 'WESTBOUND'] as const;

function getDirection(m: Movement) {
    if (m >= 1 && m <= 3) return 'NORTHBOUND';
    if (m >= 7 && m <= 9) return 'SOUTHBOUND';
    if (m >= 10 && m <= 12) return 'EASTBOUND';
    if (m >= 4 && m <= 6) return 'WESTBOUND';
    return 'OTHER';
}

function getMovementIcon(m: Movement, size: number = 14) {
    const type = m % 3;
    if (type === 1) return <CornerUpLeft size={size} />;
    if (type === 2) return <ArrowUp size={size} />;
    return <CornerUpRight size={size} />;
}

function formatActiveMovements(activeMovements: Movement[]): string {
    if (activeMovements.length === 0) return 'NONE';
    return activeMovements.map(m => MovementLabels[m] || m).join('\n');
}

// Type definitions
interface LogEntry { id: string; time: string; event: string; color?: string; }
interface HistoryEntry { time: string; P1: number; P2: number; P3: number; P4: number; }
interface QueueHistoryEntry { time: string; [key: string]: string | number; }

// Memoized Sub-components to prevent flickering from frequent App re-renders
type PathGeometry = 
  | { type: 'STRAIGHT', startX: number, startY: number, endX: number, endY: number }
  | { type: 'ARC', centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number, counterClockwise: boolean };

function getPathGeometry(lane: Lane, centerX: number, centerY: number): PathGeometry {
  if (lane.type === 'THRU') {
    if (lane.direction === 'N') return { type: 'STRAIGHT', startX: lane.startX, startY: centerY + 120, endX: lane.endX, endY: centerY - 120 };
    if (lane.direction === 'S') return { type: 'STRAIGHT', startX: lane.startX, startY: centerY - 120, endX: lane.endX, endY: centerY + 120 };
    if (lane.direction === 'E') return { type: 'STRAIGHT', startX: centerX - 120, startY: lane.startY, endX: centerX + 120, endY: lane.endY };
    if (lane.direction === 'W') return { type: 'STRAIGHT', startX: centerX + 120, startY: lane.startY, endX: centerX - 120, endY: lane.endY };
  } else if (lane.type === 'LEFT') {
    if (lane.direction === 'N') return { type: 'ARC', centerX: centerX - 120, centerY: centerY + 120, radius: 140, startAngle: 0, endAngle: -Math.PI / 2, counterClockwise: true };
    if (lane.direction === 'S') return { type: 'ARC', centerX: centerX + 120, centerY: centerY - 120, radius: 140, startAngle: Math.PI, endAngle: Math.PI / 2, counterClockwise: true };
    if (lane.direction === 'E') return { type: 'ARC', centerX: centerX - 120, centerY: centerY - 120, radius: 140, startAngle: Math.PI / 2, endAngle: 0, counterClockwise: true };
    if (lane.direction === 'W') return { type: 'ARC', centerX: centerX + 120, centerY: centerY + 120, radius: 140, startAngle: -Math.PI / 2, endAngle: -Math.PI, counterClockwise: true };
  } else if (lane.type === 'RIGHT') {
    if (lane.direction === 'N') return { type: 'ARC', centerX: centerX + 120, centerY: centerY + 120, radius: 20, startAngle: Math.PI, endAngle: Math.PI * 1.5, counterClockwise: false };
    if (lane.direction === 'S') return { type: 'ARC', centerX: centerX - 120, centerY: centerY - 120, radius: 20, startAngle: 0, endAngle: Math.PI / 2, counterClockwise: false };
    if (lane.direction === 'E') return { type: 'ARC', centerX: centerX - 120, centerY: centerY + 120, radius: 20, startAngle: -Math.PI / 2, endAngle: 0, counterClockwise: false };
    if (lane.direction === 'W') return { type: 'ARC', centerX: centerX + 120, centerY: centerY - 120, radius: 20, startAngle: Math.PI / 2, endAngle: Math.PI, counterClockwise: false };
  }
  return { type: 'STRAIGHT', startX: 0, startY: 0, endX: 0, endY: 0 };
}

const TrafficFlowRates = React.memo(({ rates }: { rates: Record<string, number> }) => (
    <div className="grid grid-cols-2 gap-2 mb-2">
        {(['NORTH', 'SOUTH', 'EAST', 'WEST'] as const).map(label => {
            const dir = label[0] as keyof typeof rates;
            const color = (dir === 'N' || dir === 'S') ? 'text-[#58A6FF]' : 'text-[#D29922]';
            return (
                <div key={label} className="bg-black/20 p-2 border border-[#2D333B] rounded">
                    <div className="text-[10px] text-[#C9D1D9]/70 mb-1">{label}</div>
                    <div className={`text-sm font-mono ${color}`}>{(rates[dir] * 100).toFixed(1)}%</div>
                </div>
            );
        })}
    </div>
));

const CHART_H = 180;

const AnalyticalChart = React.memo(({ history }: { history: HistoryEntry[] }) => (
    <div className="h-[180px] w-full mt-2 -ml-6" style={{ minWidth: 0 }}>
        <ResponsiveContainer
            width="100%"
            height={CHART_H}
            minWidth={0}
            initialDimension={{ width: 240, height: CHART_H }}
        >
            <LineChart data={history} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D333B" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis hide domain={[0, 40]} />
                <Tooltip 
                    contentStyle={{ background: '#1A1D23', border: '1px solid #2D333B', fontSize: '11px' }}
                    itemStyle={{ fontSize: '11px' }}
                />
                <Line isAnimationActive={false} type="monotone" dataKey="P1" stroke="#3FB950" strokeWidth={1} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="P2" stroke="#58A6FF" strokeWidth={1} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="P3" stroke="#D29922" strokeWidth={1} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="P4" stroke="#8b5cf6" strokeWidth={1} dot={false} />
            </LineChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 text-[10px] font-mono text-[#C9D1D9]/60 -mt-2 ml-6">
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#3FB950]"></span> P1</span>
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#58A6FF]"></span> P2</span>
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#D29922]"></span> P3</span>
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#8b5cf6]"></span> P4</span>
        </div>
    </div>
));

const QueueChart = React.memo(({ history }: { history: QueueHistoryEntry[] }) => (
    <div className="h-[180px] w-full mt-2 -ml-6" style={{ minWidth: 0 }}>
        <ResponsiveContainer
            width="100%"
            height={CHART_H}
            minWidth={0}
            initialDimension={{ width: 240, height: CHART_H }}
        >
            <LineChart data={history} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D333B" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip 
                    content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                            const filtered = payload
                                .filter((p: any) => (p.value as number) > 0)
                                .sort((a: any, b: any) => (b.value as number) - (a.value as number));
                            if (filtered.length === 0) return null;
                            return (
                                <div className="bg-[#1A1D23] border border-[#2D333B] p-2 rounded shadow-xl font-mono text-[11px]">
                                    <div className="text-[#8B949E] mb-1">{label}</div>
                                    {filtered.map((p: any) => (
                                        <div key={p.dataKey} style={{ color: p.color }}>
                                            {String(p.dataKey).replace(/-/g, '_')} : {p.value}
                                        </div>
                                    ))}
                                </div>
                            );
                        }
                        return null;
                    }}
                />
                {LANES.map((lane, i) => {
                    const colors = ['#58A6FF', '#F85149', '#3FB950', '#D29922', '#8b5cf6', '#ec4899', '#ffcc00', '#0366d6', '#28a745', '#ffd33d', '#ea4aaa', '#6f42c1'];
                    return (
                        <Line 
                            key={lane.id}
                            isAnimationActive={false} 
                            type="monotone" 
                            dataKey={lane.id} 
                            stroke={colors[i % colors.length]} 
                            strokeWidth={1} 
                            dot={false} 
                        />
                    );
                })}
            </LineChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[9px] font-mono text-[#C9D1D9]/60 -mt-2 ml-6 px-2">
            {LANES.map((lane, i) => {
                const colors = ['#58A6FF', '#F85149', '#3FB950', '#D29922', '#8b5cf6', '#ec4899', '#ffcc00', '#0366d6', '#28a745', '#ffd33d', '#ea4aaa', '#6f42c1'];
                return (
                    <span key={lane.id} className="flex items-center gap-1 truncate">
                        <span className="w-1.5 h-0.5 shrink-0" style={{ backgroundColor: colors[i % colors.length] }}></span> 
                        {lane.id.replace(/-/g, '_').toUpperCase()}
                    </span>
                );
            })}
        </div>
    </div>
));

const BadgeView = React.memo(({ phases, currentPhase }: { phases: Phase[], currentPhase: number }) => {
    return (
        <div className="flex flex-col gap-3 py-1">
            {phases.map((phase, i) => {
                const isActive = i === (currentPhase % phases.length);
                const groupedMovements = phase.movements.reduce((acc, m) => {
                    const dir = getDirection(m);
                    if (!acc[dir]) acc[dir] = [];
                    acc[dir].push(m);
                    return acc;
                }, {} as Record<string, Movement[]>);

                return (
                    <div 
                        key={i} 
                        className={`p-2 rounded border transition-all ${isActive ? 'bg-[#3FB950]/10 border-[#3FB950]/40 ring-1 ring-[#3FB950]/20' : 'bg-black/20 border-[#2D333B]'}`}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-mono font-bold tracking-wider ${isActive ? 'text-[#3FB950]' : 'text-[#C9D1D9]'}`}>
                                {phase.label}
                            </span>
                            {isActive && (
                                <span className="text-[10px] bg-[#3FB950] text-[#0D0F12] px-1.5 py-0.5 rounded font-bold animate-pulse">
                                    ACTIVE
                                </span>
                            )}
                        </div>
                        
                        <div className="flex flex-col gap-1.5">
                            {DIRECTIONS.map(dir => {
                                const movements = groupedMovements[dir];
                                if (!movements || movements.length === 0) return null;
                                // Sort movements to ensure (LEFT, STRAIGHT, RIGHT) order
                                const sortedMovements = [...movements].sort((a, b) => {
                                    const valA = a % 3 === 0 ? 3 : a % 3;
                                    const valB = b % 3 === 0 ? 3 : b % 3;
                                    return valA - valB;
                                });

                                return (
                                    <div key={dir} className="flex items-center justify-between gap-2 border-b border-[#2D333B]/30 last:border-0 pb-1 last:pb-0">
                                        <div className="text-[10px] text-[#C9D1D9] font-mono tracking-tighter uppercase opacity-90 shrink-0">
                                            {dir.replace('BOUND', '')}
                                        </div>
                                        <div className="flex gap-1">
                                            {sortedMovements.map(m => (
                                                <span 
                                                    key={m} 
                                                    title={MovementLabels[m]}
                                                    className={`flex items-center justify-center w-7 h-7 rounded border font-mono transition-colors ${isActive ? 'bg-[#3FB950]/20 border-[#3FB950]/30 text-[#3FB950]' : 'bg-[#1A1D23] border-[#2D333B] text-[#C9D1D9]'}`}
                                                >
                                                    {getMovementIcon(m)}
                                                    <span className="sr-only">{MovementLabels[m]?.replace(/^[A-Z]+_/, '')}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {phase.movements.length === 0 && (
                                <span className="text-xs text-gray-400 font-mono italic">NO_MOVEMENTS</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

const CollapsibleSection = React.memo(({ 
    id, 
    title, 
    isCollapsed, 
    onToggle, 
    children 
}: { 
    id: string; 
    title: string; 
    isCollapsed: boolean; 
    onToggle: (id: string) => void; 
    children: React.ReactNode;
}) => (
    <div className="flex flex-col">
        <button 
            onClick={() => onToggle(id)}
            className="flex items-center justify-between text-xs uppercase tracking-widest text-[#C9D1D9] mb-2 border-b border-[#2D333B] pb-1 hover:text-white transition-colors group"
        >
            <span className="flex items-center gap-2">
                {isCollapsed ? <ChevronRight className="w-3 h-3 text-[#3FB950]" /> : <ChevronDown className="w-3 h-3 text-[#3FB950]" />}
                {title}
            </span>
        </button>
        <AnimatePresence initial={false}>
            {!isCollapsed && (
                <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                >
                    <div className="mt-2">{children}</div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
));

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [phaseTimings, setPhaseTimings] = useState<number[]>(() => [...DEFAULT_BUILTIN_PHASE_TIMINGS]);
  
  // Traffic Flow State
  const [trafficRates, setTrafficRates] = useState<Record<string, number>>({
    N: BASE_SPAWN_RATE, S: BASE_SPAWN_RATE, E: BASE_SPAWN_RATE, W: BASE_SPAWN_RATE
  });
  const [offScreenQueues, setOffScreenQueues] = useState<Record<string, number>>({});
  const [isAdaptive, setIsAdaptive] = useState(true);
  
  // UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    phaseTimings: true,
    queue: true,
    log: true,
    analytics: true,
    flow: true,
    editor: true,
    monitor: false,
    load: false
  });
  const [timingHistory, setTimingHistory] = useState<HistoryEntry[]>([]);
  const [queueHistory, setQueueHistory] = useState<QueueHistoryEntry[]>([]);
  
  // Controller State
  const [currentPhase, setCurrentPhase] = useState(0);
  const [lightState, setLightState] = useState<LightState>('GREEN');
  const [timer, setTimer] = useState(0);
  const [logs, setLogs] = useState<{ id: string, time: string, event: string, color?: string }[]>([]);
  
  // Store accumulated demand per phase over the current cycle
  const cycleDemandRef = useRef<number[]>([]);
  const cycleCounterRef = useRef(0);
  
  // Interpreter State
  const [programCode, setProgramCode] = useState<string>(`phase(1):
    NORTH_STRAIGHT.GO
    NORTH_LEFT.GO
    NORTH_RIGHT.GO
    EAST_RIGHT.GO
    SOUTH_RIGHT.GO
    WEST_RIGHT.GO

phase(2):
    EAST_STRAIGHT.GO
    EAST_LEFT.GO
    NORTH_RIGHT.GO
    EAST_RIGHT.GO
    SOUTH_RIGHT.GO
    WEST_RIGHT.GO

phase(3):
    SOUTH_STRAIGHT.GO
    SOUTH_LEFT.GO
    NORTH_RIGHT.GO
    EAST_RIGHT.GO
    SOUTH_RIGHT.GO
    WEST_RIGHT.GO

phase(4):
    WEST_STRAIGHT.GO
    WEST_LEFT.GO
    NORTH_RIGHT.GO
    EAST_RIGHT.GO
    SOUTH_RIGHT.GO
    WEST_RIGHT.GO
`);
  const [compiledPhases, setCompiledPhases] = useState<Phase[]>([]);
  const [programError, setProgramError] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [userTemplate, setUserTemplate] = useState(() => localStorage.getItem('traffic_user_template') || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyTemplate = (code: string) => {
    if (!code) return;
    setProgramCode(code);
    // Don't switch to edit mode, stay in view mode as requested
    // Trigger compilation immediately for better UX in view mode
    compile(code);
    // Reset scroll positions to ensure text appears "cleared" and fresh
    if (textareaRef.current) textareaRef.current.scrollTop = 0;
    if (highlightRef.current) highlightRef.current.scrollTop = 0;
    addLog("TEMPLATE_APPLIED", "var(--major)");
  };

  const saveUserTemplate = () => {
    localStorage.setItem('traffic_user_template', programCode);
    setUserTemplate(programCode);
    addLog("TEMPLATE_SAVED", "var(--green)");
  };

  const compile = useCallback((codeToCompile?: string) => {
    const code = codeToCompile ?? programCode;
    const result = parseTrafficProgram(code);
    if (result.error) {
      setProgramError(result.error);
    } else if (result.phases && result.phases.length > 0) {
      setProgramError('');
      setCompiledPhases(result.phases);
      const n = result.phases.length;
      setPhaseTimings((prev) =>
        clampPhaseTimingsToLoopCap(
          Array.from({ length: n }, (_, i) => prev[i] ?? DEFAULT_PHASE_GREEN_SECONDS),
          n,
        ),
      );
      setCurrentPhase(0);
      setLightState('GREEN');
      setTimer(0);
    }
  }, [programCode]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      compile();
    }, 500);
    return () => clearTimeout(timeout);
  }, [compile]);

  const vehiclesRef = useRef<Vehicle[]>([]);
  const laneCarsCacheRef = useRef<Record<string, Vehicle[]>>({});
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    LANES.forEach(l => laneCarsCacheRef.current[l.id] = []);
  }, []);

  const addLog = useCallback((event: string, color?: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setLogs(prev => [{ id: Math.random().toString(), time, event, color }, ...prev].slice(0, 20));
  }, []);

  // Initial boot log
  useEffect(() => {
    addLog('SYS BOOT OK', 'var(--green)');
  }, []);

  // Helper to get active movements for current phase
  const getActiveMovements = useCallback((phase: number) => {
    const allRights = [Movement.NORTHBOUND_RIGHT, Movement.EASTBOUND_RIGHT, Movement.SOUTHBOUND_RIGHT, Movement.WESTBOUND_RIGHT];
    switch (phase) {
      case 0:
        return [Movement.NORTHBOUND_LEFT, Movement.NORTHBOUND_STRAIGHT, ...allRights];
      case 1:
        return [Movement.EASTBOUND_LEFT, Movement.EASTBOUND_STRAIGHT, ...allRights];
      case 2:
        return [Movement.SOUTHBOUND_LEFT, Movement.SOUTHBOUND_STRAIGHT, ...allRights];
      case 3:
        return [Movement.WESTBOUND_LEFT, Movement.WESTBOUND_STRAIGHT, ...allRights];
      default:
        return [];
    }
  }, []);

  const activeMovements = useMemo(() => 
    compiledPhases.length > 0 ? (compiledPhases[currentPhase]?.movements || []) : getActiveMovements(currentPhase),
  [compiledPhases, currentPhase, getActiveMovements]);

  // Accumulate traffic data when phases are active
  useEffect(() => {
    if (!isPlaying || !isAdaptive) return;

    // Get demand on the currently active phase and add it to our cycle accumulator
    const n = compiledPhases.length > 0 ? compiledPhases.length : 4;
    if (!cycleDemandRef.current || cycleDemandRef.current.length !== n) {
      cycleDemandRef.current = new Array(n).fill(0);
    }

    const laneCounts = new Map<string, number>();
    vehiclesRef.current.forEach(v => laneCounts.set(v.laneId, (laneCounts.get(v.laneId) || 0) + 1));

    const movementsInPhase = compiledPhases.length > 0 ? compiledPhases[currentPhase].movements : getActiveMovements(currentPhase);
    const movementSet = new Set(movementsInPhase);

    let phaseLoad = 0;
    LANES.forEach((l) => {
      if (movementSet.has(l.movement)) {
        phaseLoad += (laneCounts.get(l.id) || 0) + ((offScreenQueues[l.id] || 0) * 1.5);
      }
    });

    cycleDemandRef.current[currentPhase] += phaseLoad;

    // If we just finished the last phase (looped back to 0), apply adjustments!
    if (currentPhase === 0 && lightState === 'RED') {
      cycleCounterRef.current++;

      // Traffic rates should only adjust once per two full phase sequence loops
      // to allow adaptive phase timing to have time to adjust
      if (cycleCounterRef.current % 2 === 0) {
        setTrafficRates(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(dir => {
            const drift = (Math.random() - 0.5) * SPAWN_DRIFT_SPEED;
            next[dir] = Math.max(0.01, Math.min(0.2, next[dir] + drift));
          });
          return next;
        });
      }

      setPhaseTimings((prev) => {
        // calculate new targets based on total accumulated load over the cycle
        const next = Array.from({ length: n }, (_, i) => prev[i] ?? DEFAULT_PHASE_GREEN_SECONDS);
        
        // Calculate target green times based on weighted proportion of the loop
        const totalLoad = cycleDemandRef.current.reduce((a,b) => a + b, 0);
        const availableGreen = MAX_TOTAL_LOOP_SECONDS - (n * MIN_PHASE_GREEN_SECONDS);

        const newTimings = next.map((_, i) => {
          const loadRatio = totalLoad > 0 ? cycleDemandRef.current[i] / totalLoad : 1/n;
          return MIN_PHASE_GREEN_SECONDS + Math.round(loadRatio * availableGreen);
        });

        // Reset our cycle accumulator
        cycleDemandRef.current = new Array(n).fill(0);

        // Refine/Smooth the changes by 40% so it doesnt snap instantly
        return newTimings.map((target, i) => {
          const diff = target - next[i];
          return next[i] + Math.round(diff * 0.4);
        });
      });
    }

  }, [currentPhase, lightState, isAdaptive, isPlaying, offScreenQueues, compiledPhases, getActiveMovements]);

  // Record History for Charts
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
        
        setTimingHistory(prev => {
            const entry = {
                time: timestamp,
                P1: phaseTimings[0] ?? DEFAULT_PHASE_GREEN_SECONDS,
                P2: phaseTimings[1] ?? DEFAULT_PHASE_GREEN_SECONDS,
                P3: phaseTimings[2] ?? DEFAULT_PHASE_GREEN_SECONDS,
                P4: phaseTimings[3] ?? DEFAULT_PHASE_GREEN_SECONDS,
            };
            return [...prev, entry].slice(-20);
        });

        setQueueHistory(prev => {
            const entry: QueueHistoryEntry = { time: timestamp };
            LANES.forEach(lane => {
                entry[lane.id] = offScreenQueues[lane.id] || 0;
            });
            return [...prev, entry].slice(-20);
        });
    }, 2000);
    return () => clearInterval(interval);
  }, [isPlaying, phaseTimings, offScreenQueues]);

  // 1. Timer update interval
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimer(prev => prev + 0.1);
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // 2. Traffic light state transition logic
  useEffect(() => {
    if (!isPlaying) return;

    const sc = compiledPhases.length > 0 ? compiledPhases.length : 4;
    const idx = currentPhase % sc;
    const currentMaxGreen = phaseTimings[idx] ?? DEFAULT_PHASE_GREEN_SECONDS;

    if (lightState === 'GREEN' && timer >= currentMaxGreen) {
      setLightState('YELLOW');
      addLog(`${formatActiveMovements(activeMovements)} YELLOW`, 'var(--yellow)');
      setTimer(0);
    } else if (lightState === 'YELLOW' && timer >= DEFAULT_TIMINGS.yellow) {
      setLightState('RED');
      addLog('ALL RED WAIT', 'var(--red)');
      setTimer(0);
    } else if (lightState === 'RED' && timer >= DEFAULT_TIMINGS.allRed) {
      let nextPhaseIndex = 0;
      let nextMovements: Movement[] = [];
      if (compiledPhases.length > 0) {
          nextPhaseIndex = (currentPhase + 1) % compiledPhases.length;
          nextMovements = compiledPhases[nextPhaseIndex]?.movements || [];
      } else {
          nextPhaseIndex = (currentPhase + 1) % 4;
          nextMovements = getActiveMovements(nextPhaseIndex);
      }
      setLightState('GREEN');
      setCurrentPhase(nextPhaseIndex);
      addLog(`${formatActiveMovements(nextMovements)} START`, 'var(--major)');
      setTimer(0);
    }
  }, [timer, isPlaying, lightState, currentPhase, phaseTimings, activeMovements, compiledPhases, addLog, getActiveMovements]);

  // 1. TRAFFIC GENERATOR (PRODUCER)
  // This only calculates demand and adds it to the off-screen queue.
  // It NO LONGER spawns cars directly or checks road distance.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setOffScreenQueues(prev => {
        const next = { ...prev };
        let changed = false;
        LANES.forEach(lane => {
          const rate = trafficRates[lane.direction];
          // If random roll succeeds, add a car to this lane's queue
          if (Math.random() < rate) {
            next[lane.id] = (next[lane.id] || 0) + 1;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying, trafficRates]);

  // 2. QUEUE DRAINER / SPAWNER (CONSUMER)
  // This is the ONLY place where cars are spawned onto the canvas.
  // It checks if there's space and moves a car from the queue to the road.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setOffScreenQueues(prev => {
        const next = { ...prev };
        let changed = false;
        const laneCars = new Map<string, Vehicle[]>();
        vehiclesRef.current.forEach(v => {
          let arr = laneCars.get(v.laneId);
          if (!arr) {
            arr = [];
            laneCars.set(v.laneId, arr);
          }
          arr.push(v);
        });
        
        LANES.forEach(lane => {
          // Only attempt to spawn if there's a backlog
          if (next[lane.id] > 0) {
            const carsInLane = laneCars.get(lane.id) || [];
            
            // Find distance to the closest car in this lane
            const edgeDistSq = carsInLane.reduce((minDistSq, v) => {
              const dx = v.x - lane.startX;
              const dy = v.y - lane.startY;
              const dSq = dx * dx + dy * dy;
              return dSq < minDistSq ? dSq : minDistSq;
            }, Infinity);

            // Logic optimization: If the car ahead is moving, reduce the required distance to enter
            const currentLaneSpeed = carsInLane.length > 0 ? Math.abs(carsInLane[0].vy || carsInLane[0].vx) : 0;
            
            const r = Math.random();
            let vType: 'CAR' | 'MOTORCYCLE' | 'BUS' | 'TRUCK' = 'CAR';
            let width = 18, length = 30, cruiseSpeed = 2.5 + Math.random(), accel = 0.08, decel = 0.2;
            
            if (r < 0.15) {
              vType = 'MOTORCYCLE'; width = 8; length = 18; cruiseSpeed = 3.0 + Math.random(); accel = 0.12; decel = 0.3;
            } else if (r < 0.25) {
              vType = 'BUS'; width = 20; length = 60; cruiseSpeed = 1.5 + Math.random(); accel = 0.04; decel = 0.1;
            } else if (r < 0.40) {
              vType = 'TRUCK'; width = 20; length = 45; cruiseSpeed = 1.8 + Math.random(); accel = 0.05; decel = 0.12;
            }

            const safeDist = BASE_SAFE_GAP + length / 2 + (carsInLane[0]?.length || 30) / 2;
            const dynamicEntryDist = currentLaneSpeed > 1 ? safeDist * 0.6 : safeDist;

            // If the entrance is clear (dynamic), move car from queue to road
            if (edgeDistSq > dynamicEntryDist * dynamicEntryDist) {
              const startAngle = lane.direction === 'N' ? -Math.PI/2 : lane.direction === 'S' ? Math.PI/2 : lane.direction === 'E' ? 0 : Math.PI;
              const colorIdx = Math.floor(((cruiseSpeed - 1.5) / 2.5) * VEHICLE_COLORS.length);
              const color = VEHICLE_COLORS[Math.max(0, Math.min(VEHICLE_COLORS.length - 1, colorIdx))];

              const newVehicle: Vehicle = {
                id: Math.random().toString(36).substr(2, 9),
                vType,
                accel,
                decel,
                x: lane.startX,
                y: lane.startY,
                vx: 0,
                vy: 0,
                angle: startAngle,
                laneId: lane.id,
                color: color,
                width,
                length,
                cruiseSpeed: cruiseSpeed,
                startDelay: 0.1 + Math.random() * 0.3,
                spawnAtMs: performance.now(),
              };

              vehiclesRef.current.push(newVehicle);
              next[lane.id]--; // Decrement the overflow count
              changed = true;
            }
          }
        });
        return changed ? next : prev;
      });
    }, 150); // High frequency check ensures cars spawn as soon as there is a gap
    return () => clearInterval(interval);
  }, [isPlaying]);

  const update = useCallback((time: number) => {
    const vehicles = vehiclesRef.current;
    
    // Pre-bucket vehicles by lane for O(1) collision candidate lookups (no allocations)
    const laneCars = laneCarsCacheRef.current;
    for (const k in laneCars) laneCars[k].length = 0;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (laneCars[v.laneId]) laneCars[v.laneId].push(v);
    }

    vehicles.forEach((v) => {
      const lane = LANE_MAP.get(v.laneId)!;
      const isGreen = activeMovements.includes(lane.movement) && lightState === 'GREEN';
      const isYellow = activeMovements.includes(lane.movement) && lightState === 'YELLOW';
      
      // Target Speed
      let targetSpeed = v.cruiseSpeed;
      if (time - v.spawnAtMs < v.startDelay * 1000) {
        targetSpeed = 0;
      }
      
      // Distance to intersection stop line
      let distToStop = Infinity;
      if (lane.direction === 'N') distToStop = v.y - (CANVAS_SIZE / 2 + STOP_LINE);
      if (lane.direction === 'S') distToStop = (CANVAS_SIZE / 2 - STOP_LINE) - v.y;
      if (lane.direction === 'E') distToStop = (CANVAS_SIZE / 2 - STOP_LINE) - v.x;
      if (lane.direction === 'W') distToStop = v.x - (CANVAS_SIZE / 2 + STOP_LINE);

      // Light logic
      if (!isGreen) {
        if (distToStop > 0 && distToStop < 100) {
          if (!isYellow || distToStop > 40) {
            targetSpeed = 0;
          }
        }
      }

      // Car following logic
      let carAhead: Vehicle | undefined = undefined;
      const candidates = v.isTurning ? vehicles : (laneCars[v.laneId] || []);
      for (let i = 0; i < candidates.length; i++) {
        const other = candidates[i];
        if (other.id === v.id) continue;
        if (other.laneId !== v.laneId && !(v.isTurning && other.isTurning)) continue;

        const safeDist = BASE_SAFE_GAP + v.length / 2 + other.length / 2;

        if (v.isTurning && other.isTurning) {
          const dx = other.x - v.x;
          const dy = other.y - v.y;
          const distSq = dx * dx + dy * dy;

          if (other.laneId === v.laneId) {
            if (distSq < safeDist * safeDist && (other.turnProgress ?? 0) > (v.turnProgress ?? 0)) {
              carAhead = other;
              break;
            }
          } else {
            if (distSq < (safeDist * 0.7) * (safeDist * 0.7)) {
              carAhead = other;
              break;
            }
          }
          continue;
        }

        if (lane.direction === 'N' && other.y < v.y && (v.y - other.y) < safeDist) { carAhead = other; break; }
        if (lane.direction === 'S' && other.y > v.y && (other.y - v.y) < safeDist) { carAhead = other; break; }
        if (lane.direction === 'E' && other.x > v.x && (other.x - v.x) < safeDist) { carAhead = other; break; }
        if (lane.direction === 'W' && other.x < v.x && (v.x - other.x) < safeDist) { carAhead = other; break; }
      }

      if (carAhead) {
        const safeDist = BASE_SAFE_GAP + v.length / 2 + carAhead.length / 2;
        const dx = carAhead.x - v.x;
        const dy = carAhead.y - v.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const otherSpeed = Math.sqrt(carAhead.vx * carAhead.vx + carAhead.vy * carAhead.vy);
        
        if (dist < safeDist * 0.7) {
          targetSpeed = Math.min(targetSpeed, otherSpeed * 0.5);
        } else {
          targetSpeed = Math.min(targetSpeed, otherSpeed);
        }
        if (targetSpeed < 0.1) targetSpeed = 0;
      }

      // Physics
      const currentSpeed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      let accel = 0;
      if (currentSpeed < targetSpeed) accel = v.accel;
      else if (currentSpeed > targetSpeed) accel = -v.decel;

      const newSpeed = Math.max(0, currentSpeed + accel);
      
      if (newSpeed < currentSpeed - 0.001) {
          v.brakeIntensity = Math.min(1, (currentSpeed - newSpeed) / v.decel);
      } else {
          v.brakeIntensity = 0;
      }
      
      if (newSpeed > 0.1) {
          v.angle = Math.atan2(v.vy, v.vx);
      }
      
      // Turning logic
      if (!v.isTurning) {
        const inIntersection = Math.abs(v.x - CANVAS_SIZE / 2) < INTERSECTION_SIZE / 2 && Math.abs(v.y - CANVAS_SIZE / 2) < INTERSECTION_SIZE / 2;
        if (inIntersection) {
            const centerX = CANVAS_SIZE / 2;
            const centerY = CANVAS_SIZE / 2;
            let shouldStart = false;

            if (lane.type === 'LEFT' || lane.type === 'RIGHT') {
                let crossed = false;
                if (lane.direction === 'N' && v.y <= centerY + 120) crossed = true;
                else if (lane.direction === 'S' && v.y >= centerY - 120) crossed = true;
                else if (lane.direction === 'E' && v.x >= centerX - 120) crossed = true;
                else if (lane.direction === 'W' && v.x <= centerX + 120) crossed = true;

                if (crossed) {
                    const geom = getPathGeometry(lane, centerX, centerY);
                    if (geom.type === 'ARC') {
                        v.turnCenterX = geom.centerX;
                        v.turnCenterY = geom.centerY;
                        v.turnRadius = geom.radius;
                        v.turnAngleStart = geom.startAngle;
                        v.turnAngleEnd = geom.endAngle;
                        shouldStart = true;
                    }
                }
            }

            if (shouldStart) {
                v.isTurning = true;
                v.turnProgress = 0;
            }
        }
      }

      if (v.isTurning) {
          const angularSpeed = newSpeed / v.turnRadius!;
          v.turnProgress = Math.min(1, v.turnProgress! + (angularSpeed / (Math.PI / 2)));
          
          const currentAngle = v.turnAngleStart! + (v.turnAngleEnd! - v.turnAngleStart!) * v.turnProgress;
          v.x = v.turnCenterX! + v.turnRadius! * Math.cos(currentAngle);
          v.y = v.turnCenterY! + v.turnRadius! * Math.sin(currentAngle);
          
          // Tangent direction for visual angle
          const tangentAngle = currentAngle + (v.turnAngleEnd! > v.turnAngleStart! ? Math.PI/2 : -Math.PI/2);
          v.vx = Math.cos(tangentAngle) * newSpeed;
          v.vy = Math.sin(tangentAngle) * newSpeed;
          v.angle = tangentAngle;

          if (v.turnProgress >= 1) {
              v.isTurning = false;
              // Set final velocity based on exit direction and HANDOVER to new laneId
              if (lane.type === 'LEFT') {
                  if (lane.direction === 'N') { v.vx = -newSpeed; v.vy = 0; v.laneId = 'wb-left'; }
                  if (lane.direction === 'S') { v.vx = newSpeed; v.vy = 0; v.laneId = 'eb-left'; }
                  if (lane.direction === 'E') { v.vx = 0; v.vy = -newSpeed; v.laneId = 'nb-left'; }
                  if (lane.direction === 'W') { v.vx = 0; v.vy = newSpeed; v.laneId = 'sb-left'; }
              } else {
                  // RIGHT
                  if (lane.direction === 'N') { v.vx = newSpeed; v.vy = 0; v.laneId = 'eb-right'; }
                  if (lane.direction === 'S') { v.vx = -newSpeed; v.vy = 0; v.laneId = 'wb-right'; }
                  if (lane.direction === 'E') { v.vx = 0; v.vy = newSpeed; v.laneId = 'sb-right'; }
                  if (lane.direction === 'W') { v.vx = 0; v.vy = -newSpeed; v.laneId = 'nb-right'; }
              }
          }
      } else {
          if (lane.direction === 'N') { v.vy = -newSpeed; v.vx = 0; }
          if (lane.direction === 'S') { v.vy = newSpeed; v.vx = 0; }
          if (lane.direction === 'E') { v.vx = newSpeed; v.vy = 0; }
          if (lane.direction === 'W') { v.vx = -newSpeed; v.vy = 0; }

          v.x += v.vx;
          v.y += v.vy;
      }
    });

    // In-place filter to heavily reduce garbage collection thrashing
    let validCount = 0;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (v.x >= -50 && v.x <= CANVAS_SIZE + 50 && v.y >= -50 && v.y <= CANVAS_SIZE + 50) {
        vehicles[validCount++] = v;
      }
    }
    vehicles.length = validCount;
  }, [activeMovements, lightState]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, time: number) => {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE / 2;

    if (!bgCanvasRef.current) {
      const bg = document.createElement('canvas');
      bg.width = CANVAS_SIZE; bg.height = CANVAS_SIZE;
      const bCtx = bg.getContext('2d');
      if (bCtx) {
        bCtx.fillStyle = '#1A1D23';
        bCtx.fillRect(centerX - INTERSECTION_SIZE / 2, 0, INTERSECTION_SIZE, CANVAS_SIZE);
        bCtx.fillRect(0, centerY - INTERSECTION_SIZE / 2, CANVAS_SIZE, INTERSECTION_SIZE);
        bCtx.fillStyle = '#0D0F12';
        bCtx.fillRect(centerX - INTERSECTION_SIZE / 2, centerY - INTERSECTION_SIZE / 2, INTERSECTION_SIZE, INTERSECTION_SIZE);
        bCtx.strokeStyle = '#2D333B';
        bCtx.lineWidth = 1;

        const drawLaneMarkers = (x: number, y: number, length: number, horizontal: boolean) => {
          if (horizontal) {
            bCtx.moveTo(x, y); bCtx.lineTo(x + length, y);
          } else {
            bCtx.moveTo(x, y); bCtx.lineTo(x, y + length);
          }
        };

        bCtx.setLineDash([]);
        bCtx.lineWidth = 2;
        bCtx.strokeStyle = '#444c56';
        bCtx.beginPath();
        bCtx.moveTo(centerX - 2, 0); bCtx.lineTo(centerX - 2, centerY - INTERSECTION_SIZE / 2);
        bCtx.moveTo(centerX + 2, 0); bCtx.lineTo(centerX + 2, centerY - INTERSECTION_SIZE / 2);
        bCtx.moveTo(centerX - 2, centerY + INTERSECTION_SIZE / 2); bCtx.lineTo(centerX - 2, CANVAS_SIZE);
        bCtx.moveTo(centerX + 2, centerY + INTERSECTION_SIZE / 2); bCtx.lineTo(centerX + 2, CANVAS_SIZE);
        bCtx.moveTo(0, centerY - 2); bCtx.lineTo(centerX - INTERSECTION_SIZE / 2, centerY - 2);
        bCtx.moveTo(0, centerY + 2); bCtx.lineTo(centerX - INTERSECTION_SIZE / 2, centerY + 2);
        bCtx.moveTo(centerX + INTERSECTION_SIZE / 2, centerY - 2); bCtx.lineTo(CANVAS_SIZE, centerY - 2);
        bCtx.moveTo(centerX + INTERSECTION_SIZE / 2, centerY + 2); bCtx.lineTo(CANVAS_SIZE, centerY + 2);
        bCtx.stroke();

        bCtx.strokeStyle = '#2D333B';
        bCtx.lineWidth = 1;
        bCtx.setLineDash([20, 20]);
        bCtx.beginPath();
        [LANE_WIDTH, LANE_WIDTH * 2].forEach(offset => {
          drawLaneMarkers(centerX + offset, 0, centerY - INTERSECTION_SIZE / 2, false);
          drawLaneMarkers(centerX - offset, 0, centerY - INTERSECTION_SIZE / 2, false);
          drawLaneMarkers(centerX + offset, centerY + INTERSECTION_SIZE / 2, CANVAS_SIZE - (centerY + INTERSECTION_SIZE / 2), false);
          drawLaneMarkers(centerX - offset, centerY + INTERSECTION_SIZE / 2, CANVAS_SIZE - (centerY + INTERSECTION_SIZE / 2), false);
          drawLaneMarkers(0, centerY + offset, centerX - INTERSECTION_SIZE / 2, true);
          drawLaneMarkers(0, centerY - offset, centerX - INTERSECTION_SIZE / 2, true);
          drawLaneMarkers(centerX + INTERSECTION_SIZE / 2, centerY + offset, CANVAS_SIZE - (centerX + INTERSECTION_SIZE / 2), true);
          drawLaneMarkers(centerX + INTERSECTION_SIZE / 2, centerY - offset, CANVAS_SIZE - (centerX + INTERSECTION_SIZE / 2), true);
        });
        bCtx.stroke();

        bCtx.setLineDash([]);
        bCtx.lineWidth = 2;
        bCtx.strokeStyle = '#2D333B';
        bCtx.beginPath();
        bCtx.moveTo(centerX - INTERSECTION_SIZE / 2, centerY - STOP_LINE); bCtx.lineTo(centerX + INTERSECTION_SIZE / 2, centerY - STOP_LINE);
        bCtx.moveTo(centerX - INTERSECTION_SIZE / 2, centerY + STOP_LINE); bCtx.lineTo(centerX + INTERSECTION_SIZE / 2, centerY + STOP_LINE);
        bCtx.moveTo(centerX - STOP_LINE, centerY - INTERSECTION_SIZE / 2); bCtx.lineTo(centerX - STOP_LINE, centerY + INTERSECTION_SIZE / 2);
        bCtx.moveTo(centerX + STOP_LINE, centerY - INTERSECTION_SIZE / 2); bCtx.lineTo(centerX + STOP_LINE, centerY + INTERSECTION_SIZE / 2);
        bCtx.stroke();

        const drawRoadArrow = (x: number, y: number, angle: number, icon: string) => {
          bCtx.save();
          bCtx.translate(x, y);
          bCtx.rotate(angle);
          bCtx.fillStyle = '#FFFFFF';
          bCtx.font = '700 24px "Material Symbols Outlined"';
          bCtx.textAlign = 'center';
          bCtx.textBaseline = 'middle';
          bCtx.fillText(icon, 0, 0);
          bCtx.restore();
        };

        const drawStaticLabel = (label: string, x: number, y: number) => {
          bCtx.fillStyle = '#FFFFFF';
          bCtx.textAlign = 'left';
          bCtx.textBaseline = 'top';
          bCtx.font = 'bold 12px "JetBrains Mono"';
          bCtx.fillText(label, x, y);
        };

        drawStaticLabel('NORTHBOUND', centerX + INTERSECTION_SIZE / 2 + 20, CANVAS_SIZE - 60);
        drawStaticLabel('SOUTHBOUND', centerX - INTERSECTION_SIZE / 2 - 140, 40);
        drawStaticLabel('EASTBOUND', 40, centerY + INTERSECTION_SIZE / 2 + 20);
        drawStaticLabel('WESTBOUND', CANVAS_SIZE - 160, centerY - INTERSECTION_SIZE / 2 - 40);

        drawRoadArrow(centerX + 20, centerY + 170, 0, 'turn_left');
        drawRoadArrow(centerX + 60, centerY + 170, 0, 'arrow_upward');
        drawRoadArrow(centerX + 100, centerY + 170, 0, 'turn_right');
        drawRoadArrow(centerX - 20, centerY - 170, Math.PI, 'turn_left');
        drawRoadArrow(centerX - 60, centerY - 170, Math.PI, 'arrow_upward');
        drawRoadArrow(centerX - 100, centerY - 170, Math.PI, 'turn_right');
        drawRoadArrow(centerX - 170, centerY + 20, Math.PI/2, 'turn_left');
        drawRoadArrow(centerX - 170, centerY + 60, Math.PI/2, 'arrow_upward');
        drawRoadArrow(centerX - 170, centerY + 100, Math.PI/2, 'turn_right');
        drawRoadArrow(centerX + 170, centerY - 20, -Math.PI/2, 'turn_left');
        drawRoadArrow(centerX + 170, centerY - 60, -Math.PI/2, 'arrow_upward');
        drawRoadArrow(centerX + 170, centerY - 100, -Math.PI/2, 'turn_right');
      }
      bgCanvasRef.current = bg;
    }

    ctx.drawImage(bgCanvasRef.current, 0, 0);

    const drawIntersectionPaths = () => {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);

      LANES.forEach((lane) => {
        const isActive = activeMovements.includes(lane.movement) && (lightState === 'GREEN' || lightState === 'YELLOW');
        ctx.strokeStyle = isActive ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.05)';
        
        const geom = getPathGeometry(lane, centerX, centerY);
        ctx.beginPath();
        if (geom.type === 'STRAIGHT') {
          ctx.moveTo(geom.startX, geom.startY);
          ctx.lineTo(geom.endX, geom.endY);
        } else if (geom.type === 'ARC') {
          ctx.arc(geom.centerX, geom.centerY, geom.radius, geom.startAngle, geom.endAngle, geom.counterClockwise);
        }
        ctx.stroke();
      });

      ctx.restore();
    };

    drawIntersectionPaths();

    const drawSignal = (x: number, y: number, angle: number, movements: Movement[], isLeft: boolean = false) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      const isActive = movements.some(m => activeMovements.includes(m));
      const currentHeadState = isActive ? lightState : 'RED';

      // Housing
      ctx.fillStyle = '#1A1D23';
      ctx.strokeStyle = '#2D333B';
      ctx.lineWidth = 1;
      
      const housingWidth = 16;
      const housingHeight = 46;
      ctx.fillRect(-housingWidth / 2, -housingHeight / 2, housingWidth, housingHeight);
      ctx.strokeRect(-housingWidth / 2, -housingHeight / 2, housingWidth, housingHeight);

      // Lights positions (Flip order for horizontal signals as per user request)
      const isHorizontal = Math.abs(angle % Math.PI) > 0.1 && Math.abs(angle % Math.PI) < Math.PI - 0.1;

      const drawLight = (state: string, color: string, offColor: string, posY: number) => {
        const isOn = currentHeadState === state;
        ctx.fillStyle = isOn ? color : offColor;
        ctx.beginPath();
        ctx.arc(0, posY, 5, 0, Math.PI * 2);
        ctx.fill();

        if (isOn) {
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.arc(0, posY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }

        if (isLeft) {
            // Draw small arrow inside the light
            ctx.strokeStyle = isOn ? '#FFFFFF' : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(1.5, posY); ctx.lineTo(-1.5, posY);
            ctx.lineTo(0.5, posY - 2); ctx.moveTo(-1.5, posY);
            ctx.lineTo(0.5, posY + 2);
            ctx.stroke();
        }
      };

      drawLight('RED', '#F85149', '#301010', isHorizontal ? 14 : -14);
      drawLight('YELLOW', '#D29922', '#201800', 0);
      drawLight('GREEN', '#3FB950', '#001800', isHorizontal ? -14 : 14);

      ctx.restore();
    };

    const drawDynamicQueue = (prefix: string, x: number, y: number) => {
      const qL = offScreenQueues[prefix + '-left'] || 0;
      const qT = offScreenQueues[prefix + '-thru'] || 0;
      const qR = offScreenQueues[prefix + '-right'] || 0;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '12px "JetBrains Mono"';
      ctx.fillStyle = (qL > 0 || qT > 0 || qR > 0) ? '#FFFFFF' : '#8B949E';
      ctx.fillText(`L:+${qL} T:+${qT} R:+${qR}`, x, y + 16);
    };

    drawDynamicQueue('nb', centerX + INTERSECTION_SIZE / 2 + 20, CANVAS_SIZE - 60);
    drawDynamicQueue('sb', centerX - INTERSECTION_SIZE / 2 - 140, 40);
    drawDynamicQueue('eb', 40, centerY + INTERSECTION_SIZE / 2 + 20);
    drawDynamicQueue('wb', CANVAS_SIZE - 160, centerY - INTERSECTION_SIZE / 2 - 40);

    // 2. Draw Vehicles (Middle Layer)
    vehiclesRef.current.forEach(v => {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle);
      
      // Car body
      ctx.fillStyle = v.color;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-v.length / 2, -v.width / 2, v.length, v.width, 2);
      ctx.fill();
      ctx.stroke();

      // Extra visual details based on vehicle type
      if (v.vType === 'BUS' || v.vType === 'TRUCK') {
        ctx.fillStyle = '#1A1D23';
        ctx.fillRect(-v.length / 2 + 5, -v.width / 2 + 2, 10, v.width - 4); // windshield
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(-v.length / 2 + 20, -v.width / 2 + 2, v.length - 25, v.width - 4); // roof detail
      } else if (v.vType === 'CAR') {
        ctx.fillStyle = '#1A1D23';
        ctx.fillRect(-v.length / 2 + 8, -v.width / 2 + 2, 6, v.width - 4); // windshield
        ctx.fillRect(v.length / 2 - 6, -v.width / 2 + 2, 4, v.width - 4); // rear window
      }

      const lane = LANE_MAP.get(v.laneId);
      
      // Tail lights if braking or stopped
      const isStopped = Math.abs(v.vx) < 0.1 && Math.abs(v.vy) < 0.1;
      const brakeIntensity = v.brakeIntensity || 0;
      const isMoto = v.vType === 'MOTORCYCLE';
      const lightW = isMoto ? 2 : 3;
      const lightL = isMoto ? 4 : 6;
      const rightLightY = isMoto ? -lightL / 2 : v.width / 2 - lightL;
      const leftLightY = isMoto ? -lightL / 2 : -v.width / 2;

      if (isStopped || brakeIntensity > 0) {
        ctx.globalAlpha = isStopped ? 1 : 0.3 + 0.7 * Math.min(1, brakeIntensity);
        ctx.fillStyle = '#F85149';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.5;
        
        if (lane?.type !== 'LEFT' || isMoto) {
          ctx.fillRect(-v.length / 2, leftLightY, lightW, lightL);
          ctx.strokeRect(-v.length / 2, leftLightY, lightW, lightL);
        }
        if (!isMoto && lane?.type !== 'RIGHT') {
          ctx.fillRect(-v.length / 2, rightLightY, lightW, lightL);
          ctx.strokeRect(-v.length / 2, rightLightY, lightW, lightL);
        }
        ctx.globalAlpha = 1.0;
      }

      // Turn signals
      if (Math.floor(time / 350) % 2 === 0) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.5;
        ctx.fillStyle = '#FFD700'; // Yellow
        if (lane?.type === 'LEFT') {
          ctx.fillRect(-v.length / 2, leftLightY, lightW, lightL);
          ctx.strokeRect(-v.length / 2, leftLightY, lightW, lightL);
        } else if (lane?.type === 'RIGHT') {
          ctx.fillRect(-v.length / 2, rightLightY, lightW, lightL);
          ctx.strokeRect(-v.length / 2, rightLightY, lightW, lightL);
        }
      }
      
      ctx.restore();
    });

    // 3. Signal Lights (Top Layer)
    drawSignal(centerX + 100, centerY + 130, 0, [Movement.NORTHBOUND_RIGHT]);
    drawSignal(centerX + 60, centerY + 130, 0, [Movement.NORTHBOUND_STRAIGHT]);
    drawSignal(centerX + 20, centerY + 130, 0, [Movement.NORTHBOUND_LEFT], true);
    
    drawSignal(centerX - 100, centerY - 130, Math.PI, [Movement.SOUTHBOUND_RIGHT]);
    drawSignal(centerX - 60, centerY - 130, Math.PI, [Movement.SOUTHBOUND_STRAIGHT]);
    drawSignal(centerX - 20, centerY - 130, Math.PI, [Movement.SOUTHBOUND_LEFT], true);
    
    drawSignal(centerX - 130, centerY + 100, -Math.PI/2, [Movement.EASTBOUND_RIGHT]);
    drawSignal(centerX - 130, centerY + 60, -Math.PI/2, [Movement.EASTBOUND_STRAIGHT]);
    drawSignal(centerX - 130, centerY + 20, -Math.PI/2, [Movement.EASTBOUND_LEFT], true);
    
    drawSignal(centerX + 130, centerY - 100, Math.PI/2, [Movement.WESTBOUND_RIGHT]);
    drawSignal(centerX + 130, centerY - 60, Math.PI/2, [Movement.WESTBOUND_STRAIGHT]);
    drawSignal(centerX + 130, centerY - 20, Math.PI/2, [Movement.WESTBOUND_LEFT], true);

  }, [activeMovements, lightState, offScreenQueues]);

  const loop = useCallback((time: number) => {
    if (lastTimeRef.current !== null && isPlaying) {
      update(time);
    }
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) draw(ctx, time);
    
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(loop);
  }, [isPlaying, update, draw]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop]);

  const handlePhaseTimingChange = (phaseIndex: number, val: number) => {
    setPhaseTimings((prev) => {
      const sc = compiledPhases.length > 0 ? compiledPhases.length : 4;
      const next = Array.from({ length: sc }, (_, i) => prev[i] ?? DEFAULT_PHASE_GREEN_SECONDS);
      const sumOthers = next.reduce((a, v, j) => (j === phaseIndex ? a : a + v), 0);
      const cap = MAX_TOTAL_LOOP_SECONDS - sumOthers;
      next[phaseIndex] = Math.max(MIN_PHASE_GREEN_SECONDS, Math.min(val, cap));
      return clampPhaseTimingsToLoopCap(next, sc);
    });
  };

  const getPercentage = () => {
      const sc = compiledPhases.length > 0 ? compiledPhases.length : 4;
      const idx = currentPhase % sc;
      const currentMax = phaseTimings[idx] ?? DEFAULT_PHASE_GREEN_SECONDS;

      if (lightState === 'GREEN') return (timer / Math.max(currentMax, 1)) * 100;
      if (lightState === 'YELLOW') return (timer / DEFAULT_TIMINGS.yellow) * 100;
      return (timer / DEFAULT_TIMINGS.allRed) * 100;
  };

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const phaseRowCount = compiledPhases.length > 0 ? compiledPhases.length : 4;
  const cycleLength = Array.from({ length: phaseRowCount }, (_, i) => phaseTimings[i] ?? DEFAULT_PHASE_GREEN_SECONDS).reduce((a, b) => a + b, 0);

  return (
    <div className={`h-screen w-full grid ${sidebarCollapsed ? 'grid-cols-[0px_minmax(0,1fr)]' : 'grid-cols-[280px_minmax(0,1fr)]'} grid-rows-[48px_minmax(0,1fr)] transition-[grid-template-columns] duration-300 ease-in-out overflow-hidden bg-[#0D0F12]`}>
      {/* Header Area */}
      <header className="col-span-full bg-[#1A1D23] border-b border-[#2D333B] flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3 font-mono font-bold tracking-wider text-xs">
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 hover:bg-white/5 rounded transition-colors text-[#C9D1D9] hover:text-white flex items-center justify-center"
            title={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <span className="text-[#3FB950] shrink-0">●</span>
          <span>TRAFFIC_SEC_082_V4.2</span>
          <span className="bg-[#3FB950]/10 text-[#3FB950] px-2 py-0.5 rounded border border-[#3FB950] text-[11px]">OPERATIONAL</span>
        </div>
        <div className="font-mono text-xs text-[#C9D1D9] flex items-center gap-6">
          <div>CYCLE: {cycleLength}s / {MAX_TOTAL_LOOP_SECONDS}s</div>
        </div>
      </header>

      {/* Left Sidebar: Controls & Monitors */}
      <aside className={`col-start-1 row-start-2 bg-[#1A1D23] border-r border-[#2D333B] p-4 flex flex-col gap-6 overflow-y-auto scrollbar-hide min-h-0 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'opacity-0 pointer-events-none translate-x-[-100%]' : 'opacity-100 translate-x-0'}`}>
        <CollapsibleSection id="monitor" title="MONITOR" isCollapsed={collapsed.monitor} onToggle={toggleCollapsed}>
          <div className="bg-black/20 border border-[#2D333B] p-3 rounded flex flex-col overflow-hidden">
             <div className="flex justify-between items-center mb-2">
               <div className="flex items-center gap-3">
                 <span className="text-[10px] font-mono font-bold tracking-wider text-[#3FB950]">
                   {compiledPhases[currentPhase]?.label || `PHASE_${currentPhase + 1}`}
                 </span>
                 <div className="text-xl font-mono text-[#3FB950]">{timer.toFixed(1)}s</div>
               </div>
               <div className="flex items-center gap-1.5">
                 <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${lightState === 'GREEN' ? 'bg-[#3FB950] text-[#0D0F12]' : lightState === 'YELLOW' ? 'bg-[#D29922] text-[#0D0F12]' : 'bg-[#F85149] text-[#0D0F12]'}`}>
                   {lightState}
                 </span>
                 {isPlaying && (
                   <span className="text-[9px] bg-[#3FB950] text-[#0D0F12] px-1 py-0.5 rounded font-bold animate-pulse">
                     ACTIVE
                   </span>
                 )}
               </div>
             </div>

             <div className="flex flex-col gap-1 overflow-y-auto scrollbar-hide flex-1 max-h-32 mb-2">
               {DIRECTIONS.map(dir => {
                 const movements = activeMovements.filter(m => getDirection(m) === dir);
                 if (movements.length === 0) return null;
                 const sortedMovements = [...movements].sort((a, b) => {
                   const valA = a % 3 === 0 ? 3 : a % 3;
                   const valB = b % 3 === 0 ? 3 : b % 3;
                   return valA - valB;
                 });

                 return (
                   <div key={dir} className="flex items-center justify-between gap-2 border-b border-[#2D333B]/30 last:border-0 pb-1 last:pb-0">
                     <div className="text-[9px] text-[#C9D1D9] font-mono tracking-tighter uppercase opacity-90 shrink-0">
                       {dir.replace('BOUND', '')}
                     </div>
                     <div className="flex gap-1">
                       {sortedMovements.map(m => (
                         <span 
                           key={m} 
                           title={MovementLabels[m]}
                           className="flex items-center justify-center w-6 h-6 rounded border border-[#3FB950]/30 bg-[#3FB950]/10 text-[#3FB950]"
                         >
                           {getMovementIcon(m, 12)}
                         </span>
                       ))}
                     </div>
                   </div>
                 );
               })}
             </div>

             <div className="h-1 bg-[#2D333B] w-full rounded-full overflow-hidden shrink-0">
               <div className="h-full bg-[#3FB950] transition-all duration-100" style={{ width: `${getPercentage()}%` }} />
             </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="load" title="TRAFFIC LOAD" isCollapsed={collapsed.load} onToggle={toggleCollapsed}>
          <div className="bg-black/20 border border-[#2D333B] p-3 rounded flex flex-col gap-1">
             <div className="text-[10px] uppercase text-[#8B949E] tracking-wider">NETWORK DENSITY</div>
             <div className="text-2xl font-mono text-[#D29922]">
               {vehiclesRef.current.length.toString().padStart(2, '0')}
               <span className="text-[10px] text-[#8B949E] ml-2">ON_ROAD</span>
             </div>
             <div className="text-lg font-mono text-[#D29922]/70 -mt-1">
               {Object.values(offScreenQueues).reduce((a, b) => a + b, 0).toString().padStart(2, '0')}
               <span className="text-[9px] text-[#8B949E] ml-2 uppercase">WAITING</span>
             </div>
             <div className="text-[10px] text-[#8B949E] font-mono uppercase mt-1 px-1.5 py-0.5 bg-black/40 rounded border border-[#2D333B]/50 w-fit">
                {vehiclesRef.current.length > 20 ? 'CONGESTION_HIGH' : vehiclesRef.current.length > 10 ? 'CONGESTION_MID' : 'NOMINAL_FLOW'}
             </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="editor" title="PHASE SEQUENCE" isCollapsed={collapsed.editor} onToggle={toggleCollapsed}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 mb-2">
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => applyTemplate(userTemplate)}
                  className={`flex-1 text-[10px] py-1 rounded font-mono border transition-all ${programCode === userTemplate ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}
                  title={userTemplate ? "Load Saved Template" : "No saved template"}
                >
                  USR
                </button>
                <button 
                  onClick={saveUserTemplate}
                  className="px-2 py-1 rounded bg-black/20 border border-[#2D333B] text-[#C9D1D9] hover:text-[#3FB950] hover:border-[#3FB950]/40 transition-colors"
                  title="Save current as USR"
                >
                  <Save size={12} />
                </button>
                <div className="w-[1px] h-4 bg-[#2D333B] mx-0.5" />
                {PHASE_TEMPLATES.map((t, i) => {
                  const shortNames = ['STD', 'ART', 'SWP', 'CNT'];
                  const isActive = programCode === t.code;
                  return (
                    <button 
                      key={t.name}
                      onClick={() => applyTemplate(t.code)}
                      className={`flex-1 text-[10px] py-1 rounded font-mono border transition-all ${isActive ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}
                      title={t.name}
                    >
                      {shortNames[i]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-[#C9D1D9]/70 font-mono leading-tight">
                {isEditMode ? '# Syntax: phase(N): then KEYWORD.GO lines (e.g. NORTH_STRAIGHT.GO).' : 'VIEW_MODE (READ_ONLY)'}
              </div>
              <button 
                onClick={() => setIsEditMode(!isEditMode)}
                className="text-[11px] px-2 py-0.5 rounded font-mono border border-[#2D333B] hover:bg-white/5 transition-colors text-[#C9D1D9]"
              >
                {isEditMode ? 'SWITCH_TO_VIEW' : 'SWITCH_TO_EDIT'}
              </button>
            </div>

            {isEditMode ? (
              <div className="relative w-full h-64 bg-black/40 border border-[#2D333B] rounded focus-within:border-[#3FB950] transition-colors overflow-hidden">
                <div 
                    ref={highlightRef}
                    className="absolute inset-0 p-2 font-mono text-[12px] pointer-events-none whitespace-pre overflow-hidden border border-transparent" 
                    aria-hidden="true"
                >
                    {programCode.split('\n').map((line, i) => {
                        const activePhase = compiledPhases.length > 0 ? compiledPhases[currentPhase] : null;
                        const isHighlighted = activePhase && i >= activePhase.lineStart && i <= activePhase.lineEnd;
                        return (
                            <div key={i} className={`min-h-[1.5em] ${isHighlighted ? "bg-[#3FB950]/20 rounded-sm -mx-1 px-1" : ""}`}>
                                <span className="opacity-0">{line || ' '}</span>
                            </div>
                        );
                    })}
                </div>
                <textarea
                  ref={textareaRef}
                  value={programCode}
                  onChange={(e) => setProgramCode(e.target.value)}
                  onScroll={(e) => {
                      if (highlightRef.current) {
                          highlightRef.current.scrollTop = e.currentTarget.scrollTop;
                          highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
                      }
                  }}
                  spellCheck={false}
                  className="absolute inset-0 w-full h-full p-2 font-mono text-[12px] text-[#3FB950] bg-transparent resize-none focus:outline-none border border-transparent outline-none leading-[1.5em]"
                />
              </div>
            ) : (
              <div className="w-full max-h-64 overflow-y-auto scrollbar-hide">
                <BadgeView phases={compiledPhases} currentPhase={currentPhase} />
              </div>
            )}

            {programError && (
              <div className="text-[11px] text-[#F85149] font-mono whitespace-pre-wrap leading-tight bg-[#F85149]/10 p-1 border border-[#F85149]/30 rounded">
                {programError}
              </div>
            )}
            <button 
              onClick={() => {
                  compile();
                  addLog("PROGRAM UPDATED", "var(--green)");
                  setIsEditMode(false);
              }}
              className="text-[11px] bg-[#3FB950]/20 text-[#3FB950] py-1 border border-[#3FB950]/40 rounded hover:bg-[#3FB950]/30"
            >
              RECOMPILE_PHASES
            </button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="flow" title="TRAFFIC RATES" isCollapsed={collapsed.flow} onToggle={toggleCollapsed}>
            <TrafficFlowRates rates={trafficRates} />
        </CollapsibleSection>

        <CollapsibleSection id="phaseTimings" title="PHASE DURATION" isCollapsed={collapsed.phaseTimings} onToggle={toggleCollapsed}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-[#C9D1D9]/70 mb-1">
              <span>SYSTEM_MODE</span>
              <button 
                onClick={() => setIsAdaptive(!isAdaptive)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${isAdaptive ? 'bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]' : 'bg-gray-800 text-[#C9D1D9] border border-gray-700'}`}
              >
                {isAdaptive ? 'ADAPTIVE_ON' : 'MANUAL_OVERRIDE'}
              </button>
            </div>
            <div className="flex flex-col gap-2 max-h-[min(52vh,28rem)] overflow-y-auto pr-1 scrollbar-hide">
              {Array.from({ length: phaseRowCount }, (_, i) => {
                const label =
                  compiledPhases.length > 0 ? compiledPhases[i].label : `PHASE_${i + 1}`;
                const sec = phaseTimings[i] ?? DEFAULT_PHASE_GREEN_SECONDS;
                const sliderMax = Math.max(
                  MIN_PHASE_GREEN_SECONDS,
                  MAX_TOTAL_LOOP_SECONDS - (cycleLength - sec),
                );
                return (
                  <div key={`${label}-${i}`} className="pb-2 border-b border-[#2D333B]/40 last:border-0">
                    <div className="flex justify-between items-center mb-1 px-0.5 gap-2">
                      <span className="text-[11px] font-mono text-[#C9D1D9] uppercase truncate" title={label}>
                        {label}
                      </span>
                      <span className="text-[11px] text-[#3FB950] font-mono shrink-0">{sec}s</span>
                    </div>
                    <input
                      type="range"
                      min={MIN_PHASE_GREEN_SECONDS}
                      max={sliderMax}
                      value={sec}
                      disabled={isAdaptive}
                      onChange={(e) => handlePhaseTimingChange(i, parseInt(e.target.value, 10))}
                      className="w-full accent-[#3FB950] h-1"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="queue" title="CONGESTION ANALYTICS" isCollapsed={collapsed.queue} onToggle={toggleCollapsed}>
            <QueueChart history={queueHistory} />
        </CollapsibleSection>

        <CollapsibleSection id="analytics" title="PHASE METRICS" isCollapsed={collapsed.analytics} onToggle={toggleCollapsed}>
            <AnalyticalChart history={timingHistory} />
        </CollapsibleSection>

        <CollapsibleSection id="log" title="PHASE LOG" isCollapsed={collapsed.log} onToggle={toggleCollapsed}>
            <div className="overflow-y-auto space-y-1 h-64 pr-2 scrollbar-hide">
                <AnimatePresence initial={false}>
                    {logs.map(log => (
                        <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={log.id} 
                            className="font-mono text-xs flex justify-between border-b border-white/5 py-1"
                        >
                            <span className="text-[#C9D1D9]/60 shrink-0">{log.time}</span>
                            <span className="whitespace-pre-line leading-tight pl-3 text-right" style={{ color: log.color || 'var(--major)' }}>{log.event}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </CollapsibleSection>

        <div className="mt-auto space-y-4 pt-4 border-t border-[#2D333B]">
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-full py-2 rounded text-[13px] font-bold transition-all border ${isPlaying ? 'bg-[#D29922]/10 border-[#D29922] text-[#D29922]' : 'bg-[#3FB950]/10 border-[#3FB950] text-[#3FB950]'}`}
          >
            {isPlaying ? 'PAUSE SYSTEM' : 'RESUME SYSTEM'}
          </button>
          <button 
            onClick={() => {
                vehiclesRef.current = [];
                setCurrentPhase(0);
                setLightState('GREEN');
                setTimer(0);
                addLog('MANUAL RESET', 'var(--minor)');
            }}
            className="w-full py-2 rounded text-[13px] font-bold border border-[#2D333B] text-[#C9D1D9] hover:bg-white/5"
          >
            RESET BUFFER
          </button>
        </div>
      </aside>

      {/* Center Area: Simulator Visual */}
      <main className="col-start-2 row-start-2 relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[radial-gradient(#2D333B_1px,transparent_1px)] bg-[size:32px_32px]">
        <canvas 
          ref={canvasRef} 
          width={CANVAS_SIZE} 
          height={CANVAS_SIZE}
          className="box-border max-h-[min(70vh,100%)] max-w-[min(70vh,100%)] aspect-square w-full rounded border border-[#2D333B] shadow-2xl"
        />
        
      </main>
    </div>
  );
}
