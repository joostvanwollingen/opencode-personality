# OpenCode Personality Plugin

A configurable personality and mood system plugin for [OpenCode](https://opencode.ai). Give your AI assistant a distinct personality with customizable moods that drift over time.

> **Note:** This project is not built by the OpenCode team and is not affiliated with OpenCode in any way.

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

- **Custom Personality**: Define your assistant's name, description, emoji usage, and slang intensity
- **Dynamic Moods**: Configure custom moods with scores that drift naturally during conversations
- **Multiple personalities**: Global and project-level configs with intelligent merging allow you to have a personality for all of your projects and to override per project.
- **Toast Notifications**: Get notified when the mood shifts
- **Commands**: Interactive commands to manage personality and mood
- **Session Compaction**: Personality context preserved during session compaction

## Installation

### From npm

```bash
npm install opencode-personality
```

Then add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-personality"]
}
```

### From Source

Clone the repository and add to `opencode.json`:

```json
{
  "plugin": ["./path/to/opencode-personality/src/index.ts"]
}
```

## Quick Start

1. Run `opencode`
2. Use `/personality create` to have the assistant guide you through creating a configuration interactively.

### Manual Setup

1. Create a personality config file at `~/.config/opencode/personality.json` (global) or `.opencode/personality.json` (project):

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

2. Start OpenCode - the personality will be automatically applied!

3. Use `/mood` to check or change the current mood.

## Configuration Reference

### PersonalityFile

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `""` | Name the assistant uses when asked |
| `description` | string | `""` | Personality description injected into prompts |
| `emoji` | boolean | `false` | Whether to use emojis in responses |
| `slangIntensity` | number | `0` | Slang usage intensity (0-1). 0=none, 0.3=light, 0.7=heavy |
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

If `moods` is not specified, these defaults are used:

| Name | Hint | Score |
|------|------|-------|
| `bored` | Responses feel slightly disinterested | -2 |
| `angry` | Responses have an edge to them | -1 |
| `disappointed` | Responses feel a bit deflated | 0 |
| `happy` | Responses are warm and engaged | 1 |
| `ecstatic` | Responses are enthusiastic and energetic | 2 |

## Commands

### `/mood [mood|status]`

Check or set the current mood.

```
/mood           # Show current mood status
/mood status    # Same as above
/mood happy     # Set mood to "happy" permanently
```

**Note:** The `/mood` command sets moods permanently. For temporary overrides (message or session duration), use the `setMood` tool.

### `/personality <subcommand>`

Manage personality configuration.

| Subcommand | Description |
|------------|-------------|
| `show` | Display the merged configuration |
| `create` | Start an interactive conversation to create a new config |
| `edit` | Start an interactive conversation to modify the config |
| `edit --field <name> --value <value>` | Directly update a specific field |
| `reset --confirm` | Delete the personality config file |

**Examples:**

```
/personality show                                    # Show merged config
/personality create                                  # Create config (project scope)
/personality create --scope global                   # Create config (global scope)
/personality edit                                    # Edit config interactively
/personality edit --field name --value "Assistant"  # Update single field
/personality edit --field emoji --value true        # Enable emojis
/personality reset --scope project --confirm        # Delete project config
```

**Editable fields:** `name`, `description`, `emoji`, `slangIntensity`, `mood.enabled`, `mood.default`, `mood.drift`

## Tools

The plugin exposes tools that the LLM can use during conversations.

### `setMood`

Override the current mood with optional duration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mood` | string | Yes | Name of the mood to set |
| `duration` | string | No | `"message"`, `"session"` (default), or `"permanent"` |

**Duration options:**
- `message`: Override lasts for the next response only
- `session`: Override lasts until OpenCode restarts (default)
- `permanent`: Override persists across sessions

### `savePersonality`

Save a personality configuration. Used by the assistant when you run `/personality create` or `/personality edit`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `description` | string | Yes | Personality description |
| `name` | string | No | Name for the assistant |
| `emoji` | boolean | No | Enable emoji usage |
| `slangIntensity` | number | No | Slang level (0-1) |
| `moodEnabled` | boolean | No | Enable mood system |
| `moodDefault` | string | No | Default mood name |
| `moodDrift` | number | No | Drift amount (0-1) |
| `moodToast` | boolean | No | Show toast on mood change (default: true) |
| `moods` | array | No | Custom mood definitions |
| `scope` | string | No | `"project"` (default) or `"global"` |

## Custom Moods Example

Create moods tailored to your assistant's personality:

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

**Tip:** Checkout the `examples`-folder for a few prebuilt personalities.

## Config Precedence

1. **Project config** (`.opencode/personality.json`) takes precedence
2. **Global config** (`~/.config/opencode/personality.json`) is used as fallback
3. When both exist, they are **deep merged** with project values overriding global

## How It Works

1. **System Prompt Injection**: The plugin injects personality traits into the system prompt via the `experimental.chat.system.transform` hook
2. **Mood Drift**: After each assistant response, the mood score drifts randomly within the configured `drift` amount
3. **Mood Resolution**: The current score maps to the nearest defined mood by score value
4. **Toast Notifications**: When the mood changes, a toast notification appears
5. **Session Compaction**: During session compaction, the personality context is preserved

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

## License

MIT
