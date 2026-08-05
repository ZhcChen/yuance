import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMinisignVersionOutput,
  assertSyftVersionOutput,
  MINISIGN_VERSION,
  SYFT_VERSION,
} from "../src/release-tools.mjs";

test("accepts only the pinned minisign version", () => {
  assert.equal(MINISIGN_VERSION, "0.12");
  assert.doesNotThrow(() => assertMinisignVersionOutput("minisign 0.12\n"));
  assert.doesNotThrow(() => assertMinisignVersionOutput("minisign version 0.12\n"));
  assert.throws(() => assertMinisignVersionOutput("minisign 0.11\n"), /0\.12 is required/);
  assert.throws(() => assertMinisignVersionOutput("minisign 0.12.1\n"), /0\.12 is required/);
});

test("accepts only the pinned Syft JSON version", () => {
  assert.equal(SYFT_VERSION, "1.50.0");
  assert.doesNotThrow(() => assertSyftVersionOutput('{"version":"1.50.0"}'));
  assert.throws(() => assertSyftVersionOutput('{"version":"1.49.0"}'), /v1\.50\.0 is required/);
  assert.throws(() => assertSyftVersionOutput("syft 1.50.0"), /output is invalid/);
});
