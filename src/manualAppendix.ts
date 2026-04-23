import { BRAND, METRIC } from './branding';
import { MAX_TOTAL_LOOP_SECONDS, MIN_PHASE_GREEN_SECONDS, DEFAULT_TIMINGS } from './constants';

export type AppendixBlock =
  | { t: 'h2'; text: string }
  | { t: 'p'; text: string }
  | { t: 'code'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'warn'; tone: 'amber' | 'red'; text: string }
  | { t: 'pre'; text: string }
  | { t: 'table'; headers: string[]; rows: string[][] }
  | { t: 'redact'; text: string }
  | { t: 'margin'; text: string };

export type AppendixPageSpec = {
  section: string;
  tab: string;
  title: string;
  alwaysVisible?: true;
  unlockLevelId?: string;
  unlockSandbox?: true;
  blocks: AppendixBlock[];
};

export function manualHelpTabForCompilerMessage(message: string): string | null {
  const u = message.toUpperCase();
  if (u.includes('ERR_HW') || (u.includes('MAXIMUM OF') && u.includes('PHASE')) || u.includes('DOES NOT SUPPORT CONDITIONAL')) {
    return 'HW-SPEC';
  }
  if (
    u.includes('MEM_ADDR') ||
    u.includes('UNRECOGNIZED_INST') ||
    u.includes('V-BUS_PARITY') ||
    u.includes('EEPROM_OPCODE') ||
    u.includes('PATCH_PAYLOAD') ||
    u.includes('PANEL_REGISTER') ||
    u.includes('LOGIC_IMAGE_EMPTY') ||
    u.includes('EMPTY_PHASE_BANK') ||
    u.includes('DUPLICATE_INST')
  ) {
    return 'ISA';
  }
  return null;
}

export function translateCompilerError(message: string): string {
  const u = message.toUpperCase();
  if (u.includes('LOGIC_IMAGE_EMPTY')) return 'You need at least one phase block.';
  if (u.includes('MAXIMUM OF')) return 'You used more phase blocks than this level allows.';
  if (u.includes('DOES NOT SUPPORT CONDITIONAL')) return 'Sensors (if QUEUE) are disabled on this level.';
  if (u.includes('PANEL_REGISTER_CONFLICT')) return 'Do not use "duration=" here.';
  if (u.includes('V-BUS_PARITY_ERROR')) return 'Invalid sensor direction or turn.';
  if (u.includes('PATCH_PAYLOAD_MISSING')) return 'An "if" statement must be followed by a "phase_insert".';
  if (u.includes('EEPROM_OPCODE_MISMATCH')) return 'Invalid action (must be .GO or .YIELD).';
  if (u.includes('UNRECOGNIZED_INST')) return 'Unrecognized command. Did you misspell a direction or action?';
  if (u.includes('EMPTY_PHASE_BANK')) return 'That phase block has no commands — add .GO or .YIELD lines.';
  if (u.includes('DUPLICATE_INST')) return 'The same movement command appears twice in one phase — remove the duplicate.';
  return 'Syntax error in logic image.';
}

export const MANUAL_APPENDIX: AppendixPageSpec[] = [
  {
    section: '0.0',
    tab: 'LIAB',
    title: 'Operator Liability (Form 0-A)',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: `You are operating a \\b{${BRAND.SECTOR} Traffic Control Terminal}.`,
      },
      {
        t: 'p',
        text: 'By energizing this cabinet, you assume financial responsibility for any incidents, including property loss from \\b{ERROR_0x82 (Kinetic Overlap)}.',
      },
      {
        t: 'warn',
        tone: 'red',
        text: `Alteration of factory phase-timing beyond the \\b{${MAX_TOTAL_LOOP_SECONDS}s} municipal envelope voids the warranty and will trigger an immediate THERMAL SHUNT.`,
      },
    ],
  },
  {
    section: '1.0',
    tab: 'EXEC',
    title: 'Execution & Simulation Rules',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: 'The terminal executes your logic in a strict, predictable loop.',
      },
      {
        t: 'h2',
        text: 'Phase Transitions',
      },
      {
        t: 'ul',
        items: [
          'Phases execute in \\b{numeric order} from top to bottom.',
          'When the final phase completes, the \\b{cycle repeats} from phase 1.',
        ],
      },
      {
        t: 'h2',
        text: 'Sensors (if QUEUE)',
      },
      {
        t: 'ul',
        items: [
          '\\b{SENSOR CHECK:} At the end of every RED light, the system polls your \\b{if (QUEUE)} sensors.',
          'If the queue exceeds your threshold, it triggers \\b{phase_insert} immediately. No lookahead.',
        ],
      },
    ],
  },
  {
    section: '1.05',
    tab: 'TIME',
    title: 'Phase Timing & Thermal Limits',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: 'Phases run on sequential timers. When a phase ends, clearance is mandatory and automatic.',
      },
      {
        t: 'h2',
        text: 'Standard Transition Sequence',
      },
      {
        t: 'ul',
        items: [
          `\\b{[ GREEN ]} : Variable duration (Minimum \\b{${MIN_PHASE_GREEN_SECONDS}s}).`,
          `\\b{[ YELLOW ]} : \\b{${DEFAULT_TIMINGS.yellow}s} mandatory clearance.`,
          `\\b{[ ALL RED ]} : \\b{${DEFAULT_TIMINGS.allRed}s} mandatory safety buffer.`,
          '\\b{[ NEXT PHASE ]} : Cycle continues.',
        ],
      },
      {
        t: 'h2',
        text: 'Thermal Duty Envelope',
      },
      {
        t: 'p',
        text: `\\b{THERMAL LIMIT:} Total GREEN time across all phases must not exceed \\b{${MAX_TOTAL_LOOP_SECONDS}s} per cycle. Exceeding this triggers \\b{ERROR_0xAF} (Thermal Shunt).`,
      },
      {
        t: 'warn',
        tone: 'amber',
        text: `Every phase transition costs \\b{${DEFAULT_TIMINGS.yellow + DEFAULT_TIMINGS.allRed}s} of mandatory clearance time. Plan your phases carefully.`,
      },
    ],
  },
  {
    section: '1.06',
    tab: 'MTRX',
    title: 'Conflict Matrix & Rules of Thumb',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: 'To avoid \\b{KINETIC OVERLAP (ERROR_0x82)}, never give conflicting lanes a hard \\b{.GO} in the same phase.',
      },
      {
        t: 'h2',
        text: 'Golden Rules of Conflict',
      },
      {
        t: 'ul',
        items: [
          '\\b{Rule 1}: Opposing \\b{STRAIGHT} paths never conflict. (e.g., NORTH_STRAIGHT and SOUTH_STRAIGHT are safe).',
          '\\b{Rule 2}: \\b{LEFT} turns always conflict with opposing \\b{STRAIGHT} paths. (e.g., NORTH_LEFT will crash into SOUTH_STRAIGHT).',
          '\\b{Rule 3}: Perpendicular paths always conflict. (e.g., NORTH anything and EAST anything will crash).',
        ],
      },
    ],
  },
  {
    section: '1.08',
    tab: 'GAP',
    title: 'Traffic Physics & .YIELD Logic',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: 'Vehicle movement and collision avoidance follow strict, predictable rules.',
      },
      {
        t: 'h2',
        text: 'Following & Drafting',
      },
      {
        t: 'ul',
        items: [
          'Cars traveling in the same direction will safely follow each other without crashing.',
          'Cars will automatically brake if the vehicle ahead stops.',
        ],
      },
      {
        t: 'h2',
        text: 'Permissive Merge (.YIELD)',
      },
      {
        t: 'ul',
        items: [
          '\\b{.YIELD} allows cars to turn ONLY if there is a safe gap in oncoming traffic.',
          'If opposing traffic is too heavy, the yielding vehicles will stall.',
        ],
      },
      {
        t: 'warn',
        tone: 'amber',
        text: 'If opposing throughput never opens a safe gap, yielding cars will back up into a \\b{GRIDLOCK (ERROR_0x94)}.',
      },
    ],
  },
  {
    section: '1.1',
    tab: 'HW-SPEC',
    title: 'Hardware Specifications',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: '\\b{Assembly limits are strict.} Exceeding hardware allowances prevents compilation.',
      },
      {
        t: 'ul',
        items: [
          '\\b{Max Phases}: Cabinets are limited to a hard-capped number of phase blocks per level (usually 2 to 8).',
          '\\b{Conditional Support}: If disabled, \\b{if(QUEUE)} commands will be rejected at assembly.',
          '\\b{Wear Limit}: The total number of commands is metered. Denser images increase patch risk.',
        ],
      },
    ],
  },
  {
    section: '1.2',
    tab: 'EVAL',
    title: 'Requisition Audit Registers (Metrics)',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: 'Levels are graded on three metrics. \\b{Lower scores are always better.}',
      },
      {
        t: 'table',
        headers: ['Metric', 'Meaning'],
        rows: [
          [`\\b{${METRIC.THROUGHPUT}}`, 'Total time to clear the required number of cars.'],
          [`\\b{${METRIC.INSTRUCTION_COUNT}}`, 'Total number of active commands (lines of code).'],
          [`\\b{${METRIC.HARDWARE_COST}}`, 'Total financial cost. Phases and if(QUEUE) sensors cost extra ¥.'],
        ],
      },
      {
        t: 'margin',
        text: 'Stop gold-plating slices — CAPEX is what procurement sees. THROUGHPUT is what HQ posts on the wall. Pick one. — Central Scheduling',
      },
    ],
  },
  {
    section: '1.3',
    tab: 'ISA',
    title: 'Logic Grammar & Commands',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: 'The assembler reads top-to-bottom and executes phases sequentially.',
      },
      {
        t: 'h2',
        text: 'Core Commands',
      },
      {
        t: 'ul',
        items: [
          '\\b{phase(n)}: Starts a new relay bank. You can optionally restrict adaptive timing with \\b{min} and \\b{max} limits (e.g. phase(1, min=10)).',
          '\\b{.GO}: Hard right-of-way. Vehicles will drive without checking for collisions.',
          '\\b{.YIELD}: Permissive merge. Vehicles will only turn if there is a safe gap in opposing traffic.',
          '\\b{EXCLUSIVE_PEDESTRIAN_PHASE.GO}: Halts all vehicles so pedestrians can cross.',
        ],
      },
      {
        t: 'h2',
        text: 'Sensors (if QUEUE)',
      },
      {
        t: 'p',
        text: 'A comparator arm that checks upstream traffic. \\b{Must be immediately followed by phase_insert.}',
      },
      {
        t: 'pre',
        text: 'if (QUEUE.NORTH_LEFT > 5):\n    phase_insert(NORTH_LEFT.GO)',
      },
    ],
  },
  {
    section: '1.4',
    tab: 'FAULT',
    title: 'Fault Annunciation (Crash Codes)',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: '\\b{Any fault instantly halts the terminal and triggers an incident report.}',
      },
      {
        t: 'table',
        headers: ['Code', 'Symptom', 'Solution'],
        rows: [
          ['\\b{ERROR_0x82}', 'KINETIC OVERLAP (Crash)', 'Separate the conflicting .GO commands or use .YIELD.'],
          ['\\b{ERROR_0x94}', 'BUFFER SATURATION (Gridlock)', 'Give the backed-up lane more green time or add a sensor.'],
          [
            '\\b{ERROR_0xAF}',
            'THERMAL SHUNT (Overheat)',
            `Add \\b{phase(n):} or \\b{+ PHASE}, redistribute commands, then trim greens until the sum is below ${MAX_TOTAL_LOOP_SECONDS}s per cycle.`,
          ],
        ],
      },
    ],
  },
  {
    section: '2.0',
    tab: 'SVE',
    title: `${BRAND.SECTOR} Simulated Validation Environment (Sandbox)`,
    unlockSandbox: true,
    blocks: [
      {
        t: 'warn',
        tone: 'red',
        text: 'WARNING: The SVE bypasses live upstream telemetry and municipal audit interfaces. Do not cite SVE logs to justify budget requisitions.',
      },
      {
        t: 'p',
        text: 'The partition mounts every optional sensor head without procurement caps so engineers may stress arbitrary demand curves.',
      },
      {
        t: 'ul',
        items: ['Burn-in, regression, and certification drill runs only.', 'No mandated discharge quota. Adjust demand curves manually.'],
      },
    ],
  },
];
