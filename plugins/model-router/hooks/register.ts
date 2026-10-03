import type { On, PluginOptions } from 'claude-code'

import {
  parseModelMap,
  parsePreset,
  presetModel,
  routedModel,
  statusText,
  type Preset,
} from './routing.js'

export function register(on: On, options: PluginOptions): void {
  const map = parseModelMap(String(options.subagentModels ?? ''))
  const models = {
    fast: String(options.fastModel ?? 'sonnet'),
    smart: String(options.smartModel ?? 'opus'),
  }
  const routed = new Map<string, number>()
  let preset: Preset = 'off'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'router',
      description: 'Show model routing, or set the main session to fast, smart or off',
      argumentHint: '[fast|smart|off]',
      immediate: true,
    })
    return next(e)
  })

  on('agent.spawn', ($, e, next) => {
    const model = routedModel(e, map)
    if (model === undefined) return next(e)
    routed.set(e.subagentType, (routed.get(e.subagentType) ?? 0) + 1)
    return next({ ...e, model })
  })

  on('turn.step', async function* ($, e, next) {
    const model = e.agentId === undefined ? presetModel(preset, models) : undefined
    return yield* next(model === undefined ? e : { ...e, model })
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    const model = presetModel(preset, models)
    if (model === undefined) return next(e)
    return next({ ...e, props: { ...e.props, suffix: `${e.props.suffix ?? ''} · ${model}` } })
  })

  on('command.run', { command: 'router' }, ($, e) => {
    const choice = parsePreset(e.args)
    if (choice === 'invalid') return { text: 'Usage: /router [fast|smart|off]' }
    if (choice !== 'status') {
      preset = choice
      $.ui.invalidate('ui.render')
    }
    return { text: statusText(preset, models, routed) }
  })
}
