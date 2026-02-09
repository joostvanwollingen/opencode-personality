import { tool } from '@opencode-ai/plugin';
import type { ToolDefinition } from '@opencode-ai/plugin';
import type { PersonalityFile, MoodDefinition, PluginClient } from '../types.js';
import { savePersonalityFile, mergeWithDefaults, listPersonalities } from '../config.js';
import { loadPluginConfig, savePluginConfig } from '../plugin-config.js';

export function createSavePersonalityTool(
  projectDir: string,
  globalConfigDir: string,
  client: PluginClient,
): ToolDefinition {
  return tool({
    description:
      'Save a personality configuration with a name. Use this after collecting personality details from the user. Creates or updates a personality file in the personalities directory.',
    args: {
      name: tool.schema.string().describe('Name of the personality (required)'),
      description: tool.schema
        .string()
        .describe('Personality description (required) - describes how the assistant behaves'),
      emoji: tool.schema.boolean().optional().describe('Whether to use emojis in responses (default: false)'),
      slangIntensity: tool.schema
        .number()
        .optional()
        .describe('Slang usage intensity 0-1: 0=none, 0.3=light, 0.7=heavy (default: 0)'),
      moodEnabled: tool.schema.boolean().optional().describe('Enable mood drift system (default: false)'),
      moodDefault: tool.schema.string().optional().describe('Default mood name (default: happy)'),
      moodDrift: tool.schema.number().optional().describe('Mood drift amount 0-1 (default: 0.2)'),
      moodToast: tool.schema.boolean().optional().describe('Show toast notifications on mood change (default: true)'),
      moods: tool.schema
        .array(
          tool.schema.object({
            name: tool.schema.string().describe('Unique mood name'),
            hint: tool.schema.string().describe('Describe how this mood affects responses'),
            score: tool.schema.number().describe('Numeric score for drift calculations'),
          }),
        )
        .optional()
        .describe('Custom mood definitions (optional - defaults are provided)'),
      scope: tool.schema
        .enum(['project', 'global'])
        .optional()
        .describe('Where to save: project (.opencode/) or global (~/.config/opencode/)'),
      select: tool.schema
        .boolean()
        .optional()
        .describe('Select this personality as active after saving (default: true if first personality)'),
    },
    async execute(args) {
      if (!args.name || args.name.trim().length === 0) {
        return 'Error: name is required. Please provide a personality name.';
      }

      if (!args.description || args.description.trim().length === 0) {
        return 'Error: description is required. Please provide a personality description.';
      }

      const name = args.name.trim();
      const scope = args.scope ?? 'project';
      const scopePath = scope === 'global' ? globalConfigDir : projectDir;

      const config: Partial<PersonalityFile> = {
        name,
        description: args.description.trim(),
        emoji: args.emoji ?? false,
        slangIntensity: args.slangIntensity ?? 0,
        mood: {
          enabled: args.moodEnabled ?? false,
          default: args.moodDefault ?? 'happy',
          override: null,
          drift: args.moodDrift ?? 0.2,
          toast: args.moodToast ?? true,
        },
      };

      if (args.moods && args.moods.length > 0) {
        config.moods = args.moods as MoodDefinition[];
      }

      const merged = mergeWithDefaults(config);

      // Save the personality file
      savePersonalityFile(name, merged, scope, projectDir, globalConfigDir);

      // Check if we should auto-select this personality
      const available = listPersonalities(projectDir, globalConfigDir);
      const pluginConfig = loadPluginConfig(projectDir, globalConfigDir);
      const shouldSelect = args.select ?? (available.length === 1 && pluginConfig.selectedPersonality === null);

      if (shouldSelect) {
        savePluginConfig({ selectedPersonality: name }, scope, projectDir, globalConfigDir);
        await client.tui.showToast({
          body: {
            title: 'Personality Saved & Selected',
            message: `"${name}" saved to ${scope} and activated`,
            variant: 'success',
          },
        });
      } else {
        await client.tui.showToast({
          body: {
            title: 'Personality Saved',
            message: `"${name}" saved to ${scope}`,
            variant: 'success',
          },
        });
      }

      return `Personality "${name}" saved to ${scope} (${scopePath}/personalities/${name}.json)`;
    },
  });
}
