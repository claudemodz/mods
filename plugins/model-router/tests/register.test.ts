import type { AgentSpawnInput, CommandRunInput } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const SESSION = { surface: 'terminal' as const, isInteractive: true, cwd: '/work' }

function spawnOf(overrides: Partial<AgentSpawnInput>): AgentSpawnInput {
  return {
    tool_use_id: 'toolu_1',
    prompt: 'find the loader',
    description: 'Find loader',
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'opus',
    background: false,
    fork: false,
    ...overrides,
  }
}

function routerCommand(args: string): CommandRunInput {
  return {
    command: 'router',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  }
}

describe('register', () => {
  test('Explore subagents run on haiku by default', async ($, on) => {
    on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherit' }))
    expect(await $.agent.spawn(spawnOf({}))).toEqual({
      model: 'haiku',
    })
  })

  test('an explicit subagent model is kept', async ($, on) => {
    on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherit' }))
    expect(
      await $.agent.spawn(spawnOf({ model: 'opus' })),
    ).toEqual({ model: 'opus' })
  })

  test('/router fast reports the preset and main steps use the fast model', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    const seen: string[] = []
    on('turn.step', async function* ($, e) {
      seen.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
    })

    await $.session.start(SESSION)
    expect(await $.command.run(routerCommand('fast'))).toEqual({
      text: 'main session: fast (sonnet) · subagents routed: none yet',
    })

    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'opus', messageCount: 1 })
    for await (const _chunk of stream) {
      // drain
    }
    await stream.result
    expect(seen).toEqual(['sonnet'])
  })

  test('subagent steps keep their own model under a preset', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    const seen: string[] = []
    on('turn.step', async function* ($, e) {
      seen.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
    })

    await $.session.start(SESSION)
    await $.command.run(routerCommand('smart'))
    const stream = $.turn.step({ turnId: 't2', index: 0, model: 'haiku', messageCount: 1, agentId: 'a1' })
    for await (const _chunk of stream) {
      // drain
    }
    await stream.result
    expect(seen).toEqual(['haiku'])
  })

  test('an unknown argument prints usage', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    await $.session.start(SESSION)
    expect(await $.command.run(routerCommand('turbo'))).toEqual({
      text: 'Usage: /router [fast|smart|off]',
    })
  })
})
