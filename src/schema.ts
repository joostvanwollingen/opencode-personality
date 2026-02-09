/**
 * Zod schema validation for personality files
 * @module schema
 */

import { z } from 'zod';

export const moodDefinitionSchema = z.object({
  name: z.string().min(1, 'Mood name is required'),
  hint: z.string().min(1, 'Mood hint is required'),
  score: z.number(),
});

export const moodConfigSchema = z.object({
  enabled: z.boolean(),
  default: z.string().min(1, 'Default mood name is required'),
  override: z.string().nullable().optional(),
  drift: z.number().min(0).max(1, 'Drift must be between 0 and 1'),
  toast: z.boolean().optional(),
  seed: z.number().optional(),
});

export const moodStateSchema = z.object({
  current: z.string(),
  score: z.number(),
  lastUpdate: z.number(),
  override: z.string().nullable(),
  overrideExpiry: z.number().nullable(),
});

export const personalityFileSchema = z.object({
  name: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  emoji: z.boolean(),
  slangIntensity: z.number().min(0).max(1, 'Slang intensity must be between 0 and 1'),
  moods: z.array(moodDefinitionSchema).optional(),
  mood: moodConfigSchema,
  state: moodStateSchema.optional(),
});

export type PersonalityFileValidated = z.infer<typeof personalityFileSchema>;
export type MoodDefinitionValidated = z.infer<typeof moodDefinitionSchema>;
export type MoodConfigValidated = z.infer<typeof moodConfigSchema>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: PersonalityFileValidated;
}

export function validatePersonalityFile(data: unknown): ValidationResult {
  const result = personalityFileSchema.safeParse(data);
  
  if (result.success) {
    return {
      valid: true,
      errors: [],
      data: result.data,
    };
  }
  
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    return `${path}: ${issue.message}`;
  });
  
  return {
    valid: false,
    errors,
  };
}

export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return 'Validation passed';
  }
  
  return result.errors.map((err) => `  - ${err}`).join('\n');
}
