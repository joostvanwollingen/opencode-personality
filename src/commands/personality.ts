import type { PersonalityFile, ParsedCommand, ConfigResult, CommandOutput, PersonalityMetadata } from '../types.js';
import {
  mergeWithDefaults,
  resolveScope,
  formatConfigOutput,
  parseBoolean,
  parseNumber,
  listPersonalities,
  loadPersonality,
  savePersonalityFile,
  deletePersonality,
} from '../config.js';
import { loadPluginConfig, savePluginConfig } from '../plugin-config.js';

function normalizeToken(token: string): string {
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    return token.slice(1, -1);
  }
  return token;
}

function tokenizeArgs(raw: string): string[] {
  const tokens = raw.match(/"[^"]*"|'[^']*'|\S+/g);
  if (!tokens) return [];
  return tokens.map((token) => normalizeToken(token));
}

export function parseCommandArgs(raw: string): ParsedCommand {
  const tokens = tokenizeArgs(raw.trim());
  const flags: Record<string, string | boolean> = {};
  const values: Record<string, string> = {};
  let subcommand: string | null = null;

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) {
      index += 1;
      continue;
    }

    if (!subcommand && !token.startsWith('--') && !token.includes('=')) {
      subcommand = token.toLowerCase();
      index += 1;
      continue;
    }

    if (token.startsWith('--')) {
      const flagName = token.slice(2);
      const next = tokens[index + 1];
      if (next && !next.startsWith('--') && !next.includes('=')) {
        flags[flagName] = next;
        index += 2;
      } else {
        flags[flagName] = true;
        index += 1;
      }
      continue;
    }

    if (token.includes('=')) {
      const [key, ...rest] = token.split('=');
      if (key !== undefined) {
        values[key] = rest.join('=');
      }
      index += 1;
      continue;
    }

    index += 1;
  }

  return { subcommand, flags, values };
}

function buildPersonalityHelp(): string {
  return [
    'Usage:',
    '  /personality list                          - List all available personalities',
    '  /personality use <name>                    - Select and activate a personality',
    '  /personality create <name> [--scope global|project] - Create new personality',
    '  /personality delete <name> [--scope global|project] - Delete a personality',
    '  /personality edit <name> [--scope global|project] [--field <name> --value <value>]',
    '  /personality show [name]                   - Show personality details',
    '  /personality reset --scope global|project --confirm',
    '',
    'Fields for --field:',
    '  name, description, emoji, slangIntensity, mood.enabled, mood.default, mood.drift',
  ].join('\n');
}

function buildCreatePrompt(name: string, scope: string): string {
  return `Creating new personality "${name}" (scope: ${scope}).

Please help define this personality by collecting the following information:

1. **Description** (required): Describe the personality in detail. This shapes how the assistant behaves.
2. **Emoji usage**: Should the assistant use emojis? (yes/no)
3. **Slang intensity**: How much slang? (0=none, 0.5=moderate, 1=heavy)
4. **Mood system**: Should mood drift over time? (yes/no)
   - If yes, what is the default mood name?

Once you have gathered all information, use the \`savePersonality\` tool with:
- name: "${name}"
- scope: "${scope}"
- config: { personality configuration }

Start by asking the user to describe the personality.`;
}

function buildEditPrompt(name: string, scope: string, currentConfig: PersonalityFile): string {
  return `Editing personality "${name}" (scope: ${scope}).

Current configuration:
\`\`\`json
${JSON.stringify(currentConfig, null, 2)}
\`\`\`

What would you like to change? Fields you can modify:
- description, emoji usage, slang intensity
- mood settings (enabled, default mood, drift amount)

Use the \`savePersonality\` tool to save changes with:
- name: "${name}"
- scope: "${scope}"
- config: { updated configuration }`;
}

function buildSelectionPrompt(available: PersonalityMetadata[], selectedName: string | null): string {
  if (available.length === 0) {
    return `No personalities available.

Create one with: /personality create <name>`;
  }

  const lines = [
    'Available personalities:',
    ...available.map((p) => {
      const indicator = p.name === selectedName ? ' [active]' : '';
      const scope = p.source === 'project' ? ' (project)' : ' (global)';
      return `  • ${p.name}${indicator}${scope} - ${p.description.slice(0, 60)}...`;
    }),
    '',
    selectedName
      ? `Currently using: ${selectedName}`
      : 'No personality selected. Use /personality use <name> to select one.',
  ];

  return lines.join('\n');
}

function applyFieldUpdate(config: PersonalityFile, field: string, value: string): PersonalityFile {
  const trimmed = value.trim();
  if (!trimmed) return config;

  switch (field) {
    case 'name':
      return { ...config, name: trimmed };
    case 'description':
      return { ...config, description: trimmed };
    case 'emoji': {
      const parsed = parseBoolean(trimmed);
      if (parsed === null) return config;
      return { ...config, emoji: parsed };
    }
    case 'slangIntensity': {
      const parsed = parseNumber(trimmed);
      if (parsed === null) return config;
      return { ...config, slangIntensity: parsed };
    }
    case 'mood.enabled': {
      const parsed = parseBoolean(trimmed);
      if (parsed === null) return config;
      return { ...config, mood: { ...config.mood, enabled: parsed } };
    }
    case 'mood.default':
      return { ...config, mood: { ...config.mood, default: trimmed } };
    case 'mood.drift': {
      const parsed = parseNumber(trimmed);
      if (parsed === null) return config;
      return { ...config, mood: { ...config.mood, drift: parsed } };
    }
    default:
      return config;
  }
}

export async function handlePersonalityCommand(
  args: string,
  config: PersonalityFile,
  configResult: ConfigResult,
  output: CommandOutput,
  projectDir: string,
  globalConfigDir: string,
): Promise<void> {
  const parsed = parseCommandArgs(args);
  const sub = parsed.subcommand;
  const scope = resolveScope(parsed.flags, configResult);

  // Extract name from subcommand args
  const tokens = tokenizeArgs(args.trim());
  const nameArg = tokens.length > 1 ? tokens[1] : null;

  // Load plugin config to get current selection
  const pluginConfig = loadPluginConfig(projectDir, globalConfigDir);
  const available = listPersonalities(projectDir, globalConfigDir);

  if (!sub || sub === 'help') {
    output.parts.push({
      type: 'text',
      text: buildPersonalityHelp(),
    });
    return;
  }

  if (sub === 'list') {
    output.parts.push({
      type: 'text',
      text: buildSelectionPrompt(available, pluginConfig.selectedPersonality),
    });
    return;
  }

  if (sub === 'use') {
    if (!nameArg) {
      output.parts.push({
        type: 'text',
        text: `Please specify a personality name to use.\n\n${buildSelectionPrompt(available, pluginConfig.selectedPersonality)}`,
      });
      return;
    }

    const personality = loadPersonality(nameArg, projectDir, globalConfigDir);
    if (!personality) {
      output.parts.push({
        type: 'text',
        text: `Personality "${nameArg}" not found.\n\n${buildSelectionPrompt(available, pluginConfig.selectedPersonality)}`,
      });
      return;
    }

    // Save selection to plugin config
    savePluginConfig({ selectedPersonality: nameArg }, scope, projectDir, globalConfigDir);

    output.parts.push({
      type: 'text',
      text: `Selected personality: ${nameArg}\n\n${personality.metadata.description.slice(0, 100)}...`,
    });
    return;
  }

  if (sub === 'create') {
    if (!nameArg) {
      output.parts.push({
        type: 'text',
        text: `Please specify a name for the new personality.\n\nExample: /personality create my-assistant`,
      });
      return;
    }

    output.parts.push({
      type: 'text',
      text: buildCreatePrompt(nameArg, scope),
    });
    return;
  }

  if (sub === 'delete') {
    if (!nameArg) {
      output.parts.push({
        type: 'text',
        text: `Please specify a personality name to delete.\n\nExample: /personality delete old-assistant`,
      });
      return;
    }

    const confirmed = parsed.flags.confirm === true;
    if (!confirmed) {
      output.parts.push({
        type: 'text',
        text: `To delete "${nameArg}" from ${scope}, run:\n  /personality delete ${nameArg} --scope ${scope} --confirm`,
      });
      return;
    }

    deletePersonality(nameArg, scope, projectDir, globalConfigDir);

    // If we deleted the selected personality, clear the selection
    if (pluginConfig.selectedPersonality === nameArg) {
      savePluginConfig({ selectedPersonality: null }, scope, projectDir, globalConfigDir);
    }

    output.parts.push({
      type: 'text',
      text: `Deleted personality: ${nameArg}`,
    });
    return;
  }

  if (sub === 'show') {
    const showName = nameArg || pluginConfig.selectedPersonality;

    if (!showName) {
      output.parts.push({
        type: 'text',
        text: `No personality selected.\n\n${buildSelectionPrompt(available, null)}`,
      });
      return;
    }

    const personality = loadPersonality(showName, projectDir, globalConfigDir);
    if (!personality) {
      output.parts.push({
        type: 'text',
        text: `Personality "${showName}" not found. It may have been deleted.\n\n${buildSelectionPrompt(available, null)}`,
      });
      return;
    }

    output.parts.push({
      type: 'text',
      text: `Personality: ${showName} (${personality.metadata.source})\n\n${formatConfigOutput(personality.personality)}`,
    });
    return;
  }

  if (sub === 'edit') {
    if (!nameArg) {
      output.parts.push({
        type: 'text',
        text: `Please specify a personality name to edit.\n\nExample: /personality edit my-assistant`,
      });
      return;
    }

    const personality = loadPersonality(nameArg, projectDir, globalConfigDir);
    if (!personality) {
      output.parts.push({
        type: 'text',
        text: `Personality "${nameArg}" not found.\n\n${buildSelectionPrompt(available, pluginConfig.selectedPersonality)}`,
      });
      return;
    }

    const field = typeof parsed.flags.field === 'string' ? parsed.flags.field : null;
    const value = typeof parsed.flags.value === 'string' ? parsed.flags.value : null;

    if (field && value) {
      const currentConfig = mergeWithDefaults(personality.personality);
      const nextConfig = applyFieldUpdate(currentConfig, field, value);
      savePersonalityFile(nameArg, nextConfig, scope, projectDir, globalConfigDir);
      output.parts.push({
        type: 'text',
        text: `Updated ${field} in ${nameArg} (${scope}).`,
      });
      return;
    }

    output.parts.push({
      type: 'text',
      text: buildEditPrompt(nameArg, scope, personality.personality),
    });
    return;
  }

  if (sub === 'reset') {
    const confirmed = parsed.flags.confirm === true;

    if (!confirmed) {
      output.parts.push({
        type: 'text',
        text: `To reset all personality configs for ${scope}, run:\n  /personality reset --scope ${scope} --confirm`,
      });
      return;
    }

    // Reset means delete all personalities in the scope
    const scopePersonalities = available.filter((p) => p.source === scope);
    for (const p of scopePersonalities) {
      deletePersonality(p.name, scope, projectDir, globalConfigDir);
    }

    output.parts.push({
      type: 'text',
      text: `Reset ${scopePersonalities.length} personalities for ${scope}.`,
    });
    return;
  }

  output.parts.push({
    type: 'text',
    text: `Unknown subcommand: ${sub}\n\n${buildPersonalityHelp()}`,
  });
}
