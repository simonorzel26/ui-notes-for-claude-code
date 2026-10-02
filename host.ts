#!/usr/bin/env bun
// Chrome starts this through native messaging in two ways: once per request from a page (add,
// list, edit or delete a note in the queue Claude reads), and once per extension start, to watch
// the extension's files and ask it to reload when they change.
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = join(homedir(), ".ui-notes");
const queue = join(home, "queue.jsonl");
const stdin = Bun.stdin.stream().getReader();

type Note = Record<string, unknown> & { id: string; at: string; text: string };
type Summary = Pick<Note, "id" | "at" | "text" | "url" | "name">;
type Request =
  | { op: "watch" }
  | { op: "list" }
  | { op: "add"; note: Record<string, unknown> & { text: string } }
  | { op: "edit"; id: string; text: string }
  | { op: "delete"; id: string };
// Every reply carries the whole queue, so the page's count and list always match the file.
type Reply = { ok: true; notes: Summary[] } | { ok: false; error: string };

/** One message: a 4-byte little-endian length, then that many bytes of JSON. */
async function readMessage(): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await stdin.read();
    if (done) throw new Error("message ended early");
    chunks.push(value);
    const all = Buffer.concat(chunks);
    if (all.length >= 4 && all.length >= 4 + all.readUInt32LE(0)) {
      return JSON.parse(all.subarray(4, 4 + all.readUInt32LE(0)).toString("utf8"));
    }
  }
}

async function send(message: unknown): Promise<void> {
  const body = Buffer.from(JSON.stringify(message));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  await Bun.write(Bun.stdout, Buffer.concat([head, body]));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parse(message: unknown): Request | null {
  if (!isRecord(message)) return null;
  const { op, id, text, note } = message;
  if (op === "watch" || op === "list") return { op };
  if (op === "add" && isRecord(note) && typeof note.text === "string") return { op, note: { ...note, text: note.text } };
  if (op === "edit" && typeof id === "string" && typeof text === "string") return { op, id, text };
  if (op === "delete" && typeof id === "string") return { op, id };
  return null;
}

const read = (): Note[] =>
  existsSync(queue)
    ? readFileSync(queue, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];

// No queue file means no notes, so Claude moving the file away never takes an empty batch.
function write(notes: readonly Note[]): void {
  if (notes.length === 0) return rmSync(queue, { force: true });
  const next = `${queue}.tmp`;
  writeFileSync(next, notes.map((note) => `${JSON.stringify(note)}\n`).join(""));
  renameSync(next, queue);
}

const listed = (): Reply => ({
  ok: true,
  notes: read().map(({ id, at, text, url, name }) => ({ id, at, text, url, name })),
});

function handle(request: Exclude<Request, { op: "watch" }>): Reply {
  if (request.op === "list") return listed();
  if (request.op === "add") {
    mkdirSync(home, { recursive: true });
    appendFileSync(queue, `${JSON.stringify({ ...request.note, id: randomUUID(), at: new Date().toISOString() })}\n`);
    return listed();
  }
  const notes = read();
  if (!notes.some((note) => note.id === request.id)) {
    return { ok: false, error: "This note is no longer in the queue. Claude may have taken it." };
  }
  if (request.op === "delete") {
    write(notes.filter((note) => note.id !== request.id));
    return listed();
  }
  const text = request.text.trim();
  if (!text) return { ok: false, error: "A note needs text. Delete it instead." };
  write(notes.map((note) => (note.id === request.id ? { ...note, text } : note)));
  return listed();
}

/** Until Chrome closes the pipe: one reload request per burst of file changes. */
async function watchExtension(): Promise<void> {
  let pending: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(join(import.meta.dir, "extension"), () => {
    clearTimeout(pending);
    pending = setTimeout(() => void send({ reload: true }), 300);
  });
  while (!(await stdin.read()).done);
  watcher.close();
}

const request = parse(await readMessage().catch(() => null));
if (request?.op === "watch") await watchExtension();
else await send(request ? handle(request) : { ok: false, error: "not a request" });
process.exit(0);
