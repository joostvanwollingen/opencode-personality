import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { PersonalityFile, MoodDefinition, MoodState } from './types.js';

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-personality-test-'));
}

export function cleanupTempDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

export function mockPersonalityFile(overrides?: Partial<PersonalityFile>): PersonalityFile {
  const defaultMoods: MoodDefinition[] = [
    { name: 'test-mood-1', hint: 'Test mood 1', score: -1 },
    { name: 'test-mood-2', hint: 'Test mood 2', score: 1 },
  ];

  const defaultState: MoodState = {
    current: 'test-mood-2',
    score: 0.5,
    lastUpdate: Date.now(),
    override: null,
    overrideExpiry: null,
  };

  return {
    name: overrides?.name ?? 'Test Personality',
    description: overrides?.description ?? 'A test personality for unit tests.',
    emoji: overrides?.emoji ?? false,
    slangIntensity: overrides?.slangIntensity ?? 0,
    moods: overrides?.moods ?? defaultMoods,
    mood: overrides?.mood ?? {
      enabled: true,
      default: 'test-mood-2',
      override: null,
      drift: 0.2,
      toast: true,
    },
    state: overrides?.state ?? defaultState,
  };
}

export function createMockGlobalConfigDir(tempDir: string): string {
  const globalDir = path.join(tempDir, '.config', 'opencode');
  fs.mkdirSync(globalDir, { recursive: true });
  return globalDir;
}

export function createMockProjectDir(tempDir: string): string {
  const projectDir = path.join(tempDir, 'project');
  fs.mkdirSync(projectDir, { recursive: true });
  return projectDir;
}
