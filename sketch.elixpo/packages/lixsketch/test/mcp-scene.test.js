import assert from 'node:assert/strict';
import test from 'node:test';
import { applyScenePatch, createEmptyScene, mergeTemplateScene, shapeBounds, validateScene } from '../src/mcp/scene.js';
import { createLixSketchMcpServer } from '../src/mcp/server.js';
import { MemorySceneStore } from '../src/mcp/store.js';

test('applies a multi-shape patch atomically and advances revision', () => {
  const scene = createEmptyScene('Architecture');
  const result = applyScenePatch(scene, [
    { op: 'add', shape: { type: 'rectangle', shapeID: 'service-a', x: 20, y: 40, width: 180, height: 80, options: { fill: '#32264a' } } },
    { op: 'add', shape: { type: 'text', shapeID: 'service-label', x: 65, y: 70, text: 'API service' } },
    { op: 'add', shape: { type: 'arrow', shapeID: 'request', startPoint: { x: 200, y: 80 }, endPoint: { x: 360, y: 80 } } },
  ], { expectedRevision: 0 });
  assert.equal(result.revision, 1);
  assert.equal(result.scene.shapes.length, 3);
  assert.equal(validateScene(result.scene).valid, true);
});

test('rejects revision conflicts without changing input', () => {
  const scene = createEmptyScene();
  assert.throws(() => applyScenePatch(scene, [{ op: 'rename_canvas', name: 'Changed' }], { expectedRevision: 4 }), /Revision conflict/);
  assert.equal(scene.name, 'MCP Canvas');
  assert.equal(scene.mcpRevision, 0);
});

test('does not allow raw text markup updates', () => {
  const initial = applyScenePatch(createEmptyScene(), [{ op: 'add', shape: { type: 'text', shapeID: 'safe-text', x: 0, y: 0, text: 'Safe' } }]).scene;
  assert.throws(() => applyScenePatch(initial, [{ op: 'update', shapeID: 'safe-text', changes: { groupHTML: '<script>bad()</script>' } }]), /Cannot update text fields/);
});

test('template insertion remaps IDs and relationships', () => {
  const template = applyScenePatch(createEmptyScene('Logic gates'), [
    { op: 'add', shape: { type: 'frame', shapeID: 'gate-frame', x: 100, y: 100, width: 300, height: 200 } },
    { op: 'add', shape: { type: 'rectangle', shapeID: 'and-gate', x: 140, y: 140, width: 100, height: 60, parentFrame: 'gate-frame' } },
  ]).scene;
  template.shapes[0].containedShapeIDs = ['and-gate'];
  const result = mergeTemplateScene(createEmptyScene(), template, { x: 500, y: 300 });
  assert.equal(result.importedShapeIDs.length, 2);
  assert.notEqual(result.scene.shapes[0].shapeID, 'gate-frame');
  assert.equal(result.scene.shapes[1].parentFrame, result.scene.shapes[0].shapeID);
  assert.deepEqual(result.scene.shapes[0].containedShapeIDs, [result.scene.shapes[1].shapeID]);
});

test('MCP server exposes scene reads and dry-run patches', async () => {
  const store = new MemorySceneStore(createEmptyScene());
  const templateProvider = { search: async () => [], load: async () => { throw new Error('unused'); } };
  const server = createLixSketchMcpServer({ store, templateProvider });
  const initialized = await server.handleRequest({ method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.match(initialized.instructions, /call canvas_get/);
  assert.match(initialized.instructions, /dryRun: true/);
  assert.match(initialized.instructions, /Never clear or replace/);
  const listed = await server.handleRequest({ method: 'tools/list' });
  assert.ok(listed.tools.some((tool) => tool.name === 'canvas_apply_patch'));
  const result = await server.callTool('canvas_apply_patch', { dryRun: true, expectedRevision: 0, operations: [{ op: 'add', shape: { type: 'circle', x: 100, y: 100, rx: 40, ry: 40 } }] });
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.dryRun, true);
  assert.equal((await store.read()).shapes.length, 0);
});

test('estimates MCP text bounds for one-line, multi-line, and large-font text', () => {
  const { scene } = applyScenePatch(createEmptyScene(), [
    { op: 'add', shape: { type: 'text', shapeID: 'short-text', x: 10, y: 20, text: 'Hi', fontSize: 20 } },
    { op: 'add', shape: { type: 'text', shapeID: 'long-text', x: 10, y: 20, text: 'A much longer single-line diagram label', fontSize: 20 } },
    { op: 'add', shape: { type: 'text', shapeID: 'multi-text', x: 10, y: 20, text: 'Line 1\nSecond longer line\nLine 3', fontSize: 20 } },
    { op: 'add', shape: { type: 'text', shapeID: 'large-text', x: 10, y: 20, text: 'Hi', fontSize: 60 } },
  ]);
  const byId = Object.fromEntries(scene.shapes.map((s) => [s.shapeID, shapeBounds(s)]));

  assert.equal(byId['short-text'].x, 10);
  assert.equal(byId['short-text'].y, 20);
  assert.ok(byId['long-text'].width > byId['short-text'].width);
  assert.equal(byId['long-text'].height, byId['short-text'].height);

  assert.ok(byId['multi-text'].height > byId['short-text'].height * 2);
  assert.ok(byId['multi-text'].width > byId['short-text'].width);

  assert.ok(byId['large-text'].width > byId['short-text'].width * 2);
  assert.ok(byId['large-text'].height > byId['short-text'].height * 2);
});
