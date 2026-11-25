import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    Z_KEY,
    applyOp,
    applyOps,
    canonicalDoc,
    cloneDoc,
    diffDocs,
    docsEqual,
    emptyDoc,
    invertBatch,
    materializeAndApply,
    orderedIds,
    transform,
    transformBatch,
} from '../../src/core/collab/OT.js';
import {
    assignZ,
    diffSceneAgainstDoc,
    docFromScene,
    docToScene,
    flattenShape,
    unflattenRecord,
} from '../../src/core/collab/SceneDoc.js';
import { CollabClient, chunkOps } from '../../src/core/collab/CollabClient.js';
import { Sequencer, SimClient, drain, randomOps, rng, seedDoc } from './collab-sim.js';

const D = () => ({
    shapes: {
        a: { type: 'rectangle', x: 1, y: 2, 'options.fill': 'red', groupId: 'g1', [Z_KEY]: 1024 },
        b: { type: 'frame', x: 0, y: 0, [Z_KEY]: 2048 },
    },
});

// A representative op of every kind targeting shape `a`.
const OPS = {
    create: { t: 'create', id: 'a', data: { type: 'circle', x: 9, [Z_KEY]: 5 } },
    delete: { t: 'delete', id: 'a' },
    update: { t: 'update', id: 'a', set: { x: 10, 'options.fill': 'blue' } },
    updateOther: { t: 'update', id: 'a', set: { y: 20 } },
    move: { t: 'move', id: 'a', z: 4096 },
    member: { t: 'member', id: 'a', set: { groupId: null, parentFrame: 'b' } },
};

function run(doc, ops) {
    return applyOps(cloneDoc(doc), ops);
}

describe('OT transform pair table', () => {
    const docs = {
        exists: D(),
        missing: { shapes: { b: D().shapes.b } },
    };

    for (const [aName, aRaw] of Object.entries(OPS)) {
        for (const [bName, bRaw] of Object.entries(OPS)) {
            for (const [docName, doc] of Object.entries(docs)) {
                it(`TP1 ${aName} vs ${bName} (${docName})`, () => {
                    // Raw (unmaterialized) ops: TP1 must hold for any document state.
                    const a = aRaw;
                    const b = bRaw;
                    // a later than b in server order: canonical = b then a.
                    const canonLater = run(doc, [b, a]);
                    expect(canonicalDoc(run(doc, [b, transform(a, b, true)]))).toBe(canonicalDoc(canonLater));
                    expect(canonicalDoc(run(doc, [a, transform(b, a, false)]))).toBe(canonicalDoc(canonLater));
                    // a earlier than b: canonical = a then b.
                    const canonEarlier = run(doc, [a, b]);
                    expect(canonicalDoc(run(doc, [b, transform(a, b, false)]))).toBe(canonicalDoc(canonEarlier));
                    expect(canonicalDoc(run(doc, [a, transform(b, a, true)]))).toBe(canonicalDoc(canonEarlier));
                });
            }
        }
    }

    it('update vs delete -> update becomes noop', () => {
        expect(transform(OPS.update, OPS.delete, true).t).toBe('noop');
        expect(transform(OPS.update, OPS.delete, false).t).toBe('noop');
    });

    it('delete vs delete -> noop', () => {
        expect(transform(OPS.delete, OPS.delete, true).t).toBe('noop');
    });

    it('delete vs update keeps delete with a refreshed snapshot', () => {
        const del = { t: 'delete', id: 'a', data: D().shapes.a };
        const out = transform(del, { t: 'update', id: 'a', set: { x: 99 }, prev: { x: 1 } }, false);
        expect(out.t).toBe('delete');
        expect(out.data.x).toBe(99);
    });

    it('concurrent updates to different props both apply', () => {
        const a = { t: 'update', id: 'a', set: { x: 10 }, prev: { x: 1 } };
        const b = { t: 'update', id: 'a', set: { y: 20 }, prev: { y: 2 } };
        const result = run(D(), [b, transform(a, b, true)]);
        expect(result.shapes.a.x).toBe(10);
        expect(result.shapes.a.y).toBe(20);
        expect(transform(a, b, true)).toEqual(a);
    });

    it('same prop: later in server order wins, its prev becomes the earlier value', () => {
        const a = { t: 'update', id: 'a', set: { x: 10 }, prev: { x: 1 } };
        const b = { t: 'update', id: 'a', set: { x: 20 }, prev: { x: 1 } };
        expect(transform(a, b, false).t).toBe('noop');
        expect(transform(a, b, true)).toEqual({ t: 'update', id: 'a', set: { x: 10 }, prev: { x: 20 } });
    });

    it('ops on different shapes never interact', () => {
        const other = { t: 'delete', id: 'zzz' };
        for (const op of Object.values(OPS)) expect(transform(op, other, false)).toBe(op);
    });

    it('earlier create absorbs a later property write on the same id', () => {
        const create = { t: 'create', id: 'a', data: { type: 'rectangle', x: 1 } };
        const out = transform(create, { t: 'update', id: 'a', set: { x: 5 } }, false);
        expect(out.data.x).toBe(5);
    });

    it('transformBatch is TP1 for random batches', () => {
        const random = rng(42);
        for (let i = 0; i < 300; i += 1) {
            const base = seedDoc(4);
            const left = materializeAndApply(cloneDoc(base), randomOps(base, random, 'L', { n: i * 10 }));
            const right = materializeAndApply(cloneDoc(base), randomOps(base, random, 'R', { n: i * 10 }));
            const [left2, right2] = transformBatch(left, right);
            const canonical = run(base, [...left, ...right]);
            expect(canonicalDoc(run(base, [...right, ...left2]))).toBe(canonicalDoc(canonical));
            expect(canonicalDoc(run(base, [...left, ...right2]))).toBe(canonicalDoc(canonical));
        }
    });
});

describe('OT apply / invert / diff', () => {
    it('inverse batch restores the document', () => {
        const random = rng(7);
        for (let i = 0; i < 200; i += 1) {
            const base = seedDoc(5);
            const doc = cloneDoc(base);
            const applied = materializeAndApply(doc, randomOps(base, random, 'x', { n: i * 10 }));
            applyOps(doc, invertBatch(applied));
            expect(canonicalDoc(doc)).toBe(canonicalDoc(base));
        }
    });

    it('diffDocs turns one doc into the other', () => {
        const random = rng(9);
        for (let i = 0; i < 100; i += 1) {
            const a = seedDoc(4);
            const b = cloneDoc(a);
            materializeAndApply(b, randomOps(a, random, 'd', { n: i * 10 }));
            expect(canonicalDoc(run(a, diffDocs(a, b)))).toBe(canonicalDoc(b));
        }
    });

    it('update with null removes the key; ops on missing shapes are no-ops', () => {
        const doc = D();
        applyOp(doc, { t: 'update', id: 'a', set: { 'options.fill': null } });
        expect('options.fill' in doc.shapes.a).toBe(false);
        const before = canonicalDoc(doc);
        applyOp(doc, { t: 'update', id: 'nope', set: { x: 1 } });
        applyOp(doc, { t: 'delete', id: 'nope' });
        expect(canonicalDoc(doc)).toBe(before);
    });

    it('applyOp never mutates shared records', () => {
        const a = D();
        const b = cloneDoc(a);
        applyOp(b, { t: 'update', id: 'a', set: { x: 500 } });
        expect(a.shapes.a.x).toBe(1);
    });
});

describe('SceneDoc bridge', () => {
    const scene = {
        format: 'lixsketch',
        version: 1,
        shapes: [
            { shapeID: 'f1', type: 'frame', x: 0, y: 0, width: 100, height: 100, frameName: 'F', containedShapeIDs: ['r1'], options: { stroke: '#fff' }, parentFrame: null, groupId: null, docBlockIds: [] },
            { shapeID: 'r1', type: 'rectangle', x: 10, y: 10, width: 5, height: 5, rotation: 0, options: { stroke: '#000', fill: 'red' }, parentFrame: null, groupId: 'g', docBlockIds: [] },
            { shapeID: 'r2', type: 'rectangle', x: 50, y: 10, width: 5, height: 5, rotation: 0, options: { stroke: '#000' }, parentFrame: null, groupId: null, docBlockIds: [] },
        ],
    };

    it('flattens options and round-trips through docToScene', () => {
        const doc = docFromScene(scene);
        expect(doc.shapes.r1['options.fill']).toBe('red');
        expect(doc.shapes.r1.parentFrame).toBe('f1'); // from containedShapeIDs
        const back = docToScene(doc);
        expect(back.shapes.map((s) => s.shapeID)).toEqual(['f1', 'r1', 'r2']);
        expect(back.shapes[0].containedShapeIDs).toEqual(['r1']);
        expect(back.shapes[1].options).toEqual({ stroke: '#000', fill: 'red' });
        expect(diffSceneAgainstDoc(doc, back)).toEqual([]);
    });

    it('per-property diff of an edited scene', () => {
        const doc = docFromScene(scene);
        const edited = JSON.parse(JSON.stringify(scene));
        edited.shapes[2].options.fill = 'blue';
        edited.shapes[2].x = 60;
        const ops = diffSceneAgainstDoc(doc, edited);
        expect(ops).toEqual([{ t: 'update', id: 'r2', set: { x: 60, 'options.fill': 'blue' }, prev: { x: 50, 'options.fill': null } }]);
    });

    it('z-order change emits a minimal move', () => {
        const doc = docFromScene(scene);
        const edited = JSON.parse(JSON.stringify(scene));
        edited.shapes = [edited.shapes[0], edited.shapes[2], edited.shapes[1]];
        const ops = diffSceneAgainstDoc(doc, edited);
        expect(ops.filter((op) => op.t === 'move')).toHaveLength(1);
        const next = run(doc, ops);
        expect(orderedIds(next)).toEqual(['f1', 'r2', 'r1']);
    });

    it('membership changes are member ops and dangling parents render top-level', () => {
        const doc = docFromScene(scene);
        const edited = JSON.parse(JSON.stringify(scene));
        edited.shapes[0].containedShapeIDs = [];
        edited.shapes[1].groupId = null;
        const ops = diffSceneAgainstDoc(doc, edited);
        expect(ops).toEqual([{ t: 'member', id: 'r1', set: { groupId: null, parentFrame: null }, prev: { groupId: 'g', parentFrame: 'f1' } }]);
        const orphan = run(doc, [{ t: 'delete', id: 'f1' }]);
        expect(docToScene(orphan).shapes.find((s) => s.shapeID === 'r1').parentFrame).toBe(null);
    });

    it('assignZ reproduces arbitrary orders and renumbers when space runs out', () => {
        const random = rng(3);
        let doc = docFromScene(scene);
        for (let i = 0; i < 200; i += 1) {
            const ids = orderedIds(doc);
            const order = ids.slice();
            const from = Math.floor(random() * order.length);
            const [moved] = order.splice(from, 1);
            order.splice(Math.floor(random() * (order.length + 1)), 0, moved);
            if (random() < 0.3) order.splice(Math.floor(random() * order.length), 0, `n${i}`);
            const z = assignZ(order, doc);
            const next = cloneDoc(doc);
            for (const id of order) next.shapes[id] = { ...(next.shapes[id] || { type: 'rectangle' }), [Z_KEY]: z[id] };
            expect(orderedIds(next)).toEqual(order);
            doc = next;
        }
        // Squeeze: insert repeatedly between the same two neighbours.
        let squeeze = { shapes: { a: { [Z_KEY]: 0 }, b: { [Z_KEY]: 1 } } };
        for (let i = 0; i < 80; i += 1) {
            const order = orderedIds(squeeze);
            order.splice(1, 0, `m${i}`);
            const z = assignZ(order, squeeze);
            const next = { shapes: {} };
            for (const id of order) next.shapes[id] = { [Z_KEY]: z[id] };
            expect(orderedIds(next)).toEqual(order);
            squeeze = next;
        }
    });

    it('round-trips a saved scene fixture without spurious ops', () => {
        const fixture = JSON.parse(readFileSync(new URL('../fixtures/legacy-v1-scene.json', import.meta.url), 'utf8'));
        const doc = docFromScene(fixture);
        const back = docToScene(doc);
        expect(back.shapes.map((s) => s.shapeID)).toEqual(fixture.shapes.map((s) => s.shapeID));
        expect(diffSceneAgainstDoc(doc, back)).toEqual([]);
        expect(diffSceneAgainstDoc(doc, fixture)).toEqual([]);
    });

    it('unflattenRecord produces serializer-compatible defaults', () => {
        const shape = unflattenRecord('x', flattenShape({ type: 'rectangle', x: 1, options: {}, parentFrame: null }));
        expect(shape).toMatchObject({ shapeID: 'x', type: 'rectangle', x: 1, options: {}, parentFrame: null, groupId: null, docBlockIds: [] });
    });
});

describe('CollabClient basics', () => {
    it('chunks large batches under the message budget', () => {
        const ops = Array.from({ length: 10 }, (_, i) => ({ t: 'create', id: `c${i}`, data: { blob: 'x'.repeat(100) } }));
        const chunks = chunkOps(ops, 300);
        expect(chunks.flat()).toEqual(ops);
        expect(chunks.length).toBeGreaterThan(1);
    });

    it('buffers out-of-order messages and reports gaps', () => {
        const c = new CollabClient({ clientId: 'c', doc: seedDoc(2) });
        const r1 = c.receive({ serverSeq: 2, clientId: 'p', clientSeq: 2, ops: [{ t: 'update', id: 's1', set: { x: 2 } }] });
        expect(r1.gap).toBe(true);
        const r2 = c.receive({ serverSeq: 1, clientId: 'p', clientSeq: 1, ops: [{ t: 'update', id: 's1', set: { x: 1 } }] });
        expect(r2.gap).toBe(false);
        expect(c.lastSeq).toBe(2);
        expect(c.local.shapes.s1.x).toBe(2);
        expect(c.receive({ serverSeq: 1, clientId: 'p', clientSeq: 1, ops: [] }).changed).toBe(false);
    });

    it('discardPending drops an unsendable op and restores local state', () => {
        const c = new CollabClient({ clientId: 'c', doc: seedDoc(2) });
        const [big] = c.submit([{ t: 'update', id: 's1', set: { x: 999 } }]);
        c.submit([{ t: 'update', id: 's0', set: { y: 5 } }]);
        expect(c.discardPending(big.clientSeq)).toBe(true);
        expect(c.local.shapes.s1.x).toBe(10);
        expect(c.local.shapes.s0.y).toBe(5);
        expect(c.pending).toHaveLength(1);
    });

    it('applies legacy full-scene ops relative to the confirmed doc', () => {
        const c = new CollabClient({ clientId: 'c', doc: emptyDoc() });
        c.receive({ serverSeq: 1, scene: { shapes: [{ shapeID: 'r', type: 'rectangle', x: 3, options: {} }] } });
        expect(c.local.shapes.r.x).toBe(3);
    });
});

// --------------------------------------------------------------------
// Simulated rooms
// --------------------------------------------------------------------

function room(n, { logLimit, doc = seedDoc(4) } = {}) {
    const server = new Sequencer({ logLimit });
    server.canonical = cloneDoc(doc);
    const clients = Array.from({ length: n }, (_, i) => new SimClient(`c${i}`, server, cloneDoc(doc)));
    return { server, clients };
}

function assertInvariant(sim) {
    const expected = cloneDoc(sim.client.confirmed);
    for (const entry of sim.client.pending) applyOps(expected, entry.ops);
    expect(canonicalDoc(sim.client.local)).toBe(canonicalDoc(expected));
}

function assertConverged(server, clients) {
    const target = canonicalDoc(server.canonical);
    for (const c of clients) {
        expect(c.client.pending).toHaveLength(0);
        expect(c.client.lastSeq).toBe(server.seq);
        expect(canonicalDoc(c.client.confirmed)).toBe(target);
        expect(canonicalDoc(c.client.local)).toBe(target);
    }
}

describe('convergence with a simulated sequencer (2-5 clients)', () => {
    for (let n = 2; n <= 5; n += 1) {
        it(`random concurrent edits converge (${n} clients)`, () => {
            for (let trial = 0; trial < 40; trial += 1) {
                const random = rng(1000 * n + trial);
                const { server, clients } = room(n);
                const counter = { n: 0 };
                for (let step = 0; step < 120; step += 1) {
                    const c = clients[Math.floor(random() * n)];
                    const r = random();
                    if (r < 0.35) c.edit(randomOps(c.client.local, random, c.id, counter));
                    else if (r < 0.45) c.undo();
                    else if (r < 0.5) c.redo();
                    else if (r < 0.75) c.deliverUp();
                    else c.deliverDown();
                    assertInvariant(c);
                }
                drain(clients, random);
                assertConverged(server, clients);
            }
        });
    }
});

describe('per-client undo', () => {
    function two() {
        const { server, clients } = room(2);
        return { server, A: clients[0], B: clients[1], all: clients };
    }

    it('undo reverts my change after a peer edits a different prop', () => {
        const { server, A, B, all } = two();
        A.edit([{ t: 'update', id: 's1', set: { x: 100 } }]);
        B.edit([{ t: 'update', id: 's1', set: { y: 55 } }]);
        drain(all);
        A.undo();
        drain(all);
        assertConverged(server, all);
        expect(server.canonical.shapes.s1).toMatchObject({ x: 10, y: 55 });
    });

    it('undo never reverts a peer write to the same prop that came later', () => {
        const { server, A, B, all } = two();
        A.edit([{ t: 'update', id: 's1', set: { x: 100 } }]);
        drain(all);
        B.edit([{ t: 'update', id: 's1', set: { x: 200 } }]);
        drain(all);
        A.undo();
        drain(all);
        assertConverged(server, all);
        expect(server.canonical.shapes.s1.x).toBe(200);
    });

    it('concurrent same-prop writes: server order decides, undo of the loser is a no-op', () => {
        const { server, A, B, all } = two();
        A.edit([{ t: 'update', id: 's1', set: { x: 100 } }]);
        B.edit([{ t: 'update', id: 's1', set: { x: 200 } }]);
        A.deliverUp(); // A sequenced first
        B.deliverUp(); // B later -> wins
        drain(all);
        expect(server.canonical.shapes.s1.x).toBe(200);
        A.undo();
        drain(all);
        assertConverged(server, all);
        expect(server.canonical.shapes.s1.x).toBe(200);
        B.undo();
        drain(all);
        assertConverged(server, all);
        expect(server.canonical.shapes.s1.x).toBe(10);
    });

    it('undo of my create removes the shape including peer edits; redo restores it', () => {
        const { server, A, B, all } = two();
        A.edit([{ t: 'create', id: 'new', data: { type: 'rectangle', x: 1, [Z_KEY]: 9999 } }]);
        drain(all);
        B.edit([{ t: 'update', id: 'new', set: { 'options.fill': 'green' } }]);
        drain(all);
        A.undo();
        drain(all);
        assertConverged(server, all);
        expect(server.canonical.shapes.new).toBeUndefined();
        A.redo();
        drain(all);
        assertConverged(server, all);
        expect(server.canonical.shapes.new).toMatchObject({ x: 1, 'options.fill': 'green' });
    });

    it('undo of an edit to a shape a peer deleted is a no-op', () => {
        const { server, A, B, all } = two();
        A.edit([{ t: 'update', id: 's2', set: { x: 77 } }]);
        drain(all);
        B.edit([{ t: 'delete', id: 's2' }]);
        drain(all);
        A.undo();
        drain(all);
        assertConverged(server, all);
        expect(server.canonical.shapes.s2).toBeUndefined();
    });

    it('undoing my delete restores the shape with concurrent peer edits on other shapes intact', () => {
        const { server, A, B, all } = two();
        A.edit([{ t: 'delete', id: 's3' }]);
        B.edit([{ t: 'update', id: 's1', set: { x: 1 } }, { t: 'move', id: 's2', z: 99999 }]);
        drain(all);
        A.undo();
        drain(all);
        assertConverged(server, all);
        expect(server.canonical.shapes.s3).toMatchObject({ x: 30 });
        expect(server.canonical.shapes.s1.x).toBe(1);
        expect(orderedIds(server.canonical).at(-1)).toBe('s2');
    });

    it('undoing all my history restores only my properties (randomized, 2-5 clients)', () => {
        for (let trial = 0; trial < 30; trial += 1) {
            const random = rng(77 + trial);
            const n = 2 + (trial % 4);
            const { server, clients } = room(n);
            // Each client owns one property namespace so "my changes" are well defined.
            const keyOf = (c) => `p_${c.id}`;
            for (let step = 0; step < 80; step += 1) {
                const c = clients[Math.floor(random() * n)];
                const r = random();
                if (r < 0.4) {
                    const id = `s${Math.floor(random() * 4)}`;
                    c.edit([{ t: 'update', id, set: { [keyOf(c)]: Math.floor(random() * 100) } }]);
                } else if (r < 0.5) c.undo();
                else if (r < 0.75) c.deliverUp();
                else c.deliverDown();
            }
            drain(clients, random);
            const snapshot = cloneDoc(server.canonical);
            const A = clients[0];
            while (A.client.canUndo()) { A.undo(); drain(clients, random); }
            assertConverged(server, clients);
            for (const [id, rec] of Object.entries(server.canonical.shapes)) {
                expect(rec[keyOf(A)]).toBeUndefined();
                for (const other of clients.slice(1)) expect(rec[keyOf(other)]).toEqual(snapshot.shapes[id][keyOf(other)]);
            }
        }
    });

    it('undo/redo history is private per client', () => {
        const { A, B, all } = two();
        A.edit([{ t: 'update', id: 's1', set: { x: 1 } }]);
        drain(all);
        expect(B.client.canUndo()).toBe(false);
        B.undo();
        expect(B.up).toHaveLength(0);
    });
});

describe('reconnect', () => {
    it('resends pending ops and catches up from the log', () => {
        const random = rng(5);
        const { server, clients } = room(3);
        const [A, B, C] = clients;
        const counter = { n: 0 };
        A.edit(randomOps(A.client.local, random, 'A', counter));
        drain(clients, random);
        A.goOffline();
        // Offline edits stay pending; peers keep editing.
        A.edit([{ t: 'update', id: 's1', set: { x: 1234 } }]);
        A.edit(randomOps(A.client.local, random, 'A', counter));
        B.edit(randomOps(B.client.local, random, 'B', counter));
        C.edit([{ t: 'update', id: 's1', set: { y: 4321 } }]);
        drain(clients, random);
        expect(A.client.pending.length).toBeGreaterThan(0);
        A.reconnect();
        drain(clients, random);
        assertConverged(server, clients);
    });

    it('does not double-apply an op the server sequenced before the ack was lost', () => {
        const { server, clients } = room(2);
        const [A, B] = clients;
        A.edit([{ t: 'update', id: 's1', set: { x: 5 } }]);
        A.goOffline({ dropUnsent: false });
        A.deliverUp(); // reaches the server; ack is lost (A disconnected)
        expect(server.seq).toBe(1);
        B.edit([{ t: 'update', id: 's1', set: { x: 6 } }]); // later -> wins
        drain(clients);
        A.reconnect();
        drain(clients);
        assertConverged(server, clients);
        expect(server.seq).toBe(2); // resend was deduplicated
        expect(server.canonical.shapes.s1.x).toBe(6);
    });

    it('falls back to a peer snapshot when the log tail no longer covers the gap', () => {
        for (let trial = 0; trial < 20; trial += 1) {
            const random = rng(900 + trial);
            const { server, clients } = room(3, { logLimit: 3 });
            const [A, B, C] = clients;
            const counter = { n: 0 };
            A.goOffline({ dropUnsent: random() < 0.5 });
            A.edit(randomOps(A.client.local, random, 'A', counter));
            for (let i = 0; i < 12; i += 1) {
                const c = random() < 0.5 ? B : C;
                c.edit(randomOps(c.client.local, random, c.id, counter));
                drain([B, C], random);
            }
            A.deliverUp();
            A.reconnect(B);
            drain(clients, random);
            assertConverged(server, clients);
        }
    });

    it('random disconnects in a 5-client room converge', () => {
        for (let trial = 0; trial < 25; trial += 1) {
            const random = rng(31337 + trial);
            const { server, clients } = room(5, { logLimit: 15 });
            const counter = { n: 0 };
            for (let step = 0; step < 200; step += 1) {
                const c = clients[Math.floor(random() * 5)];
                const r = random();
                if (r < 0.3) c.edit(randomOps(c.client.local, random, c.id, counter));
                else if (r < 0.37) c.undo();
                else if (r < 0.4) c.redo();
                else if (r < 0.43 && c.online) c.goOffline({ dropUnsent: random() < 0.5 });
                else if (r < 0.5 && !c.online) {
                    const peer = clients.find((p) => p.online && p !== c && p.client.pending.length === 0 && p.idle());
                    if (peer) c.reconnect(peer);
                } else if (r < 0.75) { if (c.online) c.deliverUp(); }
                else if (c.online) c.deliverDown();
                assertInvariant(c);
            }
            for (const c of clients) {
                if (!c.online) {
                    drain(clients.filter((p) => p.online), random);
                    const peer = clients.find((p) => p.online && p !== c);
                    c.reconnect(peer);
                }
            }
            drain(clients, random);
            assertConverged(server, clients);
        }
    });
});
