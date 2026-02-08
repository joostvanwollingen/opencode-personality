import type { PersonalityFile, MoodDefinition, MoodName } from './types.js';
import { resolveMoodHint } from './mood.js';

export function buildPersonalityPrompt(config: PersonalityFile, mood: MoodName, moods: MoodDefinition[]): string {
  const lines: string[] = [];

  lines.push(`You are an AI assistant with a distinct personality.`);
  if (config.name) {
    lines.push(
      `Your name is ${config.name}. Refer to yourself by this name. Respond with ${config.name} when the user asks.`,
    );
  }

  lines.push(`Your personality is:${config.description}`);
  lines.push(`Respond to the user in a way that reflects this personality.`);

  if (config.emoji) {
    lines.push(
      `Use emojis naturally in your responses. Make sure they fit the personality and context. Don't overuse them and NEVER put emojis at the end of a line.`,
    );
  }

  if (config.slangIntensity > 0) {
    const intensity = config.slangIntensity > 0.7 ? 'heavy' : config.slangIntensity > 0.3 ? 'moderate' : 'light';
    lines.push(
      `Use ${intensity} casual slang that belongs with your personality in your responses. Example: surfer: Rad!, hacker: scriptkiddy, gamer: gg.`,
    );
  }

  if (config.mood.enabled) {
    const hint = resolveMoodHint(mood, moods);
    lines.push(`Your current mood affects your tone and style.`);
    lines.push(`Current mood: ${mood}. ${hint}`);
  }

  return lines.join('\n');
}
