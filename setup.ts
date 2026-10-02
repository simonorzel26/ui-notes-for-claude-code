#!/usr/bin/env bun
// Registers the native messaging host that lets the extension keep notes in ~/.ui-notes. Chrome
// derives an unpacked extension's ID from its folder's path, so run this again after moving the
// folder.
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const NAME = "ui_notes_for_claude_code";

const quote = (path: string) => `'${path.replaceAll("'", `'\\''`)}'`;

// Chrome's ID for an unpacked extension: the first 32 hex digits of SHA-256 over the folder's
// real path, each digit mapped from 0-f to a-p.
const extensionId = (folder: string) =>
  [...createHash("sha256").update(folder).digest("hex").slice(0, 32)]
    .map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
    .join("");

function register(): string {
  const repo = realpathSync(import.meta.dir);
  const id = extensionId(join(repo, "extension"));
  const hosts = join(homedir(), "Library/Application Support/Google/Chrome/NativeMessagingHosts");
  const launcher = join(hosts, `${NAME}.sh`);
  mkdirSync(hosts, { recursive: true });
  // Chrome starts native hosts with a bare PATH, so the launcher names Bun by its full path.
  writeFileSync(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(repo, "host.ts"))} "$@"\n`);
  chmodSync(launcher, 0o755);
  const manifest = {
    name: NAME,
    description: "UI notes for Claude Code: keeps the notes queue in ~/.ui-notes",
    path: launcher,
    type: "stdio",
    allowed_origins: [`chrome-extension://${id}/`],
  };
  writeFileSync(join(hosts, `${NAME}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return [
    `Registered ${NAME} for extension ID ${id}.`,
    `Now load ${join(repo, "extension")} in chrome://extensions (Developer mode, Load unpacked).`,
  ].join("\n");
}

if (process.platform === "darwin") {
  console.log(register());
} else {
  console.error("setup.ts registers the host for Google Chrome on macOS only.");
  process.exitCode = 1;
}
