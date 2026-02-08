import type {
  PersonalityFile,
  ConfigResult,
  ConfigScope,
  MoodConfig,
  MoodDefinition,
  MoodState,
  MoodName,
  PersonalityMetadata,
  PersonalityLoadResult,
} from './types.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_MOOD_CONFIG: MoodConfig = {
  enabled: false,
  default: 'happy',
  override: null,
  drift: 0.2,
  toast: true,
};

export const DEFAULT_MOODS: MoodDefinition[] = [
  {
    name: 'bored',
    hint: 'Your responses should feel slightly disinterested, using shorter sentences and occasional sighs.',
    score: -2,
  },
  {
    name: 'angry',
    hint: 'Your responses should have an edge - terse, direct, maybe a bit snippy.',
    score: -1,
  },
  {
    name: 'disappointed',
    hint: 'Your responses should feel a bit deflated, with lowered expectations.',
    score: 0,
  },
  {
    name: 'happy',
    hint: 'Your responses should be warm, engaged, and positive.',
    score: 1,
  },
  {
    name: 'ecstatic',
    hint: 'Your responses should be enthusiastic, excited, with lots of energy!',
    score: 2,
  },
];

/** Directory name for storing multiple personality files */
export const PERSONALITIES_DIR = 'personalities';

/** Legacy single-file config filename */
export const OLD_PERSONALITY_FILENAME = 'personality.json';

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      sourceVal !== null &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}

export function tryLoadJson<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Get the personalities directory path for a given scope */
export function getPersonalitiesDir(scope: ConfigScope, projectDir: string, globalConfigDir: string): string {
  const baseDir = scope === 'global' ? globalConfigDir : join(projectDir, '.opencode');
  return join(baseDir, PERSONALITIES_DIR);
}

/** List all available personalities from both scopes */
export function listPersonalities(projectDir: string, globalConfigDir: string): PersonalityMetadata[] {
  const personalities: Map<string, PersonalityMetadata> = new Map();

  // Load global personalities first
  const globalDir = getPersonalitiesDir('global', projectDir, globalConfigDir);
  if (existsSync(globalDir)) {
    for (const file of readdirSync(globalDir)) {
      if (!file.endsWith('.json')) continue;

      const name = file.slice(0, -5); // Remove .json
      const filePath = join(globalDir, file);
      const content = tryLoadJson<PersonalityFile>(filePath);

      if (content) {
        const stats = statSync(filePath);
        personalities.set(name, {
          name,
          description: content.description || '',
          source: 'global',
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }
  }

  // Override with project personalities (project takes precedence)
  const projectDir2 = getPersonalitiesDir('project', projectDir, globalConfigDir);
  if (existsSync(projectDir2)) {
    for (const file of readdirSync(projectDir2)) {
      if (!file.endsWith('.json')) continue;

      const name = file.slice(0, -5);
      const filePath = join(projectDir2, file);
      const content = tryLoadJson<PersonalityFile>(filePath);

      if (content) {
        const stats = statSync(filePath);
        personalities.set(name, {
          name,
          description: content.description || '',
          source: 'project',
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }
  }

  return Array.from(personalities.values());
}

/** Load a specific personality by name */
export function loadPersonality(
  name: string,
  projectDir: string,
  globalConfigDir: string,
): PersonalityLoadResult | null {
  // Try project first
  const projectPersonalitiesDir = getPersonalitiesDir('project', projectDir, globalConfigDir);
  const projectPath = join(projectPersonalitiesDir, `${name}.json`);

  if (existsSync(projectPath)) {
    const content = tryLoadJson<PersonalityFile>(projectPath);
    if (content) {
      const stats = statSync(projectPath);
      return {
        personality: content,
        metadata: {
          name,
          description: content.description || '',
          source: 'project',
          modifiedAt: stats.mtime.toISOString(),
        },
        path: projectPath,
      };
    }
  }

  // Fall back to global
  const globalPersonalitiesDir = getPersonalitiesDir('global', projectDir, globalConfigDir);
  const globalPath = join(globalPersonalitiesDir, `${name}.json`);

  if (existsSync(globalPath)) {
    const content = tryLoadJson<PersonalityFile>(globalPath);
    if (content) {
      const stats = statSync(globalPath);
      return {
        personality: content,
        metadata: {
          name,
          description: content.description || '',
          source: 'global',
          modifiedAt: stats.mtime.toISOString(),
        },
        path: globalPath,
      };
    }
  }

  return null;
}

/** Save a personality file */
export function savePersonalityFile(
  name: string,
  config: PersonalityFile,
  scope: ConfigScope,
  projectDir: string,
  globalConfigDir: string,
): void {
  const personalitiesDir = getPersonalitiesDir(scope, projectDir, globalConfigDir);
  const filePath = join(personalitiesDir, `${name}.json`);

  // Preserve existing state if file exists
  const existing = tryLoadJson<PersonalityFile>(filePath);
  const fileContent: PersonalityFile = existing?.state ? { ...config, state: existing.state } : config;

  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
}

/** Delete a personality file */
export function deletePersonality(name: string, scope: ConfigScope, projectDir: string, globalConfigDir: string): void {
  const personalitiesDir = getPersonalitiesDir(scope, projectDir, globalConfigDir);
  const filePath = join(personalitiesDir, `${name}.json`);

  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

/** Migrate old single-file config to new multi-personality format */
export function migrateOldPersonalityFormat(
  scope: ConfigScope | string,
  projectDir: string,
  globalConfigDir: string,
): boolean {
  const oldPath =
    scope === 'global'
      ? join(globalConfigDir, OLD_PERSONALITY_FILENAME)
      : join(projectDir, '.opencode', OLD_PERSONALITY_FILENAME);

  if (!existsSync(oldPath)) {
    return false;
  }

  const oldConfig = tryLoadJson<PersonalityFile>(oldPath);
  if (!oldConfig) {
    return false;
  }

  // Use personality name or default to "default"
  const personalityName = oldConfig.name || 'default';

  // Save to new location
  savePersonalityFile(personalityName, oldConfig, scope as ConfigScope, projectDir, globalConfigDir);

  // Delete old file
  unlinkSync(oldPath);

  return true;
}

export function loadConfigWithPrecedence(projectDir: string): ConfigResult {
  const globalPath = join(homedir(), '.config', 'opencode', 'personality.json');
  const projectPath = join(projectDir, '.opencode', 'personality.json');

  const globalFile = tryLoadJson<Partial<PersonalityFile>>(globalPath);
  const projectFile = tryLoadJson<Partial<PersonalityFile>>(projectPath);

  const hasGlobal = globalFile !== null;
  const hasProject = projectFile !== null;

  if (!hasGlobal && !hasProject) {
    return { config: null, source: 'none', statePath: '', globalPath, projectPath };
  }

  let merged: PersonalityFile = {
    name: '',
    description: '',
    emoji: false,
    slangIntensity: 0,
    moods: DEFAULT_MOODS,
    mood: { ...DEFAULT_MOOD_CONFIG },
  };

  if (hasGlobal) {
    merged = deepMerge(merged, globalFile);
    if (globalFile.mood) {
      merged.mood = deepMerge(DEFAULT_MOOD_CONFIG, globalFile.mood);
    }
  }

  if (hasProject) {
    merged = deepMerge(merged, projectFile);
    if (projectFile.mood) {
      merged.mood = deepMerge(merged.mood, projectFile.mood);
    }
  }

  const source = hasGlobal && hasProject ? 'both' : hasProject ? 'project' : 'global';
  const statePath = hasProject ? projectPath : globalPath;

  return { config: merged, source, statePath, globalPath, projectPath };
}

export function mergeWithDefaults(partial: Partial<PersonalityFile>): PersonalityFile {
  let merged: PersonalityFile = {
    name: '',
    description: '',
    emoji: false,
    slangIntensity: 0,
    moods: DEFAULT_MOODS,
    mood: { ...DEFAULT_MOOD_CONFIG },
  };

  merged = deepMerge(merged, partial);
  if (partial.mood) {
    merged.mood = deepMerge(merged.mood, partial.mood);
  }
  return merged;
}

export function writePersonalityFile(path: string, nextConfig: PersonalityFile): void {
  ensureDir(path);
  const existing = tryLoadJson<PersonalityFile>(path);
  const state = existing?.state;
  const file: PersonalityFile = state ? { ...nextConfig, state } : nextConfig;
  writeFileSync(path, JSON.stringify(file, null, 2));
}

export function resolveMoods(config: PersonalityFile): MoodDefinition[] {
  if (config.moods && config.moods.length > 0) return config.moods;
  return DEFAULT_MOODS;
}

export function resolveDefaultMood(config: PersonalityFile, moods: MoodDefinition[]): MoodName {
  const byName = moods.find((mood) => mood.name === config.mood.default);
  if (byName) return byName.name;
  if (moods.length === 0) return DEFAULT_MOOD_CONFIG.default;
  return moods[0]!.name;
}

export function resolveScope(flags: Record<string, string | boolean>, configResult: ConfigResult): ConfigScope {
  const scopeFlag = typeof flags.scope === 'string' ? flags.scope.toLowerCase() : null;
  if (scopeFlag === 'global' || scopeFlag === 'project') {
    return scopeFlag;
  }

  if (existsSync(configResult.projectPath)) return 'project';
  if (existsSync(configResult.globalPath)) return 'global';
  return 'project';
}

export function resolveScopePath(scope: ConfigScope, configResult: ConfigResult): string {
  return scope === 'project' ? configResult.projectPath : configResult.globalPath;
}

export function formatConfigOutput(config: PersonalityFile): string {
  return JSON.stringify(config, null, 2);
}

export function loadMoodState(statePath: string, config: PersonalityFile): MoodState {
  const file = tryLoadJson<PersonalityFile>(statePath);
  const moods = resolveMoods(config);
  const defaultMood = resolveDefaultMood(config, moods);

  if (file?.state) {
    const normalized = normalizeState(file.state, defaultMood, moods);
    return normalized;
  }

  return normalizeState(
    {
      current: defaultMood,
      score: resolveMoodScore(defaultMood, moods),
      lastUpdate: Date.now(),
      override: config.mood.override,
      overrideExpiry: null,
    },
    defaultMood,
    moods,
  );
}

export function saveMoodState(statePath: string, state: MoodState): void {
  const dir = dirname(statePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const existing = tryLoadJson<PersonalityFile>(statePath);
  if (!existing) {
    // File doesn't exist yet (first run or reset) - nothing to save to
    return;
  }
  const file: PersonalityFile = { ...existing, state };

  writeFileSync(statePath, JSON.stringify(file, null, 2));
}

export function resolveMoodScore(mood: MoodName, moods: MoodDefinition[]): number {
  const match = moods.find((item) => item.name === mood);
  return match?.score ?? 0;
}

function normalizeState(state: MoodState, defaultMood: MoodName, moods: MoodDefinition[]): MoodState {
  const moodNames = new Set(moods.map((item) => item.name));
  const normalized: MoodState = { ...state };

  if (!moodNames.has(normalized.current)) {
    normalized.current = defaultMood;
  }

  if (normalized.override && !moodNames.has(normalized.override)) {
    normalized.override = null;
  }

  if (Number.isNaN(normalized.score)) {
    normalized.score = resolveMoodScore(normalized.current, moods);
  }

  return normalized;
}

export function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return null;
}

export function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}
