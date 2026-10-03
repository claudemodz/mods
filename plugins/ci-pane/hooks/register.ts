import type { EngineInterface, On, PluginOptions } from 'claude-code'

import {
  errorStatus,
  failingRunIds,
  parsePrView,
  summaryLine,
  tally,
  transitionOf,
  type PrStatus,
} from './checks.js'
import { paneView } from './view.js'

export const PANE_ID = 'ci'

const PR_FIELDS = 'number,title,url,statusCheckRollup'

/** What this mod knows between hooks: the last status and the last re-run note. */
type PaneState = { status: PrStatus; note: string }

export function register(on: On, options: PluginOptions): void {
  const pollMs = Math.max(10, Number(options.pollSeconds ?? 30)) * 1000
  const state: PaneState = { status: { kind: 'loading' }, note: '' }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ci',
      description: "Show CI checks for this branch's pull request (/ci rerun re-runs failed jobs)",
      argumentHint: '[rerun]',
      immediate: true,
    })
    void refresh($, state).catch(() => undefined)
    $.clock.every(pollMs, () => {
      void refresh($, state).catch(() => undefined)
    })
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

async function refresh($: EngineInterface, state: PaneState): Promise<void> {
  const next = await fetchStatus($)
  const transition = transitionOf(state.status, next)
  state.status = next
  if (transition === 'now-failing') $.ui.toast(summaryLine(next))
  if (transition === 'now-passing' && next.kind === 'pr') $.ui.toast(`CI #${next.number}: all checks passed`)
  const isFailing = next.kind === 'pr' && tally(next.checks).failed > 0
  $.ui.status(isFailing ? `${summaryLine(next)} · /ci` : undefined)
  $.ui.invalidate('ui.render')
}

async function rerunFailed($: EngineInterface, state: PaneState): Promise<void> {
  const ids = state.status.kind === 'pr' ? failingRunIds(state.status.checks) : []
  for (const id of ids) {
    await $.process.run(['gh', 'run', 'rerun', id, '--failed'], { timeoutMs: 30_000 }).catch(() => undefined)
  }
  state.note = ids.length > 0 ? `Re-ran ${ids.length} workflow run${ids.length === 1 ? '' : 's'}.` : 'Nothing to re-run.'
  await refresh($, state)
}

async function fetchStatus($: EngineInterface): Promise<PrStatus> {
  try {
    const run = await $.process.run(['gh', 'pr', 'view', '--json', PR_FIELDS], { timeoutMs: 15_000 })
    return run.exitCode === 0 ? parsePrView(run.stdout) : errorStatus(run.exitCode, run.stderr)
  } catch {
    return { kind: 'no-gh' }
  }
}
