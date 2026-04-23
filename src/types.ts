
export interface BriefingContent {
  id: string;
  title: string;
  from: string;
  subject: string;
  body: string;
  bullets: string[];
  hardware: string[];
  initialCode: string;
  winCondition: {
    clearCars: number;
    minPerDirection?: number;
  };
  closedLanes?: string[];
  constraints?: {
    maxPhases?: number;
    noConditionals?: boolean;
  };
  trafficWeights?: {
    N?: number;
    S?: number;
    E?: number;
    W?: number;
  };
  failureConditions?: {
    maxQueueLength?: number;
    maxHardwareCost?: number;
  };
  instructionLimits?: {
    forbiddenKeywords?: string[];
    maxLines?: number;
  };
  randomSeed?: number;
  nextLevelId?: string;
  isSandbox?: boolean;
  bureauMemo?: string;
}

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
  CROSSWALK_NORTH = 13,
  CROSSWALK_SOUTH = 14,
  CROSSWALK_EAST = 15,
  CROSSWALK_WEST = 16,
}

export type LightState = 'GREEN' | 'YELLOW' | 'RED';

export interface MovementTiming {
  green: number;
  yellow: number;
  allRed: number;
}

export type VehicleType = 'CAR' | 'MOTORCYCLE' | 'BUS' | 'TRUCK' | 'VIP';

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
  originDir: 'N' | 'S' | 'E' | 'W';
}

export type IncidentVehicleSnap = Pick<
  Vehicle,
  | 'id'
  | 'x'
  | 'y'
  | 'angle'
  | 'vx'
  | 'vy'
  | 'laneId'
  | 'length'
  | 'width'
  | 'vType'
  | 'color'
  | 'cruiseSpeed'
  | 'originDir'
>;

export type IncidentFrame = { vehicles: IncidentVehicleSnap[] };

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

export interface LogEntry {
  id: string;
  time: string;
  event: string;
  color?: string;
}

export interface HistoryEntry {
  time: string;
  P1: number;
  P2: number;
  P3: number;
  P4: number;
}

export interface QueueHistoryEntry {
  time: string;
  [key: string]: string | number;
}

import levelData from './data/levels.json';
export const level1Briefing: BriefingContent[] = levelData as BriefingContent[];
