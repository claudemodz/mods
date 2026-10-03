import type { CommandRunInput, ModelCompleteResult, On, PromptOrigin, SessionRepo, TurnCompleteInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import type { WorkRecord } from '../hooks/records.js'

const NOW = new Date(2026, 9, 3, 15, 0).getTime()
const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const ANSWER: ModelCompleteResult = { isAnswered: true, text: '**Done**\n- Added rate limiting', usage: USAGE }
const COMPOSER: PromptOrigin = { kind: 'composer' }

function standup(args = ''): CommandRunInput {
  return { command: 'standup', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }
}

function answered(turnId: string): TurnCompleteInput {
  return { answer: 'Done.', durationMs: 1200, isAborted: false, turnId, reason: 'answer' }
}

function repoAt(root: string): SessionRepo {
  return { root, remote: null, internal: false, name: null }
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

type Setup = {
  cwd?: string
  repo?: SessionRepo | null
  files?: Record<string, string>
  reply?: ModelCompleteResult
}

function sessionOf(on: On, setup: Setup = {}): { prompts: string[] } {
  const cwd = setup.cwd ?? '/work/app'
  const files = setup.files ?? {}
  const prompts: string[] = []
  mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.cwd', () => ({ value: cwd }))
  on('session.repo', () => ({ value: setup.repo === undefined ? repoAt(cwd) : setup.repo }))
  on('fs.read', ($, e) => {
    const text = files[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('model.complete', ($, e) => {
    prompts.push(e.prompt)
    return { value: setup.reply ?? ANSWER }
  })
  return { prompts }
}

describe('register', () => {
  test('a finished turn is recorded with prompt, branch and edited files', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on, { files: { '/work/app/.git/HEAD': 'ref: refs/heads/feature/login\n' } })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })

    await $.prompt.submit({ text: 'Add login rate limiting', wait: false, origin: COMPOSER })
    await $.tool.call({ tool: 'Edit', file_path: '/work/app/src/login.ts', old_string: 'a', new_string: 'b' })
    await $.turn.complete(answered('t1'))

    expect(saved.records as WorkRecord[]).toEqual([
      { at: NOW, repo: 'app', branch: 'feature/login', prompt: 'Add login rate limiting', files: ['src/login.ts'] },
    ])
  })

  test('in a worktree, the branch and paths come from the worktree, the repo name from the main checkout', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on, {
      cwd: '/work/wt/src',
      repo: repoAt('/work/app'),
      files: {
        '/work/app/.git/HEAD': 'ref: refs/heads/main\n',
        '/work/wt/.git': 'gitdir: /work/app/.git/worktrees/wt\n',
        '/work/app/.git/worktrees/wt/HEAD': 'ref: refs/heads/feature/x\n',
      },
    })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/wt/src' })

    await $.prompt.submit({ text: 'Refactor', wait: false, origin: COMPOSER })
    await $.tool.call({ tool: 'Write', file_path: '/work/wt/src/a.ts', content: 'x' })
    await $.turn.complete(answered('t1'))

    expect(saved.records as WorkRecord[]).toEqual([
      { at: NOW, repo: 'app', branch: 'feature/x', prompt: 'Refactor', files: ['src/a.ts'] },
    ])
  })

  test('outside any git repository the turn is still recorded, as branch unknown', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on, { cwd: '/home/me/notes', repo: null })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/home/me/notes' })

    await $.prompt.submit({ text: 'Tidy notes', wait: false, origin: COMPOSER })
    await $.turn.complete(answered('t1'))

    expect((saved.records as WorkRecord[])[0]).toEqual({ at: NOW, repo: 'notes', branch: 'unknown', prompt: 'Tidy notes', files: [] })
  })

  test('long prompts are cut to 200 characters; slash commands are not recorded', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on, { files: { '/work/app/.git/HEAD': 'ref: refs/heads/main\n' } })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })

    await $.prompt.submit({ text: '/standup', wait: false, origin: COMPOSER })
    await $.turn.complete(answered('t1'))
    await $.prompt.submit({ text: 'x'.repeat(500), wait: false, origin: COMPOSER })
    await $.turn.complete(answered('t2'))

    const stored = saved.records as WorkRecord[]
    expect(stored.length).toBe(1)
    expect(stored[0]?.prompt.length).toBe(200)
  })

  test('prompts that are not the user\'s (task notifications) are not recorded', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })

    await $.prompt.submit({ text: 'Background task finished', wait: false, origin: { kind: 'task-notification' } })
    await $.turn.complete(answered('t1'))

    expect(saved.records).toBeUndefined()
  })

  test('a prompt queued mid-turn does not replace the running turn and is recorded for its own turn', async ($, on) => {
    const saved = storeOf(on)
    sessionOf(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })

    await $.prompt.submit({ text: 'First', wait: false, origin: COMPOSER })
    await $.tool.call({ tool: 'Edit', file_path: '/work/app/a.ts', old_string: 'a', new_string: 'b' })
    await $.prompt.submit({ text: 'Second', wait: false, origin: COMPOSER, turnId: 't1' })
    await $.turn.complete(answered('t1'))
    await $.turn.complete(answered('t2'))

    expect((saved.records as WorkRecord[]).map(r => [r.prompt, r.files])).toEqual([
      ['First', ['a.ts']],
      ['Second', []],
    ])
  })

  test('/standup summarizes today with the model', async ($, on) => {
    storeOf(on, {
      records: [{ at: NOW - 3_600_000, repo: 'app', branch: 'main', prompt: 'Add rate limiting', files: [] }],
    })
    const { prompts } = sessionOf(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })

    expect(await $.command.run(standup())).toEqual({ text: '**Done**\n- Added rate limiting' })
    expect(prompts[0]).toContain('Add rate limiting')
  })

  test('/standup says so when the model could not answer', async ($, on) => {
    storeOf(on, {
      records: [{ at: NOW - 3_600_000, repo: 'app', branch: 'main', prompt: 'Add rate limiting', files: [] }],
    })
    sessionOf(on, { reply: { isAnswered: false, reason: 'empty-reply', usage: USAGE } })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })

    expect(await $.command.run(standup())).toEqual({ text: "Couldn't write the standup (empty-reply)." })
  })

  test('/standup with nothing recorded, or corrupt store data, says so without a model call', async ($, on) => {
    storeOf(on, { records: 'not-a-list' })
    const { prompts } = sessionOf(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })

    expect(await $.command.run(standup('yesterday'))).toEqual({ text: 'Nothing recorded for yesterday.' })
    expect(prompts).toEqual([])
  })

  test('/standup with a bad range prints usage', async ($, on) => {
    storeOf(on)
    sessionOf(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/app' })
    expect(await $.command.run(standup('month'))).toEqual({ text: 'Usage: /standup [today|yesterday|week]' })
  })
})
