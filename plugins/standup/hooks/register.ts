import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  addRecord,
  baseName,
  branchFromHead,
  isRange,
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

export function register(on: On, options: PluginOptions): void {
  const model = String(options.model ?? 'haiku')
  const retentionDays = Math.max(1, Number(options.retentionDays ?? 14))
  let prompt: string | undefined
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
    prompt = text === '' || text.startsWith('/') ? undefined : text
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
    if (e.agentId === undefined && e.reason === 'answer' && prompt !== undefined) {
      const entry = await recordOf($, prompt, [...files]).catch(() => undefined)
      if (entry) {
        const records = readRecords(await $.store.get(STORE_KEY))
        await $.store.set(STORE_KEY, addRecord(records, entry, retentionDays))
      }
      prompt = undefined
      files.clear()
    }
    return result
  })

  on('command.run', { command: 'standup' }, async ($, e) => {
    const range = e.args.trim() || 'today'
    if (!isRange(range)) return { text: 'Usage: /standup [today|yesterday|week]' }
    const picked = recordsIn(readRecords(await $.store.get(STORE_KEY)), range, await $.clock.now())
    if (picked.length === 0) return { text: `Nothing recorded for ${range}.` }
    const text = await $.model.complete({
      model,
      system: STANDUP_SYSTEM,
      prompt: standupPrompt(picked, range),
      maxTokens: 800,
    })
    return { text }
  })
}

async function recordOf($: EngineInterface, prompt: string, edited: readonly string[]): Promise<WorkRecord> {
  const [at, cwd, repo] = await Promise.all([$.clock.now(), $.session.cwd(), $.session.repo()])
  const root = repo?.root ?? cwd
  const head = await $.fs.read(`${root}/.git/HEAD`).catch(() => '')
  return {
    at,
    repo: baseName(root),
    branch: branchFromHead(typeof head === 'string' ? head : ''),
    prompt: prompt.slice(0, PROMPT_CHARS),
    files: edited.map(path => relativeTo(path, root)).slice(0, MAX_FILES),
  }
}
