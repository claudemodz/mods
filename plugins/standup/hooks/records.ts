export type WorkRecord = {
  readonly at: number
  readonly repo: string
  readonly branch: string
  readonly prompt: string
  readonly files: readonly string[]
}

export type Range = 'today' | 'yesterday' | 'week'

const DAY_MS = 86_400_000
const MAX_RECORDS = 3000

export const STANDUP_SYSTEM =
  'You write short standup updates for a software engineer from their work log. ' +
  'Use only what the log shows; never invent work. Output markdown with a "Done" section ' +
  'grouped by repository, at most 8 bullets in total, each a plain past-tense phrase. ' +
  'Merge log lines that describe the same piece of work.'

export function isRange(value: string): value is Range {
  return value === 'today' || value === 'yesterday' || value === 'week'
}

export function readRecords(stored: unknown): WorkRecord[] {
  return Array.isArray(stored) ? stored.filter(isWorkRecord) : []
}

function isWorkRecord(value: unknown): value is WorkRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.at === 'number' &&
    typeof r.repo === 'string' &&
    typeof r.branch === 'string' &&
    typeof r.prompt === 'string' &&
    Array.isArray(r.files) &&
    r.files.every(f => typeof f === 'string')
  )
}

export function addRecord(
  records: readonly WorkRecord[],
  record: WorkRecord,
  retentionDays: number,
): WorkRecord[] {
  const cutoff = record.at - retentionDays * DAY_MS
  return [...records.filter(r => r.at >= cutoff), record].slice(-MAX_RECORDS)
}

function startOfDay(ms: number): number {
  const day = new Date(ms)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

export function recordsIn(records: readonly WorkRecord[], range: Range, now: number): WorkRecord[] {
  const today = startOfDay(now)
  const from = range === 'today' ? today : range === 'yesterday' ? startOfDay(today - 1) : startOfDay(today - 6 * DAY_MS)
  const to = range === 'yesterday' ? today : Number.POSITIVE_INFINITY
  return records.filter(r => r.at >= from && r.at < to)
}

export function branchFromHead(head: string): string {
  const ref = head.match(/^ref: refs\/heads\/(.+)$/m)?.[1]?.trim()
  if (ref) return ref
  return /^[0-9a-f]{40}\s*$/.test(head) ? 'detached' : 'unknown'
}

/** A directory and each of its parents, nearest first, ending at `/`. */
export function parentsOf(path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  const dirs: string[] = []
  for (let i = parts.length; i > 0; i--) dirs.push('/' + parts.slice(0, i).join('/'))
  return [...dirs, '/']
}

/** The git directory a worktree's `.git` file points at, or null when it isn't one. */
export function gitdirOf(content: string, dir: string): string | null {
  const target = content.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim()
  if (!target) return null
  return target.startsWith('/') ? target : `${dir.replace(/\/+$/, '')}/${target}`
}

export function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

export function relativeTo(path: string, root: string): string {
  const prefix = root.replace(/\/+$/, '') + '/'
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function standupPrompt(records: readonly WorkRecord[], range: Range): string {
  const groups = new Map<string, WorkRecord[]>()
  for (const r of records) {
    const key = `${r.repo} (${r.branch})`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const sections = [...groups].map(([key, items]) => {
    const lines = items.map(r => {
      const files = r.files.length > 0 ? ` — files: ${r.files.join(', ')}` : ''
      return `- ${clockTime(r.at)} ${r.prompt}${files}`
    })
    return `## ${key}\n${lines.join('\n')}`
  })
  return `Work log for ${range}:\n\n${sections.join('\n\n')}\n\nWrite my standup update.`
}
