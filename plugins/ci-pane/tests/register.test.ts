import type { CommandRunInput, On, RenderInput } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { PR_FAILING, PR_PASSING } from './fixtures.js'
import { textOf } from './text-of.js'

const SESSION = { surface: 'terminal' as const, isInteractive: true, cwd: '/work' }

function ciCommand(args = ''): CommandRunInput {
  return { command: 'ci', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 160 } }
}

const PANE: RenderInput<'Pane'> = {
  component: 'Pane',
  surface: 'terminal',
  requestId: 'ci',
  viewport: { columns: 160, rows: 40 },
  props: {
    title: 'CI',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
}

type World = {
  stdout: string
  exitCode: number
  stderr: string
  isGhMissing: boolean
  rerunExit: number
  rerunStderr: string
  runs: string[][]
  toasts: string[]
  statuses: (string | undefined)[]
  opened: string[]
}

/** Stubs gh, the toast/status/pane calls and the clock; mutate the returned world to change what gh answers. */
function worldOf(on: On): World & { clock: ReturnType<typeof mock.clock> } {
  const world: World = {
    stdout: PR_PASSING,
    exitCode: 0,
    stderr: '',
    isGhMissing: false,
    rerunExit: 0,
    rerunStderr: '',
    runs: [],
    toasts: [],
    statuses: [],
    opened: [],
  }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('process.run', ($, e) => {
    world.runs.push([...e.argv])
    if (world.isGhMissing) return { deny: 'spawn gh ENOENT' }
    const isView = e.argv[1] === 'pr'
    return {
      value: {
        exitCode: isView ? world.exitCode : world.rerunExit,
        stdout: isView ? world.stdout : '',
        stderr: isView ? world.stderr : world.rerunStderr,
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', ($, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    world.opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  return Object.assign(world, { clock: mock.clock(on) })
}

describe('register', () => {
  test('/ci opens the pane and answers with the summary', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    await world.clock.settle()

    expect(await $.command.run(ciCommand())).toEqual({ text: 'CI #42: 0 failing · 0 pending · 3 passing' })
    expect(world.opened).toEqual(['ci'])
  })

  test('the pane lists checks with the PR link and actions', async ($, on) => {
    const world = worldOf(on)
    world.stdout = PR_FAILING
    await $.session.start(SESSION)
    await world.clock.settle()

    const drawn = textOf(await $.ui.render(PANE))
    expect(drawn).toContain('#42 Add login rate limiting')
    expect(drawn).toContain('✗ test')
    expect(drawn).toContain('✓ lint')
    expect(drawn).toContain('Refresh')
    expect(drawn).toContain('Re-run failed')
  })

  test('a new failure toasts once and sets the status line', async ($, on) => {
    const world = worldOf(on)
    await $.session.start(SESSION)
    await world.clock.settle()

    world.stdout = PR_FAILING
    await world.clock.advance(30_000)
    await world.clock.advance(30_000)

    expect(world.toasts).toEqual(['CI #42: 1 failing · 0 pending · 2 passing'])
    expect(world.statuses.at(-1)).toBe('CI #42: 1 failing · 0 pending · 2 passing · /ci')
  })

  test('/ci rerun re-runs each failing workflow run', async ($, on) => {
    const world = worldOf(on)
    world.stdout = PR_FAILING
    await $.session.start(SESSION)
    await world.clock.settle()

    await $.command.run(ciCommand('rerun'))
    expect(world.runs).toContainEqual(['gh', 'run', 'rerun', '1002', '--failed'])
  })

  test('missing gh shows one calm state and never toasts', async ($, on) => {
    const world = worldOf(on)
    world.isGhMissing = true
    await $.session.start(SESSION)
    await world.clock.settle()
    await world.clock.advance(90_000)

    expect(await $.command.run(ciCommand())).toEqual({
      text: 'CI: install and sign in to the GitHub CLI (gh) to see checks.',
    })
    expect(world.toasts).toEqual([])
  })

  test('a network blip between failing polls does not toast the failure again', async ($, on) => {
    const world = worldOf(on)
    world.stdout = PR_FAILING
    await $.session.start(SESSION)
    await world.clock.settle()

    world.exitCode = 1
    world.stderr = 'HTTP 502: Bad Gateway'
    await world.clock.advance(30_000)
    world.exitCode = 0
    world.stderr = ''
    await world.clock.advance(30_000)

    expect(world.toasts).toEqual(['CI #42: 1 failing · 0 pending · 2 passing'])
  })

  test('going green after a blip still announces all checks passed', async ($, on) => {
    const world = worldOf(on)
    world.stdout = PR_FAILING
    await $.session.start(SESSION)
    await world.clock.settle()

    world.exitCode = 1
    world.stderr = 'HTTP 502: Bad Gateway'
    await world.clock.advance(30_000)
    world.exitCode = 0
    world.stderr = ''
    world.stdout = PR_PASSING
    await world.clock.advance(30_000)

    expect(world.toasts.at(-1)).toBe('CI #42: all checks passed')
  })

  test('signed-out gh shows the sign-in state', async ($, on) => {
    const world = worldOf(on)
    world.exitCode = 4
    world.stderr = 'To get started with GitHub CLI, please run:  gh auth login'
    await $.session.start(SESSION)
    await world.clock.settle()

    expect(await $.command.run(ciCommand())).toEqual({
      text: 'CI: install and sign in to the GitHub CLI (gh) to see checks.',
    })
  })

  test('/ci rerun reports when GitHub refuses the re-run', async ($, on) => {
    const world = worldOf(on)
    world.stdout = PR_FAILING
    world.rerunExit = 1
    world.rerunStderr = 'HTTP 403: Must have admin rights to Repository.'
    await $.session.start(SESSION)
    await world.clock.settle()

    expect(await $.command.run(ciCommand('rerun'))).toEqual({
      text: "Couldn't re-run 1 workflow run: HTTP 403: Must have admin rights to Repository.",
    })
  })

  test('non-interactive sessions (claude -p, SDK) never poll', async ($, on) => {
    const world = worldOf(on)
    await $.session.start({ surface: null, isInteractive: false, cwd: '/work' })
    await world.clock.settle()
    await world.clock.advance(90_000)

    expect(world.runs).toEqual([])
  })

  test('without gh, polling backs off instead of spawning gh every interval', async ($, on) => {
    const world = worldOf(on)
    world.isGhMissing = true
    await $.session.start(SESSION)
    await world.clock.settle()
    await world.clock.advance(90_000)

    expect(world.runs.length).toBe(1)
  })
})

