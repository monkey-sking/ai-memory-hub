import crypto from "node:crypto";

export function buildGithubRequest({ owner, repo, pull, token = "" } = {}) {
  const request = { method: "GET", url: `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(pull)}`, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } };
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
}

export function buildSshPlan({ host, user, worktree, command, approved = false, policy = "ask" } = {}) {
  const cleanCommand = String(command || "").trim();
  const safe = Boolean(host && user && worktree && cleanCommand) && !/[;&|`$<>]/.test(cleanCommand);
  return { host: String(host || ""), user: String(user || ""), worktree: String(worktree || ""), command: cleanCommand, executable: safe && approved && policy === "allow", reason: !safe ? "invalid-or-unsafe-input" : (!approved || policy !== "allow" ? "approval-required" : "approved"), executes: false };
}

export function verifyPackSignature(payload, signature, publicKey) {
  try { return crypto.verify(null, Buffer.from(String(payload)), publicKey, Buffer.from(String(signature), "base64")); } catch { return false; }
}

export function getPackTrustStatus({ payload = "", signature = "", publicKey = "", required = false } = {}) {
  if (!signature || !publicKey) return { status: required ? "required" : "unsigned", verified: false, required: Boolean(required) };
  const verified = verifyPackSignature(payload, signature, publicKey);
  return { status: verified ? "verified" : "invalid", verified, required: Boolean(required) };
}

export function renderSkillMarkdown({ title, text, sourceTaskId, evidence = [] } = {}) {
  const lines = [`# ${String(title || "Untitled skill").trim()}`, "", "## Rule", "", String(text || "").trim(), "", "## Provenance", "", `- Source task: ${sourceTaskId || "unknown"}`];
  if (evidence.length) lines.push(`- Evidence: ${evidence.join("; ")}`);
  return `${lines.join("\n")}\n`;
}

export function buildNotificationPayload({ title, message, actionUrl = "" } = {}) {
  return {
    feishu: { msg_type: "interactive", card: { config: { wide_screen_mode: true }, header: { title: { tag: "plain_text", content: String(title || "AMH") } }, elements: [{ tag: "div", text: { tag: "lark_md", content: String(message || "") } }, ...(actionUrl ? [{ tag: "action", actions: [{ tag: "button", text: { tag: "plain_text", content: "Open" }, type: "primary", url: actionUrl }] }] : [])] } },
    wecom: { msgtype: "markdown", markdown: { content: `**${String(title || "AMH")}**\n${String(message || "")}${actionUrl ? `\n[Open](${actionUrl})` : ""}` } }
  };
}
