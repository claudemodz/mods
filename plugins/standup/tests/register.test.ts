import type { CommandRunInput, On, TurnCompleteInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import type { WorkRecord } from '../hooks/records.js'

const SESSION = { surface: 'terminal' as const, isInteractive: true, cwd: '/work/app' }
const NOW = new Date(2026, 9, 3, 15, 0).getTime()

function standup(args = ''): CommandRunInput {
  return { command: 'standup', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }
}

const ANSWERED: TurnCompleteInput = {
  answer: 'Done.',
  durationMs: 1200,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
}

/** An in-memory $.store the test can read back: the plugin's gets and sets land in `saved`. */
function storeOf(on: On, initial: Record<string, unknown> = {}): Record<string, unknown> {
  const saved: Record<string, unknown> = { ...initial }
  on('store.get', ($, e) => ({ value: saved[e.key] }))
  on('store.set', ($, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  return saved
}

function sessionOf(on: On, head: string | null): { prompts: string[] } {
  const prompts: string[] = []
  mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('session.repo', () => ({ value: null }))
  on('fs.read', ($, e) =>
    head !== null && e.path === '/work/app/.git/HEAD' ? { value: head } : { deny: 'ENOENT' },
  )
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('model.complete', ($, e) => {
    prompts.push(e.prompt)
    return { value: '**Done**\n- Added rate limiting' }
  })
  return { prompts }
}

describe('register', () => {
  test('a finished turn is recorded with prompt, branch and edited files', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on, 'ref: refs/heads/feature/login\n')
    await $.session.start(SESSION)

    await $.prompt.submit({ text: 'Add login rate limiting', wait: false, origin: { kind: 'composer' } })
    await $.tool.call({ tool: 'Edit', file_path: '/work/app/src/login.ts', old_string: 'a', new_string: 'b' })
    await $.turn.complete(ANSWERED)

    const stored = saved.records as WorkRecord[]
    expect(stored).toEqual([
      { at: NOW, repo: 'app', branch: 'feature/login', prompt: 'Add login rate limiting', files: ['src/login.ts'] },
    ])
  })

  test('a worktree (unreadable .git/HEAD) still records, as branch unknown', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on, null)
    await $.session.start(SESSION)

    await $.prompt.submit({ text: 'Refactor', wait: false, origin: { kind: 'composer' } })
    await $.turn.complete(ANSWERED)

    const stored = saved.records as WorkRecord[]
    expect(stored[0]?.branch).toBe('unknown')
  })

  test('long prompts are cut to 200 characters; slash commands are not recorded', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on, 'ref: refs/heads/main\n')
    await $.session.start(SESSION)

    await $.prompt.submit({ text: '/standup', wait: false, origin: { kind: 'composer' } })
    await $.turn.complete(ANSWERED)
    await $.prompt.submit({ text: 'x'.repeat(500), wait: false, origin: { kind: 'composer' } })
    await $.turn.complete(ANSWERED)

    const stored = saved.records as WorkRecord[]
    expect(stored.length).toBe(1)
    expect(stored[0]?.prompt.length).toBe(200)
  })

  test('/standup summarizes today with the model', async ($, on) => {
    storeOf(on, {
      records: [{ at: NOW - 3_600_000, repo: 'app', branch: 'main', prompt: 'Add rate limiting', files: [] }],
    })
    const { prompts } = sessionOf(on, null)
    await $.session.start(SESSION)

    expect(await $.command.run(standup())).toEqual({ text: '**Done**\n- Added rate limiting' })
    expect(prompts[0]).toContain('Add rate limiting')
  })

  test('/standup with nothing recorded, or corrupt store data, says so without a model call', async ($, on) => {
    storeOf(on, { records: 'not-a-list' })
    const { prompts } = sessionOf(on, null)
    await $.session.start(SESSION)

    expect(await $.command.run(standup('yesterday'))).toEqual({ text: 'Nothing recorded for yesterday.' })
    expect(prompts).toEqual([])
  })

  test('/standup with a bad range prints usage', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on, null)
    await $.session.start(SESSION)
    expect(await $.command.run(standup('month'))).toEqual({ text: 'Usage: /standup [today|yesterday|week]' })
  })
})
