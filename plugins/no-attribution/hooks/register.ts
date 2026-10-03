import type { On, PluginOptions } from 'claude-code'

import { attributionFor } from './attribution.js'

export function register(on: On, options: PluginOptions): void {
  on('attribution.text', ($, e, next) => {
    const text = attributionFor(e.kind, options)
    return text === undefined ? next(e) : { text }
  })
}
