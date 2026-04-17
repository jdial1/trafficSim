
export enum Movement {
  NORTHBOUND_LEFT = 1,
  NORTHBOUND_STRAIGHT = 2,
  NORTHBOUND_RIGHT = 3,
  WESTBOUND_LEFT = 4,
  WESTBOUND_STRAIGHT = 5,
  WESTBOUND_RIGHT = 6,
  SOUTHBOUND_LEFT = 7,
  SOUTHBOUND_STRAIGHT = 8,
  SOUTHBOUND_RIGHT = 9,
  EASTBOUND_LEFT = 10,
  EASTBOUND_STRAIGHT = 11,
  EASTBOUND_RIGHT = 12,
}

export type LightState = 'GREEN' | 'YELLOW' | 'RED';

export interface MovementTiming {
  green: number;
  yellow: number;
  allRed: number;
}

export type VehicleType = 'CAR' | 'MOTORCYCLE' | 'BUS' | 'TRUCK';

export interface Vehicle {
  id: string;
  vType: VehicleType;
  rareSkin?: boolean;
  legendarySkin?: boolean;
  accel: number;
  decel: number;
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
  turnProgress?: number;
  turnAngleStart?: number;
  turnAngleEnd?: number;
  turnCenterX?: number;
  turnCenterY?: number;
  turnRadius?: number;
  cruiseSpeed: number;
  startDelay: number;
  spawnAtMs: number;
  brakeIntensity?: number;
}

export interface Lane {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction: 'N' | 'S' | 'E' | 'W';
  type: 'LEFT' | 'THRU' | 'RIGHT';
  movement: Movement;
}
