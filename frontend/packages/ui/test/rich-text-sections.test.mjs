import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { findRichTextSection, isRichTextSectionId, normalizeRichTextSections, richTextSectionFragment, scrollToRichTextSection } from '../src/rich-text-sections.js';

function element(label, id = '') {
  const attrs = new Map(id ? [['data-yuance-section-id', id]] : []);
  return { textContent: label, tagName: 'H2', getAttribute: (name) => attrs.get(name) || null, setAttribute: (name, value) => attrs.set(name, value), getBoundingClientRect: () => ({ top: 300 }) };
}

function fixture(headings, links = []) {
  const stub = { ownerDocument: { defaultView: { crypto: webcrypto } }, querySelectorAll: (selector) => selector === 'a[href^="#"]' ? links : headings, getBoundingClientRect: () => ({ top: 100 }), scrollTop: 10, scrolled: /** @type {ScrollToOptions | undefined} */ (undefined), scrollTo: (value) => { stub.scrolled = value; } };
  return /** @type {HTMLDivElement & { scrolled?: ScrollToOptions }} */ (/** @type {unknown} */ (stub));
}

test('section contract rejects arbitrary identifiers and only parses pure fragments', () => {
  assert.equal(isRichTextSectionId('yuance-section-sql-310'), true);
  for (const id of ['location', 'yuance-section-', 'yuance-section-<script>', `yuance-section-${'a'.repeat(81)}`]) assert.equal(isRichTextSectionId(id), false);
  assert.equal(richTextSectionFragment('https://example.test/#yuance-section-sql'), null);
  assert.equal(richTextSectionFragment('#yuance-section-sql'), 'yuance-section-sql');
  assert.equal(richTextSectionFragment('#%FF'), '');
});

test('persisted chapters retain identity through rename/reorder and deleted duplicate does not rebind', () => {
  const first = element('同名', 'yuance-section-first');
  const second = element('同名', 'yuance-section-second');
  const root = fixture([first, second]);
  assert.deepEqual(normalizeRichTextSections(root, true).map(({ id }) => id), ['yuance-section-first', 'yuance-section-second']);
  first.textContent = '改名';
  const reordered = fixture([second, first]);
  assert.equal(findRichTextSection(reordered, 'yuance-section-first'), first);
  const deleted = fixture([second]);
  assert.equal(findRichTextSection(deleted, 'yuance-section-first'), null);
  assert.equal(findRichTextSection(deleted, 'resource-heading-1-同名'), null);
});

test('duplicate explicit IDs are repaired once and legacy links migrate to persistent IDs', () => {
  const first = element('同名', 'yuance-section-first');
  const duplicate = element('同名', 'yuance-section-first');
  const legacy = element('旧章节');
  const link = element('见旧章节');
  link.setAttribute('href', '#resource-heading-3-旧章节');
  const root = fixture([first, duplicate, legacy], [link]);
  const sections = normalizeRichTextSections(root, true);
  assert.equal(new Set(sections.map(({ id }) => id)).size, 3);
  assert.equal(sections[0].id, 'yuance-section-first');
  assert.equal(link.getAttribute('href'), `#${sections[2].id}`);
  assert.deepEqual(normalizeRichTextSections(root, true), sections);
});

test('legacy read aliases stay scoped to legacy headings and scroll only the supplied body with margin', () => {
  const heading = element('旧章节');
  const root = fixture([heading]);
  const [{ id }] = normalizeRichTextSections(root);
  assert.equal(findRichTextSection(root, 'resource-heading-1-旧章节'), heading);
  assert.equal(scrollToRichTextSection(root, id), true);
  assert.deepEqual(root.scrolled, { top: 186, behavior: 'auto' });
  root.scrolled = undefined;
  assert.equal(scrollToRichTextSection(root, 'yuance-section-deleted'), false);
  assert.equal(root.scrolled, undefined);
});

test('legacy read IDs reserve later explicit IDs and never enable aliases for persisted legacy-named IDs', () => {
  const missing = element('历史章节');
  const explicit = element('显式章节', 'yuance-section-legacy-1');
  const root = fixture([missing, explicit]);
  const sections = normalizeRichTextSections(root);
  assert.equal(sections[0].id, 'yuance-section-legacy-1-1');
  assert.equal(sections[1].id, 'yuance-section-legacy-1');
  assert.equal(findRichTextSection(root, 'resource-heading-2-显式章节'), null);
});
