
export interface BriefingContent {
  id: string;
  title: string;
  from: string;
  subject: string;
  body: string;
  bullets: string[];
  hardware: string[];
  initialCode: string;
  winCondition: {
    clearCars: number;
    minPerDirection?: number;
  };
  closedLanes?: string[];
  constraints?: {
    maxPhases?: number;
    noConditionals?: boolean;
  };
}

export const level1Briefing: BriefingContent[] = [
  {
    id: "1A",
    title: "1A: N/S FLOW",
    from: "BUREAU OF TRANSPORTATION <dir-req@bot.gov>",
    subject: "DIRECTIVE 82-A: N/S AXIS ALIGNMENT",
    body: "LATENCY ON SEC-082 N/S CORRIDOR EXCEEDS ACCEPTABLE THRESHOLDS. EAST/WEST SENSORS ARE TEMPORARILY DISABLED FOR CALIBRATION. YOUR TASK IS TO ESTABLISH BASELINE THROUGHPUT ON THE NORTH AND SOUTH AXES.",
    bullets: [
      "CLEAR 50 VEHICLES.",
      "ENSURE BOTH NORTH AND SOUTH AXES ARE PROCESSED.",
      "FAILURE: GRID LOCK DETECTED.",
      "MAINTAIN HARDWARE SAFETY LIMITS. AVOID HEAD-ON COLLISIONS."
    ],
    hardware: [
      "SEC-082 BASE LOGIC CONTROLLER",
      "N/S SENSOR ARRAY",
      "MANUAL OVERRIDE SWITCH"
    ],
    initialCode: "",
    winCondition: { clearCars: 50, minPerDirection: 15 },
    closedLanes: ["eb-left", "eb-thru", "eb-right", "wb-left", "wb-thru", "wb-right"],
    constraints: { maxPhases: 2, noConditionals: true }
  },
  {
    id: "1B",
    title: "1B: E/W FLOW",
    from: "BUREAU OF TRANSPORTATION <dir-req@bot.gov>",
    subject: "DIRECTIVE 82-B: E/W AXIS ALIGNMENT",
    body: "N/S SENSORS HAVE BEEN TAKEN OFFLINE FOR DIAGNOSTICS. EAST/WEST TRAFFIC IS NOW BACKING UP INTO THE INDUSTRIAL DISTRICT. RESTORE FLOW WITHOUT EXCEEDING CYCLE BUDGET.",
    bullets: [
      "CLEAR 50 VEHICLES.",
      "ENSURE BOTH EAST AND WEST AXES ARE PROCESSED.",
      "FAILURE: GRID LOCK DETECTED.",
      "KEEP EAST AND WEST TRAFFIC ISOLATED TO PREVENT INCIDENTS."
    ],
    hardware: [
      "SEC-082 BASE LOGIC CONTROLLER",
      "E/W SENSOR ARRAY",
      "MANUAL OVERRIDE SWITCH"
    ],
    initialCode: "",
    winCondition: { clearCars: 50, minPerDirection: 15 },
    closedLanes: ["nb-left", "nb-thru", "nb-right", "sb-left", "sb-thru", "sb-right"],
    constraints: { maxPhases: 2, noConditionals: true }
  },
  {
    id: "1C",
    title: "1C: FULL INTEGRATION",
    from: "BUREAU OF TRANSPORTATION <dir-req@bot.gov>",
    subject: "DIRECTIVE 82-C: FULL OPERATION",
    body: "DIAGNOSTICS COMPLETE. ALL SENSORS ON SEC-082 ARE ACTIVE. CONGESTION IS CRITICAL. DESIGN A 4-PHASE CYCLE TO PROCESS ALL DIRECTIONS EFFICIENTLY. DO NOT EXCEED THE 60-TICK CYCLE OVERHEAT LIMIT.",
    bullets: [
      "CLEAR 50 VEHICLES.",
      "ENSURE ALL FOUR AXES MAINTAIN MINIMUM FLOW.",
      "FAILURE: GRID LOCK DETECTED.",
      "ISOLATE CONFLICTING MOVEMENTS INTO DISCRETE PHASES."
    ],
    hardware: [
      "SEC-082 MULTIPLEX CONTROLLER",
      "FULL SENSOR ARRAY",
      "PHASE SEQUENCER"
    ],
    initialCode: "",
    winCondition: { clearCars: 50, minPerDirection: 15 },
    constraints: { maxPhases: 4, noConditionals: true }
  }
];