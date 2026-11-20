// Second local dev server, in waiting mode, beside the normal shop on :3000.
// Own build folder (.next/waiting) because next dev locks its build folder.
// Plain Node instead of `VAR=1 next dev` so it also works in Windows shells.
import { spawn } from 'node:child_process'

const child = spawn('next', ['dev', '-p', '3002'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, WAITING_MODE: '1', NEXT_DIST_DIR: '.next/waiting' },
})
child.on('exit', (code) => process.exit(code ?? 0))
