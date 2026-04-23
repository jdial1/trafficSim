import { METRIC, MANUAL_HW } from './branding';
import { GRIDLOCK_QUEUE_HALT_THRESHOLD, MAX_TOTAL_LOOP_SECONDS, MIN_PHASE_GREEN_SECONDS } from './constants';

export type ManualRichSegment =
  | { kind: 'plain'; text: string }
  | { kind: 'kw'; text: string; tip: string; jumpTab?: string }
  | { kind: 'scribble'; text: string }
  | { kind: 'redact'; text: string }
  | { kind: 'strike'; text: string };

type Match = { len: number; tip: string };

const TIPS = {
  phaseInsertOpen:
    'INJECTOR (micro-slice): If the armed QUEUE comparator is TRUE at macro-tick boundary, listed MOVEMENT.MODE tuples are clocked onto the lamp bus immediately before the next phase ordinal advance.',
  exclusivePed:
    `OVERRIDE 0x1A — ${MANUAL_HW.SOR_WALK}: Asserts crosswalk vectors 0x0D–0x10; all vehicular .GO/.YIELD lines for that slice are tri-stated.`,
  ilc92: `${MANUAL_HW.ILC92}: Inductive-loop coprocessor; returns upstream depth into QUEUE.* registers. Each comparator arm bills as one Physical Sensor Head Requisition (BOM surcharge).`,
  lc800: `${MANUAL_HW.LC800}: Motherboard assembly documented by this volume; legacy mnemonics not strapped on this SKU.`,
  sorWalk: `${MANUAL_HW.SOR_WALK}: Pedestrian-only bank that tri-states all vehicular vectors for one slice (Municipal Mandate 44-B).`,
  phaseHeader:
    'PHASE HEADER: Declares relay-slice ordinal in source order. min= / max= clamp the adaptive green servo; omit both to take green interval solely from the front-panel timing register.',
  queueRef:
    `QUEUE DEPTH RETURN (${MANUAL_HW.ILC92}): Buffered upstream count for that lane bundle, mirrored from the yard ingress counter. Valid only on comparator arms after heads are provisioned.`,
  queueStar:
    'QUEUE.* FAMILY: Comparator tokens QUEUE.DIRECTION_ROLE (e.g. QUEUE.NORTH_LEFT). Appears only on conditional lines per Addendum 84-B.',
  movementMode:
    'MOVEMENT.MODE: Lamp bus word — compass_ROLE suffixed with .GO (HIGH into relay bank) or .YIELD (request held in PLGA permissive gate).',
  movement:
    'MOVEMENT TOKEN: Approach mnemonic = NORTH|SOUTH|EAST|WEST + _STRAIGHT|_LEFT|_RIGHT per corridor strap.',
  mode:
    'MODE SUFFIX: .GO asserts protected right-of-way on the relay coil driver; .YIELD arms the permissive logic gate against already-compatible green streams.',
  ifOpen:
    'COMPARATOR ARM: When inequality is TRUE at macro-tick, the paired phase_insert fires once before the macro-scheduler advances the phase index.',
  eastStar:
    'DOCUMENTATION SHORTHAND: EAST_LEFT, EAST_STRAIGHT, EAST_RIGHT where the east strap is populated.',
  westStar: 'DOCUMENTATION SHORTHAND: WEST_LEFT, WEST_STRAIGHT, WEST_RIGHT.',
  northStar: 'DOCUMENTATION SHORTHAND: NORTH_LEFT, NORTH_STRAIGHT, NORTH_RIGHT.',
  southStar: 'DOCUMENTATION SHORTHAND: SOUTH_LEFT, SOUTH_STRAIGHT, SOUTH_RIGHT.',
  movementDotMode: 'TABLE ALIAS: MOVEMENT.MODE denotes the same bus encoding as separate MOVEMENT and .MODE columns.',
  sec082: 'SKU: Desk-mounted OGAS signal-sector terminal assembly covered by this manual.',
  org: 'OGAS: Office of Grid Allocation and Signals — issues logic images, clearance criteria, and audit schemas.',
  err82:
    'ERROR_0x82 — KINETIC OVERLAP EXCEPTION: Conflict-plane annunciator tripped; lamp bus FLASH-RED until hard buffer clear. Two tracks co-registered without Longitudinal Proximity Heuristic drafting exemption or merge-mask relief.',
  err94: `ERROR_0x94 — BUFFER SATURATION: One upstream approach buffer exceeded ${GRIDLOCK_QUEUE_HALT_THRESHOLD} units beyond the radar horizon.`,
  errAf: `ERROR_0xAF — THERMAL SHUNT TRIP: Aggregate green dwell exceeded ${MAX_TOTAL_LOOP_SECONDS}s thermal duty envelope.`,
  northAll:
    'MACRO EXPANSION (NORTH_ALL): Directive preprocessor expands to NORTH_LEFT, NORTH_STRAIGHT, NORTH_RIGHT with the supplied mode before EEPROM burn.',
  southAll:
    'MACRO EXPANSION (SOUTH_ALL): Preprocessor expands to SOUTH_LEFT, SOUTH_STRAIGHT, SOUTH_RIGHT with the supplied mode.',
  eastAll:
    'MACRO EXPANSION (EAST_ALL): Preprocessor expands to EAST_LEFT, EAST_STRAIGHT, EAST_RIGHT with the supplied mode.',
  westAll:
    'MACRO EXPANSION (WEST_ALL): Preprocessor expands to WEST_LEFT, WEST_STRAIGHT, WEST_RIGHT with the supplied mode.',
  metricThroughput:
    'MUNICIPAL FLOW AUDIT: Chronograph seconds from ACTIVE until mandated discharge quota satisfied. Lower values indicate higher node efficiency.',
  metricLoc:
    'EEPROM WEAR INDEX: Non-volatile manifest rows in the saved logic image; dense images increase patch-window risk.',
  metricHw:
    'FORM 7-B CAPEX: ¥100 base allocation, ¥110 per phase(n) relay bank, ¥8 per manifest character, ¥2000 bureau ceiling.',
  minPhase: `RELAY FLOOR: Minimum GREEN dwell per bank except phase_insert micro-slices (${MIN_PHASE_GREEN_SECONDS}s). See §1.05 timing traces.`,
  maxLoop: `THERMAL DUTY ENVELOPE: Maximum aggregate GREEN per full phase-index rotation (${MAX_TOTAL_LOOP_SECONDS}s). See §1.05.`,
  sgu: 'SGU — SENSOR GRID UNIT: Linear tick on the inductive approach mat; all §1.0 tolerances are expressed in SGU.',
} as const;

export function getManualJumpTabForKeyword(label: string): string | undefined {
  const u = label.trim();
  if (/ERROR_0x[0-9A-Fa-f]{2}/.test(u)) return 'FAULT';
  if (new RegExp(`^${MIN_PHASE_GREEN_SECONDS}s$`).test(u)) return 'TIME';
  if (new RegExp(`^${MAX_TOTAL_LOOP_SECONDS}s$`).test(u)) return 'TIME';
  if (/^phase\s*\(/i.test(u)) return 'ISA';
  if (u.includes('EXCLUSIVE_PEDESTRIAN_PHASE')) return '83-C';
  if (u === 'ILC-92') return '84-B';
  if (u === 'LC-800') return 'HW-SPEC';
  if (MANUAL_HW.LC800 === u) return 'HW-SPEC';
  if (u === 'SOR-Walk' || u.includes('SOR-Walk')) return '83-C';
  if (u.includes('phase_insert')) return '84-B';
  if (/^if\s*\(/i.test(u) || u.includes('QUEUE.')) return '84-B';
  if (u.includes('ERR_HW')) return 'HW-SPEC';
  if (u === 'SGU') return 'TERMS';
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
  add(tryRegex(text, i, String.raw`\b${GRIDLOCK_QUEUE_HALT_THRESHOLD}\b`, TIPS.err94));

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
    type DecKind = 'strike' | 'scribble' | 'redact';
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
    if (pick === -1) {
      if (i < input.length) {
        result.push(...segmentPlainWithKeywords(input.slice(i)));
      }
      break;
    }
    if (pick > i) {
      result.push(...segmentPlainWithKeywords(input.slice(i, pick)));
    }
    const openLen = kind === 'scribble' ? 6 : 8;
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
    const segKind = kind === 'scribble' ? 'scribble' : kind === 'redact' ? 'redact' : 'strike';
    result.push({ kind: segKind, text: inner });
    i = j;
  }
  return mergePlain(result);
}

export function segmentManualText(input: string): ManualRichSegment[] {
  return extractDecorations(input);
}
