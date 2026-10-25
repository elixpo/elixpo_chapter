// Lightweight DOM + shape-class doubles for exercising SceneSerializer in a
// node environment (no jsdom). Shared by the persistence tests and the
// save/load benchmark. Use from a vi.mock factory:
//   vi.mock('../../src/shapes/Rectangle.js', async () => (await import('../helpers/mockShapes.js')).modules.Rectangle)

export function makeNode(tagName = 'g', outerHTML = `<${tagName}></${tagName}>`) {
    const attributes = new Map()
    return {
        tagName,
        children: [],
        parentNode: null,
        outerHTML,
        setAttribute(name, value) { attributes.set(name, String(value)) },
        getAttribute(name) { return attributes.get(name) ?? null },
        getAttributeNS(_namespace, name) { return attributes.get(name) ?? null },
        removeAttribute(name) { attributes.delete(name) },
        appendChild(child) {
            if (child.parentNode) child.parentNode.removeChild(child)
            this.children.push(child)
            child.parentNode = this
            return child
        },
        removeChild(child) {
            const index = this.children.indexOf(child)
            if (index !== -1) this.children.splice(index, 1)
            child.parentNode = null
            return child
        },
        remove() { if (this.parentNode) this.parentNode.removeChild(this) },
        querySelector() { return null },
        querySelectorAll() { return [] },
        cloneNode() {
            const clone = makeNode(tagName, this.outerHTML)
            for (const [name, value] of attributes) clone.setAttribute(name, value)
            return clone
        },
    }
}

export class BasicShape {
    constructor(shapeName, fields = {}) {
        Object.assign(this, fields)
        this.shapeName = shapeName
        this.shapeID = `${shapeName}-generated`
        this.rotation = this.rotation || 0
        this.group = makeNode('g')
        this.options = fields.options || {}
        globalThis.window.svg.appendChild(this.group)
    }

    // Mirrors Rectangle/Circle.applyLabelState (ShapeLabelState.applyContainerLabel).
    applyLabelState(state) {
        Object.assign(this, state)
    }
}

class DomBackedShape {
    constructor(shapeName, element) {
        this.shapeName = shapeName
        this.group = element
        this.element = element
        this.rotation = 0
        this.x = 0
        this.y = 0
    }
}

export const modules = {
    Rectangle: {
        Rectangle: class extends BasicShape {
            constructor(x, y, width, height, options) { super('rectangle', { x, y, width, height, options }) }
        },
    },
    Circle: {
        Circle: class extends BasicShape {
            constructor(x, y, rx, ry, options) { super('circle', { x, y, rx, ry, options }) }
        },
    },
    Line: {
        Line: class extends BasicShape {
            constructor(startPoint, endPoint, options) {
                super('line', { startPoint: { ...startPoint }, endPoint: { ...endPoint }, options })
            }
        },
    },
    Arrow: {
        Arrow: class extends BasicShape {
            constructor(startPoint, endPoint, options) {
                super('arrow', { startPoint: { ...startPoint }, endPoint: { ...endPoint }, options })
                // Mirrors the real Arrow class: bindings live in
                // attachedToStart/End = { shape, side, offset }.
                this.attachedToStart = null
                this.attachedToEnd = null
                this.draws = 1
            }
            draw() { this.draws += 1 }
        },
    },
    FreehandStroke: {
        FreehandStroke: class extends BasicShape {
            constructor(points, options) { super('freehandStroke', { points, options }) }
        },
    },
    Frame: {
        Frame: class extends BasicShape {
            constructor(x, y, width, height, options) {
                super('frame', { x, y, width, height, options })
                this.frameName = options.frameName
                this.fillStyle = options.fillStyle || 'transparent'
                this.fillColor = options.fillColor || '#1e1e28'
                this.gridSize = options.gridSize || 20
                this.gridColor = options.gridColor || 'rgba(255,255,255,0.06)'
                this._frameType = options.frameType || null
                this._webEmbedURL = options.webEmbedURL || null
                this.containedShapes = []
                this.clipGroup = makeNode('g')
                this.drawCount = 0
                globalThis.window.svg.appendChild(this.clipGroup)
            }
            addShapeToFrame(shape) {
                if (!this.containedShapes.includes(shape)) this.containedShapes.push(shape)
                shape.parentFrame = this
                this.clipGroup.appendChild(shape.group || shape.element)
            }
            draw() { this.drawCount += 1 }
            updateClipPath() {}
        },
    },
    TextShape: { TextShape: class extends DomBackedShape { constructor(el) { super('text', el) } } },
    CodeShape: { CodeShape: class extends DomBackedShape { constructor(el) { super('code', el) } } },
    IconShape: { IconShape: class extends DomBackedShape { constructor(el) { super('icon', el) } } },
    ImageShape: {
        ImageShape: class extends BasicShape {
            constructor(element) {
                super('image')
                this.element = element
                this.group.appendChild(element)
                this.x = Number(element.getAttribute('x'))
                this.y = Number(element.getAttribute('y'))
                this.width = Number(element.getAttribute('width'))
                this.height = Number(element.getAttribute('height'))
            }
        },
    },
}

export function installGlobals(vi) {
    const svg = makeNode('svg')
    svg.ownerDocument = { importNode: node => node }
    globalThis.document = { createElementNS: (_namespace, tagName) => makeNode(tagName) }
    globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail } }
    // Minimal DOMParser: wraps the serialized group so SceneSerializer can
    // import it. The node keeps the original markup as its outerHTML.
    globalThis.DOMParser = class {
        parseFromString(markup) {
            const inner = markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
            const node = makeNode('g', inner)
            return { querySelector: () => node }
        }
    }
    globalThis.window = {
        svg,
        shapes: [],
        historyStack: [],
        redoStack: [],
        currentViewBox: { x: 0, y: 0, width: 900, height: 600 },
        currentZoom: 1,
        dispatchEvent: vi ? vi.fn() : () => {},
    }
    return svg
}

export function uninstallGlobals() {
    delete globalThis.document
    delete globalThis.CustomEvent
    delete globalThis.DOMParser
    delete globalThis.window
}
