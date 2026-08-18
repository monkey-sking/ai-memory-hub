import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./atomic-write.js";

/**
 * feature ③ — 数据导入 / 导出与迁移
 *
 * 把 memory 核心存储打包成一个可移植的单文件 JSON 包（amh-port），
 * 比整目录快照更适合机器间迁移：带版本号、可演进、导入前支持干跑预览。
 *
 * 设计取舍：
 * - 导出 = 只读遍历，零风险；
 * - 导入 = 默认干跑（apply=false 只返回计划），apply=true 先自动安全备份再原子写回；
 * - 自带安全快照，不依赖 index.js 单体内的 backupHub（零耦合）。
 */

const PORT_FORMAT = "amh-port";
const PORT_VERSION = 1;

// 永不打包的路径：运行时锁 / 循环备份 / 运行期日志与状态 / 历史同步归档 /
// 可重建的二进制索引 / 临时文件。迁移包只携带"记忆与工作数据"，不背运行期噪声。
const DENY_SEGMENTS = new Set(["backups", "locks", "dispatch-runs", "synced", "state", "context"]);

function isDenied(relPath) {
  const parts = relPath.split(path.sep);
  if (parts.some((s) => DENY_SEGMENTS.has(s))) return true;
  const base = path.basename(relPath);
  if (base === "search-index.db") return true;
  if (base.endsWith(".tmp")) return true;
  if (base.endsWith(".log")) return true;
  if (base.includes(".backup.")) return true;
  return false;
}

function walkFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        const rel = path.relative(rootDir, full);
        if (!isDenied(rel)) out.push(rel);
      }
    }
  }
  return out.sort();
}

export function exportMemoryBundle(memoryDir) {
  const root = path.resolve(memoryDir);
  const stores = {};
  for (const rel of walkFiles(root)) {
    const full = path.join(root, rel);
    let content;
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    // 统一为正斜杠做 key，跨平台一致（Windows 上 path.relative 返回反斜杠）。
    const key = rel.split(path.sep).join("/");
    stores[key] = { bytes: Buffer.byteLength(content, "utf8"), content };
  }
  return {
    format: PORT_FORMAT,
    version: PORT_VERSION,
    exportedAt: new Date().toISOString(),
    generator: "ai-memory-hub",
    storeCount: Object.keys(stores).length,
    stores
  };
}

// 防路径穿越：只接受相对、不出 memoryDir 的路径。
function safeRel(rel) {
  if (typeof rel !== "string" || !rel) return null;
  const normalized = path.normalize(rel).replace(/\\/g, "/");
  if (path.isAbsolute(normalized)) return null;
  const segments = normalized.split("/");
  if (segments.includes("..")) return null;
  return segments.join("/");
}

export function planImportMemoryBundle(memoryDir, bundle) {
  const root = path.resolve(memoryDir);
  if (!bundle || bundle.format !== PORT_FORMAT) {
    return { ok: false, error: "unsupported bundle format" };
  }
  const plan = [];
  for (const [rel, entry] of Object.entries(bundle.stores || {})) {
    const clean = safeRel(rel);
    if (!clean) {
      plan.push({ rel, skipped: true, reason: "invalid path" });
      continue;
    }
    const target = path.join(root, clean);
    let exists = false;
    let same = false;
    let currentBytes = 0;
    try {
      const stat = fs.statSync(target);
      exists = true;
      currentBytes = stat.size;
      const cur = fs.readFileSync(target, "utf8");
      same = cur === (entry && entry.content);
    } catch {
      // not present yet — will be a create
    }
    plan.push({
      rel: clean,
      exists,
      bytes: entry ? entry.bytes : 0,
      changed: !same,
      currentBytes
    });
  }
  return { ok: true, plan };
}

export function importMemoryBundle(memoryDir, bundle, { apply = false } = {}) {
  const planResult = planImportMemoryBundle(memoryDir, bundle);
  if (!planResult.ok) return planResult;
  if (!apply) {
    return { ok: true, applied: false, plan: planResult.plan };
  }

  const root = path.resolve(memoryDir);
  // 导入前先对"会被覆盖的文件"做安全备份（只备 exists && 会被改写者），
  // 不整目录拷贝——避免 GB 级 cpSync 阻塞事件循环、也避免把备份目录套在自己里。
  // 备份目录放在 memoryDir 之外（同级），防止递归。
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(path.dirname(root), `amh-import-safety-${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });
  let backedUp = 0;
  for (const item of planResult.plan) {
    if (item.skipped || !item.exists) continue;
    const target = path.join(root, item.rel);
    const dest = path.join(backupDir, item.rel);
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(target, dest);
      backedUp++;
    } catch (e) {
      return { ok: false, error: `safety backup failed at ${item.rel}: ${e.message}` };
    }
  }

  let written = 0;
  for (const item of planResult.plan) {
    if (item.skipped) continue;
    const target = path.join(root, item.rel);
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const entry = bundle.stores[item.rel];
      if (!entry) continue;
      writeFileAtomic(target, entry.content, { mode: 0o600 });
      written++;
    } catch (e) {
      return {
        ok: false,
        error: `write failed at ${item.rel}: ${e.message}`,
        backup: backupDir,
        written
      };
    }
  }
  return {
    ok: true,
    applied: true,
    written,
    backedUp,
    backup: backupDir,
    plan: planResult.plan
  };
}
