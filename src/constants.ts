
import { Phase, Lane } from './types';

export const CANVAS_SIZE = 800;
export const INTERSECTION_SIZE = 200;
export const LANE_WIDTH = 40;

export const DEFAULT_TIMINGS = {
  green: 10,
  yellow: 3,
  allRed: 2,
};

const CENTER = CANVAS_SIZE / 2;

export const LANES: Lane[] = [
  // Northbound (from South) - Right of center vertical
  { id: 'nb-left', startX: CENTER + LANE_WIDTH / 2, startY: CANVAS_SIZE, endX: CENTER + LANE_WIDTH / 2, endY: 0, direction: 'N', type: 'LEFT', phase: Phase.P1 },
  { id: 'nb-thru', startX: CENTER + LANE_WIDTH * 1.5, startY: CANVAS_SIZE, endX: CENTER + LANE_WIDTH * 1.5, endY: 0, direction: 'N', type: 'THRU', phase: Phase.P2 },
  
  // Southbound (from North) - Left of center vertical
  { id: 'sb-left', startX: CENTER - LANE_WIDTH / 2, startY: 0, endX: CENTER - LANE_WIDTH / 2, endY: CANVAS_SIZE, direction: 'S', type: 'LEFT', phase: Phase.P5 },
  { id: 'sb-thru', startX: CENTER - LANE_WIDTH * 1.5, startY: 0, endX: CENTER - LANE_WIDTH * 1.5, endY: CANVAS_SIZE, direction: 'S', type: 'THRU', phase: Phase.P6 },

  // Eastbound (from West) - Above center horizontal
  { id: 'eb-left', startX: 0, startY: CENTER - LANE_WIDTH / 2, endX: CANVAS_SIZE, endY: CENTER - LANE_WIDTH / 2, direction: 'E', type: 'LEFT', phase: Phase.P7 },
  { id: 'eb-thru', startX: 0, startY: CENTER - LANE_WIDTH * 1.5, endX: CANVAS_SIZE, endY: CENTER - LANE_WIDTH * 1.5, direction: 'E', type: 'THRU', phase: Phase.P8 },

  // Westbound (from East) - Below center horizontal
  { id: 'wb-left', startX: CANVAS_SIZE, startY: CENTER + LANE_WIDTH / 2, endX: 0, endY: CENTER + LANE_WIDTH / 2, direction: 'W', type: 'LEFT', phase: Phase.P3 },
  { id: 'wb-thru', startX: CANVAS_SIZE, startY: CENTER + LANE_WIDTH * 1.5, endX: 0, endY: CENTER + LANE_WIDTH * 1.5, direction: 'W', type: 'THRU', phase: Phase.P4 },
];

export const DIRECTION_TO_PHASES: Record<string, Phase[]> = {
  'N': [Phase.P1, Phase.P2],
  'S': [Phase.P5, Phase.P6],
  'E': [Phase.P7, Phase.P8],
  'W': [Phase.P3, Phase.P4],
};

export const BASE_SPAWN_RATE = 0.05;
export const SPAWN_DRIFT_SPEED = 0.005;

