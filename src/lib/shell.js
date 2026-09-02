// 从 src/index.js 下沉的通用工具函数（v3.0 重构 P0-2）。
// 这些函数不依赖 index.js 内部的任何其他符号，可安全复用。

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

export function buildWindowsCmdLine(command, args = []) {
  return [command, ...(args || [])].map(quoteWindowsCmdArg).join(" ");
}

export function resolveGitProcessCommand() {
  const override = String(process.env.AI_MEMORY_HUB_GIT_COMMAND || "").trim();
  const command = override || resolveCommandPaths("git")
    .find((file) => classifyCommandPath(file) !== "powershell-shim") || "git";
  return {
    command,
    usesShell: shouldUseShellForCommand(command)
  };
}

export function commandExists(commandName) {
  return resolveCommandPaths(commandName).length > 0;
}

export function choosePreferredCommandPath(paths) {
  return [...new Set((paths || []).filter(Boolean))]
    .sort((a, b) => commandPathPriority(a) - commandPathPriority(b))[0] || "";
}

export function resolveRunnerCommand(profile) {
  const candidates = profile.commandCandidates || [profile.command].filter(Boolean);
  const allPaths = [];
  for (const candidate of candidates) {
    for (const found of resolveCommandPaths(candidate)) {
      if (!allPaths.includes(found)) {
        allPaths.push(found);
      }
    }
  }
  if (process.platform === "win32" && profile.windowsExeFromCmd) {
    const found = allPaths.find((item) => classifyCommandPath(item) === "cmd-shim");
    if (found) {
      const exe = path.join(path.dirname(found), profile.windowsExeFromCmd);
      if (fs.existsSync(exe) && !allPaths.includes(exe)) {
        allPaths.push(exe);
      }
    }
  }
  const pathValue = choosePreferredCommandPath(allPaths);
  return {
    name: pathValue ? path.basename(pathValue) : "",
    path: pathValue,
    kind: pathValue ? classifyCommandPath(pathValue) : "",
    allPaths
  };
}

export function buildRunnerInvocation(runner, args = []) {
  const useCmdLauncher = process.platform === "win32" && runner.usesShell;
  const command = useCmdLauncher ? buildWindowsCmdLine(runner.command, args) : runner.command;
  const commandArgs = useCmdLauncher ? [] : args;
  return {
    command: runner.commandName || runner.command || "",
    args: args.map((arg) => String(arg)),
    commandLine: [command, ...commandArgs].filter(Boolean).join(" "),
    usesShell: useCmdLauncher
  };
}

export function runProcess(command, args, options = {}) {
  const useWindowsShellLauncher = process.platform === "win32" && options.shell;
  const spawnCommand = useWindowsShellLauncher ? buildWindowsCmdLine(command, args) : command;
  const spawnArgs = useWindowsShellLauncher ? [] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    encoding: "utf8",
    windowsHide: true,
    shell: Boolean(options.shell)
  });
  const output = {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    command: `${command} ${args.map(quoteShellArg).join(" ")}`
  };
  if (!output.ok && !options.allowFailure) {
    throw new Error(`${command} failed (${output.exitCode}): ${output.stderr || output.stdout || result.error?.message || ""}`.trim());
  }
  return output;
}
