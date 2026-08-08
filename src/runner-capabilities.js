export function normalizeRunnerCapabilities(profile = {}) {
  const declared = new Set(Array.isArray(profile.capabilities) ? profile.capabilities : []);
  const freshRun = Boolean(profile.available && (declared.has("direct-dispatch") || declared.has("stdin-prompt") || declared.has("argv-prompt")));
  const resume = Boolean(profile.resumeArgs || declared.has("session-resume"));
  const liveSend = Boolean(declared.has("live-send"));
  const sharedQueue = Boolean(profile.sharedStateOnly || !freshRun);
  return { freshRun, resume, liveSend, sharedQueue };
}

export function selectRunnerWakeAction(capabilities = {}, sessionId = "", { liveSessionId = "" } = {}) {
  if (capabilities.liveSend && sessionId && sessionId === liveSessionId) return "live-send";
  if (capabilities.resume && sessionId) return "resume";
  if (capabilities.freshRun) return "fresh-run";
  return "queue";
}
