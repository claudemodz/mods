import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  addRecord,
  baseName,
  branchFromHead,
  gitdirOf,
  isRange,
  parentsOf,
  readRecords,
  recordsIn,
  relativeTo,
  standupPrompt,
  STANDUP_SYSTEM,
  type WorkRecord,
} from './records.js'

const STORE_KEY = 'records'
const PROMPT_CHARS = 200
const MAX_FILES = 20

/** Prompts the person typed: in the terminal or desktop app, or through Remote Control. */
const USER_ORIGINS: readonly string[] = ['composer', 'bridge']

export function register(on: On, options: PluginOptions): void {
  const model = String(options.model ?? 'haiku')
  const retentionDays = Math.max(1, Number(options.retentionDays ?? 14))
  let prompt: string | undefined
  let queued: string | undefined
  const files = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'standup',
      description: 'Write a standup update from what you worked on',
      argumentHint: '[today|yesterday|week]',
    })
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    const text = e.text.trim()
    const isUsers = USER_ORIGINS.includes(e.origin.kind) && text !== '' && !text.startsWith('/')
    const candidate = isUsers ? text : undefined
    if (e.turnId !== undefined) {
      // Typed while a turn ran: it gets its own turn after this one.
      if (candidate !== undefined) queued = candidate
      return next(e)
    }
    prompt = candidate
    files.clear()
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const result = await next(e)
    const path =
      'file_path' in e && typeof e.file_path === 'string'
        ? e.file_path
        : 'notebook_path' in e && typeof e.notebook_path === 'string'
          ? e.notebook_path
          : undefined
    if (e.agentId === undefined && result.deny === undefined && path !== undefined) files.add(path)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const finished = prompt
    const edited = [...files]
    prompt = queued
    queued = undefined
    files.clear()
    if (e.reason === 'answer' && finished !== undefined) {
      const entry = await recordOf($, finished, edited).catch(() => undefined)
      if (entry) {
        const records = readRecords(await $.store.get(STORE_KEY))
        await $.store.set(STORE_KEY, addRecord(records, entry, retentionDays))
      }
    }
    return result
  })

  on('command.run', { command: 'standup' }, async ($, e) => {
    const range = e.args.trim() || 'today'
    if (!isRange(range)) return { text: 'Usage: /standup [today|yesterday|week]' }
    const picked = recordsIn(readRecords(await $.store.get(STORE_KEY)), range, await $.clock.now())
    if (picked.length === 0) return { text: `Nothing recorded for ${range}.` }
    const reply = await $.model.complete({
      model,
      system: STANDUP_SYSTEM,
      prompt: standupPrompt(picked, range),
      maxTokens: 800,
    })
    return { text: reply.isAnswered ? reply.text : `Couldn't write the standup (${reply.reason}).` }
  })
}

async function recordOf($: EngineInterface, prompt: string, edited: readonly string[]): Promise<WorkRecord> {
  const [at, cwd, repo] = await Promise.all([$.clock.now(), $.session.cwd(), $.session.repo()])
  const git = repo === null ? undefined : await gitOf($, cwd)
  const root = git?.root ?? repo?.root ?? cwd
  return {
    at,
    repo: baseName(repo?.root ?? root),
    branch: branchFromHead(git?.head ?? ''),
    prompt: prompt.slice(0, PROMPT_CHARS),
    files: edited.map(path => relativeTo(path, root)).slice(0, MAX_FILES),
  }
}

/** The working tree holding `cwd` and its HEAD, following a worktree's `.git` file. */
async function gitOf($: EngineInterface, cwd: string): Promise<{ root: string; head: string } | undefined> {
  for (const dir of parentsOf(cwd)) {
    const head = await readText($, `${dir}/.git/HEAD`)
    if (head !== undefined) return { root: dir, head }
    const pointer = await readText($, `${dir}/.git`)
    const gitdir = pointer === undefined ? null : gitdirOf(pointer, dir)
    if (gitdir !== null) return { root: dir, head: (await readText($, `${gitdir}/HEAD`)) ?? '' }
  }
  return undefined
}

async function readText($: EngineInterface, path: string): Promise<string | undefined> {
  return $.fs.read(path).then(
    text => (typeof text === 'string' ? text : undefined),
    () => undefined,
  )
}
