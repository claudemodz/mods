export type CheckState = 'passed' | 'failed' | 'pending' | 'skipped'

export type Check = {
  readonly name: string
  readonly state: CheckState
  readonly url: string | null
  readonly runId: string | null
}

export type PrStatus =
  | { kind: 'loading' }
  | { kind: 'no-gh' }
  | { kind: 'no-pr' }
  | { kind: 'error'; message: string }
  | { kind: 'pr'; number: number; title: string; url: string; checks: readonly Check[] }

export type Tally = { readonly passed: number; readonly failed: number; readonly pending: number }

type RollupItem = {
  readonly __typename?: string
  readonly name?: string
  readonly context?: string
  readonly status?: string
  readonly conclusion?: string | null
  readonly state?: string
  readonly detailsUrl?: string
  readonly targetUrl?: string
}

const SHAPE_ERROR: PrStatus = { kind: 'error', message: 'gh returned an unexpected shape' }

/** Parses `gh pr view --json number,title,url,statusCheckRollup` output. */
export function parsePrView(stdout: string): PrStatus {
  let data: unknown
  try {
    data = JSON.parse(stdout)
  } catch {
    return { kind: 'error', message: 'gh returned output that is not JSON' }
  }
  if (typeof data !== 'object' || data === null) return SHAPE_ERROR
  const pr = data as { number?: unknown; title?: unknown; url?: unknown; statusCheckRollup?: unknown }
  if (typeof pr.number !== 'number' || typeof pr.url !== 'string') return SHAPE_ERROR
  const items = Array.isArray(pr.statusCheckRollup) ? (pr.statusCheckRollup as RollupItem[]) : []
  return {
    kind: 'pr',
    number: pr.number,
    title: typeof pr.title === 'string' ? pr.title : '',
    url: pr.url,
    checks: items.map(checkOf),
  }
}

function checkOf(item: RollupItem): Check {
  const url = item.detailsUrl ?? item.targetUrl ?? null
  return { name: item.name ?? item.context ?? 'check', state: stateOf(item), url, runId: runIdOf(url) }
}

function stateOf(item: RollupItem): CheckState {
  if (item.__typename === 'StatusContext') {
    const state = (item.state ?? '').toUpperCase()
    if (state === 'SUCCESS') return 'passed'
    if (state === 'FAILURE' || state === 'ERROR') return 'failed'
    return 'pending'
  }
  if ((item.status ?? '').toUpperCase() !== 'COMPLETED') return 'pending'
  const conclusion = (item.conclusion ?? '').toUpperCase()
  if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL') return 'passed'
  if (conclusion === 'SKIPPED') return 'skipped'
  return 'failed'
}

function runIdOf(url: string | null): string | null {
  return url?.match(/\/actions\/runs\/(\d+)/)?.[1] ?? null
}

/** The state for a `gh pr view` that exited non-zero. */
export function errorStatus(exitCode: number, stderr: string): PrStatus {
  if (/no pull requests found/i.test(stderr) || /not a git repository/i.test(stderr)) {
    return { kind: 'no-pr' }
  }
  const first = stderr.trim().split('\n')[0] ?? ''
  return { kind: 'error', message: first || `gh exited with ${exitCode}` }
}

export function tally(checks: readonly Check[]): Tally {
  return {
    passed: checks.filter(c => c.state === 'passed').length,
    failed: checks.filter(c => c.state === 'failed').length,
    pending: checks.filter(c => c.state === 'pending').length,
  }
}

export function summaryLine(status: PrStatus): string {
  switch (status.kind) {
    case 'loading':
      return 'CI: checking…'
    case 'no-gh':
      return 'CI: install and sign in to the GitHub CLI (gh) to see checks.'
    case 'no-pr':
      return 'CI: no pull request for this branch.'
    case 'error':
      return `CI: ${status.message}`
    case 'pr': {
      if (status.checks.length === 0) return `CI #${status.number}: no checks reported`
      const t = tally(status.checks)
      return `CI #${status.number}: ${t.failed} failing · ${t.pending} pending · ${t.passed} passing`
    }
  }
}

/** Whether moving from `before` to `after` deserves a toast. */
export function transitionOf(before: PrStatus, after: PrStatus): 'now-failing' | 'now-passing' | null {
  if (after.kind !== 'pr') return null
  const now = tally(after.checks)
  const was = before.kind === 'pr' ? tally(before.checks) : null
  if (now.failed > 0) return was === null || was.failed === 0 ? 'now-failing' : null
  const isGreen = now.pending === 0 && now.passed > 0
  return isGreen && was !== null && (was.failed > 0 || was.pending > 0) ? 'now-passing' : null
}

export function failingRunIds(checks: readonly Check[]): string[] {
  const ids = checks.filter(c => c.state === 'failed' && c.runId !== null).map(c => c.runId as string)
  return [...new Set(ids)]
}
