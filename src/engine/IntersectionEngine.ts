import { Vehicle, Lane, Movement, LightState } from '../types';
import { CANVAS_SIZE, INTERSECTION_SIZE, LANE_WIDTH, LANES } from '../constants';

interface Point2D { x: number; y: number; }
export interface RearTires { left: Point2D; right: Point2D; }

export interface SkidMarkSegment {
  from: Point2D;
  to: Point2D;
  bornAt: number;
  ttlMs: number;
  baseAlpha: number;
  width: number;
}

export interface CrashInfo {
  x: number;
  y: number;
  laneA: string;
  laneB: string;
  vehicleIds: [string, string];
  type?: 'COLLISION' | 'OVERHEAT' | 'OVERFLOW';
}

const STOP_LINE = INTERSECTION_SIZE / 2 + 10;
const SKID_MARK_BRAKE_THRESHOLD = 0.8;
const SKID_MARK_TTL_MS = 2800;
const MAX_SKID_MARK_SEGMENTS = 2400;
const HEAT_GRID_COLS = 48;
const HEAT_GRID_ROWS = 48;
const HEATMAP_DECAY = 0.985;
const HEATMAP_GAIN = 0.28;
const HEATMAP_MAX = 24;

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

const LANE_MAP = new Map<string, Lane>(LANES.map(l => [l.id, l]));
const LEFT_LANE_IDS = LANES.filter((l) => l.type === 'LEFT').map((l) => l.id);

export function getRearTirePositions(vehicle: Vehicle): RearTires {
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

export type PathGeometry = 
  | { type: 'STRAIGHT', startX: number, startY: number, endX: number, endY: number }
  | { type: 'ARC', centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number, counterClockwise: boolean };

export function getPathGeometry(lane: Lane, centerX: number, centerY: number): PathGeometry {
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

export function getPathEndPoint(geom: PathGeometry): Point2D {
  if (geom.type === 'STRAIGHT') return { x: geom.endX, y: geom.endY };
  return {
    x: geom.centerX + geom.radius * Math.cos(geom.endAngle),
    y: geom.centerY + geom.radius * Math.sin(geom.endAngle),
  };
}

export function pickVehicleAtCanvasPoint(px: number, py: number, vehicles: Vehicle[]): Vehicle | null {
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

export function detectCrash(vehicles: Vehicle[]): CrashInfo | null {
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
}

export class IntersectionEngine {
  vehicles: Vehicle[] = [];
  heatMap: Float32Array = new Float32Array(HEAT_GRID_COLS * HEAT_GRID_ROWS);
  skidMarks: SkidMarkSegment[] = [];
  previousRearTires: Record<string, RearTires> = {};
  crashDetected: boolean = false;
  crashInfo: CrashInfo | null = null;
  laneCarsCache: Record<string, Vehicle[]> = {};
  timeScale: number = 1;
  activeMovements: Movement[] = [];
  yieldMovements: Movement[] = [];
  lightState: LightState = 'RED';

  constructor() {
    LANES.forEach(l => this.laneCarsCache[l.id] = []);
  }

  reset() {
    this.vehicles = [];
    this.heatMap.fill(0);
    this.skidMarks = [];
    this.previousRearTires = {};
    this.crashDetected = false;
    this.crashInfo = null;
  }
}
