// Low-level JSONL file IO.
//
// These are the generic, business-agnostic readers used across the hub (every
// command that ingests a .jsonl file funnels through readEvents). They were
// inlined near the bottom of the 18k-line index.js monolith; extracting them
// here (v2.6) gives the entity-store engine and any future command module a
// circular-dependency-free home for file IO — nothing here imports index.js.
//
// Depends only on node:fs and the createId helper from the shared helper layer.
import fs from "node:fs";
import { createId } from "./cli.js";

export function parseJsonlLine(line, _file = "", _lineNumber = 0) {
  const raw = String(line || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    return {
      id: createId(raw),
      ts: new Date().toISOString(),
      source: "raw",
      text: raw,
      metadata: { kind: "raw" }
    };
  }
}

export function readEvents(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseJsonlLine(line, file));
}

export function countJsonlLines(file) {
  if (!fs.existsSync(file)) {
    return 0;
  }
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
}
