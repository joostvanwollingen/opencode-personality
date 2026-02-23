import type {
  PersonalityDefinition,
  PersonalityFile,
  ParsedCommand,
  ConfigResult,
  CommandOutput,
} from "../types.js"
import {
  mergeWithDefaults,
  resolveScope,
  resolveScopePath,
  formatConfigOutput,
  writePersonalityFile,
  savePersonalityToFile,
  loadPersonalityFile,
  listPersonalities,
  removePersonality,
  switchActiveInFile,
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
  const args: string[] = []
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

    // Positional arg after subcommand
    args.push(token)
    index += 1
  }

  return { subcommand, args, flags, values }
}

function buildPersonalityHelp(): string {
  return [
    "Usage:",
    "  /personality create [--scope project|global]",
    "  /personality edit [--scope project|global] [--field <name> --value <value>]",
    "  /personality show [--all]",
    "  /personality list",
    "  /personality switch <name>",
    "  /personality reset [--scope project|global] [--name <name>] --confirm",
    "",
    "Fields for --field:",
    "  name, description, emoji, slangIntensity, mood.enabled, mood.default, mood.drift",
  ].join("\n")
}

function buildCreatePrompt(scope: string): string {
  return `The user wants to create a new personality configuration (scope: ${scope}).

Please help them by asking about their preferences. Collect the following information. Use structured questions (TUI) if you have the tool. Otherwise through conversation.:

1. **Name** (required): A unique name/identifier for this personality. This is also used as the display name.
2. **Description** (required): Describe the personality in a few sentences. This shapes how the assistant behaves and responds.
3. **Emoji usage**: Should the assistant use emojis in responses? (yes/no)
4. **Slang intensity**: How much slang should be used? (none, light, moderate, heavy)
5. **Mood system**: Should the assistant's mood drift over time? (yes/no)
   - If yes, what should be the default mood? (e.g., happy, calm, energetic)

Once you have gathered all the information, use the \`savePersonality\` tool to save the configuration with scope="${scope}".
The personality will be added to the collection and set as the active personality.

Start by giving the user the list above, and asking the user to describe the personality they want.`
}

function buildEditPrompt(
  scope: string,
  config: PersonalityDefinition,
  activeKey: string
): string {
  return `The user wants to edit the active personality "${activeKey}" (scope: ${scope}).

Current configuration:
\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

Ask what they would like to change. They can modify:
- name, description, emoji usage, slang intensity
- mood settings (enabled, default mood, drift amount)
- custom moods

Once you understand what changes they want, use the \`savePersonality\` tool to save the updated configuration with scope="${scope}".

Start by asking what aspect of the personality they'd like to modify.`
}

function applyFieldUpdate(
  config: PersonalityDefinition,
  field: string,
  value: string
): PersonalityDefinition {
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

function formatPersonalityList(file: PersonalityFile): string {
  const names = listPersonalities(file)
  const lines = names.map(n =>
    n === file.active ? `  * ${n} (active)` : `    ${n}`
  )
  return lines.join("\n")
}

export async function handlePersonalityCommand(
  args: string,
  configResult: ConfigResult,
  output: CommandOutput
): Promise<void> {
  const parsed = parseCommandArgs(args)
  const sub = parsed.subcommand
  const config = configResult.config
    ? mergeWithDefaults(configResult.config)
    : mergeWithDefaults({})
  const file = configResult.file
  const activeKey = file?.active ?? "default"
  const scope = resolveScope(parsed.flags, configResult)
  const scopePath = resolveScopePath(scope, configResult)

  if (!sub || sub === "help") {
    output.parts.push({
      type: "text",
      text: buildPersonalityHelp(),
    })
    return
  }

  if (sub === "list") {
    if (!file) {
      output.parts.push({
        type: "text",
        text: "No personalities configured. Use `/personality create` to create one.",
      })
      return
    }
    output.parts.push({
      type: "text",
      text: `Personalities:\n${formatPersonalityList(file)}`,
    })
    return
  }

  if (sub === "switch") {
    if (!file) {
      output.parts.push({
        type: "text",
        text: "No personalities configured. Use `/personality create` to create one.",
      })
      return
    }

    const targetName = parsed.args[0]
    if (!targetName) {
      output.parts.push({
        type: "text",
        text: `Available personalities:\n${formatPersonalityList(file)}\n\nUsage: /personality switch <name>`,
      })
      return
    }

    if (!(targetName in file.personalities)) {
      const names = listPersonalities(file)
      output.parts.push({
        type: "text",
        text: `Personality "${targetName}" not found.\nAvailable: ${names.join(", ")}`,
      })
      return
    }

    if (targetName === file.active) {
      output.parts.push({
        type: "text",
        text: `"${targetName}" is already the active personality.`,
      })
      return
    }

    switchActiveInFile(scopePath, targetName)
    output.parts.push({
      type: "text",
      text: `Switched active personality to "${targetName}". Restart the session for the change to take full effect.`,
    })
    return
  }

  if (sub === "show") {
    if (parsed.flags.all && file) {
      output.parts.push({
        type: "text",
        text: `Active: ${activeKey}\n\n${JSON.stringify(file, null, 2)}`,
      })
    } else {
      output.parts.push({
        type: "text",
        text: `Active personality: ${activeKey}\n\n${formatConfigOutput(config)}`,
      })
    }
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
      if (!file) {
        output.parts.push({
          type: "text",
          text: "No personality to edit. Use `/personality create` first.",
        })
        return
      }
      const nextConfig = applyFieldUpdate(config, field, value)
      savePersonalityToFile(scopePath, activeKey, nextConfig, false)
      output.parts.push({
        type: "text",
        text: `Updated ${field} for "${activeKey}" in ${scope}.`,
      })
      return
    }

    output.parts.push({
      type: "text",
      text: buildEditPrompt(scope, config, activeKey),
    })
    return
  }

  if (sub === "reset") {
    const confirmed = parsed.flags.confirm === true
    const targetName =
      typeof parsed.flags.name === "string" ? parsed.flags.name : null

    if (!confirmed) {
      if (targetName) {
        output.parts.push({
          type: "text",
          text: `To remove personality "${targetName}" from ${scope}, run:\n  /personality reset --name ${targetName} --scope ${scope} --confirm`,
        })
      } else {
        output.parts.push({
          type: "text",
          text: `To reset all personality config for ${scope}, run:\n  /personality reset --scope ${scope} --confirm`,
        })
      }
      return
    }

    if (targetName) {
      // Remove specific personality from scope-specific file
      const scopeFile = loadPersonalityFile(scopePath)
      if (!scopeFile) {
        output.parts.push({
          type: "text",
          text: `No personality config found for ${scope}.`,
        })
        return
      }

      if (!(targetName in scopeFile.personalities)) {
        const names = listPersonalities(scopeFile)
        output.parts.push({
          type: "text",
          text: `Personality "${targetName}" not found in ${scope}.\nAvailable in ${scope}: ${names.join(", ")}`,
        })
        return
      }

      const nextFile = removePersonality(scopeFile, targetName)
      if (!nextFile) {
        if (existsSync(scopePath)) unlinkSync(scopePath)
        output.parts.push({
          type: "text",
          text: `Removed "${targetName}" (last personality). Config file deleted for ${scope}.`,
        })
      } else {
        writePersonalityFile(scopePath, nextFile)
        output.parts.push({
          type: "text",
          text: `Removed personality "${targetName}" from ${scope}.${scopeFile.active === targetName ? ` Active personality switched to "${nextFile.active}".` : ""}`,
        })
      }
      return
    }

    // Reset entire file
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
