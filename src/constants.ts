
import { Phase, Lane } from './types';

export const CANVAS_SIZE = 800;
export const INTERSECTION_SIZE = 240;
export const LANE_WIDTH = 40;

export const DEFAULT_TIMINGS = {
  green: 10,
  yellow: 2,
  allRed: 1,
};

export const DEFAULT_STAGE_GREEN_SECONDS = 10;

export const MIN_STAGE_GREEN_SECONDS = 5;

export const MAX_TOTAL_LOOP_SECONDS = 90;

export const DEFAULT_BUILTIN_STAGE_TIMINGS: number[] = [10, 20, 10, 20];

export function clampStageTimingsToLoopCap(values: number[], stageCount: number): number[] {
  let sum = values.reduce((a, b) => a + b, 0);
  if (sum <= MAX_TOTAL_LOOP_SECONDS) return values;

  // Proportional reduction: Keep the ratio, but scale down to fit the cap
  const factor = MAX_TOTAL_LOOP_SECONDS / sum;
  return values.map(v => Math.max(MIN_STAGE_GREEN_SECONDS, Math.floor(v * factor)));
}

const CENTER = CANVAS_SIZE / 2;

export const LANES: Lane[] = [
  { id: 'nb-left', startX: CENTER + LANE_WIDTH / 2, startY: CANVAS_SIZE, endX: CENTER + LANE_WIDTH / 2, endY: 0, direction: 'N', type: 'LEFT', phase: Phase.NORTHBOUND_LEFT },
  { id: 'nb-thru', startX: CENTER + LANE_WIDTH * 1.5, startY: CANVAS_SIZE, endX: CENTER + LANE_WIDTH * 1.5, endY: 0, direction: 'N', type: 'THRU', phase: Phase.NORTHBOUND_STRAIGHT },
  { id: 'nb-right', startX: CENTER + LANE_WIDTH * 2.5, startY: CANVAS_SIZE, endX: CENTER + LANE_WIDTH * 2.5, endY: 0, direction: 'N', type: 'RIGHT', phase: Phase.NORTHBOUND_RIGHT },

  { id: 'sb-left', startX: CENTER - LANE_WIDTH / 2, startY: 0, endX: CENTER - LANE_WIDTH / 2, endY: CANVAS_SIZE, direction: 'S', type: 'LEFT', phase: Phase.SOUTHBOUND_LEFT },
  { id: 'sb-thru', startX: CENTER - LANE_WIDTH * 1.5, startY: 0, endX: CENTER - LANE_WIDTH * 1.5, endY: CANVAS_SIZE, direction: 'S', type: 'THRU', phase: Phase.SOUTHBOUND_STRAIGHT },
  { id: 'sb-right', startX: CENTER - LANE_WIDTH * 2.5, startY: 0, endX: CENTER - LANE_WIDTH * 2.5, endY: CANVAS_SIZE, direction: 'S', type: 'RIGHT', phase: Phase.SOUTHBOUND_RIGHT },

  { id: 'eb-left', startX: 0, startY: CENTER + LANE_WIDTH / 2, endX: CANVAS_SIZE, endY: CENTER + LANE_WIDTH / 2, direction: 'E', type: 'LEFT', phase: Phase.EASTBOUND_LEFT },
  { id: 'eb-thru', startX: 0, startY: CENTER + LANE_WIDTH * 1.5, endX: CANVAS_SIZE, endY: CENTER + LANE_WIDTH * 1.5, direction: 'E', type: 'THRU', phase: Phase.EASTBOUND_STRAIGHT },
  { id: 'eb-right', startX: 0, startY: CENTER + LANE_WIDTH * 2.5, endX: CANVAS_SIZE, endY: CENTER + LANE_WIDTH * 2.5, direction: 'E', type: 'RIGHT', phase: Phase.EASTBOUND_RIGHT },

  { id: 'wb-left', startX: CANVAS_SIZE, startY: CENTER - LANE_WIDTH / 2, endX: 0, endY: CENTER - LANE_WIDTH / 2, direction: 'W', type: 'LEFT', phase: Phase.WESTBOUND_LEFT },
  { id: 'wb-thru', startX: CANVAS_SIZE, startY: CENTER - LANE_WIDTH * 1.5, endX: 0, endY: CENTER - LANE_WIDTH * 1.5, direction: 'W', type: 'THRU', phase: Phase.WESTBOUND_STRAIGHT },
  { id: 'wb-right', startX: CANVAS_SIZE, startY: CENTER - LANE_WIDTH * 2.5, endX: 0, endY: CENTER - LANE_WIDTH * 2.5, direction: 'W', type: 'RIGHT', phase: Phase.WESTBOUND_RIGHT },
];

export const DIRECTION_TO_PHASES: Record<string, Phase[]> = {
  'N': [Phase.NORTHBOUND_LEFT, Phase.NORTHBOUND_STRAIGHT, Phase.NORTHBOUND_RIGHT],
  'S': [Phase.SOUTHBOUND_LEFT, Phase.SOUTHBOUND_STRAIGHT, Phase.SOUTHBOUND_RIGHT],
  'E': [Phase.EASTBOUND_LEFT, Phase.EASTBOUND_STRAIGHT, Phase.EASTBOUND_RIGHT],
  'W': [Phase.WESTBOUND_LEFT, Phase.WESTBOUND_STRAIGHT, Phase.WESTBOUND_RIGHT],
};

export const BASE_SPAWN_RATE = 0.0375;
export const SPAWN_DRIFT_SPEED = 0.005;
