import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  getPersonalitiesDir,
  listPersonalities,
  loadPersonality,
  savePersonalityFile,
  deletePersonality,
  PERSONALITIES_DIR,
  OLD_PERSONALITY_FILENAME,
  migrateOldPersonalityFormat,
} from './config.js';
import { createTempDir, cleanupTempDir, mockPersonalityFile } from './test-utils.js';
import type { ConfigScope } from './types.js';

describe('config - multi-personality', () => {
  let tempDir: string;
  let globalConfigDir: string;
  let projectDir: string;
  let globalPersonalitiesDir: string;
  let projectPersonalitiesDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    globalConfigDir = path.join(tempDir, '.config', 'opencode');
    projectDir = path.join(tempDir, 'project');
    globalPersonalitiesDir = path.join(globalConfigDir, PERSONALITIES_DIR);
    projectPersonalitiesDir = path.join(projectDir, '.opencode', PERSONALITIES_DIR);

    fs.mkdirSync(globalPersonalitiesDir, { recursive: true });
    fs.mkdirSync(projectPersonalitiesDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('getPersonalitiesDir', () => {
    it('should return global personalities directory path', () => {
      const dir = getPersonalitiesDir('global', projectDir, globalConfigDir);
      expect(dir).toBe(globalPersonalitiesDir);
    });

    it('should return project personalities directory path', () => {
      const dir = getPersonalitiesDir('project', projectDir, globalConfigDir);
      expect(dir).toBe(projectPersonalitiesDir);
    });
  });

  describe('listPersonalities', () => {
    it('should return empty array when no personalities exist', () => {
      const personalities = listPersonalities(projectDir, globalConfigDir);
      expect(personalities).toEqual([]);
    });

    it('should list global personalities', () => {
      const personality = mockPersonalityFile({ name: 'global-personality' });
      fs.writeFileSync(path.join(globalPersonalitiesDir, 'global-personality.json'), JSON.stringify(personality));

      const personalities = listPersonalities(projectDir, globalConfigDir);
      expect(personalities).toHaveLength(1);
      expect(personalities[0]!.name).toBe('global-personality');
      expect(personalities[0]!.source).toBe('global');
    });

    it('should list project personalities', () => {
      const personality = mockPersonalityFile({ name: 'project-personality' });
      fs.writeFileSync(path.join(projectPersonalitiesDir, 'project-personality.json'), JSON.stringify(personality));

      const personalities = listPersonalities(projectDir, globalConfigDir);
      expect(personalities).toHaveLength(1);
      expect(personalities[0]!.name).toBe('project-personality');
      expect(personalities[0]!.source).toBe('project');
    });

    it('should merge personalities from both scopes', () => {
      const globalPersonality = mockPersonalityFile({ name: 'global-one' });
      const projectPersonality = mockPersonalityFile({ name: 'project-one' });

      fs.writeFileSync(path.join(globalPersonalitiesDir, 'global-one.json'), JSON.stringify(globalPersonality));
      fs.writeFileSync(path.join(projectPersonalitiesDir, 'project-one.json'), JSON.stringify(projectPersonality));

      const personalities = listPersonalities(projectDir, globalConfigDir);
      expect(personalities).toHaveLength(2);

      const names = personalities.map((p) => p.name).sort();
      expect(names).toEqual(['global-one', 'project-one']);
    });

    it('should prefer project personality when names conflict', () => {
      const globalPersonality = mockPersonalityFile({ name: 'shared', description: 'global version' });
      const projectPersonality = mockPersonalityFile({ name: 'shared', description: 'project version' });

      fs.writeFileSync(path.join(globalPersonalitiesDir, 'shared.json'), JSON.stringify(globalPersonality));
      fs.writeFileSync(path.join(projectPersonalitiesDir, 'shared.json'), JSON.stringify(projectPersonality));

      const personalities = listPersonalities(projectDir, globalConfigDir);
      expect(personalities).toHaveLength(1);
      expect(personalities[0]!.source).toBe('project');
      expect(personalities[0]!.description).toBe('project version');
    });

    it('should ignore non-JSON files', () => {
      fs.writeFileSync(path.join(globalPersonalitiesDir, 'readme.txt'), 'not a personality');
      fs.writeFileSync(path.join(globalPersonalitiesDir, 'test.json'), '{}');

      const personalities = listPersonalities(projectDir, globalConfigDir);
      expect(personalities).toHaveLength(1);
      expect(personalities[0]!.name).toBe('test');
    });
  });

  describe('loadPersonality', () => {
    it('should return null when personality does not exist', () => {
      const result = loadPersonality('non-existent', projectDir, globalConfigDir);
      expect(result).toBeNull();
    });

    it('should load global personality', () => {
      const personality = mockPersonalityFile({ name: 'global-test' });
      fs.writeFileSync(path.join(globalPersonalitiesDir, 'global-test.json'), JSON.stringify(personality));

      const result = loadPersonality('global-test', projectDir, globalConfigDir);
      expect(result).not.toBeNull();
      expect(result!.personality.name).toBe('global-test');
      expect(result!.metadata.source).toBe('global');
    });

    it('should prefer project personality over global', () => {
      const globalPersonality = mockPersonalityFile({ name: 'test', description: 'global' });
      const projectPersonality = mockPersonalityFile({ name: 'test', description: 'project' });

      fs.writeFileSync(path.join(globalPersonalitiesDir, 'test.json'), JSON.stringify(globalPersonality));
      fs.writeFileSync(path.join(projectPersonalitiesDir, 'test.json'), JSON.stringify(projectPersonality));

      const result = loadPersonality('test', projectDir, globalConfigDir);
      expect(result!.personality.description).toBe('project');
      expect(result!.metadata.source).toBe('project');
    });
  });

  describe('savePersonalityFile', () => {
    it('should save personality to global scope', () => {
      const personality = mockPersonalityFile({ name: 'new-personality' });

      savePersonalityFile('new-personality', personality, 'global', projectDir, globalConfigDir);

      const savedPath = path.join(globalPersonalitiesDir, 'new-personality.json');
      expect(fs.existsSync(savedPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
      expect(saved.name).toBe('new-personality');
    });

    it('should save personality to project scope', () => {
      const personality = mockPersonalityFile({ name: 'project-personality' });

      savePersonalityFile('project-personality', personality, 'project', projectDir, globalConfigDir);

      const savedPath = path.join(projectPersonalitiesDir, 'project-personality.json');
      expect(fs.existsSync(savedPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
      expect(saved.name).toBe('project-personality');
    });

    it('should create directories if they do not exist', () => {
      const personality = mockPersonalityFile({ name: 'test' });
      const newProjectDir = path.join(tempDir, 'new-project');

      savePersonalityFile('test', personality, 'project', newProjectDir, globalConfigDir);

      expect(fs.existsSync(path.join(newProjectDir, '.opencode', PERSONALITIES_DIR))).toBe(true);
    });

    it('should preserve state when updating existing personality', () => {
      const initial = mockPersonalityFile({ name: 'test' });
      initial.state = { current: 'happy', score: 1, lastUpdate: 12345, override: null, overrideExpiry: null };

      savePersonalityFile('test', initial, 'project', projectDir, globalConfigDir);

      const updated = mockPersonalityFile({ name: 'test', description: 'updated' });
      savePersonalityFile('test', updated, 'project', projectDir, globalConfigDir);

      const saved = JSON.parse(fs.readFileSync(path.join(projectPersonalitiesDir, 'test.json'), 'utf-8'));
      expect(saved.description).toBe('updated');
      expect(saved.state.current).toBe('happy');
    });
  });

  describe('deletePersonality', () => {
    it('should delete global personality', () => {
      const personality = mockPersonalityFile({ name: 'to-delete' });
      fs.writeFileSync(path.join(globalPersonalitiesDir, 'to-delete.json'), JSON.stringify(personality));

      deletePersonality('to-delete', 'global', projectDir, globalConfigDir);

      expect(fs.existsSync(path.join(globalPersonalitiesDir, 'to-delete.json'))).toBe(false);
    });

    it('should delete project personality', () => {
      const personality = mockPersonalityFile({ name: 'to-delete' });
      fs.writeFileSync(path.join(projectPersonalitiesDir, 'to-delete.json'), JSON.stringify(personality));

      deletePersonality('to-delete', 'project', projectDir, globalConfigDir);

      expect(fs.existsSync(path.join(projectPersonalitiesDir, 'to-delete.json'))).toBe(false);
    });

    it('should not throw if personality does not exist', () => {
      expect(() => deletePersonality('non-existent', 'global', projectDir, globalConfigDir)).not.toThrow();
    });
  });

  describe('migrateOldPersonalityFormat', () => {
    it('should migrate old single-file config to new format', () => {
      const oldConfig = mockPersonalityFile({ name: 'legacy-personality' });
      const oldPath = path.join(globalConfigDir, OLD_PERSONALITY_FILENAME);

      fs.writeFileSync(oldPath, JSON.stringify(oldConfig));

      const scope = 'global' as ConfigScope;
      const migrated = migrateOldPersonalityFormat(scope, projectDir, globalConfigDir);

      expect(migrated).toBe(true);
      expect(fs.existsSync(oldPath)).toBe(false);
      expect(fs.existsSync(path.join(globalPersonalitiesDir, 'legacy-personality.json'))).toBe(true);
    });

    it("should use 'default' as name if old config has no name", () => {
      const oldConfig = mockPersonalityFile({ name: '' });
      const oldPath = path.join(globalConfigDir, OLD_PERSONALITY_FILENAME);

      fs.writeFileSync(oldPath, JSON.stringify(oldConfig));

      const scope = 'global' as ConfigScope;
      migrateOldPersonalityFormat(scope, projectDir, globalConfigDir);

      expect(fs.existsSync(path.join(globalPersonalitiesDir, 'default.json'))).toBe(true);
    });

    it('should return false if no old config exists', () => {
      const scope = 'global' as ConfigScope;
      const migrated = migrateOldPersonalityFormat(scope, projectDir, globalConfigDir);
      expect(migrated).toBe(false);
    });
  });
});
