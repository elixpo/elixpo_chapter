// Deterministic synthetic scene used by the save/load benchmark and the
// persistence tests. Produces a v1 `.lixjson` scene object (the same shape
// `saveScene()` emits) with a realistic mix of shape types.

function rng(seed) {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0x100000000
    }
}

function fakeDataUrl(rand, bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let out = ''
    for (let i = 0; i < bytes; i += 1) out += alphabet[Math.floor(rand() * 64)]
    return `data:image/png;base64,${out}`
}

const OPTIONS = { stroke: '#e0e0e0', fill: 'transparent', strokeWidth: 2, roughness: 1.5, fillStyle: 'hachure', strokeDasharray: '' }

export function buildSyntheticScene({
    total = 2000,
    inlineImages = 10,
    inlineImageBytes = 150_000,
    seed = 42,
} = {}) {
    const rand = rng(seed)
    const shapes = []
    const ids = []
    const mix = [
        ['rectangle', 0.25], ['circle', 0.15], ['line', 0.1], ['arrow', 0.15],
        ['freehandStroke', 0.12], ['text', 0.1], ['code', 0.03], ['icon', 0.03],
        ['image', 0.03], ['frame', 0.04],
    ]
    const counts = mix.map(([type, share]) => [type, Math.max(1, Math.round(total * share))])
    let inlineLeft = inlineImages
    let n = 0
    for (const [type, count] of counts) {
        for (let i = 0; i < count; i += 1) {
            const id = `${type}-${n += 1}`
            const x = Math.round(rand() * 8000)
            const y = Math.round(rand() * 8000)
            const base = { shapeID: id, docBlockIds: [], parentFrame: null, groupId: null }
            let data
            switch (type) {
                case 'rectangle':
                    data = { ...base, type, x, y, width: 120, height: 80, rotation: 0, options: { ...OPTIONS, label: `Box ${i}` } }
                    break
                case 'circle':
                    data = { ...base, type, x, y, rx: 50, ry: 40, rotation: 0, options: { ...OPTIONS } }
                    break
                case 'line':
                    data = { ...base, type, startPoint: { x, y }, endPoint: { x: x + 100, y: y + 40 }, controlPoint: null, isCurved: false, options: { ...OPTIONS } }
                    break
                case 'arrow':
                    data = {
                        ...base, type, startPoint: { x, y }, endPoint: { x: x + 160, y },
                        options: { ...OPTIONS }, arrowOutlineStyle: 'solid', startArrowhead: 'none', endArrowhead: 'arrow',
                        arrowCurved: 'straight', arrowCurveAmount: 50,
                    }
                    if (ids.length > 2) {
                        data.startAttachmentID = ids[Math.floor(rand() * ids.length)]
                        data.endAttachmentID = ids[Math.floor(rand() * ids.length)]
                    }
                    break
                case 'freehandStroke': {
                    const points = []
                    for (let p = 0; p < 60; p += 1) points.push([x + p * 3, y + Math.round(rand() * 20), 0.5])
                    data = { ...base, type, points, rotation: 0, options: { ...OPTIONS, thinning: 0.5 } }
                    break
                }
                case 'text':
                    data = {
                        ...base, type, x, y, rotation: 0,
                        groupHTML: `<g data-type="text-group" transform="translate(${x}, ${y})"><text x="0" y="0" font-size="30" font-family="lixFont" fill="#fff"><tspan x="0" dy="0">Synthetic text ${i}</tspan><tspan x="0" dy="1.2em">second line of the label</tspan></text></g>`,
                    }
                    break
                case 'code':
                    data = {
                        ...base, type, x, y, rotation: 0,
                        groupHTML: `<g data-type="code-group" transform="translate(${x}, ${y})"><rect width="400" height="200"/><text>${'const value = compute(input) // line\n'.repeat(20)}</text></g>`,
                    }
                    break
                case 'icon':
                    data = {
                        ...base, type, x, y, width: 48, height: 48, rotation: 0,
                        elementHTML: `<g data-type="icon" transform="translate(${x}, ${y})"><path d="${'M12 2L2 7l10 5 10-5-10-5z '.repeat(12)}"/></g>`,
                        viewboxWidth: 24, viewboxHeight: 24,
                    }
                    break
                case 'image': {
                    const inline = inlineLeft > 0
                    if (inline) inlineLeft -= 1
                    data = {
                        ...base, type, x, y, width: 320, height: 200, rotation: 0,
                        href: inline ? fakeDataUrl(rand, inlineImageBytes) : `https://res.cloudinary.com/demo/image/upload/v1/${id}.webp`,
                        sizeBytes: inline ? inlineImageBytes : 40_000,
                        cloudinaryId: inline ? null : id,
                        storageProvider: 'platform_cloudinary', storageCloudName: null,
                        aiGenerated: false, aiModel: null, frameType: null, graphData: null,
                    }
                    break
                }
                case 'frame':
                    data = {
                        ...base, type, x, y, width: 600, height: 400, rotation: 0, frameName: `Frame ${i}`,
                        fillStyle: 'transparent', fillColor: '#1e1e28', gridSize: 20, gridColor: 'rgba(255,255,255,0.06)',
                        frameType: null, webEmbedURL: null, options: { stroke: '#888', strokeWidth: 2 }, containedShapeIDs: [],
                    }
                    break
                default:
                    break
            }
            shapes.push(data)
            if (type !== 'arrow') ids.push(id)
        }
    }
    // Put a few rectangles in each frame.
    const frames = shapes.filter(s => s.type === 'frame')
    const rects = shapes.filter(s => s.type === 'rectangle')
    frames.forEach((frame, index) => {
        for (let k = 0; k < 3; k += 1) {
            const child = rects[(index * 3 + k) % rects.length]
            if (child.parentFrame) continue
            child.parentFrame = frame.shapeID
            frame.containedShapeIDs.push(child.shapeID)
        }
    })
    return {
        format: 'lixsketch',
        version: 1,
        sessionID: 'lx-bench-scene',
        name: 'Benchmark',
        createdAt: '2026-01-01T00:00:00.000Z',
        viewport: { x: 0, y: 0, width: 1600, height: 900 },
        zoom: 1,
        shapes,
    }
}
