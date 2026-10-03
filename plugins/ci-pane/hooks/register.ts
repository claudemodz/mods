import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  errorStatus,
  failingRunIds,
  parsePrView,
  rejectionStatus,
  summaryLine,
  tally,
  transitionOf,
  type PrStatus,
} from './checks.js'
import { paneView } from './view.js'

export const PANE_ID = 'ci'

const PR_FIELDS = 'number,title,url,statusCheckRollup'

/** While gh is missing or there is no PR, poll only every this many intervals. */
const IDLE_EVERY = 10

/**
 * What this mod knows between hooks: the last status, the last status that
 * was a PR (transitions compare against it, so a network blip doesn't reset
 * them), the last re-run note, and how many idle intervals have passed.
 */
type PaneState = { status: PrStatus; lastPr: PrStatus | null; note: string; idleTicks: number }

export function register(on: On, options: PluginOptions): void {
  const pollMs = Math.max(10, Number(options.pollSeconds ?? 30)) * 1000
  const state: PaneState = { status: { kind: 'loading' }, lastPr: null, note: '', idleTicks: 0 }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ci',
      description: "Show CI checks for this branch's pull request (/ci rerun re-runs failed jobs)",
      argumentHint: '[rerun]',
      immediate: true,
    })
    // Scripted and SDK sessions draw nothing: /ci still answers there, but nothing polls.
    if (e.isInteractive && e.surface !== null) {
      void refresh($, state).catch(() => undefined)
      $.clock.every(pollMs, () => {
        void tick($, state).catch(() => undefined)
      })
    }
    return next(e)
  })

  on('command.run', { command: 'ci' }, async ($, e) => {
    if (e.args.trim() === 'rerun') {
      await rerunFailed($, state)
      return { text: state.note }
    }
    await refresh($, state)
    await $.ui.open({ id: PANE_ID, title: 'CI' })
    return { text: summaryLine(state.status) }
  })

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    return paneView($.ui.resolve(e), state.status, state.note, {
      refresh: () => void refresh($, state).catch(() => undefined),
      rerun: () => void rerunFailed($, state).catch(() => undefined),
    })
  })
}

async function tick($: EngineInterface, state: PaneState): Promise<void> {
  const isIdle = state.status.kind === 'no-gh' || state.status.kind === 'no-pr'
  state.idleTicks = isIdle ? state.idleTicks + 1 : 0
  if (isIdle && state.idleTicks % IDLE_EVERY !== 0) return
  await refresh($, state)
}

async function refresh($: EngineInterface, state: PaneState): Promise<void> {
  const next = await fetchStatus($)
  state.status = next
  if (next.kind === 'pr') {
    const transition = transitionOf(state.lastPr ?? { kind: 'loading' }, next)
    state.lastPr = next
    if (transition === 'now-failing') $.ui.toast(summaryLine(next))
    if (transition === 'now-passing') $.ui.toast(`CI #${next.number}: all checks passed`)
  }
  const isFailing = next.kind === 'pr' && tally(next.checks).failed > 0
  $.ui.status(isFailing ? `${summaryLine(next)} · /ci` : undefined)
  $.ui.invalidate('ui.render')
}

async function rerunFailed($: EngineInterface, state: PaneState): Promise<void> {
  const ids = state.status.kind === 'pr' ? failingRunIds(state.status.checks) : []
  let done = 0
  const problems: string[] = []
  for (const id of ids) {
    const run = await $.process
      .run(['gh', 'run', 'rerun', id, '--failed'], { timeoutMs: 30_000 })
      .catch((error: unknown) => ({ exitCode: 1, stderr: String(error) }))
    if (run.exitCode === 0) done += 1
    else problems.push(run.stderr.trim().split('\n')[0] || `gh exited with ${run.exitCode}`)
  }
  state.note = noteOf(ids.length, done, problems)
  await refresh($, state)
}

function noteOf(total: number, done: number, problems: readonly string[]): string {
  const runs = (n: number) => `${n} workflow run${n === 1 ? '' : 's'}`
  if (total === 0) return 'Nothing to re-run.'
  if (problems.length === 0) return `Re-ran ${runs(done)}.`
  const failed = `Couldn't re-run ${runs(problems.length)}: ${problems[0]}`
  return done > 0 ? `${failed} Re-ran ${runs(done)}.` : failed
}

async function fetchStatus($: EngineInterface): Promise<PrStatus> {
  try {
    const run = await $.process.run(['gh', 'pr', 'view', '--json', PR_FIELDS], { timeoutMs: 15_000 })
    return run.exitCode === 0 ? parsePrView(run.stdout) : errorStatus(run.exitCode, run.stderr)
  } catch (error) {
    return rejectionStatus(error instanceof Error ? error.message : String(error))
  }
}
