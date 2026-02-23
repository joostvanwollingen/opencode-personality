# AGENTS.md - OpenCode Personality Plugin

Guidelines for AI agents working on this codebase.

## Project Overview

An OpenCode plugin that adds configurable personality and mood systems to AI assistants. Supports multiple personalities per config file with per-personality mood state tracking. The plugin injects the active personality traits into the system prompt and manages a mood state machine that drifts over time.

## Code Style

- **TypeScript**: Strict mode enabled with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- **Formatting**: Use Prettier defaults (no config file needed)
- **Imports**: Use `.js` extensions for local imports (ESM)
- **Types**: Prefer explicit types for function parameters and return values
- **Null handling**: Use `!` only when value is guaranteed; prefer guards
- **Comments**: Avoid inline comments; use JSDoc for public APIs only

## Architecture

```
src/
├── index.ts              # Plugin entry point, hooks registration
├── types.ts              # All type definitions
├── config.ts             # Config loading, merging, migration, state management
├── mood.ts               # Mood drift, scoring functions
├── prompt.ts             # Personality prompt builder
├── tools/
│   ├── setMood.ts        # setMood tool definition
│   └── savePersonality.ts # savePersonality tool definition
└── commands/
    ├── mood.ts           # /mood command handler
    └── personality.ts    # /personality command handler (list, switch, create, edit, reset)
```

## Key Types

| Type | Purpose |
|------|---------|
| `PersonalityDefinition` | Single personality config (name, description, emoji, slang, moods, mood config) |
| `PersonalityFile` | Multi-personality file on disk (`active`, `personalities` map, `states` map) |
| `LegacyPersonalityFile` | Old single-personality format, used for migration detection |
| `ConfigResult` | Loaded config with `config` (active PersonalityDefinition), `file` (full PersonalityFile), source, paths |

## Key Files

| File | Purpose |
|------|---------|
| `src/types.ts` | All exported types - modify here for schema changes |
| `src/config.ts` | Config precedence logic (global + project merge), legacy migration, multi-personality CRUD, file I/O |
| `src/mood.ts` | Mood drift algorithm - uses seeded random for testing |
| `src/prompt.ts` | Builds personality section for system prompt |
| `src/index.ts` | Plugin hooks registration, main entry point |

## Plugin Hooks Used

| Hook | Purpose |
|------|---------|
| `experimental.chat.system.transform` | Inject active personality into system prompt |
| `event` | Drift mood after assistant responses |
| `command.execute.before` | Handle `/mood` and `/personality` commands |

## Testing Workflow

1. Run `npm run typecheck` to verify types
2. Run `npm run lint` to check code style
3. Run `npm run build` to verify build
4. Test in OpenCode by updating `opencode.json` to point to `src/index.ts`

## Making Changes

### Adding a New Personality Field

1. Add field to `PersonalityDefinition` in `src/types.ts`
2. Add default value in `mergeWithDefaults()` in `src/config.ts`
3. Use the field in `src/prompt.ts` or other consumers
4. Update `savePersonality` tool args in `src/tools/savePersonality.ts`
5. Update README config reference

### Adding a New Mood Field

1. Add type to `MoodDefinition` or `MoodConfig` in `src/types.ts`
2. Add default value in `DEFAULT_MOODS` or `DEFAULT_MOOD_CONFIG` in `src/config.ts`
3. Use the field in `src/mood.ts` or `src/prompt.ts`
4. Update README config reference

### Adding a New Command

1. Create handler in `src/commands/`
2. Import and wire up in `src/index.ts` `command.execute.before` hook
3. Register in `opencode.json` command definitions
4. Document in README

### Adding a New Tool

1. Create tool in `src/tools/` using `tool()` from `@opencode-ai/plugin`
2. Import and add to `tool:` object in `src/index.ts`
3. Document in README Tools section

### Adding a New Hook

1. Add implementation in `src/index.ts` return object
2. Follow existing patterns for hook signatures
3. Document behavior in README if user-facing

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit: `git commit -m "chore: release vX.Y.Z"`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push && git push --tags`
6. GitHub Actions handles npm publish

## Common Patterns

### Config Loading

```typescript
const configResult = loadConfigWithPrecedence(directory)
if (configResult.config === null) {
  // No config - return minimal hooks or no-op
  return {}
}
const config = configResult.config       // PersonalityDefinition (active)
const file = configResult.file!          // PersonalityFile (full store)
const activeKey = file.active            // Key of active personality
```

### Multi-Personality Operations

```typescript
import { listPersonalities, addPersonality, removePersonality, switchActivePersonality } from "./config.js"

const names = listPersonalities(file)
const updated = addPersonality(file, "NewBot", definition)
const switched = switchActivePersonality(file, "NewBot")
const reduced = removePersonality(file, "OldBot")  // null if last personality removed
```

### Legacy Migration

```typescript
import { isLegacyFormat, migrateLegacyToMulti } from "./config.js"

if (isLegacyFormat(rawData)) {
  const multiFile = migrateLegacyToMulti(rawData as LegacyPersonalityFile)
}
```

### Mood State (Per-Personality)

```typescript
// Load and save state require the activeKey parameter
const state = loadMoodState(statePath, config, activeKey)
saveMoodState(statePath, state, activeKey)
```

### Type Guards for Output

```typescript
const output = cmdOutput as { parts: Array<{ type: string; text: string }> }
output.parts.push({ type: "text", text: "Message" })
```

## Constraints

- **Backward Compatible**: Auto-migrate old single-personality config files on save
- **No-op Safe**: Return empty hooks if config is missing
- **Deterministic**: Use `mood.seed` for reproducible tests
- **Minimal Dependencies**: Only `@opencode-ai/plugin` peer dependency
- **Per-Personality State**: Mood state is tracked independently per personality
