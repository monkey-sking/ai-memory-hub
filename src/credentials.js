import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { writeFileAtomic } from "./atomic-write.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function listCredentialProfiles(memoryDir) {
  const state = readState(memoryDir);
  return Object.values(state.profiles).map(({ secret, ...profile }) => ({ ...profile, configured: Boolean(secret || profile.envVar) }));
}

export function setCredentialProfile(memoryDir, input = {}) {
  const id = String(input.id || "").trim().toLowerCase();
  if (!ID_PATTERN.test(id)) throw new Error("Credential id must use lowercase letters, numbers, dots, underscores, or hyphens");
  if (!input.value && !input.envVar) throw new Error("Credential requires a value or envVar reference");
  const state = readState(memoryDir);
  const previous = state.profiles[id] || {};
  state.profiles[id] = {
    id,
    label: String(input.label || previous.label || id),
    kind: String(input.kind || previous.kind || "secret"),
    envVar: input.envVar ? String(input.envVar) : previous.envVar || "",
    secret: input.value ? protect(String(input.value)) : previous.secret || "",
    updatedAt: new Date().toISOString()
  };
  writeState(memoryDir, state);
  return publicProfile(state.profiles[id]);
}

export function removeCredentialProfile(memoryDir, id) {
  const state = readState(memoryDir);
  delete state.profiles[String(id || "").trim().toLowerCase()];
  writeState(memoryDir, state);
  return listCredentialProfiles(memoryDir);
}

export function resolveCredential(memoryDir, id) {
  const profile = readState(memoryDir).profiles[String(id || "").trim().toLowerCase()];
  if (!profile) throw new Error(`Credential profile not found: ${id}`);
  if (profile.envVar && process.env[profile.envVar]) return process.env[profile.envVar];
  if (!profile.secret) throw new Error(`Credential is not configured: ${id}`);
  return unprotect(profile.secret);
}

function publicProfile(profile) {
  const { secret: _secret, ...safe } = profile;
  return { ...safe, configured: Boolean(profile.secret || profile.envVar) };
}

function readState(memoryDir) {
  const file = path.join(memoryDir, "credentials", "profiles.json");
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return { version: 1, profiles: value.profiles || {} };
  } catch {
    return { version: 1, profiles: {} };
  }
}

function writeState(memoryDir, state) {
  const dir = path.join(memoryDir, "credentials");
  fs.mkdirSync(dir, { recursive: true });
  writeFileAtomic(path.join(dir, "profiles.json"), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function protect(value) {
  if (process.platform === "win32") return `dpapi:${powershellProtect(value)}`;
  const key = process.env.AMH_CREDENTIAL_KEY;
  if (!key) throw new Error("AMH_CREDENTIAL_KEY is required outside Windows for credential storage");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(key).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `aesgcm:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

function unprotect(value) {
  if (value.startsWith("dpapi:")) return powershellUnprotect(value.slice(6));
  const key = process.env.AMH_CREDENTIAL_KEY;
  if (!key) throw new Error("AMH_CREDENTIAL_KEY is required to read credential storage");
  const [, ivText, tagText, encryptedText] = value.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(key).digest(), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64")), decipher.final()]).toString("utf8");
}

function powershellProtect(value) {
  return runPowerShell(`Add-Type -AssemblyName System.Security; $b=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))`, value);
}

function powershellUnprotect(value) {
  return runPowerShell(`Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))`, value);
}

function runPowerShell(script, input) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { input, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(String(result.stderr || "Credential protection failed").trim());
  return String(result.stdout || "").trim();
}
