import fs from "node:fs";
import path from "node:path";

/**
 * Atomically write a file: write to temp → rename (same filesystem).
 * The rename is atomic on POSIX and Windows (NTFS), so readers never
 * see a partial or torn write. `fsync` is intentionally omitted because
 * it is unreliable on Windows (EPERM on arbitrary handles) and durability
 * against power loss is not required for this hub's operational data.
 *
 * @param {string} filePath - Final destination path.
 * @param {string|Buffer} content - Content to write.
 * @param {object} [options]
 * @param {string} [options.encoding="utf8"] - Encoding for string content.
 * @param {number} [options.mode=0o600] - File mode (permissions).
 */
export function writeFileAtomic(filePath, content, options = {}) {
  const { encoding = "utf8", mode = 0o600 } = options;
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);

  try {
    // Write content to temp file (same directory ⇒ same filesystem ⇒ safe rename)
    fs.writeFileSync(tmpPath, content, { encoding, mode });
    // Atomic replace — readers only ever see old or new, never partial.
    fs.renameSync(tmpPath, filePath);
  } finally {
    // Best-effort cleanup if rename somehow failed and tmp still exists.
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
  }
}
