import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CANVAS_THEME_KEY,
  DEFAULT_THEME,
  LEGACY_THEME_KEY,
  UI_PREFS_KEY,
  readCanvasTheme,
  readUITheme,
  resolveThemeValue,
  writeCanvasTheme,
  writeUITheme,
} from '../src/utils/themePreferences.js'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    dump: () => Object.fromEntries(data),
  }
}

test('canvas and UI themes default to light', () => {
  const storage = memoryStorage()
  assert.equal(DEFAULT_THEME, 'light')
  assert.equal(readCanvasTheme(storage), 'light')
  assert.equal(readUITheme(storage), 'light')
  assert.equal(readCanvasTheme(null), 'light')
  assert.equal(readUITheme(null), 'light')
})

test('resolveThemeValue only resolves dark when asked for dark', () => {
  assert.equal(resolveThemeValue('dark'), 'dark')
  assert.equal(resolveThemeValue('light'), 'light')
  assert.equal(resolveThemeValue('bogus'), 'light')
  assert.equal(resolveThemeValue(undefined), 'light')
  assert.equal(resolveThemeValue('system', true), 'dark')
  assert.equal(resolveThemeValue('system', false), 'light')
})

test('legacy theme key migrates to the dedicated canvas key', () => {
  const storage = memoryStorage({ [LEGACY_THEME_KEY]: 'dark', [UI_PREFS_KEY]: JSON.stringify({ theme: 'dark', language: 'de' }) })
  assert.equal(readCanvasTheme(storage), 'dark')
  const after = storage.dump()
  assert.equal(after[CANVAS_THEME_KEY], 'dark')
  assert.equal(after[LEGACY_THEME_KEY], undefined)
  assert.deepEqual(JSON.parse(after[UI_PREFS_KEY]), { language: 'de' })
  // The legacy value never becomes the interface theme.
  assert.equal(readUITheme(storage), 'light')
})

test('legacy lix_ui_prefs.theme migrates when the bare key is missing', () => {
  const storage = memoryStorage({ [UI_PREFS_KEY]: JSON.stringify({ theme: 'system' }) })
  assert.equal(readCanvasTheme(storage), 'system')
  assert.equal(storage.dump()[CANVAS_THEME_KEY], 'system')
})

test('dedicated canvas key wins over legacy values', () => {
  const storage = memoryStorage({ [CANVAS_THEME_KEY]: 'light', [LEGACY_THEME_KEY]: 'dark' })
  assert.equal(readCanvasTheme(storage), 'light')
})

test('invalid stored values fall back to light without throwing', () => {
  const storage = memoryStorage({ [CANVAS_THEME_KEY]: 'neon', [LEGACY_THEME_KEY]: 'neon', [UI_PREFS_KEY]: '{not json' })
  assert.equal(readCanvasTheme(storage), 'light')
  assert.equal(readUITheme(storage), 'light')
})

test('canvas and UI themes persist independently', () => {
  const storage = memoryStorage({ [UI_PREFS_KEY]: JSON.stringify({ language: 'hi' }) })
  writeCanvasTheme(storage, 'dark')
  assert.equal(readCanvasTheme(storage), 'dark')
  assert.equal(readUITheme(storage), 'light')

  writeUITheme(storage, 'dark')
  writeCanvasTheme(storage, 'light')
  assert.equal(readCanvasTheme(storage), 'light')
  assert.equal(readUITheme(storage), 'dark')
  assert.deepEqual(JSON.parse(storage.dump()[UI_PREFS_KEY]), { language: 'hi', uiTheme: 'dark' })

  writeCanvasTheme(storage, 'bogus')
  writeUITheme(storage, 'bogus')
  assert.equal(readCanvasTheme(storage), 'light')
  assert.equal(readUITheme(storage), 'dark')
})

test('storage that throws is tolerated', () => {
  const storage = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('denied') },
    removeItem() { throw new Error('denied') },
  }
  assert.equal(readCanvasTheme(storage), 'light')
  assert.equal(readUITheme(storage), 'light')
  assert.doesNotThrow(() => writeCanvasTheme(storage, 'dark'))
  assert.doesNotThrow(() => writeUITheme(storage, 'dark'))
})
