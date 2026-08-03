import { asArray, asRecord, textOf } from '../lib/api'

type Props = {
  agentSessions: unknown
  worktrees: unknown
  timeline: unknown
  collaboration: unknown
  language: 'zh' | 'en'
  onMarkRead: (id: string) => Promise<void>
}

export function AgentExecutionPanel({ agentSessions, worktrees, timeline, collaboration, language, onMarkRead }: Props) {
  const sessions = asArray<Record<string, unknown>>(agentSessions)
  const trees = asArray<Record<string, unknown>>(worktrees)
  const events = asArray<Record<string, unknown>>(timeline).slice(0, 8)
  const collaborationModel = asRecord(collaboration)
  const unread = asArray<Record<string, unknown>>(collaborationModel.unread).slice(0, 4)
  const reviews = asArray<Record<string, unknown>>(collaborationModel.reviews)
  const zh = language === 'zh'
  return (
    <section className="agent-execution-panel" aria-label={zh ? 'Agent 执行中心' : 'Agent execution center'}>
      <div className="agent-execution-heading">
        <div>
          <p className="eyebrow">{zh ? '执行舱' : 'EXECUTION COCKPIT'}</p>
          <h3>{zh ? 'Agent 正在做什么' : 'What agents are doing'}</h3>
        </div>
        <span className="agent-execution-count">{sessions.length} {zh ? '个会话' : 'sessions'}</span>
      </div>
      <div className="agent-collaboration-strip">
        <div><strong>{zh ? '待处理' : 'Needs attention'}</strong><span>{unread.length} unread · {reviews.length} {zh ? '个审查' : 'reviews'}</span></div>
        {unread.length ? <div className="agent-unread-list">{unread.map(item => <button type="button" key={textOf(item.id)} onClick={() => void onMarkRead(textOf(item.id))}>{textOf(item.title, 'notification')}: {textOf(item.text, '')} · {zh ? '标为已读' : 'mark read'}</button>)}</div> : null}
      </div>
      {sessions.length ? (
        <div className="agent-card-grid">
          {sessions.slice(0, 6).map(session => {
            const task = asRecord(session.task)
            const worktree = asRecord(session.worktree)
            return (
              <article className="agent-card" key={textOf(session.id)}>
                <div className="agent-card-topline">
                  <span className={`agent-state agent-state-${textOf(session.state, 'idle')}`}>{stateLabel(textOf(session.state), zh)}</span>
                  <strong>{textOf(session.agent, 'unknown')}</strong>
                </div>
                <p className="agent-card-title">{textOf(session.title, textOf(task.title, 'Untitled session'))}</p>
                <dl className="agent-card-meta">
                  <div><dt>{zh ? '任务' : 'Task'}</dt><dd>{textOf(task.id, '—').slice(0, 12)}</dd></div>
                  <div><dt>{zh ? '工作树' : 'Worktree'}</dt><dd>{textOf(worktree.branch, textOf(worktree.path, '—'))}</dd></div>
                  <div><dt>{zh ? '进度' : 'Progress'}</dt><dd>{textOf(asRecord(session.progress).status, textOf(session.state, 'idle'))}</dd></div>
                </dl>
              </article>
            )
          })}
        </div>
      ) : <p className="agent-execution-empty">{zh ? '暂无 Agent 会话，等待 dispatch 或 heartbeat。' : 'No agent sessions yet. Waiting for dispatch or heartbeat.'}</p>}
      <div className="agent-execution-lower-grid">
        <div>
          <h4>{zh ? '统一时间线' : 'Unified timeline'}</h4>
          <div className="agent-timeline">
            {events.length ? events.map(event => (
              <div className="agent-timeline-row" key={textOf(event.id)}>
                <span className="agent-timeline-dot" />
                <div><strong>{textOf(event.agent, 'unknown')}</strong> · {textOf(event.kind)} <span>{textOf(event.text, textOf(event.state))}</span></div>
              </div>
            )) : <p className="agent-execution-empty">{zh ? '暂无活动事件。' : 'No activity yet.'}</p>}
          </div>
        </div>
        <div>
          <h4>{zh ? '工作树审查' : 'Worktree review'}</h4>
          {trees.length ? trees.slice(0, 4).map(tree => (
            <div className="worktree-review-row" key={textOf(tree.id)}>
              <span className={tree.reviewReady ? 'review-ready' : 'review-blocked'}>{tree.reviewReady ? '✓' : '!'}</span>
              <div><strong>{textOf(tree.branch, textOf(tree.path))}</strong><small>{tree.reviewReady ? (zh ? '可审查' : 'Ready for review') : textOf(asArray(tree.reviewBlockers).join(', '), 'Blocked')}</small></div>
            </div>
          )) : <p className="agent-execution-empty">{zh ? '暂无工作树。' : 'No worktrees.'}</p>}
        </div>
      </div>
    </section>
  )
}

function stateLabel(state: string, zh: boolean) {
  if (!zh) return state || 'idle'
  return ({ working: '工作中', idle: '空闲', blocked: '阻塞', waiting_review: '待审查', done: '完成', failed: '失败', stale: '已过期' } as Record<string, string>)[state] || state || '空闲'
}

