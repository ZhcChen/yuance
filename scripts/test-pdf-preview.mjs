import assert from "node:assert/strict";

import {
  collectFilteredOutlineIds,
  collectPagesInRange,
  collectOutlineAncestorIds,
  computeFitPageScale,
  computeFitWidthScale,
  computeScaledPageSize,
  findActiveOutlineEntry,
  normalizeOutlineSearchKeyword,
  pickCurrentPage,
  resolveOutlineEntries,
  sortPageNumbersByDistance,
} from "../api/static/document-preview.mjs";

assert.equal(computeFitWidthScale(1000, 800), 0.75);
assert.equal(computeFitWidthScale(1000, 1600), 1.528);
assert.deepEqual(computeScaledPageSize(800, 1200, 1600, 1), {
  scale: 1.91,
  width: 1528,
  height: 2292,
});
assert.equal(computeFitPageScale(800, 1200, 1600, 900), 0.65);
assert.deepEqual(computeScaledPageSize(800, 1200, 1600, 900, "fit-page", 1), {
  scale: 0.65,
  width: 520,
  height: 780,
});
assert.deepEqual(computeScaledPageSize(800, 1200, 1600, 900, "actual-size", 1), {
  scale: 1,
  width: 800,
  height: 1200,
});

assert.equal(
  pickCurrentPage(
    [
      { pageNumber: 1, top: 0, height: 400 },
      { pageNumber: 2, top: 420, height: 400 },
      { pageNumber: 3, top: 840, height: 400 },
    ],
    0,
    600,
  ),
  1,
);
assert.equal(
  pickCurrentPage(
    [
      { pageNumber: 1, top: 0, height: 400 },
      { pageNumber: 2, top: 420, height: 400 },
      { pageNumber: 3, top: 840, height: 400 },
    ],
    430,
    600,
  ),
  2,
);

assert.deepEqual(
  collectPagesInRange(
    [
      { pageNumber: 1, top: 0, height: 400 },
      { pageNumber: 2, top: 420, height: 400 },
      { pageNumber: 3, top: 840, height: 400 },
      { pageNumber: 4, top: 1260, height: 400 },
    ],
    430,
    600,
    200,
  ),
  [1, 2, 3],
);

assert.deepEqual(sortPageNumbersByDistance([5, 2, 4, 1], 3), [2, 4, 1, 5]);

const introRef = { num: 1, gen: 0 };
const chapterRef = { num: 2, gen: 0 };
const appendixRef = { num: 3, gen: 0 };

const pdfDocument = {
  async getDestination(name) {
    if (name === "intro") {
      return [introRef];
    }
    if (name === "appendix") {
      return [appendixRef];
    }
    return null;
  },
  async getPageIndex(ref) {
    if (ref === introRef) {
      return 0;
    }
    if (ref === chapterRef) {
      return 4;
    }
    if (ref === appendixRef) {
      return 8;
    }
    throw new Error("unknown ref");
  },
};

const outlineEntries = await resolveOutlineEntries(pdfDocument, [
  {
    title: "引言",
    dest: "intro",
    items: [
      {
        title: "第一章",
        dest: [chapterRef],
        items: [],
      },
    ],
  },
  {
    title: "附录",
    dest: "appendix",
    items: [],
  },
]);

assert.deepEqual(outlineEntries, [
  { id: "outline-1", title: "引言", pageNumber: 1, depth: 0, hasChildren: true, parentId: null },
  { id: "outline-2", title: "第一章", pageNumber: 5, depth: 1, hasChildren: false, parentId: "outline-1" },
  { id: "outline-3", title: "附录", pageNumber: 9, depth: 0, hasChildren: false, parentId: null },
]);

assert.equal(findActiveOutlineEntry(outlineEntries, 1), "outline-1");
assert.equal(findActiveOutlineEntry(outlineEntries, 6), "outline-2");
assert.equal(findActiveOutlineEntry(outlineEntries, 99), "outline-3");
assert.deepEqual(collectOutlineAncestorIds(outlineEntries, "outline-2"), ["outline-1"]);
assert.deepEqual(collectOutlineAncestorIds(outlineEntries, "outline-3"), []);
assert.equal(normalizeOutlineSearchKeyword("  第 一 章  "), "第 一 章");
assert.deepEqual(
  [...collectFilteredOutlineIds(outlineEntries, "第一章", "outline-3")],
  ["outline-2", "outline-1", "outline-3"],
);
