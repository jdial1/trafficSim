import { Movement } from './types';

export const KEYWORD_MAP: Record<string, Movement> = {
  NORTH_LEFT: Movement.NORTHBOUND_LEFT,
  NORTH_STRAIGHT: Movement.NORTHBOUND_STRAIGHT,
  NORTH_RIGHT: Movement.NORTHBOUND_RIGHT,
  WEST_LEFT: Movement.WESTBOUND_LEFT,
  WEST_STRAIGHT: Movement.WESTBOUND_STRAIGHT,
  WEST_RIGHT: Movement.WESTBOUND_RIGHT,
  SOUTH_LEFT: Movement.SOUTHBOUND_LEFT,
  SOUTH_STRAIGHT: Movement.SOUTHBOUND_STRAIGHT,
  SOUTH_RIGHT: Movement.SOUTHBOUND_RIGHT,
  EAST_LEFT: Movement.EASTBOUND_LEFT,
  EAST_STRAIGHT: Movement.EASTBOUND_STRAIGHT,
  EAST_RIGHT: Movement.EASTBOUND_RIGHT,
  CROSSWALK_NORTH: Movement.CROSSWALK_NORTH,
  CROSSWALK_SOUTH: Movement.CROSSWALK_SOUTH,
  CROSSWALK_EAST: Movement.CROSSWALK_EAST,
  CROSSWALK_WEST: Movement.CROSSWALK_WEST,
};

export interface PhaseCommand {
  target: Movement;
  action: 'GO' | 'YIELD';
}

export interface Phase {
  commands: PhaseCommand[];
  label: string;
  lineStart: number;
  lineEnd: number;
  minDuration?: number;
  maxDuration?: number;
}

export interface ConditionalRule {
  targetLaneId: string;
  threshold: number;
  insertCommands: PhaseCommand[];
}

export interface ParseResult {
  phases: Phase[];
  rules?: ConditionalRule[];
  error?: string;
}

export function parseTrafficProgram(code: string): ParseResult {
  const phases: Phase[] = [];
  const rules: ConditionalRule[] = [];
  const lines = code.split('\n');

  let currentCommands: PhaseCommand[] = [];
  let currentLabel = '';
  let currentLineStart = 0;
  let currentMin: number | undefined;
  let currentMax: number | undefined;

  let currentRuleCondition: { targetLaneId: string, threshold: number } | null = null;

  const flushBlock = (endLineIndex: number) => {
    if (currentCommands.length > 0 || currentLabel) {
      phases.push({
        commands: [...currentCommands],
        label: currentLabel || `PHASE_${phases.length + 1}`,
        lineStart: currentLineStart,
        lineEnd: endLineIndex,
        minDuration: currentMin,
        maxDuration: currentMax
      });
      currentCommands = [];
      currentLabel = '';
      currentMin = undefined;
      currentMax = undefined;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].split('#')[0].trim();
    if (!line) continue;

    const phaseMatch = line.match(/^phase\s*\(\s*(.+?)\s*\)\s*:/);
    if (phaseMatch) {
      flushBlock(i - 1);
      const args = phaseMatch[1].split(',').map(s => s.trim());
      const labelMatch = args[0].match(/^(\d+)$/);
      currentLabel = `PHASE_${labelMatch ? labelMatch[1] : args[0]}`;
      currentLineStart = i;
      
      for (let j = 1; j < args.length; j++) {
        const arg = args[j];
        if (arg.startsWith('min=')) currentMin = parseInt(arg.substring(4), 10);
        else if (arg.startsWith('max=')) currentMax = parseInt(arg.substring(4), 10);
      }
      continue;
    }

    if (/^duration\s*=/i.test(line)) {
      return {
        phases: [],
        error: `Line ${i + 1}: duration is set in the phase timings panel, not in the program.`,
      };
    }

    const ifMatch = line.match(/^if\s*\(\s*QUEUE\.([A-Z_]+)\s*>\s*(\d+)\s*\)\s*:/);
    if (ifMatch) {
      const [dir, turn] = ifMatch[1].split('_');
      const dirMap: Record<string, string> = { NORTH: 'nb', SOUTH: 'sb', EAST: 'eb', WEST: 'wb' };
      const turnMap: Record<string, string> = { LEFT: 'left', STRAIGHT: 'thru', RIGHT: 'right' };
      if (dirMap[dir] && turnMap[turn]) {
        currentRuleCondition = { targetLaneId: `${dirMap[dir]}-${turnMap[turn]}`, threshold: parseInt(ifMatch[2], 10) };
      } else {
        return { phases: [], error: `Invalid queue metric on line ${i + 1}: ${ifMatch[1]}` };
      }
      continue;
    }

    if (currentRuleCondition) {
      const insertMatch = line.match(/^phase_insert\s*\(\s*(.+?)\s*\)/);
      if (insertMatch) {
        const acts = insertMatch[1].split(',').map(s => s.trim());
        const insertCommands: PhaseCommand[] = [];
        for (const act of acts) {
          const parts = act.split('.');
          if (parts.length === 2 && KEYWORD_MAP[parts[0]] && (parts[1] === 'GO' || parts[1] === 'YIELD')) {
            insertCommands.push({ target: KEYWORD_MAP[parts[0]], action: parts[1] as 'GO' | 'YIELD' });
          } else {
            return { phases: [], error: `Invalid insert command on line ${i + 1}: ${act}` };
          }
        }
        rules.push({ ...currentRuleCondition, insertCommands });
        currentRuleCondition = null;
        continue;
      }
      // If we had a condition but the next line isn't phase_insert, it's a syntax error
      return { phases: [], error: `Expected phase_insert after if condition on line ${i + 1}` };
    }

    if (line === 'EXCLUSIVE_PEDESTRIAN_PHASE.GO') {
      const peds = [Movement.CROSSWALK_NORTH, Movement.CROSSWALK_SOUTH, Movement.CROSSWALK_EAST, Movement.CROSSWALK_WEST];
      for (const p of peds) {
        if (!currentCommands.some(c => c.target === p && c.action === 'GO')) {
          currentCommands.push({ target: p, action: 'GO' });
        }
      }
      continue;
    }

    let foundKeyword = false;
    for (const [keyword, movement] of Object.entries(KEYWORD_MAP)) {
      if (line === `${keyword}.GO` || line === `${keyword}.YIELD`) {
        const action = line.endsWith('.GO') ? 'GO' : 'YIELD';
        if (!currentCommands.some(c => c.target === movement && c.action === action)) {
          currentCommands.push({ target: movement, action });
        }
        foundKeyword = true;
        break;
      }
    }

    if (!foundKeyword && !phaseMatch) {
      return { phases: [], error: `Syntax error on line ${i + 1}: ${lines[i].trim()}` };
    }
  }

  flushBlock(lines.length - 1);

  if (phases.length === 0) {
    return { phases: [], rules, error: 'No valid phases found.' };
  }

  return { phases, rules };
}
