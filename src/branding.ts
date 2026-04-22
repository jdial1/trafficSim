export const BRAND = {
  ORG: 'GOSAVTOMATIKA',
  PRODUCT: 'Traffic Control Terminal',
  SECTOR: 'SEC-082',
  SECTOR_NUM: '082',
  REF_DOC: 'REF: GOS-SEC-082',
  MANUAL_VERSION: '4.2',
  PWA_DESCRIPTION: 'Signal-phase traffic control puzzle.',
  SESSION_DB: 'GosAvtomatikaSession',
} as const;

export const manualRibbonLabel = () =>
  `${BRAND.ORG} Manual v${BRAND.MANUAL_VERSION}`;

export const hudSiteTitle = (buildVersion: string) =>
  `${BRAND.SECTOR} · ${buildVersion}`;

export const METRIC = {
  THROUGHPUT: 'THROUGHPUT',
  INSTRUCTION_COUNT: 'INSTRUCTION COUNT',
  HARDWARE_COST: 'HARDWARE COST',
} as const;

export const PWA_MANIFEST = {
  name: `${BRAND.ORG} — ${BRAND.PRODUCT}`,
  short_name: BRAND.ORG,
  description: BRAND.PWA_DESCRIPTION,
} as const;

export const CTA = {
  INSTALL_APP: 'INSTALL APP',
  ENTER_TERMINAL: 'ENTER TERMINAL',
  ENTER_GUEST: 'ENTER AS GUEST',
  LOGIN_GOOGLE: 'LOGIN WITH GOOGLE',
  SIGN_OUT: 'SIGN OUT',
} as const;
