import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { buildGithubRequest, buildNotificationPayload, buildSshPlan, getPackTrustStatus, renderSkillMarkdown, verifyPackSignature } from "../src/external-integrations.js";
import { parseGithubWebhook } from "../src/github-lifecycle.js";

test("GitHub integration builds read-only API requests and webhook sync records", () => {
  const request = buildGithubRequest({ owner: "acme", repo: "amh", pull: 12, token: "secret" });
  assert.equal(request.url, "https://api.github.com/repos/acme/amh/pulls/12");
  assert.equal(request.headers.Authorization, "Bearer secret");
  assert.equal(request.method, "GET");
});

test("SSH integration produces an approval-gated plan without executing", () => {
  const plan = buildSshPlan({ host: "dev.example", user: "runner", worktree: "/srv/amh", command: "npm test", approved: false });
  assert.equal(plan.executable, false);
  assert.equal(plan.reason, "approval-required");
  assert.equal(plan.command, "npm test");
});

test("Pack signature verification and skill rendering are deterministic", () => {
  const payload = JSON.stringify({ id: "reverse-skill", version: "1.0.0" });
  const pair = crypto.generateKeyPairSync("ed25519");
  const signature = crypto.sign(null, Buffer.from(payload), pair.privateKey).toString("base64");
  assert.equal(verifyPackSignature(payload, signature, pair.publicKey.export({ type: "spki", format: "pem" })), true);
  const markdown = renderSkillMarkdown({ title: "Evidence first", text: "Always cite two independent evidence classes.", sourceTaskId: "task-1" });
  assert.match(markdown, /# Evidence first/);
  assert.match(markdown, /task-1/);
});

test("notification payloads are compatible with Feishu and WeCom adapters", () => {
  const payload = buildNotificationPayload({ title: "Review needed", message: "Task is waiting", actionUrl: "/tasks/1" });
  assert.equal(payload.feishu.msg_type, "interactive");
  assert.equal(payload.wecom.msgtype, "markdown");
  assert.match(payload.wecom.markdown.content, /Review needed/);
});

test("webhook normalization and required pack trust fail closed", () => {
  const webhook = parseGithubWebhook({ action: "closed", repository: { full_name: "acme/amh" }, pull_request: { number: 4, html_url: "https://github.com/acme/amh/pull/4", merged_at: "2026-08-03T00:00:00Z" } });
  assert.equal(webhook.accepted, true);
  assert.equal(webhook.pullRequest.merged, true);
  assert.equal(getPackTrustStatus({ required: true }).status, "required");
});
