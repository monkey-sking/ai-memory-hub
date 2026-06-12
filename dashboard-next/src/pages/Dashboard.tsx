import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AnyRecord } from '../lib/api'
import { apiDelete, apiGet, apiPatch, apiPost, asArray, asRecord, boolOf, numberOf, textOf } from '../lib/api'
import type { AppLanguage, AppOutletContext } from '../lib/i18n'
import './Dashboard.css'

export type DashboardSection =
  | 'overview'
  | 'memory'
  | 'tasks'
  | 'radio'
  | 'dispatch'
  | 'workflows'
  | 'analytics'
  | 'backups'
  | 'search'
  | 'tools'
  | 'projects'
  | 'health'
  | 'settings'

type Language = AppLanguage

interface DashboardProps {
  section: DashboardSection
}

interface DashboardSnapshot {
  status?: AnyRecord
  metrics?: AnyRecord
  memory?: AnyRecord
  radio?: AnyRecord
  tasks?: AnyRecord
  workflows?: AnyRecord
  projects?: AnyRecord
  dispatch?: AnyRecord
  tools?: AnyRecord
  backups?: AnyRecord
  settings?: AnyRecord
}

const titles: Record<Language, Record<DashboardSection, string>> = {
  zh: {
    overview: '概览',
    memory: '共享记忆',
    tasks: '任务',
    radio: 'Agent Radio',
    dispatch: '调度',
    workflows: '工作流',
    analytics: '分析',
    backups: '备份',
    search: '搜索',
    tools: '工具',
    projects: '项目',
    health: '健康',
    settings: '设置'
  },
  en: {
    overview: 'Overview',
    memory: 'Memory',
    tasks: 'Tasks',
    radio: 'Agent Radio',
    dispatch: 'Dispatch',
    workflows: 'Workflows',
    analytics: 'Analytics',
    backups: 'Backups',
    search: 'Search',
    tools: 'Tools',
    projects: 'Projects',
    health: 'Health',
    settings: 'Settings'
  }
}

const subtitles: Record<Language, Record<DashboardSection, string>> = {
  zh: {
    overview: '本地多 Agent 协作状态',
    memory: 'MEMORY.md 快照与待同步事件',
    tasks: '共享任务队列和执行状态',
    radio: '跨工具消息与审核请求',
    dispatch: '自动派发、重试和运行记录',
    workflows: 'Planner / Executor / Reviewer 协作链路',
    analytics: '记忆、任务、Radio 和 Relay 的趋势概览',
    backups: '备份集、文件浏览和恢复预览',
    search: '跨记忆、任务、Radio、工作流的全局检索',
    tools: '工具接入、能力注册表和运行状态',
    projects: '项目注册表与可见项目',
    health: '记忆、存储和运行健康检查',
    settings: 'Dashboard 运行偏好'
  },
  en: {
    overview: 'Local multi-agent collaboration status',
    memory: 'MEMORY.md snapshot and pending events',
    tasks: 'Shared task queue and execution state',
    radio: 'Cross-tool messages and review requests',
    dispatch: 'Automation dispatch, retries, and run records',
    workflows: 'Planner / executor / reviewer coordination',
    analytics: 'Memory, tasks, radio, and relay analytics',
    backups: 'Backup sets, file browser, and restore preview',
    search: 'Global search across memory, tasks, radio, and workflows',
    tools: 'Tool connectivity, capabilities, and runner health',
    projects: 'Project registry and visible projects',
    health: 'Memory, storage, and runtime diagnostics',
    settings: 'Dashboard runtime preferences'
  }
}

const labels = {
  zh: {
    refresh: '刷新',
    refreshing: '刷新中',
    language: 'English',
    connectionError: '无法连接本地 hub',
    noData: '暂无数据',
    totalTasks: '任务总数',
    activeTasks: '活跃任务',
    workflows: '工作流',
    relayRate: 'Relay 成功率',
    toolsReady: '可自动执行工具',
    memoryRecords: '记忆记录',
    pendingEvents: '待同步事件',
    recentTasks: '最近任务',
    recentRadio: '最近消息',
    toolReadiness: '工具状态',
    toolInventory: '工具清单',
    toolName: '工具',
    toolDetail: '详情',
    recentFailures: '最近失败',
    status: '状态',
    project: '项目',
    owner: '负责人',
    title: '标题',
    updated: '更新时间',
    from: '来自',
    to: '发往',
    type: '类型',
    message: '内容',
    workflowTitle: '工作流',
    role: '角色',
    mode: '模式',
    health: '健康',
    installed: '已安装',
    runnable: '可执行',
    configured: '已配置',
    capability: '能力',
    visibleProjects: '可见项目',
    unregisteredProjects: '未注册引用',
    theme: '主题',
    autoRefresh: '自动刷新',
    notifications: '通知',
    refreshInterval: '刷新间隔',
    memorySnapshot: '记忆快照',
    profile: '用户配置',
    dispatchThreads: 'Relay 线程',
    dispatchLogs: '运行日志',
    settingsPanel: '运行偏好',
    yes: '是',
    no: '否',
    syncInbox: '同步 Inbox',
    rebuildSnapshot: '重建快照',
    running: '执行中',
    recordMemory: '记录记忆',
    memoryText: '记忆内容',
    kind: '类型',
    source: '来源',
    save: '保存',
    addTask: '新增任务',
    description: '描述',
    handoff: '交接',
    priority: '优先级',
    allProjects: '全部项目',
    allPriorities: '全部优先级',
    open: '待处理',
    active: '进行中',
    completed: '已完成',
    claim: '认领',
    start: '开始',
    block: '阻塞',
    unblock: '解除阻塞',
    complete: '完成',
    reopen: '重开',
    approve: '通过',
    reject: '拒绝',
    addNote: '添加备注',
    notePlaceholder: '备注或状态原因',
    broadcastMessage: '发送 Radio',
    searchText: '搜索文本',
    allSenders: '全部发送方',
    allRecipients: '全部接收方',
    allTypes: '全部类型',
    promoteToMemory: '提升为记忆',
    triggerDispatch: '立即触发调度',
    forceDispatch: '强制执行',
    limit: '数量',
    created: '创建时间',
    assignee: '执行人',
    notes: '备注',
    review: '审核',
    clear: '清空',
    cancel: '取消',
    analyticsOverview: '分析概览',
    tasksByStatus: '任务状态分布',
    radioByType: 'Radio 类型分布',
    relayByState: 'Relay 状态分布',
    toolAutomation: '工具自动化',
    missing: '缺失',
    backupStorage: '备份存储',
    topProjects: '项目排行',
    globalSearch: '全局搜索',
    searchPlaceholder: '搜索记忆、任务、Radio 或工作流',
    resultCount: '结果数',
    elapsed: '耗时',
    range: '时间范围',
    sort: '排序',
    relevance: '相关性',
    newest: '最新',
    oldest: '最早',
    allRanges: '全部时间',
    last24h: '24 小时',
    last7d: '7 天',
    last30d: '30 天',
    last90d: '90 天',
    facets: '筛选维度',
    tags: '标签',
    results: '结果',
    score: '分数',
    backupSets: '备份集',
    storageUsed: '存储占用',
    retained: '保留',
    pruneCandidates: '可清理',
    createBackup: '创建备份',
    backupReason: '备份原因',
    inspectBackup: '查看文件',
    previewRestore: '恢复预览',
    backupFiles: '备份文件',
    restoreSummary: '恢复摘要',
    backupPolicy: '备份策略',
    daily: '每日',
    weekly: '每周',
    preSync: '同步前',
    changed: '变化',
    different: '不同',
    missingCurrent: '当前缺失',
    unchanged: '未变化',
    bytes: '大小',
    path: '路径',
    manual: '手动',
    workflowTotal: '工作流总数',
    workflowActive: '活跃工作流',
    workflowReview: '待审核',
    workflowBlocked: '阻塞工作流',
    createWorkflow: '新建工作流',
    editWorkflow: '编辑工作流',
    deleteWorkflow: '删除工作流',
    allStatuses: '全部状态',
    planner: '规划者',
    executor: '执行者',
    reviewer: '审核者',
    observer: '观察者',
    workflowPlan: '计划',
    workflowAcceptance: '验收标准',
    workflowRisks: '风险',
    workflowLogs: '工作流日志',
    linkedItems: '关联项',
    startWorkflow: '开始',
    markReview: '提交审核',
    markDone: '标记完成',
    workflowResult: '执行结果',
    workflowNote: '备注',
    workflowSignal: '发送 Signal',
    signalTo: '发送给',
    actionText: '内容',
    createdBy: '创建者',
    noMatches: '没有匹配结果',
    confirmDelete: '确认删除',
    confirmDeleteWorkflow: '删除后会从工作流列表移除，请确认只删除当前工作流。',
    refreshTools: '刷新工具',
    detectTools: '重新检测',
    refreshCapabilities: '刷新能力',
    manageConfig: '管理配置',
    installLocal: '写入本项目',
    installGlobal: '写入全局',
    localTarget: '本项目目标',
    globalTarget: '全局目标',
    rulePreview: '规则预览',
    previewUnavailable: '无可用预览',
    generatedAt: '生成时间',
    successRate: '成功率',
    avgRuntime: '平均耗时',
    lastRun: '最后运行',
    activeDispatches: '活跃调度',
    totalRuns: '运行次数',
    runner: 'Runner',
    command: '命令',
    healthReasons: '健康原因',
    toolFilterAll: '全部工具',
    toolFilterReady: '已就绪',
    toolFilterConnected: '已连接',
    toolFilterRunnable: '可运行',
    toolFilterMissing: '缺失',
    toolFilterNeeds: '需配置',
    capabilitySummary: '能力摘要',
    directCli: '直接 CLI',
    sharedState: '共享状态',
    autoDispatchLabel: '自动调度',
    snapshotLimit: '快照上限',
    coreLimit: '核心记忆上限',
    recentLimit: '近期记忆上限',
    lockStaleMs: '锁超时',
    languageSetting: '语言',
    lightMode: '浅色',
    darkMode: '深色',
    saveSettings: '保存设置',
    settingsSaved: '设置已保存',
    pruneAfterSync: '同步后清理',
    repairSuggestions: '修复建议',
    healthScore: '健康分',
    totalRecords: '记录总数',
    duplicateRecords: '重复记录',
    corruptedRecords: '损坏记录',
    previewRepair: '预览修复',
    applyRepair: '应用修复',
    repairPlan: '修复计划',
    applied: '已应用',
    dryRun: '预览模式',
    confirmRepair: '该操作会修改本地记忆索引数据。请确认已查看修复计划。',
    duplicateGroups: '重复组',
    superseded: '将标记重复',
    settingsSyncSection: '同步与记忆',
    settingsDashboardSection: '仪表盘偏好',
    settingsBackupSection: '备份保留',
    memoryDir: '记忆目录',
    shortcuts: '快捷键',
    refreshSettings: '重载设置',
    invalidSettingsValue: '设置值必须是正整数',
    healthStatus: '健康状态',
    healthIssues: '健康问题',
    duplicateRate: '重复率',
    filesScanned: '扫描文件',
    includesChecked: '检查引用',
    duplicateExamples: '重复样例',
    corruptedExamples: '损坏样例',
    storageBreakdown: '存储明细',
    healthRawReport: '原始健康报告',
    noHealthIssues: '暂无健康问题',
    noHealthExamples: '暂无样例',
    refreshHealth: '刷新健康报告',
    repairLimit: '修复上限',
    totalActions: '总操作',
    ledgerRecordsUpdated: '更新记录',
    corruptedRecovered: '恢复损坏',
    corruptedArchived: '归档损坏',
    repairPreviewEmpty: '先点击预览修复生成计划',
    confirmApply: '确认应用'
  },
  en: {
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    language: '中文',
    connectionError: 'Local hub is unreachable',
    noData: 'No data',
    totalTasks: 'Total tasks',
    activeTasks: 'Active tasks',
    workflows: 'Workflows',
    relayRate: 'Relay success',
    toolsReady: 'Automated tools',
    memoryRecords: 'Memory records',
    pendingEvents: 'Pending events',
    recentTasks: 'Recent tasks',
    recentRadio: 'Recent radio',
    toolReadiness: 'Tool readiness',
    toolInventory: 'Tool inventory',
    toolName: 'Tool',
    toolDetail: 'Detail',
    recentFailures: 'Recent failures',
    status: 'Status',
    project: 'Project',
    owner: 'Owner',
    title: 'Title',
    updated: 'Updated',
    from: 'From',
    to: 'To',
    type: 'Type',
    message: 'Message',
    workflowTitle: 'Workflow',
    role: 'Role',
    mode: 'Mode',
    health: 'Health',
    installed: 'Installed',
    runnable: 'Runnable',
    configured: 'Configured',
    capability: 'Capability',
    visibleProjects: 'Visible projects',
    unregisteredProjects: 'Unregistered refs',
    theme: 'Theme',
    autoRefresh: 'Auto refresh',
    notifications: 'Notifications',
    refreshInterval: 'Refresh interval',
    memorySnapshot: 'Memory snapshot',
    profile: 'Profile',
    dispatchThreads: 'Relay threads',
    dispatchLogs: 'Run logs',
    settingsPanel: 'Runtime preferences',
    yes: 'Yes',
    no: 'No',
    syncInbox: 'Sync Inbox',
    rebuildSnapshot: 'Rebuild Snapshot',
    running: 'Running',
    recordMemory: 'Record memory',
    memoryText: 'Memory text',
    kind: 'Kind',
    source: 'Source',
    save: 'Save',
    addTask: 'Add task',
    description: 'Description',
    handoff: 'Handoff',
    priority: 'Priority',
    allProjects: 'All projects',
    allPriorities: 'All priorities',
    open: 'Open',
    active: 'Active',
    completed: 'Completed',
    claim: 'Claim',
    start: 'Start',
    block: 'Block',
    unblock: 'Unblock',
    complete: 'Complete',
    reopen: 'Reopen',
    approve: 'Approve',
    reject: 'Reject',
    addNote: 'Add note',
    notePlaceholder: 'Note or status reason',
    broadcastMessage: 'Send radio',
    searchText: 'Search text',
    allSenders: 'All senders',
    allRecipients: 'All recipients',
    allTypes: 'All types',
    promoteToMemory: 'Promote to memory',
    triggerDispatch: 'Trigger dispatch',
    forceDispatch: 'Force run',
    limit: 'Limit',
    created: 'Created',
    assignee: 'Assignee',
    notes: 'Notes',
    review: 'Review',
    clear: 'Clear',
    cancel: 'Cancel',
    analyticsOverview: 'Analytics overview',
    tasksByStatus: 'Tasks by status',
    radioByType: 'Radio by type',
    relayByState: 'Relay by state',
    toolAutomation: 'Tool automation',
    missing: 'Missing',
    backupStorage: 'Backup storage',
    topProjects: 'Top projects',
    globalSearch: 'Global search',
    searchPlaceholder: 'Search memories, tasks, radio, or workflows',
    resultCount: 'Results',
    elapsed: 'Elapsed',
    range: 'Range',
    sort: 'Sort',
    relevance: 'Relevance',
    newest: 'Newest',
    oldest: 'Oldest',
    allRanges: 'All time',
    last24h: '24 hours',
    last7d: '7 days',
    last30d: '30 days',
    last90d: '90 days',
    facets: 'Facets',
    tags: 'Tags',
    results: 'Results',
    score: 'Score',
    backupSets: 'Backup sets',
    storageUsed: 'Storage used',
    retained: 'Retained',
    pruneCandidates: 'Prune candidates',
    createBackup: 'Create backup',
    backupReason: 'Backup reason',
    inspectBackup: 'Inspect files',
    previewRestore: 'Restore preview',
    backupFiles: 'Backup files',
    restoreSummary: 'Restore summary',
    backupPolicy: 'Backup policy',
    daily: 'Daily',
    weekly: 'Weekly',
    preSync: 'Pre-sync',
    changed: 'Changed',
    different: 'Different',
    missingCurrent: 'Missing current',
    unchanged: 'Unchanged',
    bytes: 'Bytes',
    path: 'Path',
    manual: 'Manual',
    workflowTotal: 'Total workflows',
    workflowActive: 'Active workflows',
    workflowReview: 'In review',
    workflowBlocked: 'Blocked workflows',
    createWorkflow: 'Create workflow',
    editWorkflow: 'Edit workflow',
    deleteWorkflow: 'Delete workflow',
    allStatuses: 'All statuses',
    planner: 'Planner',
    executor: 'Executor',
    reviewer: 'Reviewer',
    observer: 'Observer',
    workflowPlan: 'Plan',
    workflowAcceptance: 'Acceptance',
    workflowRisks: 'Risks',
    workflowLogs: 'Workflow logs',
    linkedItems: 'Linked items',
    startWorkflow: 'Start',
    markReview: 'Send to review',
    markDone: 'Mark done',
    workflowResult: 'Result',
    workflowNote: 'Note',
    workflowSignal: 'Send signal',
    signalTo: 'Send to',
    actionText: 'Text',
    createdBy: 'Created by',
    noMatches: 'No matches',
    confirmDelete: 'Confirm delete',
    confirmDeleteWorkflow: 'This removes the workflow from the list. Confirm that only this workflow should be deleted.',
    refreshTools: 'Refresh tools',
    detectTools: 'Detect again',
    refreshCapabilities: 'Refresh capabilities',
    manageConfig: 'Manage config',
    installLocal: 'Write project',
    installGlobal: 'Write global',
    localTarget: 'Project target',
    globalTarget: 'Global target',
    rulePreview: 'Rule preview',
    previewUnavailable: 'No preview available',
    generatedAt: 'Generated at',
    successRate: 'Success rate',
    avgRuntime: 'Avg runtime',
    lastRun: 'Last run',
    activeDispatches: 'Active dispatches',
    totalRuns: 'Runs',
    runner: 'Runner',
    command: 'Command',
    healthReasons: 'Health reasons',
    toolFilterAll: 'All tools',
    toolFilterReady: 'Ready',
    toolFilterConnected: 'Connected',
    toolFilterRunnable: 'Runnable',
    toolFilterMissing: 'Missing',
    toolFilterNeeds: 'Needs config',
    capabilitySummary: 'Capability summary',
    directCli: 'Direct CLI',
    sharedState: 'Shared state',
    autoDispatchLabel: 'Auto dispatch',
    snapshotLimit: 'Snapshot limit',
    coreLimit: 'Core limit',
    recentLimit: 'Recent limit',
    lockStaleMs: 'Lock timeout',
    languageSetting: 'Language',
    lightMode: 'Light',
    darkMode: 'Dark',
    saveSettings: 'Save settings',
    settingsSaved: 'Settings saved',
    pruneAfterSync: 'Prune after sync',
    repairSuggestions: 'Repair suggestions',
    healthScore: 'Health score',
    totalRecords: 'Total records',
    duplicateRecords: 'Duplicate records',
    corruptedRecords: 'Corrupted records',
    previewRepair: 'Preview repair',
    applyRepair: 'Apply repair',
    repairPlan: 'Repair plan',
    applied: 'Applied',
    dryRun: 'Dry run',
    confirmRepair: 'This operation changes local memory index data. Confirm that you reviewed the repair plan.',
    duplicateGroups: 'Duplicate groups',
    superseded: 'To supersede',
    settingsSyncSection: 'Sync and memory',
    settingsDashboardSection: 'Dashboard preferences',
    settingsBackupSection: 'Backup retention',
    memoryDir: 'Memory directory',
    shortcuts: 'Shortcuts',
    refreshSettings: 'Reload settings',
    invalidSettingsValue: 'Settings values must be positive integers',
    healthStatus: 'Health status',
    healthIssues: 'Health issues',
    duplicateRate: 'Duplicate rate',
    filesScanned: 'Files scanned',
    includesChecked: 'Includes checked',
    duplicateExamples: 'Duplicate examples',
    corruptedExamples: 'Corrupted examples',
    storageBreakdown: 'Storage breakdown',
    healthRawReport: 'Raw health report',
    noHealthIssues: 'No health issues',
    noHealthExamples: 'No examples',
    refreshHealth: 'Refresh health',
    repairLimit: 'Repair limit',
    totalActions: 'Total actions',
    ledgerRecordsUpdated: 'Updated records',
    corruptedRecovered: 'Recovered corrupted',
    corruptedArchived: 'Archived corrupted',
    repairPreviewEmpty: 'Preview repair first to generate a plan',
    confirmApply: 'Confirm apply'
  }
}

const toolIconAssetVersion = '20260606-app-icons-v2'

const toolIconFiles: Record<string, string> = {
  gemini: '/assets/tool-icons/gemini.png',
  'antigravity-gemini': '/assets/tool-icons/gemini.png',
  claude: '/assets/tool-icons/claude.png',
  'claude-desktop': '/assets/tool-icons/claude-desktop.png',
  chatgpt: '/assets/tool-icons/chatgpt.png',
  cursor: '/assets/tool-icons/cursor.png',
  vscode: '/assets/tool-icons/vscode.png',
  codex: '/assets/tool-icons/codex.png',
  'codex-app': '/assets/tool-icons/codex-app.png',
  windsurf: '/assets/tool-icons/windsurf.png',
  aider: '/assets/tool-icons/aider.png',
  marvis: '/assets/tool-icons/marvis-app.png',
  qclaw: '/assets/tool-icons/qclaw-app.png',
  openclaw: '/assets/tool-icons/qclaw-app.png',
  'cherry-studio': '/assets/tool-icons/cherry-studio.png',
  ollama: '/assets/tool-icons/ollama.png',
  'cc-switch': '/assets/tool-icons/ccswitch-app.png',
  ccswitch: '/assets/tool-icons/ccswitch.png',
  antigravity: '/assets/tool-icons/antigravity.png',
  'antigravity-cockpit': '/assets/tool-icons/antigravity-cockpit.png'
}

const toolKinds: Record<string, string> = {
  gemini: 'cli-config',
  'antigravity-gemini': 'extension-state',
  claude: 'cli-config',
  'claude-desktop': 'app-state',
  chatgpt: 'app-state',
  cursor: 'editor-state',
  vscode: 'editor-state',
  codex: 'cli-config',
  'codex-app': 'app-state',
  windsurf: 'editor-state',
  aider: 'cli-config',
  marvis: 'app-state',
  qclaw: 'app-state',
  openclaw: 'app-state',
  'cherry-studio': 'app-state',
  ollama: 'local-model-runtime',
  'cc-switch': 'app-state',
  ccswitch: 'app-state',
  antigravity: 'cli-config',
  'antigravity-cockpit': 'app-state'
}

const toolKindBadges: Record<Language, Record<string, string>> = {
  zh: {
    'cli-config': '命令行',
    'app-state': '应用',
    'editor-state': '编辑器',
    'extension-state': '扩展',
    'skill-config': '技能',
    'local-model-runtime': '运行环境'
  },
  en: {
    'cli-config': 'CLI',
    'app-state': 'App',
    'editor-state': 'Editor',
    'extension-state': 'Extension',
    'skill-config': 'Skill',
    'local-model-runtime': 'Runtime'
  }
}

const toolDisplayNames: Record<Language, Record<string, string>> = {
  zh: {
    gemini: 'Gemini',
    'antigravity-gemini': 'Antigravity Gemini',
    claude: 'Claude',
    'claude-desktop': 'Claude Desktop',
    chatgpt: 'ChatGPT',
    cursor: 'Cursor',
    vscode: 'VS Code',
    codex: 'Codex',
    'codex-app': 'Codex App',
    windsurf: 'Windsurf',
    aider: 'Aider',
    marvis: 'Marvis',
    qclaw: 'QClaw',
    openclaw: 'OpenClaw',
    'cherry-studio': 'Cherry Studio',
    ollama: 'Ollama',
    'cc-switch': 'CC-Switch',
    ccswitch: 'CC-Switch',
    antigravity: 'Antigravity',
    'antigravity-cockpit': 'Antigravity Cockpit'
  },
  en: {
    gemini: 'Gemini',
    'antigravity-gemini': 'Antigravity Gemini',
    claude: 'Claude',
    'claude-desktop': 'Claude Desktop',
    chatgpt: 'ChatGPT',
    cursor: 'Cursor',
    vscode: 'VS Code',
    codex: 'Codex',
    'codex-app': 'Codex App',
    windsurf: 'Windsurf',
    aider: 'Aider',
    marvis: 'Marvis',
    qclaw: 'QClaw',
    openclaw: 'OpenClaw',
    'cherry-studio': 'Cherry Studio',
    ollama: 'Ollama',
    'cc-switch': 'CC-Switch',
    ccswitch: 'CC-Switch',
    antigravity: 'Antigravity',
    'antigravity-cockpit': 'Antigravity Cockpit'
  }
}

export default function Dashboard({ section }: DashboardProps) {
  const { language, toggleLanguage } = useOutletContext<AppOutletContext>()
  const [data, setData] = useState<DashboardSnapshot | null>(null)
  const [health, setHealth] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')

  const copy = labels[language]
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { snapshot, health: nextHealth } = await fetchDashboardData()
      setData(snapshot)
      setHealth(nextHealth)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [])

  const runHubAction = useCallback(async (path: string, action: string) => {
    setBusyAction(action)
    setError('')
    try {
      await apiPost<AnyRecord>(path, {})
      await refresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusyAction('')
    }
  }, [refresh])

  useEffect(() => {
    let active = true

    void fetchDashboardData()
      .then(({ snapshot, health: nextHealth }) => {
        if (!active) return
        setData(snapshot)
        setHealth(nextHealth)
      })
      .catch(nextError => {
        if (!active) return
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const viewModel = useMemo(() => buildViewModel(data), [data])

  return (
    <div className="dashboard-page">
      <header className="page-header">
        <div className="page-title-group">
          <p className="eyebrow">AI Memory Hub</p>
          <h2>{titles[language][section]}</h2>
          <p className="page-subtitle">{subtitles[language][section]}</p>
        </div>
        <div className="header-actions">
          <button className="btn ghost" type="button" onClick={() => void runHubAction('/api/pull', 'pull')} disabled={loading || Boolean(busyAction)}>
            {busyAction === 'pull' ? copy.running : copy.rebuildSnapshot}
          </button>
          <button className="btn ghost" type="button" onClick={() => void runHubAction('/api/sync', 'sync')} disabled={loading || Boolean(busyAction)}>
            {busyAction === 'sync' ? copy.running : copy.syncInbox}
          </button>
          <button className="btn ghost" type="button" onClick={toggleLanguage}>
            {copy.language}
          </button>
          <button className="btn" type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? copy.refreshing : copy.refresh}
          </button>
        </div>
      </header>

      {error ? (
        <section className="notice error">
          <strong>{copy.connectionError}</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {loading && !data ? (
        <section className="notice">
          <span>{copy.refreshing}</span>
        </section>
      ) : (
        <>
          {section === 'overview' && <Overview copy={copy} model={viewModel} />}
          {section === 'memory' && <MemoryPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'tasks' && <TasksPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'radio' && <RadioPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'dispatch' && <DispatchPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'workflows' && <WorkflowsPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'analytics' && <AnalyticsPanel copy={copy} model={viewModel} />}
          {section === 'backups' && <BackupsPanel copy={copy} model={viewModel} onRefresh={refresh} />}
          {section === 'search' && <SearchPanel copy={copy} />}
          {section === 'tools' && <ToolsPanel copy={copy} language={language} model={viewModel} onRefresh={refresh} />}
          {section === 'projects' && <ProjectsPanel copy={copy} model={viewModel} />}
          {section === 'health' && <HealthPanel copy={copy} model={viewModel} health={health} onRefresh={refresh} />}
          {section === 'settings' && <SettingsPanel copy={copy} model={viewModel} onRefresh={refresh} />}
        </>
      )}
    </div>
  )
}

async function fetchDashboardData(): Promise<{ snapshot: DashboardSnapshot; health: AnyRecord | null }> {
  const [snapshot, health] = await Promise.all([
    apiGet<DashboardSnapshot>('/api/dashboard'),
    apiGet<AnyRecord>('/api/health').catch(() => null)
  ])
  return { snapshot, health }
}

function buildViewModel(data: DashboardSnapshot | null) {
  const status = asRecord(data?.status)
  const metrics = asRecord(data?.metrics)
  const memory = asRecord(data?.memory)
  const radio = asRecord(data?.radio)
  const tasks = asRecord(data?.tasks)
  const workflows = asRecord(data?.workflows)
  const projects = asRecord(data?.projects)
  const dispatch = asRecord(data?.dispatch)
  const tools = asRecord(data?.tools)
  const backups = asRecord(data?.backups)
  const settings = asRecord(data?.settings)

  return {
    status,
    metrics,
    memory,
    radio: asArray<AnyRecord>(radio.messages),
    tasks: asArray<AnyRecord>(tasks.tasks),
    workflows: asArray<AnyRecord>(workflows.workflows),
    projects: asArray<AnyRecord>(projects.projects),
    visibleProjects: asArray<AnyRecord>(projects.visibleProjects),
    unregisteredProjects: asArray<string>(projects.unregisteredProjects),
    dispatchLogs: asArray<AnyRecord>(dispatch.logs),
    relay: asArray<AnyRecord>(dispatch.relay),
    tools: asArray<AnyRecord>(tools.tools),
    toolSummary: asRecord(tools.summary),
    backups,
    settings
  }
}

type ViewModel = ReturnType<typeof buildViewModel>
type Copy = typeof labels.zh

function Overview({ copy, model }: { copy: Copy; model: ViewModel }) {
  const statusTasks = asRecord(model.status.tasks)
  const statusWorkflows = asRecord(model.status.workflows)
  const index = asRecord(model.status.index)
  const relay = asRecord(model.metrics.relay)
  const capabilitySummary = asRecord(model.status.capabilitySummary)
  const recentFailures = asArray<AnyRecord>(model.metrics.recentFailures).slice(0, 4)

  return (
    <div className="dashboard-grid">
      <MetricCard label={copy.totalTasks} value={formatNumber(statusTasks.total)} />
      <MetricCard label={copy.activeTasks} value={formatNumber(statusTasks.active)} tone="success" />
      <MetricCard label={copy.workflows} value={formatNumber(statusWorkflows.total)} />
      <MetricCard label={copy.relayRate} value={textOf(relay.successRate, '0%')} tone="warning" />
      <MetricCard label={copy.toolsReady} value={formatNumber(capabilitySummary.autoDispatch)} />
      <MetricCard label={copy.memoryRecords} value={formatNumber(index.records)} />

      <Panel title={copy.recentTasks} className="span-2">
        <TaskList copy={copy} tasks={model.tasks.slice(0, 6)} />
      </Panel>
      <Panel title={copy.toolReadiness}>
        <ToolList copy={copy} tools={model.tools.slice(0, 7)} />
      </Panel>
      <Panel title={copy.recentRadio} className="span-2">
        <RadioList copy={copy} messages={model.radio.slice(-6).reverse()} />
      </Panel>
      <Panel title={copy.recentFailures}>
        {recentFailures.length ? (
          <div className="stack">
            {recentFailures.map((failure, indexValue) => (
              <div className="compact-row" key={`${textOf(failure.id)}-${indexValue}`}>
                <StatusBadge status="failed" />
                <span className="truncate">{textOf(failure.error, copy.noData)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text={copy.noData} />
        )}
      </Panel>
    </div>
  )
}

function MemoryPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const pending = asArray<AnyRecord>(model.memory.pending)
  const [text, setText] = useState('')
  const [kind, setKind] = useState('note')
  const [source, setSource] = useState('dashboard-next')
  const [recordOpen, setRecordOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submitMemory = async () => {
    const nextText = text.trim()
    if (!nextText || saving) return
    setSaving(true)
    setError('')
    try {
      await apiPost<AnyRecord>('/api/record', { text: nextText, kind, source })
      setText('')
      await onRefresh()
      setRecordOpen(false)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel-grid two">
      <Panel title={copy.memorySnapshot}>
        <pre className="text-snapshot">{textOf(model.memory.memory, copy.noData)}</pre>
      </Panel>
      <div className="stack">
        <Panel title={copy.recordMemory}>
          <div className="section-actions compact">
            <button className="btn full-width" type="button" onClick={() => { setError(''); setRecordOpen(true) }}>
            {copy.recordMemory}
            </button>
          </div>
        </Panel>
        <MetricCard label={copy.pendingEvents} value={formatNumber(pending.length)} tone="warning" />
        <Panel title={copy.profile}>
          <pre className="text-snapshot small">{textOf(model.memory.profile, copy.noData)}</pre>
        </Panel>
      </div>
      {recordOpen ? (
        <Modal title={copy.recordMemory} onClose={() => setRecordOpen(false)}>
          <div className="form-grid">
            <label className="field span-all">
              <span>{copy.memoryText}</span>
              <textarea value={text} onChange={event => setText(event.target.value)} rows={5} />
            </label>
            <label className="field">
              <span>{copy.kind}</span>
              <select value={kind} onChange={event => setKind(event.target.value)}>
                <option value="preference">preference</option>
                <option value="workflow">workflow</option>
                <option value="project">project</option>
                <option value="correction">correction</option>
                <option value="note">note</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.source}</span>
              <input value={source} onChange={event => setSource(event.target.value)} />
            </label>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setRecordOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" onClick={() => void submitMemory()} disabled={saving || !text.trim()}>
                {saving ? copy.running : copy.save}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function TasksPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [projectFilter, setProjectFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [query, setQuery] = useState('')
  const [newTask, setNewTask] = useState({ title: '', project: 'ai-memory-hub', priority: 'normal', description: '', handoff: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const projectOptions = useMemo(() => uniqueSorted([
    ...model.tasks.map(task => textOf(task.project)).filter(Boolean),
    ...model.visibleProjects.map(project => textOf(project.id || project.name)).filter(Boolean)
  ]), [model.tasks, model.visibleProjects])
  const priorityOptions = useMemo(() => uniqueSorted(model.tasks.map(task => textOf(task.priority)).filter(Boolean)), [model.tasks])
  const cleanQuery = query.trim().toLowerCase()
  const filteredTasks = model.tasks.filter(task => {
    if (projectFilter && textOf(task.project) !== projectFilter) return false
    if (priorityFilter && textOf(task.priority) !== priorityFilter) return false
    if (!cleanQuery) return true
    return [
      task.title,
      task.description,
      task.handoff,
      task.assignee,
      task.createdBy,
      task.status,
      task.project
    ].some(value => textOf(value).toLowerCase().includes(cleanQuery))
  })
  const columns = {
    open: filteredTasks.filter(task => textOf(task.status, 'open') === 'open'),
    active: filteredTasks.filter(task => ['claimed', 'in_progress', 'blocked'].includes(textOf(task.status))),
    completed: filteredTasks.filter(task => ['done', 'cancelled'].includes(textOf(task.status)))
  }

  const mutateTask = async (action: string, path: string, body: AnyRecord) => {
    setBusy(action)
    setError('')
    try {
      await apiPost<AnyRecord>(path, body)
      await onRefresh()
      return true
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      return false
    } finally {
      setBusy('')
    }
  }

  const submitTask = async () => {
    const title = newTask.title.trim()
    if (!title) return
    const succeeded = await mutateTask('add-task', '/api/task/add', {
      ...newTask,
      title,
      from: 'dashboard-next'
    })
    if (succeeded) {
      setNewTask({ title: '', project: newTask.project, priority: 'normal', description: '', handoff: '' })
      setCreateOpen(false)
    }
  }

  return (
    <div className="stack">
      <Panel title={copy.recentTasks}>
        <div className="section-actions">
          <button className="btn" type="button" onClick={() => { setError(''); setCreateOpen(true) }}>
            {copy.addTask}
          </button>
        </div>
        <div className="filter-strip">
          <label className="field">
            <span>{copy.searchText}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <label className="field">
            <span>{copy.project}</span>
            <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
              <option value="">{copy.allProjects}</option>
              {projectOptions.map(project => <option value={project} key={project}>{project}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.priority}</span>
            <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}>
              <option value="">{copy.allPriorities}</option>
              {priorityOptions.map(priority => <option value={priority} key={priority}>{priority}</option>)}
            </select>
          </label>
          <button className="btn ghost" type="button" onClick={() => { setQuery(''); setProjectFilter(''); setPriorityFilter('') }}>
            {copy.clear}
          </button>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="kanban-grid">
          <TaskColumn title={copy.open} count={columns.open.length} tasks={columns.open} copy={copy} busy={busy} onMutate={mutateTask} />
          <TaskColumn title={copy.active} count={columns.active.length} tasks={columns.active} copy={copy} busy={busy} onMutate={mutateTask} />
          <TaskColumn title={copy.completed} count={columns.completed.length} tasks={columns.completed} copy={copy} busy={busy} onMutate={mutateTask} />
        </div>
      </Panel>
      {createOpen ? (
        <Modal title={copy.addTask} onClose={() => setCreateOpen(false)}>
          <div className="form-grid task-form-grid">
            <label className="field span-2">
              <span>{copy.title}</span>
              <input value={newTask.title} onChange={event => setNewTask(value => ({ ...value, title: event.target.value }))} />
            </label>
            <label className="field">
              <span>{copy.project}</span>
              <input value={newTask.project} onChange={event => setNewTask(value => ({ ...value, project: event.target.value }))} list="task-project-options" />
            </label>
            <label className="field">
              <span>{copy.priority}</span>
              <select value={newTask.priority} onChange={event => setNewTask(value => ({ ...value, priority: event.target.value }))}>
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </label>
            <label className="field span-2">
              <span>{copy.description}</span>
              <textarea value={newTask.description} onChange={event => setNewTask(value => ({ ...value, description: event.target.value }))} rows={3} />
            </label>
            <label className="field span-2">
              <span>{copy.handoff}</span>
              <textarea value={newTask.handoff} onChange={event => setNewTask(value => ({ ...value, handoff: event.target.value }))} rows={3} />
            </label>
            <datalist id="task-project-options">
              {projectOptions.map(project => <option value={project} key={project} />)}
            </datalist>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setCreateOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" onClick={() => void submitTask()} disabled={busy === 'add-task' || !newTask.title.trim()}>
                {busy === 'add-task' ? copy.running : copy.addTask}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

type TaskMutator = (action: string, path: string, body: AnyRecord) => Promise<boolean>

function TaskColumn({ title, count, tasks, copy, busy, onMutate }: {
  title: string
  count: number
  tasks: AnyRecord[]
  copy: Copy
  busy: string
  onMutate: TaskMutator
}) {
  return (
    <section className="kanban-column">
      <header className="kanban-header">
        <h4>{title}</h4>
        <span className="count-pill">{formatNumber(count)}</span>
      </header>
      <div className="kanban-list">
        {tasks.length ? tasks.map(task => (
          <TaskCard key={textOf(task.id)} task={task} copy={copy} busy={busy} onMutate={onMutate} />
        )) : <EmptyState text={copy.noData} />}
      </div>
    </section>
  )
}

function TaskCard({ task, copy, busy, onMutate }: { task: AnyRecord; copy: Copy; busy: string; onMutate: TaskMutator }) {
  const [note, setNote] = useState('')
  const id = textOf(task.id)
  const status = textOf(task.status, 'open')
  const actionBase = `${id}:`
  const isBusy = busy.startsWith(actionBase)
  const notes = asArray<AnyRecord>(task.notes).slice(-3)

  const setStatus = async (nextStatus: string, fallbackNote = '') => {
    const nextNote = note.trim() || fallbackNote
    const succeeded = await onMutate(`${actionBase}${nextStatus}`, '/api/task/status', {
      id,
      status: nextStatus,
      by: 'dashboard-next',
      note: nextNote
    })
    if (succeeded) setNote('')
  }

  const review = async (decision: 'approved' | 'rejected') => {
    await onMutate(`${actionBase}${decision}`, '/api/task/review', {
      id,
      decision,
      by: 'dashboard-next',
      note: note.trim()
    })
    setNote('')
  }

  return (
    <article className="task-card">
      <div className="task-card-top">
        <StatusBadge status={status} />
        <StatusBadge status={textOf(task.priority, 'normal')} />
      </div>
      <h4>{textOf(task.title, '-')}</h4>
      {task.description ? <p className="task-description">{textOf(task.description)}</p> : null}
      {task.handoff ? <p className="task-handoff"><strong>{copy.handoff}:</strong> {textOf(task.handoff)}</p> : null}
      <div className="task-meta-grid">
        <Property label={copy.project} value={textOf(task.project, '-')} />
        <Property label={copy.assignee} value={textOf(task.assignee || task.createdBy, '-')} />
        <Property label={copy.created} value={formatDate(textOf(task.createdAt))} />
        <Property label={copy.updated} value={formatDate(textOf(task.updatedAt || task.createdAt))} />
      </div>
      {task.reviewStatus ? (
        <div className="task-review">
          <strong>{copy.review}: {textOf(task.reviewStatus)}</strong>
          <span>{textOf(task.reviewedBy, '-')} · {formatDate(textOf(task.reviewedAt))}</span>
          {task.reviewNote ? <p>{textOf(task.reviewNote)}</p> : null}
        </div>
      ) : null}
      {notes.length ? (
        <div className="task-notes">
          <strong>{copy.notes}</strong>
          {notes.map((item, indexValue) => (
            <p key={`${textOf(item.ts)}-${indexValue}`}>
              <span>{textOf(item.by, '-')} · {formatDate(textOf(item.ts))}</span>
              {textOf(item.text, '-')}
            </p>
          ))}
        </div>
      ) : null}
      <label className="field note-field">
        <span>{copy.addNote}</span>
        <input value={note} onChange={event => setNote(event.target.value)} placeholder={copy.notePlaceholder} />
      </label>
      <div className="task-actions">
        {status === 'open' ? (
          <button className="btn small" type="button" disabled={isBusy} onClick={() => onMutate(`${actionBase}claim`, '/api/task/claim', { id, by: 'dashboard-next' })}>
            {copy.claim}
          </button>
        ) : null}
        {['claimed', 'blocked'].includes(status) ? (
          <button className="btn small" type="button" disabled={isBusy} onClick={() => void setStatus('in_progress')}>
            {status === 'blocked' ? copy.unblock : copy.start}
          </button>
        ) : null}
        {['claimed', 'in_progress'].includes(status) ? (
          <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void setStatus('blocked', 'Blocked from dashboard-next')}>
            {copy.block}
          </button>
        ) : null}
        {['claimed', 'in_progress', 'blocked'].includes(status) ? (
          <button className="btn small" type="button" disabled={isBusy} onClick={() => void setStatus('done')}>
            {copy.complete}
          </button>
        ) : null}
        {['done', 'cancelled'].includes(status) ? (
          <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void setStatus('open')}>
            {copy.reopen}
          </button>
        ) : null}
        <button className="btn small ghost" type="button" disabled={isBusy || !note.trim()} onClick={() => void setStatus(status)}>
          {copy.addNote}
        </button>
        {status !== 'cancelled' ? (
          <>
            <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void review('approved')}>
              {copy.approve}
            </button>
            <button className="btn small ghost" type="button" disabled={isBusy} onClick={() => void review('rejected')}>
              {copy.reject}
            </button>
          </>
        ) : null}
      </div>
    </article>
  )
}

function RadioPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState({ text: '', from: 'dashboard-next', to: 'all', type: 'note', project: 'ai-memory-hub' })
  const [query, setQuery] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const senderOptions = useMemo(() => uniqueSorted(model.radio.map(message => textOf(message.from)).filter(Boolean)), [model.radio])
  const recipientOptions = useMemo(() => uniqueSorted(model.radio.map(message => textOf(message.to)).filter(Boolean)), [model.radio])
  const typeOptions = useMemo(() => uniqueSorted(model.radio.map(message => textOf(message.type)).filter(Boolean)), [model.radio])
  const projectOptions = useMemo(() => uniqueSorted([
    ...model.radio.map(message => textOf(message.project)).filter(Boolean),
    ...model.visibleProjects.map(project => textOf(project.id || project.name)).filter(Boolean)
  ]), [model.radio, model.visibleProjects])
  const cleanQuery = query.trim().toLowerCase()
  const filteredMessages = model.radio.filter(message => {
    if (fromFilter && textOf(message.from) !== fromFilter) return false
    if (toFilter && textOf(message.to) !== toFilter) return false
    if (typeFilter && textOf(message.type) !== typeFilter) return false
    if (projectFilter && textOf(message.project) !== projectFilter) return false
    if (!cleanQuery) return true
    return [message.text, message.thread, message.project, message.from, message.to, message.type]
      .some(value => textOf(value).toLowerCase().includes(cleanQuery))
  }).slice().reverse()

  const submitRadio = async () => {
    const text = form.text.trim()
    if (!text || busy) return
    setBusy('send')
    setError('')
    try {
      await apiPost<AnyRecord>('/api/radio/send', { ...form, text })
      setForm(value => ({ ...value, text: '' }))
      setComposeOpen(false)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const promote = async (id: string) => {
    if (!id) return
    setBusy(`promote:${id}`)
    setError('')
    try {
      await apiPost<AnyRecord>('/api/radio/promote', { id })
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack">
      <Panel title={copy.recentRadio}>
        <div className="section-actions">
          <button className="btn" type="button" onClick={() => { setError(''); setComposeOpen(true) }}>
            {copy.broadcastMessage}
          </button>
        </div>
        <div className="filter-strip">
          <label className="field">
            <span>{copy.searchText}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <label className="field">
            <span>{copy.from}</span>
            <select value={fromFilter} onChange={event => setFromFilter(event.target.value)}>
              <option value="">{copy.allSenders}</option>
              {senderOptions.map(sender => <option value={sender} key={sender}>{sender}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.to}</span>
            <select value={toFilter} onChange={event => setToFilter(event.target.value)}>
              <option value="">{copy.allRecipients}</option>
              {recipientOptions.map(recipient => <option value={recipient} key={recipient}>{recipient}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.type}</span>
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
              <option value="">{copy.allTypes}</option>
              {typeOptions.map(type => <option value={type} key={type}>{type}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.project}</span>
            <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
              <option value="">{copy.allProjects}</option>
              {projectOptions.map(project => <option value={project} key={project}>{project}</option>)}
            </select>
          </label>
          <button className="btn ghost" type="button" onClick={() => { setQuery(''); setFromFilter(''); setToFilter(''); setTypeFilter(''); setProjectFilter('') }}>
            {copy.clear}
          </button>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="radio-stream">
          {filteredMessages.length ? filteredMessages.map(message => (
            <article className="radio-card" key={textOf(message.id) || `${textOf(message.ts)}-${textOf(message.from)}`}>
              <div className="radio-card-header">
                <div className="message-meta">
                  <StatusBadge status={textOf(message.type, 'note')} />
                  <span>{textOf(message.from, '-')} {'->'} {textOf(message.to, '-')}</span>
                </div>
                <span className="muted-text">{formatDate(textOf(message.ts || message.createdAt))}</span>
              </div>
              <p>{textOf(message.text, '-')}</p>
              <div className="radio-card-footer">
                <span className="chip">{textOf(message.project, '-')}</span>
                {message.thread ? <span className="chip">{textOf(message.thread)}</span> : null}
                <button className="btn small ghost" type="button" disabled={busy === `promote:${textOf(message.id)}`} onClick={() => void promote(textOf(message.id))}>
                  {copy.promoteToMemory}
                </button>
              </div>
            </article>
          )) : <EmptyState text={copy.noData} />}
        </div>
      </Panel>
      {composeOpen ? (
        <Modal title={copy.broadcastMessage} onClose={() => setComposeOpen(false)}>
          <div className="form-grid">
            <label className="field span-all">
              <span>{copy.message}</span>
              <textarea value={form.text} onChange={event => setForm(value => ({ ...value, text: event.target.value }))} rows={4} />
            </label>
            <label className="field">
              <span>{copy.from}</span>
              <input value={form.from} onChange={event => setForm(value => ({ ...value, from: event.target.value }))} />
            </label>
            <label className="field">
              <span>{copy.to}</span>
              <input value={form.to} onChange={event => setForm(value => ({ ...value, to: event.target.value }))} list="radio-recipient-options" />
            </label>
            <label className="field">
              <span>{copy.type}</span>
              <select value={form.type} onChange={event => setForm(value => ({ ...value, type: event.target.value }))}>
                <option value="note">note</option>
                <option value="review">review</option>
                <option value="handoff">handoff</option>
                <option value="risk">risk</option>
                <option value="request">request</option>
                <option value="done">done</option>
              </select>
            </label>
            <label className="field">
              <span>{copy.project}</span>
              <input value={form.project} onChange={event => setForm(value => ({ ...value, project: event.target.value }))} list="radio-project-options" />
            </label>
            <datalist id="radio-recipient-options">
              {recipientOptions.map(to => <option value={to} key={to} />)}
            </datalist>
            <datalist id="radio-project-options">
              {projectOptions.map(project => <option value={project} key={project} />)}
            </datalist>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setComposeOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" onClick={() => void submitRadio()} disabled={busy === 'send' || !form.text.trim()}>
                {busy === 'send' ? copy.running : copy.broadcastMessage}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function DispatchPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [force, setForce] = useState(false)
  const [limit, setLimit] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const trigger = async () => {
    setBusy(true)
    setError('')
    try {
      await apiPost<AnyRecord>('/api/dispatch/run', { force, limit })
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <Panel title={copy.triggerDispatch}>
        <div className="form-grid dispatch-control-grid">
          <label className="field checkbox-field">
            <input type="checkbox" checked={force} onChange={event => setForce(event.target.checked)} />
            <span>{copy.forceDispatch}</span>
          </label>
          <label className="field">
            <span>{copy.limit}</span>
            <input type="number" min={1} max={50} value={limit} onChange={event => setLimit(Number(event.target.value) || 10)} />
          </label>
          <div className="form-actions">
            <button className="btn" type="button" onClick={() => void trigger()} disabled={busy}>
              {busy ? copy.running : copy.triggerDispatch}
            </button>
          </div>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
      </Panel>
      <div className="panel-grid two">
        <Panel title={copy.dispatchThreads}>
          <div className="stack">
            {model.relay.length ? model.relay.map(entry => (
              <div className="dispatch-card" key={textOf(entry.id || entry.threadKey || entry.sourceId)}>
                <div className="dispatch-card-header">
                  <div>
                    <strong>{textOf(entry.tool, '-')}</strong>
                    <span>{textOf(entry.project, '-')}</span>
                  </div>
                  <StatusBadge status={textOf(entry.state, 'pending')} />
                </div>
                <p>{textOf(entry.threadKey || entry.thread || entry.sourceId, '-')}</p>
                {entry.progressPercent !== undefined && entry.progressPercent !== null ? (
                  <div className="progress-line">
                    <span style={{ width: `${Math.min(100, Math.max(0, numberOf(entry.progressPercent)))}%` }} />
                  </div>
                ) : null}
                {entry.progressStatus ? <p>{textOf(entry.progressStatus)}</p> : null}
                {entry.lastError ? <p className="error-text">{textOf(entry.lastError)}</p> : null}
                <span className="muted-text">{formatDate(textOf(entry.ts || entry.progressAt || entry.deliveryUpdatedAt))}</span>
              </div>
            )) : <EmptyState text={copy.noData} />}
          </div>
        </Panel>
        <Panel title={copy.dispatchLogs}>
          <DataTable
            emptyText={copy.noData}
            columns={[copy.status, copy.to, copy.project, copy.message]}
            rows={model.dispatchLogs.slice(0, 30).map(log => [
              <StatusBadge status={textOf(log.runStatus || log.status || log.exitCode, 'log')} />,
              textOf(log.tool, '-'),
              textOf(log.project, '-'),
              textOf(log.message || log.text || log.error || log.lastError, '-')
            ])}
          />
        </Panel>
      </div>
    </div>
  )
}

const workflowStatusOptions = ['open', 'planned', 'in_progress', 'review', 'blocked', 'done', 'cancelled']
const workflowPriorityOptions = ['low', 'normal', 'high', 'urgent']

interface WorkflowFormState {
  id: string
  title: string
  by: string
  project: string
  priority: string
  status: string
  planner: string
  executor: string
  reviewer: string
  observer: string
  plan: string
  acceptance: string
  risks: string
}

type WorkflowEntryAction = 'result' | 'review' | 'note' | 'signal' | 'delete'

interface WorkflowActionState {
  action: WorkflowEntryAction
  workflow: AnyRecord
}

function WorkflowsPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const workflows = model.workflows
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<WorkflowFormState>(() => createWorkflowForm())
  const [actionState, setActionState] = useState<WorkflowActionState | null>(null)
  const [actionText, setActionText] = useState('')
  const [signalTo, setSignalTo] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const projectOptions = useMemo(() => uniqueSorted([
    ...model.visibleProjects.map(project => textOf(project.id || project.name || project.displayName)),
    ...workflows.map(workflow => textOf(workflow.project)),
    ...model.tasks.map(task => textOf(task.project))
  ]), [model.tasks, model.visibleProjects, workflows])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredWorkflows = workflows.filter(workflow => {
    if (statusFilter !== 'all' && textOf(workflow.status, 'open') !== statusFilter) return false
    if (projectFilter !== 'all' && textOf(workflow.project) !== projectFilter) return false
    return !normalizedQuery || getWorkflowSearchText(workflow).includes(normalizedQuery)
  })

  const stageCounts = workflowStatusOptions.map(status => ({
    status,
    count: workflows.filter(workflow => textOf(workflow.status, 'open') === status).length
  }))

  const defaultProject = projectFilter !== 'all'
    ? projectFilter
    : projectOptions[0] || textOf(workflows[0]?.project, 'default')

  const openWorkflowForm = (workflow?: AnyRecord) => {
    setError('')
    setForm(createWorkflowForm(workflow, defaultProject))
    setFormOpen(true)
  }

  const updateFormField = (field: keyof WorkflowFormState, value: string) => {
    setForm(current => ({ ...current, [field]: value }))
  }

  const saveWorkflow = async () => {
    if (!form.title.trim()) {
      setError(`${copy.workflowTitle} ${copy.missing}`)
      return
    }
    setBusy('save')
    setError('')
    const body = {
      title: form.title.trim(),
      by: form.by.trim() || 'dashboard',
      from: form.by.trim() || 'dashboard',
      project: form.project.trim() || 'default',
      priority: form.priority || 'normal',
      status: form.status || 'open',
      planner: form.planner,
      executor: form.executor,
      reviewer: form.reviewer,
      observer: form.observer,
      plan: form.plan,
      acceptance: form.acceptance,
      risks: form.risks
    }
    try {
      if (form.id) {
        await apiPatch<AnyRecord>(`/api/workflows/${encodeURIComponent(form.id)}`, body)
      } else {
        await apiPost<AnyRecord>('/api/workflows', body)
      }
      setFormOpen(false)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const setWorkflowStatus = async (workflow: AnyRecord, status: string) => {
    const id = textOf(workflow.id)
    if (!id) return
    setBusy(`status:${id}:${status}`)
    setError('')
    try {
      await apiPost<AnyRecord>(`/api/workflows/${encodeURIComponent(id)}/status`, { status, by: 'dashboard' })
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const openWorkflowAction = (workflow: AnyRecord, action: WorkflowEntryAction) => {
    setError('')
    setActionText('')
    setSignalTo(action === 'signal' ? getWorkflowRoleValues(workflow, 'reviewer')[0] || getWorkflowRoleValues(workflow, 'executor')[0] || 'all' : '')
    setActionState({ workflow, action })
  }

  const submitWorkflowAction = async () => {
    if (!actionState) return
    const id = textOf(actionState.workflow.id)
    if (!id) return
    setBusy(`action:${id}:${actionState.action}`)
    setError('')
    try {
      if (actionState.action === 'delete') {
        await apiDelete<AnyRecord>(`/api/workflows/${encodeURIComponent(id)}`, { by: 'dashboard' })
      } else if (actionState.action === 'signal') {
        if (!signalTo.trim() || !actionText.trim()) {
          setError(`${copy.signalTo} / ${copy.actionText} ${copy.missing}`)
          return
        }
        await apiPost<AnyRecord>(`/api/workflows/${encodeURIComponent(id)}/signal`, {
          to: signalTo.trim(),
          text: actionText.trim(),
          type: 'handoff',
          by: 'dashboard'
        })
      } else {
        if (!actionText.trim()) {
          setError(`${copy.actionText} ${copy.missing}`)
          return
        }
        await apiPost<AnyRecord>(`/api/workflows/${encodeURIComponent(id)}/${actionState.action}`, {
          text: actionText.trim(),
          role: actionState.action === 'review' ? 'reviewer' : actionState.action === 'result' ? 'executor' : '',
          by: 'dashboard'
        })
      }
      setActionState(null)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack">
      <div className="dashboard-grid">
        <MetricCard label={copy.workflowTotal} value={formatNumber(workflows.length)} />
        <MetricCard label={copy.workflowActive} value={formatNumber(workflows.filter(workflow => ['open', 'planned', 'in_progress'].includes(textOf(workflow.status, 'open'))).length)} tone="success" />
        <MetricCard label={copy.workflowReview} value={formatNumber(workflows.filter(workflow => textOf(workflow.status) === 'review').length)} tone="warning" />
        <MetricCard label={copy.workflowBlocked} value={formatNumber(workflows.filter(workflow => textOf(workflow.status) === 'blocked').length)} />
      </div>

      <Panel title={copy.workflows}>
        <div className="section-actions">
          <button className="btn" type="button" onClick={() => openWorkflowForm()}>
            {copy.createWorkflow}
          </button>
        </div>
        <div className="workflow-stage-strip">
          <button className={`chip button-chip ${statusFilter === 'all' ? 'active' : ''}`} type="button" onClick={() => setStatusFilter('all')}>
            {copy.allStatuses} {formatNumber(workflows.length)}
          </button>
          {stageCounts.map(item => (
            <button className={`chip button-chip ${statusFilter === item.status ? 'active' : ''}`} type="button" key={item.status} onClick={() => setStatusFilter(item.status)}>
              {item.status} {formatNumber(item.count)}
            </button>
          ))}
        </div>
        <div className="form-grid workflow-filter-grid">
          <label className="field span-2">
            <span>{copy.searchText}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
          </label>
          <label className="field">
            <span>{copy.status}</span>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">{copy.allStatuses}</option>
              {workflowStatusOptions.map(status => <option value={status} key={status}>{status}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{copy.project}</span>
            <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
              <option value="all">{copy.allProjects}</option>
              {projectOptions.map(project => <option value={project} key={project}>{project}</option>)}
            </select>
          </label>
          <div className="form-actions">
            <button className="btn ghost" type="button" onClick={() => { setQuery(''); setStatusFilter('all'); setProjectFilter('all') }}>
              {copy.clear}
            </button>
          </div>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="workflow-list">
          {filteredWorkflows.length ? filteredWorkflows.map(workflow => (
            <WorkflowCard
              busy={busy}
              copy={copy}
              key={textOf(workflow.id)}
              workflow={workflow}
              onAction={openWorkflowAction}
              onEdit={openWorkflowForm}
              onStatus={setWorkflowStatus}
            />
          )) : <EmptyState text={workflows.length ? copy.noMatches : copy.noData} />}
        </div>
      </Panel>

      {formOpen ? (
        <Modal title={form.id ? copy.editWorkflow : copy.createWorkflow} onClose={() => setFormOpen(false)}>
          <div className="form-grid task-form-grid">
            <label className="field span-2">
              <span>{copy.workflowTitle}</span>
              <input value={form.title} onChange={event => updateFormField('title', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.createdBy}</span>
              <input value={form.by} onChange={event => updateFormField('by', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.project}</span>
              <input value={form.project} onChange={event => updateFormField('project', event.target.value)} list="workflow-project-options" />
            </label>
            <label className="field">
              <span>{copy.priority}</span>
              <select value={form.priority} onChange={event => updateFormField('priority', event.target.value)}>
                {workflowPriorityOptions.map(priority => <option value={priority} key={priority}>{priority}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{copy.status}</span>
              <select value={form.status} onChange={event => updateFormField('status', event.target.value)}>
                {workflowStatusOptions.map(status => <option value={status} key={status}>{status}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{copy.planner}</span>
              <input value={form.planner} onChange={event => updateFormField('planner', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.executor}</span>
              <input value={form.executor} onChange={event => updateFormField('executor', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.reviewer}</span>
              <input value={form.reviewer} onChange={event => updateFormField('reviewer', event.target.value)} />
            </label>
            <label className="field">
              <span>{copy.observer}</span>
              <input value={form.observer} onChange={event => updateFormField('observer', event.target.value)} />
            </label>
            <label className="field span-2">
              <span>{copy.workflowPlan}</span>
              <textarea value={form.plan} onChange={event => updateFormField('plan', event.target.value)} />
            </label>
            <label className="field span-2">
              <span>{copy.workflowAcceptance}</span>
              <textarea value={form.acceptance} onChange={event => updateFormField('acceptance', event.target.value)} />
            </label>
            <label className="field span-all">
              <span>{copy.workflowRisks}</span>
              <textarea value={form.risks} onChange={event => updateFormField('risks', event.target.value)} />
            </label>
            <datalist id="workflow-project-options">
              {projectOptions.map(project => <option value={project} key={project} />)}
            </datalist>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setFormOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" disabled={busy === 'save'} onClick={() => void saveWorkflow()}>
                {busy === 'save' ? copy.running : copy.save}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {actionState ? (
        <Modal title={getWorkflowActionTitle(actionState.action, copy)} onClose={() => setActionState(null)}>
          <div className="form-grid">
            <div className="workflow-action-summary span-all">
              <StatusBadge status={textOf(actionState.workflow.status, 'open')} />
              <strong>{textOf(actionState.workflow.title, '-')}</strong>
              <span>{textOf(actionState.workflow.project, '-')}</span>
            </div>
            {actionState.action === 'delete' ? (
              <p className="task-description span-all">{copy.confirmDeleteWorkflow}</p>
            ) : null}
            {actionState.action === 'signal' ? (
              <label className="field span-all">
                <span>{copy.signalTo}</span>
                <input value={signalTo} onChange={event => setSignalTo(event.target.value)} />
              </label>
            ) : null}
            {actionState.action !== 'delete' ? (
              <label className="field span-all">
                <span>{copy.actionText}</span>
                <textarea value={actionText} onChange={event => setActionText(event.target.value)} />
              </label>
            ) : null}
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setActionState(null)}>
                {copy.cancel}
              </button>
              <button className={`btn ${actionState.action === 'delete' ? 'danger' : ''}`} type="button" disabled={Boolean(busy)} onClick={() => void submitWorkflowAction()}>
                {busy ? copy.running : getWorkflowActionTitle(actionState.action, copy)}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function WorkflowCard({
  busy,
  copy,
  workflow,
  onAction,
  onEdit,
  onStatus
}: {
  busy: string
  copy: Copy
  workflow: AnyRecord
  onAction: (workflow: AnyRecord, action: WorkflowEntryAction) => void
  onEdit: (workflow: AnyRecord) => void
  onStatus: (workflow: AnyRecord, status: string) => Promise<void>
}) {
  const status = textOf(workflow.status, 'open')
  const priority = textOf(workflow.priority, 'normal')
  const roles = [
    [copy.planner, getWorkflowRoleValues(workflow, 'planner')],
    [copy.executor, getWorkflowRoleValues(workflow, 'executor')],
    [copy.reviewer, getWorkflowRoleValues(workflow, 'reviewer')],
    [copy.observer, getWorkflowRoleValues(workflow, 'observer')]
  ].filter(([, values]) => Array.isArray(values) && values.length > 0) as Array<[string, string[]]>
  const logs = collectWorkflowLogs(workflow, copy).slice(0, 8)
  const linkedItems = [
    ...asArray<string>(workflow.linkedTasks).map(item => `task:${item}`),
    ...asArray<string>(workflow.linkedRadio).map(item => `radio:${item}`)
  ]
  const canStart = !['in_progress', 'review', 'done', 'cancelled'].includes(status)
  const canReview = !['review', 'done', 'cancelled'].includes(status)
  const canDone = !['done', 'cancelled'].includes(status)
  const disabled = Boolean(busy)

  return (
    <article className="workflow-card">
      <header className="workflow-card-header">
        <div className="workflow-title-block">
          <h4>{textOf(workflow.title, '-')}</h4>
          <p>
            {copy.project}: {textOf(workflow.project, '-')} · {copy.priority}: {priority} · {copy.createdBy}: {textOf(workflow.createdBy, '-')}
          </p>
          <p>{copy.updated}: {formatDate(textOf(workflow.updatedAt || workflow.createdAt))}</p>
        </div>
        <div className="workflow-badges">
          <StatusBadge status={status} />
          <StatusBadge status={priority} />
        </div>
      </header>

      {roles.length ? (
        <div className="chip-list">
          {roles.map(([label, values]) => <span className="chip" key={label}>{label}: {values.join(', ')}</span>)}
        </div>
      ) : null}

      <WorkflowTextBlock label={copy.workflowPlan} value={workflow.plan} />
      <WorkflowTextBlock label={copy.workflowAcceptance} value={workflow.acceptance} />
      <WorkflowTextBlock label={copy.workflowRisks} value={workflow.risks} />

      {linkedItems.length ? (
        <div className="workflow-linked">
          <span>{copy.linkedItems}</span>
          <div className="chip-list">
            {linkedItems.map(item => <span className="chip" key={item}>{item}</span>)}
          </div>
        </div>
      ) : null}

      <details className="workflow-details">
        <summary>{copy.workflowLogs}</summary>
        <div className="task-notes">
          {logs.length ? logs.map((entry, indexValue) => (
            <p key={`${entry.type}-${entry.ts}-${indexValue}`}>
              <span>{[entry.type, entry.role, entry.by, formatDate(entry.ts)].filter(Boolean).join(' · ')}</span>
              <span>{entry.text}</span>
            </p>
          )) : <span>{copy.noData}</span>}
        </div>
      </details>

      <div className="workflow-actions">
        {canStart ? (
          <button className="btn small" type="button" disabled={disabled} onClick={() => void onStatus(workflow, 'in_progress')}>
            {copy.startWorkflow}
          </button>
        ) : null}
        {canReview ? (
          <button className="btn small ghost" type="button" disabled={disabled} onClick={() => void onStatus(workflow, 'review')}>
            {copy.markReview}
          </button>
        ) : null}
        {canDone ? (
          <button className="btn small" type="button" disabled={disabled} onClick={() => void onStatus(workflow, 'done')}>
            {copy.markDone}
          </button>
        ) : null}
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onEdit(workflow)}>
          {copy.editWorkflow}
        </button>
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onAction(workflow, 'result')}>
          {copy.workflowResult}
        </button>
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onAction(workflow, 'review')}>
          {copy.workflowReview}
        </button>
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onAction(workflow, 'note')}>
          {copy.workflowNote}
        </button>
        <button className="btn small ghost" type="button" disabled={disabled} onClick={() => onAction(workflow, 'signal')}>
          {copy.workflowSignal}
        </button>
        <button className="btn small danger" type="button" disabled={disabled} onClick={() => onAction(workflow, 'delete')}>
          {copy.deleteWorkflow}
        </button>
      </div>
    </article>
  )
}

function WorkflowTextBlock({ label, value }: { label: string; value: unknown }) {
  const text = Array.isArray(value)
    ? value.map(item => textOf(item)).filter(Boolean).join('\n')
    : textOf(value).trim()
  if (!text) return null
  return (
    <div className="workflow-text-block">
      <strong>{label}</strong>
      <p>{text}</p>
    </div>
  )
}

function createWorkflowForm(workflow?: AnyRecord, defaultProject = 'default'): WorkflowFormState {
  return {
    id: textOf(workflow?.id),
    title: textOf(workflow?.title),
    by: textOf(workflow?.createdBy, 'dashboard'),
    project: textOf(workflow?.project, defaultProject),
    priority: textOf(workflow?.priority, 'normal'),
    status: textOf(workflow?.status, 'open'),
    planner: getWorkflowRoleValues(workflow, 'planner').join(', '),
    executor: getWorkflowRoleValues(workflow, 'executor').join(', '),
    reviewer: getWorkflowRoleValues(workflow, 'reviewer').join(', '),
    observer: getWorkflowRoleValues(workflow, 'observer').join(', '),
    plan: textOf(workflow?.plan),
    acceptance: textOf(workflow?.acceptance),
    risks: Array.isArray(workflow?.risks)
      ? workflow.risks.map(item => textOf(item)).filter(Boolean).join('\n')
      : textOf(workflow?.risks)
  }
}

function getWorkflowActionTitle(action: WorkflowEntryAction, copy: Copy): string {
  if (action === 'result') return copy.workflowResult
  if (action === 'review') return copy.workflowReview
  if (action === 'note') return copy.workflowNote
  if (action === 'signal') return copy.workflowSignal
  return copy.confirmDelete
}

function getWorkflowRoleValues(workflow: AnyRecord | undefined, role: string): string[] {
  const value = workflow?.[role]
  if (Array.isArray(value)) {
    return value.map(item => textOf(item).trim()).filter(Boolean)
  }
  return textOf(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function getWorkflowSearchText(workflow: AnyRecord): string {
  const logs = ['results', 'reviews', 'notes']
    .flatMap(field => asArray<AnyRecord>(workflow[field]))
    .map(item => [item.by, item.from, item.role, item.text].map(value => textOf(value)).filter(Boolean).join(' '))
  return [
    workflow.id,
    workflow.title,
    workflow.project,
    workflow.status,
    workflow.priority,
    workflow.createdBy,
    workflow.plan,
    workflow.acceptance,
    summarizeRoles(workflow),
    ...asArray<string>(workflow.risks),
    ...logs
  ].map(value => textOf(value)).filter(Boolean).join(' ').toLowerCase()
}

function collectWorkflowLogs(workflow: AnyRecord, copy: Copy): Array<{ type: string; ts: string; by: string; role: string; text: string }> {
  const normalizeEntries = (items: unknown, type: string) => asArray<AnyRecord>(items)
    .map(item => ({
      type,
      ts: textOf(item.ts || item.createdAt || item.updatedAt),
      by: textOf(item.by || item.from),
      role: textOf(item.role),
      text: textOf(item.text)
    }))
    .filter(item => item.text || item.by || item.role)
  return [
    ...normalizeEntries(workflow.results, copy.workflowResult),
    ...normalizeEntries(workflow.reviews, copy.workflowReview),
    ...normalizeEntries(workflow.notes, copy.workflowNote)
  ].sort((left, right) => right.ts.localeCompare(left.ts))
}

function AnalyticsPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  const statusTasks = asRecord(model.status.tasks)
  const relayStatus = asRecord(model.status.relay)
  const toolSummary = asRecord(model.status.toolSummary)
  const backupRetention = asRecord(model.backups.retention)
  const taskStatus = countValues(model.tasks.map(task => textOf(task.status, 'open')))
  const radioTypes = countValues(model.radio.map(message => textOf(message.type, 'note')))
  const projectCounts = countValues([
    ...model.tasks.map(task => textOf(task.project)),
    ...model.radio.map(message => textOf(message.project)),
    ...model.workflows.map(workflow => textOf(workflow.project))
  ], 10)
  const relayCounts = ['pending', 'dispatched', 'acked', 'progress', 'retrying', 'failed', 'completed', 'abandoned']
    .map(key => ({ key, count: numberOf(relayStatus[key]) }))
    .filter(item => item.count > 0)

  return (
    <div className="stack">
      <div className="dashboard-grid">
        <MetricCard label={copy.totalTasks} value={formatNumber(statusTasks.total)} />
        <MetricCard label={copy.activeTasks} value={formatNumber(statusTasks.active)} tone="success" />
        <MetricCard label={copy.relayRate} value={textOf(asRecord(model.metrics.relay).successRate, '0%')} tone="warning" />
        <MetricCard label={copy.backupSets} value={formatNumber(model.backups.count ?? model.status.backups)} />
        <MetricCard label={copy.storageUsed} value={textOf(model.backups.totalDisplay, '-')} />
        <MetricCard label={copy.toolsReady} value={formatNumber(toolSummary.runnable)} />
      </div>
      <div className="panel-grid two">
        <Panel title={copy.tasksByStatus}>
          <BarList items={taskStatus} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.radioByType}>
          <BarList items={radioTypes} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.relayByState}>
          <BarList items={relayCounts} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.topProjects}>
          <BarList items={projectCounts} emptyText={copy.noData} />
        </Panel>
        <Panel title={copy.toolAutomation}>
          <div className="property-grid">
            <Property label={copy.installed} value={formatNumber(toolSummary.detected)} />
            <Property label={copy.configured} value={formatNumber(toolSummary.configured)} />
            <Property label={copy.runnable} value={formatNumber(toolSummary.runnable)} />
            <Property label={copy.missing} value={formatNumber(toolSummary.missing)} />
          </div>
        </Panel>
        <Panel title={copy.backupStorage}>
          <div className="property-grid">
            <Property label={copy.retained} value={formatNumber(backupRetention.keep)} />
            <Property label={copy.pruneCandidates} value={formatNumber(backupRetention.prune)} />
            <Property label={copy.storageUsed} value={textOf(model.backups.totalDisplay, '-')} />
            <Property label={copy.backupSets} value={formatNumber(model.backups.count ?? model.status.backups)} />
          </div>
        </Panel>
      </div>
    </div>
  )
}

function BackupsPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [backups, setBackups] = useState<AnyRecord>(model.backups)
  const [selectedName, setSelectedName] = useState('')
  const [detail, setDetail] = useState<AnyRecord | null>(null)
  const [restorePlan, setRestorePlan] = useState<AnyRecord | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [reason, setReason] = useState('dashboard-manual')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const backupList = asArray<AnyRecord>(backups.backups)

  const loadBackups = useCallback(async () => {
    setBusy('load')
    setError('')
    try {
      const nextBackups = await apiGet<AnyRecord>('/api/backups')
      setBackups(nextBackups)
      if (!selectedName) {
        setSelectedName(textOf(asArray<AnyRecord>(nextBackups.backups)[0]?.name))
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }, [selectedName])

  const activeBackupName = selectedName || textOf(backupList[0]?.name)

  const createBackup = async () => {
    const nextReason = reason.trim() || 'dashboard-manual'
    setBusy('create')
    setError('')
    try {
      const result = await apiPost<AnyRecord>('/api/backups/create', { reason: nextReason })
      setBackups(asRecord(result.backups))
      setReason(nextReason)
      setCreateOpen(false)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const inspectBackup = async (name: string) => {
    if (!name) return
    setSelectedName(name)
    setBusy(`detail:${name}`)
    setError('')
    try {
      const nextDetail = await apiGet<AnyRecord>(`/api/backups/detail?name=${encodeURIComponent(name)}`)
      setDetail(nextDetail)
      setRestorePlan(asRecord(nextDetail.restore))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const previewRestore = async (name: string) => {
    if (!name) return
    setSelectedName(name)
    setBusy(`restore:${name}`)
    setError('')
    try {
      const result = await apiPost<AnyRecord>('/api/backups/restore', { name, apply: false })
      setRestorePlan(asRecord(result.plan))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const policy = asRecord(backups.policy)
  const retention = asRecord(backups.retention)
  const selectedFiles = asArray<AnyRecord>(detail?.files)
  const summary = asRecord(restorePlan?.summary)

  return (
    <div className="stack">
      <div className="dashboard-grid">
        <MetricCard label={copy.backupSets} value={formatNumber(backups.count ?? model.status.backups)} />
        <MetricCard label={copy.storageUsed} value={textOf(backups.totalDisplay, '-')} />
        <MetricCard label={copy.retained} value={formatNumber(retention.keep)} tone="success" />
        <MetricCard label={copy.pruneCandidates} value={formatNumber(retention.prune)} tone="warning" />
      </div>
      <Panel title={copy.backupPolicy}>
        <div className="section-actions">
          <button className="btn ghost" type="button" onClick={() => void loadBackups()} disabled={Boolean(busy)}>
            {busy === 'load' ? copy.running : copy.refresh}
          </button>
          <button className="btn" type="button" onClick={() => { setError(''); setCreateOpen(true) }}>
            {copy.createBackup}
          </button>
        </div>
        <div className="property-grid settings-grid">
          <Property label={copy.daily} value={formatNumber(policy.daily)} />
          <Property label={copy.weekly} value={formatNumber(policy.weekly)} />
          <Property label={copy.preSync} value={formatNumber(policy.preSync)} />
          <Property label={copy.pruneCandidates} value={textOf(retention.pruneDisplay, '-')} />
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
      </Panel>
      <div className="panel-grid two">
        <Panel title={copy.backupSets}>
          <div className="backup-list">
            {backupList.length ? backupList.map(backup => {
              const name = textOf(backup.name)
              const active = name === selectedName
              return (
                <article className={`backup-row ${active ? 'active' : ''}`} key={name}>
                  <div>
                    <strong>{name || '-'}</strong>
                    <p>{[formatDate(textOf(backup.createdAt)), textOf(backup.reason), textOf(backup.display)].filter(Boolean).join(' · ')}</p>
                    <p>{asArray<string>(backup.files).slice(0, 6).join(', ')}</p>
                  </div>
                  <div className="backup-row-actions">
                    <StatusBadge status={textOf(backup.retention, 'keep')} />
                    <button className="btn small ghost" type="button" disabled={busy === `detail:${name}`} onClick={() => void inspectBackup(name)}>
                      {copy.inspectBackup}
                    </button>
                    <button className="btn small ghost" type="button" disabled={busy === `restore:${name}`} onClick={() => void previewRestore(name)}>
                      {copy.previewRestore}
                    </button>
                  </div>
                </article>
              )
            }) : <EmptyState text={copy.noData} />}
          </div>
        </Panel>
      <Panel title={copy.restoreSummary}>
          {restorePlan ? (
            <div className="property-grid">
              <Property label={copy.changed} value={formatNumber(summary.changed)} />
              <Property label={copy.different} value={formatNumber(summary.different)} />
              <Property label={copy.missingCurrent} value={formatNumber(summary.missingCurrent)} />
              <Property label={copy.unchanged} value={formatNumber(summary.unchanged)} />
              <Property label={copy.bytes} value={textOf(summary.display, '-')} />
              <Property label={copy.title} value={textOf(restorePlan.name, '-')} />
            </div>
          ) : (
            <EmptyState text={activeBackupName ? copy.previewRestore : copy.noData} />
          )}
        </Panel>
      </div>
      <Panel title={copy.backupFiles}>
        <DataTable
          emptyText={copy.noData}
          columns={[copy.status, copy.path, copy.type, copy.bytes]}
          rows={selectedFiles.map(file => [
            <StatusBadge status={textOf(file.status, 'file')} />,
            textOf(file.name, '-'),
            textOf(file.kind, '-'),
            textOf(file.display, '-')
          ])}
        />
      </Panel>
      {createOpen ? (
        <Modal title={copy.createBackup} onClose={() => setCreateOpen(false)}>
          <div className="form-grid">
            <label className="field span-all">
              <span>{copy.backupReason}</span>
              <input value={reason} onChange={event => setReason(event.target.value)} />
            </label>
            {error ? <div className="inline-error span-all">{error}</div> : null}
            <div className="form-actions span-all">
              <button className="btn ghost" type="button" onClick={() => setCreateOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" disabled={busy === 'create'} onClick={() => void createBackup()}>
                {busy === 'create' ? copy.running : copy.createBackup}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function SearchPanel({ copy }: { copy: Copy }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [range, setRange] = useState('all')
  const [sort, setSort] = useState('relevance')
  const [tag, setTag] = useState('')
  const [payload, setPayload] = useState<AnyRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runSearch = useCallback(async (overrides: Partial<{ query: string; type: string; range: string; sort: string; tag: string }> = {}) => {
    const nextQuery = overrides.query ?? query
    const nextType = overrides.type ?? type
    const nextRange = overrides.range ?? range
    const nextSort = overrides.sort ?? sort
    const nextTag = overrides.tag ?? tag
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ q: nextQuery, type: nextType, range: nextRange, sort: nextSort, tag: nextTag, limit: '80' })
      setPayload(await apiGet<AnyRecord>(`/api/search?${params.toString()}`))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [query, range, sort, tag, type])

  useEffect(() => {
    let active = true
    void apiGet<AnyRecord>('/api/search?limit=0')
      .then(nextPayload => {
        if (active) setPayload(nextPayload)
      })
      .catch(nextError => {
        if (active) setError(nextError instanceof Error ? nextError.message : String(nextError))
      })
    return () => {
      active = false
    }
  }, [])

  const facets = asRecord(payload?.facets)
  const types = asArray<AnyRecord>(facets.types)
  const tags = asArray<AnyRecord>(facets.tags)
  const projects = asArray<AnyRecord>(facets.projects)
  const results = asArray<AnyRecord>(payload?.results)

  return (
    <div className="stack">
      <Panel title={copy.globalSearch}>
        <div className="form-grid search-control-grid">
          <label className="field span-2">
            <span>{copy.searchText}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
          </label>
          <label className="field">
            <span>{copy.type}</span>
            <select value={type} onChange={event => setType(event.target.value)}>
              <option value="all">{copy.allTypes}</option>
              <option value="memory">memory</option>
              <option value="task">task</option>
              <option value="radio">radio</option>
              <option value="workflow">workflow</option>
            </select>
          </label>
          <label className="field">
            <span>{copy.range}</span>
            <select value={range} onChange={event => setRange(event.target.value)}>
              <option value="all">{copy.allRanges}</option>
              <option value="24h">{copy.last24h}</option>
              <option value="7d">{copy.last7d}</option>
              <option value="30d">{copy.last30d}</option>
              <option value="90d">{copy.last90d}</option>
            </select>
          </label>
          <label className="field">
            <span>{copy.sort}</span>
            <select value={sort} onChange={event => setSort(event.target.value)}>
              <option value="relevance">{copy.relevance}</option>
              <option value="newest">{copy.newest}</option>
              <option value="oldest">{copy.oldest}</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="btn ghost" type="button" onClick={() => { setQuery(''); setType('all'); setRange('all'); setSort('relevance'); setTag('') }}>
              {copy.clear}
            </button>
            <button className="btn" type="button" onClick={() => void runSearch()} disabled={loading}>
              {loading ? copy.running : copy.globalSearch}
            </button>
          </div>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
      </Panel>
      <div className="dashboard-grid">
        <MetricCard label={copy.resultCount} value={formatNumber(payload?.count)} />
        <MetricCard label={copy.elapsed} value={`${formatNumber(payload?.elapsedMs)} ms`} />
        <MetricCard label={copy.type} value={type} />
        <MetricCard label={copy.tags} value={tag || '-'} />
      </div>
      <div className="panel-grid two">
        <Panel title={copy.facets}>
          <div className="facet-group">
            <h4>{copy.type}</h4>
            <div className="chip-list">
              {types.map(item => <button className="chip button-chip" type="button" key={textOf(item.key)} onClick={() => setType(textOf(item.key, 'all'))}>{textOf(item.label || item.key)} {formatNumber(item.count)}</button>)}
            </div>
          </div>
          <div className="facet-group">
            <h4>{copy.tags}</h4>
            <div className="chip-list">
              {tags.length ? tags.slice(0, 24).map(item => (
                <button className={`chip button-chip ${tag === textOf(item.key) ? 'active' : ''}`} type="button" key={textOf(item.key)} onClick={() => setTag(textOf(item.key))}>
                  {textOf(item.key)} {formatNumber(item.count)}
                </button>
              )) : <EmptyState text={copy.noData} />}
            </div>
          </div>
          <div className="facet-group">
            <h4>{copy.project}</h4>
            <div className="chip-list">
              {projects.length ? projects.slice(0, 16).map(item => <span className="chip" key={textOf(item.key)}>{textOf(item.key)} {formatNumber(item.count)}</span>) : <EmptyState text={copy.noData} />}
            </div>
          </div>
        </Panel>
        <Panel title={copy.results}>
          <div className="search-results">
            {results.length ? results.map((result, indexValue) => {
              const meta = asRecord(result.meta)
              return (
                <article className="search-result-card" key={`${textOf(result.kind)}-${textOf(meta.id)}-${indexValue}`}>
                  <div className="search-result-header">
                    <StatusBadge status={textOf(result.kind, 'result')} />
                    <strong>{textOf(result.title, '-')}</strong>
                    <span>{formatDate(textOf(result.ts))}</span>
                  </div>
                  <p>{textOf(result.preview || result.text, '-')}</p>
                  <div className="chip-list">
                    {textOf(meta.project) ? <span className="chip">{textOf(meta.project)}</span> : null}
                    {asArray<string>(result.tags).slice(0, 6).map(item => <span className="chip" key={item}>{item}</span>)}
                    <span className="chip">{copy.score}: {formatNumber(result.score)}</span>
                  </div>
                </article>
              )
            }) : <EmptyState text={copy.noData} />}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function ToolsPanel({
  copy,
  language,
  model,
  onRefresh
}: {
  copy: Copy
  language: Language
  model: ViewModel
  onRefresh: () => Promise<void>
}) {
  const [toolsOverride, setToolsOverride] = useState<AnyRecord[] | null>(null)
  const [summaryOverride, setSummaryOverride] = useState<AnyRecord | null>(null)
  const [capabilitiesOverride, setCapabilitiesOverride] = useState<AnyRecord | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedTool, setSelectedTool] = useState<AnyRecord | null>(null)
  const [localPreview, setLocalPreview] = useState<AnyRecord | null>(null)
  const [globalPreview, setGlobalPreview] = useState<AnyRecord | null>(null)
  const [lastInstallFile, setLastInstallFile] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const tools = toolsOverride ?? model.tools
  const summary = summaryOverride ?? model.toolSummary
  const capabilities = capabilitiesOverride ?? asRecord(model.toolSummary.capabilities || model.status.capabilitySummary)

  const filteredTools = tools.filter(tool => {
    if (!toolMatchesStatusFilter(tool, statusFilter)) return false
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return [
      tool.name,
      tool.kind,
      tool.connectionStatus,
      tool.runnerReason,
      tool.action,
      textOf(asRecord(tool.health).status),
      textOf(asRecord(tool.capability).integrationMode)
    ].map(value => textOf(value).toLowerCase()).join(' ').includes(needle)
  })

  const refreshTools = async (forceRefresh = false) => {
    setBusy(forceRefresh ? 'tools-refresh' : 'tools-load')
    setError('')
    try {
      const payload = await apiGet<AnyRecord>(`/api/tools${forceRefresh ? '?refresh=1' : ''}`)
      setToolsOverride(asArray<AnyRecord>(payload.tools))
      setSummaryOverride(asRecord(payload.summary))
      setCapabilitiesOverride(asRecord(payload.capabilities || asRecord(payload.summary).capabilities))
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const detectTools = async () => {
    setBusy('detect')
    setError('')
    try {
      const payload = await apiGet<AnyRecord>('/api/detect')
      setToolsOverride(asArray<AnyRecord>(payload.tools))
      setSummaryOverride(asRecord(payload.summary))
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const refreshCapabilities = async () => {
    setBusy('capabilities')
    setError('')
    try {
      const payload = await apiGet<AnyRecord>('/api/capabilities?refresh=1')
      setCapabilitiesOverride(payload)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const openToolModal = async (tool: AnyRecord) => {
    setSelectedTool(tool)
    setLocalPreview(null)
    setGlobalPreview(null)
    setLastInstallFile('')
    setError('')
    setBusy('preview')
    const toolName = textOf(tool.name)
    try {
      const [localResult, globalResult] = await Promise.all([
        apiGet<AnyRecord>(`/api/install/preview?tool=${encodeURIComponent(toolName)}&scope=local`).catch(() => null),
        apiGet<AnyRecord>(`/api/install/preview?tool=${encodeURIComponent(toolName)}&scope=global`).catch(() => null)
      ])
      setLocalPreview(localResult)
      setGlobalPreview(globalResult)
    } finally {
      setBusy('')
    }
  }

  const applyToolRules = async (scope: 'local' | 'global') => {
    if (!selectedTool) return
    const toolName = textOf(selectedTool.name)
    setBusy(`install:${scope}`)
    setError('')
    setLastInstallFile('')
    try {
      const result = await apiPost<AnyRecord>('/api/install/apply', { tool: toolName, scope })
      await openToolModal(selectedTool)
      setLastInstallFile(textOf(result.file, '-'))
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const activeSummary = summary.total ? summary : {
    total: tools.length,
    detected: tools.filter(tool => boolOf(tool.installed || tool.connected)).length,
    configured: tools.filter(tool => boolOf(tool.configured)).length,
    runnable: tools.filter(tool => boolOf(tool.runnable)).length,
    missing: tools.filter(tool => !boolOf(tool.installed)).length
  }
  const runs = asRecord(activeSummary.runs)
  const selectedCapability = asRecord(selectedTool?.capability)
  const selectedConfig = asRecord(selectedTool?.config)
  const selectedHealth = asRecord(selectedTool?.health)

  return (
    <div className="stack">
      <div className="dashboard-grid">
        <MetricCard label={copy.toolReadiness} value={`${formatNumber(activeSummary.runnable)}/${formatNumber(activeSummary.total || tools.length)}`} tone="success" />
        <MetricCard label={copy.installed} value={formatNumber(activeSummary.detected)} />
        <MetricCard label={copy.configured} value={formatNumber(activeSummary.configured)} />
        <MetricCard label={copy.missing} value={formatNumber(activeSummary.missing)} tone="warning" />
        <MetricCard label={copy.successRate} value={formatPercent(runs.successRate)} />
        <MetricCard label={copy.activeDispatches} value={formatNumber(activeSummary.activeDispatches)} />
      </div>

      <Panel title={copy.toolReadiness}>
        <div className="section-actions">
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void refreshTools(true)}>
            {busy === 'tools-refresh' ? copy.running : copy.refreshTools}
          </button>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void detectTools()}>
            {busy === 'detect' ? copy.running : copy.detectTools}
          </button>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void refreshCapabilities()}>
            {busy === 'capabilities' ? copy.running : copy.refreshCapabilities}
          </button>
        </div>
        <div className="form-grid tool-filter-grid">
          <label className="field span-2">
            <span>{copy.searchText}</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
          </label>
          <label className="field">
            <span>{copy.status}</span>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">{copy.toolFilterAll}</option>
              <option value="ready">{copy.toolFilterReady}</option>
              <option value="connected">{copy.toolFilterConnected}</option>
              <option value="runnable">{copy.toolFilterRunnable}</option>
              <option value="needs">{copy.toolFilterNeeds}</option>
              <option value="missing">{copy.toolFilterMissing}</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="btn ghost" type="button" onClick={() => { setQuery(''); setStatusFilter('all') }}>
              {copy.clear}
            </button>
          </div>
        </div>
        <div className="property-grid settings-grid tool-capability-summary">
          <Property label={copy.directCli} value={formatNumber(capabilities.directCliProfiles)} />
          <Property label={copy.autoDispatchLabel} value={formatNumber(capabilities.autoDispatch)} />
          <Property label={copy.sharedState} value={formatNumber(capabilities.sharedState)} />
          <Property label={copy.capabilitySummary} value={formatNumber(capabilities.total)} />
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
      </Panel>

      <Panel title={copy.toolInventory}>
        <div className="table-wrap tools-table-wrap">
          {filteredTools.length ? (
            <table className="tools-table">
              <thead>
                <tr>
                  <th>{copy.toolName}</th>
                  <th>{copy.status}</th>
                  <th>{copy.mode}</th>
                  <th>{copy.runnable}</th>
                  <th>{copy.totalRuns}</th>
                  <th>{copy.successRate}</th>
                  <th>{copy.lastRun}</th>
                  <th>{copy.toolDetail}</th>
                  <th>{copy.manageConfig}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTools.map(tool => {
                  const capability = asRecord(tool.capability)
                  const config = asRecord(tool.config)
                  const health = asRecord(tool.health)
                  const metrics = asRecord(tool.metrics)
                  const performance = asRecord(tool.performance)
                  const toolName = textOf(tool.name)
                  const kind = textOf(tool.kind || toolKinds[toolName.toLowerCase()])
                  const detail = textOf(config.action || tool.action || tool.runnerReason || asArray<string>(health.reasons)[0], '-')
                  const command = textOf(tool.runnerCommand || config.runnerCommand || tool.runnerProfile || config.runnerCommandKind)
                  return (
                    <tr key={toolName}>
                      <td>
                        <div className="tool-cell">
                          <ToolIcon name={toolName} kind={kind} size={34} />
                          <div className="tool-cell-copy">
                            <strong>{getToolDisplayName(toolName, language)}</strong>
                            <span>{toolName}</span>
                          </div>
                        </div>
                      </td>
                      <td><StatusBadge status={getToolStatus(tool)} /></td>
                      <td>
                        <div className="tool-mode-cell">
                          <span className={`tool-kind-badge ${getToolKindClass(kind)}`}>{getToolKindLabel(kind, language)}</span>
                          <span>{textOf(capability.integrationMode, '-')}</span>
                        </div>
                      </td>
                      <td>
                        <div className="tool-flags">
                          <ToolFlag label={copy.installed} value={boolOf(tool.installed || tool.connected)} />
                          <ToolFlag label={copy.configured} value={boolOf(tool.configured)} />
                          <ToolFlag label={copy.runnable} value={boolOf(tool.runnable || capability.autoDispatch)} />
                        </div>
                      </td>
                      <td className="number-cell">
                        <strong>{formatNumber(metrics.totalRuns)}</strong>
                        <span>{formatDurationMs(performance.avgDurationMs)}</span>
                      </td>
                      <td>{formatPercent(performance.successRate)}</td>
                      <td>{formatDate(textOf(performance.lastRunAt))}</td>
                      <td>
                        <div className="tool-detail-cell">
                          <span>{detail}</span>
                          {command ? <code>{command}</code> : null}
                        </div>
                      </td>
                      <td>
                        <button className="btn small ghost" type="button" onClick={() => void openToolModal(tool)}>
                          {copy.manageConfig}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <EmptyState text={tools.length ? copy.noMatches : copy.noData} />}
        </div>
      </Panel>

      {selectedTool ? (
        <Modal title={`${copy.manageConfig}: ${textOf(selectedTool.name, '-')}`} onClose={() => setSelectedTool(null)}>
          <div className="stack">
            <div className="workflow-action-summary">
              <ToolIcon name={textOf(selectedTool.name)} kind={textOf(selectedTool.kind)} size={32} />
              <StatusBadge status={getToolStatus(selectedTool)} />
              <strong>{textOf(selectedTool.name, '-')}</strong>
              <span>{textOf(selectedTool.kind, '-')}</span>
            </div>
            <div className="property-grid">
              <Property label={copy.mode} value={textOf(selectedCapability.integrationMode, '-')} />
              <Property label={copy.runner} value={textOf(selectedTool.runnerProfile || selectedConfig.runnerCommandKind, '-')} />
              <Property label={copy.command} value={textOf(selectedTool.runnerCommand || selectedConfig.runnerCommand, '-')} />
              <Property label={copy.path} value={textOf(selectedTool.dir || selectedConfig.instructionFile, '-')} />
              <Property label={copy.capability} value={asArray<string>(selectedCapability.capabilities).join(', ') || '-'} />
              <Property label={copy.healthReasons} value={asArray<string>(selectedHealth.reasons).join(' · ') || '-'} />
            </div>
            {lastInstallFile ? <div className="notice"><span>{copy.changed}: {lastInstallFile}</span></div> : null}
            {error ? <div className="inline-error">{error}</div> : null}
            <div className="tool-preview-grid">
              <ToolPreviewCard
                busy={busy}
                copy={copy}
                disabled={!localPreview}
                label={copy.localTarget}
                onApply={() => void applyToolRules('local')}
                preview={localPreview}
                primaryLabel={copy.installLocal}
              />
              <ToolPreviewCard
                busy={busy}
                copy={copy}
                disabled={!globalPreview}
                label={copy.globalTarget}
                onApply={() => void applyToolRules('global')}
                preview={globalPreview}
                primaryLabel={copy.installGlobal}
              />
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function ToolPreviewCard({
  busy,
  copy,
  disabled,
  label,
  onApply,
  preview,
  primaryLabel
}: {
  busy: string
  copy: Copy
  disabled: boolean
  label: string
  onApply: () => void
  preview: AnyRecord | null
  primaryLabel: string
}) {
  return (
    <section className="tool-preview-card">
      <div className="tool-preview-header">
        <strong>{label}</strong>
        <button className="btn small" type="button" disabled={disabled || Boolean(busy)} onClick={onApply}>
          {busy.startsWith('install') ? copy.running : primaryLabel}
        </button>
      </div>
      <p>{preview ? textOf(preview.file, '-') : copy.previewUnavailable}</p>
      <pre className="text-snapshot small">{preview ? textOf(preview.snippet, '-') : copy.previewUnavailable}</pre>
    </section>
  )
}

function ToolIcon({ name, kind, size = 32 }: { name: string; kind?: string; size?: number }) {
  const cleanName = name.toLowerCase().trim()
  const [failed, setFailed] = useState(false)
  const iconPath = toolIconFiles[cleanName]
  const iconSrc = iconPath && !failed ? `${iconPath}?v=${toolIconAssetVersion}` : ''
  const resolvedKind = kind || toolKinds[cleanName] || ''

  return (
    <span className="tool-icon-wrapper" style={{ width: size, height: size }}>
      {!iconSrc ? (
        <span className="tool-icon-fallback" style={{ background: getFallbackGradient(cleanName), fontSize: Math.round(size * 0.52) }}>
          {getFallbackChar(cleanName)}
        </span>
      ) : null}
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : null}
      {resolvedKind ? <ToolIconCornerBadge kind={resolvedKind} /> : null}
    </span>
  )
}

function ToolIconCornerBadge({ kind }: { kind: string }) {
  if (kind === 'cli-config') {
    return (
      <span className="tool-icon-corner-badge cli" title="CLI">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2.5 3.5l1.5 1.5-1.5 1.5M4.5 6.5h3" />
        </svg>
      </span>
    )
  }
  if (kind === 'editor-state') {
    return (
      <span className="tool-icon-corner-badge editor" title="Editor">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M3 2.5l-2 2.5 2 2.5M7 2.5l2 2.5-2 2.5" />
        </svg>
      </span>
    )
  }
  if (kind === 'extension-state') {
    return (
      <span className="tool-icon-corner-badge extension" title="Extension">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M5 2v6M2 5h6" />
        </svg>
      </span>
    )
  }
  if (kind === 'app-state' || kind === 'local-model-runtime') {
    return (
      <span className="tool-icon-corner-badge app" title="App">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <rect x="2" y="2" width="6" height="4.5" rx="0.8" />
          <path d="M3.5 6.5h3M5 6.3V8" />
        </svg>
      </span>
    )
  }
  return null
}

function ToolFlag({ label, value }: { label: string; value: boolean }) {
  return (
    <span className={`tool-flag ${value ? 'on' : 'off'}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  )
}

function getToolDisplayName(toolName: string, language: Language): string {
  const cleanName = toolName.toLowerCase().trim()
  return toolDisplayNames[language]?.[cleanName] || toolName || '-'
}

function getToolKindLabel(kind: string, language: Language): string {
  const cleanKind = kind.toLowerCase().trim()
  return toolKindBadges[language]?.[cleanKind] || kind || '-'
}

function getToolKindClass(kind: string): string {
  return `kind-${kind.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unknown'}`
}

function getFallbackChar(name: string): string {
  return (name || '?').charAt(0).toUpperCase()
}

function getFallbackGradient(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash)
  }
  const gradients = [
    'linear-gradient(135deg, #388bfd, #bc8cff)',
    'linear-gradient(135deg, #10a37f, #0e7f62)',
    'linear-gradient(135deg, #ea7a50, #d9531e)',
    'linear-gradient(135deg, #00a7c8, #4f7cff)',
    'linear-gradient(135deg, #e5534b, #8f1f1f)',
    'linear-gradient(135deg, #cf3d73, #7d2f99)',
    'linear-gradient(135deg, #c98518, #8c4f12)',
    'linear-gradient(135deg, #7b61ff, #d65db1)'
  ]
  return gradients[Math.abs(hash) % gradients.length]
}

function ProjectsPanel({ copy, model }: { copy: Copy; model: ViewModel }) {
  return (
    <div className="panel-grid two">
      <Panel title={copy.visibleProjects}>
        <DataTable
          emptyText={copy.noData}
          columns={[copy.status, copy.project, copy.title]}
          rows={model.visibleProjects.map(project => [
            <StatusBadge status={textOf(project.status, 'active')} />,
            textOf(project.id || project.name, '-'),
            textOf(project.displayName || project.description, '-')
          ])}
        />
      </Panel>
      <Panel title={copy.unregisteredProjects}>
        <div className="chip-list">
          {model.unregisteredProjects.length ? model.unregisteredProjects.map(project => (
            <span className="chip" key={project}>{project}</span>
          )) : <EmptyState text={copy.noData} />}
        </div>
      </Panel>
    </div>
  )
}

interface SettingsFormState {
  snapshotLimit: string
  coreLimit: string
  recentLimit: string
  lockStaleMs: string
  autoRefresh: boolean
  refreshIntervalMs: string
  language: string
  theme: string
  notifications: boolean
  shortcutsEnabled: boolean
  daily: string
  weekly: string
  preSync: string
  pruneAfterSync: boolean
}

function HealthPanel({
  copy,
  model,
  health,
  onRefresh
}: {
  copy: Copy
  model: ViewModel
  health: AnyRecord | null
  onRefresh: () => Promise<void>
}) {
  const [localReport, setLocalReport] = useState<AnyRecord | null>(null)
  const [repairPreview, setRepairPreview] = useState<AnyRecord | null>(null)
  const [repairLimit, setRepairLimit] = useState('10')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const report = localReport ?? health
  const analysis = asRecord(report?.analysis)
  const storage = asRecord(analysis.storage)
  const issues = asArray<AnyRecord>(analysis.issues)
  const suggestions = asArray<AnyRecord>(analysis.repairSuggestions)
  const duplicateGroups = asArray<AnyRecord>(analysis.duplicateGroups)
  const corruptedRecords = asArray<AnyRecord>(analysis.corruptedRecords)
  const storageItems = asArray<AnyRecord>(storage.items)
  const includeDiagnostics = asRecord(analysis.includeDiagnostics)
  const daemon = asRecord(model.status.daemon)
  const index = asRecord(model.status.index)
  const score = numberOf(analysis.score, 0)
  const scoreTone = score >= 90 ? 'success' : score >= 70 ? 'warning' : 'default'
  const hasRepairActions = getRepairTotalActions(repairPreview) > 0

  const getLimit = () => {
    const nextLimit = Number(repairLimit)
    if (!Number.isInteger(nextLimit) || nextLimit <= 0) {
      throw new Error(`${copy.repairLimit}: ${copy.invalidSettingsValue}`)
    }
    return nextLimit
  }

  const refreshHealth = async () => {
    setBusy('refresh')
    setError('')
    try {
      setLocalReport(await apiGet<AnyRecord>('/api/health'))
      setRepairPreview(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const previewRepair = async () => {
    setBusy('preview')
    setError('')
    try {
      setRepairPreview(await apiPost<AnyRecord>('/api/health/repair', { apply: false, limit: getLimit() }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const applyRepair = async () => {
    setBusy('apply')
    setError('')
    try {
      const result = await apiPost<AnyRecord>('/api/health/repair', { apply: true, limit: getLimit() })
      setRepairPreview(result)
      setConfirmOpen(false)
      await refreshHealth()
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack">
      <div className="dashboard-grid">
        <MetricCard label={copy.healthScore} value={formatNumber(score)} tone={scoreTone} />
        <MetricCard label={copy.totalRecords} value={formatNumber(analysis.totalRecords)} />
        <MetricCard label={copy.duplicateRecords} value={formatNumber(analysis.duplicateRecords)} tone={numberOf(analysis.duplicateRecords) ? 'warning' : 'default'} />
        <MetricCard label={copy.corruptedRecords} value={formatNumber(analysis.corruptedRecordsCount)} tone={numberOf(analysis.corruptedRecordsCount) ? 'warning' : 'default'} />
        <MetricCard label={copy.storageUsed} value={textOf(storage.totalDisplay, '-')} />
        <MetricCard label={copy.healthStatus} value={textOf(analysis.status, '-')} tone={scoreTone} />
      </div>

      <Panel title={copy.health}>
        <div className="section-actions">
          <label className="field compact-field">
            <span>{copy.repairLimit}</span>
            <input type="number" min="1" max="100" value={repairLimit} onChange={event => setRepairLimit(event.target.value)} />
          </label>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void refreshHealth()}>
            {busy === 'refresh' ? copy.refreshing : copy.refreshHealth}
          </button>
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void previewRepair()}>
            {busy === 'preview' ? copy.running : copy.previewRepair}
          </button>
          <button className="btn" type="button" disabled={Boolean(busy) || !hasRepairActions} onClick={() => setConfirmOpen(true)}>
            {copy.applyRepair}
          </button>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        <div className="property-grid settings-grid">
          <Property label="Daemon" value={textOf(daemon.state, '-')} />
          <Property label="Memory" value={formatNumber(index.records)} />
          <Property label="Radio" value={formatNumber(model.status.radioMessages)} />
          <Property label="Backups" value={formatNumber(model.status.backups)} />
          <Property label={copy.duplicateRate} value={textOf(analysis.duplicateRatePercent, '-')} />
          <Property label={copy.generatedAt} value={formatDate(textOf(analysis.generatedAt))} />
          <Property label={copy.filesScanned} value={formatNumber(includeDiagnostics.filesScanned)} />
          <Property label={copy.includesChecked} value={formatNumber(includeDiagnostics.includesChecked)} />
        </div>
      </Panel>

      <Panel title={copy.repairPlan}>
        {repairPreview ? <RepairPlanSummary copy={copy} result={repairPreview} /> : <EmptyState text={copy.repairPreviewEmpty} />}
      </Panel>

      <div className="panel-grid two">
        <Panel title={copy.healthIssues}>
          <HealthIssueRows copy={copy} issues={issues} />
        </Panel>
        <Panel title={copy.repairSuggestions}>
          <HealthSuggestionRows copy={copy} suggestions={suggestions} />
        </Panel>
      </div>

      <div className="panel-grid two">
        <Panel title={copy.duplicateExamples}>
          <DuplicateGroupRows copy={copy} groups={duplicateGroups} />
        </Panel>
        <Panel title={copy.corruptedExamples}>
          <CorruptedRecordRows copy={copy} records={corruptedRecords} />
        </Panel>
      </div>

      <div className="panel-grid two">
        <Panel title={copy.storageBreakdown}>
          <StorageRows copy={copy} items={storageItems} />
        </Panel>
        <Panel title={copy.healthRawReport}>
          <details className="health-raw-details">
            <summary>{copy.healthRawReport}</summary>
            <pre className="text-snapshot small">{textOf(report?.report || report?.stdout, copy.noData)}</pre>
          </details>
        </Panel>
      </div>

      {confirmOpen ? (
        <Modal title={copy.applyRepair} onClose={() => setConfirmOpen(false)}>
          <div className="stack">
            <p className="modal-copy">{copy.confirmRepair}</p>
            <RepairPlanSummary copy={copy} result={repairPreview} />
            {error ? <div className="inline-error">{error}</div> : null}
            <div className="form-actions">
              <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => setConfirmOpen(false)}>
                {copy.cancel}
              </button>
              <button className="btn" type="button" disabled={busy === 'apply'} onClick={() => void applyRepair()}>
                {busy === 'apply' ? copy.running : copy.confirmApply}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function SettingsPanel({ copy, model, onRefresh }: { copy: Copy; model: ViewModel; onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState<SettingsFormState>(() => createSettingsForm(model.settings))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const dashboard = asRecord(model.settings.dashboard)
  const sync = asRecord(model.settings.sync)
  const backupPolicy = asRecord(model.settings.backupPolicy)

  const updateForm = <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => {
    setForm(current => ({ ...current, [field]: value }))
  }

  const reloadSettings = async () => {
    setBusy('reload')
    setError('')
    setSuccess('')
    try {
      setForm(createSettingsForm(await apiGet<AnyRecord>('/api/settings')))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  const saveSettings = async () => {
    setBusy('save')
    setError('')
    setSuccess('')
    try {
      const payload = buildSettingsPayload(form, model.settings, copy)
      const result = await apiPost<AnyRecord>('/api/settings', payload)
      const nextSettings = asRecord(result.settings)
      if (Object.keys(nextSettings).length) {
        setForm(createSettingsForm(nextSettings))
      }
      setSuccess(copy.settingsSaved)
      await onRefresh()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="stack">
      <Panel title={copy.settingsPanel}>
        <div className="property-grid settings-grid">
          <Property label={copy.memoryDir} value={textOf(model.settings.memoryDir, '-')} />
          <Property label={copy.theme} value={textOf(dashboard.theme, '-')} />
          <Property label={copy.autoRefresh} value={formatBool(boolSetting(dashboard.autoRefresh, true), copy)} />
          <Property label={copy.notifications} value={formatBool(boolSetting(dashboard.notifications, true), copy)} />
          <Property label={copy.refreshInterval} value={`${formatNumber(dashboard.refreshIntervalMs)} ms`} />
          <Property label={copy.snapshotLimit} value={formatNumber(sync.snapshotLimit)} />
          <Property label={copy.backupPolicy} value={`${copy.daily} ${formatNumber(backupPolicy.daily)} / ${copy.weekly} ${formatNumber(backupPolicy.weekly)}`} />
          <Property label={copy.pruneAfterSync} value={formatBool(boolSetting(backupPolicy.pruneAfterSync, false), copy)} />
        </div>
      </Panel>

      <Panel title={copy.saveSettings}>
        <div className="settings-form">
          <section className="settings-section">
            <h4>{copy.settingsSyncSection}</h4>
            <div className="form-grid">
              <label className="field">
                <span>{copy.snapshotLimit}</span>
                <input type="number" min="1" value={form.snapshotLimit} onChange={event => updateForm('snapshotLimit', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.coreLimit}</span>
                <input type="number" min="1" value={form.coreLimit} onChange={event => updateForm('coreLimit', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.recentLimit}</span>
                <input type="number" min="1" value={form.recentLimit} onChange={event => updateForm('recentLimit', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.lockStaleMs}</span>
                <input type="number" min="1" value={form.lockStaleMs} onChange={event => updateForm('lockStaleMs', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h4>{copy.settingsDashboardSection}</h4>
            <div className="form-grid">
              <label className="field">
                <span>{copy.refreshInterval}</span>
                <input type="number" min="1000" max="60000" step="1000" value={form.refreshIntervalMs} onChange={event => updateForm('refreshIntervalMs', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.languageSetting}</span>
                <select value={form.language} onChange={event => updateForm('language', event.target.value)}>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="field">
                <span>{copy.theme}</span>
                <select value={form.theme} onChange={event => updateForm('theme', event.target.value)}>
                  <option value="dark">{copy.darkMode}</option>
                  <option value="light">{copy.lightMode}</option>
                </select>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.autoRefresh} onChange={event => updateForm('autoRefresh', event.target.checked)} />
                <span>{copy.autoRefresh}</span>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.notifications} onChange={event => updateForm('notifications', event.target.checked)} />
                <span>{copy.notifications}</span>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.shortcutsEnabled} onChange={event => updateForm('shortcutsEnabled', event.target.checked)} />
                <span>{copy.shortcuts}</span>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h4>{copy.settingsBackupSection}</h4>
            <div className="form-grid">
              <label className="field">
                <span>{copy.daily}</span>
                <input type="number" min="1" value={form.daily} onChange={event => updateForm('daily', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.weekly}</span>
                <input type="number" min="1" value={form.weekly} onChange={event => updateForm('weekly', event.target.value)} />
              </label>
              <label className="field">
                <span>{copy.preSync}</span>
                <input type="number" min="1" value={form.preSync} onChange={event => updateForm('preSync', event.target.value)} />
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={form.pruneAfterSync} onChange={event => updateForm('pruneAfterSync', event.target.checked)} />
                <span>{copy.pruneAfterSync}</span>
              </label>
            </div>
          </section>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        {success ? <div className="notice success"><span>{success}</span></div> : null}
        <div className="form-actions settings-actions">
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void reloadSettings()}>
            {busy === 'reload' ? copy.refreshing : copy.refreshSettings}
          </button>
          <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => void saveSettings()}>
            {busy === 'save' ? copy.running : copy.saveSettings}
          </button>
        </div>
      </Panel>
    </div>
  )
}

function createSettingsForm(settings: AnyRecord): SettingsFormState {
  const sync = asRecord(settings.sync)
  const dashboard = asRecord(settings.dashboard)
  const shortcuts = asRecord(dashboard.shortcuts)
  const backupPolicy = asRecord(settings.backupPolicy)
  return {
    snapshotLimit: String(numberOf(sync.snapshotLimit, 120)),
    coreLimit: String(numberOf(sync.coreLimit, 80)),
    recentLimit: String(numberOf(sync.recentLimit, 40)),
    lockStaleMs: String(numberOf(sync.lockStaleMs, 30000)),
    autoRefresh: boolSetting(dashboard.autoRefresh, true),
    refreshIntervalMs: String(numberOf(dashboard.refreshIntervalMs, 5000)),
    language: ['zh', 'en'].includes(textOf(dashboard.language)) ? textOf(dashboard.language) : 'zh',
    theme: ['dark', 'light'].includes(textOf(dashboard.theme)) ? textOf(dashboard.theme) : 'dark',
    notifications: boolSetting(dashboard.notifications, true),
    shortcutsEnabled: boolSetting(shortcuts.enabled, true),
    daily: String(numberOf(backupPolicy.daily, 14)),
    weekly: String(numberOf(backupPolicy.weekly, 8)),
    preSync: String(numberOf(backupPolicy.preSync, 24)),
    pruneAfterSync: boolSetting(backupPolicy.pruneAfterSync, true)
  }
}

function buildSettingsPayload(form: SettingsFormState, currentSettings: AnyRecord, copy: Copy): AnyRecord {
  const refreshIntervalMs = parsePositiveInteger(form.refreshIntervalMs, copy.refreshInterval, copy)
  if (refreshIntervalMs < 1000 || refreshIntervalMs > 60000) {
    throw new Error(`${copy.refreshInterval}: 1000-60000`)
  }
  const dashboard = asRecord(currentSettings.dashboard)
  const shortcuts = asRecord(dashboard.shortcuts)
  return {
    sync: {
      snapshotLimit: parsePositiveInteger(form.snapshotLimit, copy.snapshotLimit, copy),
      coreLimit: parsePositiveInteger(form.coreLimit, copy.coreLimit, copy),
      recentLimit: parsePositiveInteger(form.recentLimit, copy.recentLimit, copy),
      lockStaleMs: parsePositiveInteger(form.lockStaleMs, copy.lockStaleMs, copy)
    },
    dashboard: {
      autoRefresh: form.autoRefresh,
      refreshIntervalMs,
      language: form.language,
      theme: form.theme,
      notifications: form.notifications,
      shortcuts: {
        ...shortcuts,
        enabled: form.shortcutsEnabled
      }
    },
    backupPolicy: {
      daily: parsePositiveInteger(form.daily, copy.daily, copy),
      weekly: parsePositiveInteger(form.weekly, copy.weekly, copy),
      preSync: parsePositiveInteger(form.preSync, copy.preSync, copy),
      pruneAfterSync: form.pruneAfterSync
    }
  }
}

function parsePositiveInteger(value: string, label: string, copy: Copy): number {
  const nextValue = Number(value)
  if (!Number.isInteger(nextValue) || nextValue <= 0) {
    throw new Error(`${label}: ${copy.invalidSettingsValue}`)
  }
  return nextValue
}

function boolSetting(value: unknown, fallback: boolean): boolean {
  return value === undefined || value === null ? fallback : Boolean(value)
}

function RepairPlanSummary({ copy, result }: { copy: Copy; result: AnyRecord | null }) {
  const plan = asRecord(result?.plan)
  const applied = asRecord(result?.applied)
  const duplicates = asArray<AnyRecord>(plan.duplicates)
  return (
    <div className="stack">
      <div className="property-grid settings-grid">
        <Property label={copy.mode} value={boolOf(result?.apply) ? copy.applied : copy.dryRun} />
        <Property label={copy.totalActions} value={formatNumber(plan.totalActions)} />
        <Property label={copy.duplicateGroups} value={formatNumber(plan.duplicateGroups)} />
        <Property label={copy.superseded} value={formatNumber(plan.duplicateRecordsToSupersede)} />
        <Property label={copy.ledgerRecordsUpdated} value={formatNumber(applied.ledgerRecordsUpdated)} />
        <Property label={copy.corruptedRecovered} value={formatNumber(applied.corruptedRecovered)} />
        <Property label={copy.corruptedArchived} value={formatNumber(applied.corruptedArchived)} />
        <Property label={copy.duplicateRecords} value={formatNumber(applied.duplicateSuperseded)} />
      </div>
      {duplicates.length ? (
        <div className="repair-plan-list">
          {duplicates.slice(0, 8).map((item, indexValue) => (
            <div className="health-example" key={`${textOf(item.example || item.id)}-${indexValue}`}>
              <strong>{textOf(item.example || item.key, '-')}</strong>
              <span>{formatNumber(item.count)} / {formatNumber(asArray(item.records).length)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function getRepairTotalActions(result: AnyRecord | null): number {
  return numberOf(asRecord(result?.plan).totalActions)
}

function HealthIssueRows({ copy, issues }: { copy: Copy; issues: AnyRecord[] }) {
  if (!issues.length) return <EmptyState text={copy.noHealthIssues} />
  return (
    <div className="stack">
      {issues.map((issue, indexValue) => {
        const action = asRecord(issue.action)
        return (
          <div className={`health-issue-row level-${textOf(issue.level, 'low')}`} key={`${textOf(issue.title)}-${indexValue}`}>
            <div>
              <div className="health-row-title">
                <StatusBadge status={textOf(issue.level, 'low')} />
                <strong>{textOf(issue.title, '-')}</strong>
              </div>
              <p>{textOf(issue.detail, '-')}</p>
              {action.command || action.endpoint ? <code className="health-command">{textOf(action.command || action.endpoint)}</code> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HealthSuggestionRows({ copy, suggestions }: { copy: Copy; suggestions: AnyRecord[] }) {
  if (!suggestions.length) return <EmptyState text={copy.noHealthIssues} />
  return (
    <div className="stack">
      {suggestions.map((suggestion, indexValue) => (
        <div className="health-action-row" key={`${textOf(suggestion.id || suggestion.label)}-${indexValue}`}>
          <strong>{textOf(suggestion.label || suggestion.id, copy.repairSuggestions)}</strong>
          <p>{textOf(suggestion.detail || suggestion.command || suggestion.endpoint, '-')}</p>
          {suggestion.command || suggestion.endpoint ? <code className="health-command">{textOf(suggestion.command || suggestion.endpoint)}</code> : null}
        </div>
      ))}
    </div>
  )
}

function DuplicateGroupRows({ copy, groups }: { copy: Copy; groups: AnyRecord[] }) {
  if (!groups.length) return <EmptyState text={copy.noHealthExamples} />
  return (
    <div className="stack">
      {groups.map((group, indexValue) => (
        <div className="health-example" key={`${textOf(group.example)}-${indexValue}`}>
          <div className="health-row-title">
            <strong>{formatNumber(group.count)}x</strong>
            <span>{textOf(group.example, '-')}</span>
          </div>
          <p>{asArray<AnyRecord>(group.records).map(record => textOf(record.pointer || record.id)).filter(Boolean).join(' | ')}</p>
        </div>
      ))}
    </div>
  )
}

function CorruptedRecordRows({ copy, records }: { copy: Copy; records: AnyRecord[] }) {
  if (!records.length) return <EmptyState text={copy.noHealthExamples} />
  return (
    <div className="stack">
      {records.map((record, indexValue) => (
        <div className="health-example" key={`${textOf(record.pointer)}-${indexValue}`}>
          <strong>{textOf(record.pointer, '-')}</strong>
          <p>{textOf(record.text, '-')}</p>
        </div>
      ))}
    </div>
  )
}

function StorageRows({ copy, items }: { copy: Copy; items: AnyRecord[] }) {
  if (!items.length) return <EmptyState text={copy.noData} />
  return (
    <div className="health-storage-list">
      {items.map(item => (
        <div className="health-storage-row" key={textOf(item.label)}>
          <span>{textOf(item.label, '-')}</span>
          <strong>{textOf(item.display || item.bytes, '-')}</strong>
        </div>
      ))}
    </div>
  )
}

function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' }) {
  return (
    <section className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  )
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button className="btn small ghost" type="button" onClick={onClose} aria-label={`Close ${title}`}>
            x
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  )
}

function DataTable({ columns, rows, emptyText }: { columns: string[]; rows: ReactNode[][]; emptyText: string }) {
  if (!rows.length) return <EmptyState text={emptyText} />
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(column => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BarList({ items, emptyText }: { items: Array<{ key: string; count: number }>; emptyText: string }) {
  const visibleItems = items.filter(item => item.key && item.count > 0)
  const maxValue = Math.max(1, ...visibleItems.map(item => item.count))
  if (!visibleItems.length) return <EmptyState text={emptyText} />
  return (
    <div className="bar-list">
      {visibleItems.map(item => (
        <div className="bar-row" key={item.key}>
          <div className="bar-row-label">
            <span>{item.key}</span>
            <strong>{formatNumber(item.count)}</strong>
          </div>
          <div className="bar-track">
            <span style={{ width: `${Math.max(4, Math.round((item.count / maxValue) * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskList({ copy, tasks }: { copy: Copy; tasks: AnyRecord[] }) {
  if (!tasks.length) return <EmptyState text={copy.noData} />
  return (
    <div className="stack">
      {tasks.map(task => (
        <div className="list-row" key={textOf(task.id)}>
          <StatusBadge status={textOf(task.status, 'open')} />
          <div className="list-row-main">
            <strong>{textOf(task.title, '-')}</strong>
            <span>{textOf(task.project, '-')} · {textOf(task.assignee || task.createdBy, '-')}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function RadioList({ copy, messages }: { copy: Copy; messages: AnyRecord[] }) {
  if (!messages.length) return <EmptyState text={copy.noData} />
  return (
    <div className="stack">
      {messages.map(message => (
        <div className="message-row" key={textOf(message.id)}>
          <div className="message-meta">
            <StatusBadge status={textOf(message.type, 'note')} />
            <span>{textOf(message.from)} {'->'} {textOf(message.to)}</span>
          </div>
          <p>{textOf(message.text, '-')}</p>
        </div>
      ))}
    </div>
  )
}

function ToolList({ copy, tools }: { copy: Copy; tools: AnyRecord[] }) {
  if (!tools.length) return <EmptyState text={copy.noData} />
  return (
    <div className="stack">
      {tools.map(tool => (
        <div className="compact-row" key={textOf(tool.name)}>
          <StatusBadge status={textOf(tool.connectionStatus, 'missing')} />
          <span className="truncate">{textOf(tool.name, '-')}</span>
        </div>
      ))}
    </div>
  )
}

function Property({ label, value }: { label: string; value: string }) {
  return (
    <div className="property">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const clean = status.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return <span className={`status-badge ${clean}`}>{status || '-'}</span>
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

function summarizeRoles(workflow: AnyRecord): string {
  const roles = ['planner', 'executor', 'reviewer', 'observer']
    .flatMap(role => asArray<string>(workflow[role]).map(value => `${role}:${value}`))
  return roles.join(', ') || '-'
}

function formatDate(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatNumber(value: unknown): string {
  return numberOf(value).toLocaleString()
}

function formatBool(value: boolean, copy: Copy): string {
  return value ? copy.yes : copy.no
}

function formatPercent(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue)) return '-'
  return `${Math.round(nextValue * 100)}%`
}

function formatDurationMs(value: unknown): string {
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue) || nextValue <= 0) return '-'
  if (nextValue < 1000) return `${Math.round(nextValue)} ms`
  if (nextValue < 60000) return `${Math.round(nextValue / 1000)} s`
  const minutes = Math.floor(nextValue / 60000)
  const seconds = Math.round((nextValue % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

function getToolStatus(tool: AnyRecord): string {
  const health = asRecord(tool.health)
  return textOf(health.status || tool.connectionStatus || (tool.installed ? 'installed' : 'missing'), 'missing')
}

function toolMatchesStatusFilter(tool: AnyRecord, filter: string): boolean {
  const status = getToolStatus(tool)
  if (filter === 'all') return true
  if (filter === 'ready') return status.startsWith('ready')
  if (filter === 'connected') return boolOf(tool.connected) || textOf(tool.connectionStatus).startsWith('connected')
  if (filter === 'runnable') return boolOf(tool.runnable || asRecord(tool.capability).autoDispatch)
  if (filter === 'missing') return !boolOf(tool.installed) || status.includes('missing')
  if (filter === 'needs') return status.includes('needs') || status.includes('unconfigured') || (boolOf(tool.installed) && !boolOf(tool.configured))
  return true
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right))
}

function countValues(values: string[], limit = 8): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>()
  values
    .map(value => value.trim())
    .filter(Boolean)
    .forEach(value => counts.set(value, (counts.get(value) || 0) + 1))
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}
