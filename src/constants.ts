
import { Movement, Lane } from './types';

export const CANVAS_SIZE = 800;
export const INTERSECTION_SIZE = 240;
export const LANE_WIDTH = 40;

export const DEFAULT_TIMINGS = {
  green: 10,
  yellow: 2,
  allRed: 1,
};

export const DEFAULT_PHASE_GREEN_SECONDS = 10;

export const PHASE_TEMPLATES = [
  {
    name: 'Standard',
    code: `phase(1): # N/S Protected Lefts
NORTH_LEFT.GO
SOUTH_LEFT.GO
EAST_RIGHT.GO
WEST_RIGHT.GO

phase(2): # N/S Straight & Right
NORTH_STRAIGHT.GO
SOUTH_STRAIGHT.GO
NORTH_RIGHT.GO
SOUTH_RIGHT.GO

phase(3): # E/W Protected Lefts
EAST_LEFT.GO
WEST_LEFT.GO
NORTH_RIGHT.GO
SOUTH_RIGHT.GO

phase(4): # E/W Straight & Right
EAST_STRAIGHT.GO
WEST_STRAIGHT.GO
EAST_RIGHT.GO
WEST_RIGHT.GO`
  },
  {
    name: 'Arterial',
    code: `phase(1): # Arterial Straight (Main Flow)
NORTH_STRAIGHT.GO
SOUTH_STRAIGHT.GO
NORTH_RIGHT.GO
SOUTH_RIGHT.GO

phase(2): # Arterial Lefts (Protected)
NORTH_LEFT.GO
SOUTH_LEFT.GO
EAST_RIGHT.GO
WEST_RIGHT.GO

phase(3): # Eastbound Minor Street (All Movements)
EAST_STRAIGHT.GO
EAST_LEFT.GO
EAST_RIGHT.GO
NORTH_RIGHT.GO

phase(4): # Westbound Minor Street (All Movements)
WEST_STRAIGHT.GO
WEST_LEFT.GO
WEST_RIGHT.GO
SOUTH_RIGHT.GO`
  },
  {
    name: 'Sweep',
    code: `phase(1): # Northbound gets everything
NORTH_STRAIGHT.GO
NORTH_LEFT.GO
NORTH_RIGHT.GO
EAST_RIGHT.GO

phase(2): # Both North and South get straight
NORTH_STRAIGHT.GO
SOUTH_STRAIGHT.GO
NORTH_RIGHT.GO
SOUTH_RIGHT.GO

phase(3): # Southbound gets everything
SOUTH_STRAIGHT.GO
SOUTH_LEFT.GO
SOUTH_RIGHT.GO
WEST_RIGHT.GO

phase(4): # East/West cross traffic
EAST_STRAIGHT.GO
WEST_STRAIGHT.GO
EAST_LEFT.GO
WEST_LEFT.GO
EAST_RIGHT.GO
WEST_RIGHT.GO`
  },
  {
    name: 'Continuous',
    code: `phase(1): # N/S Straight ONLY (All rights go)
NORTH_STRAIGHT.GO
SOUTH_STRAIGHT.GO
NORTH_RIGHT.GO
EAST_RIGHT.GO
SOUTH_RIGHT.GO
WEST_RIGHT.GO

phase(2): # N/S Lefts ONLY (All rights go)
NORTH_LEFT.GO
SOUTH_LEFT.GO
NORTH_RIGHT.GO
EAST_RIGHT.GO
SOUTH_RIGHT.GO
WEST_RIGHT.GO

phase(3): # E/W Straight ONLY (All rights go)
EAST_STRAIGHT.GO
WEST_STRAIGHT.GO
NORTH_RIGHT.GO
EAST_RIGHT.GO
SOUTH_RIGHT.GO
WEST_RIGHT.GO

phase(4): # E/W Lefts ONLY (All rights go)
EAST_LEFT.GO
WEST_LEFT.GO
NORTH_RIGHT.GO
EAST_RIGHT.GO
SOUTH_RIGHT.GO
WEST_RIGHT.GO`
  }
];

export const MIN_PHASE_GREEN_SECONDS = 5;

export const MAX_TOTAL_LOOP_SECONDS = 60;

export const DEFAULT_BUILTIN_PHASE_TIMINGS: number[] = [10, 20, 10, 20];

export function clampPhaseTimingsToLoopCap(values: number[], phaseCount: number): number[] {
  let sum = values.reduce((a, b) => a + b, 0);
  if (sum <= MAX_TOTAL_LOOP_SECONDS) return values;
  const factor = MAX_TOTAL_LOOP_SECONDS / sum;
  return values.map(v => Math.max(MIN_PHASE_GREEN_SECONDS, Math.floor(v * factor)));
}

const CENTER = CANVAS_SIZE / 2;

export const LANES: Lane[] = [
  { id: 'nb-left', startX: CENTER + LANE_WIDTH / 2, startY: CANVAS_SIZE, endX: CENTER + LANE_WIDTH / 2, endY: 0, direction: 'N', type: 'LEFT', movement: Movement.NORTHBOUND_LEFT },
  { id: 'nb-thru', startX: CENTER + LANE_WIDTH * 1.5, startY: CANVAS_SIZE, endX: CENTER + LANE_WIDTH * 1.5, endY: 0, direction: 'N', type: 'THRU', movement: Movement.NORTHBOUND_STRAIGHT },
  { id: 'nb-right', startX: CENTER + LANE_WIDTH * 2.5, startY: CANVAS_SIZE, endX: CENTER + LANE_WIDTH * 2.5, endY: 0, direction: 'N', type: 'RIGHT', movement: Movement.NORTHBOUND_RIGHT },

  { id: 'sb-left', startX: CENTER - LANE_WIDTH / 2, startY: 0, endX: CENTER - LANE_WIDTH / 2, endY: CANVAS_SIZE, direction: 'S', type: 'LEFT', movement: Movement.SOUTHBOUND_LEFT },
  { id: 'sb-thru', startX: CENTER - LANE_WIDTH * 1.5, startY: 0, endX: CENTER - LANE_WIDTH * 1.5, endY: CANVAS_SIZE, direction: 'S', type: 'THRU', movement: Movement.SOUTHBOUND_STRAIGHT },
  { id: 'sb-right', startX: CENTER - LANE_WIDTH * 2.5, startY: 0, endX: CENTER - LANE_WIDTH * 2.5, endY: CANVAS_SIZE, direction: 'S', type: 'RIGHT', movement: Movement.SOUTHBOUND_RIGHT },

  { id: 'eb-left', startX: 0, startY: CENTER + LANE_WIDTH / 2, endX: CANVAS_SIZE, endY: CENTER + LANE_WIDTH / 2, direction: 'E', type: 'LEFT', movement: Movement.EASTBOUND_LEFT },
  { id: 'eb-thru', startX: 0, startY: CENTER + LANE_WIDTH * 1.5, endX: CANVAS_SIZE, endY: CENTER + LANE_WIDTH * 1.5, direction: 'E', type: 'THRU', movement: Movement.EASTBOUND_STRAIGHT },
  { id: 'eb-right', startX: 0, startY: CENTER + LANE_WIDTH * 2.5, endX: CANVAS_SIZE, endY: CENTER + LANE_WIDTH * 2.5, direction: 'E', type: 'RIGHT', movement: Movement.EASTBOUND_RIGHT },

  { id: 'wb-left', startX: CANVAS_SIZE, startY: CENTER - LANE_WIDTH / 2, endX: 0, endY: CENTER - LANE_WIDTH / 2, direction: 'W', type: 'LEFT', movement: Movement.WESTBOUND_LEFT },
  { id: 'wb-thru', startX: CANVAS_SIZE, startY: CENTER - LANE_WIDTH * 1.5, endX: 0, endY: CENTER - LANE_WIDTH * 1.5, direction: 'W', type: 'THRU', movement: Movement.WESTBOUND_STRAIGHT },
  { id: 'wb-right', startX: CANVAS_SIZE, startY: CENTER - LANE_WIDTH * 2.5, endX: 0, endY: CENTER - LANE_WIDTH * 2.5, direction: 'W', type: 'RIGHT', movement: Movement.WESTBOUND_RIGHT },
];

export const DIRECTION_TO_MOVEMENTS: Record<string, Movement[]> = {
  'N': [Movement.NORTHBOUND_LEFT, Movement.NORTHBOUND_STRAIGHT, Movement.NORTHBOUND_RIGHT],
  'S': [Movement.SOUTHBOUND_LEFT, Movement.SOUTHBOUND_STRAIGHT, Movement.SOUTHBOUND_RIGHT],
  'E': [Movement.EASTBOUND_LEFT , Movement.EASTBOUND_STRAIGHT,  Movement.EASTBOUND_RIGHT],
  'W': [Movement.WESTBOUND_LEFT , Movement.WESTBOUND_STRAIGHT,  Movement.WESTBOUND_RIGHT],
};

export const BASE_SPAWN_RATE = 0.0375;
export const SPAWN_DRIFT_SPEED = 0.005;
