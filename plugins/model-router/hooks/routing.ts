export type Preset = 'off' | 'fast' | 'smart'

export type PresetModels = { readonly fast: string; readonly smart: string }

export type SpawnFacts = {
  readonly subagentType: string
  readonly model?: string
  readonly fork: boolean
}

/** `Explore=haiku,Plan=sonnet` → Map { Explore → haiku, Plan → sonnet }. */
export function parseModelMap(spec: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const pair of spec.split(',')) {
    const [agent, model] = pair.split('=').map(part => part.trim())
    if (agent && model) map.set(agent, model)
  }
  return map
}

/** The model to give a subagent, or undefined to leave the spawn as it is. */
export function routedModel(
  spawn: SpawnFacts,
  map: ReadonlyMap<string, string>,
): string | undefined {
  if (spawn.fork || spawn.model !== undefined) return undefined
  return map.get(spawn.subagentType)
}

export function parsePreset(args: string): Preset | 'status' | 'invalid' {
  const word = args.trim().toLowerCase()
  if (word === '') return 'status'
  if (word === 'off' || word === 'fast' || word === 'smart') return word
  return 'invalid'
}

export function presetModel(preset: Preset, models: PresetModels): string | undefined {
  return preset === 'off' ? undefined : models[preset]
}

export function statusText(
  preset: Preset,
  models: PresetModels,
  routed: ReadonlyMap<string, number>,
): string {
  const main = preset === 'off' ? 'main session: unchanged' : `main session: ${preset} (${models[preset]})`
  const counts = [...routed].map(([type, n]) => `${type} ×${n}`).join(', ')
  return `${main} · subagents routed: ${counts || 'none yet'}`
}
