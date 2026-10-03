import { describe, expect, test } from 'claude-code/testing'

const TRAILER = 'Co-Authored-By: Claude <noreply@anthropic.com>'

describe('register', () => {
  test('the commit trailer becomes empty', async ($, on) => {
    on('attribution.text', ($, e) => ({ text: e.text }))
    expect(await $.attribution.text({ kind: 'commit', text: TRAILER })).toEqual({ text: '' })
  })

  test('the PR footer becomes empty', async ($, on) => {
    on('attribution.text', ($, e) => ({ text: e.text }))
    expect(
      await $.attribution.text({ kind: 'pr', text: '🤖 Generated with Claude Code' }),
    ).toEqual({ text: '' })
  })

  test('the remedy sentence passes through untouched', async ($, on) => {
    on('attribution.text', ($, e) => ({ text: e.text }))
    expect(await $.attribution.text({ kind: 'remedy', text: 'Add the trailer.' })).toEqual({
      text: 'Add the trailer.',
    })
  })
})
