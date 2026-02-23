import type {
  PersonalityDefinition,
  MoodDefinition,
  ConfigResult,
  CommandOutput,
} from "../types.js"
import { loadMoodState, saveMoodState } from "../config.js"

export function handleMoodCommand(
  args: string,
  statePath: string,
  config: PersonalityDefinition,
  moods: MoodDefinition[],
  activeKey: string,
  configResult: ConfigResult,
  output: CommandOutput
): void {
  const trimmed = args.trim().toLowerCase()
  const state = loadMoodState(statePath, config, activeKey)

  if (!trimmed || trimmed === "status") {
    output.parts.push({
      type: "text",
      text: `Current mood: **${state.current}** (score: ${state.score.toFixed(2)})${state.override ? ` [override: ${state.override}]` : ""}\nActive personality: ${activeKey}\nConfig source: ${configResult.source}`,
    })
    return
  }

  if (!moods.some(item => item.name === trimmed)) {
    output.parts.push({
      type: "text",
      text: `Invalid mood. Choose from: ${moods.map(item => item.name).join(", ")}`,
    })
    return
  }

  state.override = trimmed
  state.current = trimmed
  state.overrideExpiry = null
  saveMoodState(statePath, state, activeKey)

  output.parts.push({
    type: "text",
    text: `Mood set to **${trimmed}**`,
  })
}
