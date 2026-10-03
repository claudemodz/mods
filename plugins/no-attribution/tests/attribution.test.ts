import { describe, expect, test } from 'claude-code/testing'

import { attributionFor } from '../hooks/attribution.js'

describe('attributionFor', () => {
  test('commit and pr texts are empty by default', async () => {
    expect(attributionFor('commit', {})).toBe('')
    expect(attributionFor('pr', {})).toBe('')
  })

  test('configured texts replace the defaults', async () => {
    const options = { commitText: 'Reviewed-by: me', prText: 'Built with care' }
    expect(attributionFor('commit', options)).toBe('Reviewed-by: me')
    expect(attributionFor('pr', options)).toBe('Built with care')
  })

  test('non-string option values count as empty', async () => {
    expect(attributionFor('commit', { commitText: 42 })).toBe('')
  })

  test('exemption and remedy texts are not ours to change', async () => {
    expect(attributionFor('exemption', {})).toBeUndefined()
    expect(attributionFor('remedy', {})).toBeUndefined()
  })
})
