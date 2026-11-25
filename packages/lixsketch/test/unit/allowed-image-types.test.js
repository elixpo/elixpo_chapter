import { describe, expect, it } from 'vitest'
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  isAllowedImage,
} from '../../src/utils/allowedImageTypes.js'

const EXPECTED_MIME_TYPES = [
  'image/avif',
  'image/jpeg',
  'image/png',
  'image/bmp',
  'image/svg+xml',
  'image/webp',
]

const EXPECTED_EXTENSIONS = [
  '.avif',
  '.jpeg',
  '.jpg',
  '.png',
  '.bmp',
  '.svg',
  '.webp',
]

describe('allowed image lists', () => {
  it('contains exactly the supported MIME types and extensions', () => {
    expect([...ALLOWED_IMAGE_MIME_TYPES]).toEqual(EXPECTED_MIME_TYPES)
    expect([...ALLOWED_IMAGE_EXTENSIONS]).toEqual(EXPECTED_EXTENSIONS)
  })
})

describe('isAllowedImage by MIME type', () => {
  it.each(EXPECTED_MIME_TYPES)('accepts %s', (type) => {
    expect(isAllowedImage({ name: 'upload', type })).toBe(true)
  })

  it('accepts upper-case and mixed-case MIME types', () => {
    expect(isAllowedImage({ name: 'upload', type: 'IMAGE/PNG' })).toBe(true)
    expect(isAllowedImage({ name: 'upload', type: 'Image/Jpeg' })).toBe(true)
    expect(isAllowedImage({ name: 'upload', type: 'IMAGE/SVG+XML' })).toBe(true)
  })

  it('accepts an allowed MIME type even when the name has no extension', () => {
    expect(isAllowedImage({ name: 'clipboard-paste', type: 'image/png' })).toBe(true)
  })
})

describe('isAllowedImage by extension', () => {
  it.each(EXPECTED_EXTENSIONS)('accepts a file with an empty type and the %s extension', (ext) => {
    expect(isAllowedImage({ name: `diagram${ext}`, type: '' })).toBe(true)
  })

  it('accepts an upper-case extension when the type is empty', () => {
    expect(isAllowedImage({ name: 'diagram.SVG', type: '' })).toBe(true)
    expect(isAllowedImage({ name: 'photo.JPG', type: '' })).toBe(true)
  })

  it('falls back to the extension when the MIME type is not recognised', () => {
    expect(
      isAllowedImage({ name: 'image.png', type: 'application/octet-stream' }),
    ).toBe(true)
  })

  it('rejects a file with an empty type and no extension', () => {
    expect(isAllowedImage({ name: 'upload', type: '' })).toBe(false)
  })
})

describe('isAllowedImage rejects unsupported files', () => {
  it('rejects GIF, HEIC and PDF files by MIME type and extension', () => {
    expect(isAllowedImage({ name: 'animation.gif', type: 'image/gif' })).toBe(false)
    expect(isAllowedImage({ name: 'photo.heic', type: 'image/heic' })).toBe(false)
    expect(isAllowedImage({ name: 'document.pdf', type: 'application/pdf' })).toBe(false)
  })

  it('rejects disallowed image/* MIME types even when filename has an allowed extension', () => {
    expect(isAllowedImage({ name: 'anim.png', type: 'image/gif' })).toBe(false)
    expect(isAllowedImage({ name: 'photo.jpg', type: 'image/heic' })).toBe(false)
    expect(isAllowedImage({ name: 'banner.webp', type: 'image/tiff' })).toBe(false)
    expect(isAllowedImage({ name: 'logo.svg', type: 'image/x-icon' })).toBe(false)
  })

  it('rejects unsupported extensions when the type is empty', () => {
    expect(isAllowedImage({ name: 'animation.gif', type: '' })).toBe(false)
    expect(isAllowedImage({ name: 'photo.heic', type: '' })).toBe(false)
    expect(isAllowedImage({ name: 'photo.tiff', type: '' })).toBe(false)
    expect(isAllowedImage({ name: 'clip.mp4', type: '' })).toBe(false)
    expect(isAllowedImage({ name: 'notes.txt', type: '' })).toBe(false)
  })

  it('rejects other non-image MIME types', () => {
    expect(isAllowedImage({ name: 'archive.zip', type: 'application/zip' })).toBe(false)
    expect(isAllowedImage({ name: 'video.mp4', type: 'video/mp4' })).toBe(false)
  })
})

describe('isAllowedImage rejects missing files', () => {
  it('rejects null and undefined', () => {
    expect(isAllowedImage(null)).toBe(false)
    expect(isAllowedImage(undefined)).toBe(false)
  })

  it('rejects a file with no name and no type', () => {
    expect(isAllowedImage({})).toBe(false)
    expect(isAllowedImage({ name: '', type: '' })).toBe(false)
  })
})
