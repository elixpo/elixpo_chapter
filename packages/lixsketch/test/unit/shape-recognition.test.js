import { describe, expect, it } from 'vitest'

import {
  MAX_GESTURE_POINTS,
  capGestureSample,
  predictDrawnShape,
} from '../../src/tools/shapeRecognition.js'

function rectangle({ x = 0, y = 0, width = 120, height = 70, noise = 0 } = {}) {
  const points = []
  const edge = (startX, startY, endX, endY) => {
    for (let index = 0; index < 10; index += 1) {
      const progress = index / 10
      const wobble = noise ? Math.sin(points.length * 1.7) * noise : 0
      points.push({
        x: startX + (endX - startX) * progress + wobble,
        y: startY + (endY - startY) * progress - wobble,
      })
    }
  }
  edge(x, y, x + width, y)
  edge(x + width, y, x + width, y + height)
  edge(x + width, y + height, x, y + height)
  edge(x, y + height, x, y)
  points.push({ ...points[0] })
  return points
}

function ellipse({ cx = 60, cy = 40, rx = 55, ry = 30, noise = 0 } = {}) {
  return Array.from({ length: 49 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2
    const wobble = noise ? Math.sin(index * 2.3) * noise : 0
    return {
      x: cx + Math.cos(angle) * (rx + wobble),
      y: cy + Math.sin(angle) * (ry + wobble),
    }
  })
}

function line(noise = 0) {
  return Array.from({ length: 20 }, (_, index) => ({
    x: index * 6,
    y: index * 2 + (noise ? Math.sin(index * 1.9) * noise : 0),
  }))
}

function arrow(noise = 0) {
  return [
    { x: 0, y: 0 },
    { x: 20, y: noise },
    { x: 40, y: -noise },
    { x: 60, y: noise },
    { x: 80, y: -noise },
    { x: 100, y: 0 },
    { x: 82, y: -14 },
    { x: 100, y: 0 },
    { x: 82, y: 14 },
  ]
}

describe('predictDrawnShape', () => {
  it.each([
    ['clean rectangle', rectangle(), 'rectangle'],
    ['noisy rectangle', rectangle({ noise: 1.2 }), 'rectangle'],
    ['clean ellipse', ellipse(), 'circle'],
    ['noisy ellipse', ellipse({ noise: 0.8 }), 'circle'],
    ['clean line', line(), 'line'],
    ['noisy line', line(0.35), 'line'],
    ['clean arrow', arrow(), 'arrow'],
    ['noisy arrow', arrow(0.5), 'arrow'],
  ])('recognizes a %s', (_label, points, expectedType) => {
    expect(predictDrawnShape(points)?.type).toBe(expectedType)
  })

  it('keeps an unrecognizable scribble as freehand', () => {
    const scribble = [
      [0, 0], [30, 40], [5, 70], [55, 15], [80, 65],
      [20, 55], [70, 5], [95, 45], [45, 80], [110, 90],
    ].map(([x, y]) => ({ x, y }))

    expect(predictDrawnShape(scribble)?.type).toBe('freehand')
  })

  it('caps very long input while preserving its endpoints', () => {
    const longGesture = Array.from({ length: 20_000 }, (_, index) => ({
      x: index,
      y: Math.sin(index / 3) * 40,
    }))

    const capped = capGestureSample(longGesture)
    expect(capped).toHaveLength(MAX_GESTURE_POINTS)
    expect(capped[0]).toBe(longGesture[0])
    expect(capped.at(-1)).toBe(longGesture.at(-1))
    expect(predictDrawnShape(longGesture)).not.toBeNull()
  })
})
