import { Phase } from './types';

export const KEYWORD_MAP: Record<string, Phase> = {
  NORTHBOUND_LEFT: Phase.NORTHBOUND_LEFT,
  NORTHBOUND_STRAIGHT: Phase.NORTHBOUND_STRAIGHT,
  NORTHBOUND_RIGHT: Phase.NORTHBOUND_RIGHT,
  WESTBOUND_LEFT: Phase.WESTBOUND_LEFT,
  WESTBOUND_STRAIGHT: Phase.WESTBOUND_STRAIGHT,
  WESTBOUND_RIGHT: Phase.WESTBOUND_RIGHT,
  SOUTHBOUND_LEFT: Phase.SOUTHBOUND_LEFT,
  SOUTHBOUND_STRAIGHT: Phase.SOUTHBOUND_STRAIGHT,
  SOUTHBOUND_RIGHT: Phase.SOUTHBOUND_RIGHT,
  EASTBOUND_LEFT: Phase.EASTBOUND_LEFT,
  EASTBOUND_STRAIGHT: Phase.EASTBOUND_STRAIGHT,
  EASTBOUND_RIGHT: Phase.EASTBOUND_RIGHT,
};

export interface ProgrammedStage {
  phases: Phase[];
  label: string;
  lineStart: number;
  lineEnd: number;
}

export interface ParseResult {
  stages: ProgrammedStage[];
  error?: string;
}

export function parseTrafficProgram(code: string): ParseResult {
  const stages: ProgrammedStage[] = [];
  const lines = code.split('\n');

  let currentPhases: Set<Phase> = new Set();
  let currentLabel = '';
  let currentLineStart = 0;

  const flushBlock = (endLineIndex: number) => {
    if (currentPhases.size > 0 || currentLabel) {
      stages.push({
        phases: Array.from(currentPhases),
        label: currentLabel || `STAGE_${stages.length + 1}`,
        lineStart: currentLineStart,
        lineEnd: endLineIndex
      });
      currentPhases = new Set();
      currentLabel = '';
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].split('#')[0].trim();
    if (!line) continue;

    const phaseMatch = line.match(/^phase\s*\(\s*(\d+)\s*\)\s*:/);
    if (phaseMatch) {
      flushBlock(i - 1);
      currentLabel = `STAGE_${phaseMatch[1]}`;
      currentLineStart = i;
      continue;
    }

    if (/^duration\s*=/i.test(line)) {
      return {
        stages: [],
        error: `Line ${i + 1}: duration is set in the stage timings panel, not in the program.`,
      };
    }

    let foundKeyword = false;
    for (const [keyword, phase] of Object.entries(KEYWORD_MAP)) {
      if (line === `${keyword}.GO`) {
        currentPhases.add(phase);
        foundKeyword = true;
        break;
      }
    }

    if (!foundKeyword && !phaseMatch) {
      return { stages: [], error: `Syntax error on line ${i + 1}: ${lines[i].trim()}` };
    }
  }

  flushBlock(lines.length - 1);

  if (stages.length === 0) {
    return { stages: [], error: 'No valid phases found.' };
  }

  return { stages };
}
