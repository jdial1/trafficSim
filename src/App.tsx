/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, Pause, RotateCcw, Car as CarIcon, ArrowUp, ArrowLeft, ChevronDown, ChevronRight, Activity, PanelLeftClose, PanelLeftOpen, CornerUpLeft, CornerUpRight, Save, Plus, Minus, Trash2, Download, Mail, Terminal, Map as MapIcon } from 'lucide-react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { Movement, Vehicle, Lane, LightState, MovementTiming, VehicleType } from './types';
import { parseTrafficProgram, Phase, ConditionalRule, PhaseCommand, KEYWORD_MAP } from './interpreter';
import { CANVAS_SIZE, INTERSECTION_SIZE, LANE_WIDTH, LANES, DEFAULT_TIMINGS, DEFAULT_PHASE_GREEN_SECONDS, DEFAULT_BUILTIN_PHASE_TIMINGS, BASE_SPAWN_RATE, SPAWN_DRIFT_SPEED, MIN_PHASE_GREEN_SECONDS, MAX_TOTAL_LOOP_SECONDS, clampPhaseTimingsToLoopCap, PHASE_TEMPLATES } from './constants';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import vehicleCatalog from './vehicles.json';
import { renderVehicleSprite } from './renderVehicleDesign';
import { FirmwareUpdatePrompt } from './components/FirmwareUpdatePrompt';
import { GameIntro } from './components/GameIntro';
import { MobileOmniCorpEditor } from './components/MobileOmniCorpEditor';
import { level1Briefing } from './briefing/level1';

type BeforeInstallPromptEventExtended = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const STOP_LINE = INTERSECTION_SIZE / 2 + 10;
const BASE_SAFE_GAP = 25;
const LANE_MAP = new Map<string, Lane>(LANES.map(l => [l.id, l]));
const LEFT_LANE_IDS = LANES.filter((l) => l.type === 'LEFT').map((l) => l.id);
const VEHICLE_COLORS = vehicleCatalog.colors;

const VIEWPORT_MOBILE_MAX_WIDTH = 767;
const ZOOM_STEP = 0.1;
const MOBILE_EXTRA_ZOOM_STEPS = 2;
const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 520;
const HEAT_GRID_COLS = 48;
const HEAT_GRID_ROWS = 48;
const HEATMAP_DECAY = 0.985;
const HEATMAP_GAIN = 0.28;
const HEATMAP_MAX = 24;
const LOOP_LAG_LOG_MS = 20;
const LOOP_HUD_MIN_INTERVAL_MS = 100;
const MAX_SIM_INTEGRATION_STEP = 1;
const ADJACENT_RIGHT_MERGE_PAIR_KEYS = new Set([
  'eb-right|nb-right',
  'eb-right|sb-right',
  'nb-right|wb-right',
  'sb-right|wb-right',
]);
const ADJACENT_LEFT_MERGE_PAIR_KEYS = new Set([
  'eb-left|wb-left',
  'nb-left|sb-left',
  'sb-left|wb-left',
]);
const TIME_SCALE_OPTIONS = [1, 2, 5] as const;
type TimeScale = (typeof TIME_SCALE_OPTIONS)[number];

function narrowViewport() {
  return typeof window !== 'undefined' && window.matchMedia(`(max-width: ${VIEWPORT_MOBILE_MAX_WIDTH}px)`).matches;
}

function defaultZoom() {
  return narrowViewport() ? Math.min(3, 1 + MOBILE_EXTRA_ZOOM_STEPS * ZOOM_STEP) : 1;
}

const LEGENDARY_SPAWN_CHANCE = 0.002;
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
  [Movement.CROSSWALK_NORTH]: 'CROSSWALK_NORTH',
  [Movement.CROSSWALK_SOUTH]: 'CROSSWALK_SOUTH',
  [Movement.CROSSWALK_EAST]: 'CROSSWALK_EAST',
  [Movement.CROSSWALK_WEST]: 'CROSSWALK_WEST',
};

const DIRECTIONS = ['NORTHBOUND', 'SOUTHBOUND', 'EASTBOUND', 'WESTBOUND', 'PEDESTRIAN'] as const;

function getDirection(m: Movement) {
    if (m >= 1 && m <= 3) return 'NORTHBOUND';
    if (m >= 7 && m <= 9) return 'SOUTHBOUND';
    if (m >= 10 && m <= 12) return 'EASTBOUND';
    if (m >= 4 && m <= 6) return 'WESTBOUND';
    if (m >= 13 && m <= 16) return 'PEDESTRIAN';
    return 'OTHER';
}

function getMovementIcon(m: Movement, size: number = 14) {
    if (m >= 13 && m <= 16) return <Activity size={size} />;
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
interface Point2D { x: number; y: number; }
interface RearTires { left: Point2D; right: Point2D; }
interface SkidMarkSegment {
  from: Point2D;
  to: Point2D;
  bornAt: number;
  ttlMs: number;
  baseAlpha: number;
  width: number;
}
interface CrashInfo {
  x: number;
  y: number;
  laneA: string;
  laneB: string;
  vehicleIds: [string, string];
}

const SKID_MARK_BRAKE_THRESHOLD = 0.8;
const SKID_MARK_TTL_MS = 2800;
const MAX_SKID_MARK_SEGMENTS = 2400;

function getRearTirePositions(vehicle: Vehicle): RearTires {
  const forwardX = Math.cos(vehicle.angle);
  const forwardY = Math.sin(vehicle.angle);
  const lateralX = -forwardY;
  const lateralY = forwardX;
  const rearOffset = vehicle.length * 0.32;
  const tireOffset = vehicle.width * 0.28;
  const rearCenterX = vehicle.x - forwardX * rearOffset;
  const rearCenterY = vehicle.y - forwardY * rearOffset;
  return {
    left: { x: rearCenterX + lateralX * tireOffset, y: rearCenterY + lateralY * tireOffset },
    right: { x: rearCenterX - lateralX * tireOffset, y: rearCenterY - lateralY * tireOffset },
  };
}

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

function getPathEndPoint(geom: PathGeometry): Point2D {
  if (geom.type === 'STRAIGHT') return { x: geom.endX, y: geom.endY };
  return {
    x: geom.centerX + geom.radius * Math.cos(geom.endAngle),
    y: geom.centerY + geom.radius * Math.sin(geom.endAngle),
  };
}

function pickVehicleAtCanvasPoint(px: number, py: number, vehicles: Vehicle[]): Vehicle | null {
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i];
    const halfLen = v.vType === 'MOTORCYCLE' ? (v.length * 1.25) / 2 : v.length / 2;
    const halfWid = v.vType === 'MOTORCYCLE' ? (v.width * 1.25) / 2 : v.width / 2;
    const dx = px - v.x;
    const dy = py - v.y;
    const c = Math.cos(-v.angle);
    const s = Math.sin(-v.angle);
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const pad = 6;
    if (Math.abs(lx) <= halfLen + pad && Math.abs(ly) <= halfWid + pad) return v;
  }
  return null;
}

function VehicleInspectTooltip({ vehicle }: { vehicle: Vehicle }) {
  const lane = LANE_MAP.get(vehicle.laneId);
  const movementLabel = lane ? MovementLabels[lane.movement] ?? String(lane.movement) : vehicle.laneId;
  const speed = Math.hypot(vehicle.vx, vehicle.vy);
  const angDeg = (vehicle.angle * 180) / Math.PI;
  const rows: [string, string][] = [
    ['id', vehicle.id],
    ['lane', vehicle.laneId],
    ['movement', movementLabel],
    ['type', vehicle.vType],
    ['x', vehicle.x.toFixed(1)],
    ['y', vehicle.y.toFixed(1)],
    ['vx', vehicle.vx.toFixed(2)],
    ['vy', vehicle.vy.toFixed(2)],
    ['speed', speed.toFixed(2)],
    ['angleDeg', angDeg.toFixed(1)],
    ['cruise', vehicle.cruiseSpeed.toFixed(2)],
    ['accel', vehicle.accel.toFixed(2)],
    ['decel', vehicle.decel.toFixed(2)],
    ['brake', String(vehicle.brakeIntensity ?? 0)],
    ['delay', vehicle.startDelay.toFixed(2)],
    ['color', vehicle.color],
    ['size', `${vehicle.length.toFixed(0)}×${vehicle.width.toFixed(0)}`],
    ['skins', [vehicle.legendarySkin && 'LEG', vehicle.rareSkin && 'RARE'].filter(Boolean).join(' ') || '—'],
  ];
  if (vehicle.targetLaneId) rows.push(['targetLane', vehicle.targetLaneId]);
  if (vehicle.isTurning) {
    rows.push(['turn', 'on']);
    rows.push(['turnProgress', (vehicle.turnProgress ?? 0).toFixed(3)]);
    if (vehicle.turnRadius != null) rows.push(['turnR', vehicle.turnRadius.toFixed(1)]);
    if (vehicle.turnCenterX != null) rows.push(['turnCx', vehicle.turnCenterX.toFixed(1)]);
    if (vehicle.turnCenterY != null) rows.push(['turnCy', vehicle.turnCenterY.toFixed(1)]);
  } else {
    rows.push(['turn', 'off']);
  }
  return (
    <div className="pointer-events-auto max-h-[min(70vh,420px)] overflow-y-auto rounded border border-[#58A6FF]/50 bg-[#1A1D23]/98 p-3 font-mono text-[11px] text-[#C9D1D9] shadow-2xl scrollbar-hide">
      <div className="border-b border-[#2D333B] pb-2 text-[10px] font-bold tracking-wider text-[#58A6FF]">VEHICLE STATE</div>
      <div className="mt-2 space-y-1">
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-6">
            <span className="text-[#8B949E]">{k}</span>
            <span className="text-right text-[#C9D1D9]">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
                                const commands = groupedCommands[dir];
                                if (!commands || commands.length === 0) return null;
                                // Sort commands to ensure (LEFT, STRAIGHT, RIGHT) order
                                const sortedCommands = [...commands].sort((a, b) => {
                                    const valA = a.target % 3 === 0 ? 3 : a.target % 3;
                                    const valB = b.target % 3 === 0 ? 3 : b.target % 3;
                                    return valA - valB;
                                });

                                return (
                                    <div key={dir} className="flex items-center justify-between gap-2 border-b border-[#2D333B]/30 last:border-0 pb-1 last:pb-0">
                                        <div className="text-[10px] text-[#C9D1D9] font-mono tracking-tighter uppercase opacity-90 shrink-0">
                                            {dir.replace('BOUND', '')}
                                        </div>
                                        <div className="flex gap-1">
                                            {sortedCommands.map(cmd => {
                                                const isYield = cmd.action === 'YIELD';
                                                const activeClass = isYield 
                                                    ? 'bg-[#D29922]/20 border-[#D29922]/30 text-[#D29922]' 
                                                    : 'bg-[#3FB950]/20 border-[#3FB950]/30 text-[#3FB950]';
                                                const inactiveClass = 'bg-[#1A1D23] border-[#2D333B] text-[#C9D1D9]';
                                                return (
                                                <span 
                                                    key={cmd.target} 
                                                    title={MovementLabels[cmd.target]}
                                                    className={`flex items-center justify-center w-7 h-7 rounded border font-mono transition-colors ${isActive ? activeClass : inactiveClass}`}
                                                >
                                                    {getMovementIcon(cmd.target)}
                                                    <span className="sr-only">{MovementLabels[cmd.target]?.replace(/^[A-Z]+_/, '')}</span>
                                                </span>
                                            )})}
                                        </div>
                                    </div>
                                );
                            })}
                            {phase.commands.length === 0 && (
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

const BriefingTab = () => (
  <div className="flex flex-col h-full bg-[#1A1D23] p-4 text-[#C9D1D9] font-mono overflow-y-auto scrollbar-hide">
    <div className="border-2 border-[#2D333B] bg-black/40 rounded-none p-4 mb-4 shadow-xl relative">
      <div className="absolute top-0 right-0 px-2 py-0.5 bg-[#F85149] text-black text-[9px] font-bold tracking-widest">CONFIDENTIAL</div>
      <div className="text-xs text-[#8B949E] mb-1 mt-2">FROM: <span className="text-[#58A6FF]">{level1Briefing.from}</span></div>
      <div className="text-xs text-[#8B949E] mb-3 border-b border-[#2D333B] pb-3">SUBJECT: <span className="text-[#C9D1D9]">{level1Briefing.subject}</span></div>
      <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{level1Briefing.body}</div>
      <ul className="mt-4 space-y-2 list-disc pl-5 text-[12px] text-[#3FB950]">
        {level1Briefing.bullets.map((b, i) => (
          <li key={i}><span className="text-[#C9D1D9]">{b}</span></li>
        ))}
      </ul>
    </div>
    <div className="mt-auto border-t-2 border-[#2D333B] pt-4">
      <div className="text-[10px] uppercase text-[#8B949E] tracking-wider mb-2">AUTHORIZED HARDWARE</div>
      <div className="flex flex-wrap gap-2">
        {level1Briefing.hardware.map((h, i) => (
          <span key={i} className="text-[10px] px-2 py-1 bg-[#D29922]/10 text-[#D29922] border border-[#D29922]/40 rounded-none uppercase">
            {h}
          </span>
        ))}
      </div>
    </div>
  </div>
);

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simMainRef = useRef<HTMLElement | null>(null);
  const inspectPaintRef = useRef<Vehicle | null>(null);
  const [inspectPanel, setInspectPanel] = useState<{ vehicle: Vehicle; left: number; top: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    if (!isPlaying) return;
    inspectPaintRef.current = null;
    setInspectPanel(null);
  }, [isPlaying]);
  const [phaseTimings, setPhaseTimings] = useState<number[]>(() => [...DEFAULT_BUILTIN_PHASE_TIMINGS]);
  
  // Traffic Flow State
  const [trafficRates, setTrafficRates] = useState<Record<string, number>>({
    N: BASE_SPAWN_RATE, S: BASE_SPAWN_RATE, E: BASE_SPAWN_RATE, W: BASE_SPAWN_RATE
  });
  const [offScreenQueues, setOffScreenQueues] = useState<Record<string, number>>({});
  const [isAdaptive, setIsAdaptive] = useState(true);
  
  // UI State
  const [introPhase, setIntroPhase] = useState<'splash' | 'home' | null>('splash');
  const [mobileScreen, setMobileScreen] = useState<'briefing' | 'engineering' | 'execution'>('briefing');
  const [isMobilePortrait, setIsMobilePortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return narrowViewport() && window.matchMedia('(orientation: portrait)').matches;
  });
  const [executionSplitActive, setExecutionSplitActive] = useState(false);
  const [sessionCarsCleared, setSessionCarsCleared] = useState(0);
  const [sessionCrashes, setSessionCrashes] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionTime, setSessionTime] = useState(0);

  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<any[]>([]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    let interval: number;
    if (executionSplitActive && isPlaying) {
      interval = window.setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [executionSplitActive, isPlaying]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobilePortrait(narrowViewport() && window.matchMedia('(orientation: portrait)').matches);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    if (introPhase !== 'splash') return;
    const t = window.setTimeout(() => setIntroPhase('home'), 2600);
    return () => clearTimeout(t);
  }, [introPhase]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => narrowViewport());
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
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
  const [zoom, setZoom] = useState(() => defaultZoom());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDraggingCanvasRef = useRef(false);
  const dragStartCanvasRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const [timeScale, setTimeScale] = useState<TimeScale>(1);
  const timeScaleRef = useRef<TimeScale>(1);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [loopLastMs, setLoopLastMs] = useState(0);
  const [loopAvg10Ms, setLoopAvg10Ms] = useState(0);
  const [crashInfo, setCrashInfo] = useState<CrashInfo | null>(null);
  const [isCrashModalMinimized, setIsCrashModalMinimized] = useState(false);
  const [installDeferred, setInstallDeferred] = useState<BeforeInstallPromptEventExtended | null>(null);
  const [isStandaloneDisplay, setIsStandaloneDisplay] = useState(false);

  useEffect(() => {
    setIsStandaloneDisplay(
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallDeferred(e as BeforeInstallPromptEventExtended);
    };
    const onAppInstalled = () => setInstallDeferred(null);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // Store accumulated demand per phase over the current cycle
  const cycleDemandRef = useRef<number[]>([]);
  const cycleCounterRef = useRef(0);
  
  // Interpreter State
  const [programCode, setProgramCode] = useState<string>(`phase(1): # North/South Priority
    NORTH_STRAIGHT.GO
    SOUTH_STRAIGHT.GO
    NORTH_RIGHT.GO
    SOUTH_RIGHT.GO
    # Lefts yield to oncoming thru traffic
    NORTH_LEFT.YIELD
    SOUTH_LEFT.YIELD

phase(2): # East/West Priority
    EAST_STRAIGHT.GO
    WEST_STRAIGHT.GO
    EAST_RIGHT.GO
    WEST_RIGHT.GO
    # Lefts yield to oncoming thru traffic
    EAST_LEFT.YIELD
    WEST_LEFT.YIELD
`);
  const [compiledPhases, setCompiledPhases] = useState<Phase[]>([]);
  const [compiledRules, setCompiledRules] = useState<ConditionalRule[]>([]);
  const [injectedPhase, setInjectedPhase] = useState<PhaseCommand[] | null>(null);
  const [programError, setProgramError] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [userTemplate, setUserTemplate] = useState(() => localStorage.getItem('traffic_user_template') || '');

  const [cmdDir, setCmdDir] = useState<string>('');
  const [cmdTurn, setCmdTurn] = useState<string>('');

  const monaco = useMonaco();
  useEffect(() => {
    if (!editorRef.current || !monaco) return;
    const phase = compiledPhases[currentPhase];
    if (phase && phase.lineStart !== undefined && phase.lineEnd !== undefined) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(phase.lineStart + 1, 1, phase.lineEnd + 1, 1),
          options: {
            isWholeLine: true,
            className: 'bg-[#3FB950]/20 border-l-2 border-[#3FB950]',
          }
        }
      ]);
    } else {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, []);
    }
  }, [currentPhase, compiledPhases, executionSplitActive, monaco]);

  const appendCommand = useCallback((action: string) => {
    let cmd = '';
    if (cmdDir === 'CROSSWALK') {
       if (!cmdTurn) return;
       cmd = `CROSSWALK_${cmdTurn}.${action}`;
    } else {
       if (!cmdDir || !cmdTurn) return;
       cmd = `${cmdDir}_${cmdTurn}.${action}`;
    }
    setProgramCode(prev => {
        const trimmed = prev.replace(/\s+$/, '');
        return trimmed + (trimmed ? '\n' : '') + cmd + '\n';
    });
    setCmdTurn('');
  }, [cmdDir, cmdTurn]);

  const appendPhase = useCallback(() => {
    setProgramCode(prev => {
        const trimmed = prev.replace(/\s+$/, '');
        const nextPhase = (prev.match(/phase\(/g) || []).length + 1;
        return trimmed + (trimmed ? '\n\n' : '') + `phase(${nextPhase}):\n`;
    });
  }, []);

  const deleteLastLine = useCallback(() => {
    setProgramCode(prev => {
        const lines = prev.split('\n');
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }
        if (lines.length > 0) {
            lines.pop();
        }
        return lines.join('\n') + '\n';
    });
  }, []);

  useEffect(() => {
    if (monaco) {
       const provider = monaco.languages.registerCompletionItemProvider('python', {
          provideCompletionItems: () => {
              const suggestions = [
                  ...Object.keys(KEYWORD_MAP).map(k => ({
                      label: `${k}.GO`,
                      kind: monaco.languages.CompletionItemKind.Keyword,
                      insertText: `${k}.GO`
                  })),
                  ...Object.keys(KEYWORD_MAP).map(k => ({
                      label: `${k}.YIELD`,
                      kind: monaco.languages.CompletionItemKind.Keyword,
                      insertText: `${k}.YIELD`
                  })),
                  {
                      label: 'phase()',
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: 'phase(${1:1}):\n\t$0',
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  },
                  {
                      label: 'phase(min, max)',
                      kind: monaco.languages.CompletionItemKind.Snippet,
                      insertText: 'phase(${1:1}, min=${2:10}, max=${3:20}):\n\t$0',
                      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                  }
              ];
              return { suggestions } as any;
          }
       });
       return () => provider.dispose();
    }
  }, [monaco]);

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
      setCompiledPhases([]);
      setCompiledRules([]);
      setInjectedPhase(null);
      setLightState('RED');
      setTimer(0);
      return;
    }
    if (result.phases && result.phases.length > 0) {
      setProgramError('');
      setCompiledPhases(result.phases);
      setCompiledRules(result.rules || []);
      const n = result.phases.length;
      setPhaseTimings((prev) =>
        clampPhaseTimingsToLoopCap(
          Array.from({ length: n }, (_, i) => prev[i] ?? DEFAULT_PHASE_GREEN_SECONDS),
          n,
        ),
      );
      setCurrentPhase(0);
      setInjectedPhase(null);
      setLightState('GREEN');
      setTimer(0);
      return;
    }
    setProgramError('');
    setCompiledPhases([]);
    setCompiledRules([]);
    setInjectedPhase(null);
    setLightState('RED');
    setTimer(0);
  }, [programCode]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      compile();
    }, 500);
    return () => clearTimeout(timeout);
  }, [compile]);

  const vehiclesRef = useRef<Vehicle[]>([]);
  const forceRareSpawnRef = useRef(false);
  const forceLegendarySpawnRef = useRef(false);
  const laneCarsCacheRef = useRef<Record<string, Vehicle[]>>({});
  const skidMarksRef = useRef<SkidMarkSegment[]>([]);
  const previousRearTiresRef = useRef<Record<string, RearTires>>({});
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(null);
  const crashDetectedRef = useRef(false);
  const loopUpdateSectionsRef = useRef<Record<string, number>>({});
  const loopDrawSectionsRef = useRef<Record<string, number>>({});
  const loopTotalMsWindowRef = useRef<number[]>([]);
  const loopHudThrottleRef = useRef(0);
  const [bgFontsReady, setBgFontsReady] = useState(false);
  const heatMapRef = useRef<Float32Array>(new Float32Array(HEAT_GRID_COLS * HEAT_GRID_ROWS));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await document.fonts.ready;
      await document.fonts.load('700 24px "Material Symbols Outlined"');
      if (!cancelled) setBgFontsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    LANES.forEach(l => laneCarsCacheRef.current[l.id] = []);
  }, []);

  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);

  const addLog = useCallback((event: string, color?: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    setLogs(prev => [{ id: Math.random().toString(), time, event, color }, ...prev].slice(0, 20));
  }, []);

  const resetSimulation = useCallback((reason: 'MANUAL' | 'CRASH') => {
    vehiclesRef.current = [];
    heatMapRef.current.fill(0);
    skidMarksRef.current = [];
    previousRearTiresRef.current = {};
    crashDetectedRef.current = false;
    setCrashInfo(null);
    setIsCrashModalMinimized(false);
    setOffScreenQueues({});
    setInjectedPhase(null);
    setCurrentPhase(0);
    setLightState('GREEN');
    setTimer(0);
    inspectPaintRef.current = null;
    setInspectPanel(null);
    isPlayingRef.current = true;
    setIsPlaying(true);
    addLog(reason === 'CRASH' ? 'CRASH RESET' : 'MANUAL RESET', reason === 'CRASH' ? 'var(--red)' : 'var(--minor)');
  }, [addLog]);

  const applyTemplate = (code: string) => {
    if (!code) return;
    vehiclesRef.current = [];
    previousRearTiresRef.current = {};
    crashDetectedRef.current = false;
    setCrashInfo(null);
    setIsCrashModalMinimized(false);
    setOffScreenQueues({});
    inspectPaintRef.current = null;
    setInspectPanel(null);
    setProgramCode(code);
    compile(code);
    addLog("TEMPLATE_APPLIED", "var(--major)");
  };

  const detectCrash = useCallback((vehicles: Vehicle[]): CrashInfo | null => {
    const center = CANVAS_SIZE / 2;
    const intersectionHalf = INTERSECTION_SIZE / 2 + 32;
    const inIntersection = (v: Vehicle) =>
      Math.abs(v.x - center) <= intersectionHalf && Math.abs(v.y - center) <= intersectionHalf;
    const mergePairKey = (laneA: string, laneB: string) =>
      laneA < laneB ? `${laneA}|${laneB}` : `${laneB}|${laneA}`;
    const normalizeAngle = (angle: number) => {
      let a = angle;
      while (a <= -Math.PI) a += Math.PI * 2;
      while (a > Math.PI) a -= Math.PI * 2;
      return a;
    };
    const laneApproachHeading = (lane: Lane | undefined) => {
      if (!lane) return null;
      if (lane.direction === 'N') return -Math.PI / 2;
      if (lane.direction === 'S') return Math.PI / 2;
      if (lane.direction === 'E') return 0;
      return Math.PI;
    };
    const isFollowingPair = (a: Vehicle, b: Vehicle) => {
      const la = LANE_MAP.get(a.laneId);
      const lb = LANE_MAP.get(b.laneId);
      const speedA = Math.hypot(a.vx, a.vy);
      const speedB = Math.hypot(b.vx, b.vy);
      const headingA = speedA > 0.35 ? Math.atan2(a.vy, a.vx) : laneApproachHeading(la) ?? Math.atan2(a.vy, a.vx);
      const headingB = speedB > 0.35 ? Math.atan2(b.vy, b.vx) : laneApproachHeading(lb) ?? Math.atan2(b.vy, b.vx);
      const headingDelta = Math.abs(normalizeAngle(headingA - headingB));
      if (headingDelta > 0.55) return false;

      const avgHeadingX = Math.cos((headingA + headingB) * 0.5);
      const avgHeadingY = Math.sin((headingA + headingB) * 0.5);
      const relX = b.x - a.x;
      const relY = b.y - a.y;
      const longitudinalGap = relX * avgHeadingX + relY * avgHeadingY;
      const lateralGap = Math.abs(relX * -avgHeadingY + relY * avgHeadingX);
      const laneWidthTolerance = Math.max(a.width, b.width) * 1.15;
      const convoyLen = Math.max(a.length, b.length) * 1.25;

      if (
        la &&
        lb &&
        la.direction === lb.direction &&
        la.type === 'THRU' &&
        lb.type === 'THRU' &&
        headingDelta < 0.35 &&
        lateralGap <= laneWidthTolerance &&
        Math.abs(longitudinalGap) <= convoyLen
      ) {
        return true;
      }

      return Math.abs(longitudinalGap) <= convoyLen && lateralGap <= laneWidthTolerance;
    };

    for (let i = 0; i < vehicles.length; i++) {
      const a = vehicles[i];
      if (!inIntersection(a)) continue;
      const speedA = Math.hypot(a.vx, a.vy);
      for (let j = i + 1; j < vehicles.length; j++) {
        const b = vehicles[j];
        if (!inIntersection(b)) continue;
        const speedB = Math.hypot(b.vx, b.vy);
        if (speedA + speedB < 1.2) continue;
        const la = LANE_MAP.get(a.laneId);
        const lb = LANE_MAP.get(b.laneId);
        if (la && lb && la.movement === lb.movement) continue;
        if (a.laneId === b.laneId || isFollowingPair(a, b)) continue;
        if (ADJACENT_RIGHT_MERGE_PAIR_KEYS.has(mergePairKey(a.laneId, b.laneId))) continue;
        if (ADJACENT_LEFT_MERGE_PAIR_KEYS.has(mergePairKey(a.laneId, b.laneId))) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const collisionDist = (Math.max(a.width, a.length) + Math.max(b.width, b.length)) * 0.3;
        if ((dx * dx + dy * dy) <= collisionDist * collisionDist) {
          return {
            x: (a.x + b.x) * 0.5,
            y: (a.y + b.y) * 0.5,
            laneA: a.laneId,
            laneB: b.laneId,
            vehicleIds: [a.id, b.id],
          };
        }
      }
    }
    return null;
  }, []);

  // Initial boot log
  useEffect(() => {
    addLog('SYS BOOT OK', 'var(--green)');
  }, []);

  useEffect(() => {
    const toggleLegendarySpawnTest = () => {
      forceLegendarySpawnRef.current = !forceLegendarySpawnRef.current;
      if (forceLegendarySpawnRef.current) forceRareSpawnRef.current = false;
      addLog(
        forceLegendarySpawnRef.current ? 'LEGENDARY_SPAWN_TEST_ON' : 'LEGENDARY_SPAWN_TEST_OFF',
        forceLegendarySpawnRef.current ? 'var(--yellow)' : 'var(--green)',
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F8') {
        e.preventDefault();
        forceRareSpawnRef.current = !forceRareSpawnRef.current;
        if (forceRareSpawnRef.current) forceLegendarySpawnRef.current = false;
        addLog(
          forceRareSpawnRef.current ? 'RARE_SPAWN_TEST_ON' : 'RARE_SPAWN_TEST_OFF',
          forceRareSpawnRef.current ? 'var(--yellow)' : 'var(--green)',
        );
      }
      if (e.code === 'F9') {
        e.preventDefault();
        toggleLegendarySpawnTest();
      }
      if (e.code === 'KeyL' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        toggleLegendarySpawnTest();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addLog]);

  const yieldMovements = useMemo(
    () =>
      injectedPhase
        ? injectedPhase.filter((c) => c.action === 'YIELD').map((c) => c.target)
        : compiledPhases.length > 0
          ? compiledPhases[currentPhase]?.commands.filter((c) => c.action === 'YIELD').map((c) => c.target) || []
          : [],
    [compiledPhases, currentPhase, injectedPhase],
  );

  const activeMovements = useMemo(
    () =>
      injectedPhase
        ? injectedPhase.filter((c) => c.action === 'GO').map((c) => c.target)
        : compiledPhases.length > 0
          ? compiledPhases[currentPhase]?.commands.filter((c) => c.action === 'GO').map((c) => c.target) || []
          : [],
    [compiledPhases, currentPhase, injectedPhase],
  );

  // Accumulate traffic data when phases are active
  useEffect(() => {
    if (!isPlaying || !isAdaptive) return;
    if (compiledPhases.length === 0) return;

    const n = compiledPhases.length;
    if (!cycleDemandRef.current || cycleDemandRef.current.length !== n) {
      cycleDemandRef.current = new Array(n).fill(0);
    }

    const laneCounts = new Map<string, number>();
    vehiclesRef.current.forEach(v => laneCounts.set(v.laneId, (laneCounts.get(v.laneId) || 0) + 1));

    const movementsInPhase = compiledPhases[currentPhase].commands.map((c) => c.target);
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
          let smoothed = next[i] + Math.round(diff * 0.4);
          
          if (compiledPhases[i]) {
            if (compiledPhases[i].minDuration !== undefined) {
              smoothed = Math.max(smoothed, compiledPhases[i].minDuration);
            }
            if (compiledPhases[i].maxDuration !== undefined) {
              smoothed = Math.min(smoothed, compiledPhases[i].maxDuration);
            }
          }
          return smoothed;
        });
      });
    }

  }, [currentPhase, lightState, isAdaptive, isPlaying, offScreenQueues, compiledPhases]);

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
    }, 2000 / timeScale);
    return () => clearInterval(interval);
  }, [isPlaying, phaseTimings, offScreenQueues, timeScale]);

  // 1. Timer update interval
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimer(prev => prev + 0.1 * timeScale);
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, timeScale]);

  // 2. Traffic light state transition logic
  useEffect(() => {
    if (!isPlaying) return;
    if (compiledPhases.length === 0) {
      if (lightState !== 'RED') {
        setLightState('RED');
        setTimer(0);
      }
      return;
    }

    const sc = compiledPhases.length;
    const idx = currentPhase % sc;
    const currentMaxGreen = injectedPhase ? MIN_PHASE_GREEN_SECONDS : (phaseTimings[idx] ?? DEFAULT_PHASE_GREEN_SECONDS);

    if (lightState === 'GREEN' && timer >= currentMaxGreen) {
      setLightState('YELLOW');
      addLog(`${formatActiveMovements(activeMovements)} YELLOW`, 'var(--yellow)');
      setTimer(0);
    } else if (lightState === 'YELLOW' && timer >= DEFAULT_TIMINGS.yellow) {
      setLightState('RED');
      addLog('ALL RED WAIT', 'var(--red)');
      setTimer(0);
    } else if (lightState === 'RED' && timer >= DEFAULT_TIMINGS.allRed) {
      let matchedRule: ConditionalRule | null = null;
      if (!injectedPhase) {
        for (const rule of compiledRules) {
           if ((offScreenQueues[rule.targetLaneId] || 0) > rule.threshold) {
               matchedRule = rule;
               break;
           }
        }
      }

      if (matchedRule) {
          setInjectedPhase(matchedRule.insertCommands);
          setLightState('GREEN');
          addLog('SENSOR OVERRIDE ACTIVE', 'var(--major)');
          setTimer(0);
      } else {
          const nextPhaseIndex = (currentPhase + (injectedPhase ? 0 : 1)) % compiledPhases.length;
          const nextMovements = compiledPhases[nextPhaseIndex]?.commands.map((c) => c.target) || [];
          setInjectedPhase(null);
          setLightState('GREEN');
          setCurrentPhase(nextPhaseIndex);
          addLog(`${formatActiveMovements(nextMovements)} START`, 'var(--major)');
          setTimer(0);
      }
    }
  }, [timer, isPlaying, lightState, currentPhase, phaseTimings, activeMovements, compiledPhases, compiledRules, injectedPhase, offScreenQueues, addLog]);

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
    }, 500 / timeScale);
    return () => clearInterval(interval);
  }, [isPlaying, trafficRates, timeScale]);

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
            let spec = vehicleCatalog.defaultSpawn;
            for (let si = 0; si < vehicleCatalog.spawnRollOrder.length; si++) {
              const row = vehicleCatalog.spawnRollOrder[si];
              if (r < row.rLessThan) {
                spec = row;
                break;
              }
            }
            const vType = spec.vType as VehicleType;
            const width = spec.width;
            const length = spec.length;
            const cruiseSpeed = spec.cruiseSpeedMin + Math.random() * (spec.cruiseSpeedMax - spec.cruiseSpeedMin);
            const accel = spec.accel;
            const decel = spec.decel;

            let legendarySkin = false;
            let rareSkin = false;
            if (forceLegendarySpawnRef.current) {
              legendarySkin = true;
            } else if (forceRareSpawnRef.current) {
              rareSkin = true;
            } else {
              legendarySkin = Math.random() < LEGENDARY_SPAWN_CHANCE;
              rareSkin = !legendarySkin && Math.random() < 0.01;
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
                legendarySkin,
                rareSkin,
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
    }, 150 / timeScale);
    return () => clearInterval(interval);
  }, [isPlaying, timeScale]);

  const update = useCallback((time: number, simStep: number) => {
    const u = loopUpdateSectionsRef.current;
    for (const k of Object.keys(u)) delete u[k];
    let m = performance.now();

    const vehicles = vehiclesRef.current;
    const nextRearTires: Record<string, RearTires> = {};
    const heatMap = heatMapRef.current;
    for (let i = 0; i < heatMap.length; i++) {
      heatMap[i] *= Math.pow(HEATMAP_DECAY, simStep);
    }
    u.heatDecay = performance.now() - m;
    m = performance.now();
    
    const laneCars = laneCarsCacheRef.current;
    for (const k in laneCars) laneCars[k].length = 0;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (laneCars[v.laneId]) laneCars[v.laneId].push(v);
    }
    u.bucketLanes = performance.now() - m;
    m = performance.now();

    vehicles.forEach((v) => {
      const lane = LANE_MAP.get(v.laneId)!;
      const isYield = yieldMovements.includes(lane.movement);
      const isGreen = (activeMovements.includes(lane.movement) || isYield) && lightState === 'GREEN';
      const isYellow = (activeMovements.includes(lane.movement) || isYield) && lightState === 'YELLOW';
      
      // Target Speed
      let targetSpeed = v.cruiseSpeed;
      if ((time - v.spawnAtMs) * timeScaleRef.current < v.startDelay * 1000) {
        targetSpeed = 0;
      }
      
      // Distance to intersection stop line
      let distToStop = Infinity;
      if (lane.direction === 'N') distToStop = v.y - (CANVAS_SIZE / 2 + STOP_LINE);
      if (lane.direction === 'S') distToStop = (CANVAS_SIZE / 2 - STOP_LINE) - v.y;
      if (lane.direction === 'E') distToStop = (CANVAS_SIZE / 2 - STOP_LINE) - v.x;
      if (lane.direction === 'W') distToStop = v.x - (CANVAS_SIZE / 2 + STOP_LINE);

      // Light logic
      let mustStopForLight = false;
      if (!isGreen) { // Normal Red/Yellow stop check
        if (distToStop > 0 && distToStop < 100) {
          if (!isYellow || distToStop > 40) {
            mustStopForLight = true;
          }
        }
      }

      // Yield Check (Applies to both Green and moving on Yellow)
      if (!mustStopForLight && isYield && distToStop > -20 && distToStop < 40) {
        let conflictingLaneIds: string[] = [];
        if (lane.type === 'LEFT') {
          const oncoming =
            lane.direction === 'N'
              ? ['sb-thru', 'sb-right']
              : lane.direction === 'S'
                ? ['nb-thru', 'nb-right']
                : lane.direction === 'E'
                  ? ['wb-thru', 'wb-right']
                  : ['eb-thru', 'eb-right'];
          conflictingLaneIds = [...oncoming, ...LEFT_LANE_IDS.filter((id) => id !== lane.id)];
        } else if (lane.type === 'RIGHT') {
          if (lane.direction === 'N') conflictingLaneIds = ['wb-thru', 'wb-right', 'sb-left'];
          if (lane.direction === 'S') conflictingLaneIds = ['eb-thru', 'eb-right', 'nb-left'];
          if (lane.direction === 'E') conflictingLaneIds = ['nb-thru', 'nb-right', 'wb-left'];
          if (lane.direction === 'W') conflictingLaneIds = ['sb-thru', 'sb-right', 'eb-left'];
        } else if (lane.type === 'THRU') {
          if (lane.direction === 'N' || lane.direction === 'S') {
            conflictingLaneIds = LANES.filter((l) => l.direction === 'E' || l.direction === 'W').map((l) => l.id);
          } else {
            conflictingLaneIds = LANES.filter((l) => l.direction === 'N' || l.direction === 'S').map((l) => l.id);
          }
        }

        for (const conflictingLaneId of conflictingLaneIds) {
          const oncoming = laneCars[conflictingLaneId] || [];
          for (const other of oncoming) {
            let otherDistToStop = Infinity;
            if (conflictingLaneId.startsWith('sb-')) otherDistToStop = (CANVAS_SIZE / 2 - STOP_LINE) - other.y;
            if (conflictingLaneId.startsWith('nb-')) otherDistToStop = other.y - (CANVAS_SIZE / 2 + STOP_LINE);
            if (conflictingLaneId.startsWith('wb-')) otherDistToStop = other.x - (CANVAS_SIZE / 2 + STOP_LINE);
            if (conflictingLaneId.startsWith('eb-')) otherDistToStop = (CANVAS_SIZE / 2 - STOP_LINE) - other.x;

            if (otherDistToStop > -80 && otherDistToStop < 220) {
              const otherSpeed = Math.abs(other.vx) + Math.abs(other.vy);
              const isMoving = otherSpeed > 0.5;
              const isStuckInIntersection = !isMoving && otherDistToStop > -80 && otherDistToStop <= 0;
              const nearContest =
                distToStop < 50 && otherDistToStop > -20 && otherDistToStop < 50;
              if (
                otherDistToStop <= 0 ||
                isStuckInIntersection ||
                (isMoving && otherDistToStop < 220) ||
                (nearContest &&
                  (otherDistToStop < distToStop - 2 ||
                    (Math.abs(otherDistToStop - distToStop) <= 3 &&
                      v.laneId.localeCompare(conflictingLaneId) > 0)))
              ) {
                mustStopForLight = true;
                break;
              }
            }
          }
          if (mustStopForLight) break;
        }
      }

      if (mustStopForLight) {
        targetSpeed = 0;
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
              // Tie-breaker to prevent symmetric deadlocks when turns cross paths
              if (v.id < other.id) {
                carAhead = other;
                break;
              }
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

      const newSpeed = Math.max(0, currentSpeed + accel * simStep);
      
      if (newSpeed < currentSpeed - 0.001) {
          v.brakeIntensity = Math.min(1, (currentSpeed - newSpeed) / v.decel);
      } else {
          v.brakeIntensity = 0;
      }
      const isStopped = newSpeed < 0.1;
      const heatLoad = (isStopped ? 1 : 0) + (v.brakeIntensity || 0);
      if (heatLoad > 0) {
        const gridX = Math.max(0, Math.min(HEAT_GRID_COLS - 1, Math.floor((v.x / CANVAS_SIZE) * HEAT_GRID_COLS)));
        const gridY = Math.max(0, Math.min(HEAT_GRID_ROWS - 1, Math.floor((v.y / CANVAS_SIZE) * HEAT_GRID_ROWS)));
        const heatIndex = gridY * HEAT_GRID_COLS + gridX;
        heatMap[heatIndex] = Math.min(HEATMAP_MAX, heatMap[heatIndex] + heatLoad * HEATMAP_GAIN);
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
          v.turnProgress = Math.min(1, v.turnProgress! + (angularSpeed / (Math.PI / 2)) * simStep);
          
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

          v.x += v.vx * simStep;
          v.y += v.vy * simStep;
      }

      const currentRearTires = getRearTirePositions(v);
      const previousRearTires = previousRearTiresRef.current[v.id];
      if (previousRearTires && (v.brakeIntensity || 0) > SKID_MARK_BRAKE_THRESHOLD) {
        const segmentWidth = Math.max(0.9, v.width * 0.12);
        const baseAlpha = 0.18 + ((v.brakeIntensity || 0) - SKID_MARK_BRAKE_THRESHOLD) * 0.34;
        skidMarksRef.current.push(
          { from: previousRearTires.left, to: currentRearTires.left, bornAt: time, ttlMs: SKID_MARK_TTL_MS, baseAlpha, width: segmentWidth },
          { from: previousRearTires.right, to: currentRearTires.right, bornAt: time, ttlMs: SKID_MARK_TTL_MS, baseAlpha, width: segmentWidth },
        );
      }
      nextRearTires[v.id] = currentRearTires;
    });
    u.vehicleSim = performance.now() - m;
    m = performance.now();

    let validCount = 0;
    let newlyCleared = 0;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (v.x >= -50 && v.x <= CANVAS_SIZE + 50 && v.y >= -50 && v.y <= CANVAS_SIZE + 50) {
        vehicles[validCount++] = v;
      } else {
        newlyCleared++;
      }
    }
    vehicles.length = validCount;
    if (newlyCleared > 0) {
      setSessionCarsCleared(prev => prev + newlyCleared);
    }
    const filteredRearTires: Record<string, RearTires> = {};
    for (let i = 0; i < vehicles.length; i++) {
      const vehicleId = vehicles[i].id;
      const tires = nextRearTires[vehicleId];
      if (tires) filteredRearTires[vehicleId] = tires;
    }
    previousRearTiresRef.current = filteredRearTires;
    skidMarksRef.current = skidMarksRef.current.filter(
      (segment) => (time - segment.bornAt) * timeScaleRef.current < segment.ttlMs,
    );
    if (skidMarksRef.current.length > MAX_SKID_MARK_SEGMENTS) {
      skidMarksRef.current.splice(0, skidMarksRef.current.length - MAX_SKID_MARK_SEGMENTS);
    }
    if (!crashDetectedRef.current) {
      const collision = detectCrash(vehicles);
      if (collision) {
        crashDetectedRef.current = true;
        setCrashInfo(collision);
        setSessionCrashes(prev => prev + 1);
        setIsCrashModalMinimized(false);
        isPlayingRef.current = false;
        setIsPlaying(false);
        addLog('CRASH DETECTED', 'var(--red)');
      }
    }
    u.cullSkid = performance.now() - m;
  }, [activeMovements, lightState, addLog, detectCrash]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, time: number) => {
    const d = loopDrawSectionsRef.current;
    for (const k of Object.keys(d)) delete d[k];
    let md = performance.now();

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    d.clear = performance.now() - md;
    md = performance.now();

    const centerX = CANVAS_SIZE / 2;
    const centerY = CANVAS_SIZE / 2;

    const drawBgGlyphLayer = (c: CanvasRenderingContext2D) => {
      const drawRoadArrow = (x: number, y: number, angle: number, icon: string) => {
        c.save();
        c.translate(x, y);
        c.rotate(angle);
        c.fillStyle = '#B8C0CC';
        c.font = '700 24px "Material Symbols Outlined"';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(icon, 0, 0);
        c.restore();
      };

      const drawStaticLabel = (label: string, x: number, y: number) => {
        c.fillStyle = '#FFFFFF';
        c.textAlign = 'left';
        c.textBaseline = 'top';
        c.font = 'bold 12px "JetBrains Mono"';
        c.fillText(label, x, y);
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
    };

    ctx.fillStyle = '#1A1D23';
    ctx.fillRect(centerX - INTERSECTION_SIZE / 2, 0, INTERSECTION_SIZE, CANVAS_SIZE);
    ctx.fillRect(0, centerY - INTERSECTION_SIZE / 2, CANVAS_SIZE, INTERSECTION_SIZE);
    ctx.fillStyle = '#0D0F12';
    ctx.fillRect(centerX - INTERSECTION_SIZE / 2, centerY - INTERSECTION_SIZE / 2, INTERSECTION_SIZE, INTERSECTION_SIZE);
    ctx.strokeStyle = '#2D333B';
    ctx.lineWidth = 1;

    const drawLaneMarkers = (x: number, y: number, length: number, horizontal: boolean) => {
      if (horizontal) {
        ctx.moveTo(x, y); ctx.lineTo(x + length, y);
      } else {
        ctx.moveTo(x, y); ctx.lineTo(x, y + length);
      }
    };

    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#444c56';
    ctx.beginPath();
    ctx.moveTo(centerX - 2, 0); ctx.lineTo(centerX - 2, centerY - INTERSECTION_SIZE / 2);
    ctx.moveTo(centerX + 2, 0); ctx.lineTo(centerX + 2, centerY - INTERSECTION_SIZE / 2);
    ctx.moveTo(centerX - 2, centerY + INTERSECTION_SIZE / 2); ctx.lineTo(centerX - 2, CANVAS_SIZE);
    ctx.moveTo(centerX + 2, centerY + INTERSECTION_SIZE / 2); ctx.lineTo(centerX + 2, CANVAS_SIZE);
    ctx.moveTo(0, centerY - 2); ctx.lineTo(centerX - INTERSECTION_SIZE / 2, centerY - 2);
    ctx.moveTo(0, centerY + 2); ctx.lineTo(centerX - INTERSECTION_SIZE / 2, centerY + 2);
    ctx.moveTo(centerX + INTERSECTION_SIZE / 2, centerY - 2); ctx.lineTo(CANVAS_SIZE, centerY - 2);
    ctx.moveTo(centerX + INTERSECTION_SIZE / 2, centerY + 2); ctx.lineTo(CANVAS_SIZE, centerY + 2);
    ctx.stroke();

    ctx.strokeStyle = '#2D333B';
    ctx.lineWidth = 1;
    ctx.setLineDash([20, 20]);
    ctx.beginPath();
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
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2D333B';
    ctx.beginPath();
    ctx.moveTo(centerX - INTERSECTION_SIZE / 2, centerY - STOP_LINE); ctx.lineTo(centerX + INTERSECTION_SIZE / 2, centerY - STOP_LINE);
    ctx.moveTo(centerX - INTERSECTION_SIZE / 2, centerY + STOP_LINE); ctx.lineTo(centerX + INTERSECTION_SIZE / 2, centerY + STOP_LINE);
    ctx.moveTo(centerX - STOP_LINE, centerY - INTERSECTION_SIZE / 2); ctx.lineTo(centerX - STOP_LINE, centerY + INTERSECTION_SIZE / 2);
    ctx.moveTo(centerX + STOP_LINE, centerY - INTERSECTION_SIZE / 2); ctx.lineTo(centerX + STOP_LINE, centerY + INTERSECTION_SIZE / 2);
    ctx.stroke();

    if (bgFontsReady) {
      drawBgGlyphLayer(ctx);
    }
    d.bgBase = performance.now() - md;
    md = performance.now();

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
    d.paths = performance.now() - md;
    md = performance.now();

    if (showHeatmap) {
      const cellWidth = CANVAS_SIZE / HEAT_GRID_COLS;
      const cellHeight = CANVAS_SIZE / HEAT_GRID_ROWS;
      const heatMap = heatMapRef.current;
      for (let y = 0; y < HEAT_GRID_ROWS; y++) {
        for (let x = 0; x < HEAT_GRID_COLS; x++) {
          const heat = heatMap[y * HEAT_GRID_COLS + x];
          if (heat <= 0.08) continue;
          const t = Math.max(0, Math.min(1, heat / HEATMAP_MAX));
          const red = Math.round(255 * t);
          const green = Math.round(255 * (1 - t));
          const alpha = 0.08 + t * 0.37;
          ctx.fillStyle = `rgba(${red}, ${green}, 0, ${alpha})`;
          ctx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
        }
      }
    }
    d.heatmap = performance.now() - md;
    md = performance.now();

    if (skidMarksRef.current.length > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < skidMarksRef.current.length; i++) {
        const segment = skidMarksRef.current[i];
        const ageRatio = ((time - segment.bornAt) * timeScaleRef.current) / segment.ttlMs;
        const alpha = segment.baseAlpha * (1 - Math.min(1, ageRatio));
        if (alpha <= 0) continue;
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`;
        ctx.lineWidth = segment.width;
        ctx.beginPath();
        ctx.moveTo(segment.from.x, segment.from.y);
        ctx.lineTo(segment.to.x, segment.to.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    d.skidMarks = performance.now() - md;
    md = performance.now();

    const drawSignal = (x: number, y: number, angle: number, movements: Movement[], isLeft: boolean = false) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      const isActive = movements.some(m => activeMovements.includes(m));
      const isYield = movements.some(m => yieldMovements.includes(m));
      let currentHeadState = 'RED';
      if (isActive) currentHeadState = lightState;
      else if (isYield && lightState === 'GREEN') currentHeadState = 'FLASHING_YELLOW';
      else if (isYield && lightState === 'YELLOW') currentHeadState = 'YELLOW';

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
        let isOn = currentHeadState === state;
        if (state === 'YELLOW' && currentHeadState === 'FLASHING_YELLOW') {
            isOn = Math.floor(time / Math.max(100, 500 / timeScaleRef.current)) % 2 === 0;
        }
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
    d.queueLabels = performance.now() - md;
    md = performance.now();

    vehiclesRef.current.forEach(v => {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle);
      if (v.vType === 'MOTORCYCLE') ctx.scale(1.25, 1);

      const lane = LANE_MAP.get(v.laneId);
      const isStopped = Math.abs(v.vx) < 0.1 && Math.abs(v.vy) < 0.1;
      const brakeIntensity = v.brakeIntensity || 0;
      const isBraking = isStopped || brakeIntensity > 0;

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      renderVehicleSprite({
        ctx,
        v,
        lane,
        time,
        isStopped,
        isBraking,
        brakeIntensity,
      });
      const isCrashedVehicle = !!crashInfo && crashInfo.vehicleIds.includes(v.id);
      const shouldFlashCrash = Math.floor(time / 180) % 2 === 0;
      if (isCrashedVehicle && shouldFlashCrash) {
        ctx.strokeStyle = 'rgba(248, 81, 73, 0.95)';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(248, 81, 73, 0.85)';
        ctx.shadowBlur = 14;
        ctx.strokeRect(
          -v.length / 2 - 3,
          -v.width / 2 - 3,
          v.length + 6,
          v.width + 6,
        );
      }

      ctx.restore();
    });
    d.vehicles = performance.now() - md;
    md = performance.now();

    const inspected = inspectPaintRef.current;
    if (inspected) {
      const insLane = LANE_MAP.get(inspected.laneId);
      if (insLane) {
        const geom = getPathGeometry(insLane, centerX, centerY);
        const end = getPathEndPoint(geom);
        ctx.save();
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.95)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        if (geom.type === 'STRAIGHT') {
          ctx.moveTo(geom.startX, geom.startY);
          ctx.lineTo(geom.endX, geom.endY);
        } else {
          ctx.arc(geom.centerX, geom.centerY, geom.radius, geom.startAngle, geom.endAngle, geom.counterClockwise);
        }
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(inspected.x, inspected.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Crosswalks (Below Signals)
    const drawCrosswalk = (m: Movement, x: number, y: number, isVertical: boolean) => {
        const isActive = activeMovements.includes(m) && lightState === 'GREEN';
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = isActive ? 'rgba(63, 185, 80, 0.4)' : 'rgba(255, 255, 255, 0.05)';
        if (isVertical) {
            for (let i = -80; i <= 80; i += 20) {
                ctx.fillRect(i, -10, 10, 20);
            }
        } else {
            for (let i = -80; i <= 80; i += 20) {
                ctx.fillRect(-10, i, 20, 10);
            }
        }
        ctx.restore();
    };

    drawCrosswalk(Movement.CROSSWALK_NORTH, centerX, centerY - INTERSECTION_SIZE / 2 - 15, true);
    drawCrosswalk(Movement.CROSSWALK_SOUTH, centerX, centerY + INTERSECTION_SIZE / 2 + 15, true);
    drawCrosswalk(Movement.CROSSWALK_EAST, centerX + INTERSECTION_SIZE / 2 + 15, centerY, false);
    drawCrosswalk(Movement.CROSSWALK_WEST, centerX - INTERSECTION_SIZE / 2 - 15, centerY, false);

    // 4. Signal Lights (Top Layer)
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
    d.chrome = performance.now() - md;

  }, [activeMovements, lightState, offScreenQueues, bgFontsReady, showHeatmap, yieldMovements, crashInfo]);

  const loop = useCallback((time: number) => {
    const tLoop = performance.now();
    let updateMs = 0;
    if (lastTimeRef.current !== null && isPlayingRef.current) {
      const wallDtSec = Math.min(0.05, (time - lastTimeRef.current) / 1000);
      const simStep = wallDtSec * 60 * timeScaleRef.current;
      const u0 = performance.now();
      let remaining = simStep;
      while (remaining > 1e-8) {
        const sub = Math.min(MAX_SIM_INTEGRATION_STEP, remaining);
        update(time, sub);
        remaining -= sub;
      }
      updateMs = performance.now() - u0;
    }
    let drawMs = 0;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      const d0 = performance.now();
      draw(ctx, time);
      drawMs = performance.now() - d0;
    }
    const totalMs = performance.now() - tLoop;

    const win = loopTotalMsWindowRef.current;
    win.push(totalMs);
    if (win.length > 10) win.shift();
    const avg10 = win.reduce((a, b) => a + b, 0) / win.length;

    const hudNow = performance.now();
    if (hudNow - loopHudThrottleRef.current >= LOOP_HUD_MIN_INTERVAL_MS) {
      loopHudThrottleRef.current = hudNow;
      setLoopLastMs(totalMs);
      setLoopAvg10Ms(avg10);
    }

    if (totalMs >= LOOP_LAG_LOG_MS) {
      const round = (x: number) => Number(x.toFixed(2));
      const pack = (o: Record<string, number>) =>
        Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));
      console.warn('[gameLoop]', {
        totalMs: round(totalMs),
        updateMs: round(updateMs),
        drawMs: round(drawMs),
        updateSections: pack(loopUpdateSectionsRef.current),
        drawSections: pack(loopDrawSectionsRef.current),
      });
    }

    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(loop);
  }, [update, draw]);

  useEffect(() => {
    if (introPhase !== null) return;
    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop, introPhase]);

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

  const togglePlayback = useCallback(() => {
    setIsPlaying((playing) => {
      const next = !playing;
      isPlayingRef.current = next;
      return next;
    });
  }, []);

  const dismissIntroSplash = useCallback(() => setIntroPhase('home'), []);

  const enterGameFromIntro = useCallback(() => {
    setIntroPhase(null);
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, []);

  const returnToMainMenu = useCallback(() => {
    setIntroPhase('home');
    isPlayingRef.current = false;
    setIsPlaying(false);
    setExecutionSplitActive(false);
    setMobileScreen('briefing');
    inspectPaintRef.current = null;
    setInspectPanel(null);
  }, []);

  const handleCanvasWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const zoomDelta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom((z) => Math.max(0.5, Math.min(3, z + zoomDelta)));
  }, []);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingCanvasRef.current = true;
    hasDraggedRef.current = false;
    dragStartCanvasRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = pan;
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [pan]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingCanvasRef.current) return;
    const dx = e.clientX - dragStartCanvasRef.current.x;
    const dy = e.clientY - dragStartCanvasRef.current.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasDraggedRef.current = true;
    }
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy
    });
  }, []);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingCanvasRef.current) return;
    isDraggingCanvasRef.current = false;
    (e.target as Element).releasePointerCapture(e.pointerId);

    if (hasDraggedRef.current) return;

    const canvas = canvasRef.current;
    const mainEl = simMainRef.current;
    if (!canvas || !mainEl) return;
    const cr = canvas.getBoundingClientRect();
    const px = ((e.clientX - cr.left) / cr.width) * CANVAS_SIZE;
    const py = ((e.clientY - cr.top) / cr.height) * CANVAS_SIZE;
    const picked = pickVehicleAtCanvasPoint(px, py, vehiclesRef.current);
    const mr = mainEl.getBoundingClientRect();
    const panelW = 268;
    const panelPad = 8;
    if (picked) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      const snap: Vehicle = { ...picked };
      inspectPaintRef.current = snap;
      const left = Math.max(panelPad, Math.min(e.clientX - mr.left + 12, mr.width - panelW - panelPad));
      const top = Math.max(panelPad, Math.min(e.clientY - mr.top + 12, mr.height - panelPad));
      setInspectPanel({ vehicle: snap, left, top });
      return;
    }
    inspectPaintRef.current = null;
    setInspectPanel(null);
  }, []);

  const startSidebarResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    setIsResizingSidebar(true);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartXRef.current;
      const nextWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, resizeStartWidthRef.current + delta));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  const phaseRowCount = compiledPhases.length > 0 ? compiledPhases.length : 4;
  const cycleLength = Array.from({ length: phaseRowCount }, (_, i) => phaseTimings[i] ?? DEFAULT_PHASE_GREEN_SECONDS).reduce((a, b) => a + b, 0);
  const sidebarColumnWidth = sidebarCollapsed ? 0 : sidebarWidth;

  const engineeringTemplateBlurb = useMemo(() => {
    const preset = PHASE_TEMPLATES.find(t => t.code === programCode);
    if (preset) {
      return { title: `${preset.shortLabel} — ${preset.name.toUpperCase()}`, body: preset.detail };
    }
    if (userTemplate && programCode === userTemplate) {
      return { title: 'CUSTOM', body: 'Phase program stored on this device. Save from the editor to refresh the stored copy.' };
    }
    return { title: 'PROGRAM', body: 'Current text does not match a preset. Select CUSTOM or a template to load a defined program.' };
  }, [programCode, userTemplate]);

  if (introPhase !== null) {
    return (
      <GameIntro
        phase={introPhase}
        onDismissSplash={dismissIntroSplash}
        onEnterGame={enterGameFromIntro}
      />
    );
  }

  if (isMobilePortrait) {
    return (
      <div className="h-[100dvh] w-full flex flex-col bg-[#0D0F12] overflow-hidden border-2 border-[#2D333B] relative crt-bezel">
        <header className="shrink-0 bg-[#1A1D23] border-b-2 border-[#2D333B] px-3 py-2 flex items-center justify-between z-10 shadow-md gap-2">
          <div className="flex items-center gap-2 font-mono font-bold tracking-wider text-[11px] min-w-0">
            <span className="text-[#3FB950] shrink-0 animate-pulse">●</span>
            <span className="text-[#C9D1D9] truncate">TRAFFIC_SEC_082</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={returnToMainMenu}
              className="rounded border border-[#2D333B] px-2 py-1 text-[9px] font-mono font-bold text-[#8B949E] hover:border-[#3FB950]/50 hover:text-[#3FB950] transition-colors"
            >
              MENU
            </button>
            <div className="font-mono text-[10px] text-[#C9D1D9] text-right">
              {isPlaying ? 'ACTIVE' : 'PAUSED'} | CYCLE: {cycleLength}s
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 relative">
          <div className={`absolute inset-0 z-20 transition-opacity duration-300 ${!executionSplitActive && mobileScreen === 'briefing' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <BriefingTab />
          </div>

          <div className={`absolute inset-0 z-20 bg-[#0D0F12] overflow-y-auto transition-opacity duration-300 ${!executionSplitActive && mobileScreen === 'engineering' ? 'opacity-100' : 'opacity-0 pointer-events-none'} p-2`}>
            <div className="flex flex-col gap-2 h-full">
              <div className="flex items-center justify-between gap-1 mb-1">
                 <button onClick={() => applyTemplate(userTemplate)} className={`flex-1 text-[10px] py-1.5 rounded-none font-mono border transition-all ${programCode === userTemplate ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}>CUSTOM</button>
                 <button onClick={saveUserTemplate} className="px-3 py-1.5 rounded-none bg-black/20 border border-[#2D333B] text-[#C9D1D9] hover:text-[#3FB950] transition-colors"><Save size={14} /></button>
                 <div className="w-[1px] h-5 bg-[#2D333B] mx-1" />
                 {PHASE_TEMPLATES.map((t) => (
                    <button key={t.name} onClick={() => applyTemplate(t.code)} className={`flex-1 text-[10px] py-1.5 rounded-none font-mono border transition-all ${programCode === t.code ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}>{t.shortLabel}</button>
                 ))}
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-[#3FB950] font-mono uppercase tracking-wide leading-tight">{engineeringTemplateBlurb.title}</div>
                <div className="text-[10px] text-[#8B949E] font-mono leading-snug">{engineeringTemplateBlurb.body}</div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <MobileOmniCorpEditor
                  programCode={programCode}
                  setProgramCode={setProgramCode}
                  appendPhase={appendPhase}
                  deleteLastLine={deleteLastLine}
                />
              </div>
              {programError && (
                <div className="text-[11px] text-[#F85149] font-mono whitespace-pre-wrap leading-tight bg-[#F85149]/10 p-2 border border-[#F85149]/30">
                  {programError}
                </div>
              )}
              <div className="mt-auto pt-2 pb-2">
                <button 
                  onClick={() => {
                      compile();
                      addLog("PROGRAM UPDATED", "var(--green)");
                      if (!programError) {
                        setExecutionSplitActive(true);
                        setSessionCarsCleared(0);
                        setSessionCrashes(0);
                        setSessionTime(0);
                        setZoom(0.8);
                      }
                  }}
                  className="w-full text-[14px] bg-[#3FB950]/20 text-[#3FB950] py-3 border-2 border-[#3FB950] rounded-none font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(63,185,80,0.15)]"
                >
                  COMPILE & RUN
                </button>
              </div>
            </div>
          </div>

          <main 
            ref={simMainRef}
            className={`absolute left-0 w-full transition-all duration-500 ease-in-out flex items-center justify-center overflow-hidden bg-[radial-gradient(#2D333B_1px,transparent_1px)] bg-[size:32px_32px]
              ${executionSplitActive ? 'top-0 h-[50%] border-b-2 border-[#2D333B] z-10' : 'top-0 h-full z-0'} 
              ${!executionSplitActive && mobileScreen !== 'execution' ? 'opacity-0 pointer-events-none' : 'opacity-100'}
            `}
          >
            <div className="absolute top-4 left-4 z-20 flex gap-2">
              <button onClick={togglePlayback} className={`p-2 rounded-none border shadow-xl ${isPlaying ? 'border-[#D29922]/60 bg-[#D29922]/15 text-[#D29922]' : 'border-[#3FB950]/60 bg-[#3FB950]/15 text-[#3FB950]'}`}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              {TIME_SCALE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTimeScale(s)}
                  className={`min-w-[2rem] py-1.5 px-2 rounded-none text-[10px] font-mono font-bold border transition-all shadow-xl ${
                    timeScale === s
                      ? 'border-[#3FB950]/60 bg-[#3FB950]/15 text-[#3FB950]'
                      : 'border-[#2D333B] bg-[#1A1D23] text-[#8B949E] hover:border-[#3FB950]/50 hover:text-[#C9D1D9]'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
            <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
              <button
                onClick={() => setZoom((z) => Math.min(3, z + ZOOM_STEP))}
                className="p-1.5 bg-[#1A1D23] border border-[#2D333B] rounded-none text-[#C9D1D9] hover:text-[#3FB950] hover:border-[#3FB950]/50 transition-all shadow-xl group"
                title="Zoom In"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - ZOOM_STEP))}
                className="p-1.5 bg-[#1A1D23] border border-[#2D333B] rounded-none text-[#C9D1D9] hover:text-[#3FB950] hover:border-[#3FB950]/50 transition-all shadow-xl group"
                title="Zoom Out"
              >
                <Minus size={16} />
              </button>
              <button
                onClick={() => {
                  setZoom(executionSplitActive ? 0.8 : defaultZoom());
                  setPan({ x: 0, y: 0 });
                }}
                className="py-1 px-1 bg-[#1A1D23] border border-[#2D333B] rounded-none text-[10px] font-mono text-[#8B949E] hover:text-white transition-all shadow-xl"
              >
                RST
              </button>
            </div>
            <canvas 
              ref={canvasRef} 
              width={CANVAS_SIZE} 
              height={CANVAS_SIZE}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onWheel={handleCanvasWheel}
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: isDraggingCanvasRef.current ? 'none' : 'transform 0.15s ease-out' }}
              className="box-border max-h-[min(90vw,100%)] max-w-[min(90vw,100%)] aspect-square w-full rounded-none border border-[#2D333B] shadow-2xl touch-none"
            />
          </main>

          <div className={`absolute left-0 bottom-0 w-full h-[50%] z-20 bg-[#0D0F12] flex flex-col transition-transform duration-500 ease-in-out ${executionSplitActive ? 'translate-y-0' : 'translate-y-[100%]'}`}>
            <div className="flex bg-[#1A1D23] border-b-2 border-[#2D333B]">
              <div className="flex-1 p-2 border-r-2 border-[#2D333B] flex flex-col items-center">
                <span className="text-[9px] text-[#8B949E] font-mono">CLEARED</span>
                <span className="text-[16px] text-[#3FB950] font-mono font-bold">{sessionCarsCleared}</span>
              </div>
              <div className="flex-1 p-2 border-r-2 border-[#2D333B] flex flex-col items-center">
                <span className="text-[9px] text-[#8B949E] font-mono">CRASHES</span>
                <span className={`text-[16px] font-mono font-bold ${sessionCrashes > 0 ? 'text-[#F85149]' : 'text-[#8B949E]'}`}>{sessionCrashes}</span>
              </div>
              <div className="flex-1 p-2 flex flex-col items-center">
                <span className="text-[9px] text-[#8B949E] font-mono">TIME</span>
                <span className="text-[16px] text-[#58A6FF] font-mono font-bold">{Math.floor(sessionTime / 60).toString().padStart(2, '0')}:{(sessionTime % 60).toString().padStart(2, '0')}</span>
              </div>
            </div>
            <div className="flex-1 min-h-0 relative bg-[#0D0F12]">
              <Editor
                height="100%"
                defaultLanguage="python"
                theme="vs-dark"
                value={programCode}
                options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: "on", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", scrollBeyondLastLine: false, wordWrap: "on", padding: { top: 8, bottom: 8 } }}
                onMount={handleEditorDidMount}
              />
            </div>
            <div className="p-2 bg-[#1A1D23] border-t-2 border-[#2D333B]">
               <button onClick={() => setExecutionSplitActive(false)} className="w-full py-2 border-2 border-[#F85149] bg-[#F85149]/10 text-[#F85149] font-mono font-bold text-[12px] uppercase">STOP / EDIT</button>
            </div>
          </div>
        </div>

        {!executionSplitActive && (
          <nav className="shrink-0 h-[60px] bg-[#1A1D23] border-t-2 border-[#2D333B] flex z-30 relative">
             <button onClick={() => setMobileScreen('briefing')} className={`flex-1 flex flex-col items-center justify-center gap-1 font-mono text-[10px] ${mobileScreen === 'briefing' ? 'text-[#3FB950] bg-white/5 border-t-2 border-[#3FB950]' : 'text-[#8B949E] border-t-2 border-transparent'}`}><Mail size={20}/>BRIEFING</button>
             <button onClick={() => setMobileScreen('engineering')} className={`flex-1 flex flex-col items-center justify-center gap-1 font-mono text-[10px] ${mobileScreen === 'engineering' ? 'text-[#3FB950] bg-white/5 border-t-2 border-[#3FB950]' : 'text-[#8B949E] border-t-2 border-transparent'}`}><Terminal size={20}/>ENGINEERING</button>
             <button onClick={() => setMobileScreen('execution')} className={`flex-1 flex flex-col items-center justify-center gap-1 font-mono text-[10px] ${mobileScreen === 'execution' ? 'text-[#3FB950] bg-white/5 border-t-2 border-[#3FB950]' : 'text-[#8B949E] border-t-2 border-transparent'}`}><MapIcon size={20}/>EXECUTION</button>
          </nav>
        )}

        <AnimatePresence>
          {crashInfo && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-none border-2 border-[#F85149] bg-[#1A1D23] p-6 shadow-[0_0_30px_rgba(248,81,73,0.3)]">
                <div className="text-center">
                  <div className="text-[11px] font-mono tracking-[0.2em] text-[#F85149]/80">INCIDENT</div>
                  <h2 className="mt-2 text-2xl font-mono font-bold text-[#F85149]">CRASH DETECTED</h2>
                  <div className="mt-4 rounded-none border border-[#2D333B] bg-black/40 px-3 py-2 text-left font-mono text-xs text-[#C9D1D9]">
                    <div className="text-[#8B949E]">CRASHED LANES</div>
                    <div className="mt-1 text-[#F85149]">{crashInfo.laneA.toUpperCase()} × {crashInfo.laneB.toUpperCase()}</div>
                  </div>
                  <div className="mt-5 flex flex-col gap-2">
                    <button onClick={() => resetSimulation('CRASH')} className="w-full border-2 border-[#F85149] bg-[#F85149]/15 py-3 text-[13px] font-mono font-bold text-[#F85149] uppercase">RESET SIMULATION</button>
                    {executionSplitActive && (
                      <button onClick={() => { resetSimulation('CRASH'); setExecutionSplitActive(false); setMobileScreen('engineering'); }} className="w-full border-2 border-[#2D333B] bg-black/20 py-2 text-[11px] font-mono text-[#C9D1D9] uppercase">RETURN TO EDITOR</button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      className={`h-screen w-full grid grid-rows-[48px_minmax(0,1fr)] overflow-hidden bg-[#0D0F12] ${isResizingSidebar ? '' : 'transition-[grid-template-columns] duration-300 ease-in-out'}`}
      style={{ gridTemplateColumns: `${sidebarColumnWidth}px minmax(0,1fr)` }}
    >
      {/* Header Area */}
      <header className="col-span-full bg-[#1A1D23] border-b border-[#2D333B] flex items-center justify-between px-4 z-10 gap-3">
        <div className="flex items-center gap-3 font-mono font-bold tracking-wider text-xs min-w-0 flex-wrap">
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 hover:bg-white/5 rounded transition-colors text-[#C9D1D9] hover:text-white flex items-center justify-center"
            title={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <span className="text-[#3FB950] shrink-0">●</span>
          <span className="truncate">TRAFFIC_SEC_082_V4.2</span>
          <span className="bg-[#3FB950]/10 text-[#3FB950] px-2 py-0.5 rounded border border-[#3FB950] text-[11px] shrink-0">OPERATIONAL</span>
          <button
            type="button"
            onClick={returnToMainMenu}
            className="shrink-0 rounded border border-[#2D333B] px-2.5 py-1 text-[10px] font-mono font-bold text-[#8B949E] hover:border-[#3FB950]/50 hover:text-[#3FB950] transition-colors"
          >
            MENU
          </button>
        </div>
        <div className="font-mono text-xs text-[#C9D1D9] flex flex-wrap items-center justify-end gap-x-4 gap-y-1 sm:gap-x-6">
          {installDeferred && !isStandaloneDisplay && (
            <button
              type="button"
              onClick={async () => {
                const ev = installDeferred;
                if (!ev) return;
                await ev.prompt();
                await ev.userChoice;
                setInstallDeferred(null);
              }}
              className="flex shrink-0 items-center gap-2 rounded border border-[#D29922]/60 bg-[#D29922]/10 px-2.5 py-1 text-[11px] font-bold tracking-wider text-[#D29922] transition-colors hover:bg-[#D29922]/20"
            >
              <Download size={14} className="shrink-0" />
              INSTALL TERMINAL
            </button>
          )}
          <div>CYCLE: {cycleLength}s / {MAX_TOTAL_LOOP_SECONDS}s</div>
          <div className="text-[#8B949E]">
            LOOP: {loopLastMs.toFixed(2)}ms · AVG10: {loopAvg10Ms.toFixed(2)}ms
          </div>
        </div>
      </header>

      {/* Left Sidebar: Controls & Monitors */}
      <aside className={`relative col-start-1 row-start-2 bg-[#1A1D23] border-r border-[#2D333B] p-4 flex flex-col gap-6 overflow-y-auto scrollbar-hide min-h-0 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'opacity-0 pointer-events-none translate-x-[-100%]' : 'opacity-100 translate-x-0'}`}>
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
                 const allMovements = [...activeMovements, ...yieldMovements];
                 const movements = allMovements.filter(m => getDirection(m) === dir);
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
                       {sortedMovements.map(m => {
                         const isYield = yieldMovements.includes(m);
                         const activeClass = isYield
                            ? 'bg-[#D29922]/10 border-[#D29922]/30 text-[#D29922]'
                            : 'bg-[#3FB950]/10 border-[#3FB950]/30 text-[#3FB950]';
                         return (
                         <span 
                           key={m} 
                           title={MovementLabels[m]}
                           className={`flex items-center justify-center w-6 h-6 rounded border ${activeClass}`}
                         >
                           {getMovementIcon(m, 12)}
                         </span>
                       )})}
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
                  CUSTOM
                </button>
                <button 
                  onClick={saveUserTemplate}
                  className="px-2 py-1 rounded bg-black/20 border border-[#2D333B] text-[#C9D1D9] hover:text-[#3FB950] hover:border-[#3FB950]/40 transition-colors"
                  title="Save current as CUSTOM"
                >
                  <Save size={12} />
                </button>
                <div className="w-[1px] h-4 bg-[#2D333B] mx-0.5" />
                {PHASE_TEMPLATES.map((t) => {
                  const isActive = programCode === t.code;
                  return (
                    <button 
                      key={t.name}
                      onClick={() => applyTemplate(t.code)}
                      className={`flex-1 text-[10px] py-1 rounded font-mono border transition-all ${isActive ? 'bg-[#3FB950]/20 border-[#3FB950] text-[#3FB950]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}
                      title={t.name}
                    >
                      {t.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-[#C9D1D9]/70 font-mono leading-tight">
                {isEditMode ? '# phase(N, min=5, max=10): then .GO/.YIELD cmds (or if/phase_insert)' : 'VIEW_MODE (READ_ONLY)'}
              </div>
              <button 
                onClick={() => setIsEditMode(!isEditMode)}
                className="text-[11px] px-2 py-0.5 rounded font-mono border border-[#2D333B] hover:bg-white/5 transition-colors text-[#C9D1D9]"
              >
                {isEditMode ? 'SWITCH_TO_VIEW' : 'SWITCH_TO_EDIT'}
              </button>
            </div>

            {isEditMode ? (
              <div className="flex flex-col gap-2">
                <div className="relative w-full h-64 bg-black/40 border border-[#2D333B] rounded focus-within:border-[#3FB950] transition-colors overflow-hidden">
                  <Editor
                    height="100%"
                    defaultLanguage="python"
                    theme="vs-dark"
                    value={programCode}
                    onChange={(val) => setProgramCode(val || '')}
                    options={{
                      minimap: { enabled: false },
                      lineNumbers: "off",
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8, bottom: 8 }
                    }}
                  />
                </div>
                <div className="bg-[#1A1D23] border border-[#2D333B] p-2 rounded flex flex-col gap-2">
                  <div className="flex gap-1 justify-between items-center">
                    <div className="text-[10px] font-bold text-[#C9D1D9]">COMMAND BUILDER</div>
                    <div className="flex gap-1">
                      <button onClick={appendPhase} className="px-2 py-1 text-[10px] font-mono rounded bg-black/20 border border-[#2D333B] text-[#C9D1D9] hover:bg-white/5 transition-colors">
                        + PHASE
                      </button>
                      <button onClick={deleteLastLine} className="p-1 text-[#F85149] hover:bg-[#F85149]/20 rounded border border-transparent hover:border-[#F85149]/30 transition-colors" title="Delete Last Command">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-1">
                    {['NORTH', 'SOUTH', 'EAST', 'WEST', 'CROSSWALK'].map(d => (
                        <button key={d} onClick={() => setCmdDir(d)} className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${cmdDir === d ? 'bg-[#58A6FF]/20 border-[#58A6FF] text-[#58A6FF]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}>{d}</button>
                    ))}
                  </div>
                  
                  {cmdDir && cmdDir !== 'CROSSWALK' && (
                      <div className="flex flex-wrap gap-1">
                        {['LEFT', 'STRAIGHT', 'RIGHT'].map(t => (
                            <button key={t} onClick={() => setCmdTurn(t)} className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${cmdTurn === t ? 'bg-[#D29922]/20 border-[#D29922] text-[#D29922]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}>{t}</button>
                        ))}
                      </div>
                  )}

                  {cmdDir === 'CROSSWALK' && (
                      <div className="flex flex-wrap gap-1">
                        {['NORTH', 'SOUTH', 'EAST', 'WEST'].map(t => (
                            <button key={t} onClick={() => setCmdTurn(t)} className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${cmdTurn === t ? 'bg-[#D29922]/20 border-[#D29922] text-[#D29922]' : 'bg-black/20 border-[#2D333B] text-[#C9D1D9] hover:bg-white/5'}`}>{t}</button>
                        ))}
                      </div>
                  )}

                  {cmdDir && cmdTurn && (
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => appendCommand('GO')} className="flex-1 py-1.5 bg-[#3FB950]/20 text-[#3FB950] border border-[#3FB950]/40 rounded text-[11px] font-bold hover:bg-[#3FB950]/30 transition-colors">ADD .GO</button>
                        <button onClick={() => appendCommand('YIELD')} className="flex-1 py-1.5 bg-[#D29922]/20 text-[#D29922] border border-[#D29922]/40 rounded text-[11px] font-bold hover:bg-[#D29922]/30 transition-colors">ADD .YIELD</button>
                      </div>
                  )}
                </div>
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
            <div className="flex items-center justify-between text-xs text-[#C9D1D9]/70 mb-1">
              <span>VISUAL_OVERLAY</span>
              <button
                onClick={() => setShowHeatmap(prev => !prev)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${showHeatmap ? 'bg-[#F85149]/10 text-[#F85149] border border-[#F85149]' : 'bg-gray-800 text-[#C9D1D9] border border-gray-700'}`}
              >
                {showHeatmap ? 'HEATMAP_ON' : 'HEATMAP_OFF'}
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
            onClick={togglePlayback}
            className={`w-full py-2 rounded text-[13px] font-bold transition-all border ${isPlaying ? 'bg-[#D29922]/10 border-[#D29922] text-[#D29922]' : 'bg-[#3FB950]/10 border-[#3FB950] text-[#3FB950]'}`}
          >
            {isPlaying ? 'PAUSE SYSTEM' : 'RESUME SYSTEM'}
          </button>
          <button 
            onClick={() => resetSimulation('MANUAL')}
            className="w-full py-2 rounded text-[13px] font-bold border border-[#2D333B] text-[#C9D1D9] hover:bg-white/5"
          >
            RESET BUFFER
          </button>
        </div>
      </aside>

      {/* Center Area: Simulator Visual */}
      <main ref={simMainRef} className="col-start-2 row-start-2 relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[radial-gradient(#2D333B_1px,transparent_1px)] bg-[size:32px_32px]">
        {!sidebarCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={startSidebarResize}
            className="absolute left-0 top-0 z-30 h-full w-3 -translate-x-1/2 cursor-col-resize group"
          >
            <div className="mx-auto h-full w-[2px] bg-[#3FB950]/35 transition-colors group-hover:bg-[#3FB950]/80 group-active:bg-[#3FB950]" />
          </div>
        )}
        <div className="absolute top-6 right-6 z-20 flex flex-row items-start gap-2">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={togglePlayback}
              className={`flex min-h-[2.5rem] min-w-[3rem] items-center justify-center rounded border p-2 shadow-xl transition-all ${
                isPlaying
                  ? 'border-[#D29922]/60 bg-[#D29922]/15 text-[#D29922] hover:border-[#D29922]'
                  : 'border-[#3FB950]/60 bg-[#3FB950]/15 text-[#3FB950] hover:border-[#3FB950]'
              }`}
              title={isPlaying ? 'Pause simulation' : 'Resume simulation'}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            {TIME_SCALE_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTimeScale(s)}
                className={`min-w-[3rem] py-1.5 px-2 rounded text-[11px] font-mono font-bold border transition-all shadow-xl ${
                  timeScale === s
                    ? 'border-[#3FB950]/60 bg-[#3FB950]/15 text-[#3FB950]'
                    : 'border-[#2D333B] bg-[#1A1D23] text-[#8B949E] hover:border-[#3FB950]/50 hover:text-[#C9D1D9]'
                }`}
                title={`Simulation ${s}x`}
              >
                {s}x
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setZoom((z) => Math.min(3, z + ZOOM_STEP))}
              className="p-2 bg-[#1A1D23] border border-[#2D333B] rounded text-[#C9D1D9] hover:text-[#3FB950] hover:border-[#3FB950]/50 transition-all shadow-xl group"
              title="Zoom In"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - ZOOM_STEP))}
              className="p-2 bg-[#1A1D23] border border-[#2D333B] rounded text-[#C9D1D9] hover:text-[#3FB950] hover:border-[#3FB950]/50 transition-all shadow-xl group"
              title="Zoom Out"
            >
              <Minus size={18} />
            </button>
            <button
              onClick={() => {
                setZoom(defaultZoom());
                setPan({ x: 0, y: 0 });
              }}
              className="py-1 px-2 bg-[#1A1D23] border border-[#2D333B] rounded text-[10px] font-mono text-[#8B949E] hover:text-white transition-all shadow-xl"
            >
              RESET
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center w-full h-full overflow-hidden">
          <canvas 
            ref={canvasRef} 
            width={CANVAS_SIZE} 
            height={CANVAS_SIZE}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            style={{ 
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isDraggingCanvasRef.current ? 'none' : 'transform 0.15s ease-out'
            }}
            className="box-border max-h-[min(70vh,100%)] max-w-[min(70vh,100%)] aspect-square w-full cursor-crosshair rounded border border-[#2D333B] shadow-2xl touch-none"
          />
        </div>
        {inspectPanel && (
          <div
            className="pointer-events-none absolute z-[25] w-[min(268px,calc(100%-16px))]"
            style={{ left: inspectPanel.left, top: inspectPanel.top }}
          >
            <VehicleInspectTooltip vehicle={inspectPanel.vehicle} />
          </div>
        )}
        <AnimatePresence>
          {crashInfo && !isCrashModalMinimized && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-center justify-center bg-black/70"
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.94, opacity: 0 }}
                className="w-[min(92vw,420px)] rounded border border-[#F85149]/60 bg-[#1A1D23] p-6 shadow-2xl"
              >
                <div className="text-center">
                  <div className="text-[11px] font-mono tracking-[0.2em] text-[#F85149]/80">INCIDENT</div>
                  <h2 className="mt-2 text-2xl font-mono font-bold text-[#F85149]">CRASH DETECTED</h2>
                  <p className="mt-3 text-sm font-mono text-[#C9D1D9]">
                    Conflicting movements entered the intersection.
                  </p>
                  <div className="mt-4 rounded border border-[#2D333B] bg-black/20 px-3 py-2 text-left font-mono text-xs text-[#C9D1D9]">
                    <div className="text-[#8B949E]">CRASHED LANES</div>
                    <div className="mt-1 text-[#F85149]">
                      {crashInfo.laneA.toUpperCase()} × {crashInfo.laneB.toUpperCase()}
                    </div>
                  </div>
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => setIsCrashModalMinimized(true)}
                      className="flex-1 rounded border border-[#2D333B] bg-black/20 py-2 text-[13px] font-mono font-bold text-[#C9D1D9] hover:bg-white/5"
                    >
                      MINIMIZE
                    </button>
                    <button
                      onClick={() => resetSimulation('CRASH')}
                      className="flex-1 rounded border border-[#F85149] bg-[#F85149]/15 py-2 text-[13px] font-mono font-bold text-[#F85149] hover:bg-[#F85149]/25"
                    >
                      RESET SIMULATION
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
          {crashInfo && isCrashModalMinimized && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-6 right-6 z-40 w-[min(92vw,360px)] rounded border border-[#F85149]/60 bg-[#1A1D23]/95 p-3 shadow-2xl backdrop-blur"
            >
              <div className="text-[11px] font-mono tracking-[0.16em] text-[#F85149]/80">CRASH DETECTED</div>
              <div className="mt-1 font-mono text-xs text-[#C9D1D9]">
                {crashInfo.laneA.toUpperCase()} × {crashInfo.laneB.toUpperCase()}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setIsCrashModalMinimized(false)}
                  className="flex-1 rounded border border-[#2D333B] bg-black/20 py-1.5 text-[11px] font-mono font-bold text-[#C9D1D9] hover:bg-white/5"
                >
                  RESTORE
                </button>
                <button
                  onClick={() => resetSimulation('CRASH')}
                  className="flex-1 rounded border border-[#F85149] bg-[#F85149]/15 py-1.5 text-[11px] font-mono font-bold text-[#F85149] hover:bg-[#F85149]/25"
                >
                  RESET
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <FirmwareUpdatePrompt />
    </div>
  );
}
