import { describe, expect, it, vi } from 'vitest';
import { createSceneApplier } from '../../src/core/collab/SceneApplier.js';
import { Z_KEY, applyOps, cloneDoc, materializeAndApply, orderedIds } from '../../src/core/collab/OT.js';
import { flattenShape } from '../../src/core/collab/SceneDoc.js';
import { CollabClient } from '../../src/core/collab/CollabClient.js';
import { rng } from './collab-sim.js';

// ------------------------------------------------------------------
// Minimal DOM + engine stand-ins
// ------------------------------------------------------------------

function makeNode(name) {
    return {
        name,
        parentNode: null,
        childNodes: [],
        appendChild(child) {
            if (child.parentNode) child.parentNode.removeChild(child);
            this.childNodes.push(child);
            child.parentNode = this;
            return child;
        },
        insertBefore(child, ref) {
            if (!ref) return this.appendChild(child);
            if (child.parentNode) child.parentNode.removeChild(child);
            this.childNodes.splice(this.childNodes.indexOf(ref), 0, child);
            child.parentNode = this;
            return child;
        },
        removeChild(child) {
            this.childNodes.splice(this.childNodes.indexOf(child), 1);
            child.parentNode = null;
            return child;
        },
    };
}

const INTERNAL = new Set(['shapeName', 'group', 'clipGroup', 'isSelected', 'parentFrame', 'attachedToStart', 'attachedToEnd', 'draw', 'options', 'applyLabelState', 'updateClipPath', 'shapeID', 'containedShapes', 'label', 'labelWrap', 'userWidth', 'userHeight']);

function makeShape(data, svg) {
    const shape = {
        shapeID: data.shapeID,
        shapeName: data.type,
        options: { ...(data.options || {}) },
        group: makeNode(data.shapeID),
        isSelected: false,
        parentFrame: null,
        draw: vi.fn(),
    };
    for (const [key, value] of Object.entries(data)) {
        if (['shapeID', 'type', 'options', 'parentFrame', 'docBlockIds', 'groupId', 'containedShapeIDs', 'startAttachmentID', 'endAttachmentID'].includes(key)) continue;
        shape[key] = JSON.parse(JSON.stringify(value));
    }
    if (data.groupId) shape.groupId = data.groupId;
    if (data.type === 'rectangle') {
        shape.applyLabelState = vi.fn(function applyLabelState(state) {
            this.width = state.userWidth;
            this.height = state.userHeight;
            this.draw();
        });
    }
    if (data.type === 'frame') {
        shape.clipGroup = makeNode(`${data.shapeID}-clip`);
        shape.containedShapes = [];
        shape.updateClipPath = vi.fn();
    }
    svg.appendChild(shape.group);
    if (shape.clipGroup) svg.appendChild(shape.clipGroup);
    return shape;
}

function makeEnv() {
    const svg = makeNode('svg');
    const state = { selected: new Set(), editing: null, gesture: new Set() };
    const env = {
        svg,
        state,
        shapes: [],
        createShape: vi.fn((data) => makeShape(data, svg)),
        removeShapeDom: vi.fn((shape) => {
            for (const node of [shape.group, shape.clipGroup]) if (node?.parentNode) node.parentNode.removeChild(node);
        }),
        sameLayer: (a, b) => a.group.parentNode === b.group.parentNode,
        placeBefore: vi.fn((shape, next) => {
            const parent = shape.group.parentNode;
            if (next && next.group.parentNode === parent) parent.insertBefore(shape.group, next.group);
            else parent.appendChild(shape.group);
        }),
        attachToFrame: vi.fn((shape, frame) => {
            if (!frame.containedShapes.includes(shape)) frame.containedShapes.push(shape);
            shape.parentFrame = frame;
            frame.clipGroup.appendChild(shape.group);
        }),
        detachFromFrame: vi.fn((shape) => {
            const frame = shape.parentFrame;
            if (!frame) return;
            frame.containedShapes.splice(frame.containedShapes.indexOf(shape), 1);
            shape.parentFrame = null;
            svg.appendChild(shape.group);
        }),
        setArrowBinding: vi.fn((arrow, isStart, target) => {
            const value = target ? { shape: target, side: 'left', offset: { x: 0, y: 0 } } : null;
            if (isStart) arrow.attachedToStart = value; else arrow.attachedToEnd = value;
        }),
        detachArrowsFrom: vi.fn((shape) => {
            for (const s of env.shapes) {
                if (s.attachedToStart?.shape === shape) s.attachedToStart = null;
                if (s.attachedToEnd?.shape === shape) s.attachedToEnd = null;
            }
        }),
        updateAttachedArrows: vi.fn(),
        isSelected: (shape) => state.selected.has(shape),
        select: vi.fn((shape) => { state.selected.add(shape); shape.isSelected = true; }),
        deselect: vi.fn((shape) => { state.selected.delete(shape); shape.isSelected = false; }),
        refreshSelection: vi.fn(),
        isEditing: (shape) => state.editing === shape,
        closeEditor: vi.fn(() => { state.editing = null; }),
        isInGesture: (shape) => state.gesture.has(shape),
    };
    return env;
}

/** Live mock scene -> OT doc (z from array order), for convergence checks. */
function liveDoc(env, zOf) {
    const shapes = {};
    for (const shape of env.shapes) {
        const data = { type: shape.shapeName, options: shape.options };
        for (const [key, value] of Object.entries(shape)) {
            if (INTERNAL.has(key) || typeof value === 'function') continue;
            data[key] = value;
        }
        if (shape.parentFrame) data.parentFrame = shape.parentFrame.shapeID;
        shapes[shape.shapeID] = { ...flattenShape(data), [Z_KEY]: zOf(shape.shapeID) };
    }
    return { shapes };
}

function sceneFrom(doc) {
    const env = makeEnv();
    const applier = createSceneApplier(env);
    applier.apply(orderedIds(doc).map((id) => ({ t: 'create', id, data: doc.shapes[id] })), doc);
    vi.clearAllMocks();
    return { env, applier };
}

function baseDoc() {
    return {
        shapes: {
            a: { type: 'rectangle', x: 0, y: 0, width: 10, height: 10, 'options.stroke': '#000', [Z_KEY]: 1024 },
            b: { type: 'rectangle', x: 50, y: 0, width: 10, height: 10, 'options.stroke': '#000', [Z_KEY]: 2048 },
            c: { type: 'rectangle', x: 90, y: 0, width: 10, height: 10, 'options.stroke': '#000', [Z_KEY]: 3072 },
            f: { type: 'frame', x: -100, y: -100, width: 400, height: 400, frameName: 'F', [Z_KEY]: 512 },
            arr: { type: 'arrow', startPoint: { x: 0, y: 0 }, endPoint: { x: 50, y: 0 }, startAttachmentID: 'a', endAttachmentID: 'b', [Z_KEY]: 4096 },
        },
    };
}

function step(doc, ops) {
    const next = cloneDoc(doc);
    const applied = materializeAndApply(next, ops);
    return { next, applied };
}

function snapshotRefs(env) {
    return new Map(env.shapes.map((s) => [s.shapeID, s]));
}

// ------------------------------------------------------------------

describe('SceneApplier: each op touches only its target', () => {
    it('update patches the live instance in place; other instances untouched', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const before = snapshotRefs(env);
        for (const s of env.shapes) s.draw.mockClear();
        const { next, applied } = step(doc, [{ t: 'update', id: 'b', set: { x: 77, 'options.stroke': '#f00' } }]);
        const result = applier.apply(applied, next);
        const b = env.shapes.find((s) => s.shapeID === 'b');
        expect(b).toBe(before.get('b'));
        expect(b.x).toBe(77);
        expect(b.options.stroke).toBe('#f00');
        expect(b.draw).toHaveBeenCalled();
        for (const s of env.shapes) {
            expect(s).toBe(before.get(s.shapeID));
            if (s.shapeID !== 'b') expect(s.draw).not.toHaveBeenCalled();
        }
        expect(env.createShape).not.toHaveBeenCalled();
        expect([...result.affected]).toEqual(['b']);
        expect(env.updateAttachedArrows).toHaveBeenCalledWith(b);
    });

    it('opacity and edges patch in place instead of rebuilding', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const before = snapshotRefs(env);
        const { next, applied } = step(doc, [{ t: 'update', id: 'b', set: { opacity: 0.4, edges: 'round' } }]);
        applier.apply(applied, next);
        const b = env.shapes.find((s) => s.shapeID === 'b');
        expect(b).toBe(before.get('b'));
        expect(env.createShape).not.toHaveBeenCalled();
        expect(b.opacity).toBe(0.4);
        expect(b.edges).toBe('round');
        expect(b.draw).toHaveBeenCalled();

        // Resetting to defaults removes the keys; the shape follows.
        const reset = step(next, [{ t: 'update', id: 'b', set: { opacity: undefined, edges: undefined } }]);
        applier.apply(reset.applied, reset.next);
        expect(b.opacity).toBe(1);
        expect(b.edges).toBe('sharp');
        expect(env.createShape).not.toHaveBeenCalled();
    });

    it('arrowhead changes patch the arrow in place instead of rebuilding', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const arrow = env.shapes.find((s) => s.shapeID === 'arr');
        const { next, applied } = step(doc, [{ t: 'update', id: 'arr', set: { startArrowhead: 'dot', endArrowhead: 'triangle' } }]);
        applier.apply(applied, next);
        expect(env.shapes.find((s) => s.shapeID === 'arr')).toBe(arrow);
        expect(env.createShape).not.toHaveBeenCalled();
        expect(arrow.startArrowhead).toBe('dot');
        expect(arrow.endArrowhead).toBe('triangle');
        expect(arrow.draw).toHaveBeenCalled();

        // A legacy client writing the old end-only key still patches in place.
        const legacy = step(next, [{ t: 'update', id: 'arr', set: { endArrowhead: undefined, arrowHeadStyle: 'outline' } }]);
        applier.apply(legacy.applied, legacy.next);
        expect(arrow.endArrowhead).toBe('triangle_outline');
        expect(arrow.startArrowhead).toBe('dot');
        expect(env.createShape).not.toHaveBeenCalled();
    });

    it('line arrowheads patch in place and reset to none when removed', () => {
        const doc = baseDoc();
        doc.shapes.ln = { type: 'line', startPoint: { x: 0, y: 50 }, endPoint: { x: 80, y: 50 }, [Z_KEY]: 5000 };
        const { env, applier } = sceneFrom(doc);
        const line = env.shapes.find((s) => s.shapeID === 'ln');
        const { next, applied } = step(doc, [{ t: 'update', id: 'ln', set: { endArrowhead: 'triangle', startArrowhead: 'bar' } }]);
        applier.apply(applied, next);
        expect(env.shapes.find((s) => s.shapeID === 'ln')).toBe(line);
        expect(env.createShape).not.toHaveBeenCalled();
        expect([line.startArrowhead, line.endArrowhead]).toEqual(['bar', 'triangle']);
        expect(line.draw).toHaveBeenCalled();
        const cleared = step(next, [{ t: 'update', id: 'ln', set: { startArrowhead: undefined, endArrowhead: undefined } }]);
        applier.apply(cleared.applied, cleared.next);
        expect([line.startArrowhead, line.endArrowhead]).toEqual(['none', 'none']);
        expect(env.createShape).not.toHaveBeenCalled();
    });

    it('container size/label changes go through applyLabelState', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const { next, applied } = step(doc, [{ t: 'update', id: 'a', set: { width: 40 } }]);
        applier.apply(applied, next);
        const a = env.shapes.find((s) => s.shapeID === 'a');
        expect(a.applyLabelState).toHaveBeenCalled();
        expect(a.width).toBe(40);
    });

    it('create constructs only the new shape at its z position', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const before = snapshotRefs(env);
        const { next, applied } = step(doc, [{ t: 'create', id: 'n', data: { type: 'rectangle', x: 5, y: 5, width: 1, height: 1, [Z_KEY]: 1500 } }]);
        applier.apply(applied, next);
        expect(env.createShape).toHaveBeenCalledTimes(1);
        expect(env.shapes.map((s) => s.shapeID)).toEqual(orderedIds(next));
        for (const [id, shape] of before) expect(env.shapes.find((s) => s.shapeID === id)).toBe(shape);
        const nodes = env.svg.childNodes.filter((n) => !n.name.endsWith('-clip')).map((n) => n.name);
        expect(nodes.indexOf('n')).toBe(nodes.indexOf('a') + 1);
    });

    it('create wires existing arrows and frame children that reference it', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        // b deleted, then re-created (undo of a peer's delete)
        let s1 = step(doc, [{ t: 'delete', id: 'b' }]);
        applier.apply(s1.applied, s1.next);
        const arrow = env.shapes.find((s) => s.shapeID === 'arr');
        expect(arrow.attachedToEnd).toBe(null);
        const s2 = step(s1.next, [{ t: 'create', id: 'b', data: doc.shapes.b }]);
        applier.apply(s2.applied, s2.next);
        expect(arrow.attachedToEnd.shape).toBe(env.shapes.find((s) => s.shapeID === 'b'));
        expect(env.shapes.find((s) => s.shapeID === 'arr')).toBe(arrow);
    });

    it('delete removes only that shape and detaches arrows bound to it', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const before = snapshotRefs(env);
        const { next, applied } = step(doc, [{ t: 'delete', id: 'a' }]);
        const result = applier.apply(applied, next);
        expect(env.shapes.find((s) => s.shapeID === 'a')).toBeUndefined();
        expect(before.get('a').group.parentNode).toBe(null);
        for (const s of env.shapes) expect(s).toBe(before.get(s.shapeID));
        expect(env.shapes.find((s) => s.shapeID === 'arr').attachedToStart).toBe(null);
        expect(result.removed.has('a')).toBe(true);
        expect(result.affected.has('arr')).toBe(true);
    });

    it('deleting a frame keeps its children', () => {
        const doc = baseDoc();
        doc.shapes.c = { ...doc.shapes.c, parentFrame: 'f' };
        const { env, applier } = sceneFrom(doc);
        const c = env.shapes.find((s) => s.shapeID === 'c');
        expect(c.parentFrame?.shapeID).toBe('f');
        const { next, applied } = step(doc, [{ t: 'delete', id: 'f' }]);
        applier.apply(applied, next);
        expect(env.shapes.find((s) => s.shapeID === 'c')).toBe(c);
        expect(c.parentFrame).toBe(null);
        expect(c.group.parentNode).toBe(env.svg);
    });

    it('move reorders only the moved node', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const before = snapshotRefs(env);
        const { next, applied } = step(doc, [{ t: 'move', id: 'a', z: 9999 }]);
        applier.apply(applied, next);
        expect(env.placeBefore).toHaveBeenCalledTimes(1);
        expect(env.placeBefore.mock.calls[0][0]).toBe(before.get('a'));
        expect(env.shapes.map((s) => s.shapeID)).toEqual(orderedIds(next));
        expect(env.svg.childNodes.filter((n) => !n.name.endsWith('-clip')).at(-1).name).toBe('a');
        for (const s of env.shapes) expect(s).toBe(before.get(s.shapeID));
    });

    it('member updates group and frame membership in place', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const b = env.shapes.find((s) => s.shapeID === 'b');
        const frame = env.shapes.find((s) => s.shapeID === 'f');
        const s1 = step(doc, [{ t: 'member', id: 'b', set: { parentFrame: 'f', groupId: 'g1' } }]);
        applier.apply(s1.applied, s1.next);
        expect(b.parentFrame).toBe(frame);
        expect(b.groupId).toBe('g1');
        expect(b.group.parentNode).toBe(frame.clipGroup);
        const s2 = step(s1.next, [{ t: 'member', id: 'b', set: { parentFrame: null } }]);
        applier.apply(s2.applied, s2.next);
        expect(b.parentFrame).toBe(null);
        expect(env.shapes.find((s) => s.shapeID === 'b')).toBe(b);
    });

    it('unpatchable properties rebuild just that shape and keep it selected', () => {
        const doc = baseDoc();
        doc.shapes.t = { type: 'text', x: 0, y: 0, groupHTML: '<g>hi</g>', [Z_KEY]: 5000 };
        const { env, applier } = sceneFrom(doc);
        const old = env.shapes.find((s) => s.shapeID === 't');
        env.state.selected.add(old);
        const others = snapshotRefs(env);
        const { next, applied } = step(doc, [{ t: 'update', id: 't', set: { groupHTML: '<g>bye</g>' } }]);
        applier.apply(applied, next);
        const fresh = env.shapes.find((s) => s.shapeID === 't');
        expect(fresh).not.toBe(old);
        expect(fresh.groupHTML).toBe('<g>bye</g>');
        expect(env.state.selected.has(fresh)).toBe(true);
        expect(env.state.selected.has(old)).toBe(false);
        for (const s of env.shapes) if (s.shapeID !== 't') expect(s).toBe(others.get(s.shapeID));
    });
});

describe('SceneApplier: local UI state survives', () => {
    it('selection is preserved across remote update of it, create and delete of others', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const a = env.shapes.find((s) => s.shapeID === 'a');
        const b = env.shapes.find((s) => s.shapeID === 'b');
        env.state.selected.add(a);
        env.state.selected.add(b); // multi-selection
        let cur = doc;
        for (const ops of [
            [{ t: 'update', id: 'a', set: { x: 3 } }],
            [{ t: 'create', id: 'z', data: { type: 'rectangle', x: 1, y: 1, width: 1, height: 1, [Z_KEY]: 7000 } }],
            [{ t: 'delete', id: 'c' }],
            [{ t: 'move', id: 'b', z: 100 }],
        ]) {
            const s = step(cur, ops);
            applier.apply(s.applied, s.next);
            cur = s.next;
        }
        expect([...env.state.selected]).toEqual([a, b]);
        expect(env.deselect).not.toHaveBeenCalled();
        expect(env.refreshSelection).toHaveBeenCalledWith(a);
        expect(env.shapes.find((s) => s.shapeID === 'a')).toBe(a);
    });

    it('remote delete of the selected shape deselects it', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const a = env.shapes.find((s) => s.shapeID === 'a');
        env.state.selected.add(a);
        const { next, applied } = step(doc, [{ t: 'delete', id: 'a' }]);
        applier.apply(applied, next);
        expect(env.deselect).toHaveBeenCalledWith(a);
        expect(env.state.selected.size).toBe(0);
    });

    it('closes the label editor when its shape is deleted remotely', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const a = env.shapes.find((s) => s.shapeID === 'a');
        env.state.editing = a;
        const { next, applied } = step(doc, [{ t: 'delete', id: 'a' }]);
        applier.apply(applied, next);
        expect(env.closeEditor).toHaveBeenCalledWith(a);
        expect(env.state.editing).toBe(null);
    });

    it('a remote update to the shape being edited is deferred, editor stays open', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const a = env.shapes.find((s) => s.shapeID === 'a');
        env.state.editing = a;
        const { next, applied } = step(doc, [{ t: 'update', id: 'a', set: { x: 9 } }]);
        const result = applier.apply(applied, next);
        expect(result.deferred.has('a')).toBe(true);
        expect(a.x).toBe(0);
        expect(env.closeEditor).not.toHaveBeenCalled();
    });

    it('my in-flight gesture wins locally; the deferred op applies afterwards', () => {
        const doc = baseDoc();
        const { env, applier } = sceneFrom(doc);
        const b = env.shapes.find((s) => s.shapeID === 'b');
        env.state.gesture.add(b);
        const s1 = step(doc, [{ t: 'update', id: 'b', set: { x: 500, 'options.stroke': 'red' } }]);
        const result = applier.apply(s1.applied, s1.next);
        expect(result.deferred.has('b')).toBe(true);
        expect(b.x).toBe(50);
        // pointerup: the hook re-applies the doc state for deferred ids
        env.state.gesture.clear();
        applier.apply([{ t: 'update', id: 'b', set: { x: 500, 'options.stroke': 'red' } }], s1.next);
        expect(b.x).toBe(500);
        expect(b.options.stroke).toBe('red');
    });
});

describe('SceneApplier + CollabClient convergence', () => {
    it('incrementally applied canvases converge with the OT docs (randomized)', async () => {
        const { Sequencer, SimClient, drain, randomOps, seedDoc } = await import('./collab-sim.js');
        for (let trial = 0; trial < 25; trial += 1) {
            const random = rng(4242 + trial);
            const doc = seedDoc(4);
            const server = new Sequencer();
            server.canonical = cloneDoc(doc);
            const sims = [0, 1, 2].map((i) => new SimClient(`k${i}`, server, cloneDoc(doc)));
            const canvases = sims.map(() => sceneFrom(doc));
            // Route every remote result through the applier.
            sims.forEach((sim, i) => {
                const receive = sim.client.receive.bind(sim.client);
                sim.client.receive = (msg) => {
                    const result = receive(msg);
                    if (result.ops.length) canvases[i].applier.apply(result.ops, sim.client.local);
                    return result;
                };
                const submit = sim.client.submit.bind(sim.client);
                sim.client.submit = (ops, options) => {
                    const before = cloneDoc(sim.client.local);
                    const messages = submit(ops, options);
                    // Local edits reach the canvas the way the engine would draw them.
                    const applied = messages.flatMap((m) => m.ops);
                    if (applied.length) canvases[i].applier.apply(applied, sim.client.local);
                    void before;
                    return messages;
                };
            });
            const counter = { n: 0 };
            for (let n = 0; n < 60; n += 1) {
                const i = Math.floor(random() * sims.length);
                const sim = sims[i];
                const r = random();
                if (r < 0.35) sim.edit(randomOps(sim.client.local, random, sim.id, counter));
                else if (r < 0.45) sim.undo();
                else if (r < 0.7) sim.deliverUp();
                else sim.deliverDown();
            }
            drain(sims, random);
            const order = orderedIds(server.canonical);
            sims.forEach((sim, i) => {
                const { env } = canvases[i];
                expect(env.shapes.map((s) => s.shapeID)).toEqual(order);
                const live = liveDoc(env, (id) => server.canonical.shapes[id][Z_KEY]);
                for (const id of order) {
                    const expected = { ...server.canonical.shapes[id] };
                    const actual = live.shapes[id];
                    for (const [key, value] of Object.entries(expected)) {
                        if (key === 'parentFrame') {
                            const parentLive = value !== id && !!server.canonical.shapes[value] && server.canonical.shapes[value].type === 'frame';
                            expect(actual.parentFrame ?? null).toBe(parentLive ? value : null);
                            continue;
                        }
                        expect(actual[key]).toEqual(value);
                    }
                }
            });
            void applyOps;
        }
    });
});
