/* eslint-disable */
/**
 * MermaidLayout — small layered (Sugiyama-style) graph layout shared by the
 * native Mermaid renderers (flowchart, class diagram).
 *
 *  1. cycle removal (DFS back edges are reversed for ranking only)
 *  2. longest-path ranking honouring per-edge `minlen`, sources pulled down
 *  3. ordering by barycenter sweeps, keeping cluster (subgraph) members
 *     contiguous at every nesting level
 *  4. coordinate assignment by neighbour averaging with minimum separation
 *  5. direction mapping: TB/TD, BT (mirrored), LR, RL (mirrored)
 *
 * Pure and deterministic — no DOM — so it is unit-testable in node.
 */

export const DIRECTIONS = ['TB', 'TD', 'BT', 'LR', 'RL'];

export function normalizeDirection(direction) {
    const d = String(direction || 'TB').toUpperCase();
    if (d === 'TD') return 'TB';
    return DIRECTIONS.includes(d) ? d : 'TB';
}

/**
 * @param {Object} graph
 *   nodes:    [{ id, width, height, cluster? }]   cluster = innermost cluster id
 *   edges:    [{ from, to, minlen? }]
 *   clusters: [{ id, parent? }]                    parent = enclosing cluster id
 *   direction: 'TB' | 'TD' | 'BT' | 'LR' | 'RL'
 * @param {Object} opts { nodeSep, rankSep, clusterPad, clusterTitle }
 * @returns {{ nodes: Map<id,{x,y,width,height,rank,order}>, clusters: Map<id,{x,y,width,height,depth}>, width, height }}
 *   x/y are top-left corners, normalised so the drawing starts at (0, 0).
 */
export function layeredLayout(graph, opts = {}) {
    const direction = normalizeDirection(graph.direction);
    const horizontal = direction === 'LR' || direction === 'RL';
    const nodeSep = opts.nodeSep ?? 50;
    const clusterPad = opts.clusterPad ?? 20;
    const clusterTitle = opts.clusterTitle ?? 26;

    const nodes = graph.nodes || [];
    const ids = nodes.map(n => n.id);
    const index = new Map(ids.map((id, i) => [id, i]));
    const clusterParent = new Map((graph.clusters || []).map(c => [c.id, c.parent || null]));
    const clusterChain = (clusterId) => {
        const chain = [];
        let c = clusterId;
        const seen = new Set();
        while (c && !seen.has(c)) { seen.add(c); chain.unshift(c); c = clusterParent.get(c) || null; }
        return chain;
    };
    const chainOf = new Map(nodes.map(n => [n.id, clusterChain(n.cluster)]));
    const maxDepth = Math.max(0, ...[...chainOf.values()].map(c => c.length), ...[...clusterParent.keys()].map(c => clusterChain(c).length));
    const rankSep = opts.rankSep ?? (60 + (clusterPad + clusterTitle) * Math.max(1, maxDepth));

    // Along-rank (u) and rank-axis (v) sizes.
    const su = (n) => (horizontal ? n.height : n.width);
    const sv = (n) => (horizontal ? n.width : n.height);

    const edges = (graph.edges || []).filter(e => index.has(e.from) && index.has(e.to));

    // ── 1. cycle removal ──
    const out = new Map(ids.map(id => [id, []]));
    edges.forEach((e, i) => out.get(e.from).push({ to: e.to, i }));
    const reversed = new Set();
    const state = new Map(); // 1 = on stack, 2 = done
    const visit = (id) => {
        state.set(id, 1);
        for (const { to, i } of out.get(id)) {
            if (to === id) { reversed.add(i); continue; }
            const s = state.get(to);
            if (s === 1) reversed.add(i);
            else if (!s) visit(to);
        }
        state.set(id, 2);
    };
    ids.forEach(id => { if (!state.get(id)) visit(id); });
    const dag = edges.map((e, i) => (reversed.has(i)
        ? { from: e.to, to: e.from, minlen: e.minlen ?? 1, self: e.from === e.to }
        : { from: e.from, to: e.to, minlen: e.minlen ?? 1, self: e.from === e.to })).filter(e => !e.self);

    // ── 2. ranking (longest path from sources, Kahn order) ──
    const preds = new Map(ids.map(id => [id, []]));
    const succs = new Map(ids.map(id => [id, []]));
    dag.forEach(e => { preds.get(e.to).push(e); succs.get(e.from).push(e); });
    const indeg = new Map(ids.map(id => [id, preds.get(id).length]));
    const rank = new Map();
    const queue = ids.filter(id => indeg.get(id) === 0);
    const topo = [];
    while (queue.length) {
        const id = queue.shift();
        topo.push(id);
        let r = 0;
        for (const e of preds.get(id)) r = Math.max(r, rank.get(e.from) + e.minlen);
        rank.set(id, r);
        for (const e of succs.get(id)) {
            indeg.set(e.to, indeg.get(e.to) - 1);
            if (indeg.get(e.to) === 0) queue.push(e.to);
        }
    }
    ids.forEach(id => { if (!rank.has(id)) rank.set(id, 0); });
    // Pull sources (no predecessors) down next to their nearest successor so
    // a late root does not sit far above the node it feeds.
    for (let k = topo.length - 1; k >= 0; k -= 1) {
        const id = topo[k];
        if (preds.get(id).length || !succs.get(id).length) continue;
        const target = Math.min(...succs.get(id).map(e => rank.get(e.to) - e.minlen));
        if (target > rank.get(id)) rank.set(id, target);
    }

    // ── 3. ordering ──
    const maxRank = Math.max(0, ...rank.values());
    const layers = Array.from({ length: maxRank + 1 }, () => []);
    ids.forEach(id => layers[rank.get(id)].push(id)); // declaration order
    const pos = new Map();
    const refreshPos = () => layers.forEach(layer => layer.forEach((id, i) => pos.set(id, i)));
    refreshPos();
    const neighbours = (id, up) => (up ? preds.get(id).map(e => e.from) : succs.get(id).map(e => e.to));

    const sortLayer = (layer, up) => {
        const bary = new Map();
        for (const id of layer) {
            const ns = neighbours(id, up);
            bary.set(id, ns.length ? ns.reduce((s, n) => s + pos.get(n), 0) / ns.length : pos.get(id));
        }
        // Cluster barycenter = mean of its members in this layer.
        const clusterBary = new Map();
        const clusterCount = new Map();
        for (const id of layer) {
            for (const c of chainOf.get(id)) {
                clusterBary.set(c, (clusterBary.get(c) || 0) + bary.get(id));
                clusterCount.set(c, (clusterCount.get(c) || 0) + 1);
            }
        }
        for (const [c, total] of clusterBary) clusterBary.set(c, total / clusterCount.get(c));
        const keyAt = (id, level) => {
            const chain = chainOf.get(id);
            return level < chain.length ? clusterBary.get(chain[level]) : bary.get(id);
        };
        layer.sort((a, b) => {
            const ca = chainOf.get(a);
            const cb = chainOf.get(b);
            let level = 0;
            while (level < ca.length && level < cb.length && ca[level] === cb[level]) level += 1;
            const ka = keyAt(a, level);
            const kb = keyAt(b, level);
            if (ka !== kb) return ka - kb;
            if (level < ca.length || level < cb.length) {
                // same barycenter: keep clusters apart deterministically
                const na = level < ca.length ? ca[level] : a;
                const nb = level < cb.length ? cb[level] : b;
                if (na !== nb) return String(na) < String(nb) ? -1 : 1;
            }
            return index.get(a) - index.get(b);
        });
    };
    for (let iter = 0; iter < 4; iter += 1) {
        for (let r = 1; r <= maxRank; r += 1) { sortLayer(layers[r], true); refreshPos(); }
        for (let r = maxRank - 1; r >= 0; r -= 1) { sortLayer(layers[r], false); refreshPos(); }
    }
    // Final pass keeps cluster contiguity on rank 0 as well.
    sortLayer(layers[0], false); refreshPos();

    // ── 4. coordinates (centres along u) ──
    const byId = new Map(nodes.map(n => [n.id, n]));
    const u = new Map();
    const gapBetween = (a, b) => {
        const ca = chainOf.get(a);
        const cb = chainOf.get(b);
        let common = 0;
        while (common < ca.length && common < cb.length && ca[common] === cb[common]) common += 1;
        const crossings = (ca.length - common) + (cb.length - common);
        return nodeSep + crossings * clusterPad;
    };
    const place = (layer, desired) => {
        // left-to-right with minimum separation, then shift to best fit
        const xs = [];
        layer.forEach((id, i) => {
            const half = su(byId.get(id)) / 2;
            let x = desired.get(id);
            if (i > 0) {
                const prev = layer[i - 1];
                const min = xs[i - 1] + su(byId.get(prev)) / 2 + gapBetween(prev, id) + half;
                if (x < min) x = min;
            }
            xs.push(x);
        });
        const shift = layer.reduce((s, id, i) => s + (desired.get(id) - xs[i]), 0) / (layer.length || 1);
        // shifting the whole layer keeps separation; only apply the part that
        // does not push nodes left of their desired spots on average
        layer.forEach((id, i) => u.set(id, xs[i] + shift));
    };
    // initial packing
    for (const layer of layers) {
        const desired = new Map();
        let x = 0;
        layer.forEach((id, i) => {
            const w = su(byId.get(id));
            if (i > 0) x += su(byId.get(layer[i - 1])) / 2 + gapBetween(layer[i - 1], id) + w / 2;
            desired.set(id, x);
        });
        const mid = x / 2;
        layer.forEach(id => desired.set(id, desired.get(id) - mid));
        place(layer, desired);
    }
    const sweep = (up) => {
        const order = up ? layers.map((_, r) => r) : layers.map((_, r) => maxRank - r);
        for (const r of order) {
            const layer = layers[r];
            const desired = new Map();
            for (const id of layer) {
                const ns = neighbours(id, up);
                desired.set(id, ns.length ? ns.reduce((s, n) => s + u.get(n), 0) / ns.length : u.get(id));
            }
            place(layer, desired);
        }
    };
    for (let iter = 0; iter < 3; iter += 1) { sweep(true); sweep(false); }

    // Keep outsiders out of each cluster's band along u, so a subgraph box
    // (the bbox over all its ranks) never swallows a node it does not own.
    const clusterList = [...clusterParent.keys()];
    const depthBelow = new Map();
    const descDepth = (c, seen = new Set()) => {
        if (depthBelow.has(c)) return depthBelow.get(c);
        if (seen.has(c)) return 0;
        seen.add(c);
        let d = 0;
        for (const child of clusterList) if (clusterParent.get(child) === c) d = Math.max(d, 1 + descDepth(child, seen));
        depthBelow.set(c, d);
        return d;
    };
    const inCluster = (id, c) => chainOf.get(id).includes(c);
    const byDepthDesc = clusterList.slice().sort((a, b) => clusterChain(b).length - clusterChain(a).length);
    const reseparate = () => {
        for (const layer of layers) {
            layer.sort((a, b) => u.get(a) - u.get(b) || pos.get(a) - pos.get(b));
            for (let i = 1; i < layer.length; i += 1) {
                const prev = layer[i - 1];
                const id = layer[i];
                const min = u.get(prev) + su(byId.get(prev)) / 2 + gapBetween(prev, id) + su(byId.get(id)) / 2;
                if (u.get(id) < min) u.set(id, min);
            }
        }
    };
    for (let round = 0; round < 3 && clusterList.length; round += 1) {
        let moved = false;
        for (const c of byDepthDesc) {
            const memberIds = ids.filter(id => inCluster(id, c));
            if (!memberIds.length) continue;
            const levels = 1 + descDepth(c);
            const lowPad = (clusterPad + (horizontal ? clusterTitle : 0)) * levels + nodeSep / 2;
            const highPad = clusterPad * levels + nodeSep / 2;
            const band0 = Math.min(...memberIds.map(id => u.get(id) - su(byId.get(id)) / 2)) - lowPad;
            const band1 = Math.max(...memberIds.map(id => u.get(id) + su(byId.get(id)) / 2)) + highPad;
            const mid = (band0 + band1) / 2;
            for (const layer of layers) {
                const memberPos = layer.map((id, i) => (inCluster(id, c) ? i : -1)).filter(i => i >= 0);
                layer.forEach((id, i) => {
                    if (inCluster(id, c)) return;
                    const half = su(byId.get(id)) / 2;
                    const cu = u.get(id);
                    if (cu + half <= band0 || cu - half >= band1) return;
                    let left;
                    if (memberPos.length) left = i < memberPos[0];
                    else left = cu < mid;
                    u.set(id, left ? band0 - half : band1 + half);
                    moved = true;
                });
            }
            reseparate();
        }
        if (!moved) break;
    }

    // rank-axis centres
    const rankSize = layers.map(layer => Math.max(0, ...layer.map(id => sv(byId.get(id)))));
    const v = [];
    let acc = 0;
    rankSize.forEach((size, r) => { v[r] = acc + size / 2; acc += size + rankSep; });

    // ── 5. direction mapping ──
    const placed = new Map();
    for (const id of ids) {
        const n = byId.get(id);
        const cu = u.get(id);
        const cv = v[rank.get(id)];
        let cx;
        let cy;
        switch (direction) {
            case 'BT': cx = cu; cy = -cv; break;
            case 'LR': cx = cv; cy = cu; break;
            case 'RL': cx = -cv; cy = cu; break;
            default: cx = cu; cy = cv;
        }
        placed.set(id, { cx, cy, width: n.width, height: n.height, rank: rank.get(id), order: pos.get(id) });
    }
    let minX = Infinity;
    let minY = Infinity;
    for (const p of placed.values()) { minX = Math.min(minX, p.cx - p.width / 2); minY = Math.min(minY, p.cy - p.height / 2); }

    // clusters: bbox of members + nested clusters, deepest first
    const clusterIds = [...clusterParent.keys()];
    const depthOf = (c) => clusterChain(c).length;
    const clusterBox = new Map();
    const members = new Map(clusterIds.map(c => [c, []]));
    for (const n of nodes) if (n.cluster && members.has(n.cluster)) members.get(n.cluster).push(n.id);
    const sortedClusters = clusterIds.slice().sort((a, b) => depthOf(b) - depthOf(a));
    for (const c of sortedClusters) {
        let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
        for (const id of members.get(c)) {
            const p = placed.get(id);
            x0 = Math.min(x0, p.cx - p.width / 2); y0 = Math.min(y0, p.cy - p.height / 2);
            x1 = Math.max(x1, p.cx + p.width / 2); y1 = Math.max(y1, p.cy + p.height / 2);
        }
        for (const child of clusterIds) {
            if (clusterParent.get(child) !== c || !clusterBox.has(child)) continue;
            const b = clusterBox.get(child);
            x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
        }
        if (!Number.isFinite(x0)) continue; // empty cluster
        const box = { x: x0 - clusterPad, y: y0 - clusterPad - clusterTitle, width: x1 - x0 + clusterPad * 2, height: y1 - y0 + clusterPad * 2 + clusterTitle, depth: depthOf(c) };
        clusterBox.set(c, box);
    }
    for (const b of clusterBox.values()) { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); }

    const result = new Map();
    let maxX = 0;
    let maxY = 0;
    for (const [id, p] of placed) {
        const x = p.cx - p.width / 2 - minX;
        const y = p.cy - p.height / 2 - minY;
        result.set(id, { x, y, width: p.width, height: p.height, rank: p.rank, order: p.order });
        maxX = Math.max(maxX, x + p.width); maxY = Math.max(maxY, y + p.height);
    }
    const clusters = new Map();
    for (const [c, b] of clusterBox) {
        const box = { ...b, x: b.x - minX, y: b.y - minY };
        clusters.set(c, box);
        maxX = Math.max(maxX, box.x + box.width); maxY = Math.max(maxY, box.y + box.height);
    }
    return { nodes: result, clusters, width: maxX, height: maxY, direction };
}
