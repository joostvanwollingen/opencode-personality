import type { MoodState, MoodDefinition, PersonalityFile, MoodName, PluginClient } from './types.js';
import { saveMoodState } from './config.js';

export function scoreToMood(score: number, moods: MoodDefinition[]): MoodName {
  if (moods.length === 0) return 'happy';

  const sorted = [...moods].sort((a, b) => a.score - b.score);
  let closest = sorted[0]!;
  let bestDistance = Math.abs(score - closest.score);

  for (const mood of sorted.slice(1)) {
    const distance = Math.abs(score - mood.score);
    if (distance < bestDistance) {
      closest = mood;
      bestDistance = distance;
    }
  }

  return closest.name;
}

export function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function driftMood(
  state: MoodState,
  config: PersonalityFile,
  moods: MoodDefinition[],
  seed?: number,
): MoodState {
  if (state.override && (!state.overrideExpiry || Date.now() < state.overrideExpiry)) {
    return { ...state, current: state.override, lastUpdate: Date.now() };
  }

  const baseState =
    state.overrideExpiry && Date.now() >= state.overrideExpiry
      ? { ...state, override: null, overrideExpiry: null }
      : state;

  const random = seed !== undefined ? seededRandom(seed + baseState.lastUpdate) : Math.random();
  const driftAmount = (random - 0.5) * 2 * config.mood.drift;
  const minScore = Math.min(...moods.map((mood) => mood.score));
  const maxScore = Math.max(...moods.map((mood) => mood.score));
  const newScore = Math.max(minScore, Math.min(maxScore, baseState.score + driftAmount));

  return {
    ...baseState,
    score: newScore,
    current: scoreToMood(newScore, moods),
    lastUpdate: Date.now(),
  };
}

export async function driftMoodWithToast(
  statePath: string,
  state: MoodState,
  config: PersonalityFile,
  moods: MoodDefinition[],
  seed: number | undefined,
  client: PluginClient,
): Promise<MoodState> {
  const previousMood = state.current;
  const nextState = driftMood(state, config, moods, seed);
  saveMoodState(statePath, nextState);

  if (nextState.current !== previousMood && config.mood.toast) {
    await client.tui.showToast({
      body: {
        title: 'Mood shifted',
        message: `${previousMood} → ${nextState.current}`,
        variant: 'info',
      },
    });
  }

  return nextState;
}

export function resolveMoodHint(mood: MoodName, moods: MoodDefinition[]): string {
  const match = moods.find((item) => item.name === mood);
  return match?.hint ?? 'Use a tone that matches the current mood.';
}
