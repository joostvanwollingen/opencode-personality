import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigScope } from './types.js';
import { listPersonalities, savePersonalityFile } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULTS_DIR = path.join(__dirname, 'defaults');

export function hasPersonalities(projectDir: string, globalConfigDir: string): boolean {
  const personalities = listPersonalities(projectDir, globalConfigDir);
  return personalities.length > 0;
}

export function installDefaultPersonalities(scope: ConfigScope, projectDir: string, globalConfigDir: string): void {
  if (!fs.existsSync(DEFAULTS_DIR)) {
    return;
  }

  for (const file of fs.readdirSync(DEFAULTS_DIR)) {
    if (!file.endsWith('.json')) continue;

    const name = file.slice(0, -5); // Remove .json
    const sourcePath = path.join(DEFAULTS_DIR, file);
    const content = fs.readFileSync(sourcePath, 'utf-8');
    const personality = JSON.parse(content);

    // Only install if personality with this name doesn't already exist
    const existing = listPersonalities(projectDir, globalConfigDir);
    if (!existing.find((p) => p.name === name)) {
      savePersonalityFile(name, personality, scope, projectDir, globalConfigDir);
    }
  }
}
