import test from 'node:test';
import assert from 'node:assert/strict';
import { countBlockWords } from '../lib/api/v1/blogInput.js';

test('counts words in top-level block content', () => {
  assert.equal(countBlockWords([{ type: 'paragraph', content: [{ type: 'text', text: 'one two three' }] }]), 3);
  assert.equal(countBlockWords([]), 0);
  assert.equal(countBlockWords(null), 0);
});

test('counts nested child blocks', () => {
  const blocks = [{
    type: 'bulletListItem',
    content: [{ type: 'text', text: 'parent' }],
    children: [{
      type: 'bulletListItem',
      content: [{ type: 'text', text: 'child one two' }],
    }],
  }];
  assert.equal(countBlockWords(blocks), 4);
});

test('counts link labels and deeply nested inline content', () => {
  const blocks = [{
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Read ' },
      { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'the guide' }] },
    ],
    children: [{
      type: 'paragraph',
      content: [{ type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'and notes' }] }],
    }],
  }];
  assert.equal(countBlockWords(blocks), 5);
});

test('does not count empty content as a word', () => {
  assert.equal(countBlockWords([{ type: 'paragraph', content: [] }, { type: 'paragraph' }]), 0);
});

test('a word split across styles counts once', () => {
  const blocks = [{
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo', styles: { bold: true } },
      { type: 'text', text: ' world' },
    ],
  }];
  assert.equal(countBlockWords(blocks), 2);
});

test('counts table cell text instead of throwing on tableContent', () => {
  const blocks = [{
    type: 'table',
    content: {
      type: 'tableContent',
      rows: [
        { cells: [
          { type: 'tableCell', content: [{ type: 'text', text: 'alpha beta' }] },
          { type: 'tableCell', content: [{ type: 'text', text: 'gamma' }] },
        ] },
        // Older posts store a cell as a bare inline array.
        { cells: [[{ type: 'text', text: 'delta' }], []] },
      ],
    },
  }, { type: 'paragraph', content: [{ type: 'text', text: 'after the table' }] }];
  assert.equal(countBlockWords(blocks), 7);
});

test('non-array input counts zero instead of throwing', () => {
  assert.equal(countBlockWords('[{"type":"paragraph"}]'), 0);
  assert.equal(countBlockWords({ type: 'paragraph' }), 0);
});
