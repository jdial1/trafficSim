/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, Pause, RotateCcw, Car as CarIcon, ArrowUp, ArrowLeft, Clock, ChevronDown, ChevronRight, Activity } from 'lucide-react';
import { Phase, Vehicle, Lane, LightState, PhaseTiming } from './types';
import { CANVAS_SIZE, INTERSECTION_SIZE, LANE_WIDTH, LANES, DEFAULT_TIMINGS, DIRECTION_TO_PHASES, BASE_SPAWN_RATE, SPAWN_DRIFT_SPEED } from './constants';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const VEHICLE_SPEED = 2.5;
const VEHICLE_ACCEL = 0.05;
const VEHICLE_DECEL = 0.15;
const SAFE_DISTANCE = 60;
const STOP_LINE = INTERSECTION_SIZE / 2 + 10;

// Type definitions
interface LogEntry { id: string; time: string; event: string; color?: string; }
interface HistoryEntry { time: string; P1: number; P2: number; P3: number; P4: number; }

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

const AnalyticalChart = React.memo(({ history }: { history: HistoryEntry[] }) => (
    <div className="h-[180px] w-full mt-2 -ml-6" style={{ minWidth: 0 }}>
        <ResponsiveContainer width="99%" height="100%" minWidth={0}>
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
  const [timings, setTimings] = useState<Record<number, number>>({
    1: 10, 2: 20, 3: 10, 4: 20,
    5: 10, 6: 20, 7: 10, 8: 20,
  });
  
  // Traffic Flow State
  const [trafficRates, setTrafficRates] = useState<Record<string, number>>({
    N: BASE_SPAWN_RATE, S: BASE_SPAWN_RATE, E: BASE_SPAWN_RATE, W: BASE_SPAWN_RATE
  });
  const [offScreenQueues, setOffScreenQueues] = useState<Record<string, number>>({});
  const [isAdaptive, setIsAdaptive] = useState(true);
  
  // UI State
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    ring1: false,
    ring2: false,
    queue: false,
    log: false,
    analytics: false,
    flow: false
  });
  const [timingHistory, setTimingHistory] = useState<any[]>([]);
  
  // Controller State
  const [currentStage, setCurrentStage] = useState(0); // 0: 1&5, 1: 2&6, 2: 3&7, 3: 4&8
  const [lightState, setLightState] = useState<LightState>('GREEN');
  const [timer, setTimer] = useState(0);
  const [logs, setLogs] = useState<{ id: string, time: string, event: string, color?: string }[]>([]);
  
  const vehiclesRef = useRef<Vehicle[]>([]);
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(null);

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
      case 0: return [Phase.P1, Phase.P5];
      case 1: return [Phase.P2, Phase.P6];
      case 2: return [Phase.P3, Phase.P7];
      case 3: return [Phase.P4, Phase.P8];
      default: return [];
    }
  }, []);

  const activePhases = getActivePhases(currentStage);

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

  // Adaptive Timing Logic
  useEffect(() => {
    if (!isPlaying || !isAdaptive) return;
    const interval = setInterval(() => {
        const laneCounts: Record<number, number> = {};
        LANES.forEach(l => {
            const count = vehiclesRef.current.filter(v => v.laneId === l.id).length + (offScreenQueues[l.id] || 0);
            laneCounts[l.phase] = (laneCounts[l.phase] || 0) + count;
        });

        setTimings(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(pStr => {
                const p = parseInt(pStr);
                const count = laneCounts[p] || 0;
                // Aggressive heuristics: 1s extra green per 1 car, range 5-60
                const targetGreen = Math.max(5, Math.min(60, 5 + Math.floor(count / 1.5)));
                if (next[p] < targetGreen) next[p] += 2; // Ramps up faster
                else if (next[p] > targetGreen) next[p] -= 1;
            });
            return next;
        });
    }, 2000); // More frequent updates
    return () => clearInterval(interval);
  }, [isPlaying, isAdaptive, offScreenQueues]);

  // Record History for Chart
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
        setTimingHistory(prev => {
            const entry = {
                time: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
                P1: timings[1],
                P2: timings[2],
                P3: timings[3],
                P4: timings[4]
            };
            return [...prev, entry].slice(-20); // Keep last 20 samples
        });
    }, 2000);
    return () => clearInterval(interval);
  }, [isPlaying, timings]);

  // Logic to update traffic lights
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        const next = prev + 0.1;
        
        let currentMaxGreen = 0;
        if (currentStage === 0) currentMaxGreen = Math.max(timings[1], timings[5]);
        if (currentStage === 1) currentMaxGreen = Math.max(timings[2], timings[6]);
        if (currentStage === 2) currentMaxGreen = Math.max(timings[3], timings[7]);
        if (currentStage === 3) currentMaxGreen = Math.max(timings[4], timings[8]);

        if (lightState === 'GREEN' && next >= currentMaxGreen) {
          setLightState('YELLOW');
          addLog(`PHASE ${activePhases[0]}&${activePhases[1]} YELLOW`, 'var(--yellow)');
          return 0;
        }
        if (lightState === 'YELLOW' && next >= DEFAULT_TIMINGS.yellow) {
          setLightState('RED');
          addLog('ALL RED WAIT', 'var(--red)');
          return 0;
        }
        if (lightState === 'RED' && next >= DEFAULT_TIMINGS.allRed) {
          const nextStage = (currentStage + 1) % 4;
          const nextPhases = getActivePhases(nextStage);
          setLightState('GREEN');
          setCurrentStage(nextStage);
          addLog(`PHASE ${nextPhases[0]}&${nextPhases[1]} START`, 'var(--major)');
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, currentStage, lightState, timings, activePhases, addLog, getActivePhases]);

  // Car Spawning and Queueing
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      LANES.forEach(lane => {
        const rate = trafficRates[lane.direction];
        if (Math.random() < rate) {
            // Check if there is space to spawn at the edge
            const carsInLane = vehiclesRef.current.filter(v => v.laneId === lane.id);
            const edgeDist = carsInLane.reduce((minDist, v) => {
                const d = Math.sqrt(Math.pow(v.x - lane.startX, 2) + Math.pow(v.y - lane.startY, 2));
                return d < minDist ? d : minDist;
            }, Infinity);

            if (edgeDist > SAFE_DISTANCE) {
                const colors = ['#58A6FF', '#F85149', '#3FB950', '#D29922', '#8b5cf6', '#ec4899', '#ffcc00'];
                const startAngle = lane.direction === 'N' ? -Math.PI/2 : lane.direction === 'S' ? Math.PI/2 : lane.direction === 'E' ? 0 : Math.PI;
                const rand = Math.random();
                let speedType: 'NORMAL' | 'FAST' | 'SLOW' = 'NORMAL';
                if (rand < 0.02) speedType = 'FAST';
                else if (rand < 0.04) speedType = 'SLOW';

                const newVehicle: Vehicle = {
                  id: Math.random().toString(36).substr(2, 9),
                  x: lane.startX,
                  y: lane.startY,
                  vx: 0,
                  vy: 0,
                  angle: startAngle,
                  laneId: lane.id,
                  color: colors[Math.floor(Math.random() * colors.length)],
                  width: 18,
                  length: 30,
                  speedType,
                };
                vehiclesRef.current.push(newVehicle);
            } else {
                // Add to off-screen queue
                setOffScreenQueues(prev => ({
                    ...prev,
                    [lane.id]: (prev[lane.id] || 0) + 1
                }));
            }
        }
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, trafficRates]);

  // Pull from off-screen queues
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
        setOffScreenQueues(prev => {
            const next = { ...prev };
            let changed = false;
            LANES.forEach(lane => {
                if (next[lane.id] > 0) {
                    const carsInLane = vehiclesRef.current.filter(v => v.laneId === lane.id);
                    const edgeDist = carsInLane.reduce((minDist, v) => {
                        const d = Math.sqrt(Math.pow(v.x - lane.startX, 2) + Math.pow(v.y - lane.startY, 2));
                        return d < minDist ? d : minDist;
                    }, Infinity);

                    // Reduced spawn distance to allow more cars to enter
                    if (edgeDist > 40) {
                        const colors = ['#58A6FF', '#F85149', '#3FB950', '#D29922', '#8b5cf6', '#ec4899', '#ffcc00'];
                        const startAngle = lane.direction === 'N' ? -Math.PI/2 : lane.direction === 'S' ? Math.PI/2 : lane.direction === 'E' ? 0 : Math.PI;
                        const rand = Math.random();
                        let speedType: 'NORMAL' | 'FAST' | 'SLOW' = 'NORMAL';
                        if (rand < 0.02) speedType = 'FAST';
                        else if (rand < 0.04) speedType = 'SLOW';

                        const newVehicle: Vehicle = {
                          id: Math.random().toString(36).substr(2, 9),
                          x: lane.startX,
                          y: lane.startY,
                          vx: 0,
                          vy: 0,
                          angle: startAngle,
                          laneId: lane.id,
                          color: colors[Math.floor(Math.random() * colors.length)],
                          width: 18,
                          length: 30,
                          speedType,
                        };
                        vehiclesRef.current.push(newVehicle);
                        next[lane.id]--;
                        changed = true;
                    }
                }
            });
            return changed ? next : prev;
        });
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const update = useCallback(() => {
    const vehicles = vehiclesRef.current;
    
    vehicles.forEach((v) => {
      const lane = LANES.find(l => l.id === v.laneId)!;
      const isGreen = activePhases.includes(lane.phase) && lightState === 'GREEN';
      const isYellow = activePhases.includes(lane.phase) && lightState === 'YELLOW';
      
      // Target Speed
      let targetSpeed = VEHICLE_SPEED;
      if (v.speedType === 'FAST') targetSpeed *= 1.4;
      if (v.speedType === 'SLOW') targetSpeed *= 0.6;
      
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
      const carAhead = vehicles.filter(other => 
        other.id !== v.id && 
        // Logic for identifying potential collisions
        ((other.laneId === v.laneId && (!v.isTurning ? !other.isTurning : true)) || 
         (v.isTurning && other.isTurning))
      ).find(other => {
          if (v.isTurning && other.isTurning) {
              const dx = other.x - v.x;
              const dy = other.y - v.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              // Same lane turned, check if other is ahead in progress
              if (other.laneId === v.laneId) {
                  return dist < SAFE_DISTANCE && (other.turnProgress ?? 0) > (v.turnProgress ?? 0);
              }
              // Different lanes turning (intersection conflict)
              // We use a tighter safe distance for different lanes to allow tight turns
              return dist < SAFE_DISTANCE * 0.7;
          }
          
          if (lane.direction === 'N') return other.y < v.y && (v.y - other.y) < SAFE_DISTANCE;
          if (lane.direction === 'S') return other.y > v.y && (other.y - v.y) < SAFE_DISTANCE;
          if (lane.direction === 'E') return other.x > v.x && (other.x - v.x) < SAFE_DISTANCE;
          if (lane.direction === 'W') return other.x < v.x && (v.x - other.x) < SAFE_DISTANCE;
          return false;
      });

      if (carAhead) {
        const otherSpeed = Math.sqrt(carAhead.vx * carAhead.vx + carAhead.vy * carAhead.vy);
        targetSpeed = Math.min(targetSpeed, otherSpeed);
        if (targetSpeed < 0.1) targetSpeed = 0;
      }

      // Physics
      const currentSpeed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      let accel = 0;
      if (currentSpeed < targetSpeed) accel = VEHICLE_ACCEL;
      else if (currentSpeed > targetSpeed) accel = -VEHICLE_DECEL;

      const newSpeed = Math.max(0, currentSpeed + accel);
      
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
                    v.turnAngleEnd = -Math.PI / 2;
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

    // Remove cars out of bounds
    vehiclesRef.current = vehicles.filter(v => v.x >= -50 && v.x <= CANVAS_SIZE + 50 && v.y >= -50 && v.y <= CANVAS_SIZE + 50);
  }, [activePhases, lightState]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE / 2;

    // Draw Roads
    ctx.fillStyle = '#1A1D23';
    // Vertical Road
    ctx.fillRect(centerX - INTERSECTION_SIZE / 2, 0, INTERSECTION_SIZE, CANVAS_SIZE);
    // Horizontal Road
    ctx.fillRect(0, centerY - INTERSECTION_SIZE / 2, CANVAS_SIZE, INTERSECTION_SIZE);

    // Intersection Box
    ctx.fillStyle = '#0D0F12';
    ctx.fillRect(centerX - INTERSECTION_SIZE / 2, centerY - INTERSECTION_SIZE / 2, INTERSECTION_SIZE, INTERSECTION_SIZE);

    // Lane Lines
    ctx.strokeStyle = '#2D333B';
    ctx.lineWidth = 1;
    
    const drawLaneMarkers = (x: number, y: number, length: number, horizontal: boolean) => {
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        if (horizontal) {
            ctx.moveTo(x, y); ctx.lineTo(x + length, y);
        } else {
            ctx.moveTo(x, y); ctx.lineTo(x, y + length);
        }
        ctx.stroke();
    };

    // Centerlines (Double Solid)
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#444c56';
    // Vertical centerline
    ctx.beginPath();
    ctx.moveTo(centerX - 2, 0); ctx.lineTo(centerX - 2, centerY - INTERSECTION_SIZE / 2);
    ctx.moveTo(centerX + 2, 0); ctx.lineTo(centerX + 2, centerY - INTERSECTION_SIZE / 2);
    ctx.moveTo(centerX - 2, centerY + INTERSECTION_SIZE / 2); ctx.lineTo(centerX - 2, CANVAS_SIZE);
    ctx.moveTo(centerX + 2, centerY + INTERSECTION_SIZE / 2); ctx.lineTo(centerX + 2, CANVAS_SIZE);
    // Horizontal centerline
    ctx.moveTo(0, centerY - 2); ctx.lineTo(centerX - INTERSECTION_SIZE / 2, centerY - 2);
    ctx.moveTo(0, centerY + 2); ctx.lineTo(centerX - INTERSECTION_SIZE / 2, centerY + 2);
    ctx.moveTo(centerX + INTERSECTION_SIZE / 2, centerY - 2); ctx.lineTo(CANVAS_SIZE, centerY - 2);
    ctx.moveTo(centerX + INTERSECTION_SIZE / 2, centerY + 2); ctx.lineTo(CANVAS_SIZE, centerY + 2);
    ctx.stroke();

    // Lane separators
    ctx.strokeStyle = '#2D333B';
    ctx.lineWidth = 1;
    [LANE_WIDTH, LANE_WIDTH * 2].forEach(offset => {
        // Vertical separators
        drawLaneMarkers(centerX + offset, 0, centerY - INTERSECTION_SIZE / 2, false);
        drawLaneMarkers(centerX - offset, 0, centerY - INTERSECTION_SIZE / 2, false);
        drawLaneMarkers(centerX + offset, centerY + INTERSECTION_SIZE / 2, CANVAS_SIZE - (centerY + INTERSECTION_SIZE / 2), false);
        drawLaneMarkers(centerX - offset, centerY + INTERSECTION_SIZE / 2, CANVAS_SIZE - (centerY + INTERSECTION_SIZE / 2), false);
        
        // Horizontal separators
        drawLaneMarkers(0, centerY + offset, centerX - INTERSECTION_SIZE / 2, true);
        drawLaneMarkers(0, centerY - offset, centerX - INTERSECTION_SIZE / 2, true);
        drawLaneMarkers(centerX + INTERSECTION_SIZE / 2, centerY + offset, CANVAS_SIZE - (centerX + INTERSECTION_SIZE / 2), true);
        drawLaneMarkers(centerX + INTERSECTION_SIZE / 2, centerY - offset, CANVAS_SIZE - (centerX + INTERSECTION_SIZE / 2), true);
    });

    // Solid Stop Lines
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2D333B';
    
    // Stop lines
    ctx.beginPath();
    ctx.moveTo(centerX - INTERSECTION_SIZE / 2, centerY - STOP_LINE); ctx.lineTo(centerX + INTERSECTION_SIZE / 2, centerY - STOP_LINE);
    ctx.moveTo(centerX - INTERSECTION_SIZE / 2, centerY + STOP_LINE); ctx.lineTo(centerX + INTERSECTION_SIZE / 2, centerY + STOP_LINE);
    ctx.moveTo(centerX - STOP_LINE, centerY - INTERSECTION_SIZE / 2); ctx.lineTo(centerX - STOP_LINE, centerY + INTERSECTION_SIZE / 2);
    ctx.moveTo(centerX + STOP_LINE, centerY - INTERSECTION_SIZE / 2); ctx.lineTo(centerX + STOP_LINE, centerY + INTERSECTION_SIZE / 2);
    ctx.stroke();

    // Draw Vehicles
    vehiclesRef.current.forEach(v => {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle);
      
      // Car body
      ctx.fillStyle = v.color;
      ctx.beginPath();
      ctx.roundRect(-v.length / 2, -v.width / 2, v.length, v.width, 2);
      ctx.fill();

      // Tail lights if braking
      if (Math.abs(v.vx) < 0.1 && Math.abs(v.vy) < 0.1) {
        ctx.fillStyle = '#F85149';
        ctx.fillRect(-v.length / 2, -v.width / 2, 2, 4);
        ctx.fillRect(-v.length / 2, v.width / 2 - 4, 2, 4);
      }

      // Speed Type Icon
      if (v.speedType === 'FAST') {
          ctx.fillStyle = '#FFD700'; // Gold
          ctx.beginPath();
          ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0); ctx.fill();
      } else if (v.speedType === 'SLOW') {
          ctx.fillStyle = '#8B949E'; // Muted Gray
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      }
      
      ctx.restore();
    });

    // Draw Signal Lights
    const drawSignal = (x: number, y: number, angle: number, phases: Phase[], isLeft: boolean = false) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      const isActive = phases.some(p => activePhases.includes(p));
      const color = isActive ? (lightState === 'GREEN' ? '#3FB950' : lightState === 'YELLOW' ? '#D29922' : '#F85149') : '#F85149';

      // Housing
      ctx.fillStyle = '#1A1D23';
      ctx.strokeStyle = '#2D333B';
      ctx.lineWidth = 1;
      
      if (isLeft) {
          // 4-light stack for left turns
          ctx.fillRect(-8, -25, 16, 50);
          ctx.strokeRect(-8, -25, 16, 50);
          
          // Draw a small arrow indicator
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.lineTo(0, -4); ctx.fill();
      } else {
          ctx.fillRect(-8, -20, 16, 40);
          ctx.strokeRect(-8, -20, 16, 40);
      }

      // Simple light indicator
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    // Signal Heads
    // Northbound
    // Draw Off-screen Queues
    LANES.forEach(lane => {
        const qCount = offScreenQueues[lane.id] || 0;
        if (qCount > 0) {
            ctx.fillStyle = '#F85149';
            ctx.font = '12px "JetBrains Mono"';
            ctx.textAlign = 'center';
            if (lane.direction === 'N') ctx.fillText(`+${qCount}`, lane.startX, CANVAS_SIZE - 20);
            if (lane.direction === 'S') ctx.fillText(`+${qCount}`, lane.startX, 20);
            if (lane.direction === 'E') ctx.fillText(`+${qCount}`, 20, lane.startY + 4);
            if (lane.direction === 'W') ctx.fillText(`+${qCount}`, CANVAS_SIZE - 20, lane.startY + 4);
        }
    });

    drawSignal(centerX + 100, centerY + 130, 0, [Phase.P2]); // Right
    drawSignal(centerX + 60, centerY + 130, 0, [Phase.P2]); // Thru
    drawSignal(centerX + 20, centerY + 130, 0, [Phase.P1], true); // Left
    
    // Southbound
    drawSignal(centerX - 100, centerY - 130, Math.PI, [Phase.P6]); // Right
    drawSignal(centerX - 60, centerY - 130, Math.PI, [Phase.P6]); // Thru
    drawSignal(centerX - 20, centerY - 130, Math.PI, [Phase.P5], true); // Left
    
    // Eastbound
    drawSignal(centerX - 130, centerY + 100, -Math.PI/2, [Phase.P8]); // Right
    drawSignal(centerX - 130, centerY + 60, -Math.PI/2, [Phase.P8]); // Thru
    drawSignal(centerX - 130, centerY + 20, -Math.PI/2, [Phase.P7], true); // Left
    
    // Westbound
    drawSignal(centerX + 130, centerY - 100, Math.PI/2, [Phase.P4]); // Right
    drawSignal(centerX + 130, centerY - 60, Math.PI/2, [Phase.P4]); // Thru
    drawSignal(centerX + 130, centerY - 20, Math.PI/2, [Phase.P3], true); // Left

  }, [activePhases, lightState]);

  const loop = useCallback((time: number) => {
    if (lastTimeRef.current !== null && isPlaying) {
      update();
    }
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) draw(ctx);
    
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(loop);
  }, [isPlaying, update, draw]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop]);

  const handleTimingChange = (phase: number, val: number) => {
    setTimings(prev => ({ ...prev, [phase]: val }));
  };

  const getPercentage = () => {
      let currentMax = 0;
      if (currentStage === 0) currentMax = Math.max(timings[1], timings[5]);
      if (currentStage === 1) currentMax = Math.max(timings[2], timings[6]);
      if (currentStage === 2) currentMax = Math.max(timings[3], timings[7]);
      if (currentStage === 3) currentMax = Math.max(timings[4], timings[8]);
      
      if (lightState === 'GREEN') return (timer / currentMax) * 100;
      if (lightState === 'YELLOW') return (timer / DEFAULT_TIMINGS.yellow) * 100;
      return (timer / DEFAULT_TIMINGS.allRed) * 100;
  };

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="h-screen w-full grid grid-cols-[280px_1fr_280px] grid-rows-[48px_1fr_200px] overflow-hidden bg-[#0D0F12]">
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
          <div>CYCLE: {Object.values(timings).reduce((a: number, b: number) => a + b, 0)}s</div>
        </div>
      </header>

      {/* Left Sidebar: Timing Controls */}
      <aside className="row-start-2 row-span-2 bg-[#1A1D23] border-r border-[#2D333B] p-4 flex flex-col gap-6 overflow-y-auto scrollbar-hide">
        <CollapsibleSection id="flow" title="Real-time Flow Rates" isCollapsed={collapsed.flow} onToggle={toggleCollapsed}>
            <TrafficFlowRates rates={trafficRates} />
        </CollapsibleSection>

        <CollapsibleSection id="ring1" title="Ring 1 Logic (Mainst)" isCollapsed={collapsed.ring1} onToggle={toggleCollapsed} showBadge>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
              <span>SYSTEM_MODE</span>
              <button 
                onClick={() => setIsAdaptive(!isAdaptive)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors ${isAdaptive ? 'bg-[#3FB950]/10 text-[#3FB950] border border-[#3FB950]' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}
              >
                {isAdaptive ? 'ADAPTIVE_ON' : 'MANUAL_OVERRIDE'}
              </button>
            </div>
            
            <div className="pb-4 border-b border-[#2D333B]/50">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-[10px] font-mono text-gray-400 uppercase">P1: Major Left</span>
                <span className="text-[10px] text-[#3FB950] font-mono">{timings[1]}s</span>
              </div>
              <input 
                type="range" min="5" max="30" 
                value={timings[1]} 
                disabled={isAdaptive}
                onChange={(e) => {
                    const val = parseInt(e.target.value);
                    handleTimingChange(1, val);
                    handleTimingChange(5, val);
                }}
                className="w-full accent-[#3FB950] h-1" 
              />
            </div>
            
            <div className="pb-4 border-b border-[#2D333B]/50">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-[10px] font-mono text-gray-400 uppercase">P2: Major Thru</span>
                <span className="text-[10px] text-[#3FB950] font-mono">{timings[2]}s</span>
              </div>
              <input 
                type="range" min="5" max="30" 
                value={timings[2]} 
                disabled={isAdaptive}
                onChange={(e) => {
                    const val = parseInt(e.target.value);
                    handleTimingChange(2, val);
                    handleTimingChange(6, val);
                }}
                className="w-full accent-[#3FB950] h-1" 
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="ring2" title="Ring 2 Logic (Sidest)" isCollapsed={collapsed.ring2} onToggle={toggleCollapsed}>
          <div className="flex flex-col gap-4">
            <div className="pb-4 border-b border-[#2D333B]/50">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-[10px] font-mono text-gray-400 uppercase">P3: Minor Left</span>
                <span className="text-[10px] text-[#3FB950] font-mono">{timings[3]}s</span>
              </div>
              <input 
                type="range" min="5" max="30" 
                value={timings[3]} 
                disabled={isAdaptive}
                onChange={(e) => {
                    const val = parseInt(e.target.value);
                    handleTimingChange(3, val);
                    handleTimingChange(7, val);
                }}
                className="w-full accent-[#3FB950] h-1" 
              />
            </div>
            
            <div className="pb-4 border-b border-[#2D333B]/50">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-[10px] font-mono text-gray-400 uppercase">P4: Minor Thru</span>
                <span className="text-[10px] text-[#3FB950] font-mono">{timings[4]}s</span>
              </div>
              <input 
                type="range" min="5" max="30" 
                value={timings[4]} 
                disabled={isAdaptive}
                onChange={(e) => {
                    const val = parseInt(e.target.value);
                    handleTimingChange(4, val);
                    handleTimingChange(8, val);
                }}
                className="w-full accent-[#3FB950] h-1" 
              />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="queue" title="Queue Metrics (Offrd)" isCollapsed={collapsed.queue} onToggle={toggleCollapsed}>
            <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(offScreenQueues).map(([id, count]: [string, number]) => count > 0 && (
                    <div key={id} className="bg-[#F85149]/10 text-[#F85149] px-2 py-0.5 border border-[#F85149]/30 rounded text-[9px] font-mono">
                        {id.replace(/-/g, '_').toUpperCase()}: {count}
                    </div>
                ))}
                {Object.values(offScreenQueues).every((v: number) => v === 0) && (
                    <div className="text-[9px] text-gray-600 font-mono italic">NO_CONGESTION</div>
                )}
            </div>
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
      <main className="relative flex items-center justify-center overflow-hidden bg-[radial-gradient(#2D333B_1px,transparent_1px)] bg-[size:32px_32px]">
        <canvas 
          ref={canvasRef} 
          width={CANVAS_SIZE} 
          height={CANVAS_SIZE}
          className="rounded shadow-2xl border border-[#2D333B]"
          style={{ width: 'min(70vh, 70vw)', height: 'min(70vh, 70vw)' }}
        />
        
        <div className="absolute top-4 left-4 font-mono text-[10px] text-[#8B949E] pointer-events-none">
            01-02-B-03-04 SEQUENCE ACTIVE<br/>
            STAGE_{currentStage + 1} // ADDR: 0x76A2
        </div>
      </main>

      {/* Right Sidebar: Cycle Log */}
      <aside className="bg-[#1A1D23] border-l border-[#2D333B] p-4 flex flex-col gap-4 overflow-hidden scrollbar-hide">
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
      <footer className="col-start-2 col-span-2 bg-[#1A1D23] border-t border-[#2D333B] p-4 grid grid-cols-4 gap-4">
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
             RING_1: {currentStage < 2 ? 'GO' : 'WAIT'}<br/>
             RING_2: {currentStage >= 2 ? 'GO' : 'WAIT'}
           </div>
           <div className="text-[9px] text-[#F85149] uppercase mt-2">Safety Lock: OK</div>
        </div>
      </footer>
    </div>
  );
}
