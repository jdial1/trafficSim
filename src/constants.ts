
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
    shortLabel: 'STD',
    name: 'Standard',
    detail:
      '4-phase barrier sequence. N/S protected lefts, N/S through and rights with crosswalks, E/W protected lefts, E/W through and rights with crosswalks. Symmetric four-leg timing.',
    code: `phase(1): # N/S Protected Lefts
NORTH_LEFT.GO
SOUTH_LEFT.GO
EAST_RIGHT.GO
WEST_RIGHT.GO

phase(2): # N/S Straight & Right
NORTH_STRAIGHT.GO
SOUTH_STRAIGHT.GO
NORTH_LEFT.YIELD
SOUTH_LEFT.YIELD
NORTH_RIGHT.GO
SOUTH_RIGHT.GO
CROSSWALK_EAST.GO
CROSSWALK_WEST.GO

phase(3): # E/W Protected Lefts
EAST_LEFT.GO
WEST_LEFT.GO
NORTH_RIGHT.GO
SOUTH_RIGHT.GO

phase(4): # E/W Straight & Right
EAST_STRAIGHT.GO
WEST_STRAIGHT.GO
EAST_LEFT.YIELD
WEST_LEFT.YIELD
EAST_RIGHT.GO
WEST_RIGHT.GO
CROSSWALK_NORTH.GO
CROSSWALK_SOUTH.GO`
  },
  {
    shortLabel: 'ART',
    name: 'Arterial',
    detail:
      '5-phase arterial priority. Long N/S mainline straight, protected N/S lefts, then full eastbound and westbound minor-street phases, finishing with N/S crosswalk service.',
    code: `phase(1): # Arterial Straight (Main Flow)
NORTH_STRAIGHT.GO
SOUTH_STRAIGHT.GO
NORTH_LEFT.YIELD
SOUTH_LEFT.YIELD
NORTH_RIGHT.GO
SOUTH_RIGHT.GO
CROSSWALK_EAST.GO
CROSSWALK_WEST.GO

phase(2): # Arterial Lefts (Protected)
NORTH_LEFT.GO
SOUTH_LEFT.GO
EAST_RIGHT.GO
WEST_RIGHT.GO

phase(3): # Eastbound Minor Street (All Movements)
EAST_STRAIGHT.GO
EAST_LEFT.GO
EAST_RIGHT.GO
WEST_LEFT.YIELD
NORTH_RIGHT.GO

phase(4): # Westbound Minor Street (All Movements)
WEST_STRAIGHT.GO
WEST_LEFT.GO
WEST_RIGHT.GO
EAST_LEFT.YIELD
SOUTH_RIGHT.GO

phase(5): # Minor Pedestrian Crossing
CROSSWALK_NORTH.GO
CROSSWALK_SOUTH.GO`
  },
  {
    shortLabel: 'SWP',
    name: 'Sweep',
    detail:
      '5-phase directional sweep. Full northbound and southbound stacks, overlapping straights, E/W crossing with yield lefts, exclusive pedestrian Barnes dance.',
    code: `phase(1): # Northbound gets everything
NORTH_STRAIGHT.GO
NORTH_LEFT.GO
NORTH_RIGHT.GO
EAST_RIGHT.GO

phase(2): # Both North and South get straight
NORTH_STRAIGHT.GO
SOUTH_STRAIGHT.GO
NORTH_LEFT.YIELD
SOUTH_LEFT.YIELD
NORTH_RIGHT.GO
SOUTH_RIGHT.GO
CROSSWALK_EAST.GO
CROSSWALK_WEST.GO

phase(3): # Southbound gets everything
SOUTH_STRAIGHT.GO
SOUTH_LEFT.GO
SOUTH_RIGHT.GO
WEST_RIGHT.GO

phase(4): # East/West cross traffic
EAST_STRAIGHT.GO
WEST_STRAIGHT.GO
EAST_LEFT.YIELD
WEST_LEFT.YIELD
EAST_RIGHT.GO
WEST_RIGHT.GO

phase(5): # Barnes Dance
EXCLUSIVE_PEDESTRIAN_PHASE.GO`
  },
  {
    shortLabel: 'ADV',
    name: 'Advanced',
    detail:
      'Conditional phase_insert when NORTH_LEFT queue exceeds threshold; phases use min/max green; mix of yield and protected lefts; timed exclusive pedestrian phase.',
    code: `if (QUEUE.NORTH_LEFT > 5):
    phase_insert(NORTH_LEFT.GO, SOUTH_LEFT.GO)

phase(1, min=10, max=20): # N/S Straight (Yielding Lefts)
NORTH_STRAIGHT.GO
SOUTH_STRAIGHT.GO
NORTH_LEFT.YIELD
SOUTH_LEFT.YIELD
NORTH_RIGHT.GO
SOUTH_RIGHT.GO

phase(2, min=5, max=15): # E/W Protected Lefts
EAST_LEFT.GO
WEST_LEFT.GO
EAST_RIGHT.GO
WEST_RIGHT.GO

phase(3, min=10, max=20): # E/W Straight
EAST_STRAIGHT.GO
WEST_STRAIGHT.GO
EAST_LEFT.YIELD
WEST_LEFT.YIELD

phase(4, min=5, max=10): # Barnes Dance (Pedestrians)
EXCLUSIVE_PEDESTRIAN_PHASE.GO`
  }
];

export const MIN_PHASE_GREEN_SECONDS = 5;

export const MAX_TOTAL_LOOP_SECONDS = 60;

export const DEFAULT_BUILTIN_PHASE_TIMINGS: number[] = [20, 20];

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
