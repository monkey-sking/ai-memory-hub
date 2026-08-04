import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sourceId(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex").slice(0, 16);
}

async function findSkillDirectory(root) {
  const direct = path.join(root, "SKILL.md");
  if (await fs.access(direct).then(() => true).catch(() => false)) return root;
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".git" || entry.name === "node_modules") continue;
    const found = await findSkillDirectory(path.join(root, entry.name));
    if (found) return found;
  }
  return null;
}

export async function prepareSkillSource(memoryDir, source, { ref = "" } = {}) {
  const value = String(source || "").trim();
  if (!value) throw new Error("Skill source is required");
  const resolved = path.resolve(value);
  const stat = await fs.stat(resolved).catch(() => null);
  if (stat?.isDirectory()) return { path: resolved, source: { kind: "local", location: resolved }, cleanup: async () => {} };
  if (stat?.isFile() && path.extname(resolved).toLowerCase() === ".zip") {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), `amh-skill-${sourceId(resolved)}-`));
    try {
      await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive", "-LiteralPath", resolved, "-DestinationPath", work, "-Force"], { windowsHide: true });
      const skillPath = await findSkillDirectory(work);
      if (!skillPath) throw new Error(`ZIP does not contain a Skill package: ${resolved}`);
      return { path: skillPath, source: { kind: "zip", location: resolved }, cleanup: () => fs.rm(work, { recursive: true, force: true }) };
    } catch (error) {
      await fs.rm(work, { recursive: true, force: true });
      throw error;
    }
  }
  if (/^(https?:\/\/|git@|ssh:\/\/)/i.test(value) || value.endsWith(".git")) {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), `amh-skill-git-${sourceId(value)}-`));
    try {
      const args = ["clone", "--depth", "1"];
      if (ref) args.push("--branch", ref);
      args.push(value, work);
      await execFileAsync("git", args, { windowsHide: true, maxBuffer: 1024 * 1024 });
      const skillPath = await findSkillDirectory(work);
      if (!skillPath) throw new Error(`Git source does not contain a Skill package: ${value}`);
      return { path: skillPath, source: { kind: "git", location: value, ref: ref || "HEAD" }, cleanup: () => fs.rm(work, { recursive: true, force: true }) };
    } catch (error) {
      await fs.rm(work, { recursive: true, force: true });
      throw error;
    }
  }
  throw new Error(`Unsupported Skill source: ${value}`);
}

export async function withPreparedSkillSource(memoryDir, source, options, handler) {
  const prepared = await prepareSkillSource(memoryDir, source, options);
  try {
    return await handler(prepared);
  } finally {
    await prepared.cleanup();
  }
}
