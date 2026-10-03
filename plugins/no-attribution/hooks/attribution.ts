import type { AttributionTextKind } from 'claude-code'

export type AttributionOptions = {
  readonly commitText?: unknown
  readonly prText?: unknown
}

/**
 * The text to use for one attribution slot, or undefined to leave the
 * engine's text alone (the exemption and remedy sentences).
 */
export function attributionFor(
  kind: AttributionTextKind,
  options: AttributionOptions,
): string | undefined {
  if (kind === 'commit') return asText(options.commitText)
  if (kind === 'pr') return asText(options.prText)
  return undefined
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
