#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const privatePath = /(^|\/)(\.ai-memory|\.env(?:\.|$)|config\.json|credentials?(?:\/|$)|(?:tasks|radio|workflows|inbox|ledger|runtime|logs?)(?:\/|$)|.*\.log$|.*\.sqlite(?:3)?$)/i;
const violations = tracked.filter((file) => !file.startsWith(".github/workflows/") && privatePath.test(file));

const sensitiveContent = [
  { kind: "absolute Unix path", pattern: /(?:^|[\s"'`])\/(?:Users|Volumes|private)\/(?!<)[A-Za-z0-9._-]+/m },
  { kind: "absolute Windows path", pattern: /(?:^|[\s"'`])[A-Z]:\\(?:Users|Project|Projects| work|workspaces?)\\(?!<)[A-Za-z0-9._-]+/im },
  { kind: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,255}\b/ },
  { kind: "OpenAI-style token", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { kind: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ }
];
const contentViolations = [];
for (const file of tracked) {
  if (file.startsWith(".github/workflows/") || privatePath.test(file)) continue;
  let text;
  try {
    text = readFileSync(file);
    if (text.includes(0)) continue;
    text = text.toString("utf8");
  } catch {
    continue;
  }
  for (const rule of sensitiveContent) {
    const match = rule.pattern.exec(text);
    rule.pattern.lastIndex = 0;
    if (match) {
      const line = text.slice(0, match.index).split("\n").length;
      contentViolations.push(`${file}:${line} (${rule.kind})`);
    }
  }
}

if (violations.length) {
  console.error("Public repository boundary violation: tracked runtime/private data paths detected:");
  for (const file of violations) console.error(`- ${file}`);
}
if (contentViolations.length) {
  console.error("Public repository boundary violation: sensitive-looking content detected:");
  for (const item of contentViolations) console.error(`- ${item}`);
}
if (violations.length || contentViolations.length) process.exitCode = 1;
if (!process.exitCode) console.log(`Public repository boundary check passed (${tracked.length} tracked files).`);
