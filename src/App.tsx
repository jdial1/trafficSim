/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, Pause, RotateCcw, Car as CarIcon, ArrowUp, ArrowLeft, Clock, ChevronDown, ChevronRight, Activity } from 'lucide-react';
import { Phase, Vehicle, Lane, LightState, PhaseTiming } from './types';
import { parseTrafficProgram, ProgrammedStage } from './interpreter';
import { CANVAS_SIZE, INTERSECTION_SIZE, LANE_WIDTH, LANES, DEFAULT_TIMINGS, DEFAULT_STAGE_GREEN_SECONDS, DEFAULT_BUILTIN_STAGE_TIMINGS, BASE_SPAWN_RATE, SPAWN_DRIFT_SPEED, MIN_STAGE_GREEN_SECONDS, MAX_TOTAL_LOOP_SECONDS, clampStageTimingsToLoopCap } from './constants';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const VEHICLE_ACCEL = 0.08;
const VEHICLE_DECEL = 0.2;
const SAFE_DISTANCE = 55;
const STOP_LINE = INTERSECTION_SIZE / 2 + 10;
const LANE_MAP = new Map<string, Lane>(LANES.map(l => [l.id, l]));
const VEHICLE_COLORS = ['#58A6FF', '#F85149', '#3FB950', '#D29922', '#8b5cf6', '#ec4899', '#ffcc00'];

// Type definitions
interface LogEntry { id: string; time: string; event: string; color?: string; }
interface HistoryEntry { time: string; P1: number; P2: number; P3: number; P4: number; }
interface QueueHistoryEntry { time: string; [key: string]: string | number; }

// Memoized Sub-components to prevent flickering from frequent App re-renders
const TrafficFlowRates = React.memo(({ rates }: { rates: Record<string, number> }) => (
    <div className="grid grid-cols-2 gap-2 mb-2">
        {(['NORTH', 'SOUTH', 'EAST', 'WEST'] as const).map(label => {
            const dir = label[0] as keyof typeof rates;
            const color = (dir === 'N' || dir === 'S') ? 'text-[#58A6FF]' : 'text-[#D29922]';
            return (
                <div key={label} className="bg-black/20 p-2 border border-[#2D333B] rounded">
                    <div className="text-[8px] text-gray-500 mb-1">{label}</div>
                    <div className={`text-xs font-mono ${color}`}>{(rates[dir] * 100).toFixed(1)}%</div>
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
                    contentStyle={{ background: '#1A1D23', border: '1px solid #2D333B', fontSize: '10px' }}
                    itemStyle={{ fontSize: '10px' }}
                />
                <Line isAnimationActive={false} type="monotone" dataKey="P1" stroke="#3FB950" strokeWidth={1} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="P2" stroke="#58A6FF" strokeWidth={1} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="P3" stroke="#D29922" strokeWidth={1} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="P4" stroke="#8b5cf6" strokeWidth={1} dot={false} />
            </LineChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 text-[8px] font-mono text-gray-500 -mt-2 ml-6">
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
                    contentStyle={{ background: '#1A1D23', border: '1px solid #2D333B', fontSize: '10px' }}
                    itemStyle={{ fontSize: '10px' }}
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
        <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[7px] font-mono text-gray-500 -mt-2 ml-6 px-2">
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

const CollapsibleSection = React.memo(({ 
    id, 
    title, 
    isCollapsed, 
    onToggle, 
    children, 
    showBadge = false 
}: { 
    id: string; 
    title: string; 
    isCollapsed: boolean; 
    onToggle: (id: string) => void; 
    children: React.ReactNode;
    showBadge?: boolean;
}) => (
    <div className="flex flex-col">
        <button 
            onClick={() => onToggle(id)}
            className="flex items-center justify-between text-[10px] uppercase tracking-widest text-[#8B949E] mb-2 border-b border-[#2D333B] pb-1 hover:text-[#C9D1D9] transition-colors group"
        >
            <span className="flex items-center gap-2">
                {isCollapsed ? <ChevronRight className="w-3 h-3 text-[#3FB950]" /> : <ChevronDown className="w-3 h-3 text-[#3FB950]" />}
                {title}
            </span>
            {showBadge && <span className="text-[8px] opacity-0 group-hover:opacity-100 transition-opacity uppercase font-mono">CTRL_P01</span>}
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
  const [stageTimings, setStageTimings] = useState<number[]>(() => [...DEFAULT_BUILTIN_STAGE_TIMINGS]);
  
  // Traffic Flow State
  const [trafficRates, setTrafficRates] = useState<Record<string, number>>({
    N: BASE_SPAWN_RATE, S: BASE_SPAWN_RATE, E: BASE_SPAWN_RATE, W: BASE_SPAWN_RATE
  });
  const [offScreenQueues, setOffScreenQueues] = useState<Record<string, number>>({});
  const [isAdaptive, setIsAdaptive] = useState(true);
  
  // UI State
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    phaseTimings: false,
    queue: false,
    log: false,
    analytics: false,
    flow: false,
    editor: false
  });
  const [timingHistory, setTimingHistory] = useState<HistoryEntry[]>([]);
  const [queueHistory, setQueueHistory] = useState<QueueHistoryEntry[]>([]);
  
  // Controller State
  const [currentStage, setCurrentStage] = useState(0);
  const [lightState, setLightState] = useState<LightState>('GREEN');
  const [timer, setTimer] = useState(0);
  const [logs, setLogs] = useState<{ id: string, time: string, event: string, color?: string }[]>([]);
  
  // Interpreter State
  const [programCode, setProgramCode] = useState<string>(`phase(1):
    NORTHBOUND_STRAIGHT.GO
    SOUTHBOUND_STRAIGHT.GO
    NORTHBOUND_RIGHT.GO
    SOUTHBOUND_RIGHT.GO

phase(2):
    NORTHBOUND_LEFT.GO
    SOUTHBOUND_LEFT.GO
    WESTBOUND_RIGHT.GO
    EASTBOUND_RIGHT.GO

phase(3):
    EASTBOUND_STRAIGHT.GO
    WESTBOUND_STRAIGHT.GO
    EASTBOUND_RIGHT.GO
    WESTBOUND_RIGHT.GO

phase(4):
    EASTBOUND_LEFT.GO
    WESTBOUND_LEFT.GO
    EASTBOUND_RIGHT.GO
    NORTHBOUND_RIGHT.GO
    SOUTHBOUND_RIGHT.GO
`);
  const [compiledStages, setCompiledStages] = useState<ProgrammedStage[]>([]);
  const [programError, setProgramError] = useState<string>('');

  const compile = useCallback(() => {
    const result = parseTrafficProgram(programCode);
    if (result.error) {
      setProgramError(result.error);
    } else if (result.stages && result.stages.length > 0) {
      setProgramError('');
      setCompiledStages(result.stages);
      const n = result.stages.length;
      setStageTimings((prev) =>
        clampStageTimingsToLoopCap(
          Array.from({ length: n }, (_, i) => prev[i] ?? DEFAULT_STAGE_GREEN_SECONDS),
          n,
        ),
      );
      setCurrentStage(0);
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

  // Helper to get active phases for current stage
  const getActivePhases = useCallback((stage: number) => {
    switch (stage) {
      case 0:
        return [Phase.NORTHBOUND_LEFT, Phase.SOUTHBOUND_LEFT];
      case 1:
        return [
          Phase.NORTHBOUND_STRAIGHT,
          Phase.NORTHBOUND_RIGHT,
          Phase.SOUTHBOUND_STRAIGHT,
          Phase.SOUTHBOUND_RIGHT,
        ];
      case 2:
        return [Phase.WESTBOUND_LEFT, Phase.EASTBOUND_LEFT];
      case 3:
        return [
          Phase.WESTBOUND_STRAIGHT,
          Phase.WESTBOUND_RIGHT,
          Phase.EASTBOUND_STRAIGHT,
          Phase.EASTBOUND_RIGHT,
        ];
      default:
        return [];
    }
  }, []);

  const activePhases = compiledStages.length > 0 ? (compiledStages[currentStage]?.phases || []) : getActivePhases(currentStage);

  // Traffic Flow Drift
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
        setTrafficRates(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(dir => {
                const drift = (Math.random() - 0.5) * SPAWN_DRIFT_SPEED;
                next[dir] = Math.max(0.01, Math.min(0.2, next[dir] + drift));
            });
            return next;
        });
    }, 2000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || !isAdaptive) return;
    const interval = setInterval(() => {
      const n = compiledStages.length > 0 ? compiledStages.length : 4;
      const counts = new Array(n).fill(0);
      const laneCounts = new Map<string, number>();
      vehiclesRef.current.forEach(v => {
        laneCounts.set(v.laneId, (laneCounts.get(v.laneId) || 0) + 1);
      });

      for (let i = 0; i < n; i++) {
        const phasesInStage =
          compiledStages.length > 0 ? compiledStages[i].phases : getActivePhases(i);
        const phaseSet = new Set(phasesInStage);
        LANES.forEach((l) => {
          if (phaseSet.has(l.phase)) {
            const onScreen = laneCounts.get(l.id) || 0;
            const offScreen = offScreenQueues[l.id] || 0;
            // Weigh off-screen cars at 1.5x to prioritize clearing backlogs
            counts[i] += onScreen + (offScreen * 1.5);
          }
        });
      }
      setStageTimings((prev) => {
        const next = Array.from({ length: n }, (_, i) => prev[i] ?? DEFAULT_STAGE_GREEN_SECONDS);
        for (let i = 0; i < n; i++) {
          const c = counts[i] || 0;
          // Calculation: 5s base + 2s per "weighted" vehicle
          const targetGreen = Math.max(
            MIN_STAGE_GREEN_SECONDS,
            Math.min(MAX_TOTAL_LOOP_SECONDS / 2, MIN_STAGE_GREEN_SECONDS + Math.floor(c * 2))
          );

          const diff = targetGreen - next[i];
          if (diff > 0) {
            // Jump faster if the gap is large (Proportional adjustment)
            next[i] += Math.ceil(diff * 0.4);
          } else {
            next[i] -= 1;
          }
        }
        return clampStageTimingsToLoopCap(next, n);
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [isPlaying, isAdaptive, offScreenQueues, compiledStages, getActivePhases]);

  // Record History for Charts
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
        
        setTimingHistory(prev => {
            const entry = {
                time: timestamp,
                P1: stageTimings[0] ?? DEFAULT_STAGE_GREEN_SECONDS,
                P2: stageTimings[1] ?? DEFAULT_STAGE_GREEN_SECONDS,
                P3: stageTimings[2] ?? DEFAULT_STAGE_GREEN_SECONDS,
                P4: stageTimings[3] ?? DEFAULT_STAGE_GREEN_SECONDS,
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
  }, [isPlaying, stageTimings, offScreenQueues]);

  // Logic to update traffic lights
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        const next = prev + 0.1;
        
        const sc = compiledStages.length > 0 ? compiledStages.length : 4;
        const idx = currentStage % sc;
        const currentMaxGreen = stageTimings[idx] ?? DEFAULT_STAGE_GREEN_SECONDS;

        if (lightState === 'GREEN' && next >= currentMaxGreen) {
          setLightState('YELLOW');
          addLog(`PHASE ${activePhases.join(' & ')} YELLOW`, 'var(--yellow)');
          return 0;
        }
        if (lightState === 'YELLOW' && next >= DEFAULT_TIMINGS.yellow) {
          setLightState('RED');
          addLog('ALL RED WAIT', 'var(--red)');
          return 0;
        }
        if (lightState === 'RED' && next >= DEFAULT_TIMINGS.allRed) {
          let nextStage = 0;
          let nextPhases: Phase[] = [];
          if (compiledStages.length > 0) {
              nextStage = (currentStage + 1) % compiledStages.length;
              nextPhases = compiledStages[nextStage]?.phases || [];
          } else {
              nextStage = (currentStage + 1) % 4;
              nextPhases = getActivePhases(nextStage);
          }
          setLightState('GREEN');
          setCurrentStage(nextStage);
          addLog(`PHASE ${nextPhases.join(' & ')} START`, 'var(--major)');
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, currentStage, lightState, stageTimings, activePhases, addLog, getActivePhases, compiledStages]);

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
            const dynamicEntryDist = currentLaneSpeed > 1 ? SAFE_DISTANCE * 0.6 : SAFE_DISTANCE;

            // If the entrance is clear (dynamic), move car from queue to road
            if (edgeDistSq > dynamicEntryDist * dynamicEntryDist) {
              const startAngle = lane.direction === 'N' ? -Math.PI/2 : lane.direction === 'S' ? Math.PI/2 : lane.direction === 'E' ? 0 : Math.PI;
              
              const newVehicle: Vehicle = {
                id: Math.random().toString(36).substr(2, 9),
                x: lane.startX,
                y: lane.startY,
                vx: 0,
                vy: 0,
                angle: startAngle,
                laneId: lane.id,
                color: VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)],
                width: 18,
                length: 30,
                cruiseSpeed: 2.5 + Math.random(),
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
      const isGreen = activePhases.includes(lane.phase) && lightState === 'GREEN';
      const isYellow = activePhases.includes(lane.phase) && lightState === 'YELLOW';
      
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

        if (v.isTurning && other.isTurning) {
          const dx = other.x - v.x;
          const dy = other.y - v.y;
          const distSq = dx * dx + dy * dy;
          if (other.laneId === v.laneId) {
            if (distSq < SAFE_DISTANCE * SAFE_DISTANCE && (other.turnProgress ?? 0) > (v.turnProgress ?? 0)) {
              carAhead = other;
              break;
            }
          } else {
            if (distSq < (SAFE_DISTANCE * 0.7) * (SAFE_DISTANCE * 0.7)) {
              carAhead = other;
              break;
            }
          }
          continue;
        }

        if (lane.direction === 'N' && other.y < v.y && (v.y - other.y) < SAFE_DISTANCE) { carAhead = other; break; }
        if (lane.direction === 'S' && other.y > v.y && (other.y - v.y) < SAFE_DISTANCE) { carAhead = other; break; }
        if (lane.direction === 'E' && other.x > v.x && (other.x - v.x) < SAFE_DISTANCE) { carAhead = other; break; }
        if (lane.direction === 'W' && other.x < v.x && (v.x - other.x) < SAFE_DISTANCE) { carAhead = other; break; }
      }

      if (carAhead) {
        const dx = carAhead.x - v.x;
        const dy = carAhead.y - v.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const otherSpeed = Math.sqrt(carAhead.vx * carAhead.vx + carAhead.vy * carAhead.vy);
        
        if (dist < SAFE_DISTANCE * 0.7) {
          targetSpeed = Math.min(targetSpeed, otherSpeed * 0.5);
        } else {
          targetSpeed = Math.min(targetSpeed, otherSpeed);
        }
        if (targetSpeed < 0.1) targetSpeed = 0;
      }

      // Physics
      const currentSpeed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      let accel = 0;
      if (currentSpeed < targetSpeed) accel = VEHICLE_ACCEL;
      else if (currentSpeed > targetSpeed) accel = -VEHICLE_DECEL;

      const newSpeed = Math.max(0, currentSpeed + accel);
      
      if (newSpeed < currentSpeed - 0.001) {
          v.brakeIntensity = Math.min(1, (currentSpeed - newSpeed) / VEHICLE_DECEL);
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

            if (lane.type === 'LEFT') {
                if (lane.direction === 'N' && v.y <= centerY + 120) {
                    v.turnCenterX = centerX - 120;
                    v.turnCenterY = centerY + 120;
                    v.turnRadius = 140; 
                    v.turnAngleStart = 0;
                    v.turnAngleEnd = -Math.PI / 2;
                    shouldStart = true;
                } else if (lane.direction === 'S' && v.y >= centerY - 120) {
                    v.turnCenterX = centerX + 120;
                    v.turnCenterY = centerY - 120;
                    v.turnRadius = 140;
                    v.turnAngleStart = Math.PI;
                    v.turnAngleEnd = Math.PI / 2;
                    shouldStart = true;
                } else if (lane.direction === 'E' && v.x >= centerX - 120) {
                    v.turnCenterX = centerX - 120;
                    v.turnCenterY = centerY - 120;
                    v.turnRadius = 140;
                    v.turnAngleStart = Math.PI / 2;
                    v.turnAngleEnd = 0;
                    shouldStart = true;
                } else if (lane.direction === 'W' && v.x <= centerX + 120) {
                    v.turnCenterX = centerX + 120;
                    v.turnCenterY = centerY + 120;
                    v.turnRadius = 140;
                    v.turnAngleStart = -Math.PI / 2;
                    v.turnAngleEnd = -Math.PI;
                    shouldStart = true;
                }
            } else if (lane.type === 'RIGHT') {
                if (lane.direction === 'N' && v.y <= centerY + 120) {
                    v.turnCenterX = centerX + 120;
                    v.turnCenterY = centerY + 120;
                    v.turnRadius = 20;
                    v.turnAngleStart = Math.PI;
                    v.turnAngleEnd = Math.PI * 1.5;
                    shouldStart = true;
                } else if (lane.direction === 'S' && v.y >= centerY - 120) {
                    v.turnCenterX = centerX - 120;
                    v.turnCenterY = centerY - 120;
                    v.turnRadius = 20;
                    v.turnAngleStart = 0;
                    v.turnAngleEnd = Math.PI / 2;
                    shouldStart = true;
                } else if (lane.direction === 'E' && v.x >= centerX - 120) {
                    v.turnCenterX = centerX - 120;
                    v.turnCenterY = centerY + 120;
                    v.turnRadius = 20;
                    v.turnAngleStart = -Math.PI / 2;
                    v.turnAngleEnd = 0;
                    shouldStart = true;
                } else if (lane.direction === 'W' && v.x <= centerX + 120) {
                    v.turnCenterX = centerX + 120;
                    v.turnCenterY = centerY - 120;
                    v.turnRadius = 20;
                    v.turnAngleStart = Math.PI / 2;
                    v.turnAngleEnd = Math.PI;
                    shouldStart = true;
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
  }, [activePhases, lightState]);

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

    const drawSignal = (x: number, y: number, angle: number, phases: Phase[], isLeft: boolean = false) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      const isActive = phases.some(p => activePhases.includes(p));
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

      const lane = LANE_MAP.get(v.laneId);
      
      // Tail lights if braking or stopped
      const isStopped = Math.abs(v.vx) < 0.1 && Math.abs(v.vy) < 0.1;
      const brakeIntensity = v.brakeIntensity || 0;
      if (isStopped || brakeIntensity > 0) {
        ctx.globalAlpha = isStopped ? 1 : 0.3 + 0.7 * Math.min(1, brakeIntensity);
        ctx.fillStyle = '#F85149';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.5;
        if (lane?.type !== 'LEFT') {
            ctx.fillRect(-v.length / 2, -v.width / 2, 2, 4);
            ctx.strokeRect(-v.length / 2, -v.width / 2, 2, 4);
        }
        if (lane?.type !== 'RIGHT') {
            ctx.fillRect(-v.length / 2, v.width / 2 - 4, 2, 4);
            ctx.strokeRect(-v.length / 2, v.width / 2 - 4, 2, 4);
        }
        ctx.globalAlpha = 1.0;
      }

      // Turn signals
      if (Math.floor(time / 350) % 2 === 0) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 0.5;
          if (lane?.type === 'LEFT') {
              ctx.fillStyle = '#FFD700'; // Yellow
              ctx.beginPath();
              ctx.arc(-v.length / 2 + 2, -v.width / 2 + 2, 2, 0, Math.PI * 2); // rear-left
              ctx.fill();
              ctx.stroke();
          } else if (lane?.type === 'RIGHT') {
              ctx.fillStyle = '#FFD700'; // Yellow
              ctx.beginPath();
              ctx.arc(-v.length / 2 + 2, v.width / 2 - 2, 2, 0, Math.PI * 2); // rear-right
              ctx.fill();
              ctx.stroke();
          }
      }
      
      ctx.restore();
    });

    // 3. Signal Lights (Top Layer)
    drawSignal(centerX + 100, centerY + 130, 0, [Phase.NORTHBOUND_RIGHT]);
    drawSignal(centerX + 60, centerY + 130, 0, [Phase.NORTHBOUND_STRAIGHT]);
    drawSignal(centerX + 20, centerY + 130, 0, [Phase.NORTHBOUND_LEFT], true);
    
    drawSignal(centerX - 100, centerY - 130, Math.PI, [Phase.SOUTHBOUND_RIGHT]);
    drawSignal(centerX - 60, centerY - 130, Math.PI, [Phase.SOUTHBOUND_STRAIGHT]);
    drawSignal(centerX - 20, centerY - 130, Math.PI, [Phase.SOUTHBOUND_LEFT], true);
    
    drawSignal(centerX - 130, centerY + 100, -Math.PI/2, [Phase.EASTBOUND_RIGHT]);
    drawSignal(centerX - 130, centerY + 60, -Math.PI/2, [Phase.EASTBOUND_STRAIGHT]);
    drawSignal(centerX - 130, centerY + 20, -Math.PI/2, [Phase.EASTBOUND_LEFT], true);
    
    drawSignal(centerX + 130, centerY - 100, Math.PI/2, [Phase.WESTBOUND_RIGHT]);
    drawSignal(centerX + 130, centerY - 60, Math.PI/2, [Phase.WESTBOUND_STRAIGHT]);
    drawSignal(centerX + 130, centerY - 20, Math.PI/2, [Phase.WESTBOUND_LEFT], true);

  }, [activePhases, lightState, offScreenQueues]);

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

  const handleStageTimingChange = (stageIndex: number, val: number) => {
    setStageTimings((prev) => {
      const sc = compiledStages.length > 0 ? compiledStages.length : 4;
      const next = Array.from({ length: sc }, (_, i) => prev[i] ?? DEFAULT_STAGE_GREEN_SECONDS);
      const sumOthers = next.reduce((a, v, j) => (j === stageIndex ? a : a + v), 0);
      const cap = MAX_TOTAL_LOOP_SECONDS - sumOthers;
      next[stageIndex] = Math.max(MIN_STAGE_GREEN_SECONDS, Math.min(val, cap));
      return clampStageTimingsToLoopCap(next, sc);
    });
  };

  const getPercentage = () => {
      const sc = compiledStages.length > 0 ? compiledStages.length : 4;
      const idx = currentStage % sc;
      const currentMax = stageTimings[idx] ?? DEFAULT_STAGE_GREEN_SECONDS;

      if (lightState === 'GREEN') return (timer / Math.max(currentMax, 1)) * 100;
      if (lightState === 'YELLOW') return (timer / DEFAULT_TIMINGS.yellow) * 100;
      return (timer / DEFAULT_TIMINGS.allRed) * 100;
  };

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const stageTimingRowCount = compiledStages.length > 0 ? compiledStages.length : 4;
  const stageTimingLoopTotal = Array.from({ length: stageTimingRowCount }, (_, i) => stageTimings[i] ?? DEFAULT_STAGE_GREEN_SECONDS).reduce((a, b) => a + b, 0);

  return (
    <div className="h-screen w-full grid grid-cols-[280px_minmax(0,1fr)_280px] grid-rows-[48px_minmax(0,1fr)_200px] overflow-hidden bg-[#0D0F12]">
      {/* Header Area */}
      <header className="col-span-full bg-[#1A1D23] border-b border-[#2D333B] flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3 font-mono font-bold tracking-wider text-[11px]">
          <span className="text-[#3FB950] shrink-0">●</span>
          <span>TRAFFIC_SEC_082_V4.2</span>
          <span className="bg-[#3FB950]/10 text-[#3FB950] px-2 py-0.5 rounded border border-[#3FB950] text-[9px]">OPERATIONAL</span>
        </div>
        <div className="font-mono text-[11px] text-[#8B949E] flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span>UTC-08:00</span>
          </div>
          <div className="hidden sm:block">LOC: 34.0522° N, 118.2437° W</div>
          <div>CYCLE: {stageTimingLoopTotal}s / {MAX_TOTAL_LOOP_SECONDS}s</div>
        </div>
      </header>

      {/* Left Sidebar: Timing Controls */}
      <aside className="col-start-1 row-start-2 row-span-2 bg-[#1A1D23] border-r border-[#2D333B] p-4 flex flex-col gap-6 overflow-y-auto scrollbar-hide min-h-0">
        <CollapsibleSection id="editor" title="Logic Programmer" isCollapsed={collapsed.editor} onToggle={toggleCollapsed}>
          <div className="flex flex-col gap-2">
            <div className="text-[9px] text-gray-500 font-mono mb-1 leading-tight">
              # Syntax: phase(N): then KEYWORD.GO lines. Green seconds per stage are set below.
            </div>
            <div className="relative w-full h-64 bg-black/40 border border-[#2D333B] rounded focus-within:border-[#3FB950] transition-colors overflow-hidden">
              <div 
                  ref={highlightRef}
                  className="absolute inset-0 p-2 font-mono text-[10px] pointer-events-none whitespace-pre overflow-hidden" 
                  aria-hidden="true"
              >
                  {programCode.split('\n').map((line, i) => {
                      const activeStage = compiledStages.length > 0 ? compiledStages[currentStage] : null;
                      const isHighlighted = activeStage && i >= activeStage.lineStart && i <= activeStage.lineEnd;
                      return (
                          <div key={i} className={isHighlighted ? "bg-[#3FB950]/20 rounded-sm -mx-1 px-1" : "text-transparent"}>
                              {line || ' '}
                          </div>
                      );
                  })}
              </div>
              <textarea
                value={programCode}
                onChange={(e) => setProgramCode(e.target.value)}
                onScroll={(e) => {
                    if (highlightRef.current) {
                        highlightRef.current.scrollTop = e.currentTarget.scrollTop;
                        highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
                    }
                }}
                spellCheck={false}
                className="absolute inset-0 w-full h-full p-2 font-mono text-[10px] text-[#3FB950] bg-transparent resize-none focus:outline-none"
              />
            </div>
            {programError && (
              <div className="text-[9px] text-[#F85149] font-mono whitespace-pre-wrap leading-tight bg-[#F85149]/10 p-1 border border-[#F85149]/30 rounded">
                {programError}
              </div>
            )}
            <button 
              onClick={() => {
                  compile();
                  addLog("PROGRAM UPDATED", "var(--green)");
              }}
              className="text-[9px] bg-[#3FB950]/20 text-[#3FB950] py-1 border border-[#3FB950]/40 rounded hover:bg-[#3FB950]/30"
            >
              RE-COMPILE SEQUENCE
            </button>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="flow" title="Real-time Flow Rates" isCollapsed={collapsed.flow} onToggle={toggleCollapsed}>
            <TrafficFlowRates rates={trafficRates} />
        </CollapsibleSection>

        <CollapsibleSection id="phaseTimings" title="Stage timings" isCollapsed={collapsed.phaseTimings} onToggle={toggleCollapsed} showBadge>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
              <span>SYSTEM_MODE</span>
              <button 
                onClick={() => setIsAdaptive(!isAdaptive)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors ${isAdaptive ? 'bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}
              >
                {isAdaptive ? 'ADAPTIVE_ON' : 'MANUAL_OVERRIDE'}
              </button>
            </div>
            <div className="flex flex-col gap-2 max-h-[min(52vh,28rem)] overflow-y-auto pr-1 scrollbar-hide">
              {Array.from({ length: stageTimingRowCount }, (_, i) => {
                const label =
                  compiledStages.length > 0 ? compiledStages[i].label : `STAGE_${i + 1}`;
                const sec = stageTimings[i] ?? DEFAULT_STAGE_GREEN_SECONDS;
                const sliderMax = Math.max(
                  MIN_STAGE_GREEN_SECONDS,
                  MAX_TOTAL_LOOP_SECONDS - (stageTimingLoopTotal - sec),
                );
                return (
                  <div key={`${label}-${i}`} className="pb-2 border-b border-[#2D333B]/40 last:border-0">
                    <div className="flex justify-between items-center mb-1 px-0.5 gap-2">
                      <span className="text-[9px] font-mono text-gray-400 uppercase truncate" title={label}>
                        {label}
                      </span>
                      <span className="text-[9px] text-[#3FB950] font-mono shrink-0">{sec}s</span>
                    </div>
                    <input
                      type="range"
                      min={MIN_STAGE_GREEN_SECONDS}
                      max={sliderMax}
                      value={sec}
                      disabled={isAdaptive}
                      onChange={(e) => handleStageTimingChange(i, parseInt(e.target.value, 10))}
                      className="w-full accent-[#3FB950] h-1"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="queue" title="Queue Metrics (Offrd)" isCollapsed={collapsed.queue} onToggle={toggleCollapsed}>
            <QueueChart history={queueHistory} />
        </CollapsibleSection>

        <div className="mt-auto space-y-4 pt-4 border-t border-[#2D333B]">
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-full py-2 rounded text-[11px] font-bold transition-all border ${isPlaying ? 'bg-[#D29922]/10 border-[#D29922] text-[#D29922]' : 'bg-[#3FB950]/10 border-[#3FB950] text-[#3FB950]'}`}
          >
            {isPlaying ? 'PAUSE SYSTEM' : 'RESUME SYSTEM'}
          </button>
          <button 
            onClick={() => {
                vehiclesRef.current = [];
                setCurrentStage(0);
                setLightState('GREEN');
                setTimer(0);
                addLog('MANUAL RESET', 'var(--minor)');
            }}
            className="w-full py-2 rounded text-[11px] font-bold border border-[#2D333B] hover:bg-white/5"
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
        
        <div className="absolute top-4 left-4 font-mono text-[10px] text-[#8B949E] pointer-events-none">
            01-02-B-03-04 SEQUENCE ACTIVE<br/>
            {compiledStages.length > 0 ? (compiledStages[currentStage]?.label || `STAGE_${currentStage + 1}`) : `STAGE_${currentStage + 1}`} // ADDR: 0x76A2
        </div>
      </main>

      {/* Right Sidebar: Cycle Log */}
      <aside className="col-start-3 row-start-2 flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden border-l border-[#2D333B] bg-[#1A1D23] p-4 scrollbar-hide">
        <CollapsibleSection id="analytics" title="Timing Analytics" isCollapsed={collapsed.analytics} onToggle={toggleCollapsed}>
            <AnalyticalChart history={timingHistory} />
        </CollapsibleSection>

        <CollapsibleSection id="log" title="Process Cycle Log" isCollapsed={collapsed.log} onToggle={toggleCollapsed}>
            <div className="overflow-y-auto space-y-1 h-[calc(100vh-450px)] pr-2 scrollbar-hide">
                <AnimatePresence initial={false}>
                    {logs.map(log => (
                        <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={log.id} 
                            className="font-mono text-[10px] flex justify-between border-b border-white/5 py-1"
                        >
                            <span className="text-[#8B949E] shrink-0">{log.time}</span>
                            <span className="truncate pl-3" style={{ color: log.color || 'var(--major)' }}>{log.event}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </CollapsibleSection>
      </aside>

      {/* Bottom Panel: Real-time Monitor */}
      <footer className="col-span-2 col-start-2 row-start-3 grid grid-cols-4 gap-4 border-t border-[#2D333B] bg-[#1A1D23] p-4">
        <div className="border border-[#2D333B] p-3 rounded flex flex-col justify-between">
           <div className="text-[9px] uppercase text-[#8B949E] mb-1 tracking-wider">Interval Timer</div>
           <div className="text-2xl font-mono text-[#3FB950]">{timer.toFixed(1)}s</div>
           <div className="h-1 bg-[#2D333B] w-full mt-2 rounded-full overflow-hidden">
             <div className="h-full bg-[#3FB950] transition-all duration-100" style={{ width: `${getPercentage()}%` }} />
           </div>
        </div>

        <div className="border border-[#2D333B] p-3 rounded flex flex-col justify-between">
           <div className="text-[9px] uppercase text-[#8B949E] mb-1 tracking-wider">Active State</div>
           <div className="text-lg font-mono text-[#58A6FF]">{lightState}</div>
           <div className="text-[9px] text-[#3FB950] uppercase mt-2">Phases {activePhases.join(' & ')}</div>
        </div>

        <div className="border border-[#2D333B] p-3 rounded flex flex-col justify-between">
           <div className="text-[9px] uppercase text-[#8B949E] mb-1 tracking-wider">Traffic Load</div>
           <div className="text-2xl font-mono text-[#D29922]">{vehiclesRef.current.length.toString().padStart(2, '0')} Units</div>
           <div className="text-[9px] text-[#8B949E] uppercase mt-2">{vehiclesRef.current.length > 10 ? 'CONGESTION_MID' : 'NOMINAL_FLOW'}</div>
        </div>

        <div className="border border-[#2D333B] p-3 rounded flex flex-col justify-between">
           <div className="text-[9px] uppercase text-[#8B949E] mb-1 tracking-wider">Barrier Logic</div>
           <div className="text-sm font-mono text-[#C9D1D9] mt-2 leading-tight">
             {compiledStages.length > 0 ? (
                 <>
                 STAGE: {compiledStages[currentStage]?.label || `STAGE_${currentStage + 1}`}<br/>
                 PROGRAM: ACTIVE
                 </>
             ) : (
                 <>
                 RING_1: {currentStage < 2 ? 'GO' : 'WAIT'}<br/>
                 RING_2: {currentStage >= 2 ? 'GO' : 'WAIT'}
                 </>
             )}
           </div>
           <div className="text-[9px] text-[#F85149] uppercase mt-2">Safety Lock: OK</div>
        </div>
      </footer>
    </div>
  );
}
