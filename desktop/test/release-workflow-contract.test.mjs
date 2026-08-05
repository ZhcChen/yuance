import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.resolve(desktopRoot, "..", ".github", "workflows", "release-desktop.yml");

async function workflow() {
  return readFile(workflowPath, "utf8");
}

test("desktop release actions are pinned to full commit SHAs", async () => {
  const source = await workflow();
  const uses = [...source.matchAll(/^\s*uses:\s*([^\s#]+).*$/gmu)].map((match) => match[1]);
  assert.ok(uses.length >= 10);
  for (const action of uses) {
    assert.match(action, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/u);
  }
});

test("build jobs cannot access the protected minisign key", async () => {
  const source = await workflow();
  const build = source.slice(source.indexOf("  build:"), source.indexOf("  assemble-sign:"));
  assert.doesNotMatch(build, /secrets\.|MINISIGN_PRIVATE|environment:/u);
  assert.match(source, /assemble-sign:[\s\S]*environment: desktop-internal-release/u);
  assert.match(source, /assemble-sign:[\s\S]*id-token: write[\s\S]*attestations: write/u);
  assert.match(source, /secrets\.YUANCE_MINISIGN_PRIVATE_KEY_BASE64/u);
});

test("release tooling is pinned and verified before use", async () => {
  const source = await workflow();
  assert.match(source, /minisign-0\.12-linux\.tar\.gz/u);
  assert.match(source, /9a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88d9822957e73/u);
  assert.match(source, /minisign -Vm[\s\S]*-P RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3/u);
  assert.match(source, /syft_1\.50\.0_checksums\.txt/u);
  assert.match(source, /sha256sum --check --strict selected-checksum\.txt/u);
});

test("publish is immutable and verifies draft readback", async () => {
  const source = await workflow();
  const publish = source.slice(source.indexOf("  publish:"));
  assert.doesNotMatch(publish, /--clobber/u);
  assert.match(publish, /gh release create[\s\S]*--draft/u);
  assert.match(publish, /gh release download/u);
  assert.match(publish, /verify:release-evidence -- "\$GITHUB_WORKSPACE\/\.artifacts\/release-readback"/u);
  assert.match(publish, /diff -qr \.artifacts\/release-evidence \.artifacts\/release-readback/u);
  assert.match(publish, /gh release edit "\$RELEASE_TAG" --draft=false --latest=false/u);
});

test("workflow keeps internal trust labels and excludes updater metadata", async () => {
  const source = await workflow();
  assert.match(source, /内部开发制品/u);
  assert.match(source, /macOS 仅 ad-hoc，Windows 未签名，Linux 使用 minisign 完整性签名/u);
  assert.doesNotMatch(source, /latest(?:-mac)?\.yml|electron-updater|notariz|authenticode/iu);
});
