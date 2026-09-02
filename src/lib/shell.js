import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function quoteWindowsCmdArg(value) {
  const text = String(value ?? "");
  if (!text) {
    return "\"\"";
  }
  return `"${text.replace(/"/g, "\"\"").replace(/[%^&|<>()]/g, "^$&")}"`;
}

export function escapeForWindowsCmd(value) {
  return String(value || "")
    .replace(/"/g, '""')
    .replace(/%/g, "%%");
}

export function quoteWindowsCommandArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

export function quoteShellArg(value) {
  const raw = String(value);
  return /\s/.test(raw) ? `"${raw.replace(/"/g, '\\"')}"` : raw;
}

export function classifyCommandPath(file) {
  const ext = path.extname(String(file || "")).toLowerCase();
  if (ext === ".exe" || ext === ".com") return "executable";
  if (ext === ".cmd") return "cmd-shim";
  if (ext === ".bat") return "cmd-script";
  if (ext === ".ps1") return "powershell-shim";
  return ext ? "file" : "native";
}

export function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

export function getRunnerDoctorWarnings(runner) {
  const warnings = [];
  if (!runner.available) {
    warnings.push(runner.sharedStateOnly
      ? "Shared-state-only: dispatch will not launch this tool directly."
      : runner.reason || "Runner is unavailable.");
    return warnings;
  }
  if (process.platform === "win32") {
    const resolved = runner.resolvedCommands || [];
    if (resolved.some((item) => classifyCommandPath(item) === "powershell-shim")) {
      warnings.push("PowerShell .ps1 shim is present in PATH; this runner resolved a safer .cmd/.exe/native command for automation.");
    }
    if (runner.commandKind === "powershell-shim") {
      warnings.push("Unsafe for automation: only a PowerShell .ps1 shim was found.");
    }
    if (runner.usesShell) {
      const promptHint = runner.promptMode === "stdin"
        ? "prompt payload remains on stdin"
        : `prompt mode remains ${runner.promptMode || "argv"}`;
      warnings.push(`Uses cmd.exe only to execute a .cmd/.bat shim; ${promptHint}.`);
    }
  }
  if (runner.promptMode && runner.promptMode !== "stdin") {
    warnings.push(`Prompt mode is ${runner.promptMode}; long prompts may need temp-file escaping.`);
  }
  return warnings;
}

export function runGit(repoDir, args) {
  const r = spawnSync("git", args, { cwd: repoDir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").trim().slice(0, 300)}`);
  return r.stdout.trim();
}

export function resolveCommandPaths(commandName) {
  const name = String(commandName || "").trim();
  if (!name) {
    return [];
  }
  if (path.isAbsolute(name) || /[\\/]/.test(name)) {
    return fs.existsSync(name) ? [path.resolve(name)] : [];
  }
  if (process.platform === "win32") {
    const result = spawnSync("where.exe", [name], {
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status !== 0) {
      return [];
    }
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  // Test harnesses and cross-platform launchers may provide a Windows-style
  // PATH while running under Node on macOS/Linux. Resolve those shims without
  // requiring the host shell to understand the foreign separator.
  const foreignPath = String(process.env.PATH || "")
    .split(/[;:]/)
    .filter(Boolean);
  const foreignMatches = [];
  for (const directory of foreignPath) {
    for (const suffix of ["", ".cmd", ".exe"]) {
      const candidate = path.join(directory, `${name}${suffix}`);
      if (fs.existsSync(candidate) && !foreignMatches.includes(candidate)) {
        foreignMatches.push(candidate);
      }
    }
  }
  if (foreignMatches.length) return foreignMatches;
  const result = spawnSync("sh", ["-c", `command -v ${shellQuote(name)}`], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return [];
  }
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function commandPathPriority(file) {
  const kind = classifyCommandPath(file);
  if (kind === "executable") return 0;
  if (kind === "native") return process.platform === "win32" ? 30 : 5;
  if (kind === "cmd-shim") return 10;
  if (kind === "cmd-script") return 12;
  if (kind === "powershell-shim") return 90;
  return 50;
}

export function shouldUseShellForCommand(file) {
  if (process.platform !== "win32") {
    return false;
  }
  const kind = classifyCommandPath(file);
  return kind === "cmd-shim" || kind === "cmd-script";
}
