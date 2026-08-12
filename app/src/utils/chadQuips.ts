/**
 * @fileoverview Chad's speech-bubble quips.
 *
 * Pure and deterministic on purpose: `FloatingChad` calls `pickQuip` from a
 * `useEffect` reacting to `runStore` status *transitions* (not renders), so
 * the same run always produces the same line — no `Math.random`, seeded off
 * `runId` with a tiny string hash instead.
 */

import type { RunPhase } from '../stores/runStore'

/** The run-status transitions Chad reacts to with a quip. */
export type QuipCategory = 'thinking' | 'success' | 'error' | 'cancelled'

/**
 * 2-3 variants per category. Index 0 is the line named in the product spec;
 * the rest are just Chad being Chad.
 */
export const QUIP_VARIANTS: Record<QuipCategory, readonly string[]> = {
  thinking: ['Crunching tokens…', 'On it, boss.', 'Let me think on that.'],
  success: ['Nailed it. 😎', 'Boom. Done.', 'Easy money.'],
  error: ["That wasn't supposed to happen.", 'Uh oh.', "Well, that's new."],
  cancelled: ['Say no more.', "Whenever you're ready.", 'Aborting mission.']
}

/**
 * Small, fast, deterministic string hash (djb2 variant). Good enough to
 * spread short strings like run ids across a handful of buckets — not a
 * cryptographic hash, and not meant to be one.
 */
function hashString(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Pick one of `category`'s variants, deterministically, from `seed`. */
export function pickQuip(category: QuipCategory, seed: string): string {
  const variants = QUIP_VARIANTS[category]
  const index = hashString(seed) % variants.length
  return variants[index]
}

/**
 * Which quip (if any) a run-status transition earns. `null` covers phases
 * Chad stays quiet for — `streaming` (he's already reacting via his
 * expression) and `idle` (nothing happened yet).
 */
export function quipCategoryForTransition(nextStatus: RunPhase): QuipCategory | null {
  switch (nextStatus) {
    case 'starting':
      return 'thinking'
    case 'completed':
      return 'success'
    case 'error':
      return 'error'
    case 'cancelled':
      return 'cancelled'
    default:
      return null
  }
}
