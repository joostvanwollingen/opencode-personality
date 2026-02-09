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
  backupPersonality,
  listBackups,
  restorePersonality,
} from '../config.js';
import { loadPluginConfig, savePluginConfig } from '../plugin-config.js';
import { validatePersonalityFile, formatValidationErrors } from '../schema.js';
import { existsSync, readFileSync } from 'node:fs';

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
    '  /personality list [--backups]              - List all available personalities or backups',
    '  /personality use <name> [--backup]         - Select and activate a personality',
    '  /personality switch <name> [--backup] [--file <path>] - Switch personality (alias for use, supports external files)',
    '  /personality create <name> [--scope global|project] [--preset-only] [--as-preset <name>] - Create new personality',
    '  /personality delete <name> [--scope global|project] - Delete a personality',
    '  /personality edit <name> [--scope global|project] [--field <name> --value <value>] [--preset <name>]',
    '  /personality show [name] [--validate]      - Show personality details (optionally validate)',
    '  /personality restore <name> [--scope global|project] - Restore personality from backup',
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
    if (parsed.flags.backups === true) {
      const backups = listBackups(projectDir, globalConfigDir);
      if (backups.length === 0) {
        output.parts.push({
          type: 'text',
          text: 'No backups available.',
        });
      } else {
        const lines = ['Available backups:'];
        for (const backup of backups) {
          const scopeLabel = backup.scope === 'project' ? ' (project)' : ' (global)';
          lines.push(`  • ${backup.name}${scopeLabel} - ${backup.createdAt}`);
        }
        lines.push('', `Total: ${backups.length} backup(s)`);
        output.parts.push({
          type: 'text',
          text: lines.join('\n'),
        });
      }
      return;
    }

    output.parts.push({
      type: 'text',
      text: buildSelectionPrompt(available, pluginConfig.selectedPersonality),
    });
    return;
  }

  if (sub === 'use' || sub === 'switch') {
    const filePath = typeof parsed.flags.file === 'string' ? parsed.flags.file : null;

    // Handle external file import
    if (filePath && sub === 'switch') {
      if (!existsSync(filePath)) {
        output.parts.push({
          type: 'text',
          text: `File not found: ${filePath}`,
        });
        return;
      }

      try {
        const fileContent = JSON.parse(readFileSync(filePath, 'utf-8')) as PersonalityFile;
        const validation = validatePersonalityFile(fileContent);

        if (!validation.valid) {
          output.parts.push({
            type: 'text',
            text: `Invalid personality file:\n${formatValidationErrors(validation)}`,
          });
          return;
        }

        const importName = nameArg || fileContent.name || 'imported';

        // Backup current personality if requested
        if (parsed.flags.backup === true && pluginConfig.selectedPersonality) {
          const backupName = backupPersonality(pluginConfig.selectedPersonality, scope, projectDir, globalConfigDir);
          if (backupName) {
            output.parts.push({
              type: 'text',
              text: `Backed up current personality to: ${backupName}`,
            });
          }
        }

        // Save imported personality and activate it
        savePersonalityFile(importName, fileContent, scope, projectDir, globalConfigDir);
        savePluginConfig({ selectedPersonality: importName }, scope, projectDir, globalConfigDir);

        output.parts.push({
          type: 'text',
          text: `Imported and activated personality: ${importName}\n\n${fileContent.description.slice(0, 100)}...`,
        });
        return;
      } catch (error) {
        output.parts.push({
          type: 'text',
          text: `Failed to import personality: ${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }
    }

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

    // Backup current personality if requested
    if (parsed.flags.backup === true && pluginConfig.selectedPersonality) {
      const backupName = backupPersonality(pluginConfig.selectedPersonality, scope, projectDir, globalConfigDir);
      if (backupName) {
        output.parts.push({
          type: 'text',
          text: `Backed up current personality to: ${backupName}`,
        });
      }
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

    const asPreset = typeof parsed.flags['as-preset'] === 'string' ? parsed.flags['as-preset'] : null;
    const presetName = asPreset || nameArg;

    // If --preset-only flag is set, we only create without activating
    if (parsed.flags['preset-only'] === true) {
      // Save a minimal personality template
      const template: PersonalityFile = {
        name: presetName,
        description: `Personality preset: ${presetName}`,
        emoji: false,
        slangIntensity: 0.5,
        mood: { enabled: false, default: 'happy', drift: 0.2, override: null, toast: true },
      };

      savePersonalityFile(presetName, template, scope, projectDir, globalConfigDir);

      output.parts.push({
        type: 'text',
        text: `Created personality preset "${presetName}" (${scope}) without activating.\n\nUse '/personality switch ${presetName}' to activate it.`,
      });
      return;
    }

    // If --as-preset flag is set, save and optionally activate
    if (asPreset) {
      // Check if we should also activate (--activate flag)
      if (parsed.flags.activate === true) {
        output.parts.push({
          type: 'text',
          text: buildCreatePrompt(nameArg, scope) + `\n\nNote: This will be saved as preset "${asPreset}" and activated automatically.`,
        });
      } else {
        // Just save as preset without activating
        const template: PersonalityFile = {
          name: asPreset,
          description: `Personality preset: ${asPreset}`,
          emoji: false,
          slangIntensity: 0.5,
          mood: { enabled: false, default: 'happy', drift: 0.2, override: null, toast: true },
        };

        savePersonalityFile(asPreset, template, scope, projectDir, globalConfigDir);

        output.parts.push({
          type: 'text',
          text: `Created personality preset "${asPreset}" (${scope}) without activating.\n\nUse '/personality switch ${asPreset}' to activate it.`,
        });
      }
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

    const validate = parsed.flags.validate === true;
    const lines: string[] = [`Personality: ${showName} (${personality.metadata.source})`];

    if (validate) {
      const validation = validatePersonalityFile(personality.personality);
      lines.push('', 'Validation: ' + (validation.valid ? '✓ Valid' : '✗ Invalid'), formatValidationErrors(validation));
    }

    lines.push('', formatConfigOutput(personality.personality));

    output.parts.push({
      type: 'text',
      text: lines.join('\n'),
    });
    return;
  }

  if (sub === 'edit') {
    // Support --preset flag to edit a specific preset (not necessarily the active one)
    const presetName = typeof parsed.flags.preset === 'string' ? parsed.flags.preset : null;
    const editName = nameArg || presetName || pluginConfig.selectedPersonality;

    if (!editName) {
      output.parts.push({
        type: 'text',
        text: `Please specify a personality name to edit.\n\nExamples:\n  /personality edit my-assistant\n  /personality edit --preset my-preset`,
      });
      return;
    }

    const personality = loadPersonality(editName, projectDir, globalConfigDir);
    if (!personality) {
      output.parts.push({
        type: 'text',
        text: `Personality "${editName}" not found.\n\n${buildSelectionPrompt(available, pluginConfig.selectedPersonality)}`,
      });
      return;
    }

    const field = typeof parsed.flags.field === 'string' ? parsed.flags.field : null;
    const value = typeof parsed.flags.value === 'string' ? parsed.flags.value : null;

    if (field && value) {
      const currentConfig = mergeWithDefaults(personality.personality);
      const nextConfig = applyFieldUpdate(currentConfig, field, value);
      savePersonalityFile(editName, nextConfig, scope, projectDir, globalConfigDir);
      output.parts.push({
        type: 'text',
        text: `Updated ${field} in ${editName} (${scope}).`,
      });
      return;
    }

    output.parts.push({
      type: 'text',
      text: buildEditPrompt(editName, scope, personality.personality),
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

  if (sub === 'restore') {
    if (!nameArg) {
      output.parts.push({
        type: 'text',
        text: `Please specify a backup name to restore.\n\nExample: /personality restore my-assistant-backup-1234567890`,
      });
      return;
    }

    const result = restorePersonality(nameArg, scope, projectDir, globalConfigDir);
    if (result.success) {
      output.parts.push({
        type: 'text',
        text: `Restored personality "${result.name}" from backup "${nameArg}" (${scope}).`,
      });
    } else {
      output.parts.push({
        type: 'text',
        text: `Failed to restore: ${result.error}`,
      });
    }
    return;
  }

  output.parts.push({
    type: 'text',
    text: `Unknown subcommand: ${sub}\n\n${buildPersonalityHelp()}`,
  });
}
