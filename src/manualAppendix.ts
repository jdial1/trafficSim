import { BRAND, METRIC, MANUAL_HW } from './branding';
import {
  MAX_TOTAL_LOOP_SECONDS,
  MIN_PHASE_GREEN_SECONDS,
  GRIDLOCK_QUEUE_HALT_THRESHOLD,
  DEFAULT_TIMINGS,
  STOP_LINE,
  MAX_SIM_INTEGRATION_STEP,
  BASE_SAFE_GAP,
} from './constants';

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
    u.includes('LOGIC_IMAGE_EMPTY')
  ) {
    return 'ISA';
  }
  return null;
}

const MOVEMENT_ID_ROWS: string[][] = [
  ['NORTH_LEFT', '0x01'],
  ['NORTH_STRAIGHT', '0x02'],
  ['NORTH_RIGHT', '0x03'],
  ['WEST_LEFT', '0x04'],
  ['WEST_STRAIGHT', '0x05'],
  ['WEST_RIGHT', '0x06'],
  ['SOUTH_LEFT', '0x07'],
  ['SOUTH_STRAIGHT', '0x08'],
  ['SOUTH_RIGHT', '0x09'],
  ['EAST_LEFT', '0x0A'],
  ['EAST_STRAIGHT', '0x0B'],
  ['EAST_RIGHT', '0x0C'],
  ['CROSSWALK_NORTH', '0x0D'],
  ['CROSSWALK_SOUTH', '0x0E'],
  ['CROSSWALK_EAST', '0x0F'],
  ['CROSSWALK_WEST', '0x10'],
];

const MOVEMENT_CONFLICT_MATRIX_PRE = (() => {
  const labels = ['NL', 'NS', 'NR', 'WL', 'WS', 'WR', 'SL', 'SS', 'SR', 'EL', 'ES', 'ER'];
  const n = 12;
  const conflict = (a: number, b: number): boolean => {
    if (a === b) return false;
    const da = (a / 3) | 0;
    const db = (b / 3) | 0;
    const ta = a % 3;
    const tb = b % 3;
    if (da === db) return false;
    if ((da === 0 && db === 2) || (da === 2 && db === 0)) {
      if (ta === 1 && tb === 1) return false;
      if (ta === 1 && tb === 2) return false;
      if (ta === 2 && tb === 1) return false;
      if (ta === 2 && tb === 2) return false;
      return true;
    }
    if ((da === 1 && db === 3) || (da === 3 && db === 1)) {
      if (ta === 1 && tb === 1) return false;
      if (ta === 1 && tb === 2) return false;
      if (ta === 2 && tb === 1) return false;
      if (ta === 2 && tb === 2) return false;
      return true;
    }
    return true;
  };
  const pad = (s: string, w: number) => (s + ' '.repeat(w)).slice(0, w);
  const w = 3;
  const lines: string[] = [
    'Certified Electrical Compatibility Table (Form 12-C) — vehicular movements only (crosswalk vectors 0x0D–0x10 excluded). Rows/cols: compass order N,W,S,E × L,S,R.',
    '',
    pad('', w) + labels.map((l) => pad(l, w)).join(''),
  ];
  for (let i = 0; i < n; i++) {
    let row = pad(labels[i], w);
    for (let j = 0; j < n; j++) row += pad(conflict(i, j) ? 'X' : '·', w);
    lines.push(row);
  }
  lines.push(
    '',
    'X = simultaneous hard .GO on one macro-slice is electrically incompatible under generic 4-leg strap.',
    '· = permitted co-assertion on the lamp bus for that pair (still verify as-built schematic and LPH masks).',
  );
  return lines.join('\n');
})();

export const MANUAL_APPENDIX: AppendixPageSpec[] = [
  {
    section: '0.0',
    tab: 'LIAB',
    title: 'Operator Liability & Safety Acknowledgment (Form 0-A)',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: `By energizing this ${BRAND.SECTOR} cabinet built on the ${MANUAL_HW.LC800} you acknowledge that OGAS and its municipal partners disclaim consequential damages arising from corridor operation. You assume financial responsibility for incidents classified ERROR_0x82 (kinetic overlap), including property loss, third-party claims, and Bureau reassignment penalties.`,
      },
      {
        t: 'p',
        text: 'Alteration of factory phase-timing windows, jumper strapping, or front-panel green registers beyond the published municipal envelope voids the hardware warranty and may trigger immediate thermal shunt (ERROR_0xAF) under audit load.',
      },
      {
        t: 'warn',
        tone: 'red',
        text: 'This acknowledgment is binding in all OGAS jurisdictions. Retain a signed copy with your corridor docket. Failure to comply does not suspend annunciator halts.',
      },
    ],
  },
  {
    section: '1.0',
    tab: 'EXEC',
    title: 'Execution Lifecycle & Scheduler',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: `Linear dimensions in this volume are expressed in SGU (Sensor Grid Units): inductive mat ticks aligned to the approach radar lattice, not surveyor chainage. The ${MANUAL_HW.LC800} hosts two asynchronous clock domains. The macro-scheduler tick (crystal-derived 10 Hz service interrupt while the master switch reports ACTIVE) advances the lamp relay finite-state machine. The kinetic radar micro-tick (fixed raster cadence on the operator display) samples vehicle vectors and advances in-box kinematics. They are not phase-locked; never assume a lamp edge coincides with a radar sweep.`,
      },
      {
        t: 'h2',
        text: 'Macro-scheduler (lamp FSM)',
      },
      {
        t: 'ul',
        items: [
          `Chronograph register advances 0.1 s × timeScale each macro-tick (100 ms nominal) while the cabinet is ACTIVE.`,
          `GREEN → when chronograph ≥ active slice green (front-panel timing register, or ${MIN_PHASE_GREEN_SECONDS}s factory floor during phase_insert) → YELLOW.`,
          `YELLOW dwell is fixed at ${DEFAULT_TIMINGS.yellow}s of macro-scheduler time, then RED.`,
          `ALL_RED clearance is fixed at ${DEFAULT_TIMINGS.allRed}s of macro-scheduler time.`,
          `When RED chronograph ≥ ALL_RED: at the trailing edge of the macro-tick (lamp FSM service boundary, not the kinetic radar cadence), poll each assembled if (QUEUE…) comparator implemented on the ${MANUAL_HW.ILC92} against live upstream approach buffer registers (no lookahead). The ILC-92 return is latched once per rotation; the hardware does not re-sample mid-slice. First rule whose buffered depth exceeds its literal threshold asserts; phase_insert fires and the slice re-enters GREEN without advancing the phase ordinal. If none assert, clear the injection latch, advance the phase index modulo bank count, energize the next slice’s .GO/.YIELD bus map, and enter GREEN.`,
        ],
      },
      {
        t: 'h2',
        text: 'Kinetic radar micro-tick (vehicle service order)',
      },
      {
        t: 'ul',
        items: [
          `Each refresh quanta, motion budget = Δt × 60 × timeScale is split into sub-steps capped at ${MAX_SIM_INTEGRATION_STEP}; each sub-step executes the same ordered service chain.`,
          '1) Decay thermal paint on approach tiles. 2) Rebuild per-lane occupancy buckets from radar returns.',
          '3) For each unit under test: evaluate lamp hold (distance to stop bar vs 100 SGU approach funnel; permissive yellow allows roll-in only while distToStop > 40 SGU).',
          '4) Apply .YIELD comparator (§1.0) and gap-acceptance co-processor (§1.08) before car-following and longitudinal dynamics.',
          '5) Integrate acceleration, skid/heat accounting, turn progress, lane changes.',
          '6) After all units advance, conflict-plane sweep runs (kinetic overlap → ERROR_0x82), then buffer-depth and thermal guard bands.',
        ],
      },
      {
        t: 'h2',
        text: '.YIELD gap calculus (factory calibration)',
      },
      {
        t: 'p',
        text: `.YIELD is asserted only while the movement holds green-compatible lamps and the unit lies inside the approach funnel: distToStop ∈ (−20, 40) SGU measured to STOP_LINE at ${STOP_LINE} SGU from cabinet center (strap-specific mast geometry per as-built schematic).`,
      },
      {
        t: 'ul',
        items: [
          'Opposing lane mask is factory-strapped per approach class (protected left/right/through each pulls a fixed opposing-lane id set).',
          'For each conflicting unit: project distance to the same stop plane (otherDistToStop). Eligible contacts only if otherDistToStop ∈ (−80, 220) SGU.',
          'Composite closure rate |vx|+|vy| feeds the Doppler coprocessor. Targets below 0.5 SGU/s are filtered as non-moving for several deny arms; units creeping below that threshold may fail to assert a conflict the operator expects, producing false permissive merges unless the box-lodge or near-contest shunts trip.',
          'Deny yield (commanded speed 0) if any conflict has otherDistToStop ≤ 0, is lodged inside the box, is moving with otherDistToStop < 220 SGU, or satisfies the near-contest heuristic (both units within 50 SGU of the bar; tie-break by lane id collation when distances differ by ≤ 3 SGU).',
        ],
      },
      {
        t: 'h2',
        text: 'Longitudinal proximity heuristic (LPH)',
      },
      {
        t: 'p',
        text: 'Before latching ERROR_0x82, the conflict-plane annunciator applies the LPH: co-linear convoy geometry suppresses overlap when two tracks are classified as drafting pairs. Same-direction through-lane pairs with relative heading within 0.35 rad, lateral separation within lane-width tolerance, and longitudinal separation within convoy envelope are treated as a single kinetic chain. If relative heading exceeds 0.55 rad, the pair is never classified under LPH (crossing streams). Adjacent merge-lane pairs listed in the factory strap table receive additional suppression masks.',
      },
      {
        t: 'warn',
        tone: 'amber',
        text: 'ERRATA SEC-082-EXEC-7C: Rapid phase thrashing does not bypass clearance. Every GREEN→YELLOW→RED→GREEN transition still pays the full yellow plus ALL_RED dwell before the next slice may draw green. Excessive thrash heats the relay shelf; budget seconds against the thermal sum cap.',
      },
    ],
  },
  {
    section: '1.05',
    tab: 'TIME',
    title: 'Macro-Scheduler Timing & Lamp State Transitions',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: 'Each phase(n) relay bank draws green until the chronograph exhausts the active green interval, then the FSM forces the mandatory clearance ladder. Traces below mimic a bench oscilloscope view of the lamp field drivers: horizontal scale is ordinal only (not calibrated time/mm).',
      },
      {
        t: 'h2',
        text: 'Single-slice trace (one bank)',
      },
      {
        t: 'pre',
        text: `CH1 GREEN   __|${'‾'.repeat(12)}|__|${'‾'.repeat(12)}|__   (register-timed dwell)\nCH2 YELLOW  ______|${'‾'.repeat(2)}|__________________   (${DEFAULT_TIMINGS.yellow}s nominal)\nCH3 ALL_RED ________|${'‾'.repeat(6)}|______________   (${DEFAULT_TIMINGS.allRed}s nominal)\nGND ________${'‾'.repeat(20)}______________   (relay common, strap ref. J12)\n\nLegend: | = macro-tick edge (10 Hz lamp service); rising edge clocks vector latch into relay ASIC.`,
      },
      {
        t: 'h2',
        text: 'Two-bank interleave (ordering)',
      },
      {
        t: 'pre',
        text: `CH1 SLICE0  __|${'‾'.repeat(8)}|${'‾'.repeat(2)}|${'‾'.repeat(4)}|__________________________\nCH2 SLICE1  _______________________|${'‾'.repeat(8)}|${'‾'.repeat(2)}|${'‾'.repeat(4)}|__________\nCH1 SLICE0  ______________________________________|${'‾'.repeat(8)}|${'‾'.repeat(2)}|${'‾'.repeat(4)}|__  (index wrap)\n\nFull YELLOW + ALL_RED dwell is mandatory between banks; the cabinet will not stack greens without paying clearance.`,
      },
      {
        t: 'h2',
        text: 'ILC-92 return skew vs. lamp macro-edge (field note)',
      },
      {
        t: 'pre',
        text: `ILC_DEPTH  ~~~~/\\~~/\\~~/\\~~/\\~~   (comparator dither ±1 tick at RH >85%)\nMAC_EDGE    |  |  |  |  |  |  |  |   (10 Hz lamp service; latched once per rotation)\nLATCH_BUS   __|${'‾'.repeat(3)}|__|${'‾'.repeat(3)}|__|${'‾'.repeat(3)}|__   (vector bus samples only on falling macro-edge)\n\nGap between ILC crest and MACRO_EDGE is the "spec hole" operators fill with margin on QUEUE literals or redundant ALL_RED.`,
      },
      {
        t: 'h2',
        text: `Thermal duty cycle envelope (Σ GREEN ≤ ${MAX_TOTAL_LOOP_SECONDS}s per index rotation)`,
      },
      {
        t: 'p',
        text: `Relays are thermal devices. If energized green drivers remain high for too long in one full rotation without adequate ALL_RED cooling intervals, aggregate I²R exceeds the Form 7-B strip and the shelf risks a thermal shunt trip (ERROR_0xAF). Treat ${MAX_TOTAL_LOOP_SECONDS}s as a hardware synchronization envelope, not an operator convenience.`,
      },
      {
        t: 'pre',
        text: `Duty monitor (conceptual) — four nominal greens must fit under cap ${MAX_TOTAL_LOOP_SECONDS}s:\n\nTHERM ~~~~\\___/~~~~\\___/~~~~\\___/~~~~\\___/   (envelope sampler)\nG0     __|${'‾'.repeat(4)}|______________________________\nG1     ___________|${'‾'.repeat(4)}|_______________________\nG2     ____________________|${'‾'.repeat(4)}|____________\nG3     _______________________________|${'‾'.repeat(4)}|__\n\nEach Gn still pays its own YELLOW + ALL_RED tail after the trace (not part of the thermal sum). No single GREEN interval may fall below ${MIN_PHASE_GREEN_SECONDS}s except phase_insert micro-slices (see §1.0).`,
      },
      {
        t: 'warn',
        tone: 'amber',
        text: 'If programmed greens exceed the thermal duty envelope, ERROR_0xAF latches regardless of buffer health. Treat the clearance tax as non-negotiable overhead when drafting phase-sequence images on graph paper.',
      },
    ],
  },
  {
    section: '1.06',
    tab: 'MTRX',
    title: 'Certified Electrical Compatibility Table (Form 12-C)',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: 'Industrial signal shops file this compatibility table with the municipal docket. Before burning a logic image, verify that no macro-slice asserts simultaneous hard .GO on a pair marked X unless your corridor authorization carries an explicit Bureau variance (rare). This table is strap-specific to the generic 4-leg LC-800 layout; as-built schematics override.',
      },
      {
        t: 'pre',
        text: MOVEMENT_CONFLICT_MATRIX_PRE,
      },
    ],
  },
  {
    section: '1.08',
    tab: 'GAP',
    title: 'Gap Acceptance Co-processor (LC-800 Kinematic Merge)',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: `The ${MANUAL_HW.LC800} implements longitudinal gap acceptance in hardware before kinetic integration. Operators optimizing .YIELD and car-following behavior must budget against the published Safe Proximity Threshold (SPT) rather than eyeballing the front glass.`,
      },
      {
        t: 'table',
        headers: ['Symbol', 'Value', 'Meaning'],
        rows: [
          ['SPT (Safe Proximity Threshold)', `${BASE_SAFE_GAP} SGU`, 'Factory nominal clearance stamped in intersection ROM; additive with vehicle half-lengths.'],
          [
            'G_req (required follow gap)',
            'SPT + L_self/2 + L_leader/2',
            'L_* are vehicle envelope lengths on the approach mat; the merge coprocessor uses half-lengths so convoys of mixed classes remain deterministic.',
          ],
        ],
      },
      {
        t: 'p',
        text: 'During car-following service, the controller compares actual center-to-center separation against G_req. If separation falls inside the tight-coupling band (below 0.7 × G_req), commanded cruise for the trailing unit is clamped to half the leader’s closure rate until spacing recovers; this prevents rear-end annunciation while preserving dense flow.',
      },
      {
        t: 'warn',
        tone: 'amber',
        text: 'Permissive .YIELD still defers to opposing streams granted green-compatible lamps; SPT only bounds what the trailing unit considers “comfortable” once the merge arm fires. If opposing throughput never opens a gap ≥ G_req at the stop bar, the yielder stalls regardless of slice optimism.',
      },
      {
        t: 'p',
        text: `FIELD NOTICE LC-800-REV-B-WEST: The westbound ${MANUAL_HW.ILC92} sense head on revision-B daughterboards exhibits comparator chatter under sustained humidity >85% RH. Depth registers can dither ±1 tick across macro boundaries. Bureau guidance: widen QUEUE thresholds one unit or insert redundant ALL_RED dwell when coastal straps refuse to stabilize.`,
      },
    ],
  },
  {
    section: '1.1',
    tab: 'HW-SPEC',
    title: 'Hardware Specifications (Directive Manifest)',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: `Assembly-time constraints are enforced when a directive supplies a constraints object. They mirror the bill of materials for this ${MANUAL_HW.LC800} installation and any ${MANUAL_HW.ILC92} heads strapped per corridor docket.`,
      },
      {
        t: 'table',
        headers: ['Assembly', 'Catalog', 'Role'],
        rows: [
          [MANUAL_HW.LC800, 'LC-800', 'Motherboard + lamp FSM + gap co-processor documented herein.'],
          [MANUAL_HW.ILC92, 'ILC-92', 'Upstream queue depth sense; feeds QUEUE.* comparators when strap installed.'],
          [MANUAL_HW.SOR_WALK, 'SOR-Walk', 'Pedestrian override relay bank (System Override 0x1A).'],
        ],
      },
      {
        t: 'h2',
        text: 'Lamp field bus — simplified pin-out (strap J12 / rev 2)',
      },
      {
        t: 'p',
        text: `Software mnemonics in a phase-sequence image map to physical lines on the LC-800 lamp field bus. Each MOVEMENT token addresses one relay bank slice of the vector latch. Asserting MOVEMENT.GO drives the corresponding A-bus line HIGH into the mercury-wetted relay tree for that approach. Asserting MOVEMENT.YIELD routes the same movement id through the permissive logic gate ASIC (PLGA-04): the PLGA is a discrete sub-processor that ANDs the movement request against opposing green-compatible states before the coil driver sees a closing edge.`,
      },
      {
        t: 'pre',
        text: `LC-800 REAR PANEL   (signal side, pin 1 = square pad)\n\nA00..A15  VECTOR_LATCH[0..15]  movement IDs per §1.3 table (active-HIGH)\nB00       MASTER_ARM         cabinet RUN interlock\nB01       THERM_SHUNT_FB    tie to ERROR_0xAF latch\nB02       ANNUN_HORN_EN     fault buzzer + piezo driver enable\nC00..C07  PHASE_BANK_SEL     binary slice ordinal (strap-dependent)\nGND       CHASSIS            star-point only at J12\n\n.GO  → direct A-bus assert to relay coil driver (protected movement).\n.YIELD → A-bus request held until PLGA permissive arm de-asserts deny line.`,
      },
      {
        t: 'p',
        text: '\\strike{Reference LC-800 cabinets may map up to twelve timed relay banks per EEPROM image.} ERRATA OGAS-CHIP-NOTICE-8831: Following the Sector 04 yard incident, production firmware hard-caps the active slice count at eight banks regardless of empty sockets. EEPROM “phantom” phases are rejected at assembly with ERR_HW_LIMIT_EXCEEDED.',
      },
      {
        t: 'table',
        headers: ['Parameter', 'Bound', 'Notes'],
        rows: [
          [
            'maxPhases',
            '2, 4, 6, or 8 (directive-specific)',
            'Smallest SKU ships with two slice banks; MTPX-440 corridor multiplex shelves authorize up to eight on LC-800. Exceeding the active directive limit returns ERR_HW_LIMIT_EXCEEDED.',
          ],
          [
            'noConditionals',
            'true through clearance 3A; false from 3B onward',
            'When true, any if (QUEUE…) / phase_insert pair is rejected as ERR_HW_LIMIT_EXCEEDED — LC-800 Series-A images lack the queue arithmetic co-processor; conditional jumps fault at assembly time.',
          ],
          [
            'EEPROM address / wear model',
            'Assembler: no software line cap',
            `Legacy field burners addressed 256 bytes of non-volatile store per sector; dense logic images could overflow the window. Modern directive toolchain streams the full manifest, but the Bureau still meters ${METRIC.INSTRUCTION_COUNT} (manifest row count) as a proxy for programming cycles and patch liability.`,
          ],
          [
            'Thermal duty sum',
            `${MAX_TOTAL_LOOP_SECONDS}s`,
            `Aggregate programmed greens per rotation; runtime compares the live timing register on every kinetic micro-tick. Exceeding the envelope trips thermal shunt (ERROR_0xAF).`,
          ],
        ],
      },
      {
        t: 'redact',
        text: 'INTERNAL PROCUREMENT: cross-grade ILC-92 heads or third-party multiplexer shelves without OGAS Form 9 requisition are ████████',
      },
      {
        t: 'warn',
        tone: 'amber',
        text: 'When the assembler cites ERR_HW_LIMIT_EXCEEDED, cross-check this sheet against your active corridor clearance before filing a defect.',
      },
    ],
  },
  {
    section: '1.2',
    tab: 'EVAL',
    title: 'Requisition Audit Registers (OGAS Form 7-B)',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: `${BRAND.ORG} clearance filings serialize three audit registers into the sector ledger. They are liability artifacts, not encouragement.`,
      },
      {
        t: 'table',
        headers: ['Register', 'Physical meaning', 'Bureau interest'],
        rows: [
          [
            METRIC.THROUGHPUT,
            'Municipal flow audit: elapsed operator chronograph from cabinet ACTIVE until the mandated hourly discharge quota for the corridor docket is satisfied (ledger closes).',
            'Shorter audits reduce upstream saturation risk before this node releases the box.',
          ],
          [
            METRIC.INSTRUCTION_COUNT,
            'EEPROM lifetime wear proxy: non-blank manifest rows in the active logic image after last save.',
            'Dense phase-sequence images extend patch windows and increase field-service exposure.',
          ],
          [
            METRIC.HARDWARE_COST,
            'Capital expenditure (CAPEX) synthesis from manifest character mass plus one relay rack line item per declared phase(n) block.',
            `Each phase(n) header bills as a timed relay bank. Each if (QUEUE…) arm bills as one ${MANUAL_HW.ILC92} physical sensor head requisition (BOM surcharge).`,
          ],
        ],
      },
      {
        t: 'h2',
        text: 'Form 7-B CAPEX rate table (line items)',
      },
      {
        t: 'table',
        headers: ['Line item', 'Unit charge (¥)', 'Quantity basis'],
        rows: [
          ['Base terminal allocation', '100', 'Fixed per filing'],
          ['Active relay bank (each phase(n) header)', '110', 'One charge per declared phase block'],
          ['EEPROM byte mass (manifest characters)', '8', 'Joined source characters after strip of blanks and remarks'],
          ['Bureau maximum authorized spend', '2000', 'Hard ceiling; filings above cap are rejected at audit'],
        ],
      },
      {
        t: 'p',
        text: `Total ${METRIC.HARDWARE_COST} is the sum of line items clamped to the bureau ceiling. Conditional routing does not introduce undisclosed surcharges beyond ILC-92 heads already requisitioned for the corridor; the manifest string is the bill of lading ${BRAND.SECTOR} photographs on install.`,
      },
      {
        t: 'p',
        text: `\\note{Stop gold-plating slices — ${METRIC.HARDWARE_COST} is what procurement actually sees. ${METRIC.THROUGHPUT} is what HQ posts on the wall. Pick one master and serve it. — Central Scheduling}`,
      },
      {
        t: 'p',
        text: `Thermal coupling: the timing register may not schedule more than ${MAX_TOTAL_LOOP_SECONDS}s of aggregate green per full rotation. A favorable ${METRIC.THROUGHPUT} interval does not excuse buffer saturation; starving approaches still trips ERROR_0x94. ${MIN_PHASE_GREEN_SECONDS}s is the per-phase floor enforced by the relay driver.`,
      },
    ],
  },
  {
    section: '1.3',
    tab: 'ISA',
    title: `${BRAND.SECTOR} Lamp Bus Mnemonics & Logic Image Grammar`,
    alwaysVisible: true,
    blocks: [
      {
        t: 'h2',
        text: 'Logic image grammar (assembler scan)',
      },
      {
        t: 'margin',
        text: '— M. Voss, night shift: keep QUEUE literals one tick wide in humidity; ILC dithers. Not in the cold spec. —',
      },
      {
        t: 'p',
        text: 'Phase-sequence logic images are ordered EEPROM sectors assembled as timed relay banks on the LC-800. The directive assembler scans top to bottom, discarding blank lines and lines beginning with # (remark prefix).',
      },
      {
        t: 'code',
        text: 'phase(<index>[, min=<s>][, max=<s>]):\n    <MOVEMENT>.GO | <MOVEMENT>.YIELD\n    EXCLUSIVE_PEDESTRIAN_PHASE.GO\n\nif (QUEUE.NORTH_LEFT > <n>):\n    phase_insert(NORTH_LEFT.GO [, MORE.GO ...])',
      },
      {
        t: 'h2',
        text: 'Datasheet: opcode timing & clearance tax',
      },
      {
        t: 'p',
        text: 'Bus word issuance inside a slice does not consume additional macro-ticks beyond the lamp state machine already described in §1.0. However, every phase transition still pays the mandatory yellow and ALL_RED clearance dwell encoded in the cabinet ROM; issuing redundant phase_insert pulses to “beat” the tax only stacks heat in the relay shelf.',
      },
      {
        t: 'h2',
        text: 'Legacy / unsupported mnemonics',
      },
      {
        t: 'warn',
        tone: 'red',
        text: 'The following tokens appear in older municipal EEPROM dumps (LC-600 series and pre-unification cities). The LC-800 assembler rejects them; do not paste from legacy field volumes without redacting.',
      },
      {
        t: 'table',
        headers: ['Mnemonic', 'Historical intent', 'LC-800 status'],
        rows: [
          ['.BLINK', 'Factory lamp relay exerciser; no traffic semantics.', '[UNSUPPORTED ON LC-800]'],
          ['PREEMPT_EMERGENCY.GO', 'Reserved EMS preemption bus on LC-600 / trunk cabinets.', '[UNSUPPORTED ON LC-800]'],
        ],
      },
      {
        t: 'h2',
        text: 'phase(index, min=, max=)',
      },
      {
        t: 'ul',
        items: [
          'index: unsigned phase ordinal. Bus order follows ascending index as punched in the image.',
          'min= / max=: optional clamps forwarded to the adaptive green servo for that bank. When omitted, bounds are open and the front-panel timing register alone supplies the green interval.',
        ],
      },
      {
        t: 'h2',
        text: 'MOVEMENT.GO | MOVEMENT.YIELD (bus opcodes)',
      },
      {
        t: 'table',
        headers: ['Bus word', 'Electrical assertion', 'Fault if misused'],
        rows: [
          [
            '.GO',
            'Hard right-of-way: movement may occupy the conflict plane without gap negotiation.',
            'Intersecting .GO vectors on the same macro-slice without temporal separation → kinetic overlap fault ERROR_0x82 when the radar sweep observes co-occupancy.',
          ],
          [
            '.YIELD',
            'Permissive merge: unit requests gaps against streams the slice already grants as green-compatible.',
            'No dedicated fault opcode; denial stalls traffic and can drive upstream buffers toward ERROR_0x94 if clearance is withheld too long.',
          ],
        ],
      },
      {
        t: 'h2',
        text: 'EXCLUSIVE_PEDESTRIAN_PHASE.GO',
      },
      {
        t: 'p',
        text: `Expands internally through the ${MANUAL_HW.SOR_WALK} to simultaneous crosswalk vectors 0x0D–0x10. All vehicular .GO and .YIELD tokens are tri-stated for that slice.`,
      },
      {
        t: 'h2',
        text: 'if (QUEUE.<DIR>_<ROLE> > n):',
      },
      {
        t: 'p',
        text: `The predicate is not a high-level “if” in application software; it is a wired comparator arm that samples the return register from the ${MANUAL_HW.ILC92} (inductive loops buried in the approach mat). Buffered depth is a coprocessor return, not a RAM variable. When true at the macro-tick boundary, the immediately following phase_insert line is injected ahead of the next scheduled phase advance.`,
      },
      {
        t: 'h2',
        text: 'phase_insert(...)',
      },
      {
        t: 'p',
        text: 'One-shot micro-slice. Accepts the same MOVEMENT.MODE bus tuples as a normal phase body. DIR_ALL.GO expands to LEFT, STRAIGHT, and RIGHT for that compass.',
      },
      {
        t: 'h2',
        text: 'Movement → internal ID',
      },
      {
        t: 'table',
        headers: ['Token', 'ID'],
        rows: MOVEMENT_ID_ROWS,
      },
      {
        t: 'pre',
        text: '        N_THRU\n           |\nW_THRU --+-- E_THRU\n           |\n        S_THRU',
      },
    ],
  },
  {
    section: '1.4',
    tab: 'FAULT',
    title: 'Fault Annunciation & Liability Registers',
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: 'When any guard band below trips, the cabinet latches CRITICAL_HALT, freezes the kinetic display, lights the annunciator strip, and raises Form 9 incident paperwork in the Bureau queue. Codes match the fault banner on the operator glass.',
      },
      {
        t: 'table',
        headers: ['Code', 'Class', 'Field symptom', 'Trip condition (internal)', 'Operator action'],
        rows: [
          [
            'ERROR_0x82',
            'KINETIC_OVERLAP_EXCEPTION',
            'Annunciator horn (B02 asserted); lamp bus forced FLASH-RED; kinetic display freezes on last valid frame until hard buffer clear.',
            'Two vehicles occupy the conflict box without LPH drafting exemption while resultant speed magnitude exceeds the guard threshold. Intersecting .GO vectors without temporal separation produce kinetic overlap.',
            'De-assert master switch. Authorized technician performs hard buffer clear per Form 9. Inspect last active slice for conflicting .GO. Re-time slices or insert .YIELD / phase isolation per §1.08 gap sheet. Incident report filed automatically with lane IDs from banner.',
          ],
          [
            'ERROR_0x94',
            'GRIDLOCK_DETECTED',
            `Piezo warble + amber flash; ${MANUAL_HW.ILC92} upstream registers peg high on one approach.`,
            `Any single upstream approach buffer holds ≥${GRIDLOCK_QUEUE_HALT_THRESHOLD} units past the radar horizon (unmonitored queue). The halt freezes buffer depth registers for the congestion readout.`,
            'Increase GREEN duty or insert ILC-92–driven phase_insert for the saturated compass. If using .YIELD, verify permissive gaps ≥ G_req (§1.08) against opposing discharge before re-run.',
          ],
          [
            'ERROR_0xAF',
            'THERMAL_SHUNT_TRIP',
            'Thermal shunt LED solid; lamp bus opens; audible relay click sequence; horn may latch per strap.',
            `Sum of per-phase green intervals in the timing register exceeds ${MAX_TOTAL_LOOP_SECONDS}s while the cabinet is ACTIVE. Phase-sequence image violates OGAS thermal duty envelope; thermal shunt opens.`,
            'Reduce aggregate programmed green or delete slice banks until under Form 7-B cap. Re-check §1.05 clearance tax is budgeted; do not bypass with EEPROM tricks.',
          ],
        ],
      },
      {
        t: 'warn',
        tone: 'red',
        text: 'WARNING: Excessive phase declarations increase thermal load. Where geometry permits, permissive .YIELD keeps opposing non-conflicting streams concurrent under one slice, reducing relay cycle count.',
      },
    ],
  },
  {
    section: '1.5',
    tab: 'COVER',
    title: `${BRAND.SECTOR} Operations Protocol`,
    alwaysVisible: true,
    blocks: [
      {
        t: 'p',
        text: `This volume describes the ${BRAND.SECTOR} directive assembler, fault latches, and requisition audit registers. Field behavior is authoritative; later addenda only annotate hardware that was not present at initial deployment.`,
      },
      {
        t: 'ul',
        items: [
          'Logic images assemble to ordered phase(n) relay slices.',
          'Movements not listed in the active slice see a hard red.',
          'Simultaneous conflicting .GO in the same macro-slice is classified Undefined Behavior (UB). The Bureau forbids relying on micro-timing gaps, phase skew against the kinetic radar, or “scraping” clears between opposing vectors to bypass the collision envelope. Operator Miller (Badge 4412, revoked) was terminated after documented scraping attempts; do not cite his EEPROM dumps. Field lore notwithstanding, UB that avoids immediate ERROR_0x82 is not indemnified; auditors treat it as warranty void.',
        ],
      },
      {
        t: 'warn',
        tone: 'red',
        text: 'Some operators claim that tightly phased opposing movements can slip past annunciators under favorable Doppler windows. OGAS does not certify such maneuvers. Assume ERROR_0x82 is the only predictable outcome unless geometry and LPH exemptions explicitly apply.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO',
      },
    ],
  },
  {
    section: '1.6',
    tab: 'TERMS',
    title: 'Standard Terminology',
    alwaysVisible: true,
    blocks: [
      { t: 'h2', text: 'Controller vocabulary' },
      {
        t: 'ul',
        items: [
          'CORRIDOR DOCKET: Bureau installation package for one approach set; colloquial “requisition” includes strap addenda and discharge quota.',
          'AS-BUILT SCHEMATIC: Corridor geometry fused at factory; masked movements read open-circuit.',
          'SGU (Sensor Grid Unit): canonical linear measure on the inductive approach mat; all factory tolerances in §1.0 are expressed in SGU.',
          'PHASE: timed relay slice. Only tokens enumerated for that slice may draw green.',
          'MOVEMENT: approach bundle (e.g. NORTH_LEFT). See lamp bus table for IDs.',
          'CYCLE: one full pass through the declared phase index set.',
          `QUEUE.*: return field from the ${MANUAL_HW.ILC92}; upstream approach buffer depth per lane id mirrored from yard ingress counters (not a software variable).`,
          'MACRO-TICK: 10 Hz lamp FSM service boundary; ILC-92 comparators evaluate here.',
          'TICK: kinetic micro-tick quanta; not operator-addressable.',
        ],
      },
    ],
  },
  {
    section: '2.1',
    tab: '82-A',
    title: `Addendum 82-A — Primary Axis Strap (${BRAND.SECTOR}-MEMO-1A)`,
    unlockLevelId: '1A',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'PROCUREMENT OFFICE — CORRIDOR 1A: Factory letter revision 1A straps only the north–south mast pair. This sheet is part of the compliance bundle shipped with that strap kit.',
      },
      {
        t: 'p',
        text: 'Assembler rejects compass tokens for axes that lack physical straps on this SKU. Referencing an unstrapped axis halts assembly with SYNTAX ERROR on the offending line.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO',
      },
      {
        t: 'p',
        text: 'Opposing straight pairs share one time-space diagonal; the controller grants them in one slice without additional relay banks.',
      },
    ],
  },
  {
    section: '2.2',
    tab: '82-B',
    title: `Addendum 82-B — Orthogonal Corridor (${BRAND.SECTOR}-MEMO-1B)`,
    unlockLevelId: '1B',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'FIELD SERVICE LOG — REV 1B: East/West approach blinders removed per home-office directive. Lateral traffic now reaches the LC-800 slice decoder.',
      },
      {
        t: 'p',
        text: 'Do not assume the controller prevents lateral collisions. Perpendicular axes do not implicitly yield; each axis demands explicit phase isolation or permissive .YIELD where geometry permits shared occupancy.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    EAST_STRAIGHT.GO\n    WEST_STRAIGHT.GO',
      },
      {
        t: 'p',
        text: 'If two perpendicular straights are both issued .GO in the same slice, the conflict resolver will eventually observe ERROR_0x82 unless one stream is held red.',
      },
    ],
  },
  {
    section: '2.3',
    tab: '82-C',
    title: `Addendum 82-C — Full Compass Matrix (${BRAND.SECTOR}-MEMO-1C)`,
    unlockLevelId: '1C',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'NETWORK AUTHORIZATION — REV 1C: Full compass matrix energized. Additional relay banks billed against thermal budget per Form 7-B.',
      },
      {
        t: 'p',
        text: 'Four-way operation multiplexes perpendicular corridors into separate slices because side-impact vectors share the same conflict box.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO\n\nphase(2):\n    EAST_STRAIGHT.GO\n    WEST_STRAIGHT.GO',
      },
      {
        t: 'warn',
        tone: 'red',
        text: `WARNING: Each additional phase(n) header energizes another relay rack. Thermal budget is capped at ${MAX_TOTAL_LOOP_SECONDS}s aggregate green; exceeding it trips ERROR_0xAF.`,
      },
    ],
  },
  {
    section: '2.4',
    tab: '82-D',
    title: `Addendum 82-D — Protected Turn Banks (${BRAND.SECTOR}-MEMO-1D)`,
    unlockLevelId: '1D',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'MAINTENANCE TICKET — REV 1D: Protected turn relay shelves installed; arc sweeps now cross opposing straight vectors.',
      },
      {
        t: 'p',
        text: 'Left-turn arcs sweep across opposing straight vectors. Hardware cannot guarantee gap acceptance for opposing .GO in the same slice; the turn bank must be isolated.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO\n\nphase(2):\n    NORTH_LEFT.GO\n    SOUTH_LEFT.GO',
      },
    ],
  },
  {
    section: '2.5',
    tab: '83-A',
    title: `Addendum 83-A — Asymmetric Load (${BRAND.SECTOR}-MEMO-2A)`,
    unlockLevelId: '2A',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'TRAFFIC ENGINEERING MEMO — REV 2A: Asymmetric demand tables fused into approach ROM. No automatic priority arbitration added.',
      },
      {
        t: 'p',
        text: 'Uneven demand does not create implicit priority. The scheduler still walks your declared indices; repeating a high-load movement in multiple slices increases its duty cycle within the bounded loop.',
      },
      {
        t: 'p',
        text: 'Starved approaches accumulate in QUEUE registers until ERROR_0x94 if the buffer exceeds the documented halt depth.',
      },
    ],
  },
  {
    section: '2.6',
    tab: '83-B',
    title: `Addendum 83-B — Lane Masking (${BRAND.SECTOR}-MEMO-2B)`,
    unlockLevelId: '2B',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'FACTORY BURN — REV 2B: Lane mask fuses blown per corridor blueprint; absent movements read open-circuit.',
      },
      {
        t: 'p',
        text: 'Masked movements are electrically absent. Authorizing a masked token is a hardware fault and rejects at assembly.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    EAST_LEFT.GO\n    EAST_RIGHT.GO',
      },
    ],
  },
  {
    section: '2.7',
    tab: '83-C',
    title: `Addendum 83-C — ${MANUAL_HW.SOR_WALK} (${BRAND.SECTOR}-MEMO-2C)`,
    unlockLevelId: '2C',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: `SYSTEM OVERRIDE ROM — REV 2C: ${MANUAL_HW.SOR_WALK} image 0x1A fused; pedestrian slice may preempt all vehicular banks on the LC-800.`,
      },
      {
        t: 'p',
        text: `EXCLUSIVE_PEDESTRIAN_PHASE.GO asserts System Override 0x1A via the ${MANUAL_HW.SOR_WALK}: all vehicular vectors are held while crosswalk IDs 0x0D–0x10 assert.`,
      },
      {
        t: 'p',
        text: `Municipal politics: Bureau of Transportation efficiency targets despise this opcode because it zeros vehicular discharge for the entire macro-slice. Citizen Safety Council Mandate 44-B nevertheless requires the ${MANUAL_HW.SOR_WALK} path remain burned in ROM. Excessive pedestrian allocations inflate ${METRIC.THROUGHPUT} and trigger automated OGAS efficiency audits; keep override slices short and late in the cycle unless counsel instructs otherwise.`,
      },
      {
        t: 'code',
        text: 'phase(1):\n    EXCLUSIVE_PEDESTRIAN_PHASE.GO',
      },
      {
        t: 'p',
        text: 'Turn queues that discharge into the box during pedestrian slices will back-pressure upstream; plan slice order accordingly. \\note{Mayor\'s office pages me every time this runs long — cars stack into the financial district. Use sparingly. — Op. 081}',
      },
    ],
  },
  {
    section: '2.8',
    tab: '84-A',
    title: `Addendum 84-A — Permissive Merge (${BRAND.SECTOR}-MEMO-3A)`,
    unlockLevelId: '3A',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'LICENSE STAMP — REV 3A: Permissive merge microcode activated. \\note{Adaptive sensors jitter in cold weather. I still run fixed yellows on my corridor. — M. Kessler, Relays}',
      },
      {
        t: 'p',
        text: '.YIELD arms gap-seeking logic on the movement while the slice is active. It does not invent right-of-way; it defers to opposing streams that already hold green-compatible geometry.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    NORTH_STRAIGHT.GO\n    SOUTH_STRAIGHT.GO\n    NORTH_RIGHT.YIELD',
      },
      {
        t: 'p',
        text: 'Thermal note: merging compatible streams under one slice reduces total relay activations versus splitting every conflict into its own phase.',
      },
    ],
  },
  {
    section: '2.9',
    tab: '84-B',
    title: `Addendum 84-B — ${MANUAL_HW.ILC92} Interface (${BRAND.SECTOR}-MEMO-3B)`,
    unlockLevelId: '3B',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: `BOM SURCHARGE — REV 3B: ${MANUAL_HW.ILC92} heads mounted per manifest. Each if (QUEUE…) line item draws one Physical Sensor Head Requisition from your corridor bill of materials.`,
      },
      {
        t: 'p',
        text: `ILC-92 comparators sample buffered depth registers at the macro-tick boundary only; there is no 60 Hz “software if.” A true predicate schedules phase_insert before the next index advance. Each comparator arm is a separate Physical Sensor Head Requisition on Form 7-B. \\note{if (QUEUE.NORTH_LEFT > 5) then phase_insert — buffers lie above 5 anyway. — Op. 081}`,
      },
      {
        t: 'code',
        text: 'if (QUEUE.NORTH_LEFT > 5):\n    phase_insert(NORTH_LEFT.GO)',
      },
      {
        t: 'p',
        text: 'The comparator arm and its phase_insert must be adjacent; the assembler rejects interleaved bus lines.',
      },
    ],
  },
  {
    section: '2.10',
    tab: '84-C',
    title: `Addendum 84-C — Split Approach (${BRAND.SECTOR}-MEMO-3C)`,
    unlockLevelId: '3C',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'RELAY BANK SPLIT — REV 3C: Dedicated mast slices authorized; additional rack charges apply per Form 7-B.',
      },
      {
        t: 'p',
        text: 'A split approach dedicates one entire slice to every movement from a single compass, eliminating internal merge conflicts on that mast.',
      },
      {
        t: 'code',
        text: 'phase(1):\n    WEST_LEFT.GO\n    WEST_STRAIGHT.GO\n    WEST_RIGHT.GO',
      },
      {
        t: 'p',
        text: `Trade-off: slice count rises, so aggregate cycle time and ${METRIC.HARDWARE_COST} both increase unless demand justifies the extra rack.`,
      },
    ],
  },
  {
    section: '2.11',
    tab: '85-A',
    title: `Addendum 85-A — High Slice Count (${BRAND.SECTOR}-MEMO-4A)`,
    unlockLevelId: '4A',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'STRUCTURAL UPGRADE — REV 4A: Expanded relay shelves bolted; eight-bank corridors authorized where clearance permits.',
      },
      {
        t: 'p',
        text: 'Dense intersections may require eight or more slices. Each slice still obeys the global thermal cap; adaptive timing will compress greens if you approach the limit.',
      },
      {
        t: 'warn',
        tone: 'red',
        text: `Monitor QUEUE registers: any buffer ≥${GRIDLOCK_QUEUE_HALT_THRESHOLD} vehicles trips ERROR_0x94 regardless of slice count.`,
      },
    ],
  },
  {
    section: '2.12',
    tab: '85-B',
    title: `Addendum 85-B — ${MANUAL_HW.ILC92} Priority Comparator (${BRAND.SECTOR}-MEMO-4B)`,
    unlockLevelId: '4B',
    blocks: [
      {
        t: 'warn',
        tone: 'amber',
        text: 'PRIORITY COMPARATOR INSTALL — REV 4B: Override paths live; preemption remains firmware-strapped to QUEUE comparators only.',
      },
      {
        t: 'p',
        text: 'phase_insert under QUEUE predicates is the only sanctioned mechanism for priority preemption. Thresholds should be set below the ERROR_0x94 buffer depth to leave margin. \\note{0x82 scares me more than 0x94 — overlap is instant. Keep perpendicular .GO separated. — Y. Okonkwo, Safety}',
      },
      {
        t: 'code',
        text: 'if (QUEUE.SOUTH_STRAIGHT > 2):\n    phase_insert(SOUTH_STRAIGHT.GO)',
      },
    ],
  },
  {
    section: '2.13',
    tab: 'SVE',
    title: `${BRAND.SECTOR} Simulated Validation Environment (SVE / Off-Grid HIL)`,
    unlockSandbox: true,
    blocks: [
      {
        t: 'warn',
        tone: 'red',
        text: 'WARNING: The SVE bypasses live upstream telemetry and municipal audit interfaces. Logic images assembled here are isolated from the Bureau clearance ledger. Do not cite SVE logs to justify budget requisitions, liability filings, or warranty service.',
      },
      {
        t: 'p',
        text: `The partition mounts every optional ${MANUAL_HW.ILC92} head without procurement caps so engineers may stress arbitrary demand curves on the breadboard bus. Behavior is intended to match field ROM within manufacturing tolerance, but OGAS treats this rack as non-evidentiary.`,
      },
      {
        t: 'ul',
        items: [
          'Burn-in, regression, and certification drill runs only.',
          'Directive completions and Regional Performance Comparison aggregates are not posted from this partition.',
        ],
      },
    ],
  },
];
