import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { getPluginConfigPath, loadPluginConfig, savePluginConfig, DEFAULT_PLUGIN_CONFIG } from './plugin-config.js';
import { createTempDir, cleanupTempDir } from './test-utils.js';
describe('plugin-config', () => {
  let tempDir: string;
  let globalConfigDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    globalConfigDir = path.join(tempDir, '.config', 'opencode');
    projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(globalConfigDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('getPluginConfigPath', () => {
    it('should return global path', () => {
      const globalPath = getPluginConfigPath('global', globalConfigDir, globalConfigDir);
      expect(globalPath).toBe(path.join(globalConfigDir, 'opencode-personality.json'));
    });

    it('should return project path', () => {
      const projectOpencodeDir = path.join(projectDir, '.opencode');
      const projectPath = getPluginConfigPath('project', projectDir);
      expect(projectPath).toBe(path.join(projectOpencodeDir, 'opencode-personality.json'));
    });
  });

  describe('loadPluginConfig', () => {
    it('should return default config when no files exist', () => {
      const config = loadPluginConfig(projectDir, globalConfigDir);
      expect(config).toEqual(DEFAULT_PLUGIN_CONFIG);
    });

    it('should load from global when project config does not exist', () => {
      const globalConfig = { selectedPersonality: 'global-personality' };
      const globalPath = path.join(globalConfigDir, 'opencode-personality.json');
      fs.mkdirSync(globalConfigDir, { recursive: true });
      fs.writeFileSync(globalPath, JSON.stringify(globalConfig));

      const config = loadPluginConfig(projectDir, globalConfigDir);
      expect(config.selectedPersonality).toBe('global-personality');
    });

    it('should load from project when project config exists', () => {
      const globalConfig = { selectedPersonality: 'global-personality' };
      const projectConfig = { selectedPersonality: 'project-personality' };

      fs.mkdirSync(globalConfigDir, { recursive: true });
      fs.writeFileSync(path.join(globalConfigDir, 'opencode-personality.json'), JSON.stringify(globalConfig));

      const projectOpencodeDir = path.join(projectDir, '.opencode');
      fs.mkdirSync(projectOpencodeDir, { recursive: true });
      fs.writeFileSync(path.join(projectOpencodeDir, 'opencode-personality.json'), JSON.stringify(projectConfig));

      const config = loadPluginConfig(projectDir, globalConfigDir);
      expect(config.selectedPersonality).toBe('project-personality');
    });

    it('should merge partial config with defaults', () => {
      const partialConfig = {}; // Missing selectedPersonality
      fs.mkdirSync(globalConfigDir, { recursive: true });
      fs.writeFileSync(path.join(globalConfigDir, 'opencode-personality.json'), JSON.stringify(partialConfig));

      const config = loadPluginConfig(projectDir, globalConfigDir);
      expect(config.selectedPersonality).toBeNull();
    });
  });

  describe('savePluginConfig', () => {
    it('should save to global scope', () => {
      const config = { selectedPersonality: 'test-personality' };
      savePluginConfig(config, 'global', projectDir, globalConfigDir);

      const savedPath = path.join(globalConfigDir, 'opencode-personality.json');
      expect(fs.existsSync(savedPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
      expect(saved.selectedPersonality).toBe('test-personality');
    });

    it('should save to project scope', () => {
      const config = { selectedPersonality: 'test-personality' };
      savePluginConfig(config, 'project', projectDir, globalConfigDir);

      const savedPath = path.join(projectDir, '.opencode', 'opencode-personality.json');
      expect(fs.existsSync(savedPath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));
      expect(saved.selectedPersonality).toBe('test-personality');
    });

    it('should create directories if they do not exist', () => {
      const config = { selectedPersonality: 'test' };
      const newProjectDir = path.join(tempDir, 'new-project');

      savePluginConfig(config, 'project', newProjectDir, globalConfigDir);

      expect(fs.existsSync(path.join(newProjectDir, '.opencode'))).toBe(true);
    });
  });
});
