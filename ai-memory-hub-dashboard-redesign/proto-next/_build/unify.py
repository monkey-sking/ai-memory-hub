#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
unify.py — 统一 AMH Plan A 原型套件（proto-next）
1) 用 overview.html 的权威 <style> + 内联 SVG sprite 作为唯一真源，覆盖所有页面的第一段 <style> 与 sprite。
2) 用统一的 16 路由侧栏替换所有页面的 <aside class="sidebar">（真实 href、单一 is-active/aria-current，无 data-todo）。
3) 以 overview.html 为模板克隆出缺失的 4 个页面（skills / extensions / chat / settings），仅替换标题、侧栏激活项、面包屑与 <main> 内容。
保留每页 <main> 的业务内容与可能存在的第二段（页局部）样式。
"""
import re, os, io

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(BASE, "overview.html")

html = open(REF, encoding="utf-8").read()

# ---- 1. 权威 <style>（第一段） ----
m = re.search(r"<style>.*?</style>", html, re.S)
CANONICAL_STYLE = m.group(0)

# ---- 2. 权威 sprite + 追加 6 个缺失图标 ----
sm = re.search(r'<svg width="0" height="0"[^>]*>.*?</svg>', html, re.S)
sprite = m2 = sm.group(0)
NEW_SYMBOLS = """
  <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></symbol>
  <symbol id="i-skills" viewBox="0 0 24 24"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.685a1.026 1.026 0 0 0 .289-.878c-.074-.493.504-.84.968-1.02a2.5 2.5 0 1 1 3.237-3.237c.18.464.527.894 1.02.967a1.026 1.026 0 0 0 .877-.289l1.568-1.568A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84.504.968.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/></symbol>
  <symbol id="i-extensions" viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></symbol>
  <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></symbol>
  <symbol id="i-analytics" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></symbol>
  <symbol id="i-db" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></symbol>
"""
CANONICAL_SPRITE = sprite.replace("</svg>", NEW_SYMBOLS + "</svg>")

# ---- 3. 16 路由表（与 dashboard-next/src/components/Layout.tsx navGroups 对齐）----
ROUTES = [
    ("dashboard",  "overview.html",   "i-overview",   "概览",  "Overview",    None),
    ("tasks",      "tasks.html",      "i-tasks",      "任务",  "Tasks",       "27"),
    ("workflows",  "workflows.html",  "i-flow",       "工作流","Workflows",   None),
    ("memory",     "memory.html",     "i-mem",        "记忆",  "Memory",      "1284"),
    ("radio",      "radio.html",      "i-radio",      "Radio", "Radio",       None),
    ("dispatch",   "dispatch.html",   "i-dispatch",   "调度",  "Dispatch",    None),
    ("tools",      "tools.html",      "i-tools",      "工具",  "Tools",       "15"),
    ("skills",     "skills.html",     "i-skills",     "Skills","Skills",      None),
    ("extensions", "extensions.html", "i-extensions", "扩展",  "Extensions",  None),
    ("chat",       "chat.html",       "i-chat",       "对话",  "Chat",        None),
    ("analytics",  "analytics.html",  "i-analytics",  "分析",  "Analytics",   None),
    ("search",     "search.html",     "i-search",     "搜索",  "Search",      None),
    ("backups",    "backups.html",    "i-db",         "备份",  "Backups",     None),
    ("projects",   "projects.html",   "i-folder",     "项目",  "Projects",    None),
    ("health",     "health.html",     "i-health",     "健康",  "Health",      "3"),
    ("settings",   "settings.html",   "i-settings",   "设置",  "Settings",    None),
]
GROUPS = [
    ("collaboration", "协作", "Collaboration", ["dashboard", "tasks", "workflows", "memory"]),
    ("data",          "数据", "Data",          ["radio", "dispatch", "tools", "skills", "extensions", "chat"]),
    ("system",        "系统", "System",        ["analytics", "search", "backups", "projects", "health", "settings"]),
]
RMAP = {r[0]: r for r in ROUTES}

def build_sidebar(active):
    out = ['<aside class="sidebar">']
    out.append('    <div class="side-head">')
    out.append('      <span class="brand__logo"><svg class="icon"><use href="#i-logo"/></svg></span>')
    out.append('      <span class="brand__txt">')
    out.append('        <span class="brand__name">AI Memory Hub</span>')
    out.append('        <span class="brand__sub">本地协作层</span>')
    out.append('      </span>')
    out.append('    </div>')
    out.append('    <nav class="nav">')
    for gid, zh, en, items in GROUPS:
        out.append(f'      <div class="nav-group" data-group="{gid}">')
        out.append('        <button class="nav-group__head" type="button">')
        out.append('          <svg class="nav-group__caret icon"><use href="#i-chev-down"/></svg>')
        out.append(f'          <span>{zh}</span>')
        out.append(f'          <span class="nav-group__count">{len(items)}</span>')
        out.append('        </button>')
        out.append('        <div class="nav-list">')
        for key in items:
            _, file, icon, z, e, badge = RMAP[key]
            is_a = (key == active)
            cls = "nav-item is-active" if is_a else "nav-item"
            ac = ' aria-current="page"' if is_a else ""
            badge_html = f'<span class="nav-item__badge">{badge}</span>' if badge else ""
            out.append(f'          <a class="{cls}" href="{file}"{ac}><svg class="nav-item__icon icon"><use href="#{icon}"/></svg><span class="nav-item__txt">{e}</span>{badge_html}</a>')
        out.append('        </div>')
        out.append('      </div>')
    out.append('    </nav>')
    out.append('  </aside>')
    return "\n".join(out)

# ---- 4. 现有 12 页：仅替换 style / sprite / sidebar ----
existing = [r[1] for r in ROUTES]  # 16 个目标文件名（含缺失的 4 个，稍后单独生成）

for key, file, *_ in ROUTES:
    path = os.path.join(BASE, file)
    if not os.path.exists(path):
        continue  # 缺失页稍后处理
    t = open(path, encoding="utf-8").read()
    t = re.sub(r"<style>.*?</style>", CANONICAL_STYLE, t, flags=re.S, count=1)
    t = re.sub(r'<svg width="0" height="0"[^>]*>.*?</svg>', CANONICAL_SPRITE, t, flags=re.S, count=1)
    t = re.sub(r"<aside class=\"sidebar\">.*?</aside>", build_sidebar(key), t, flags=re.S, count=1)
    open(path, "w", encoding="utf-8").write(t)
    print("unified:", file)

# ---- 5. 缺失的 4 页：克隆 overview 后替换 ----
NEW_MAIN = {
"skills": '''    <main class="content">
      <div class="banner banner--info" role="alert">
        <svg class="banner__icon icon"><use href="#i-info"/></svg>
        <div class="banner__body">
          <div class="banner__title">导入前将进行安全审计</div>
          <div class="banner__desc">从 SkillHub 或本地目录导入的技能会经由 amh-skill-import-gate 扫描，P0 风险默认拦截并提示确认。</div>
        </div>
        <button class="banner__x" aria-label="关闭"><svg class="icon icon--sm"><use href="#i-x"/></svg></button>
      </div>

      <header class="page-head">
        <div>
          <h1 class="ttl">Skills</h1>
          <p class="sub">已安装的智能体技能与可导入的能力包</p>
        </div>
        <div class="page-head__ctrls">
          <button class="btn btn--primary"><svg class="icon"><use href="#i-plus"/></svg>导入技能</button>
          <button class="btn btn--secondary"><svg class="icon"><use href="#i-refresh"/></svg>刷新</button>
        </div>
      </header>

      <section class="metrics" aria-label="关键指标">
        <article class="metric"><div class="metric__top"><span class="metric__label">已安装</span><svg class="metric__icon icon"><use href="#i-skills"/></svg></div><div class="metric__value">38</div><div class="metric__foot"><span class="metric__note">跨 6 个 runner 共享</span></div></article>
        <article class="metric"><div class="metric__top"><span class="metric__label">启用中</span><svg class="metric__icon icon"><use href="#i-check"/></svg></div><div class="metric__value">31</div><div class="metric__foot"><span class="delta delta--good">▲ 2</span><span class="metric__note">本周</span></div></article>
        <article class="metric"><div class="metric__top"><span class="metric__label">待审</span><svg class="metric__icon icon"><use href="#i-warn"/></svg></div><div class="metric__value">2</div><div class="metric__foot"><span class="metric__note">等待安全门</span></div></article>
        <article class="metric"><div class="metric__top"><span class="metric__label">警告</span><svg class="metric__icon icon"><use href="#i-warn"/></svg></div><div class="metric__value">1</div><div class="metric__foot"><span class="metric__note">版本过低</span></div></article>
      </section>

      <section class="card">
        <div class="toolbar">
          <div class="search--sm"><svg class="icon"><use href="#i-search"/></svg><input type="text" placeholder="按名称或来源筛选…" aria-label="筛选技能"/></div>
          <div class="select"><svg class="icon"><use href="#i-chev-down"/></svg>全部来源</div>
          <div class="spacer"></div>
          <span class="toolbar__count">38 项</span>
        </div>
        <div class="table-wrap">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>技能</th><th>来源</th><th>版本</th><th>状态</th><th>最近调用</th><th class="c-cell"></th></tr></thead>
              <tbody>
                <tr><td class="id-cell">ai-memory-hub</td><td>local</td><td class="mono-cell">1.0</td><td><span class="badge badge--success">启用</span></td><td class="muted">2 分钟前</td><td class="c-cell"><button class="row-toggle" aria-label="更多"><svg class="icon icon--sm"><use href="#i-chev-right"/></svg></button></td></tr>
                <tr><td class="id-cell">pdf</td><td>builtin</td><td class="mono-cell">0.3</td><td><span class="badge badge--success">启用</span></td><td class="muted">11 分钟前</td><td class="c-cell"><button class="row-toggle" aria-label="更多"><svg class="icon icon--sm"><use href="#i-chev-right"/></svg></button></td></tr>
                <tr><td class="id-cell">feishu-visual-delivery</td><td>connector</td><td class="mono-cell">2.1</td><td><span class="badge badge--neutral">禁用</span></td><td class="muted">3 小时前</td><td class="c-cell"><button class="row-toggle" aria-label="更多"><svg class="icon icon--sm"><use href="#i-chev-right"/></svg></button></td></tr>
                <tr><td class="id-cell">minimax-docx</td><td>marketplace</td><td class="mono-cell">0.9</td><td><span class="badge badge--warning">待审</span></td><td class="muted">—</td><td class="c-cell"><button class="row-toggle" aria-label="更多"><svg class="icon icon--sm"><use href="#i-chev-right"/></svg></button></td></tr>
                <tr><td class="id-cell">tencent-pptx</td><td>builtin</td><td class="mono-cell">0.1</td><td><span class="badge badge--error">警告</span></td><td class="muted">1 天前</td><td class="c-cell"><button class="row-toggle" aria-label="更多"><svg class="icon icon--sm"><use href="#i-chev-right"/></svg></button></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="pager"><span>第 1 / 8 页</span><div class="spacer"></div><div class="pages"><button class="pbtn">‹</button><button class="pbtn on">1</button><button class="pbtn">2</button><button class="pbtn">›</button></div></div>
      </section>
    </main>''',

"extensions": '''    <main class="content">
      <header class="page-head">
        <div>
          <h1 class="ttl">Extensions</h1>
          <p class="sub">连接外部应用、服务与 MCP 能力</p>
        </div>
        <div class="page-head__ctrls">
          <button class="btn btn--primary"><svg class="icon"><use href="#i-plus"/></svg>浏览市场</button>
        </div>
      </header>

      <section class="cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--section-gap);max-width:1440px;margin:0 auto;">
        <article class="card" style="padding:var(--card-pad);display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;"><span class="brand__logo" style="width:34px;height:34px;"><svg class="icon"><use href="#i-chat"/></svg></span><div><div style="color:var(--ink-1);font-weight:600;">飞书</div><div class="muted" style="font-size:12px;">即时通讯 / 文档</div></div></div>
          <p class="muted" style="font-size:12.5px;">收发消息、读写云文档与多维表格，已注册为 workbuddy 连接器。</p>
          <div style="display:flex;align-items:center;gap:8px;margin-top:auto;"><span class="badge badge--success">已连接</span><button class="btn btn--ghost btn--xs" style="margin-left:auto;">配置</button></div>
        </article>
        <article class="card" style="padding:var(--card-pad);display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;"><span class="brand__logo" style="width:34px;height:34px;background:var(--bg-raised);border:1px solid var(--border);"><svg class="icon"><use href="#i-extensions"/></svg></span><div><div style="color:var(--ink-1);font-weight:600;">MasterGo</div><div class="muted" style="font-size:12px;">设计交付</div></div></div>
          <p class="muted" style="font-size:12.5px;">莫高设计画板同步与 D2C 代码获取，当前处于已连接状态。</p>
          <div style="display:flex;align-items:center;gap:8px;margin-top:auto;"><span class="badge badge--success">已连接</span><button class="btn btn--ghost btn--xs" style="margin-left:auto;">配置</button></div>
        </article>
        <article class="card" style="padding:var(--card-pad);display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;"><span class="brand__logo" style="width:34px;height:34px;background:var(--bg-raised);border:1px solid var(--border);"><svg class="icon"><use href="#i-db"/></svg></span><div><div style="color:var(--ink-1);font-weight:600;">GitHub</div><div class="muted" style="font-size:12px;">代码仓库</div></div></div>
          <p class="muted" style="font-size:12.5px;">私有仓库读写与 PR 流程，连接器当前未授权。</p>
          <div style="display:flex;align-items:center;gap:8px;margin-top:auto;"><span class="badge badge--neutral">未连接</span><button class="btn btn--secondary btn--xs" style="margin-left:auto;">连接</button></div>
        </article>
        <article class="card" style="padding:var(--card-pad);display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;"><span class="brand__logo" style="width:34px;height:34px;background:var(--bg-raised);border:1px solid var(--border);"><svg class="icon"><use href="#i-extensions"/></svg></span><div><div style="color:var(--ink-1);font-weight:600;">妙搭 Spark</div><div class="muted" style="font-size:12px;">应用搭建</div></div></div>
          <p class="muted" style="font-size:12.5px;">低代码应用创建与云端托管，未连接。</p>
          <div style="display:flex;align-items:center;gap:8px;margin-top:auto;"><span class="badge badge--neutral">未连接</span><button class="btn btn--secondary btn--xs" style="margin-left:auto;">连接</button></div>
        </article>
      </section>
    </main>''',

"chat": '''    <main class="content">
      <header class="page-head">
        <div>
          <h1 class="ttl">Chat</h1>
          <p class="sub">与已接入的 runner 进行对话</p>
        </div>
      </header>

      <section class="split" style="min-height:60vh;">
        <div class="card" style="display:flex;flex-direction:column;overflow:hidden;">
          <div class="card__head"><div class="ttl">对话</div><span class="sub">claude · 会话 #a1f</span></div>
          <div style="display:flex;flex-direction:column;gap:14px;padding:var(--card-pad);overflow-y:auto;">
            <div style="display:flex;gap:10px;"><span class="brand__logo" style="width:26px;height:26px;flex:none;"><svg class="icon"><use href="#i-logo"/></svg></span><div style="background:var(--bg-sunk);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 12px;color:var(--ink-2);font-size:13px;max-width:80%;">帮我汇总今天 AMH 的跨 agent 记忆变更。</div></div>
            <div style="display:flex;gap:10px;justify-content:flex-end;"><div style="background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:var(--radius-md);padding:10px 12px;color:var(--ink-1);font-size:13px;max-width:80%;">今日新增 14 条 durable memory，其中 9 条来自 codex，覆盖调度策略与工具连接状态。已写入 inbox 并完成去重。</div></div>
            <div style="display:flex;gap:10px;"><span class="brand__logo" style="width:26px;height:26px;flex:none;"><svg class="icon"><use href="#i-logo"/></svg></span><div style="background:var(--bg-sunk);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 12px;color:var(--ink-2);font-size:13px;max-width:80%;">把备份任务的失败原因也记一下。</div></div>
          </div>
          <div style="display:flex;gap:8px;padding:var(--card-pad);border-top:1px solid var(--border);">
            <input type="text" placeholder="输入消息…" aria-label="消息输入" style="flex:1;height:var(--control-h);background:var(--bg-sunk);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--ink-1);padding:0 12px;font:400 13px var(--font-sans);"/>
            <button class="btn btn--primary"><svg class="icon"><use href="#i-play"/></svg>发送</button>
          </div>
        </div>
        <aside class="card" style="padding:var(--card-pad);display:flex;flex-direction:column;gap:8px;">
          <div class="subhead">Runner</div>
          <a class="nav-item is-active" href="#"><svg class="nav-item__icon icon"><use href="#i-logo"/></svg><span class="nav-item__txt">claude</span><span class="dot" style="--c:var(--success)"></span></a>
          <a class="nav-item" href="#"><svg class="nav-item__icon icon"><use href="#i-logo"/></svg><span class="nav-item__txt">gemini</span><span class="dot" style="--c:var(--success)"></span></a>
          <a class="nav-item" href="#"><svg class="nav-item__icon icon"><use href="#i-logo"/></svg><span class="nav-item__txt">opencode</span><span class="dot" style="--c:var(--ink-4)"></span></a>
          <a class="nav-item" href="#"><svg class="nav-item__icon icon"><use href="#i-logo"/></svg><span class="nav-item__txt">codex</span><span class="dot" style="--c:var(--warning)"></span></a>
        </aside>
      </section>
    </main>''',

"settings": '''    <main class="content">
      <header class="page-head">
        <div>
          <h1 class="ttl">Settings</h1>
          <p class="sub">外观、连接与数据管理</p>
        </div>
      </header>

      <section class="card" style="padding:var(--card-pad);display:flex;flex-direction:column;gap:18px;max-width:1440px;margin:0 auto;">
        <div class="subhead">外观</div>
        <div class="detail-kv" style="align-items:center;"><span class="k" style="min-width:120px;">主题</span><div class="seg" role="tablist"><button class="is-active" type="button">深色</button><button type="button">浅色</button></div></div>
        <div class="detail-kv" style="align-items:center;"><span class="k" style="min-width:120px;">密度</span><div class="seg" role="tablist"><button class="is-active" type="button">紧凑</button><button type="button">舒适</button></div></div>
        <div class="detail-kv" style="align-items:center;"><span class="k" style="min-width:120px;">语言</span><div class="seg" role="tablist"><button class="is-active" type="button">中文</button><button type="button">EN</button></div></div>
      </section>

      <section class="card" style="padding:var(--card-pad);display:flex;flex-direction:column;gap:14px;max-width:1440px;margin:0 auto;">
        <div class="subhead">后端连接</div>
        <div style="display:flex;align-items:center;gap:10px;"><span class="conn"><span class="dot"></span><span>已连接</span></span><code class="mono" style="color:var(--link);">http://127.0.0.1:38787</code><button class="btn btn--secondary btn--xs" style="margin-left:auto;">重连</button></div>
        <p class="muted" style="font-size:12.5px;">WebSocket 实时通道用于 radio 事件流与调度信号，断开时页面回退到轮询。</p>
      </section>

      <section class="card" style="padding:var(--card-pad);display:flex;flex-direction:column;gap:14px;max-width:1440px;margin:0 auto;">
        <div class="subhead">数据</div>
        <div style="display:flex;align-items:center;gap:10px;"><span style="color:var(--ink-2);font-size:13px;">记忆留存</span><span class="select"><svg class="icon"><use href="#i-chev-down"/></svg>90 天</span></div>
        <div style="display:flex;align-items:center;gap:10px;"><button class="btn btn--ghost"><svg class="icon"><use href="#i-trash"/></svg>清理本地缓存</button><button class="btn btn--danger btn--xs" style="margin-left:auto;">重置全部设置</button></div>
      </section>
    </main>''',
}

NEW_TITLE = {
    "skills": "Skills · AI Memory Hub",
    "extensions": "Extensions · AI Memory Hub",
    "chat": "Chat · AI Memory Hub",
    "settings": "Settings · AI Memory Hub",
}
NEW_CRUMB = {
    "skills": ("数据", "Skills"),
    "extensions": ("数据", "Extensions"),
    "chat": ("数据", "Chat"),
    "settings": ("系统", "Settings"),
}

for key in ["skills", "extensions", "chat", "settings"]:
    t = open(REF, encoding="utf-8").read()
    t = re.sub(r"<title>.*?</title>", f"<title>{NEW_TITLE[key]}</title>", t, count=1)
    # 侧栏用新激活项
    t = re.sub(r"<style>.*?</style>", CANONICAL_STYLE, t, flags=re.S, count=1)
    t = re.sub(r'<svg width="0" height="0"[^>]*>.*?</svg>', CANONICAL_SPRITE, t, flags=re.S, count=1)
    t = re.sub(r"<aside class=\"sidebar\">.*?</aside>", build_sidebar(key), t, flags=re.S, count=1)
    # 面包屑
    zh, en = NEW_CRUMB[key]
    t = re.sub(r'<nav class="crumbs">.*?</nav>', f'<nav class="crumbs"><span>{zh}</span><span class="sep">/</span><span class="cur">{en}</span></nav>', t, flags=re.S, count=1)
    # 整段 <main>
    t = re.sub(r'<main class="content">.*?</main>', NEW_MAIN[key], t, flags=re.S, count=1)
    open(os.path.join(BASE, RMAP[key][1]), "w", encoding="utf-8").write(t)
    print("created:", RMAP[key][1])

print("DONE")
