import type {
  PersonalityDefinition,
  PersonalityFile,
  LegacyPersonalityFile,
  ConfigResult,
  ConfigScope,
  MoodConfig,
  MoodDefinition,
  MoodState,
  MoodName,
} from "./types.js"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

// --- Constants ---

export const DEFAULT_MOOD_CONFIG: MoodConfig = {
  enabled: false,
  default: "happy",
  override: null,
  drift: 0.2,
  toast: true,
}

export const DEFAULT_MOODS: MoodDefinition[] = [
  {
    name: "bored",
    hint: "Your responses should feel slightly disinterested, using shorter sentences and occasional sighs.",
    score: -2,
  },
  {
    name: "angry",
    hint: "Your responses should have an edge - terse, direct, maybe a bit snippy.",
    score: -1,
  },
  {
    name: "disappointed",
    hint: "Your responses should feel a bit deflated, with lowered expectations.",
    score: 0,
  },
  {
    name: "happy",
    hint: "Your responses should be warm, engaged, and positive.",
    score: 1,
  },
  {
    name: "ecstatic",
    hint: "Your responses should be enthusiastic, excited, with lots of energy!",
    score: 2,
  },
]

// --- Generic helpers ---

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target }
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key]
    const targetVal = target[key]
    if (
      sourceVal !== undefined &&
      typeof sourceVal === "object" &&
      sourceVal !== null &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === "object" &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      ) as T[keyof T]
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T]
    }
  }
  return result
}

export function tryLoadJson<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as T
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return null
    }
    throw error
  }
}

export function ensureDir(path: string): void {
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

// --- Legacy migration ---

/**
 * Detect whether a parsed JSON object is in legacy single-personality format
 */
export function isLegacyFormat(data: Record<string, unknown>): boolean {
  return "description" in data && !("personalities" in data)
}

/**
 * Convert a legacy single-personality file to multi-personality format
 */
export function migrateLegacyToMulti(legacy: LegacyPersonalityFile): PersonalityFile {
  const { state, ...definition } = legacy
  const key = definition.name?.trim() || "default"
  const result: PersonalityFile = {
    active: key,
    personalities: { [key]: definition },
  }
  if (state) {
    result.states = { [key]: state }
  }
  return result
}

// --- Multi-personality operations ---

/**
 * Get the active personality definition from a multi-personality file
 */
export function getActivePersonality(file: PersonalityFile): PersonalityDefinition | null {
  return file.personalities[file.active] ?? null
}

/**
 * List all personality names in a file
 */
export function listPersonalities(file: PersonalityFile): string[] {
  return Object.keys(file.personalities)
}

/**
 * Add or update a personality in the file (pure — returns new file)
 */
export function addPersonality(
  file: PersonalityFile,
  key: string,
  definition: PersonalityDefinition
): PersonalityFile {
  return {
    ...file,
    personalities: { ...file.personalities, [key]: definition },
  }
}

/**
 * Remove a personality from the file. Returns null if last personality removed.
 */
export function removePersonality(file: PersonalityFile, key: string): PersonalityFile | null {
  const remaining: Record<string, PersonalityDefinition> = {}
  for (const [k, v] of Object.entries(file.personalities)) {
    if (k !== key) remaining[k] = v
  }

  const remainingKeys = Object.keys(remaining)
  if (remainingKeys.length === 0) return null

  const newStates: Record<string, MoodState> = {}
  if (file.states) {
    for (const [k, v] of Object.entries(file.states)) {
      if (k !== key) newStates[k] = v
    }
  }

  const result: PersonalityFile = {
    active: file.active === key ? remainingKeys[0]! : file.active,
    personalities: remaining,
  }
  if (Object.keys(newStates).length > 0) {
    result.states = newStates
  }
  return result
}

/**
 * Switch the active personality (pure — returns new file or null if name not found)
 */
export function switchActivePersonality(
  file: PersonalityFile,
  name: string
): PersonalityFile | null {
  if (!(name in file.personalities)) return null
  return { ...file, active: name }
}

// --- File loading ---

/**
 * Load a personality file from disk, normalizing legacy format to multi-personality
 */
export function loadPersonalityFile(path: string): PersonalityFile | null {
  const raw = tryLoadJson<Record<string, unknown>>(path)
  if (!raw) return null

  if (isLegacyFormat(raw)) {
    return migrateLegacyToMulti(raw as unknown as LegacyPersonalityFile)
  }

  return raw as unknown as PersonalityFile
}

// --- Config loading with precedence ---

export function loadConfigWithPrecedence(projectDir: string): ConfigResult {
  const globalPath = join(homedir(), ".config", "opencode", "personality.json")
  const projectPath = join(projectDir, ".opencode", "personality.json")

  const globalFile = loadPersonalityFile(globalPath)
  const projectFile = loadPersonalityFile(projectPath)

  if (!globalFile && !projectFile) {
    return {
      config: null,
      file: null,
      source: "none",
      statePath: "",
      globalPath,
      projectPath,
    }
  }

  let merged: PersonalityFile

  if (globalFile && projectFile) {
    merged = {
      active: projectFile.active,
      personalities: {
        ...globalFile.personalities,
        ...projectFile.personalities,
      },
    }
    const mergedStates: Record<string, MoodState> = {
      ...(globalFile.states ?? {}),
      ...(projectFile.states ?? {}),
    }
    if (Object.keys(mergedStates).length > 0) {
      merged.states = mergedStates
    }
  } else if (projectFile) {
    merged = projectFile
  } else {
    merged = globalFile!
  }

  // Ensure active personality exists, fall back to first available
  if (!merged.personalities[merged.active]) {
    const keys = Object.keys(merged.personalities)
    if (keys.length > 0) {
      merged.active = keys[0]!
    }
  }

  const activeDefinition = getActivePersonality(merged)
  const config = activeDefinition ? mergeWithDefaults(activeDefinition) : null

  const source =
    globalFile && projectFile ? "both" : projectFile ? "project" : "global"
  const statePath = projectFile ? projectPath : globalPath

  return { config, file: merged, source, statePath, globalPath, projectPath }
}

// --- Defaults merging ---

export function mergeWithDefaults(
  partial: Partial<PersonalityDefinition>
): PersonalityDefinition {
  let merged: PersonalityDefinition = {
    name: "",
    description: "",
    emoji: false,
    slangIntensity: 0,
    moods: DEFAULT_MOODS,
    mood: { ...DEFAULT_MOOD_CONFIG },
  }

  merged = deepMerge(merged, partial)
  if (partial.mood) {
    merged.mood = deepMerge(merged.mood, partial.mood)
  }
  return merged
}

// --- File I/O ---

/**
 * Write a full multi-personality file to disk
 */
export function writePersonalityFile(path: string, file: PersonalityFile): void {
  ensureDir(path)
  writeFileSync(path, JSON.stringify(file, null, 2))
}

/**
 * Save a personality definition to a file, preserving other personalities and states.
 * Creates the file in multi-personality format if it doesn't exist.
 */
export function savePersonalityToFile(
  path: string,
  key: string,
  definition: PersonalityDefinition,
  setActive: boolean
): void {
  ensureDir(path)
  const existing = loadPersonalityFile(path)
  const file: PersonalityFile = existing ?? {
    active: key,
    personalities: {},
  }

  file.personalities[key] = definition
  if (setActive || !file.personalities[file.active]) {
    file.active = key
  }

  writeFileSync(path, JSON.stringify(file, null, 2))
}

/**
 * Switch the active personality in a file on disk
 */
export function switchActiveInFile(path: string, name: string): void {
  ensureDir(path)
  const file = loadPersonalityFile(path) ?? {
    active: name,
    personalities: {},
  }
  file.active = name
  writeFileSync(path, JSON.stringify(file, null, 2))
}

// --- Mood resolution ---

export function resolveMoods(config: PersonalityDefinition): MoodDefinition[] {
  if (config.moods && config.moods.length > 0) return config.moods
  return DEFAULT_MOODS
}

export function resolveDefaultMood(
  config: PersonalityDefinition,
  moods: MoodDefinition[]
): MoodName {
  const byName = moods.find(mood => mood.name === config.mood.default)
  if (byName) return byName.name
  if (moods.length === 0) return DEFAULT_MOOD_CONFIG.default
  return moods[0]!.name
}

// --- Mood state I/O ---

export function loadMoodState(
  statePath: string,
  config: PersonalityDefinition,
  activeKey: string
): MoodState {
  const raw = tryLoadJson<Record<string, unknown>>(statePath)
  const moods = resolveMoods(config)
  const defaultMood = resolveDefaultMood(config, moods)

  if (raw) {
    // Try multi-personality format first
    const states = raw.states as Record<string, MoodState> | undefined
    const state = states?.[activeKey]
    if (state) {
      return normalizeState(state, defaultMood, moods)
    }

    // Fall back to legacy format
    const legacyState = raw.state as MoodState | undefined
    if (legacyState) {
      return normalizeState(legacyState, defaultMood, moods)
    }
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
    moods
  )
}

export function saveMoodState(
  statePath: string,
  state: MoodState,
  activeKey: string
): void {
  const dir = dirname(statePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const file = loadPersonalityFile(statePath)
  if (!file) return

  const states: Record<string, MoodState> = file.states ? { ...file.states } : {}
  states[activeKey] = state
  writeFileSync(statePath, JSON.stringify({ ...file, states }, null, 2))
}

// --- Scope resolution ---

export function resolveScope(
  flags: Record<string, string | boolean>,
  configResult: ConfigResult
): ConfigScope {
  const scopeFlag = typeof flags.scope === "string" ? flags.scope.toLowerCase() : null
  if (scopeFlag === "global" || scopeFlag === "project") {
    return scopeFlag
  }

  if (existsSync(configResult.projectPath)) return "project"
  if (existsSync(configResult.globalPath)) return "global"
  return "project"
}

export function resolveScopePath(scope: ConfigScope, configResult: ConfigResult): string {
  return scope === "project" ? configResult.projectPath : configResult.globalPath
}

// --- Formatting ---

export function formatConfigOutput(config: PersonalityDefinition): string {
  return JSON.stringify(config, null, 2)
}

// --- Score helpers ---

export function resolveMoodScore(mood: MoodName, moods: MoodDefinition[]): number {
  const match = moods.find(item => item.name === mood)
  return match?.score ?? 0
}

function normalizeState(
  state: MoodState,
  defaultMood: MoodName,
  moods: MoodDefinition[]
): MoodState {
  const moodNames = new Set(moods.map(item => item.name))
  const normalized: MoodState = { ...state }

  if (!moodNames.has(normalized.current)) {
    normalized.current = defaultMood
  }

  if (normalized.override && !moodNames.has(normalized.override)) {
    normalized.override = null
  }

  if (Number.isNaN(normalized.score)) {
    normalized.score = resolveMoodScore(normalized.current, moods)
  }

  return normalized
}

// --- Parsing helpers ---

export function parseBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null
  const normalized = value.toLowerCase()
  if (["true", "1", "yes", "y"].includes(normalized)) return true
  if (["false", "0", "no", "n"].includes(normalized)) return false
  return null
}

export function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return null
  return parsed
}
