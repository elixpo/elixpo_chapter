import test from 'node:test';
import assert from 'node:assert/strict';
import { countBlockWords } from '../lib/wordCount.js';
import { countBlockWords as reExportedCount } from '../lib/api/v1/blogInput.js';

test('shared word counter is identical when imported from lib/wordCount.js or re-exported from lib/api/v1/blogInput.js', () => {
  assert.equal(countBlockWords, reExportedCount);
});

test('counts words when 20+ words reside entirely in nested bullet list items', () => {
  // A post whose body words are only in nested children (satisfying the 20-word editor gate)
  const nestedWords = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega';
  const wordTokens = nestedWords.split(' ');
  assert.ok(wordTokens.length >= 20);

  const blocks = [
    {
      type: 'bulletListItem',
      content: [],
      children: wordTokens.map((w) => ({
        type: 'bulletListItem',
        content: [{ type: 'text', text: w }],
      })),
    },
  ];

  const count = countBlockWords(blocks);
  assert.equal(count, wordTokens.length);
  assert.ok(count >= 20);
});

test('counts words when 20+ words reside entirely inside a table', () => {
  // 4 rows of 5 words each = 20 words
  const words = [
    ['one', 'two', 'three', 'four', 'five'],
    ['six', 'seven', 'eight', 'nine', 'ten'],
    ['eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'],
    ['sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'],
  ];

  const blocks = [
    {
      type: 'table',
      content: {
        type: 'tableContent',
        rows: words.map((row) => ({
          cells: row.map((cellText) => ({
            type: 'tableCell',
            content: [{ type: 'text', text: cellText }],
          })),
        })),
      },
    },
  ];

  const count = countBlockWords(blocks);
  assert.equal(count, 20);
});

test('counts words in legacy table structure (cells as bare inline arrays)', () => {
  const blocks = [
    {
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [
          { cells: [[{ type: 'text', text: 'word1 word2' }], [{ type: 'text', text: 'word3' }]] },
        ],
      },
    },
  ];

  assert.equal(countBlockWords(blocks), 3);
});
