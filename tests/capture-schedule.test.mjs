import assert from "node:assert/strict";
import test from "node:test";
import { buildCaptureSchedulePlist } from "../src/commands/capture.js";

// 定时捕获靠 launchd 的 StartInterval 定时拉起 `capture scan --sync`。
// 这里只测 plist 生成（纯函数）——本机 launchctl 在沙箱里写不了 launchd 域，
// 真正的装载要用户在自己的终端执行，或等下次登录由 LaunchAgents 自动加载。

test("buildCaptureSchedulePlist wires the periodic capture command", () => {
  const plist = buildCaptureSchedulePlist({
    intervalMinutes: 15,
    limit: 50,
    logPath: "/tmp/ai-memory-hub-capture.log"
  });

  assert.match(plist, /<key>Label<\/key>\s*<string>com\.ai-memory-hub\.capture<\/string>/);
  // 间隔按秒写进 plist。
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>900<\/integer>/);
  // 拉起的正是 scan --sync，且带上 limit。
  assert.match(plist, /<string>capture<\/string>\s*<string>scan<\/string>/);
  assert.match(plist, /<string>--limit<\/string>\s*<string>50<\/string>/);
  assert.match(plist, /<string>--sync<\/string>/);
  assert.match(plist, /\/tmp\/ai-memory-hub-capture\.log/);
  // 登录即启，不必等到第一个间隔。
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  // launchd 不继承登录 shell 的 PATH，得自己给。
  assert.match(plist, /<key>PATH<\/key>/);
  assert.ok(plist.startsWith("<?xml version=\"1.0\""));
});

test("buildCaptureSchedulePlist honours a custom interval and escapes the log path", () => {
  const plist = buildCaptureSchedulePlist({ intervalMinutes: 5, limit: 10, logPath: "/tmp/a&b.log" });
  assert.match(plist, /<integer>300<\/integer>/);
  assert.match(plist, /<string>--limit<\/string>\s*<string>10<\/string>/);
  // XML 特殊字符必须转义，否则 plist 解析失败。
  assert.match(plist, /\/tmp\/a&amp;b\.log/);
  assert.ok(!plist.includes("/tmp/a&b.log"));
});
