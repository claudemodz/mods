import type { Elements, RenderElement } from 'claude-code'

import { summaryLine, type Check, type PrStatus } from './checks.js'

export type Kit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Link'>

export type PaneActions = { readonly refresh: () => void; readonly rerun: () => void }

const MARK: Record<Check['state'], { glyph: string; color: string }> = {
  passed: { glyph: '✓', color: 'green' },
  failed: { glyph: '✗', color: 'red' },
  pending: { glyph: '•', color: 'yellow' },
  skipped: { glyph: '–', color: 'gray' },
}

export function paneView(ui: Kit, status: PrStatus, note: string, actions: PaneActions): RenderElement {
  const { Box, Text, Button, Link } = ui
  if (status.kind !== 'pr') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{summaryLine(status)}</Text>
        <Button key="refresh" label="Refresh" onPress={actions.refresh} />
      </Box>
    )
  }
  const hasFailures = status.checks.some(c => c.state === 'failed')
  return (
    <Box flexDirection="column" gap={1}>
      <Link href={status.url} label={`#${status.number} ${status.title}`} />
      <Text dimColor>{summaryLine(status)}</Text>
      <Box flexDirection="column">
        {status.checks.map(check => (
          <Text key={check.name} color={MARK[check.state].color}>
            {`${MARK[check.state].glyph} ${check.name}`}
          </Text>
        ))}
      </Box>
      <Box gap={2}>
        <Button key="refresh" label="Refresh" onPress={actions.refresh} />
        {hasFailures ? <Button key="rerun" label="Re-run failed" onPress={actions.rerun} /> : null}
      </Box>
      {note ? <Text dimColor>{note}</Text> : null}
    </Box>
  )
}
