import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir, createMockGlobalConfigDir, createMockProjectDir } from './test-utils.js';
import { installDefaultPersonalities, hasPersonalities } from './install-defaults.js';
import { listPersonalities } from './config.js';

describe('install-defaults', () => {
  let tempDir: string;
  let globalConfigDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    globalConfigDir = createMockGlobalConfigDir(tempDir);
    projectDir = createMockProjectDir(tempDir);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('hasPersonalities', () => {
    it('should return false when no personalities exist', () => {
      const result = hasPersonalities(projectDir, globalConfigDir);
      expect(result).toBe(false);
    });

    it('should return true when global personalities exist', () => {
      const personalitiesDir = path.join(globalConfigDir, 'personalities');
      fs.mkdirSync(personalitiesDir, { recursive: true });
      fs.writeFileSync(path.join(personalitiesDir, 'test.json'), JSON.stringify({ name: 'test' }));

      const result = hasPersonalities(projectDir, globalConfigDir);
      expect(result).toBe(true);
    });

    it('should return true when project personalities exist', () => {
      const personalitiesDir = path.join(projectDir, '.opencode', 'personalities');
      fs.mkdirSync(personalitiesDir, { recursive: true });
      fs.writeFileSync(path.join(personalitiesDir, 'test.json'), JSON.stringify({ name: 'test' }));

      const result = hasPersonalities(projectDir, globalConfigDir);
      expect(result).toBe(true);
    });
  });

  describe('installDefaultPersonalities', () => {
    it('should install default personalities globally when scope is global', () => {
      installDefaultPersonalities('global', projectDir, globalConfigDir);

      const personalities = listPersonalities(projectDir, globalConfigDir);
      expect(personalities.length).toBeGreaterThan(0);

      const names = personalities.map((p) => p.name);
      expect(names).toContain('splinter');
      expect(names).toContain('rick');
    });

    it('should install default personalities to project when scope is project', () => {
      installDefaultPersonalities('project', projectDir, globalConfigDir);

      const personalities = listPersonalities(projectDir, globalConfigDir);
      expect(personalities.length).toBeGreaterThan(0);

      // Verify they are project-scoped
      for (const p of personalities) {
        expect(p.source).toBe('project');
      }
    });

    it('should not overwrite existing personalities', () => {
      // First install
      installDefaultPersonalities('global', projectDir, globalConfigDir);

      const beforeCount = listPersonalities(projectDir, globalConfigDir).length;

      // Second install should not add duplicates
      installDefaultPersonalities('global', projectDir, globalConfigDir);

      const afterCount = listPersonalities(projectDir, globalConfigDir).length;
      expect(afterCount).toBe(beforeCount);
    });
  });
});
