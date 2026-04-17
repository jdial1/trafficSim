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
};

export interface Phase {
  movements: Movement[];
  label: string;
  lineStart: number;
  lineEnd: number;
}

export interface ParseResult {
  phases: Phase[];
  error?: string;
}

export function parseTrafficProgram(code: string): ParseResult {
  const phases: Phase[] = [];
  const lines = code.split('\n');

  let currentMovements: Set<Movement> = new Set();
  let currentLabel = '';
  let currentLineStart = 0;

  const flushBlock = (endLineIndex: number) => {
    if (currentMovements.size > 0 || currentLabel) {
      phases.push({
        movements: Array.from(currentMovements),
        label: currentLabel || `PHASE_${phases.length + 1}`,
        lineStart: currentLineStart,
        lineEnd: endLineIndex
      });
      currentMovements = new Set();
      currentLabel = '';
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].split('#')[0].trim();
    if (!line) continue;

    const phaseMatch = line.match(/^phase\s*\(\s*(\d+)\s*\)\s*:/);
    if (phaseMatch) {
      flushBlock(i - 1);
      currentLabel = `PHASE_${phaseMatch[1]}`;
      currentLineStart = i;
      continue;
    }

    if (/^duration\s*=/i.test(line)) {
      return {
        phases: [],
        error: `Line ${i + 1}: duration is set in the phase timings panel, not in the program.`,
      };
    }

    let foundKeyword = false;
    for (const [keyword, movement] of Object.entries(KEYWORD_MAP)) {
      if (line === `${keyword}.GO`) {
        currentMovements.add(movement);
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
    return { phases: [], error: 'No valid phases found.' };
  }

  return { phases };
}
