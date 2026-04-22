export type ManualRichSegment = { kind: 'plain'; text: string } | { kind: 'kw'; text: string; tip: string };

type Match = { len: number; tip: string };

const TIPS = {
  phaseInsertOpen:
    'Inserts a one-shot phase ahead of the next scheduled step when its paired if predicate is true. Must follow an if line.',
  exclusivePed:
    'Pseudo-movement: freezes all vehicle .GO and .YIELD for one phase so pedestrians own the box.',
  phaseHeader:
    'Opens a named slice of the cycle. Integer in parentheses is the phase index; the runner visits each phase in ascending order.',
  queueRef:
    'Reads live queue depth for that approach lane bundle. Used only inside if (...) predicates when the controller exposes sensors.',
  queueStar:
    'Family of sensor tokens QUEUE.DIRECTION_ROLE (for example QUEUE.NORTH_LEFT) used only in conditional predicates.',
  movementMode:
    'Full command: one approach movement plus .GO (protected) or .YIELD (permissive gap acceptance).',
  movement:
    'Lane bundle identifier: compass (NORTH, SOUTH, EAST, WEST) plus STRAIGHT, LEFT, or RIGHT.',
  mode:
    'Mode suffix: .GO forces movement when the phase is active; .YIELD allows movement only when the simulator finds a safe gap.',
  ifOpen:
    'Conditional rule: when the comparison is true, the following phase_insert runs before the normal phase advance.',
  eastStar:
    'Shorthand in prose for every EAST_* movement token the axis supports.',
  westStar: 'Shorthand in prose for every WEST_* movement token the axis supports.',
  northStar: 'Shorthand in prose for every NORTH_* movement token the axis supports.',
  movementDotMode: 'Same as MOVEMENT.MODE in the primer: bearing_role plus .GO or .YIELD.',
  sec082: 'Designation for this signal sector and its controller image.',
  org: 'Operating authority that issues controller images and clearance criteria.',
} as const;

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

  add(tryLiteral(text, i, 'phase_insert(', TIPS.phaseInsertOpen));
  add(tryLiteral(text, i, 'EXCLUSIVE_PEDESTRIAN_PHASE', TIPS.exclusivePed));
  add(tryLiteral(text, i, 'MOVEMENT.MODE', TIPS.movementDotMode));
  add(tryLiteral(text, i, 'phase(n)', TIPS.phaseHeader));
  add(tryLiteral(text, i, 'GOSAVTOMATIKA', TIPS.org));
  add(tryLiteral(text, i, 'SEC-082', TIPS.sec082));
  add(tryLiteral(text, i, 'EAST_*', TIPS.eastStar));
  add(tryLiteral(text, i, 'WEST_*', TIPS.westStar));
  add(tryLiteral(text, i, 'NORTH_*', TIPS.northStar));
  add(tryLiteral(text, i, 'QUEUE.*', TIPS.queueStar));

  add(tryRegex(text, i, String.raw`phase\s*\(\s*\d+\s*\)`, TIPS.phaseHeader));
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

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.len >= b.len ? a : b));
}

export function segmentManualText(input: string): ManualRichSegment[] {
  const raw: ManualRichSegment[] = [];
  let i = 0;
  while (i < input.length) {
    const m = bestMatchAt(input, i);
    if (m) {
      raw.push({ kind: 'kw', text: input.slice(i, i + m.len), tip: m.tip });
      i += m.len;
    } else {
      raw.push({ kind: 'plain', text: input[i] });
      i += 1;
    }
  }
  const merged: ManualRichSegment[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (seg.kind === 'plain' && last?.kind === 'plain') {
      last.text += seg.text;
    } else {
      merged.push(seg);
    }
  }
  return merged;
}
