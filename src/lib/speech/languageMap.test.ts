import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../../data/languages'
import {
  primarySubtag,
  SPEECH_LANG_TAGS,
  toRecognitionLang,
  toSynthesisLang,
} from './languageMap'

describe('languageMap', () => {
  it('has a BCP-47 pair for every app language, and no extras', () => {
    const appCodes = LANGUAGES.map((l) => l.code).sort()
    const mapCodes = Object.keys(SPEECH_LANG_TAGS).sort()
    expect(mapCodes).toEqual(appCodes)
  })

  it('maps known codes to the expected synthesis tags', () => {
    expect(toSynthesisLang('en')).toBe('en-US')
    expect(toSynthesisLang('es')).toBe('es-ES')
    expect(toSynthesisLang('zh')).toBe('zh-CN')
    expect(toSynthesisLang('ur')).toBe('ur-PK')
    expect(toSynthesisLang('ar')).toBe('ar-SA')
    expect(toSynthesisLang('hi')).toBe('hi-IN')
  })

  it('maps known codes to the expected recognition tags', () => {
    expect(toRecognitionLang('es')).toBe('es-ES')
    expect(toRecognitionLang('ur')).toBe('ur-PK')
    expect(toRecognitionLang('zh')).toBe('zh-CN')
  })

  it('every tag is a well-formed BCP-47 region tag', () => {
    for (const { recognition, synthesis } of Object.values(SPEECH_LANG_TAGS)) {
      expect(recognition).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
      expect(synthesis).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
    }
  })

  it('extracts the lower-cased primary subtag', () => {
    expect(primarySubtag('es-ES')).toBe('es')
    expect(primarySubtag('ES-es')).toBe('es')
    expect(primarySubtag('zh-CN')).toBe('zh')
    expect(primarySubtag('en')).toBe('en')
  })
})
