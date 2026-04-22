import { BRAND } from './branding';

export type AppendixBlock =
  | { t: 'h2'; text: string }
  | { t: 'p'; text: string }
  | { t: 'code'; text: string }
  | { t: 'ul'; items: string[] };

export type AppendixPageSpec = {
  tab: string;
  title: string;
  alwaysVisible?: true;
  unlockLevelId?: string;
  unlockSandbox?: true;
  blocks: AppendixBlock[];
};

export const MANUAL_APPENDIX: AppendixPageSpec[] = [
  {
    tab: 'TERMS',
    title: 'Standard Terminology',
    alwaysVisible: true,
    blocks: [
      { t: 'h2', text: 'Core Controller Vocabulary' },
      {
        t: 'ul',
        items: [
          'PHASE: A distinct time slice in the intersection cycle. Only programmed movements may enter the intersection.',
          'MOVEMENT: A lane bundle identified by approach and turn direction (e.g. NORTH_LEFT, EAST_STRAIGHT).',
          '.GO: Protected mode. The movement has absolute right-of-way.',
          '.YIELD: Permissive mode. Vehicles will wait for safe gaps in opposing traffic.',
          'CYCLE: One complete rotation through all defined phases.',
          'QUEUE: The count of vehicles currently waiting for a specific movement.',
          'TICK: The fundamental unit of simulation time.'
        ],
      },
    ],
  },
  {
    tab: 'COVER',
    title: `${BRAND.SECTOR} Operations Protocol`,
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: `This document defines how ${BRAND.SECTOR} parses logic programs.`,
      },
      { t: 'h2', text: 'Cyclic Operation' },
      {
        t: 'ul',
        items: [
          'Programs are divided into phase(n) blocks executed in sequential order.',
          'Movements authorized in the active phase receive right-of-way. All other movements face a hard stop.',
          'A movement is defined by a cardinal direction and a turn (e.g., NORTH_STRAIGHT.GO).',
          'Simultaneous conflicting .GO commands will cause an immediate fault.'
        ],
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO',
      },
    ],
  },
  {
    tab: '82-A',
    title: 'Supplement 82-A — Single Axis Alignment',
    unlockLevelId: '1A',
    blocks: [
      {
        t: 'p',
        text: 'When an axis is inactive, the program must not reference its movements. The controller focuses solely on the active corridor.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO',
      },
      {
        t: 'ul',
        items: [
          'Keep opposing non-conflicting movements paired to maximize throughput.',
          'Avoid defining unnecessary phases to maintain optimal cycle efficiency.',
        ],
      },
    ],
  },
  {
    tab: '82-B',
    title: 'Supplement 82-B — Cross-Axis Operation',
    unlockLevelId: '1B',
    blocks: [
      {
        t: 'p',
        text: 'When shifting control to a perpendicular axis, treat it as an independent corridor. Never assume cross-traffic will naturally yield.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    EAST_STRAIGHT.GO\n    WEST_STRAIGHT.GO',
      },
      {
        t: 'p',
        text: 'Conflicting movements must be explicitly isolated into separate phases to avoid gridlock.',
      },
    ],
  },
  {
    tab: '82-C',
    title: 'Supplement 82-C — Four-Way Integration',
    unlockLevelId: '1C',
    blocks: [
      {
        t: 'p',
        text: 'When all intersection approaches are live, standard patterns isolate perpendicular corridors into distinct phases to prevent side-impact collisions.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO\n\nphase(2):\n    EAST_STRAIGHT.GO\n    WEST_STRAIGHT.GO',
      },
      {
        t: 'p',
        text: 'Sequence length is bounded by the controller hardware. Operating too many phases will exceed thermal limits and cause failure.',
      },
    ],
  },
  {
    tab: '82-D',
    title: 'Supplement 82-D — Protected Turn Isolation',
    unlockLevelId: '1D',
    blocks: [
      {
        t: 'p',
        text: 'When turning traffic crosses an active opposing stream, it must be isolated into a dedicated phase. Sharing a phase with crossing traffic guarantees a collision.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO\n\nphase(2):\n    NORTH_LEFT.GO\n    SOUTH_LEFT.GO',
      },
    ],
  },
  {
    tab: '83-A',
    title: 'Supplement 83-A — Asymmetric Load Balancing',
    unlockLevelId: '2A',
    blocks: [
      {
        t: 'p',
        text: 'When traffic volume heavily favors one direction, allocate additional phases to the heavy stream to increase its total green time within the cycle.',
      },
      {
        t: 'ul',
        items: [
          'Repeating a high-volume movement across multiple phases increases its throughput.',
          'Ensure low-volume streams still receive periodic service to prevent queue timeouts.',
        ],
      },
    ],
  },
  {
    tab: '83-B',
    title: 'Supplement 83-B — Restricted Movements',
    unlockLevelId: '2B',
    blocks: [
      {
        t: 'p',
        text: 'If specific movement lanes are unavailable, the controller must route traffic entirely through the remaining valid turns.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    EAST_LEFT.GO\n    EAST_RIGHT.GO',
      },
      {
        t: 'p',
        text: 'Attempting to authorize a restricted movement will cause a hardware fault.',
      },
    ],
  },
  {
    tab: '83-C',
    title: 'Supplement 83-C — Pedestrian Isolation',
    unlockLevelId: '2C',
    blocks: [
      {
        t: 'p',
        text: 'Heavy foot traffic requires an exclusive interval. The controller provides a pseudo-movement that halts all vehicular traffic simultaneously.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    EXCLUSIVE_PEDESTRIAN_PHASE.GO',
      },
      {
        t: 'p',
        text: 'Place pedestrian intervals strategically to prevent turning queues from bleeding into the crosswalk.',
      },
    ],
  },
  {
    tab: '84-A',
    title: 'Supplement 84-A — Permissive Yielding',
    unlockLevelId: '3A',
    blocks: [
      {
        t: 'p',
        text: 'Movements can be set to permissive .YIELD mode instead of protected .GO. Vehicles will cautiously turn by seeking safe gaps in opposing traffic.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO\n    NORTH_RIGHT.YIELD',
      },
      {
        t: 'p',
        text: 'This improves overall throughput without requiring a dedicated phase.',
      },
    ],
  },
  {
    tab: '84-B',
    title: 'Supplement 84-B — Dynamic Phase Insertion',
    unlockLevelId: '3B',
    blocks: [
      {
        t: 'p',
        text: 'Queue sensors can trigger conditional logic to inject specific micro-phases ahead of the scheduled rotation only when backlog exceeds a threshold.',
      },
      {
        t: 'code',
        text: 'if (QUEUE.NORTH_LEFT > 5):\n    phase_insert(NORTH_LEFT.GO)',
      },
      {
        t: 'p',
        text: 'The if statement must immediately precede the phase_insert command.',
      },
    ],
  },
  {
    tab: '84-C',
    title: 'Supplement 84-C — Split Phase Operation',
    unlockLevelId: '3C',
    blocks: [
      {
        t: 'p',
        text: 'Certain traffic conditions require complete temporal separation of opposing directions. A Split Phase dedicates an entire phase to all movements from a single approach.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    WEST_LEFT.GO\n    WEST_STRAIGHT.GO\n    WEST_RIGHT.GO',
      },
      {
        t: 'p',
        text: 'This prevents any internal conflicts but increases overall cycle time.',
      },
    ],
  },
  {
    tab: '85-A',
    title: 'Supplement 85-A — Complex Multiplexing',
    unlockLevelId: '4A',
    blocks: [
      {
        t: 'p',
        text: 'High-density intersections may require up to eight distinct phases. The cycle must be carefully orchestrated to service all possible movements.',
      },
      {
        t: 'ul',
        items: [
          'Group compatible movements tightly to maximize throughput.',
          'Ensure maximum queue depths remain below the system overflow threshold.',
        ],
      },
    ],
  },
  {
    tab: '85-B',
    title: 'Supplement 85-B — Priority Routing',
    unlockLevelId: '4B',
    blocks: [
      {
        t: 'p',
        text: 'Critical corridors must be kept clear at all times. Combine standard cyclic service with aggressive conditional logic.',
      },
      {
        t: 'code',
        text: 'if (QUEUE.SOUTH_STRAIGHT > 2):\n    phase_insert(SOUTH_STRAIGHT.GO)',
      },
      {
        t: 'p',
        text: 'Use sensors to ensure priority queues never exceed their strict maximum limits.',
      },
    ],
  },
  {
    tab: 'SBX',
    title: 'Supplement SIM — SEC-082 Sandbox',
    unlockSandbox: true,
    blocks: [
      {
        t: 'p',
        text: 'Unrestricted engineering environment. All sensors and overrides are available without clearance thresholds.',
      },
      {
        t: 'ul',
        items: [
          'Use to validate complex logic templates against arbitrary traffic volumes.',
          'Solutions written here are not filed as official completions.',
        ],
      },
    ],
  },
];
