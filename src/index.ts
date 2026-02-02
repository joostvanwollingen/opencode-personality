import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import type { CommandOutput } from "./types.js"
import {
  loadConfigWithPrecedence,
  resolveMoods,
  loadMoodState,
  mergeWithDefaults,
} from "./config.js"
import { buildPersonalityPrompt } from "./prompt.js"
import { driftMoodWithToast } from "./mood.js"
import { createSetMoodTool } from "./tools/setMood.js"
import { createSavePersonalityTool } from "./tools/savePersonality.js"
import { handleMoodCommand } from "./commands/mood.js"
import { handlePersonalityCommand } from "./commands/personality.js"

function isCommandOutput(value: unknown): value is CommandOutput {
  return (
    typeof value === "object" &&
    value !== null &&
    "parts" in value &&
    Array.isArray((value as CommandOutput).parts)
  )
}

const personalityPlugin: Plugin = async (input: PluginInput) => {
  const { directory, client } = input
  const configResult = loadConfigWithPrecedence(directory)

  const savePersonalityTool = createSavePersonalityTool(configResult, client)

  if (configResult.config === null) {
    const emptyConfig = mergeWithDefaults({})

    return {
      tool: {
        savePersonality: savePersonalityTool,
      },

      "command.execute.before": async (cmdInput, output) => {
        if (cmdInput.command === "personality" && isCommandOutput(output)) {
          await handlePersonalityCommand(cmdInput.arguments, emptyConfig, configResult, output)
        }
      },
    }
  }

  const config = configResult.config
  const { statePath } = configResult
  const moods = resolveMoods(config)

  const setMoodTool = createSetMoodTool(statePath, config, moods, client)

  return {
    tool: {
      setMood: setMoodTool,
      savePersonality: savePersonalityTool,
    },

    "command.execute.before": async (cmdInput, output) => {
      if (!isCommandOutput(output)) return

      if (cmdInput.command === "personality") {
        await handlePersonalityCommand(cmdInput.arguments, config, configResult, output)
        return
      }

      if (cmdInput.command === "mood") {
        handleMoodCommand(cmdInput.arguments, statePath, config, moods, configResult, output)
      }
    },

    "experimental.chat.system.transform": async (_hookInput, output) => {
      let state = loadMoodState(statePath, config)

      if (config.mood.enabled) {
        state = await driftMoodWithToast(statePath, state, config, moods, config.mood.seed, client)
      }

      const prompt = buildPersonalityPrompt(config, state.current, moods)
      output.system.push(`<personality>\n${prompt}\n</personality>`)
    },

    "experimental.session.compacting": async (_hookInput, output) => {
      const state = loadMoodState(statePath, config)
      output.context.push(
        `Assistant personality: ${config.description}. Current mood: ${state.current}.`
      )
    },

    event: async ({ event }) => {
      if (event.type === "message.updated" && config.mood.enabled) {
        const msg = event.properties as { info?: { sessionID?: string; role?: string } }
        if (msg.info?.sessionID && msg.info.role === "assistant") {
          const state = loadMoodState(statePath, config)
          await driftMoodWithToast(statePath, state, config, moods, config.mood.seed, client)
        }
      }
    },
  }
}

export default personalityPlugin
