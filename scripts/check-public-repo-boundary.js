#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const privatePath = /(^|\/)(\.ai-memory|\.env(?:\.|$)|config\.json|credentials?(?:\/|$)|(?:tasks|radio|workflows|inbox|ledger|runtime|logs?)(?:\/|$)|.*\.log$|.*\.sqlite(?:3)?$)/i;
const violations = tracked.filter((file) => !file.startsWith(".github/workflows/") && privatePath.test(file));

if (violations.length) {
  console.error("Public repository boundary violation: tracked runtime/private data paths detected:");
  for (const file of violations) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log(`Public repository boundary check passed (${tracked.length} tracked files).`);
}

