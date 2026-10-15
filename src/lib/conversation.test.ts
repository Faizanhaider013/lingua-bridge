import { describe, expect, it } from 'vitest'
import { derivePhase, type PhaseInputs } from './conversation'

const NONE: PhaseInputs = {
  listening: false,
  translating: false,
  speaking: false,
  error: false,
  interrupted: false,
}

describe('derivePhase', () => {
  it('is idle when nothing is happening', () => {
    expect(derivePhase(NONE)).toBe('idle')
  })

  it('reports each single active signal', () => {
    expect(derivePhase({ ...NONE, listening: true })).toBe('listening')
    expect(derivePhase({ ...NONE, translating: true })).toBe('translating')
    expect(derivePhase({ ...NONE, speaking: true })).toBe('speaking')
    expect(derivePhase({ ...NONE, error: true })).toBe('error')
    expect(derivePhase({ ...NONE, interrupted: true })).toBe('interrupted')
  })

  it('prioritises an active mic over everything else', () => {
    expect(
      derivePhase({
        listening: true,
        translating: true,
        speaking: true,
        error: true,
        interrupted: true,
      }),
    ).toBe('listening')
  })

  it('prioritises an in-flight translation over speaking/error/interrupted', () => {
    expect(
      derivePhase({ ...NONE, translating: true, speaking: true, error: true, interrupted: true }),
    ).toBe('translating')
  })

  it('prioritises active speech over a lingering error or interruption', () => {
    expect(derivePhase({ ...NONE, speaking: true, error: true, interrupted: true })).toBe(
      'speaking',
    )
  })

  it('shows error above a trailing interrupted marker', () => {
    expect(derivePhase({ ...NONE, error: true, interrupted: true })).toBe('error')
  })
})
