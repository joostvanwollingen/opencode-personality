# OpenCode Personality Plugin

**Stop talking to a machine. Give your AI a soul.**

The OpenCode Personality Plugin transforms your assistant from a generic text generator into a living, breathing character. With a sophisticated mood state machine and deep configuration options, your AI doesn't just follow instructions—it responds with attitude, emotion, and a personality that evolves over time.

> **Note:** This project is not built by the OpenCode team and is not affiliated with OpenCode in any way.

<div align="center">

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/joostvanwollingen/opencode-personality/pr.yml)
[![NPM Downloads](https://img.shields.io/npm/dy/opencode-personality)](https://www.npmjs.com/package/opencode-personality)
![GitHub Release](https://img.shields.io/github/v/release/joostvanwollingen/opencode-personality)

</div>

## Example

<p align="center">
  <img src="docs/images/personality.jpeg" alt="Personality configuration" width="600">
  <br>
  <em>Personality configuration</em>
</p>

<p align="center">
  <img src="docs/images/response.jpeg" alt="Example response with personality" width="600">
  <br>
  <em>Example response with personality applied</em>
</p>

## Features

- **Custom Personality**: Define name, description, emoji usage, and slang intensity.
- **Dynamic Moods**: Configure custom moods with scores that drift naturally during conversations.
- **Intelligent Merging**: Global and project-level configs allow for project-specific overrides.
- **Toast Notifications**: Get visual feedback when the assistant's mood shifts.
- **Interactive Commands**: Manage your assistant's persona directly from the chat.
- **Personality Switching**: Save and switch between multiple personalities with backup support.
- **JSON Schema Validation**: All personality files are validated against a JSON schema.
- **Global & Project Presets**: Store personalities in user space or project directories.


## Installation

Add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-personality"],
  "command": {
    "mood": {
      "description": "Set the assistant's mood [mood: bored, angry, lethargic] [duration: message, session, permanent]",
      "template": "Call the setMood tool to set the mood to the mood and duration requested by the user. If the duration is not mentioned assume session."
    },
    "personality": {
      "description": "Manage personality config: create/edit/show/reset",
      "template": "Call the appropriate personality management tool based on the user's request to create, edit, show, or reset the personality configuration."
    }
  }
}
```

> **Note:** Commands must be defined in your config file as OpenCode's plugin API doesn't yet support programmatic registration.

## Quick Start

1. Run `opencode`
2. Use `/personality create` to have the assistant guide you through setup.
3. Use `/personality switch` to select from available personalities.

### Manual Setup

Create a config at `~/.config/opencode/personality.json` (global) or `.opencode/personality.json` (project):

**Note:** All personality files must include a `$schema` property referencing the JSON schema:
```json
{
  "$schema": "https://raw.githubusercontent.com/pantheon-org/opencode-personality/main/schema/personality.schema.json",
  "name": "Claude",
  ...
}
```

```json
{
  "name": "Claude",
  "description": "A helpful, knowledgeable assistant with a calm demeanor.",
  "emoji": true,
  "slangIntensity": 0.2,
  "mood": {
    "enabled": true,
    "default": "happy",
    "drift": 0.2
  }
}
```

## Configuration Reference

### File Structure

Personalities can be stored in two locations:

```bash
~/.config/opencode/personalities/     # Global personalities (available everywhere)
.opencode/personalities/              # Project-local personalities (project specific)
```

Active personality configuration:
```bash
~/.config/opencode/personality.json   # Global active config
.opencode/personality.json            # Project active config
```

### JSON Schema Validation

All personality files are validated against a JSON Schema. The schema is available at:
```
https://raw.githubusercontent.com/pantheon-org/opencode-personality/main/schema/personality.schema.json
```

Add this to your personality files for IDE support:
```json
{
  "$schema": "https://raw.githubusercontent.com/pantheon-org/opencode-personality/main/schema/personality.schema.json",
  "name": "My Assistant",
  ...
}
```

### PersonalityFile

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `""` | Name the assistant uses when asked |
| `description` | string | `""` | Personality description injected into prompts |
| `emoji` | boolean | `false` | Whether to use emojis in responses |
| `slangIntensity` | number | `0` | Slang usage intensity (0-1) |
| `activePreset` | string | - | Name of currently active preset |
| `activePresetScope` | string | - | Scope of active preset (`global` or `project`) |
| `moods` | MoodDefinition[] | (defaults) | Custom mood definitions |
| `mood` | MoodConfig | (see below) | Mood system configuration |

### MoodConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable mood drift system |
| `default` | string | `"happy"` | Default mood when no override is active |
| `drift` | number | `0.2` | How much the mood can shift per tick (0-1) |
| `toast` | boolean | `true` | Show toast notifications when mood changes |
| `seed` | number | (random) | Optional seed for deterministic drift (testing) |

### MoodDefinition

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique mood identifier |
| `hint` | string | Prompt hint describing how mood affects responses |
| `score` | number | Numeric score for drift calculations |

### Default Moods

| Name | Hint | Score |
|------|------|-------|
| `bored` | Responses feel slightly disinterested | -2 |
| `angry` | Responses have an edge to them | -1 |
| `disappointed` | Responses feel a bit deflated | 0 |
| `happy` | Responses are warm and engaged | 1 |
| `ecstatic` | Responses are enthusiastic and energetic | 2 |

## Commands

### `/mood [mood|status]`

Check or set the current mood permanently.

```bash
/mood status    # Show current mood status
/mood happy     # Set mood to "happy" permanently
```

### `/personality <subcommand>`

Manage personality configuration.

| Subcommand | Description |
|------------|-------------|
| `show` | Display the merged configuration |
| `create` | Interactive setup (use `--scope global` for global) |
| `edit` | Interactive edit or direct update with `--field` and `--value` |
| `reset` | Delete the config file (requires `--confirm`) |
| `switch` | Switch to a different personality preset |
| `restore` | Restore a personality from backup |
| `list` | List available personalities with optional filtering |

**Examples:**
```bash
# Basic usage
/personality show
/personality create --scope global
/personality edit --field emoji --value true
/personality reset --scope project --confirm

# Switch personalities
/personality switch rick                    # Switch to preset 'rick'
/personality switch --file ./custom.json    # Import from file

# Restore from backup
/personality restore rick                    # Restore rick from backup
/personality restore --list                  # List available backups

# List with filters
/personality list                            # List all personalities
/personality list --preset-only              # List only presets
/personality list --backups                  # List available backups
```

**Available Flags:**

| Flag | Description | Commands |
|------|-------------|----------|
| `--scope` | Target scope: `global` or `project` | create, edit, reset |
| `--confirm` | Confirm destructive operation | reset |
| `--field` | Field name to edit | edit |
| `--value` | Field value to set | edit |
| `--preset-only` | Show only preset personalities | list |
| `--as-preset` | Save as preset with name | create, edit |
| `--file` | Import personality from JSON file | switch |
| `--preset` | Edit a specific preset | edit |
| `--backup` | Create backup before changing | use, create, edit, delete |
| `--backups` | List available backups | list, restore |

## Tools

### `setMood`

Override the current mood with optional duration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mood` | string | Yes | Name of the mood to set |
| `duration` | string | No | `"message"`, `"session"` (default), or `"permanent"` |

## Custom Moods Example

```json
{
  "name": "Surfer Dude",
  "description": "A laid-back California surfer who sees life as one big wave.",
  "emoji": true,
  "slangIntensity": 0.8,
  "moods": [
    { "name": "gnarly", "hint": "Things are rough, bro. Keep it chill but acknowledge the struggle.", "score": -2 },
    { "name": "mellow", "hint": "Just vibing. Relaxed and easy-going responses.", "score": 0 },
    { "name": "stoked", "hint": "Hyped up! Enthusiastic and excited about everything.", "score": 2 },
    { "name": "epic", "hint": "This is LEGENDARY! Maximum excitement and positive energy!", "score": 3 }
  ],
  "mood": {
    "enabled": true,
    "default": "mellow",
    "drift": 0.3
  }
}
```

**Tip:** Checkout the `examples` folder for more prebuilt personalities.

## License

MIT
