
export enum Phase {
  P1 = 1, // Major Left
  P2 = 2, // Major Thru
  P3 = 3, // Minor Left
  P4 = 4, // Minor Thru
  P5 = 5, // Major Left (Opposite)
  P6 = 6, // Major Thru (Opposite)
  P7 = 7, // Minor Left (Opposite)
  P8 = 8, // Minor Thru (Opposite)
}

export type LightState = 'GREEN' | 'YELLOW' | 'RED';

export interface PhaseTiming {
  green: number;
  yellow: number;
  allRed: number;
}

export interface Vehicle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  laneId: string;
  targetLaneId?: string;
  color: string;
  width: number;
  length: number;
  isTurning?: boolean;
  turnProgress?: number; // 0 to 1
  turnAngleStart?: number;
  turnAngleEnd?: number;
  turnCenterX?: number;
  turnCenterY?: number;
  turnRadius?: number;
  speedType?: 'NORMAL' | 'FAST' | 'SLOW';
}

export interface Lane {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction: 'N' | 'S' | 'E' | 'W';
  type: 'LEFT' | 'THRU' | 'RIGHT';
  phase: Phase;
}
