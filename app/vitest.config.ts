import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.d.ts',
        'e2e/**',
        // Bootstrap only: mounts React, wires the theme config object, no
        // branching logic of its own to cover.
        'src/main.tsx',
        // Generated/pure-presentation SVG monsters (~2.2k lines combined):
        // large switch/ternary trees over expression -> path-data strings,
        // no state, no side effects, nothing meaningfully "wrong" to catch
        // that a snapshot wouldn't already catch cheaper. Behavioral bits
        // that matter (state->expression mapping, reduced-motion/contrast
        // handling) live in robotStates.ts and accessibility.ts, which ARE
        // covered. Chasing branch coverage through hundreds of hardcoded
        // SVG path strings would inflate the numbers without testing
        // anything real.
        'src/components/RobotGraphic/ChadFace.tsx',
        'src/components/RobotGraphic/RobotFace.tsx'
      ],
      // Ratchet, not aspiration: pinned at the achieved numbers (see the
      // coverage-quality pass notes), rounded down to whole percents. Bump
      // these up when coverage improves; never down without a documented
      // reason (an excluded file, a removed test).
      thresholds: {
        statements: 96,
        branches: 88,
        functions: 92,
        lines: 96
      }
    }
  }
})
