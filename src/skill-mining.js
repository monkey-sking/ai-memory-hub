import crypto from "node:crypto";

const DURABLE_HINTS = /correction|lesson|rule|always|never|must|should|纠错|教训|规则|必须|不要|以后|注意/i;

function candidateId(taskId, text) {
  return `skill-candidate:${crypto.createHash("sha1").update(`${taskId}:${text}`).digest("hex").slice(0, 16)}`;
}

export function mineSkillCandidates(task = {}) {
  const taskId = String(task.id || "");
  if (!taskId) return [];

  const seen = new Set();
  return (Array.isArray(task.notes) ? task.notes : [])
    .map((note) => ({
      by: String(note?.by || "unknown"),
      text: String(note?.text || "").trim()
    }))
    .filter((note) => note.text.length >= 20)
    .filter((note) => DURABLE_HINTS.test(note.text))
    .filter((note) => !/^completed by /i.test(note.text))
    .filter((note) => {
      if (seen.has(note.text)) return false;
      seen.add(note.text);
      return true;
    })
    .map((note) => ({
      id: candidateId(taskId, note.text),
      createdAt: new Date().toISOString(),
      status: "pending",
      sourceTaskId: taskId,
      sourceProject: String(task.project || ""),
      sourceAuthor: note.by,
      sourceTitle: String(task.title || ""),
      text: note.text,
      evidence: { taskId, noteBy: note.by }
    }));
}

export function applyCandidateDecision(candidate, decision, reviewedAt = new Date().toISOString()) {
  const status = decision?.status === "approved" ? "approved" : "rejected";
  return {
    ...candidate,
    status,
    reviewedBy: String(decision?.reviewer || "unknown"),
    reviewedAt,
    reviewNote: String(decision?.note || "")
  };
}
