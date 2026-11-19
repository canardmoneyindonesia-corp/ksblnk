import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/node.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  // Workspace packages ship TypeScript source: bundle them into the output.
  noExternal: [/^@kskblnk\//],
})
