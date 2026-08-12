/**
 * chadQuips: pure, deterministic quip selection — no `Math.random`, seeded
 * off a run id so the same run always shows the same line.
 */

import { describe, expect, it } from 'vitest'
import { QUIP_VARIANTS, pickQuip, quipCategoryForTransition } from '../chadQuips'

describe('quipCategoryForTransition', () => {
  it('maps run-status transitions to the quip category they earn', () => {
    expect(quipCategoryForTransition('starting')).toBe('thinking')
    expect(quipCategoryForTransition('completed')).toBe('success')
    expect(quipCategoryForTransition('error')).toBe('error')
    expect(quipCategoryForTransition('cancelled')).toBe('cancelled')
  })

  it('stays quiet for phases with no quip of their own', () => {
    expect(quipCategoryForTransition('idle')).toBeNull()
    expect(quipCategoryForTransition('streaming')).toBeNull()
  })
})

describe('pickQuip', () => {
  it('always returns one of the category’s known variants', () => {
    for (const category of Object.keys(QUIP_VARIANTS) as (keyof typeof QUIP_VARIANTS)[]) {
      for (const seed of ['run-1', 'run-2', 'abc', '', 'a-very-long-run-id-1234567890']) {
        expect(QUIP_VARIANTS[category]).toContain(pickQuip(category, seed))
      }
    }
  })

  it('is deterministic: the same category + seed always picks the same variant', () => {
    expect(pickQuip('thinking', 'run-42')).toBe(pickQuip('thinking', 'run-42'))
    expect(pickQuip('success', 'run-42')).toBe(pickQuip('success', 'run-42'))
  })

  it('includes the spec-named line as a variant for each category', () => {
    expect(QUIP_VARIANTS.thinking).toContain('Crunching tokens…')
    expect(QUIP_VARIANTS.success).toContain('Nailed it. 😎')
    expect(QUIP_VARIANTS.error).toContain("That wasn't supposed to happen.")
    expect(QUIP_VARIANTS.cancelled).toContain('Say no more.')
  })

  it('offers 2-3 variants per category', () => {
    for (const variants of Object.values(QUIP_VARIANTS)) {
      expect(variants.length).toBeGreaterThanOrEqual(2)
      expect(variants.length).toBeLessThanOrEqual(3)
    }
  })
})
