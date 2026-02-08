# Personality Switcher

## Requirements

We need to change the logic by which the personality is selected and loaded:

1) **MUST** have access to multiple 'personality'; which means we need to store multiple personalities file - departure from a single one
2) **MUST** modify the creation of personality
3) **MUST** store the set of default personalities inside a `~/.config/opencode/personalities` or `.opencode/personalities`
4) **MUST** allow the selection of a personality from available ones - merging user space level and project level personalities
5) **MUST** store the currently selected one - new plugin config at either the user space level `~/.config/opencode` or at project level `.opencode`
6) **MUST** validate any and all `<personality>.json` through the use of a JsonSchema file - generate a new on that needs to be referenced in those personality files.

## Executive Summary

Adding a personality switcher command to the `opencode-personality` plugin is straightforward and fits naturally into
the existing architecture. Implementation requires minimal changes to the codebase.

---

## Current Architecture

### Command System

The plugin uses a hook-based command system via `command.execute.before`:

- Commands are registered as slash commands (e.g., `/personality`, `/mood`)
- The `handlePersonalityCommand()` function in `src/commands/personality.ts` already has subcommands: `create`, `edit`,
  `show`, `reset`
- Easy to add a new `switch` subcommand

### Config Loading

- `loadConfigWithPrecedence()` merges global + project configs
- `writePersonalityFile()` writes to either scope (global or project)
- Config files are simple JSON - easy to copy/merge

### File Structure

```bash
~/.config/opencode/personality.json   (global active config)
~/.config/opencode/personalities/     (global presets library)
  yoda.json
  gandalf.json
  data.json
  sherlock.json
  ...

.opencode/personality.json            (project active config)
.opencode/personalities/              (project-local presets library)
  custom-personality.json
```

---

## Requirements Fulfillment

### 1. Multiple Personalities ✅

Store multiple personality files in `personalities/` directories (global and project scopes).

### 2. Modified Creation Flow ✅

Change `/personality create` to support:

- **Activate mode** (default): Create and immediately activate the personality
- **Save as preset**: Create and save to presets library without activating

### 3. Selection from Available ✅

`/personality switch` command lists and activates from the presets library.

### 4. Store Currently Selected ✅

New plugin config fields track which preset is currently loaded:

- `activePreset`: Name of the currently active preset
- `activePresetScope`: Scope where the active preset is stored (`global` or `project`)

---

## Proposed Command Interface

### Modified `/personality create` Command

```bash
# Create and activate immediately (default behavior)
/personality create

# Create and save as preset only (don't activate)
/personality create --preset-only
/personality create --preset-only --scope global

# Create, save as preset, AND activate
/personality create --as-preset yoda --activate
```

### New `/personality switch` Command

```bash
# List available presets with current active indicator
/personality switch

# Switch to a preset (writes to project scope by default)
/personality switch yoda

# Switch with explicit scope
/personality switch yoda --scope global

# Import a preset from a file path
/personality switch --file ./my-personality.json

# Switch and save current as backup first
/personality switch yoda --backup
```

### Updated `/personality edit` Command

```bash
# Edit active personality (existing behavior)
/personality edit

# Edit a specific preset
/personality edit --preset yoda --scope global
```

### Updated `/personality show` Command

```bash
# Display current personality with active preset info
/personality show
```

---

## Benefits

### ✅ Pros

1. **Clear separation**: Active config vs. presets library
2. **Trackable**: Know which preset is currently active
3. **Non-destructive**: Presets remain untouched when switching
4. **Flexible creation**: Create presets, activate immediately, or both
5. **Backup support**: Save current before switching
6. **User-friendly**: Simple slash command interface with clear indicators
7. **Extensible**: Easy to add more preset management features
8. **Minimal breaking changes**: Existing configs still work

### ⚠️ Cons

1. **Additional complexity**: Plugin config now tracks more state
2. **Migration needed**: Existing users may want to convert configs to presets
3. **Manual preset management**: Users must still place files in `personalities/` directory
4. **No sync**: Presets not automatically synced between machines

---

## Risk Assessment

| Risk                        | Severity | Mitigation                                              |
| --------------------------- | -------- | ------------------------------------------------------- |
| Breaking existing workflows | Low      | Keep default behavior for `/personality create`         |
| Overwriting user config     | Medium   | Add `--backup` flag, confirmation prompt                |
| State inconsistency         | Medium   | Validate activePreset points to existing preset on load |
| Invalid preset files        | Low      | Add JSON schema validation                              |
| Naming conflicts            | Low      | Clear precedence rules (project > global)               |

---

## Migration Path

### For Existing Users

1. **Current behavior preserved**: Existing single-file configs continue to work
2. **Opt-in upgrade**: Users can convert their current config to a preset:

   ```bash
   # Save current as preset, then it becomes "managed"
   /personality edit --preset my-default
   /personality switch my-default
   ```

### For New Users

1. Default setup creates presets library with examples
2. Quick-start wizard can create first preset and activate it

---

## Conclusion

**PROCEED WITH IMPLEMENTATION.**

This proposal fulfills all four requirements:

1. ✅ **Multiple personalities**: Presets stored in `personalities/` directories
2. ✅ **Modified creation**: `/personality create` supports preset-only, activate-only, or both
3. ✅ **Selection capability**: `/personality switch` lists and activates from available presets
4. ✅ **Current selection tracking**: `activePreset` and `activePresetScope` in plugin config

The design maintains backward compatibility while adding powerful preset management capabilities. The architecture is
clean, extensible, and follows existing patterns in the codebase.
