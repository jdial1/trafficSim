import { BriefingContent } from './types';

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
    return {
      ...briefing,
      body: this.parse(briefing.body, dynamicValues),
      bullets: briefing.bullets.map(b => this.parse(b, dynamicValues)),
    };
  }
}
