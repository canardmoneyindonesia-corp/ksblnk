/**
 * Pre-drop waiting mode: every page renders only the full-screen session loop,
 * so nothing about the catalog is visible before the drop.
 *
 * WAITING_MODE=1 turns it on. Server-side only: on Vercel, change it in the project's
 * env vars and redeploy.
 */
export function isWaitingMode() {
  const flag = process.env.WAITING_MODE?.trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'on'
}
