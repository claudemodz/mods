// Runs `claude plugin validate --strict` or `claude plugin test` on every plugin
// under plugins/, and validates the marketplace itself. Exits 1 on any failure.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const mode = process.argv[2]
if (mode !== 'validate' && mode !== 'test') {
  console.error('usage: each-plugin.mjs validate|test')
  process.exit(2)
}

const plugins = readdirSync('plugins')
  .map(name => join('plugins', name))
  .filter(dir => statSync(dir).isDirectory())

const targets = mode === 'validate' ? ['.', ...plugins] : plugins
let failed = 0

for (const dir of targets) {
  // An empty marketplace warns "no plugins defined"; stay non-strict until the first plugin lands.
  const isStrict = !(dir === '.' && plugins.length === 0)
  const args =
    mode === 'validate'
      ? ['plugin', 'validate', dir, ...(isStrict ? ['--strict'] : [])]
      : ['plugin', 'test', dir]
  console.log(`\n$ claude ${args.join(' ')}`)
  const run = spawnSync('claude', args, { stdio: 'inherit' })
  if (run.status !== 0) failed += 1
}

if (targets.length === 0) console.log('no plugins yet')
process.exit(failed > 0 ? 1 : 0)
