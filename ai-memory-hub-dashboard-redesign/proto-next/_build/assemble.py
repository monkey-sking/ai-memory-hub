# -*- coding: utf-8 -*-
"""
从 overview.html 逐字克隆 <head>（含 :root 令牌与主题/密度脚本）、SVG 雪碧图、
侧栏 <aside>、顶栏 <header>，仅替换：<title> / 面包屑 / 侧栏激活项 / <main> 内容 / Toast 文案。
追加各路由的局部 <style>（不修改任何全局 token）。
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'overview.html')

with io.open(SRC, encoding='utf-8') as f:
    base = f.read()

MAIN_OPEN = '    <main class="content">\n'
MAIN_CLOSE = '\n    </main>'
assert MAIN_OPEN in base and MAIN_CLOSE in base

head_shell, rest = base.split(MAIN_OPEN, 1)
_old_main, tail_shell = rest.split(MAIN_CLOSE, 1)

OLD_TITLE = '<title>总览监控 · AI Memory Hub</title>'
OLD_CRUMB = ('<nav class="crumbs"><span>总览监控</span><span class="sep">/</span>'
             '<span class="cur">Overview</span></nav>')
assert OLD_TITLE in head_shell and OLD_CRUMB in head_shell

# 侧栏：为本批次实现的 3 个路由挂上真实 href（其余保持 overview.html 原状）
LINKED = [
    ('i-health', 'Health', 'health.html'),
    ('i-dispatch', 'Dispatch', 'dispatch.html'),
    ('i-folder', 'Projects', 'projects.html'),
]

ROUTES = {
    'dispatch': dict(
        title='调度 · AI Memory Hub',
        crumb=('<nav class="crumbs"><span>任务协作</span><span class="sep">/</span>'
               '<span class="cur">Dispatch</span></nav>'),
        active='dispatch.html',
        toast_kind='success', toast_icon='i-check',
        toast_title='已手动触发 code-index',
        toast_body='调度 <code>sch_0e41</code> 已入队 · 预计 8s 内开始 · 14:32',
        note='定调页 03 / Dispatch（调度队列）',
    ),
    'projects': dict(
        title='项目 · AI Memory Hub',
        crumb=('<nav class="crumbs"><span>任务协作</span><span class="sep">/</span>'
               '<span class="cur">Projects</span></nav>'),
        active='projects.html',
        toast_kind='info', toast_icon='i-info',
        toast_title='目录扫描完成',
        toast_body='发现 6 个项目 · 新增 0 · 记忆归属已刷新 · 14:30',
        note='定调页 04 / Projects（项目命名空间）',
    ),
    'health': dict(
        title='健康 · AI Memory Hub',
        crumb=('<nav class="crumbs"><span>总览监控</span><span class="sep">/</span>'
               '<span class="cur">Health</span></nav>'),
        active='health.html',
        toast_kind='warning', toast_icon='i-warn',
        toast_title='索引器仍未恢复',
        toast_body='已连续 4 次探测超时 · 向量重建暂停 · 14:31',
        note='定调页 05 / Health（健康检查）',
    ),
}


def build(route, cfg):
    head = head_shell

    # 1) 标题
    head = head.replace(OLD_TITLE, '<title>%s</title>' % cfg['title'], 1)

    # 2) 文件头注释（标注所用设计系统）
    head = head.replace(
        'AI Memory Hub Dashboard · 定调页 01 / Overview（总览监控）',
        'AI Memory Hub Dashboard · %s' % cfg['note'], 1)

    # 3) 追加局部样式（全局 token 与基件保持逐字一致，未做任何覆盖）
    with io.open(os.path.join(HERE, route + '.css'), encoding='utf-8') as f:
        page_css = f.read().rstrip() + '\n'
    head = head.replace('</style>\n</head>', '</style>\n<style>\n%s</style>\n</head>' % page_css, 1)

    # 4) 面包屑
    head = head.replace(OLD_CRUMB, cfg['crumb'], 1)

    # 5) 侧栏：解绑 overview 激活态 → 为已实现路由挂 href → 设当前项激活
    head = head.replace('<a class="nav-item is-active" href="overview.html">',
                        '<a class="nav-item" href="overview.html">', 1)
    for icon, label, href in LINKED:
        old = ('<a class="nav-item" href="#" data-todo><svg class="nav-item__icon icon">'
               '<use href="#%s"/></svg><span class="nav-item__txt">%s</span>' % (icon, label))
        new = ('<a class="nav-item" href="%s"><svg class="nav-item__icon icon">'
               '<use href="#%s"/></svg><span class="nav-item__txt">%s</span>' % (href, icon, label))
        assert old in head, 'sidebar anchor not found: %s' % label
        head = head.replace(old, new, 1)
    act_old = '<a class="nav-item" href="%s">' % cfg['active']
    act_new = '<a class="nav-item is-active" aria-current="page" href="%s">' % cfg['active']
    assert act_old in head
    head = head.replace(act_old, act_new, 1)

    # 6) 主区内容
    with io.open(os.path.join(HERE, route + '.part'), encoding='utf-8') as f:
        main_html = f.read().rstrip('\n') + '\n'

    # 7) Toast 文案（结构保持不变）
    tail = tail_shell
    tail = tail.replace('<!-- Toast（info 语义，左 3px 边） -->',
                        '<!-- Toast（%s 语义，左 3px 边） -->' % cfg['toast_kind'], 1)
    tail = tail.replace('class="toast toast--info"', 'class="toast toast--%s"' % cfg['toast_kind'], 1)
    tail = tail.replace('<use href="#i-info"/></svg><strong>已同步本地缓存</strong>',
                        '<use href="#%s"/></svg><strong>%s</strong>' % (cfg['toast_icon'], cfg['toast_title']), 1)
    tail = tail.replace('<p>记忆索引已更新 · 1,284 条 · 14:31</p>',
                        '<p>%s</p>' % cfg['toast_body'], 1)

    out = head + MAIN_OPEN + main_html + MAIN_CLOSE + tail
    dest = os.path.join(ROOT, route + '.html')
    with io.open(dest, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    return dest, len(out)


for route, cfg in ROUTES.items():
    dest, n = build(route, cfg)
    print('wrote %-14s %7d bytes' % (os.path.basename(dest), n))
