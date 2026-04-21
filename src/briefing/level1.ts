import { PHASE_TEMPLATES } from '../constants';

export interface BriefingContent {
  id: string;
  title: string;
  from: string;
  subject: string;
  body: string;
  bullets: string[];
  hardware: string[];
  initialCode: string;
}

export const level1Briefing: BriefingContent[] = [
  {
    id: "1A",
    title: "1A: North/South Only",
    from: "OmniCorp Dispatch <dispatch@omnicorp.gov>",
    subject: "URGENT: Intersection Sec-082 (Part 1)",
    body: "Sec-082 is one four-leg intersection: three approach lanes per cardinal direction (left, through, right). For this directive, demand is restricted to the north–south legs only; east and west spawns are suspended so you can focus on vertical flow. Alternate north and south with non-overlapping phases.",
    bullets: [
      "Create one phase that allows NORTH traffic (all three lanes).",
      "Create a second phase that allows SOUTH traffic (all three lanes).",
      "Use .GO so opposing stacks never conflict in the same phase."
    ],
    hardware: [
      "TRAFFIC_SEC_082_V4.2 Node",
      "Basic Traffic Sense",
      "Punch-Card Input System"
    ],
    initialCode: "phase(1):\nNORTH_ALL.GO\n\nphase(2):\nSOUTH_ALL.GO\n"
  },
  {
    id: "1B",
    title: "1B: East/West Crossing",
    from: "OmniCorp Dispatch <dispatch@omnicorp.gov>",
    subject: "URGENT: Intersection Sec-082 (Part 2)",
    body: "Same single intersection; demand is now restricted to the east–west legs while north–south spawns are suspended. Alternate eastbound and westbound stacks so the three east lanes and three west lanes never get a conflicting green together.",
    bullets: [
      "Create one phase for EAST traffic (left, through, right).",
      "Create a second phase for WEST traffic (left, through, right).",
      "Keep east and west in separate phases."
    ],
    hardware: [
      "TRAFFIC_SEC_082_V4.2 Node",
      "Basic Traffic Sense",
      "Punch-Card Input System"
    ],
    initialCode: "phase(1):\nEAST_ALL.GO\n\nphase(2):\nWEST_ALL.GO\n"
  },
  {
    id: "1C",
    title: "1C: Full Integration",
    from: "OmniCorp Dispatch <dispatch@omnicorp.gov>",
    subject: "URGENT: Intersection Sec-082 (Part 3)",
    body: "All four approaches are live again on the same Sec-082 node. Build one coordinated ring that serves every lane type (protected lefts, through, rights, and crosswalks where you use them) without conflicts. The STD preset matches this geometry.",
    bullets: [
      "Run a full cycle for N, S, E, and W (three lanes each).",
      "Group only compatible movements in the same phase.",
      "Keep total green within the controller loop budget."
    ],
    hardware: [
      "TRAFFIC_SEC_082_V4.2 Node",
      "Basic Traffic Sense",
      "Punch-Card Input System"
    ],
    initialCode: PHASE_TEMPLATES[0].code
  }
];
