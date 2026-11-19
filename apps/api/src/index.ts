/*
 * Vercel entrypoint (services mode, framework "hono"): the default export is the app.
 * Vercel runs it as a Function, so there is no long-running process here: the
 * sweeper is triggered through /api/internal/sweep instead of a timer.
 * Local `pnpm dev` / `pnpm start` use src/node.ts (Node server + sweeper timer).
 */
import { app } from './app'

export default app
