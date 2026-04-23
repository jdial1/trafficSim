import { Vehicle, Lane, Movement, LightState, BriefingContent } from './types';
import { CANVAS_SIZE, INTERSECTION_SIZE, LANE_WIDTH, LANES, STOP_LINE, BASE_SAFE_GAP, SKID_MARK_BRAKE_THRESHOLD, SKID_MARK_TTL_MS, MAX_SKID_MARK_SEGMENTS, HEAT_GRID_COLS, HEAT_GRID_ROWS, HEATMAP_DECAY, HEATMAP_GAIN, HEATMAP_MAX, LANE_MAP, VEHICLE_COLORS } from './constants';

export interface Point2D { x: number; y: number; }
export interface RearTires { left: Point2D; right: Point2D; }

export interface SkidMarkSegment {
  from: Point2D; to: Point2D; bornAt: number; ttlMs: number; baseAlpha: number; width: number;
}

export interface CrashInfo {
  x: number; y: number; laneA: string; laneB: string; vehicleIds: [string, string]; type?: 'COLLISION' | 'OVERHEAT' | 'OVERFLOW';
  laneCongestion?: Record<string, number>;
  conflictRays?: { x0: number; y0: number; x1: number; y1: number }[];
}

export type PathGeometry = 
  | { type: 'STRAIGHT', startX: number, startY: number, endX: number, endY: number }
  | { type: 'ARC', centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number, counterClockwise: boolean };

export function getRearTirePositions(vehicle: Vehicle): RearTires {
  const fX = Math.cos(vehicle.angle); const fY = Math.sin(vehicle.angle);
  const lX = -fY; const lY = fX;
  const rO = vehicle.length * 0.32; const tO = vehicle.width * 0.28;
  const rCX = vehicle.x - fX * rO; const rCY = vehicle.y - fY * rO;
  return { left: { x: rCX + lX * tO, y: rCY + lY * tO }, right: { x: rCX - lX * tO, y: rCY - lY * tO } };
}

export function getPathGeometry(lane: Lane, cX: number, cY: number): PathGeometry {
  if (lane.type === 'THRU') {
    if (lane.direction === 'N') return { type: 'STRAIGHT', startX: lane.startX, startY: cY + 120, endX: lane.endX, endY: cY - 120 };
    if (lane.direction === 'S') return { type: 'STRAIGHT', startX: lane.startX, startY: cY - 120, endX: lane.endX, endY: cY + 120 };
    if (lane.direction === 'E') return { type: 'STRAIGHT', startX: cX - 120, startY: lane.startY, endX: cX + 120, endY: lane.endY };
    return { type: 'STRAIGHT', startX: cX + 120, startY: lane.startY, endX: cX - 120, endY: lane.endY };
  } else if (lane.type === 'LEFT') {
    if (lane.direction === 'N') return { type: 'ARC', centerX: cX - 120, centerY: cY + 120, radius: 140, startAngle: 0, endAngle: -Math.PI / 2, counterClockwise: true };
    if (lane.direction === 'S') return { type: 'ARC', centerX: cX + 120, centerY: cY - 120, radius: 140, startAngle: Math.PI, endAngle: Math.PI / 2, counterClockwise: true };
    if (lane.direction === 'E') return { type: 'ARC', centerX: cX - 120, centerY: cY - 120, radius: 140, startAngle: Math.PI / 2, endAngle: 0, counterClockwise: true };
    return { type: 'ARC', centerX: cX + 120, centerY: cY + 120, radius: 140, startAngle: -Math.PI / 2, endAngle: -Math.PI, counterClockwise: true };
  } else {
    if (lane.direction === 'N') return { type: 'ARC', centerX: cX + 120, centerY: cY + 120, radius: 20, startAngle: Math.PI, endAngle: Math.PI * 1.5, counterClockwise: false };
    if (lane.direction === 'S') return { type: 'ARC', centerX: cX - 120, centerY: cY - 120, radius: 20, startAngle: 0, endAngle: Math.PI / 2, counterClockwise: false };
    if (lane.direction === 'E') return { type: 'ARC', centerX: cX - 120, centerY: cY + 120, radius: 20, startAngle: -Math.PI / 2, endAngle: 0, counterClockwise: false };
    return { type: 'ARC', centerX: cX + 120, centerY: cY - 120, radius: 20, startAngle: Math.PI / 2, endAngle: Math.PI, counterClockwise: false };
  }
}

export function getPathEndPoint(geom: PathGeometry): Point2D {
  if (geom.type === 'STRAIGHT') return { x: geom.endX, y: geom.endY };
  return {
    x: geom.centerX + geom.radius * Math.cos(geom.endAngle),
    y: geom.centerY + geom.radius * Math.sin(geom.endAngle)
  };
}

export function pickVehicleAtCanvasPoint(px: number, py: number, vehicles: Vehicle[]): Vehicle | null {
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const v = vehicles[i]; const hL = v.length / 2; const hW = v.width / 2;
    const dx = px - v.x; const dy = py - v.y;
    const c = Math.cos(-v.angle); const s = Math.sin(-v.angle);
    const lx = dx * c - dy * s; const ly = dx * s + dy * c;
    if (Math.abs(lx) <= hL + 6 && Math.abs(ly) <= hW + 6) return v;
  }
  return null;
}

export function detectCrash(vehicles: Vehicle[]): CrashInfo | null {
  const center = CANVAS_SIZE / 2;
  const inI = (v: Vehicle) => Math.abs(v.x - center) <= INTERSECTION_SIZE / 2 + 32 && Math.abs(v.y - center) <= INTERSECTION_SIZE / 2 + 32;
  for (let i = 0; i < vehicles.length; i++) {
    const a = vehicles[i]; if (!inI(a)) continue;
    for (let j = i + 1; j < vehicles.length; j++) {
      const b = vehicles[j]; if (!inI(b)) continue;
      const dx = a.x - b.x; const dy = a.y - b.y;
      const cD = (Math.max(a.width, a.length) + Math.max(b.width, b.length)) * 0.3;
      if ((dx * dx + dy * dy) <= cD * cD) {
        const magA = Math.hypot(a.vx, a.vy);
        const magB = Math.hypot(b.vx, b.vy);
        const len = 200;
        const uax = magA > 1e-4 ? a.vx / magA : Math.cos(a.angle);
        const uay = magA > 1e-4 ? a.vy / magA : Math.sin(a.angle);
        const ubx = magB > 1e-4 ? b.vx / magB : Math.cos(b.angle);
        const uby = magB > 1e-4 ? b.vy / magB : Math.sin(b.angle);
        const cx = (a.x + b.x) * 0.5;
        const cy = (a.y + b.y) * 0.5;
        return {
          x: cx,
          y: cy,
          laneA: a.laneId,
          laneB: b.laneId,
          vehicleIds: [a.id, b.id],
          conflictRays: [
            { x0: a.x, y0: a.y, x1: a.x + uax * len, y1: a.y + uay * len },
            { x0: b.x, y0: b.y, x1: b.x + ubx * len, y1: b.y + uby * len },
            { x0: cx - uax * 40, y0: cy - uay * 40, x1: cx + uax * 120, y1: cy + uay * 120 },
            { x0: cx - ubx * 40, y0: cy - uby * 40, x1: cx + ubx * 120, y1: cy + uby * 120 },
          ],
        };
      }
    }
  }
  return null;
}

export const renderVehicleSprite = (args: { ctx: CanvasRenderingContext2D, v: Vehicle, lane?: Lane, time: number, isStopped: boolean, isBraking: boolean, brakeIntensity: number }) => {
  const { ctx, v, isBraking } = args;
  let col = '#58A6FF'; if (v.vType === 'MOTORCYCLE') col = '#D29922'; else if (v.vType === 'TRUCK') col = '#3FB950'; else if (v.vType === 'BUS') col = '#F85149'; else if (v.vType === 'VIP') col = '#C9D1D9';
  const speed = Math.hypot(v.vx, v.vy);
  if (speed > 0.1) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-speed * 15, 0); ctx.strokeStyle = col + '40'; ctx.lineWidth = v.width * 0.8; ctx.stroke();
  }
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
  if (v.vType === 'MOTORCYCLE') { ctx.moveTo(v.length / 2, 0); ctx.lineTo(-v.length / 2, v.width / 2); ctx.lineTo(-v.length / 2, -v.width / 2); ctx.closePath(); }
  else { ctx.rect(-v.length / 2, -v.width / 2, v.length, v.width); }
  ctx.stroke();
  if (v.vType !== 'MOTORCYCLE') { ctx.beginPath(); ctx.moveTo(-v.length / 2 + 2, -v.width / 2 + 2); ctx.lineTo(-v.length / 2 + v.length * 0.3, v.width / 2 - 2); ctx.stroke(); }
  if (isBraking) { ctx.strokeStyle = '#F85149'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-v.length / 2 - 2, -v.width / 2 + 1); ctx.lineTo(-v.length / 2 - 2, v.width / 2 - 1); ctx.stroke(); }
};

export class IntersectionEngine {
  vehicles: Vehicle[] = [];
  heatMap: Float32Array = new Float32Array(HEAT_GRID_COLS * HEAT_GRID_ROWS);
  skidMarks: SkidMarkSegment[] = [];
  previousRearTires: Record<string, RearTires> = {};
  laneCarsCache: Record<string, Vehicle[]> = {};
  stats = { cleared: 0, clearedByDir: { N: 0, S: 0, E: 0, W: 0 }, crashes: 0 };

  constructor() { LANES.forEach(l => this.laneCarsCache[l.id] = []); }

  update(simStep: number, time: number, timeScale: number, activeM: Movement[], yieldM: Movement[], light: LightState) {
    for (let i = 0; i < this.heatMap.length; i++) this.heatMap[i] *= Math.pow(HEATMAP_DECAY, simStep);
    for (const k in this.laneCarsCache) this.laneCarsCache[k].length = 0;
    this.vehicles.forEach(v => this.laneCarsCache[v.laneId]?.push(v));

    this.vehicles.forEach(v => {
      const lane = LANE_MAP.get(v.laneId)!;
      const isG = (activeM.includes(lane.movement) || yieldM.includes(lane.movement)) && light === 'GREEN';
      const isY = (activeM.includes(lane.movement) || yieldM.includes(lane.movement)) && light === 'YELLOW';
      let targetS = ((time - v.spawnAtMs) * timeScale < v.startDelay * 1000) ? 0 : v.cruiseSpeed;
      let dTS = Infinity;
      if (lane.direction === 'N') dTS = v.y - (CANVAS_SIZE / 2 + STOP_LINE); else if (lane.direction === 'S') dTS = (CANVAS_SIZE / 2 - STOP_LINE) - v.y;
      else if (lane.direction === 'E') dTS = (CANVAS_SIZE / 2 - STOP_LINE) - v.x; else dTS = v.x - (CANVAS_SIZE / 2 + STOP_LINE);
      if (!isG && dTS > 0 && dTS < 100 && (!isY || dTS > 40)) targetS = 0;
      const currS = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      const acc = currS < targetS ? v.accel : -v.decel;
      const newS = Math.max(0, currS + acc * simStep);
      v.brakeIntensity = newS < currS - 0.001 ? Math.min(1, (currS - newS) / v.decel) : 0;
      if (v.brakeIntensity > 0) {
        const gx = Math.max(0, Math.min(HEAT_GRID_COLS - 1, Math.floor((v.x / CANVAS_SIZE) * HEAT_GRID_COLS)));
        const gy = Math.max(0, Math.min(HEAT_GRID_ROWS - 1, Math.floor((v.y / CANVAS_SIZE) * HEAT_GRID_ROWS)));
        this.heatMap[gy * HEAT_GRID_COLS + gx] = Math.min(HEATMAP_MAX, this.heatMap[gy * HEAT_GRID_COLS + gx] + v.brakeIntensity * HEATMAP_GAIN);
      }
      if (v.isTurning) {
        const angS = newS / v.turnRadius!; v.turnProgress = Math.min(1, v.turnProgress! + (angS / (Math.PI / 2)) * simStep);
        const currA = v.turnAngleStart! + (v.turnAngleEnd! - v.turnAngleStart!) * v.turnProgress;
        v.x = v.turnCenterX! + v.turnRadius! * Math.cos(currA); v.y = v.turnCenterY! + v.turnRadius! * Math.sin(currA);
        v.angle = currA + (v.turnAngleEnd! > v.turnAngleStart! ? Math.PI/2 : -Math.PI/2);
        v.vx = Math.cos(v.angle) * newS; v.vy = Math.sin(v.angle) * newS;
        if (v.turnProgress >= 1) {
          v.isTurning = false;
          if (lane.type === 'LEFT') { if (lane.direction === 'N') v.laneId = 'wb-left'; else if (lane.direction === 'S') v.laneId = 'eb-left'; else if (lane.direction === 'E') v.laneId = 'nb-left'; else v.laneId = 'sb-left'; }
          else { if (lane.direction === 'N') v.laneId = 'eb-right'; else if (lane.direction === 'S') v.laneId = 'wb-right'; else if (lane.direction === 'E') v.laneId = 'sb-right'; else v.laneId = 'nb-right'; }
        }
      } else {
        if (lane.direction === 'N') { v.vy = -newS; v.vx = 0; } else if (lane.direction === 'S') { v.vy = newS; v.vx = 0; } else if (lane.direction === 'E') { v.vx = newS; v.vy = 0; } else { v.vx = -newS; v.vy = 0; }
        v.x += v.vx * simStep; v.y += v.vy * simStep;
        if (Math.abs(v.x - CANVAS_SIZE / 2) < INTERSECTION_SIZE / 2 && Math.abs(v.y - CANVAS_SIZE / 2) < INTERSECTION_SIZE / 2 && lane.type !== 'THRU') {
          const g = getPathGeometry(lane, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
          if (g.type === 'ARC') { v.turnCenterX = g.centerX; v.turnCenterY = g.centerY; v.turnRadius = g.radius; v.turnAngleStart = g.startAngle; v.turnAngleEnd = g.endAngle; v.isTurning = true; v.turnProgress = 0; }
        }
      }
      const t = getRearTirePositions(v); if (this.previousRearTires[v.id] && v.brakeIntensity > SKID_MARK_BRAKE_THRESHOLD) {
        this.skidMarks.push({ from: this.previousRearTires[v.id].left, to: t.left, bornAt: time, ttlMs: SKID_MARK_TTL_MS, baseAlpha: 0.18, width: v.width * 0.12 });
        this.skidMarks.push({ from: this.previousRearTires[v.id].right, to: t.right, bornAt: time, ttlMs: SKID_MARK_TTL_MS, baseAlpha: 0.18, width: v.width * 0.12 });
      }
      this.previousRearTires[v.id] = t;
    });
    this.vehicles = this.vehicles.filter(v => v.x >= -50 && v.x <= CANVAS_SIZE + 50 && v.y >= -50 && v.y <= CANVAS_SIZE + 50);
    this.skidMarks = this.skidMarks.filter(s => (time - s.bornAt) * timeScale < s.ttlMs).slice(-MAX_SKID_MARK_SEGMENTS);
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    ctx.fillStyle = '#0D0F12'; ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.05)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= CANVAS_SIZE; i += 20) { ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_SIZE); ctx.moveTo(0, i); ctx.lineTo(CANVAS_SIZE, i); }
    ctx.stroke();
    this.skidMarks.forEach(s => { const age = (time - s.bornAt); ctx.strokeStyle = `rgba(0,0,0,${s.baseAlpha * (1 - age/s.ttlMs)})`; ctx.lineWidth = s.width; ctx.beginPath(); ctx.moveTo(s.from.x, s.from.y); ctx.lineTo(s.to.x, s.to.y); ctx.stroke(); });
    this.vehicles.forEach(v => { ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.angle); renderVehicleSprite({ ctx, v, time, isStopped: false, isBraking: (v.brakeIntensity || 0) > 0.1, brakeIntensity: v.brakeIntensity || 0 }); ctx.restore(); });
  }
}
