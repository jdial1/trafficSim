export interface BriefingContent {
  from: string;
  subject: string;
  body: string;
  bullets: string[];
  hardware: string[];
}

export const level1Briefing: BriefingContent = {
  from: "OmniCorp Dispatch <dispatch@omnicorp.gov>",
  subject: "URGENT: Intersection Sec-082 Optimization Required",
  body: "Traffic flow at Intersection Sec-082 has degraded below acceptable thresholds. Congestion is forming on the arterial routes and our current automated logic is failing to clear the backlog efficiently. You are assigned to rewrite the phase sequencing.\n\nYour code must direct the traffic safely. Avoid collisions at all costs.",
  bullets: [
    "Write code to control traffic lights via Phase Commands.",
    "Use .GO and .YIELD to define safe movement patterns.",
    "Minimize vehicle wait time while preventing crashes."
  ],
  hardware: [
    "TRAFFIC_SEC_082_V4.2 Node",
    "Basic Traffic Sense",
    "Monaco Code Interface"
  ]
};
