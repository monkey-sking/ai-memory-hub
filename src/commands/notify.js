import { buildNotificationPayload } from "../external-integrations.js";
import { getOption, positionalArgs } from "../lib/cli.js";

// notify command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export function notifyCommand(argv, deps) {
  const action = argv[0] || "send";
  switch (action) {
    case "send":
      return notifySendCommand(argv.slice(1), deps);
    case "list":
      return notifyListCommand(argv.slice(1), deps);
    case "pending":
      return notifyPendingCommand(argv.slice(1), deps);
    case "deliver":
      return notifyDeliverCommand(argv.slice(1), deps);
    case "execution":
      return notifyExecutionCommand(argv.slice(1), deps);
    case "payload":
      return notifyPayloadCommand(argv.slice(1), deps);
    default:
      throw new Error(`Unknown notify action: ${action}\nTry: ai-memory-hub notify send|list|pending|deliver|execution|payload`);
  }
}

export function notifyPayloadCommand(argv, deps) {
  const title = getOption(argv, "--title") || "AMH";
  const message = getOption(argv, "--message") || positionalArgs(argv).join(" ");
  if (!message) throw new Error("Usage: ai-memory-hub notify payload --title <title> --message <message> [--url <url>]");
  console.log(JSON.stringify(buildNotificationPayload({ title, message, actionUrl: getOption(argv, "--url") || "" }), null, 2));
}

export function notifySendCommand(argv, deps) {
  const severity = getOption(argv, "--severity") || "info";
  const title = getOption(argv, "--title") || "";
  const message = argv.find((arg) => !arg.startsWith("--")) || getOption(argv, "--message") || "";
  const actionUrl = getOption(argv, "--url") || "";
  const channelsStr = getOption(argv, "--channels") || "";
  const from = getOption(argv, "--from") || "unknown";
  const project = getOption(argv, "--project") || "";

  if (!message && !title) {
    throw new Error("Usage: ai-memory-hub notify send <message> [--severity info|warning|error|critical|need_input] [--title <title>] [--url <url>] [--channels telegram,wechat,email] [--from <tool>] [--project <project>]");
  }

  const userChannels = channelsStr ? channelsStr.split(",").map((c) => c.trim()) : [];
  const channels = deps.getNotificationChannels(severity, userChannels);

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const notification = deps.createNotification({
    severity,
    title,
    message,
    actionUrl,
    channels,
    from,
    project
  });

  deps.writeNotification(config.memoryDir, notification);
  console.log(JSON.stringify(notification, null, 2));
}

export function notifyListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const notifications = deps.readNotifications(config.memoryDir);
  console.log(JSON.stringify(notifications, null, 2));
}

export function notifyPendingCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  const pending = deps.getPendingNotifications(config.memoryDir);
  console.log(JSON.stringify(pending, null, 2));
}

export function notifyDeliverCommand(argv, deps) {
  const notificationId = getOption(argv, "--id") || "";
  const channelsStr = getOption(argv, "--channels") || "";

  if (!notificationId || !channelsStr) {
    throw new Error("Usage: ai-memory-hub notify deliver --id <notification-id> --channels telegram,wechat");
  }

  const deliveredTo = channelsStr.split(",").map((c) => c.trim());

  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);

  deps.updateNotificationStatus(config.memoryDir, notificationId, "delivered", deliveredTo);
  console.log(JSON.stringify({ id: notificationId, deliveredTo, status: "delivered" }, null, 2));
}

export function notifyExecutionCommand(argv, deps) {
  const actor = getOption(argv, "--actor") || "all";
  const channels = deps.getNotificationChannels("warning", (getOption(argv, "--channels") || "").split(",").map((item) => item.trim()).filter(Boolean));
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const unread = deps.dashboardCollaboration.getDashboardCollaboration(config.memoryDir, actor).unread;
  const existing = new Set(deps.readNotifications(config.memoryDir).map((item) => item.sourceItemId).filter(Boolean));
  const created = [];
  for (const item of unread) {
    if (existing.has(item.id)) continue;
    const notification = { ...deps.createNotification({ severity: ["failed", "blocked"].includes(item.state) ? "error" : "warning", title: `AMH execution: ${item.title}`, message: item.text, actionUrl: item.kind === "agent" ? `/sessions/${item.targetId}` : `/radio/${item.targetId}`, channels, from: "ai-memory-hub", project: "" }), sourceItemId: item.id };
    deps.writeNotification(config.memoryDir, notification);
    created.push(notification);
  }
  console.log(JSON.stringify({ actor, created, pending: deps.getPendingNotifications(config.memoryDir).length }, null, 2));
}
