import React from 'react';
import { Activity, ArrowUp, CornerUpLeft, CornerUpRight } from 'lucide-react';
import { BRAND } from './branding';
import { Movement } from './types';

export const VIEWPORT_MOBILE_MAX_WIDTH = 767;
export const narrowViewport = () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${VIEWPORT_MOBILE_MAX_WIDTH}px)`).matches;
export const defaultZoom = () => narrowViewport() ? 1.2 : 1;

export const MovementLabels: Record<number, string> = {
  [Movement.NORTHBOUND_LEFT]: 'NORTH_LEFT', [Movement.NORTHBOUND_STRAIGHT]: 'NORTH_STRAIGHT', [Movement.NORTHBOUND_RIGHT]: 'NORTH_RIGHT',
  [Movement.WESTBOUND_LEFT]: 'WEST_LEFT', [Movement.WESTBOUND_STRAIGHT]: 'WEST_STRAIGHT', [Movement.WESTBOUND_RIGHT]: 'WEST_RIGHT',
  [Movement.SOUTHBOUND_LEFT]: 'SOUTH_LEFT', [Movement.SOUTHBOUND_STRAIGHT]: 'SOUTH_STRAIGHT', [Movement.SOUTHBOUND_RIGHT]: 'SOUTH_RIGHT',
  [Movement.EASTBOUND_LEFT]: 'EAST_LEFT', [Movement.EASTBOUND_STRAIGHT]: 'EAST_STRAIGHT', [Movement.EASTBOUND_RIGHT]: 'EAST_RIGHT',
  [Movement.CROSSWALK_NORTH]: 'CROSSWALK_NORTH', [Movement.CROSSWALK_SOUTH]: 'CROSSWALK_SOUTH', [Movement.CROSSWALK_EAST]: 'CROSSWALK_EAST', [Movement.CROSSWALK_WEST]: 'CROSSWALK_WEST',
};

export const DIRECTIONS = ['NORTHBOUND', 'SOUTHBOUND', 'EASTBOUND', 'WESTBOUND', 'PEDESTRIAN'] as const;
export const getDirection = (m: Movement) => {
  if (m >= 1 && m <= 3) return 'NORTHBOUND'; if (m >= 7 && m <= 9) return 'SOUTHBOUND';
  if (m >= 10 && m <= 12) return 'EASTBOUND'; if (m >= 4 && m <= 6) return 'WESTBOUND';
  if (m >= 13 && m <= 16) return 'PEDESTRIAN'; return 'OTHER';
};

export const getMovementIcon = (m: Movement, size = 14) => {
  if (m >= 13 && m <= 16) return <Activity size={size} />;
  const type = m % 3;
  if (type === 1) return <CornerUpLeft size={size} />;
  if (type === 2) return <ArrowUp size={size} />;
  return <CornerUpRight size={size} />;
};

export const formatActiveMovements = (m: Movement[]) => m.length ? m.map(x => MovementLabels[x] || x).join('\n') : 'NONE';
export const TIME_SCALE_OPTIONS = [1, 2, 5, 10] as const;
export type TimeScale = (typeof TIME_SCALE_OPTIONS)[number];

// Haptics & Audio
export const vibrate = (p: number | number[]) => {
  if (typeof window === 'undefined' || !navigator.vibrate) return;
  const ua = (navigator as Navigator & { userActivation?: UserActivation }).userActivation;
  if (ua && !ua.isActive) return;
  try {
    navigator.vibrate(p);
  } catch {}
};
export const hapticTap = () => vibrate(10);

export function formatTransitUnitTag(id: string): string {
  if (id === '—') return id;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const n = (Math.abs(h) % 900) + 100;
  const pref = ['RU', 'RV', 'TM', 'QX'][Math.abs(h >> 8) % 4];
  return `${pref}-${n}`;
}
export const hapticDrag = () => vibrate(5);
export const hapticHeavy = () => vibrate([30, 50, 30]);
export const hapticError = () => vibrate([80, 50, 80]);
export const hapticCrash = () => vibrate([50, 100, 50, 100, 200, 50, 300]);
export const playThunk = () => {}; export const startAtmosphericHum = () => {}; export const stopAtmosphericHum = () => {};

const DB_NAME = BRAND.SESSION_DB;
const STORE_NAME = 'sessionData';
const openDB = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME); };
  req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
});
export const saveSession = async (state: any) => { try { const db = await openDB(); const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).put(state, 'current'); } catch (e) { console.error(e); } };
export const loadSession = async () => { try { const db = await openDB(); return new Promise((res, rej) => { const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get('current'); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); } catch (e) { console.error(e); return null; } };
