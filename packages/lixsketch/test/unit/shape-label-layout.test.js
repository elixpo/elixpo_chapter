import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SHAPE_LABEL_FONT_SIZE,
  ELLIPSE_INSET,
  SHAPE_LABEL_PADDING_X,
  SHAPE_LABEL_PADDING_Y,
  fitShapeToLabel,
  longestShapeLabelWord,
  measureShapeLabel,
  setShapeLabelMeasurer,
  wrapShapeLabel,
} from '../../src/core/ShapeLabelLayout.js'

// Deterministic measurer: every character is half the font size wide, so at
// 20px each character is 10 units and lines are 26 units tall.
const monospace = (text, fontSize) => [...text].length * fontSize * 0.5
const FONT = 20
const LINE = FONT * 1.3

describe('shape label layout', () => {
  it('uses a readable default font size', () => {
    expect(DEFAULT_SHAPE_LABEL_FONT_SIZE).toBeGreaterThanOrEqual(18)
  })

  it('grows vertically for intentional newlines', () => {
    const single = measureShapeLabel('first line', 18)
    const multiline = measureShapeLabel('first line\nsecond line\nthird line', 18)

    expect(multiline.lines).toHaveLength(3)
    expect(multiline.requiredHeight).toBeGreaterThan(single.requiredHeight)
  })

  it('grows horizontally for overflowing text', () => {
    const short = measureShapeLabel('short', 18)
    const long = measureShapeLabel('a substantially longer rectangle label', 18)

    expect(long.requiredWidth).toBeGreaterThan(short.requiredWidth)
  })

  describe('with an injected measurer', () => {
    beforeEach(() => setShapeLabelMeasurer(monospace))
    afterEach(() => setShapeLabelMeasurer(null))

    it('wraps words at the max width and keeps explicit newlines', () => {
      expect(wrapShapeLabel('aaa bbb ccc', { fontSize: FONT, maxWidth: 70 })).toEqual(['aaa bbb', 'ccc'])
      expect(wrapShapeLabel('aaa bbb\nccc ddd', { fontSize: FONT, maxWidth: 1000 })).toEqual(['aaa bbb', 'ccc ddd'])
      expect(wrapShapeLabel('aaa\n\nbbb', { fontSize: FONT, maxWidth: 40 })).toEqual(['aaa', '', 'bbb'])
    })

    it('never breaks an unbreakable word', () => {
      expect(wrapShapeLabel('tiny supercalifragilistic word', { fontSize: FONT, maxWidth: 60 }))
        .toEqual(['tiny', 'supercalifragilistic', 'word'])
      expect(longestShapeLabelWord('tiny supercalifragilistic word', { fontSize: FONT })).toBe(200)
    })

    it('accepts a per-call measurer that overrides the module measurer', () => {
      const wide = (text) => text.length * 100
      expect(wrapShapeLabel('ab cd', { fontSize: FONT, maxWidth: 250, measure: wide })).toEqual(['ab', 'cd'])
    })

    it('measures wrapped content when a max width is given', () => {
      const layout = measureShapeLabel('aaa bbb ccc', FONT, { maxWidth: 70 })
      expect(layout.lines).toEqual(['aaa bbb', 'ccc'])
      expect(layout.contentWidth).toBe(70)
      expect(layout.contentHeight).toBeCloseTo(2 * LINE)
    })

    it('keeps the user size when there is no label or the label fits', () => {
      expect(fitShapeToLabel({ label: '', userWidth: 100, userHeight: 60 }))
        .toMatchObject({ width: 100, height: 60, layout: null })
      const fit = fitShapeToLabel({ label: 'ok', fontSize: FONT, userWidth: 100, userHeight: 60 })
      expect(fit).toMatchObject({ width: 100, height: 60 })
      expect(fit.layout.lines).toEqual(['ok'])
    })

    it('wraps at the inner width and grows only the height for long text', () => {
      // Inner width = 100 - 2 * 16 = 68 -> one 3-letter word per line.
      const fit = fitShapeToLabel({ label: 'aaa bbb ccc ddd', fontSize: FONT, userWidth: 100, userHeight: 60 })
      expect(fit.layout.lines).toEqual(['aaa', 'bbb', 'ccc', 'ddd'])
      expect(fit.width).toBe(100)
      expect(fit.height).toBe(Math.ceil(4 * LINE + 2 * SHAPE_LABEL_PADDING_Y))
      expect(fit.minHeight).toBe(fit.height)
    })

    it('grows the width only for an unbreakable word', () => {
      const fit = fitShapeToLabel({ label: 'supercalifragilistic', fontSize: FONT, userWidth: 100, userHeight: 60 })
      expect(fit.width).toBe(200 + 2 * SHAPE_LABEL_PADDING_X)
      expect(fit.height).toBe(60)
      expect(fit.layout.lines).toEqual(['supercalifragilistic'])
    })

    it('grows the width for the full line when wrapping is off', () => {
      const fit = fitShapeToLabel({ label: 'aaa bbb ccc ddd', fontSize: FONT, wrap: false, userWidth: 100, userHeight: 60 })
      expect(fit.width).toBe(150 + 2 * SHAPE_LABEL_PADDING_X)
      expect(fit.layout.lines).toEqual(['aaa bbb ccc ddd'])
      expect(fit.height).toBe(60)
    })

    it('never shrinks below the user size', () => {
      const fit = fitShapeToLabel({ label: 'a', fontSize: FONT, userWidth: 400, userHeight: 300 })
      expect(fit).toMatchObject({ width: 400, height: 300 })
    })

    it('uses the inscribed rectangle for ellipses', () => {
      const rect = fitShapeToLabel({ label: 'aaa bbb ccc ddd', fontSize: FONT, userWidth: 200, userHeight: 40 })
      const ellipse = fitShapeToLabel({ label: 'aaa bbb ccc ddd', fontSize: FONT, userWidth: 200, userHeight: 40, inset: ELLIPSE_INSET })
      expect(ellipse.height).toBeGreaterThan(rect.height)
      // The wrapped content fits inside the inscribed box.
      expect(ellipse.layout.contentWidth + 2 * SHAPE_LABEL_PADDING_X).toBeLessThanOrEqual(ellipse.width * ELLIPSE_INSET + 1e-6)
      expect(ellipse.layout.contentHeight + 2 * SHAPE_LABEL_PADDING_Y).toBeLessThanOrEqual(ellipse.height * ELLIPSE_INSET + 1e-6)
    })

    it('restores the default measurer when passed null', () => {
      setShapeLabelMeasurer(null)
      const width = measureShapeLabel('abc', FONT).contentWidth
      expect(width).not.toBe(30)
      expect(width).toBeGreaterThan(0)
    })
  })
})
