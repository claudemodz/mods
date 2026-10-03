import { describe, expect, test } from 'claude-code/testing'

import {
  errorStatus,
  failingRunIds,
  parsePrView,
  rejectionStatus,
  summaryLine,
  tally,
  transitionOf,
  type PrStatus,
} from '../hooks/checks.js'
import { PR_FAILING, PR_PASSING, PR_PENDING } from './fixtures.js'

describe('parsePrView', () => {
  test('reads check runs and status contexts', async () => {
    const status = parsePrView(PR_FAILING)
    expect(status.kind).toBe('pr')
    if (status.kind !== 'pr') return
    expect(status.number).toBe(42)
    expect(status.checks.map(c => [c.name, c.state, c.runId])).toEqual([
      ['lint', 'passed', '1001'],
      ['test', 'failed', '1002'],
      ['vercel', 'passed', null],
    ])
  })

  test('in-progress runs are pending', async () => {
    const status = parsePrView(PR_PENDING)
    expect(status.kind === 'pr' && tally(status.checks)).toEqual({ passed: 1, failed: 0, pending: 1 })
  })

  test('non-JSON output is an error, not a crash', async () => {
    expect(parsePrView('<html>')).toEqual({ kind: 'error', message: 'gh returned output that is not JSON' })
  })

  test('a PR with no checks has an empty list', async () => {
    const status = parsePrView(JSON.stringify({ number: 7, title: 't', url: 'u', statusCheckRollup: [] }))
    expect(status.kind === 'pr' && status.checks).toEqual([])
  })
})

describe('errorStatus', () => {
  test('no PR for the branch is its own state', async () => {
    expect(errorStatus(1, 'no pull requests found for branch "feature/x"\n')).toEqual({ kind: 'no-pr' })
  })

  test('outside a git repository counts as no PR', async () => {
    expect(errorStatus(1, 'fatal: not a git repository (or any of the parent directories): .git')).toEqual({
      kind: 'no-pr',
    })
  })

  test('signed-out or expired gh is the sign-in state', async () => {
    expect(errorStatus(4, 'To get started with GitHub CLI, please run:  gh auth login\n')).toEqual({ kind: 'no-gh' })
    expect(errorStatus(1, 'HTTP 401: Bad credentials (https://api.github.com/graphql)')).toEqual({ kind: 'no-gh' })
  })

  test('other failures keep the first stderr line', async () => {
    expect(errorStatus(1, 'HTTP 502: Bad Gateway\nretry later')).toEqual({ kind: 'error', message: 'HTTP 502: Bad Gateway' })
    expect(errorStatus(1, '')).toEqual({ kind: 'error', message: 'gh exited with 1' })
  })
})

describe('summaryLine', () => {
  test('describes each state', async () => {
    expect(summaryLine({ kind: 'loading' })).toBe('CI: checking…')
    expect(summaryLine({ kind: 'no-gh' })).toBe('CI: install and sign in to the GitHub CLI (gh) to see checks.')
    expect(summaryLine({ kind: 'no-pr' })).toBe('CI: no pull request for this branch.')
    expect(summaryLine({ kind: 'error', message: 'HTTP 502' })).toBe('CI: HTTP 502')
    expect(summaryLine(parsePrView(PR_FAILING))).toBe('CI #42: 1 failing · 0 pending · 2 passing')
  })
})

describe('transitionOf', () => {
  const failing = parsePrView(PR_FAILING)
  const passing = parsePrView(PR_PASSING)
  const pending = parsePrView(PR_PENDING)
  const loading: PrStatus = { kind: 'loading' }

  test('first failure is announced', async () => {
    expect(transitionOf(loading, failing)).toBe('now-failing')
    expect(transitionOf(pending, failing)).toBe('now-failing')
  })

  test('still failing is not announced again', async () => {
    expect(transitionOf(failing, failing)).toBeNull()
  })

  test('finishing green after failing or pending is announced', async () => {
    expect(transitionOf(failing, passing)).toBe('now-passing')
    expect(transitionOf(pending, passing)).toBe('now-passing')
  })

  test('passing to passing, and anything to no-pr, is quiet', async () => {
    expect(transitionOf(passing, passing)).toBeNull()
    expect(transitionOf(failing, { kind: 'no-pr' })).toBeNull()
  })
})

describe('failingRunIds', () => {
  test('lists each failing workflow run once', async () => {
    const status = parsePrView(PR_FAILING)
    expect(status.kind === 'pr' && failingRunIds(status.checks)).toEqual(['1002'])
  })
})

describe('rejectionStatus', () => {
  test('gh that cannot start is the install state', async () => {
    expect(rejectionStatus('spawn gh ENOENT')).toEqual({ kind: 'no-gh' })
  })

  test('a timeout or other rejection is an error, not "install gh"', async () => {
    expect(rejectionStatus('process timed out after 15000 ms')).toEqual({
      kind: 'error',
      message: 'gh did not finish: process timed out after 15000 ms',
    })
  })
})
