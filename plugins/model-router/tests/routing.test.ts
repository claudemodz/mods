import { describe, expect, test } from 'claude-code/testing'

import {
  parseModelMap,
  parsePreset,
  presetModel,
  routedModel,
  statusText,
} from '../hooks/routing.js'

const MODELS = { fast: 'sonnet', smart: 'opus' }

describe('parseModelMap', () => {
  test('reads comma-separated type=model pairs, trimming spaces', async () => {
    expect([...parseModelMap('Explore=haiku, general-purpose = sonnet')]).toEqual([
      ['Explore', 'haiku'],
      ['general-purpose', 'sonnet'],
    ])
  })

  test('skips malformed pairs and empty input', async () => {
    expect([...parseModelMap('Explore=, =haiku, nonsense, Plan=sonnet')]).toEqual([['Plan', 'sonnet']])
    expect(parseModelMap('').size).toBe(0)
  })
})

describe('routedModel', () => {
  const map = parseModelMap('Explore=haiku')

  test('routes a mapped type with no explicit model', async () => {
    expect(routedModel({ subagentType: 'Explore', fork: false }, map)).toBe('haiku')
  })

  test('keeps an explicit model', async () => {
    expect(routedModel({ subagentType: 'Explore', model: 'opus', fork: false }, map)).toBeUndefined()
  })

  test('never touches a fork', async () => {
    expect(routedModel({ subagentType: 'Explore', fork: true }, map)).toBeUndefined()
  })

  test('leaves unmapped types alone', async () => {
    expect(routedModel({ subagentType: 'general-purpose', fork: false }, map)).toBeUndefined()
  })
})

describe('presets', () => {
  test('parsePreset reads the command argument', async () => {
    expect(parsePreset('')).toBe('status')
    expect(parsePreset(' FAST ')).toBe('fast')
    expect(parsePreset('smart')).toBe('smart')
    expect(parsePreset('off')).toBe('off')
    expect(parsePreset('turbo')).toBe('invalid')
  })

  test('presetModel maps a preset to its model', async () => {
    expect(presetModel('off', MODELS)).toBeUndefined()
    expect(presetModel('fast', MODELS)).toBe('sonnet')
    expect(presetModel('smart', MODELS)).toBe('opus')
  })

  test('statusText summarizes preset and routing counts', async () => {
    expect(statusText('off', MODELS, new Map())).toBe(
      'main session: unchanged · subagents routed: none yet',
    )
    expect(statusText('fast', MODELS, new Map([['Explore', 3]]))).toBe(
      'main session: fast (sonnet) · subagents routed: Explore ×3',
    )
  })
})
