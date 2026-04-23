import { BASE_SPAWN_RATE } from './constants';
import { LevelManager } from './LevelManager';
import { Phase, ConditionalRule } from './interpreter';
import { BriefingContent, Movement } from './types';

const COMPASS_LONG: Record<'N' | 'S' | 'E' | 'W', string> = {
  N: 'North',
  S: 'South',
  E: 'East',
  W: 'West',
};

const TRAFFIC_ASYMMETRY_RATIO = 1.35;
const TRAFFIC_BASELINE_HIGH = 1.08;

function formatApproachesPhrase(dirs: ('N' | 'S' | 'E' | 'W')[]): string {
  const names = dirs.map((d) => `${COMPASS_LONG[d]}bound`);
  if (names.length === 1) return `${names[0]} approach`;
  if (names.length === 2) return `${names[0]} and ${names[1]} approaches`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} approaches`;
}

export function briefingTrafficAlertBullets(level: BriefingContent): string[] {
  const wIn = level.trafficWeights;
  if (!wIn) return [];

  const closed = level.closedLanes ?? [];
  const openDirs = (['N', 'S', 'E', 'W'] as const).filter(
    (d) => !LevelManager.isApproachFullyClosed(closed, d),
  );
  if (openDirs.length === 0) return [];

  const w = (d: 'N' | 'S' | 'E' | 'W') => wIn[d] ?? 1;
  const values = openDirs.map((d) => w(d));
  const minW = Math.min(...values);
  const maxW = Math.max(...values);
  if (minW <= 0) return [];

  const spread = maxW / minW;

  if (spread >= TRAFFIC_ASYMMETRY_RATIO) {
    const heavy = openDirs.filter((d) => w(d) / minW >= TRAFFIC_ASYMMETRY_RATIO);
    const byPct = new Map<number, ('N' | 'S' | 'E' | 'W')[]>();
    for (const d of heavy) {
      const pct = Math.round((w(d) / minW) * 100);
      const list = byPct.get(pct) ?? [];
      list.push(d);
      byPct.set(pct, list);
    }
    const lines: string[] = [];
    for (const [pct, dirs] of [...byPct.entries()].sort((a, b) => b[0] - a[0])) {
      dirs.sort((a, b) => openDirs.indexOf(a) - openDirs.indexOf(b));
      lines.push(
        `[TRAFFIC ALERT] ${pct}% volume detected on ${formatApproachesPhrase(dirs)}.`,
      );
    }
    return lines;
  }

  const ref = values[0];
  const symmetric = values.every((v) => Math.abs(v - ref) < 1e-9);
  if (symmetric && ref >= TRAFFIC_BASELINE_HIGH) {
    const pct = Math.round(ref * 100);
    return [
      `[TRAFFIC ALERT] ${pct}% baseline volume detected on ${formatApproachesPhrase(openDirs)}.`,
    ];
  }

  return [];
}

export function trafficRatesFromBriefing(level: BriefingContent): Record<'N' | 'S' | 'E' | 'W', number> {
  const closed = level.closedLanes ?? [];
  const weights = level.trafficWeights ?? { N: 1, S: 1, E: 1, W: 1 };
  const base = BASE_SPAWN_RATE;
  return {
    N: LevelManager.isApproachFullyClosed(closed, 'N') ? 0 : base * (weights.N ?? 1),
    S: LevelManager.isApproachFullyClosed(closed, 'S') ? 0 : base * (weights.S ?? 1),
    E: LevelManager.isApproachFullyClosed(closed, 'E') ? 0 : base * (weights.E ?? 1),
    W: LevelManager.isApproachFullyClosed(closed, 'W') ? 0 : base * (weights.W ?? 1),
  };
}

function briefingJoinedText(level: BriefingContent): string {
  return [level.subject, level.body, ...level.bullets].join('\n');
}

export function briefingRequiresExclusivePedestrianPhase(level: BriefingContent): boolean {
  return briefingJoinedText(level).includes('EXCLUSIVE_PEDESTRIAN_PHASE');
}

export function briefingRequiredMinYieldMovements(level: BriefingContent): number | null {
  const t = briefingJoinedText(level);
  if (/\b(?:minimum|at least)\s+two\s+movements\b/i.test(t) && /\.YIELD\b/i.test(t)) return 2;
  return null;
}

export function programMeetsBriefingDirectives(
  level: BriefingContent,
  phases: Phase[],
  rules: ConditionalRule[],
): boolean {
  if (briefingRequiresExclusivePedestrianPhase(level)) {
    const ok = phases.some((p) =>
      p.commands.some(
        (c) =>
          c.action === 'GO' &&
          c.target >= Movement.CROSSWALK_NORTH &&
          c.target <= Movement.CROSSWALK_WEST,
      ),
    );
    if (!ok) return false;
  }
  const minY = briefingRequiredMinYieldMovements(level);
  if (minY != null) {
    const yieldTargets = new Set<Movement>();
    for (const p of phases) {
      for (const c of p.commands) {
        if (c.action === 'YIELD') yieldTargets.add(c.target);
      }
    }
    for (const r of rules) {
      for (const c of r.insertCommands) {
        if (c.action === 'YIELD') yieldTargets.add(c.target);
      }
    }
    if (yieldTargets.size < minY) return false;
  }
  return true;
}

export function hasNonDefaultTrafficWeights(level: BriefingContent): boolean {
  const w = level.trafficWeights;
  if (!w) return false;
  return (['N', 'S', 'E', 'W'] as const).some((k) => (w[k] ?? 1) !== 1);
}

export class BriefingParser {
  public static parse(
    content: string, 
    dynamicValues: Record<string, string | number>
  ): string {
    let result = content;
    for (const [key, value] of Object.entries(dynamicValues)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  public static parseBriefing(
    briefing: BriefingContent, 
    dynamicValues: Record<string, string | number>
  ): BriefingContent {
    const bullets = briefing.bullets.map((b) => this.parse(b, dynamicValues));
    const alerts = briefingTrafficAlertBullets(briefing).map((b) => this.parse(b, dynamicValues));
    let merged = bullets;
    if (alerts.length > 0) {
      merged = [...bullets];
      const insertAt =
        merged.length > 0 && /^\[GOAL\]/i.test(merged[0].trimStart()) ? 1 : 0;
      merged.splice(insertAt, 0, ...alerts);
    }
    return {
      ...briefing,
      body: this.parse(briefing.body, dynamicValues),
      bullets: merged,
      bureauMemo: briefing.bureauMemo ? this.parse(briefing.bureauMemo, dynamicValues) : undefined,
    };
  }
}
