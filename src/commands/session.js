import { getOption, positionalArgs } from "../lib/cli.js";

// session command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function sessionCommand(argv, deps) {
  const action = argv[0] || "list";
  switch (action) {
    case "list":
      return sessionListCommand(argv.slice(1), deps);
    case "add":
    case "create":
      return sessionAddCommand(argv.slice(1), deps);
    case "update":
      return sessionUpdateCommand(argv.slice(1), deps);
    case "active":
      return sessionActiveCommand(argv.slice(1), deps);
    case "inspect":
      return sessionInspectCommand(argv.slice(1), deps);
    case "follow-up":
    case "followup":
      return sessionFollowUpCommand(argv.slice(1), deps);
    default:
      throw new Error(`Unknown session action: ${action}\nTry: ai-memory-hub session list|add|update|active|inspect|follow-up`);
  }
}

export function sessionInspectCommand(argv, deps) {
  const id = getOption(argv, "--id") || argv[0] || "";
  if (!id) throw new Error("Usage: ai-memory-hub session inspect --id <session-id>");
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const session = deps.dashboardAgentSessions.getDashboardAgentSessions(config.memoryDir).agentSessions.find((item) => item.sessionId === id || item.id === id);
  if (!session) throw new Error(`Session not found: ${id}`);
  console.log(JSON.stringify(session, null, 2));
}

export function sessionFollowUpCommand(argv, deps) {
  const sessionId = getOption(argv, "--id") || argv[0] || "";
  const text = getOption(argv, "--text") || positionalArgs(argv.slice(1)).join(" ").trim();
  if (!sessionId || !text) throw new Error("Usage: ai-memory-hub session follow-up --id <session-id> --text <message> [--to <agent>]");
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const result = deps.withHubLock(config.memoryDir, "agent-follow-up", () => deps.dashboardCollaboration.sendFollowUp(config.memoryDir, { sessionId, text, by: getOption(argv, "--by") || "manual", to: getOption(argv, "--to") || "all" }), config.sync.lockStaleMs);
  console.log(JSON.stringify(result, null, 2));
}

export function sessionListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const sessions = deps.readSessions(config.memoryDir);
  console.log(JSON.stringify(sessions, null, 2));
}

export function sessionAddCommand(argv, deps) {
  const title = getOption(argv, "--title") || argv[0] || "";
  const createdBy = getOption(argv, "--from") || getOption(argv, "--by") || "unknown";
  const project = getOption(argv, "--project") || "";
  const context = getOption(argv, "--context") || "";

  if (!title) {
    throw new Error("Usage: ai-memory-hub session add <title> --from <tool> [--project <project>] [--context <text>]");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const session = deps.createSession({
    title,
    createdBy,
    project,
    participants: [createdBy],
    context,
    artifacts: []
  });

  const sessions = deps.readSessions(config.memoryDir);
  sessions.push(session);
  deps.writeSessions(config.memoryDir, sessions);

  console.log(JSON.stringify(session, null, 2));
}

export function sessionUpdateCommand(argv, deps) {
  const sessionId = getOption(argv, "--id") || argv[0] || "";
  const context = getOption(argv, "--context");
  const addParticipant = getOption(argv, "--add-participant");

  if (!sessionId) {
    throw new Error("Usage: ai-memory-hub session update --id <session-id> [--context <text>] [--add-participant <tool>]");
  }

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const updates = {};
  if (context !== null && context !== undefined) {
    updates.context = context;
  }

  if (addParticipant) {
    const sessions = deps.readSessions(config.memoryDir);
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      updates.participants = [...new Set([...(session.participants || []), addParticipant])];
    }
  }

  const updated = deps.updateSession(config.memoryDir, sessionId, updates);
  console.log(JSON.stringify(updated, null, 2));
}

export function sessionActiveCommand(argv, deps) {
  const maxAgeHours = Number(getOption(argv, "--max-age") || 1);
  const maxAgeMs = maxAgeHours * 3600000;

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const activeSessions = deps.getActiveSessions(config.memoryDir, maxAgeMs);
  console.log(JSON.stringify(activeSessions, null, 2));
}
