/**
 * Type definitions for the OpenCode Personality Plugin
 * @module types
 */

import type { PluginInput } from '@opencode-ai/plugin';

/** Mood identifier string */
export type MoodName = string;

/**
 * Plugin configuration stored separately from personality config
 * Tracks which personality is currently selected
 */
export type PluginConfig = {
  /** Name of currently selected personality */
  selectedPersonality: string | null;
};

/**
 * Metadata for a personality (used for listing available personalities)
 */
export type PersonalityMetadata = {
  /** Unique personality name (filename without extension) */
  name: string;
  /** Brief description for display */
  description: string;
  /** Where this personality is stored */
  source: 'global' | 'project';
  /** Last modified timestamp */
  modifiedAt: string;
};

/**
 * Result when loading a specific personality
 */
export type PersonalityLoadResult = {
  /** The loaded personality configuration */
  personality: PersonalityFile;
  /** Metadata about this personality */
  metadata: PersonalityMetadata;
  /** Full path to the personality file */
  path: string;
};

/**
 * Result of loading config with multi-personality support
 */
export type MultiPersonalityConfigResult = {
  /** Currently selected personality config (null if none selected) */
  personality: PersonalityFile | null;
  /** List of all available personalities */
  available: PersonalityMetadata[];
  /** Name of currently selected personality */
  selectedName: string | null;
  /** Plugin configuration (selected personality tracking) */
  pluginConfig: PluginConfig;
  /** Where the plugin config was loaded from */
  source: 'global' | 'project' | 'none';
};

/**
 * Configuration for the mood system
 */
export type MoodConfig = {
  /** Whether mood drift is enabled */
  enabled: boolean;
  /** Default mood when no override is active */
  default: MoodName;
  /** Manual mood override (null when not set) */
  override: MoodName | null;
  /** Drift amount per tick (0-1) */
  drift: number;
  /** Whether to show toast notifications on mood change */
  toast: boolean;
  /** Optional seed for deterministic drift (for testing) */
  seed?: number;
};

/**
 * Runtime state of the mood system
 */
export type MoodState = {
  /** Current active mood */
  current: MoodName;
  /** Numeric score used for drift calculations */
  score: number;
  /** Timestamp of last state update */
  lastUpdate: number;
  /** Manual override mood (null when not set) */
  override: MoodName | null;
  /** Timestamp when override expires (null for session/permanent) */
  overrideExpiry: number | null;
};

/**
 * Definition of a single mood
 */
export type MoodDefinition = {
  /** Unique mood name */
  name: MoodName;
  /** Prompt hint describing the mood's effect on responses */
  hint: string;
  /** Numeric score for drift calculations */
  score: number;
};

/**
 * Complete personality configuration file schema
 */
export type PersonalityFile = {
  /** Optional name for the assistant */
  name?: string;
  /** Personality description injected into prompts */
  description: string;
  /** Whether to use emojis in responses */
  emoji: boolean;
  /** Intensity of slang usage (0-1) */
  slangIntensity: number;
  /** Custom mood definitions (uses defaults if omitted) */
  moods?: MoodDefinition[];
  /** Mood system configuration */
  mood: MoodConfig;
  /** Runtime state (stored in same file) */
  state?: MoodState;
};

/**
 * Result of loading config with precedence
 */
export type ConfigResult = {
  /** Merged config or null if none found */
  config: PersonalityFile | null;
  /** Where the config was loaded from */
  source: 'global' | 'project' | 'both' | 'none';
  /** Path where state should be saved */
  statePath: string;
  /** Path to global config */
  globalPath: string;
  /** Path to project config */
  projectPath: string;
};

/** Config scope for save operations */
export type ConfigScope = 'global' | 'project';

/**
 * Parsed command arguments
 */
export type ParsedCommand = {
  /** Subcommand (e.g., "create", "edit", "show") */
  subcommand: string | null;
  /** Flag values (--flag value or --flag) */
  flags: Record<string, string | boolean>;
  /** Key=value pairs */
  values: Record<string, string>;
};

/** Duration for mood override */
export type MoodDuration = 'message' | 'session' | 'permanent';

/** Plugin client interface */
export type PluginClient = PluginInput['client'];

/**
 * Command output for hook responses
 */
export type CommandOutput = {
  parts: Array<{ type: string; text: string }>;
};
