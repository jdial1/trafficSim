export const BRAND = {
  ORG: 'OGAS',
  PRODUCT: 'Traffic Control Terminal',
  SECTOR: 'SEC-082',
  SECTOR_NUM: '082',
  REF_DOC: 'REF: OGAS-SEC-082',
  MANUAL_VERSION: '4.2',
  PWA_DESCRIPTION: 'Municipal phase-logic terminal and Bureau flow audits.',
  SESSION_DB: 'OgasSession',
} as const;

export const manualRibbonLabel = () =>
  `${BRAND.ORG} Manual v${BRAND.MANUAL_VERSION}`;

export const hudSiteTitle = (buildVersion: string) =>
  `${BRAND.SECTOR} · ${buildVersion}`;

export const METRIC = {
  THROUGHPUT: 'MUNICIPAL FLOW AUDIT',
  INSTRUCTION_COUNT: 'EEPROM WEAR INDEX',
  HARDWARE_COST: 'FORM 7-B CAPEX',
} as const;

export const MANUAL_HW = {
  LC800: 'OGAS LC-800 Core',
  ILC92: 'ILC-92 Inductive Loop Coprocessor',
  SOR_WALK: 'SOR-Walk Sys-Override Relay',
} as const;

export const PWA_MANIFEST = {
  name: `${BRAND.ORG} — ${BRAND.PRODUCT}`,
  short_name: BRAND.ORG,
  description: BRAND.PWA_DESCRIPTION,
} as const;

export const bureauEfficiencyAuditLabel = (sector: string) =>
  `Office of Grid Allocation — bureau efficiency audit (${sector} vs. aggregate register)`;

export const CTA = {
  INSTALL_APP: 'INSTALL APP',
  ENTER_TERMINAL: 'ENTER TERMINAL',
  ENTER_GUEST: 'ENTER AS GUEST',
  LOGIN_GOOGLE: 'LOGIN WITH GOOGLE',
  SIGN_OUT: 'SIGN OUT',
} as const;

export const getMetricTier = (levelIndex: number) => {
  const ordinal = levelIndex + 1;
  if (ordinal <= 3) return 1; // 1A, 1B, 1C
  if (ordinal <= 6) return 2; // 1D, 2A, 2B
  return 3;
};
