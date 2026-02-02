import type { PersonalityFile, ParsedCommand, ConfigResult, CommandOutput } from "../types.js"
import {
  mergeWithDefaults,
  resolveScope,
  resolveScopePath,
  formatConfigOutput,
  writePersonalityFile,
  parseBoolean,
  parseNumber,
} from "../config.js"
import { existsSync, unlinkSync } from "node:fs"

function normalizeToken(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1)
  }
  return token
}

function tokenizeArgs(raw: string): string[] {
  const tokens = raw.match(/"[^"]*"|'[^']*'|\S+/g)
  if (!tokens) return []
  return tokens.map(token => normalizeToken(token))
}

export function parseCommandArgs(raw: string): ParsedCommand {
  const tokens = tokenizeArgs(raw.trim())
  const flags: Record<string, string | boolean> = {}
  const values: Record<string, string> = {}
  let subcommand: string | null = null

  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    if (token === undefined) {
      index += 1
      continue
    }

    if (!subcommand && !token.startsWith("--") && !token.includes("=")) {
      subcommand = token.toLowerCase()
      index += 1
      continue
    }

    if (token.startsWith("--")) {
      const flagName = token.slice(2)
      const next = tokens[index + 1]
      if (next && !next.startsWith("--") && !next.includes("=")) {
        flags[flagName] = next
        index += 2
      } else {
        flags[flagName] = true
        index += 1
      }
      continue
    }

    if (token.includes("=")) {
      const [key, ...rest] = token.split("=")
      if (key !== undefined) {
        values[key] = rest.join("=")
      }
      index += 1
      continue
    }

    index += 1
  }

  return { subcommand, flags, values }
}

function buildPersonalityHelp(): string {
  return [
    "Usage:",
    "  /personality create [--scope project|global]",
    "  /personality edit [--scope project|global] [--field <name> --value <value>]",
    "  /personality show",
    "  /personality reset [--scope project|global] --confirm",
    "",
    "Fields for --field:",
    "  name, description, emoji, slangIntensity, mood.enabled, mood.default, mood.drift",
  ].join("\n")
}

function buildCreatePrompt(scope: string): string {
  return `The user wants to create a new personality configuration (scope: ${scope}).

Please help them by asking about their preferences. Collect the following information. Use structured questions (TUI) if you have the tool. Otherwise through conversation.:

1. **Name** (optional): What name should the assistant use when asked who it is?
2. **Description** (required): Describe the personality in a few sentences. This shapes how the assistant behaves and responds.
3. **Emoji usage**: Should the assistant use emojis in responses? (yes/no)
4. **Slang intensity**: How much slang should be used? (none, light, moderate, heavy)
5. **Mood system**: Should the assistant's mood drift over time? (yes/no)
   - If yes, what should be the default mood? (e.g., happy, calm, energetic)

Once you have gathered all the information, use the \`savePersonality\` tool to save the configuration with scope="${scope}".

Start by giving the user the list above, and asking the user to describe the personality they want.`
}

function buildEditPrompt(scope: string, currentConfig: PersonalityFile): string {
  return `The user wants to edit their personality configuration (scope: ${scope}).

Current configuration:
\`\`\`json
${JSON.stringify(currentConfig, null, 2)}
\`\`\`

Ask what they would like to change. They can modify:
- name, description, emoji usage, slang intensity
- mood settings (enabled, default mood, drift amount)
- custom moods

Once you understand what changes they want, use the \`savePersonality\` tool to save the updated configuration with scope="${scope}".

Start by asking what aspect of the personality they'd like to modify.`
}

function applyFieldUpdate(
  config: PersonalityFile,
  field: string,
  value: string
): PersonalityFile {
  const trimmed = value.trim()
  if (!trimmed) return config

  switch (field) {
    case "name":
      return { ...config, name: trimmed }
    case "description":
      return { ...config, description: trimmed }
    case "emoji": {
      const parsed = parseBoolean(trimmed)
      if (parsed === null) return config
      return { ...config, emoji: parsed }
    }
    case "slangIntensity": {
      const parsed = parseNumber(trimmed)
      if (parsed === null) return config
      return { ...config, slangIntensity: parsed }
    }
    case "mood.enabled": {
      const parsed = parseBoolean(trimmed)
      if (parsed === null) return config
      return { ...config, mood: { ...config.mood, enabled: parsed } }
    }
    case "mood.default":
      return { ...config, mood: { ...config.mood, default: trimmed } }
    case "mood.drift": {
      const parsed = parseNumber(trimmed)
      if (parsed === null) return config
      return { ...config, mood: { ...config.mood, drift: parsed } }
    }
    default:
      return config
  }
}

export async function handlePersonalityCommand(
  args: string,
  config: PersonalityFile,
  configResult: ConfigResult,
  output: CommandOutput
): Promise<void> {
  const parsed = parseCommandArgs(args)
  const sub = parsed.subcommand
  const currentConfig = mergeWithDefaults(config)
  const scope = resolveScope(parsed.flags, configResult)
  const scopePath = resolveScopePath(scope, configResult)

  if (!sub || sub === "help") {
    output.parts.push({
      type: "text",
      text: buildPersonalityHelp(),
    })
    return
  }

  if (sub === "show") {
    output.parts.push({
      type: "text",
      text: formatConfigOutput(currentConfig),
    })
    return
  }

  if (sub === "create") {
    output.parts.push({
      type: "text",
      text: buildCreatePrompt(scope),
    })
    return
  }

  if (sub === "edit") {
    const field = typeof parsed.flags.field === "string" ? parsed.flags.field : null
    const value = typeof parsed.flags.value === "string" ? parsed.flags.value : null

    if (field && value) {
      const nextConfig = applyFieldUpdate(currentConfig, field, value)
      writePersonalityFile(scopePath, nextConfig)
      output.parts.push({
        type: "text",
        text: `Updated ${field} in ${scope}.`,
      })
      return
    }

    output.parts.push({
      type: "text",
      text: buildEditPrompt(scope, currentConfig),
    })
    return
  }

  if (sub === "reset") {
    const confirmed = parsed.flags.confirm === true

    if (!confirmed) {
      output.parts.push({
        type: "text",
        text: `To reset personality config for ${scope}, run:\n  /personality reset --scope ${scope} --confirm`,
      })
      return
    }

    if (existsSync(scopePath)) {
      unlinkSync(scopePath)
      output.parts.push({
        type: "text",
        text: `Personality reset for ${scope}.`,
      })
    } else {
      output.parts.push({
        type: "text",
        text: `No personality config found for ${scope}.`,
      })
    }
    return
  }

  output.parts.push({
    type: "text",
    text: `Unknown subcommand: ${sub}\n\n${buildPersonalityHelp()}`,
  })
}
