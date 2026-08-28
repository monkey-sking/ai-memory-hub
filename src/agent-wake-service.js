import fs from "node:fs";
import path from "node:path";
import { createWakeEnvelope, selectWakeAction, transitionWakeState } from "./agent-wake.js";
import { normalizeRunnerCapabilities, selectRunnerWakeAction } from "./runner-capabilities.js";
import { appendJsonl as sharedAppendJsonl } from "./event-writer.js";

export function createAgentWakeService({ memoryDir, appendJsonl = sharedAppendJsonl, now = () => new Date().toISOString() } = {}) {
  if (!memoryDir) throw new Error("memoryDir is required");
  const wakeDir = path.join(memoryDir, "wake");
  const inboxFile = path.join(wakeDir, "inbox.jsonl");
  const stateFile = path.join(wakeDir, "state.jsonl");

  function enqueue(input) {
    const envelope = createWakeEnvelope({ ...input, now: now() });
    appendJsonl(inboxFile, envelope);
    appendJsonl(stateFile, { id: envelope.id, ts: now(), state: envelope.state, action: "enqueue" });
    return envelope;
  }

  function plan(envelope, session = {}) {
    const action = selectWakeAction({
      live: Boolean(session.live && session.sessionId === envelope.target.sessionId),
      resume: Boolean(session.resume && session.sessionId === envelope.target.sessionId)
    });
    const nextState = action === "queue" ? "accepted" : "resolving";
    transitionWakeState(envelope.state, nextState);
    return { ...envelope, action, state: nextState, attempt: envelope.attempt + 1 };
  }

  function planForRunner(envelope, runnerProfile = {}, session = {}) {
    const capabilities = normalizeRunnerCapabilities(runnerProfile);
    const selected = selectRunnerWakeAction(capabilities, envelope.target.sessionId, { liveSessionId: session.liveSessionId || "" });
    const action = selected === "live-send" ? "send" : selected === "resume" || selected === "fresh-run" ? "wake" : "queue";
    const nextState = action === "queue" ? "accepted" : "resolving";
    transitionWakeState(envelope.state, nextState);
    return { ...envelope, action: selected, state: nextState, attempt: envelope.attempt + 1 };
  }

  return { enqueue, plan, planForRunner, files: { inboxFile, stateFile } };
}

