import { METRIC, MANUAL_HW } from './branding';
import { MAX_TOTAL_LOOP_SECONDS, MIN_PHASE_GREEN_SECONDS } from './constants';

export type ManualRichSegment =
  | { kind: 'plain'; text: string }
  | { kind: 'kw'; text: string; tip: string; jumpTab?: string }
  | { kind: 'bold'; text: string }
  | { kind: 'scribble'; text: string }
  | { kind: 'redact'; text: string }
  | { kind: 'strike'; text: string };

type Match = { len: number; tip: string };

const TIPS = {
  phaseInsertOpen: 'INJECTOR: Triggers listed commands immediately if the sensor threshold is met.',
  exclusivePed: 'OVERRIDE: Halts all vehicles to allow pedestrians to cross. High time penalty.',
  ilc92: 'SENSOR: Checks queue depths. Costs extra hardware budget.',
  lc800: 'MOTHERBOARD: The terminal assembly you are programming.',
  sorWalk: 'PEDESTRIAN OVERRIDE: Halts all vehicles.',
  phaseHeader: 'PHASE: Declares a step in the cycle. Add min/max to bound adaptive timing.',
  queueRef: 'QUEUE SENSOR: The number of waiting cars in a specific lane.',
  queueStar: 'SENSOR LABEL: QUEUE.DIRECTION_ROLE (e.g. QUEUE.NORTH_LEFT). Use on if lines only.',
  movementMode: 'COMMAND: Assigns a lane to .GO or .YIELD.',
  movement: 'LANE: The specific direction and turn (e.g. NORTH_LEFT).',
  mode: 'ACTION: .GO gives right-of-way. .YIELD waits for gaps.',
  ifOpen: 'SENSOR TRIGGER: Fires the next phase_insert if the queue is large enough.',
  eastStar: 'LANES: All Eastbound lanes.',
  westStar: 'LANES: All Westbound lanes.',
  northStar: 'LANES: All Northbound lanes.',
  southStar: 'LANES: All Southbound lanes.',
  movementDotMode: 'COMMAND: A specific lane and action.',
  sec082: 'TERMINAL: This exact traffic controller.',
  org: 'OGAS: The bureaucracy grading your work.',
  err82: 'CRASH (0x82): Vehicles collided. Separate conflicting lanes.',
  err94: 'GRIDLOCK (0x94): Traffic backed up too far. Give this lane more green time.',
  errAf: `OVERHEAT (0xAF): Total green time per cycle exceeded ${MAX_TOTAL_LOOP_SECONDS}s. Add a phase (+ PHASE / phase(n):), split .GO lines across banks, then lower phase durations.`,
  northAll: 'MACRO: Expands to all Northbound lanes.',
  southAll: 'MACRO: Expands to all Southbound lanes.',
  eastAll: 'MACRO: Expands to all Eastbound lanes.',
  westAll: 'MACRO: Expands to all Westbound lanes.',
  metricThroughput: 'SPEED: Total time to clear the required number of cars. Lower is better.',
  metricLoc: 'EFFICIENCY: Total number of lines of code. Shorter is better.',
  metricHw: 'BUDGET: Hardware cost. Phases and sensors cost extra ¥.',
  minPhase: `MINIMUM GREEN: Phases cannot be shorter than ${MIN_PHASE_GREEN_SECONDS} seconds.`,
  maxLoop: `THERMAL LIMIT: Total green time across all phases cannot exceed ${MAX_TOTAL_LOOP_SECONDS} seconds.`,
  sgu: 'DISTANCE: A unit of measurement on the road map.',
} as const;

export function getManualJumpTabForKeyword(label: string): string | undefined {
  const u = label.trim();
  if (/ERROR_0x[0-9A-Fa-f]{2}/.test(u)) return 'FAULT';
  if (new RegExp(`^${MIN_PHASE_GREEN_SECONDS}s$`).test(u)) return 'TIME';
  if (new RegExp(`^${MAX_TOTAL_LOOP_SECONDS}s$`).test(u)) return 'TIME';
  if (/^phase\s*\(/i.test(u)) return 'ISA';
  if (u.includes('EXCLUSIVE_PEDESTRIAN_PHASE')) return 'ISA';
  if (u === 'ILC-92') return 'ISA';
  if (u === 'LC-800') return 'HW-SPEC';
  if (MANUAL_HW.LC800 === u) return 'HW-SPEC';
  if (u === 'SOR-Walk' || u.includes('SOR-Walk')) return 'ISA';
  if (u.includes('phase_insert')) return 'ISA';
  if (/^if\s*\(/i.test(u) || u.includes('QUEUE.')) return 'ISA';
  if (u.includes('ERR_HW')) return 'HW-SPEC';
  if (u === 'SGU') return 'GAP';
  return undefined;
}

function tryLiteral(text: string, i: number, needle: string, tip: string): Match | null {
  if (text.startsWith(needle, i)) return { len: needle.length, tip };
  return null;
}

function tryRegex(text: string, i: number, source: string, tip: string): Match | null {
  const re = new RegExp(`^${source}`);
  const slice = text.slice(i);
  const m = slice.match(re);
  if (!m || m[0].length === 0) return null;
  return { len: m[0].length, tip };
}

function bestMatchAt(text: string, i: number): Match | null {
  const candidates: Match[] = [];
  const add = (m: Match | null) => {
    if (m) candidates.push(m);
  };

  add(tryLiteral(text, i, 'ERROR_0x82', TIPS.err82));
  add(tryLiteral(text, i, 'ERROR_0x94', TIPS.err94));
  add(tryLiteral(text, i, 'ERROR_0xAF', TIPS.errAf));
  add(tryLiteral(text, i, 'phase_insert(', TIPS.phaseInsertOpen));
  add(tryLiteral(text, i, 'EXCLUSIVE_PEDESTRIAN_PHASE', TIPS.exclusivePed));
  add(tryLiteral(text, i, 'MOVEMENT.MODE', TIPS.movementDotMode));
  add(tryLiteral(text, i, 'NORTH_ALL', TIPS.northAll));
  add(tryLiteral(text, i, 'SOUTH_ALL', TIPS.southAll));
  add(tryLiteral(text, i, 'EAST_ALL', TIPS.eastAll));
  add(tryLiteral(text, i, 'WEST_ALL', TIPS.westAll));
  add(tryLiteral(text, i, 'OGAS', TIPS.org));
  add(tryLiteral(text, i, 'SEC-082', TIPS.sec082));
  add(tryLiteral(text, i, 'SGU', TIPS.sgu));
  add(tryLiteral(text, i, 'ILC-92', TIPS.ilc92));
  add(tryLiteral(text, i, 'LC-800', TIPS.lc800));
  add(tryLiteral(text, i, MANUAL_HW.LC800, TIPS.lc800));
  add(tryLiteral(text, i, 'SOR-Walk', TIPS.sorWalk));
  add(tryLiteral(text, i, METRIC.THROUGHPUT, TIPS.metricThroughput));
  add(tryLiteral(text, i, METRIC.INSTRUCTION_COUNT, TIPS.metricLoc));
  add(tryLiteral(text, i, METRIC.HARDWARE_COST, TIPS.metricHw));
  add(tryLiteral(text, i, 'EAST_*', TIPS.eastStar));
  add(tryLiteral(text, i, 'WEST_*', TIPS.westStar));
  add(tryLiteral(text, i, 'NORTH_*', TIPS.northStar));
  add(tryLiteral(text, i, 'SOUTH_*', TIPS.southStar));
  add(tryLiteral(text, i, 'QUEUE.*', TIPS.queueStar));

  add(
    tryRegex(
      text,
      i,
      String.raw`phase\s*\(\s*\d+\s*(?:,\s*min=\s*\d+)?(?:,\s*max=\s*\d+)?\s*\)`,
      TIPS.phaseHeader,
    ),
  );
  add(tryRegex(text, i, String.raw`QUEUE\.(?:NORTH|SOUTH|EAST|WEST)_(?:STRAIGHT|LEFT|RIGHT)`, TIPS.queueRef));
  add(
    tryRegex(
      text,
      i,
      String.raw`\b(?:NORTH|SOUTH|EAST|WEST)_(?:STRAIGHT|LEFT|RIGHT)\.(?:GO|YIELD)\b`,
      TIPS.movementMode,
    ),
  );
  add(tryRegex(text, i, String.raw`\b(?:NORTH|SOUTH|EAST|WEST)_(?:STRAIGHT|LEFT|RIGHT)\b`, TIPS.movement));
  add(tryRegex(text, i, String.raw`\.(?:GO|YIELD)\b`, TIPS.mode));
  add(tryRegex(text, i, String.raw`if\s*\(`, TIPS.ifOpen));
  add(tryRegex(text, i, String.raw`\b${MIN_PHASE_GREEN_SECONDS}s\b`, TIPS.minPhase));
  add(tryRegex(text, i, String.raw`\b${MAX_TOTAL_LOOP_SECONDS}s\b`, TIPS.maxLoop));

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.len >= b.len ? a : b));
}

function mergePlain(segs: ManualRichSegment[]): ManualRichSegment[] {
  const merged: ManualRichSegment[] = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (seg.kind === 'plain' && last?.kind === 'plain') {
      last.text += seg.text;
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

function segmentPlainWithKeywords(input: string): ManualRichSegment[] {
  const raw: ManualRichSegment[] = [];
  let idx = 0;
  while (idx < input.length) {
    const m = bestMatchAt(input, idx);
    if (m) {
      const text = input.slice(idx, idx + m.len);
      raw.push({
        kind: 'kw',
        text,
        tip: m.tip,
        jumpTab: getManualJumpTabForKeyword(text),
      });
      idx += m.len;
    } else {
      raw.push({ kind: 'plain', text: input[idx] });
      idx += 1;
    }
  }
  return mergePlain(raw);
}

function extractDecorations(input: string): ManualRichSegment[] {
  const result: ManualRichSegment[] = [];
  let i = 0;
  while (i < input.length) {
    const idxStrike = input.indexOf('\\strike{', i);
    const idxNote = input.indexOf('\\note{', i);
    const idxRed = input.indexOf('\\redact{', i);
    const idxBold = input.indexOf('\\b{', i);
    type DecKind = 'strike' | 'scribble' | 'redact' | 'bold';
    let pick = -1;
    let kind: DecKind = 'scribble';
    const consider = (idx: number, k: DecKind) => {
      if (idx === -1) return;
      if (pick === -1 || idx < pick) {
        pick = idx;
        kind = k;
      }
    };
    consider(idxStrike, 'strike');
    consider(idxRed, 'redact');
    consider(idxNote, 'scribble');
    consider(idxBold, 'bold');
    if (pick === -1) {
      if (i < input.length) {
        result.push(...segmentPlainWithKeywords(input.slice(i)));
      }
      break;
    }
    if (pick > i) {
      result.push(...segmentPlainWithKeywords(input.slice(i, pick)));
    }
    const openLen = kind === 'scribble' ? 6 : kind === 'bold' ? 3 : 8;
    let j = pick + openLen;
    let depth = 1;
    const start = j;
    while (j < input.length && depth > 0) {
      const c = input[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      j++;
    }
    const inner = input.slice(start, j - 1);
    const segKind =
      kind === 'scribble' ? 'scribble' : kind === 'redact' ? 'redact' : kind === 'strike' ? 'strike' : 'bold';
    result.push({ kind: segKind, text: inner });
    i = j;
  }
  return mergePlain(result);
}

export function segmentManualText(input: string): ManualRichSegment[] {
  return extractDecorations(input);
}
