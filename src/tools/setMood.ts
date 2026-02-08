import { tool } from '@opencode-ai/plugin';
import type { PersonalityFile, MoodDefinition, PluginClient, MoodDuration } from '../types.js';
import { loadMoodState, saveMoodState } from '../config.js';

export function createSetMoodTool(
  statePath: string,
  config: PersonalityFile,
  moods: MoodDefinition[],
  client: PluginClient,
) {
  return tool({
    description: "Set the assistant's current mood",
    args: {
      mood: tool.schema.string().describe('The mood to set'),
      duration: tool.schema
        .enum(['message', 'session', 'permanent'])
        .optional()
        .describe(
          'How long the override lasts: message (next response only), session (until session ends), permanent (persists across sessions)',
        ),
    },
    async execute(args) {
      const state = loadMoodState(statePath, config);

      if (!moods.some((item) => item.name === args.mood)) {
        return `Invalid mood. Choose from: ${moods.map((item) => item.name).join(', ')}`;
      }

      state.override = args.mood;
      if (args.duration === 'message') {
        state.overrideExpiry = Date.now() + 1;
      } else {
        state.overrideExpiry = null;
      }
      state.current = args.mood;

      saveMoodState(statePath, state);

      await client.app.log({
        body: {
          service: 'personality-plugin',
          level: 'info',
          message: `Mood set to ${args.mood} (duration: ${(args.duration as MoodDuration) ?? 'session'})`,
        },
      });

      return `Mood changed to ${args.mood}`;
    },
  });
}
