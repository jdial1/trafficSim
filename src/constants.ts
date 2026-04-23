
import { Movement, Lane } from './types';
import intersectionData from './data/intersection.json';

export const CANVAS_SIZE = intersectionData.canvasSize;
export const INTERSECTION_SIZE = intersectionData.intersectionSize;
export const LANE_WIDTH = intersectionData.laneWidth;

export const DEFAULT_TIMINGS = intersectionData.defaultTimings;

export const DEFAULT_PHASE_GREEN_SECONDS = 10;

export const PHASE_TEMPLATES: { shortLabel: string; name: string; detail: string; code: string; }[] = [];

export const MIN_PHASE_GREEN_SECONDS = intersectionData.minPhaseGreenSeconds;

export const MAX_TOTAL_LOOP_SECONDS = intersectionData.maxTotalLoopSeconds;

export const GRIDLOCK_QUEUE_HALT_THRESHOLD = 18;

export const DEFAULT_BUILTIN_PHASE_TIMINGS: number[] = [15, 15, 10, 10];

export function clampPhaseTimingsToLoopCap(values: number[], phaseCount: number): number[] {
  let sum = values.reduce((a, b) => a + b, 0);
  if (sum <= MAX_TOTAL_LOOP_SECONDS) return values;
  const factor = MAX_TOTAL_LOOP_SECONDS / sum;
  return values.map(v => Math.max(MIN_PHASE_GREEN_SECONDS, Math.floor(v * factor)));
}

export const LANES: Lane[] = (intersectionData.lanes as any[]).map(l => ({
  ...l,
  type: l.type as 'LEFT' | 'THRU' | 'RIGHT',
  direction: l.direction as 'N' | 'S' | 'E' | 'W',
  movement: l.movement as Movement
}));

export const LANE_MAP = new Map<string, Lane>(LANES.map(l => [l.id, l]));

export const LEFT_LANE_IDS = LANES.filter(l => l.type === 'LEFT').map(l => l.id);

export const ADJACENT_RIGHT_MERGE_PAIR_KEYS = new Set([
  'nb-thru|nb-right', 'sb-thru|sb-right', 'eb-thru|eb-right', 'wb-thru|wb-right'
]);

export const ADJACENT_LEFT_MERGE_PAIR_KEYS = new Set([
  'nb-thru|nb-left', 'sb-thru|sb-left', 'eb-thru|eb-left', 'wb-thru|wb-left'
]);

export const DIRECTION_TO_MOVEMENTS: Record<string, Movement[]> = intersectionData.directionToMovements as any;

export const BASE_SPAWN_RATE = intersectionData.baseSpawnRate;
export const SPAWN_DRIFT_SPEED = intersectionData.spawnDriftSpeed;

export const STOP_LINE = intersectionData.stopLine;
export const BASE_SAFE_GAP = intersectionData.baseSafeGap;
export const VEHICLE_COLORS = intersectionData.vehicleColors;

export const SIDEBAR_DEFAULT_WIDTH = intersectionData.sidebar.defaultWidth;
export const SIDEBAR_MIN_WIDTH = intersectionData.sidebar.minWidth;
export const SIDEBAR_MAX_WIDTH = intersectionData.sidebar.maxWidth;

export const HEAT_GRID_COLS = intersectionData.heatmap.cols;
export const HEAT_GRID_ROWS = intersectionData.heatmap.rows;
export const HEATMAP_DECAY = intersectionData.heatmap.decay;
export const HEATMAP_GAIN = intersectionData.heatmap.gain;
export const HEATMAP_MAX = intersectionData.heatmap.max;

export const SKID_MARK_BRAKE_THRESHOLD = intersectionData.skidMarks.brakeThreshold;
export const SKID_MARK_TTL_MS = intersectionData.skidMarks.ttlMs;
export const MAX_SKID_MARK_SEGMENTS = intersectionData.skidMarks.maxSegments;

export const LOOP_LAG_LOG_MS = intersectionData.loop.lagLogMs;
export const LOOP_HUD_MIN_INTERVAL_MS = intersectionData.loop.hudMinIntervalMs;
export const MAX_SIM_INTEGRATION_STEP = intersectionData.loop.maxSimIntegrationStep;

export const MOBILE_SPLIT_HANDLE_PX = intersectionData.mobile.splitHandlePx;
export const MOBILE_COLLAPSED_STRIP_PX = intersectionData.mobile.collapsedStripPx;
export const MOBILE_SPLIT_MAX_RATIO = intersectionData.mobile.splitMaxRatio;

export const ZOOM_STEP = intersectionData.zoomStep;
export const LEGENDARY_SPAWN_CHANCE = intersectionData.legendarySpawnChance;

