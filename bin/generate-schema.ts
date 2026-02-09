import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { personalityFileSchema } from '../src/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use Zod v4 native JSON Schema conversion
const schema = z.toJSONSchema(personalityFileSchema);

const outputPath = join(__dirname, '..', 'schema', 'personality.schema.json');
writeFileSync(outputPath, JSON.stringify(schema, null, 2));

console.log('Generated personality.schema.json at', outputPath);
