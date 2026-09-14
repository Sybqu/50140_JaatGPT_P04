import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const source = process.cwd()
const staging = '/tmp/ripple-risk-ui-dev'
rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
for (const entry of ['index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'src', 'node_modules']) {
  cpSync(join(source, entry), join(staging, entry), { recursive: true })
}
const vite = spawn(process.execPath, [join(staging, 'node_modules/vite/bin/vite.js'), '--host', '0.0.0.0', ...process.argv.slice(2)], { cwd: staging, stdio: 'inherit' })
vite.on('exit', code => process.exit(code ?? 0))
