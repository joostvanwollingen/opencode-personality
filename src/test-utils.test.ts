import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  createTempDir,
  cleanupTempDir,
  mockPersonalityFile,
  createMockGlobalConfigDir,
  createMockProjectDir,
} from './test-utils.js';

describe('test-utils', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('createTempDir', () => {
    it('should create a temporary directory', () => {
      const dir = createTempDir();
      expect(fs.existsSync(dir)).toBe(true);
      cleanupTempDir(dir);
    });

    it('should create unique directories', () => {
      const dir1 = createTempDir();
      const dir2 = createTempDir();
      expect(dir1).not.toBe(dir2);
      cleanupTempDir(dir1);
      cleanupTempDir(dir2);
    });
  });

  describe('cleanupTempDir', () => {
    it('should remove the temporary directory', () => {
      const dir = createTempDir();
      expect(fs.existsSync(dir)).toBe(true);
      cleanupTempDir(dir);
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('should not throw if directory does not exist', () => {
      const nonExistentDir = path.join(tempDir, 'does-not-exist');
      expect(() => cleanupTempDir(nonExistentDir)).not.toThrow();
    });
  });

  describe('mockPersonalityFile', () => {
    it('should return default personality', () => {
      const personality = mockPersonalityFile();
      expect(personality.name).toBe('Test Personality');
      expect(personality.description).toBe('A test personality for unit tests.');
      expect(personality.emoji).toBe(false);
      expect(personality.slangIntensity).toBe(0);
      expect(personality.moods).toHaveLength(2);
      expect(personality.mood.enabled).toBe(true);
      expect(personality.state).toBeDefined();
    });

    it('should allow overrides', () => {
      const personality = mockPersonalityFile({
        name: 'Custom Name',
        emoji: true,
        slangIntensity: 0.5,
      });
      expect(personality.name).toBe('Custom Name');
      expect(personality.emoji).toBe(true);
      expect(personality.slangIntensity).toBe(0.5);
      expect(personality.description).toBe('A test personality for unit tests.');
    });
  });

  describe('createMockGlobalConfigDir', () => {
    it('should create global config directory structure', () => {
      const globalDir = createMockGlobalConfigDir(tempDir);
      expect(fs.existsSync(globalDir)).toBe(true);
      expect(globalDir).toContain('.config/opencode');
    });
  });

  describe('createMockProjectDir', () => {
    it('should create project directory', () => {
      const projectDir = createMockProjectDir(tempDir);
      expect(fs.existsSync(projectDir)).toBe(true);
      expect(path.basename(projectDir)).toBe('project');
    });
  });
});
