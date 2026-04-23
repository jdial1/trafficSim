import { BriefingContent, Lane, Movement } from './types';
import { LANES } from './constants';

export class LevelManager {
  private level: BriefingContent;

  constructor(level: BriefingContent) {
    this.level = level;
  }

  public static displayTitle(level: BriefingContent): string {
    if (level.isSandbox) return `SVE: ${level.title}`;
    return `Req ${level.id}: ${level.title}`;
  }

  public static isApproachFullyClosed(closedLanes: string[] | undefined, direction: 'N' | 'S' | 'E' | 'W'): boolean {
    if (!closedLanes?.length) return false;
    const dirPrefix = direction.toLowerCase() + 'b-';
    return (['left', 'thru', 'right'] as const).every((type) => closedLanes.includes(`${dirPrefix}${type}`));
  }

  // Returns all lanes that are active (not closed) in the current level
  public getActiveLanes(): Lane[] {
    if (!this.level.closedLanes) return LANES;
    return LANES.filter(lane => !this.level.closedLanes!.includes(lane.id));
  }

  // Returns true if a specific lane is closed
  public isLaneClosed(laneId: string): boolean {
    return this.level.closedLanes?.includes(laneId) ?? false;
  }

  // Returns true if an entire direction is closed
  public isDirectionClosed(direction: 'N' | 'S' | 'E' | 'W'): boolean {
    return LevelManager.isApproachFullyClosed(this.level.closedLanes, direction);
  }

  // Which directions are valid for the "Movement Builder" UI
  public getValidDirections(): ('N' | 'S' | 'E' | 'W')[] {
    const directions: ('N' | 'S' | 'E' | 'W')[] = ['N', 'S', 'E', 'W'];
    return directions.filter(dir => !this.isDirectionClosed(dir));
  }

  // Returns active movements for a specific direction (for Movement Builder)
  public getActiveMovementsForDirection(direction: 'N' | 'S' | 'E' | 'W'): Movement[] {
    const activeLanes = this.getActiveLanes().filter(lane => lane.direction === direction);
    return activeLanes.map(lane => lane.movement);
  }
}
