import { writeFileAtomic } from "../atomic-write.js";
import { appendJsonl } from "../event-writer.js";
import {
  createId,
  ensureDir,
  getOption,
  hasFlag,
  positionalArgs,
} from "../lib/cli.js";

// radio command cluster. Cross-cutting helpers injected via deps so this
// module never imports src/index.js (keeps the dependency graph acyclic).

export async function radioCommand(argv, deps) {
  const action = argv[0] || "list";
  const actionArgs = argv.slice(1);
  switch (action) {
    case "send":
      return radioSendCommand(actionArgs, deps);
    case "list":
      return radioListCommand(actionArgs, deps);
    case "promote":
      return radioPromoteCommand(actionArgs, deps);
    case "archive":
      return radioArchiveCommand(actionArgs, deps);
    default:
      throw new Error("Usage: ai-memory-hub radio <send|list|promote|archive> ...");
  }
}


export function radioSendCommand(argv, deps) {
  const text = positionalArgs(argv).join(" ").trim();
  if (!text) {
    throw new Error("Usage: ai-memory-hub radio send <text> [--from codex] [--to claude] [--type handoff]");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const message = deps.createRadioMessage({
    from: getOption(argv, "--from") || "manual",
    to: getOption(argv, "--to") || "all",
    type: getOption(argv, "--type") || "note",
    text,
    thread: getOption(argv, "--thread") || "",
    replyTo: getOption(argv, "--reply-to") || "",
    project: getOption(argv, "--project") || path.basename(process.cwd())
  });
  appendJsonl(path.join(config.memoryDir, "radio", "messages.jsonl"), message);
  console.log(JSON.stringify(message, null, 2));
}

// P0.2 (borrowed from Cumora's unread cursor): each runner keeps its own read cursor so
// parallel runners consume radio incrementally and never re-process the same message.

export function radioListCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const limit = Number(getOption(argv, "--limit") || 20);
  const consumer = getOption(argv, "--consumer");
  const ack = hasFlag(argv, "--ack");
  if (consumer) {
    const unread = deps.getUnreadRadioMessages(config.memoryDir, consumer);
    const window = unread.slice(-limit);
    if (ack && window.length > 0) {
      const lastId = window[window.length - 1].id;
      deps.writeRadioCursor(config.memoryDir, consumer, lastId, unread.map((m) => m.id));
    }
    console.log(JSON.stringify(window, null, 2));
    return;
  }
  const messages = deps.readRadioMessages(config.memoryDir).slice(-limit);
  console.log(JSON.stringify(messages, null, 2));
}


export function radioPromoteCommand(argv, deps) {
  const id = getOption(argv, "--id") || positionalArgs(argv)[0] || "";
  if (!id) {
    throw new Error("Usage: ai-memory-hub radio promote --id <message-id>");
  }
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  const message = deps.readRadioMessages(config.memoryDir).find((item) => item.id === id);
  if (!message) {
    throw new Error(`Radio message not found: ${id}`);
  }
  if (message.promoted) {
    console.log(`Radio message already promoted: ${message.id}`);
    return;
  }
  if (deps.isCorruptedRadioMessage(message)) {
    throw new Error(`Refusing to promote corrupted radio message: ${message.id}`);
  }
  appendJsonl(path.join(config.memoryDir, "inbox", "events.jsonl"), {
    id: createId(`radio:${message.id}`),
    ts: new Date().toISOString(),
    source: `radio:${message.from}`,
    text: message.text,
    metadata: {
      kind: "radio",
      radio_id: message.id,
      radio_type: message.type,
      radio_to: message.to,
      thread: message.thread,
      project: message.project
    }
  });
  deps.updateRadioMessage(config.memoryDir, message.id, {
    promoted: true,
    promotedAt: new Date().toISOString()
  });
  console.log(`Promoted radio message to memory inbox: ${message.id}`);
}


export function radioArchiveCommand(argv, deps) {
  const config = deps.loadConfig();
  deps.ensureHub(config.memoryDir);
  
  const daysOption = getOption(argv, "--days") || "30";
  const days = parseInt(daysOption, 10);
  if (isNaN(days) || days < 0) {
    throw new Error("Usage: ai-memory-hub radio archive [--days <number>]");
  }
  
  const cutoffTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  console.log(`Archiving radio messages older than ${cutoffTime.toISOString()} (${days} days)...`);
  
  const radioFile = path.join(config.memoryDir, "radio", "messages.jsonl");
  const archiveRadioFile = path.join(config.memoryDir, "radio", "messages-archive.jsonl");
  
  const allMessages = deps.readRadioMessages(config.memoryDir);
  const keepMessages = [];
  const archiveMessages = [];
  
  for (const message of allMessages) {
    const dateStr = message.ts || "";
    if (!dateStr) {
      keepMessages.push(message);
      continue;
    }
    const date = new Date(dateStr);
    if (date < cutoffTime) {
      archiveMessages.push(message);
    } else {
      keepMessages.push(message);
    }
  }
  
  if (archiveMessages.length === 0) {
    console.log("No radio messages found matching the archiving criteria.");
    return;
  }
  
  console.log(`Moving ${archiveMessages.length} message(s) to archive...`);
  
  // Write files
  ensureDir(path.dirname(archiveRadioFile));
  fs.appendFileSync(archiveRadioFile, archiveMessages.map(m => JSON.stringify(m)).join("\n") + "\n", "utf8");
  writeFileAtomic(radioFile, keepMessages.map(m => JSON.stringify(m)).join("\n") + "\n", "utf8");
  
  console.log(`Successfully archived ${archiveMessages.length} radio message(s).`);
  console.log(`Active radio messages left: ${keepMessages.length}.`);
}


