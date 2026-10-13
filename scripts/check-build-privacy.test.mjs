// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkBuildPrivacy } from "./check-build-privacy.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-build-privacy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "static/chunks"), { recursive: true });
  fs.mkdirSync(path.join(root, "server/app"), { recursive: true });
  const signing = "x".repeat(32);
  const encryption = "y".repeat(32);
  fs.writeFileSync(
    path.join(root, "prerender-manifest.json"),
    JSON.stringify({
      preview: {
        previewModeSigningKey: signing,
        previewModeEncryptionKey: encryption,
      },
    }),
  );
  fs.writeFileSync(
    path.join(root, "server/server-reference-manifest.json"),
    JSON.stringify({ encryptionKey: encryption }),
  );
  fs.writeFileSync(
    path.join(root, "server/middleware-manifest.json"),
    JSON.stringify({ functions: {} }),
  );
  fs.writeFileSync(
    path.join(root, "static/chunks/app.js"),
    "console.log('synthetic public output')",
  );
  fs.writeFileSync(
    path.join(root, "server/app/page.html"),
    "<p>synthetic public page</p>",
  );
  return { root, signing, encryption };
}

test("checks public output without exposing private framework values", (t) => {
  const { root } = fixture(t);
  assert.deepEqual(checkBuildPrivacy(root), {
    frameworkKeyFields: 3,
    uniqueFrameworkKeys: 2,
    publicOutputsChecked: 2,
  });
});

for (const target of [
  "static/chunks/app.js",
  "server/app/page.html",
  "server/app/page.rsc",
  "server/app/route.body",
]) {
  test(`rejects a key exposed in ${target}`, (t) => {
    const { root, encryption } = fixture(t);
    fs.writeFileSync(path.join(root, target), encryption);
    assert.throws(
      () => checkBuildPrivacy(root),
      (error) => {
        assert.equal(error.message.includes(encryption), false);
        return /public output/.test(error.message);
      },
    );
  });
}

test("does not silently skip missing private manifests", (t) => {
  const { root } = fixture(t);
  fs.rmSync(path.join(root, "server/server-reference-manifest.json"));
  assert.throws(() => checkBuildPrivacy(root));
});

test("rejects unexpected key shapes", (t) => {
  const { root } = fixture(t);
  fs.writeFileSync(
    path.join(root, "server/server-reference-manifest.json"),
    "{}",
  );
  assert.throws(() => checkBuildPrivacy(root), /key metadata/);
});

test("cannot miss public files behind a symbolic link", (t) => {
  const { root } = fixture(t);
  fs.symlinkSync(
    path.join(root, "server/app"),
    path.join(root, "static/linked"),
  );
  assert.throws(() => checkBuildPrivacy(root), /symbolic link/);
});

test("rejects a symbolic link at the public tree root", (t) => {
  const { root } = fixture(t);
  fs.renameSync(path.join(root, "static"), path.join(root, "static-original"));
  fs.symlinkSync(path.join(root, "static-original"), path.join(root, "static"));
  assert.throws(() => checkBuildPrivacy(root), /symbolic link/);
});
