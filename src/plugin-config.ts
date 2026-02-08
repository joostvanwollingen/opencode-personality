import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { PluginConfig, ConfigScope } from './types.js';

export const PLUGIN_CONFIG_FILENAME = 'opencode-personality.json';
export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  selectedPersonality: null,
};

export function getGlobalConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.config', 'opencode');
}

export function getPluginConfigPath(scope: ConfigScope, directory: string, globalConfigDir?: string): string {
  if (scope === 'global') {
    const globalDir = globalConfigDir ?? getGlobalConfigDir();
    return path.join(globalDir, PLUGIN_CONFIG_FILENAME);
  }
  return path.join(directory, '.opencode', PLUGIN_CONFIG_FILENAME);
}

export function loadPluginConfig(directory: string, globalConfigDir?: string): PluginConfig {
  const globalDir = globalConfigDir ?? getGlobalConfigDir();

  // Try project first
  const projectPath = getPluginConfigPath('project', directory);
  const projectConfig = tryLoadJson<Partial<PluginConfig>>(projectPath);

  if (projectConfig !== null) {
    return { ...DEFAULT_PLUGIN_CONFIG, ...projectConfig };
  }

  // Fall back to global
  const globalPath = getPluginConfigPath('global', globalDir, globalDir);
  const globalConfig = tryLoadJson<Partial<PluginConfig>>(globalPath);

  if (globalConfig !== null) {
    return { ...DEFAULT_PLUGIN_CONFIG, ...globalConfig };
  }

  return DEFAULT_PLUGIN_CONFIG;
}

export function savePluginConfig(
  config: PluginConfig,
  scope: ConfigScope,
  directory: string,
  globalConfigDir?: string,
): void {
  const configPath = getPluginConfigPath(scope, directory, globalConfigDir);
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function tryLoadJson<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
