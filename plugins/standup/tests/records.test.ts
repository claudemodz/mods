import { describe, expect, test } from 'claude-code/testing'

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
  type WorkRecord,
} from '../hooks/records.js'

// Local-time instants, so day boundaries hold in any timezone.
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).getTime()

function record(day: number, hour: number, prompt = 'work'): WorkRecord {
  return { at: at(day, hour), repo: 'app', branch: 'main', prompt, files: [] }
}

describe('readRecords', () => {
  test('keeps valid records', async () => {
    expect(readRecords([record(3, 9)])).toEqual([record(3, 9)])
  })

  test('treats non-arrays and malformed entries as absent', async () => {
    expect(readRecords(undefined)).toEqual([])
    expect(readRecords({ records: [] })).toEqual([])
    expect(readRecords([record(3, 9), { at: 'yesterday' }, null, 7])).toEqual([record(3, 9)])
  })
})

describe('addRecord', () => {
  test('appends and drops records older than the retention window', async () => {
    const old = record(1, 9)
    const recent = record(10, 9)
    expect(addRecord([old, recent], record(16, 9), 14)).toEqual([recent, record(16, 9)])
  })
})

describe('recordsIn', () => {
  const all = [record(1, 9), record(2, 10), record(2, 23), record(3, 8)]
  const now = at(3, 12)

  test('today, yesterday and week use local day boundaries', async () => {
    expect(recordsIn(all, 'today', now)).toEqual([record(3, 8)])
    expect(recordsIn(all, 'yesterday', now)).toEqual([record(2, 10), record(2, 23)])
    expect(recordsIn(all, 'week', now)).toEqual(all)
  })

  test('isRange accepts only the three ranges', async () => {
    expect(['today', 'yesterday', 'week', 'month'].map(isRange)).toEqual([true, true, true, false])
  })
})

describe('branchFromHead', () => {
  test('reads a branch ref', async () => {
    expect(branchFromHead('ref: refs/heads/feature/login\n')).toBe('feature/login')
  })

  test('a bare sha is detached; anything else is unknown', async () => {
    expect(branchFromHead('3f2a1c9d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39\n')).toBe('detached')
    expect(branchFromHead('')).toBe('unknown')
  })
})

describe('paths', () => {
  test('baseName and relativeTo', async () => {
    expect(baseName('/work/app/')).toBe('app')
    expect(relativeTo('/work/app/src/a.ts', '/work/app')).toBe('src/a.ts')
    expect(relativeTo('/elsewhere/b.ts', '/work/app')).toBe('/elsewhere/b.ts')
  })
})

describe('standupPrompt', () => {
  test('groups records by repo and branch with times and files', async () => {
    const records: WorkRecord[] = [
      { at: at(3, 9), repo: 'app', branch: 'feature/login', prompt: 'Add rate limiting', files: ['src/login.ts'] },
      { at: at(3, 11), repo: 'docs', branch: 'main', prompt: 'Fix typo', files: [] },
    ]
    const text = standupPrompt(records, 'today')
    expect(text).toContain('Work log for today')
    expect(text).toContain('## app (feature/login)')
    expect(text).toContain('09:00 Add rate limiting — files: src/login.ts')
    expect(text).toContain('## docs (main)')
    expect(text).toContain('11:00 Fix typo')
  })
})

describe('git paths', () => {
  test('parentsOf lists a directory and each parent up to the root', async () => {
    expect(parentsOf('/work/wt/src')).toEqual(['/work/wt/src', '/work/wt', '/work', '/'])
    expect(parentsOf('/')).toEqual(['/'])
  })

  test('gitdirOf reads a worktree .git file, resolving relative paths', async () => {
    expect(gitdirOf('gitdir: /work/app/.git/worktrees/wt\n', '/work/wt')).toBe('/work/app/.git/worktrees/wt')
    expect(gitdirOf('gitdir: ../app/.git/worktrees/wt\n', '/work/wt')).toBe('/work/wt/../app/.git/worktrees/wt')
    expect(gitdirOf('not a gitdir file', '/work/wt')).toBeNull()
  })
})
