// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function checkBuildPrivacy(buildDirectory) {
  const root = path.resolve(buildDirectory);
  const keys = new Set();
  let fields = 0;
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  const add = (value) => {
    if (typeof value !== "string" || value.length < 16 || value.length > 4096) {
      throw new Error("Missing or invalid framework build key metadata");
    }
    fields++;
    keys.add(value);
  };
  const preview = read("prerender-manifest.json").preview;
  add(preview?.previewModeSigningKey);
  add(preview?.previewModeEncryptionKey);
  add(read("server/server-reference-manifest.json").encryptionKey);
  for (const file of ["cache/.rscinfo", "cache/.previewinfo"]) {
    if (!fs.existsSync(path.join(root, file))) continue;
    const metadata = read(file);
    if (file.endsWith(".rscinfo")) add(metadata["encryption.key"]);
    else {
      add(metadata.previewModeSigningKey);
      add(metadata.previewModeEncryptionKey);
    }
  }
  const middleware = read("server/middleware-manifest.json");
  for (const item of Object.values(middleware.functions ?? {})) {
    for (const key of ["__NEXT_PREVIEW_MODE_SIGNING_KEY", "__NEXT_PREVIEW_MODE_ENCRYPTION_KEY"]) {
      if (Object.hasOwn(item.env ?? {}, key)) add(item.env[key]);
    }
  }
  let files = 0;
  let totalBytes = 0;
  const scan = (directory, staticAssets) => {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("Public build tree contains a symbolic link");
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Public build tree contains a symbolic link");
      if (entry.isDirectory()) scan(file, staticAssets);
      else if (entry.isFile() && (staticAssets || /\.(html|rsc|body|json)$/.test(file))) {
        const size = fs.statSync(file).size;
        totalBytes += size;
        if (size > 128 * 1024 * 1024 || totalBytes > 1024 * 1024 * 1024) {
          throw new Error("Public build tree exceeds its verification limit");
        }
        files++;
        const bytes = fs.readFileSync(file);
        for (const key of keys) {
          if (bytes.includes(Buffer.from(key))) {
            throw new Error("Framework build key appears in a public output");
          }
        }
      }
    }
  };
  scan(path.join(root, "static"), true);
  if (fs.existsSync(path.join(root, "server/app"))) scan(path.join(root, "server/app"), false);
  if (files === 0) throw new Error("No public build outputs verified");
  return { frameworkKeyFields: fields, uniqueFrameworkKeys: keys.size, publicOutputsChecked: files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(checkBuildPrivacy(process.argv[2] ?? ".next")));
  } catch {
    // Never reflect a key, manifest contents or private paths in build logs.
    console.error("Build privacy verification failed; inspect the build privately.");
    process.exitCode = 1;
  }
}
