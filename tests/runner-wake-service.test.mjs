import assert from "node:assert/strict";
import test from "node:test";
import { createAgentWakeService } from "../src/agent-wake-service.js";

test("wake service maps direct runners without resume to fresh-run", () => {
  const service = createAgentWakeService({ memoryDir: "C:/memory", appendJsonl: () => {} });
  const envelope = service.enqueue({ to: "session:gemini:abc", text: "Continue." });
  const planned = service.planForRunner(envelope, {
    available: true,
    capabilities: ["direct-dispatch", "stdin-prompt"]
  });
  assert.equal(planned.action, "fresh-run");
  assert.equal(planned.state, "resolving");
});

test("wake service maps shared-state tools to queue", () => {
  const service = createAgentWakeService({ memoryDir: "C:/memory", appendJsonl: () => {} });
  const envelope = service.enqueue({ to: "session:marvis:abc", text: "Continue." });
  const planned = service.planForRunner(envelope, { sharedStateOnly: true });
  assert.equal(planned.action, "queue");
  assert.equal(planned.state, "accepted");
});
