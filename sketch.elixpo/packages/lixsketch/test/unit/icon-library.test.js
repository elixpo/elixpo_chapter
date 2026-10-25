import { describe, it, expect, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import {
    ICON_INDEX_BUDGET_BYTES,
    ICON_INDEX_PATH,
    buildIconIndex,
    createIconLibrary,
    searchIconIndex,
    shouldPrefetchIndex,
} from '../../src/core/IconLibrary.js'

const METADATA = {
    'aws_lambda.svg': { keywords: ['serverless', 'compute'], category: 'devops', description: 'AWS Lambda function' },
    'react.svg': { keywords: ['ui', 'frontend'], category: 'tech', description: 'React library' },
    'twitter-x.svg': { keywords: ['social'], category: 'social media', description: 'X logo' },
}

function jsonResponse(body) {
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

describe('searchIconIndex', () => {
    const index = buildIconIndex(METADATA)

    it('matches every term across filename, keywords, description and category', () => {
        expect(searchIconIndex(index, { q: 'aws serverless' }).map((r) => r.filename)).toEqual(['aws_lambda.svg'])
        expect(searchIconIndex(index, { q: 'twitter x' }).map((r) => r.filename)).toEqual(['twitter-x.svg'])
        expect(searchIconIndex(index, { q: 'react serverless' })).toEqual([])
    })

    it('filters by category case-insensitively and respects the limit', () => {
        expect(searchIconIndex(index, { category: 'DevOps' }).map((r) => r.filename)).toEqual(['aws_lambda.svg'])
        expect(searchIconIndex(index, { limit: 2 })).toHaveLength(2)
    })

    it('does not leak internal search fields', () => {
        const [result] = searchIconIndex(index, { q: 'react' })
        expect(result).not.toHaveProperty('searchText')
        expect(result).not.toHaveProperty('normalizedCategory')
        expect(result).toMatchObject({ filename: 'react.svg', category: 'tech' })
    })
})

describe('createIconLibrary', () => {
    it('downloads the index once and then searches synchronously', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse(METADATA))
        const library = createIconLibrary({ fetchImpl })
        expect(library.searchSync({ q: 'react' })).toBeNull()

        const [a, b] = await Promise.all([library.search({ q: 'react' }), library.search({ q: 'aws' })])
        expect(a.map((r) => r.filename)).toEqual(['react.svg'])
        expect(b.map((r) => r.filename)).toEqual(['aws_lambda.svg'])
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(fetchImpl).toHaveBeenCalledWith(ICON_INDEX_PATH)

        expect(library.isReady()).toBe(true)
        expect(library.searchSync({ q: 'social' }).map((r) => r.filename)).toEqual(['twitter-x.svg'])
    })

    it('falls back to server search when the index fails, and retries later', async () => {
        let fail = true
        const fetchImpl = vi.fn(async () => (fail ? { ok: false, status: 503 } : jsonResponse(METADATA)))
        const searchFallback = vi.fn(async () => [{ filename: 'from-server.svg' }])
        const library = createIconLibrary({ fetchImpl, searchFallback })

        expect(await library.search({ q: 'react' })).toEqual([{ filename: 'from-server.svg' }])
        expect(searchFallback).toHaveBeenCalledWith({ q: 'react' })

        fail = false
        expect((await library.search({ q: 'react' })).map((r) => r.filename)).toEqual(['react.svg'])
        expect(fetchImpl).toHaveBeenCalledTimes(2)
    })

    it('memoises SVG markup and evicts failed downloads', async () => {
        let ok = false
        const fetchImpl = vi.fn(async (url) => (ok
            ? { ok: true, status: 200, text: async () => `<svg data-url="${url}"/>` }
            : { ok: false, status: 404 }))
        const library = createIconLibrary({ fetchImpl })

        await expect(library.getSvg('react.svg')).rejects.toThrow('404')
        ok = true
        const [first, second] = await Promise.all([library.getSvg('react.svg'), library.getSvg('react.svg')])
        expect(first).toBe('<svg data-url="/icons/react.svg"/>')
        expect(second).toBe(first)
        expect(fetchImpl).toHaveBeenCalledTimes(2)

        library.prefetchSvgs(['react.svg', 'aws_lambda.svg'])
        await library.getSvg('aws_lambda.svg')
        expect(fetchImpl).toHaveBeenCalledTimes(3)
    })
})

describe('shouldPrefetchIndex', () => {
    it('skips eager downloads on data saver and 2G', () => {
        expect(shouldPrefetchIndex({})).toBe(true)
        expect(shouldPrefetchIndex({ connection: { effectiveType: '4g' } })).toBe(true)
        expect(shouldPrefetchIndex({ connection: { saveData: true, effectiveType: '4g' } })).toBe(false)
        expect(shouldPrefetchIndex({ connection: { effectiveType: 'slow-2g' } })).toBe(false)
        expect(shouldPrefetchIndex({ connection: { effectiveType: '2g' } })).toBe(false)
    })
})

describe('shipped icon library', () => {
    const publicIcons = fileURLToPath(new URL('../../../../public/icons/', import.meta.url))
    const indexFile = `${publicIcons}info/icons.json`

    it('keeps the client-side index within its download budget', () => {
        const raw = readFileSync(indexFile)
        const gzipped = gzipSync(raw, { level: 9 }).length
        // If this fails the library has outgrown the client-side index;
        // shard the index (or trim descriptions) before raising the budget.
        expect(gzipped).toBeLessThan(ICON_INDEX_BUDGET_BYTES)
    })

    it('has an SVG file for every index entry', () => {
        const metadata = JSON.parse(readFileSync(indexFile, 'utf8'))
        const missing = Object.keys(metadata).filter((filename) => !existsSync(`${publicIcons}${filename}`))
        expect(missing).toEqual([])
    })
})
