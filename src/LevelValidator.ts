import { BriefingContent } from './types';
import { parseTrafficProgram } from './interpreter';

export class LevelValidator {
  public static validate(levels: BriefingContent[]): string[] {
    const errors: string[] = [];

    const ids = new Set<string>();

    for (const level of levels) {
      if (ids.has(level.id)) {
        errors.push(`Duplicate level ID: ${level.id}`);
      }
      ids.add(level.id);

      // Check win conditions vs closed lanes logic
      if (level.winCondition.minPerDirection && level.closedLanes) {
        // Validation could be added here to ensure the closed lanes don't conflict
        // with the minimum cars per direction requirements if the engine doesn't handle it
      }

      // Check initial code syntax
      if (level.initialCode) {
        const result = parseTrafficProgram(level.initialCode, level.constraints);
        if (result.error) {
          errors.push(`Level ${level.id} initial code error: ${result.error}`);
        }
      }
    }

    return errors;
  }
}
