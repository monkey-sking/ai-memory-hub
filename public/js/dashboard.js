    const toolDisplayNames = {
      en: {
        'gemini': 'Gemini',
        'antigravity-gemini': 'Antigravity Gemini',
        'claude': 'Claude',
        'claude-desktop': 'Claude Desktop',
        'chatgpt': 'ChatGPT',
        'cursor': 'Cursor',
        'vscode': 'VS Code',
        'codex': 'Codex',
        'codex-app': 'Codex App',
        'windsurf': 'Windsurf',
        'aider': 'Aider',
        'marvis': 'Marvis',
        'qclaw': 'QClaw',
        'openclaw': 'OpenClaw',
        'cherry-studio': 'Cherry Studio',
        'ollama': 'Ollama',
        'cc-switch': 'CC-Switch',
        'antigravity': 'Antigravity',
        'antigravity-cockpit': 'Antigravity Cockpit'
      },
      zh: {
        'gemini': 'Gemini',
        'antigravity-gemini': 'Antigravity Gemini',
        'claude': 'Claude',
        'claude-desktop': 'Claude Desktop',
        'chatgpt': 'ChatGPT',
        'cursor': 'Cursor',
        'vscode': 'VS Code',
        'codex': 'Codex',
        'codex-app': 'Codex App',
        'windsurf': 'Windsurf',
        'aider': 'Aider',
        'marvis': 'Marvis',
        'qclaw': 'QClaw',
        'openclaw': 'OpenClaw',
        'cherry-studio': 'Cherry Studio',
        'ollama': 'Ollama',
        'cc-switch': 'CC-Switch',
        'antigravity': 'Antigravity',
        'antigravity-cockpit': 'Antigravity Cockpit'
      }
    };

    const iconAssetVersion = '20260606-app-icons-v2';

    const toolIconFiles = {
      'gemini': '/assets/tool-icons/gemini.png',
      'antigravity-gemini': '/assets/tool-icons/gemini.png',
      'claude': '/assets/tool-icons/claude.png',
      'claude-desktop': '/assets/tool-icons/claude-desktop.png',
      'chatgpt': '/assets/tool-icons/chatgpt.png',
      'cursor': '/assets/tool-icons/cursor.png',
      'vscode': '/assets/tool-icons/vscode.png',
      'codex': '/assets/tool-icons/codex.png',
      'codex-app': '/assets/tool-icons/codex-app.png',
      'windsurf': '/assets/tool-icons/windsurf.png',
      'aider': '/assets/tool-icons/aider.png',
      'marvis': '/assets/tool-icons/marvis-app.png',
      'qclaw': '/assets/tool-icons/qclaw-app.png',
      'openclaw': '/assets/tool-icons/qclaw-app.png',
      'cherry-studio': '/assets/tool-icons/cherry-studio.png',
      'ollama': '/assets/tool-icons/ollama.png',
      'cc-switch': '/assets/tool-icons/ccswitch-app.png',
      'antigravity': '/assets/tool-icons/antigravity.png',
      'antigravity-cockpit': '/assets/tool-icons/antigravity-cockpit.png'
    };

    const toolKindBadges = {
      en: {
        'cli-config': 'CLI',
        'app-state': 'APP',
        'editor-state': 'Editor',
        'extension-state': 'Extension',
        'skill-config': 'Skill',
        'local-model-runtime': 'Runtime'
      },
      zh: {
        'cli-config': '命令行',
        'app-state': '应用',
        'editor-state': '编辑器',
        'extension-state': '扩展',
        'skill-config': '技能',
        'local-model-runtime': '运行环境'
      }
    };

    const toolKindClasses = {
      'cli-config': 'kind-cli',
      'app-state': 'kind-app',
      'editor-state': 'kind-editor',
      'extension-state': 'kind-extension',
      'skill-config': 'kind-skill',
      'local-model-runtime': 'kind-runtime'
    };

    function getFallbackChar(name) {
      return (name || '?').charAt(0).toUpperCase();
    }

    function getFallbackGradient(name) {
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const gradients = [
        'linear-gradient(135deg, #388bfd, #bc8cff)',
        'linear-gradient(135deg, #10a37f, #0e7f62)',
        'linear-gradient(135deg, #ea7a50, #d9531e)',
        'linear-gradient(135deg, #00f2fe, #4facfe)',
        'linear-gradient(135deg, #ff4b4b, #a80000)',
        'linear-gradient(135deg, #ff2a6d, #9b003c)',
        'linear-gradient(135deg, #f39c12, #d35400)',
        'linear-gradient(135deg, #bc8cff, #ff79c6)'
      ];
      return gradients[Math.abs(hash) % gradients.length];
    }

    function getToolIconSvg() {
      return null;
    }

    const toolKinds = {
      'gemini': 'cli-config',
      'antigravity-gemini': 'extension-state',
      'claude': 'cli-config',
      'claude-desktop': 'app-state',
      'chatgpt': 'app-state',
      'cursor': 'editor-state',
      'vscode': 'editor-state',
      'codex': 'cli-config',
      'codex-app': 'app-state',
      'windsurf': 'editor-state',
      'aider': 'cli-config',
      'marvis': 'app-state',
      'qclaw': 'app-state',
      'openclaw': 'app-state',
      'cherry-studio': 'app-state',
      'ollama': 'local-model-runtime',
      'cc-switch': 'app-state',
      'antigravity': 'cli-config',
      'antigravity-cockpit': 'app-state'
    };

    function renderToolIcon(name, size = 18, kind = '') {
      const cleanName = (name || '').toLowerCase().trim();
      const iconPath = toolIconFiles[cleanName] || null;
      const iconSrc = iconPath ? `${iconPath}?v=${iconAssetVersion}` : null;
      const svg = getToolIconSvg(cleanName);
      
      const fallbackContent = svg
        ? svg
        : `<div class="tool-icon-fallback" style="background:${getFallbackGradient(cleanName)}; width:100%; height:100%; font-size:${size * 0.55}px;">${getFallbackChar(cleanName)}</div>`;

      // Resolve kind if not passed
      const resolvedKind = kind || toolKinds[cleanName] || '';

      // Corner badge overlay for CLI vs App variants (render only if size >= 16 to avoid clutter at very small sizes)
      let cornerBadge = '';
      if (size >= 16 && resolvedKind) {
        const badgeSize = size >= 24 ? 14 : 11;
        const badgeOffset = size >= 24 ? -4 : -3;
        const bgBorderColor = size >= 24 ? '#0f1423' : '#141b2f';
        
        if (resolvedKind === 'cli-config') {
          // Terminal/CLI Badge: Dark blue circle with terminal prompt vector
          cornerBadge = `
            <div class="tool-icon-corner-badge" style="width:${badgeSize}px; height:${badgeSize}px; bottom:${badgeOffset}px; right:${badgeOffset}px; background:#1f6feb; border:1.8px solid ${bgBorderColor}; display:flex; align-items:center; justify-content:center;" title="CLI">
              <svg viewBox="0 0 10 10" fill="none" style="width:75%; height:75%;"><path d="M2.5 3.5l1.5 1.5-1.5 1.5M4.5 6.5h3" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          `;
        } else if (['app-state', 'local-model-runtime'].includes(resolvedKind)) {
          // App Badge: Dark purple circle with desktop screen vector
          cornerBadge = `
            <div class="tool-icon-corner-badge" style="width:${badgeSize}px; height:${badgeSize}px; bottom:${badgeOffset}px; right:${badgeOffset}px; background:#8957e5; border:1.8px solid ${bgBorderColor}; display:flex; align-items:center; justify-content:center;" title="App">
              <svg viewBox="0 0 10 10" fill="none" style="width:70%; height:70%;"><rect x="2" y="2" width="6" height="4.5" rx="0.8" stroke="#fff" stroke-width="0.9"/><path d="M3.5 6.5h3M5 6.3V8" stroke="#fff" stroke-width="0.9" stroke-linecap="round"/></svg>
            </div>
          `;
        } else if (resolvedKind === 'editor-state') {
          // Editor Badge: Yellow circle with brackets
          cornerBadge = `
            <div class="tool-icon-corner-badge" style="width:${badgeSize}px; height:${badgeSize}px; bottom:${badgeOffset}px; right:${badgeOffset}px; background:#d29922; border:1.8px solid ${bgBorderColor}; display:flex; align-items:center; justify-content:center;" title="Editor">
              <svg viewBox="0 0 10 10" fill="none" style="width:75%; height:75%;"><path d="M3 2.5l-2 2.5 2 2.5M7 2.5l2 2.5-2 2.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          `;
        } else if (resolvedKind === 'extension-state') {
          // Extension Badge: Green circle with puzzle/plus vector
          cornerBadge = `
            <div class="tool-icon-corner-badge" style="width:${badgeSize}px; height:${badgeSize}px; bottom:${badgeOffset}px; right:${badgeOffset}px; background:#2ea44f; border:1.8px solid ${bgBorderColor}; display:flex; align-items:center; justify-content:center;" title="Extension">
              <svg viewBox="0 0 10 10" fill="none" style="width:70%; height:70%;"><path d="M5 2v6M2 5h6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>
            </div>
          `;
        }
      }

      if (iconSrc) {
        return `
          <div class="tool-icon-wrapper" style="width:${size}px; height:${size}px;">
            <img src="${iconSrc}"
                 alt="${escapeHtml(name)}"
                 loading="lazy"
                 decoding="async"
                 style="width:100%; height:100%; object-fit:contain; border-radius:4px; display:block;"
                 onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
            <div class="tool-icon-fallback-container" style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">
              ${fallbackContent}
            </div>
            ${cornerBadge}
          </div>
        `;
      } else {
        return `
          <div class="tool-icon-wrapper" style="width:${size}px; height:${size}px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05);">
            ${fallbackContent}
            ${cornerBadge}
          </div>
        `;
      }
    }

    const i18n = {
      en: {
        overview: "📊 Overview",
        memoryHub: "Memory Hub",
        agentRadio: "Collaboration Broadcast",
        tasksBoard: "Tasks Board",
        dispatchLogs: "⚡ Dispatch Logs",
        workflowsPanel: "Workflows",
        analyticsPanel: "Analytics",
        settingsPanel: "Settings",
        healthPanel: "Health",
        searchPanel: "Search",
        toolsPanel: "Tools",
        detectedTools: "Detected Tools",
        scanning: "Scanning...",
        operations: "Hub Operations",
        storage: "Storage:",
        autoRefresh: "Auto-refresh:",
        refresh: "Refresh",
        rebuild: "Rebuild Snapshot",
        syncInbox: "Sync Inbox",
        activeTasks: "Active Tasks",
        workflowStages: "Workflow Stages",
        pendingEvents: "Pending Events",
        radioMessages: "Broadcast Messages",
        durableLedger: "Durable Ledger",
        backups: "Backups",
        activeTasksKanban: "⭐ Active Tasks Kanban",
        fullBoard: "Full Board",
        liveRadioFeed: "📻 Live Broadcast Feed",
        recordMemory: "Record Memory",
        textLabel: "Text",
        kindLabel: "Kind",
        sourceLabel: "Source",
        recordDurable: "Record Durable Event",
        inboxPendingSync: "Inbox Events (Pending Sync)",
        noPendingTable: "No pending events.",
        pullIndex: "Pull & Index",
        broadcastMessage: "Send Collaboration Broadcast",
        messageContent: "Message Content",
        fromLabel: "From",
        toLabel: "To",
        typeLabel: "Type",
        projectLabel: "Project",
        broadcast: "Send Broadcast Message",
        radioStream: "Broadcast Messages Stream",
        searchText: "Search text...",
        addTask: "Add Shared Task",
        taskTitleLabel: "Task Title",
        priorityLabel: "Priority",
        descriptionLabel: "Description / Details",
        handoffStatusLabel: "Handoff Status (Optional)",
        addTaskButton: "Add task to ledger",
        filterProject: "Filter Project:",
        filterPriority: "Filter Priority:",
        allProjects: "All Projects",
        selectProject: "Select Project",
        customProject: "Custom Project",
        deliveryWritten: "Written to Hub",
        deliveryDispatched: "Dispatched",
        deliveryFailed: "Dispatch Failed",
        deliveryReplied: "Thread Replied",
        deliveryPendingRead: "Pending Tool Read",
        dispatchToTool: "Dispatch to {tool}",
        dispatchToAll: "Broadcast to all tools",
        replySummary: "{tool} replied in thread",
        showStatusReply: "Show status reply",
        threadLabel: "Thread",
        allPriorities: "All Priorities",
        automatedDispatcher: "Automated Dispatcher (Cron / Watcher logs)",
        triggerDispatch: "Trigger Dispatch Now",
        relayStatus: "Relay Status",
        executionLogs: "Execution Logs",
        progressLabel: "Progress",
        progressBy: "By",
        noDispatch: "No dispatch logs found.",
        rawCompatibility: "🛠️ Raw JSON / Compatibility Data Panels",
        noWorkflows: "No workflows recorded.",
        planningStage: "Planning",
        executionStage: "Execution",
        verificationStage: "Verification",
        reviewStage: "Review",
        deliveryStage: "Delivery",
        blockedStage: "Blocked",
        workflowStageDetail: "{n} workflow(s)",
        taskStageDetail: "{n} task(s)",
        relayStageDetail: "{n} relay(s)",
        durationLabel: "Duration",
        dispatchStateLabel: "Dispatch",
        latestNoteLabel: "Latest note",
        endpointErrorTitle: "Endpoint load errors",
        endpointErrorSummary: "{n} endpoint(s) failed to load.",
        endpointLoadWarning: "Showing cached or empty sections until the next successful refresh.",
        
        noActiveTasks: "No active tasks found.",
        noRecentMessages: "No recent messages.",
        noPendingEvents: "No pending events in inbox.",
        noRadioMessages: "No broadcast messages.",
        noOpenTasks: "No open tasks.",
        noActiveClaimedTasks: "No active claimed tasks.",
        noCompletedTasks: "No completed tasks.",
        noDispatcherEvents: "No dispatcher events recorded yet.",
        unassigned: "Unassigned",
        defaultProj: "Default",
        claimTask: "Claim Task",
        startWork: "Start Work",
        blockTask: "Block",
        unblockTask: "Unblock",
        completeTask: "Complete",
        reopenTask: "Reopen",
        approveTask: "Approve",
        rejectTask: "Reject",
        reviewDecisionLabel: "Review",
        reviewedByLabel: "Reviewed by",
        promptReviewBy: "Enter reviewer name:",
        promptReviewNote: "Optional review note:",
        successText: "Success",
        failedText: "Failed",
        runnableText: "Runnable",
        notRunnableText: "No Runner",
        addNotePlaceholder: "Add note...",
        promptClaim: "Enter your name to claim this task:",
        promptBlock: "Enter reason for blocking this task:",
        promptNote: "Enter your name for note:",
        promoteToMemory: "Promote to memory",
        alertPromoted: "Message promoted to inbox. Run Sync Inbox to consolidate.",
        confirmForceDispatch: "Force run dispatcher (ignores exit status cache)?",
        alertDispatched: "Executed {n} dispatch jobs.",
        
        prefOpt: "Preference",
        workOpt: "Workflow",
        projOpt: "Project",
        corrOpt: "Correction",
        noteOpt: "Note",
        revOpt: "Review",
        handOpt: "Handoff",
        riskOpt: "Risk",
        doneOpt: "Done",
        lowOpt: "Low",
        normOpt: "Normal",
        highOpt: "High",
        urgOpt: "Urgent",
        
        senderAll: "Sender: All",
        recipientAll: "Recipient: All",
        typeAll: "Type: All",
        
        placeholderMemText: "Record a user preference, workflow rule, or important project fact.",
        placeholderRadText: "Broadcast a handoff note, review request, or risk flag.",
        placeholderTskTitle: "Task summary or requirement",
        placeholderTskDesc: "Goal: ... Scope: ... Acceptance: ...",
        placeholderTskHandoff: "Current state, next step, owner, risks...",

        workflowManagement: "🔄 Workflow Management",
        createWorkflow: "+ New Workflow",
        loadingWorkflows: "Loading workflows...",
        systemSettings: "⚙️ System Settings",
        snapshotLimit: "Snapshot Limit",
        snapshotLimitDesc: "Max records in MEMORY.md (current: 200)",
        refreshInterval: "Auto Refresh Interval (seconds)",
        themeLabel: "Theme",
        darkMode: "Dark Mode",
        lightMode: "Light Mode (Coming Soon)",
        languageLabel: "Language",
        saveSettings: "Save Settings",
        connectedTools: "Connected Tools",
        runnableTools: "Runnable",
        cliTools: "CLI Tools",
        appTools: "Apps",
        toolManagement: "🔧 Tool Management",
        refreshTools: "Refresh",
        loadingTools: "Loading tools...",
        globalSearch: "🔍 Global Search",
        searchPlaceholder: "Search across memories, tasks, and messages...",
        searchAll: "All",
        searchMemories: "Memories",
        searchTasks: "Tasks",
        searchRadio: "Radio Messages",
        searchButton: "Search",
        searchPrompt: "Enter a query to search...",
        healthReport: "💊 System Health Report",
        runHealthCheck: "Run Health Check",
        healthPrompt: "Click \"Run Health Check\" to generate report...",
        analytics: "📈 Analytics",
        memoryGrowth: "Memory Growth",
        taskCompletion: "Task Completion",
        radioActivity: "Radio Activity",
        memoryGrowthTrend: "🧠 Memory Growth Trend",
        taskCompletionRate: "📋 Task Completion Rate"
      },
      zh: {
        overview: "📊 概览看板",
        memoryHub: "记忆中枢",
        agentRadio: "协作广播",
        tasksBoard: "任务看板",
        dispatchLogs: "⚡ 调度日志",
        workflowsPanel: "工作流",
        analyticsPanel: "数据分析",
        settingsPanel: "设置",
        healthPanel: "健康检查",
        searchPanel: "搜索",
        toolsPanel: "工具管理",
        memoryGrowthTrend: "🧠 记忆增长趋势",
        taskCompletionRate: "📋 任务完成率",
        detectedTools: "已检测工具",
        scanning: "扫描中...",
        operations: "操作面板",
        storage: "存储路径:",
        autoRefresh: "自动刷新:",
        refresh: "刷新数据",
        rebuild: "重建快照",
        syncInbox: "同步收件箱",
        activeTasks: "活跃任务数",
        workflowStages: "工作流阶段",
        pendingEvents: "待同步事件",
        radioMessages: "广播消息数",
        durableLedger: "长期记忆账本",
        backups: "备份文件数",
        activeTasksKanban: "⭐ 活跃任务看板",
        fullBoard: "完整看板",
        liveRadioFeed: "📻 实时协作广播",
        recordMemory: "记录长期记忆",
        textLabel: "正文内容",
        kindLabel: "类型",
        sourceLabel: "来源",
        recordDurable: "追加长期记忆",
        inboxPendingSync: "待同步收件箱事件",
        noPendingTable: "暂无待同步事件。",
        pullIndex: "拉取并索引",
        broadcastMessage: "发送协作广播",
        messageContent: "消息正文",
        fromLabel: "发送方",
        toLabel: "接收方",
        typeLabel: "消息类型",
        projectLabel: "所属项目",
        broadcast: "发送协作广播",
        radioStream: "广播消息流",
        searchText: "搜索内容...",
        addTask: "新建共享任务",
        taskTitleLabel: "任务标题",
        priorityLabel: "优先级",
        descriptionLabel: "描述与详情",
        handoffStatusLabel: "交接说明 (选填)",
        addTaskButton: "添加新任务",
        filterProject: "筛选项目:",
        filterPriority: "筛选优先级:",
        allProjects: "所有项目",
        selectProject: "选择项目",
        customProject: "自定义项目",
        deliveryWritten: "已写入 Hub",
        deliveryDispatched: "已调度",
        deliveryFailed: "调度失败",
        deliveryReplied: "线程已有回执",
        deliveryPendingRead: "待目标工具读取",
        dispatchToTool: "派发给 {tool}",
        dispatchToAll: "广播给所有工具",
        replySummary: "{tool} 已在线程中回复",
        showStatusReply: "展开状态回执",
        threadLabel: "线程",
        allPriorities: "所有优先级",
        automatedDispatcher: "自动调度执行日志",
        triggerDispatch: "立即触发调度",
        relayStatus: "Relay 状态",
        executionLogs: "执行日志",
        progressLabel: "进度",
        progressBy: "上报",
        noDispatch: "暂无调度执行日志。",
        rawCompatibility: "🛠️ 原始数据与兼容性调试",
        noWorkflows: "暂无工作流记录。",
        planningStage: "规划",
        executionStage: "执行",
        verificationStage: "验证",
        reviewStage: "评审",
        deliveryStage: "交付",
        blockedStage: "阻塞",
        workflowStageDetail: "{n} 个工作流",
        taskStageDetail: "{n} 个任务",
        relayStageDetail: "{n} 个 relay",
        durationLabel: "持续时间",
        dispatchStateLabel: "调度",
        latestNoteLabel: "最新备注",
        endpointErrorTitle: "端点加载错误",
        endpointErrorSummary: "{n} 个端点加载失败。",
        endpointLoadWarning: "在下次成功刷新前，相关区域会显示缓存或空数据。",
        
        noActiveTasks: "暂无活跃任务。",
        noRecentMessages: "暂无最近消息。",
        noPendingEvents: "收件箱中暂无待同步事件。",
        noRadioMessages: "暂无广播消息。",
        noOpenTasks: "暂无待认领任务。",
        noActiveClaimedTasks: "暂无执行中的认领任务。",
        noCompletedTasks: "暂无已完成任务。",
        noDispatcherEvents: "暂无自动调度执行记录。",
        unassigned: "未分配",
        defaultProj: "默认项目",
        claimTask: "认领任务",
        startWork: "开始执行",
        blockTask: "挂起",
        unblockTask: "解挂",
        completeTask: "已完成",
        reopenTask: "重新打开",
        approveTask: "批准",
        rejectTask: "驳回",
        reviewDecisionLabel: "评审",
        reviewedByLabel: "评审人",
        promptReviewBy: "请输入评审人名称:",
        promptReviewNote: "可选评审备注:",
        successText: "执行成功",
        failedText: "执行失败",
        runnableText: "可执行",
        notRunnableText: "不可调度",
        addNotePlaceholder: "追加进展备注...",
        promptClaim: "请输入您的名字以认领任务:",
        promptBlock: "请输入挂起任务的原因:",
        promptNote: "请输入发表备注者的名字:",
        promoteToMemory: "提升为长期记忆",
        alertPromoted: "消息已推广至收件箱。请运行“同步收件箱”以整理记忆。",
        confirmForceDispatch: "是否强制运行调度器（将忽略退出状态缓存）？",
        alertDispatched: "已成功执行 {n} 个调度任务。",
        
        prefOpt: "偏好",
        workOpt: "工作流",
        projOpt: "项目事实",
        corrOpt: "纠错",
        noteOpt: "备注",
        revOpt: "评审",
        handOpt: "交接",
        riskOpt: "风险提示",
        doneOpt: "完成",
        lowOpt: "低",
        normOpt: "中",
        highOpt: "高",
        urgOpt: "紧急",
        
        senderAll: "发送方: 全部",
        recipientAll: "接收方: 全部",
        typeAll: "类型: 全部",
        
        placeholderMemText: "记录用户偏好、工作流规则或重要的项目事实。",
        placeholderRadText: "广播交接便签、评审请求或风险标识。",
        placeholderTskTitle: "任务简要总结或需求",
        placeholderTskDesc: "目标：... 范围：... 验收：...",
        placeholderTskHandoff: "当前状态、下一步、负责人、风险...",

        workflowManagement: "🔄 工作流管理",
        createWorkflow: "+ 创建工作流",
        loadingWorkflows: "加载工作流中...",
        systemSettings: "⚙️ 系统设置",
        snapshotLimit: "快照限制",
        snapshotLimitDesc: "MEMORY.md 最大记录数 (当前: 200)",
        refreshInterval: "自动刷新间隔 (秒)",
        themeLabel: "主题",
        darkMode: "深色模式",
        lightMode: "浅色模式 (即将推出)",
        languageLabel: "语言",
        saveSettings: "保存设置",
        connectedTools: "已连接工具",
        runnableTools: "可运行",
        cliTools: "命令行工具",
        appTools: "应用程序",
        toolManagement: "🔧 工具管理",
        refreshTools: "刷新",
        loadingTools: "加载工具中...",
        globalSearch: "🔍 全局搜索",
        searchPlaceholder: "搜索记忆、任务和消息...",
        searchAll: "全部",
        searchMemories: "记忆",
        searchTasks: "任务",
        searchRadio: "广播消息",
        searchButton: "搜索",
        searchPrompt: "输入搜索关键词...",
        healthReport: "💊 系统健康报告",
        runHealthCheck: "运行健康检查",
        healthPrompt: "点击"运行健康检查"生成报告...",
        analytics: "📈 数据分析",
        memoryGrowth: "记忆增长趋势",
        taskCompletion: "任务完成率",
        radioActivity: "Radio活跃度",
        memoryGrowthTrend: "🧠 记忆增长趋势",
        taskCompletionRate: "📋 任务完成率"
      }
    };

    const state = {
      activeTab: 'dashboard',
      memorySubTab: 'md',
      status: {},
      memory: {},
      radio: [],
      tasks: [],
      workflows: [],
      dispatch: [],
      relay: [],
      autoRefresh: true,
      refreshInterval: 5000,
      fallbackRefreshInterval: 30000,
      realtime: {
        connected: false,
        reconnectAttempt: 0,
        status: 'idle'
      },
      searchRadio: '',
      filterRadioType: '',
      filterRadioFrom: '',
      filterRadioTo: '',
      filterRadioProject: '',
      filterTaskProject: '',
      filterTaskPriority: '',
      endpointErrors: [],
      lang: localStorage.getItem('hub_lang') || 'zh'
    };

    let timer = null;
    let socket = null;
    let reconnectTimer = null;
    // Translation utilities
    function t(key, vars = {}) {
      let val = (i18n[state.lang] && i18n[state.lang][key]) || i18n['en'][key] || key;
      Object.keys(vars).forEach(k => {
        val = val.replace('{' + k + '}', vars[k]);
      });
      return val;
    }

    function toggleLanguage() {
      state.lang = state.lang === 'zh' ? 'en' : 'zh';
      localStorage.setItem('hub_lang', state.lang);
      translatePage();
      renderAll();
    }

    function translatePage() {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.innerHTML = t(key);
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
      });
      document.getElementById('btnLang').textContent = state.lang === 'zh' ? '🌐 English' : '🌐 中文';
    }

    // Helper: Escaping HTML safely
    function escapeHtml(val) {
      if (val === undefined || val === null) return '';
      return String(val).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    // Lightweight markdown parser for memory.md
    function formatMarkdown(text) {
      if (!text) return '<div class="muted">No data available.</div>';
      return escapeHtml(text)
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    }

    const virtualLists = new Map();

    function getVirtualState(key) {
      if (!virtualLists.has(key)) {
        virtualLists.set(key, {
          el: null,
          items: [],
          renderItem: null,
          options: {},
          heights: new Map(),
          raf: null,
          measureRaf: null
        });
      }
      return virtualLists.get(key);
    }

    function getVirtualItemKey(item, index, options) {
      if (typeof options.itemKey === 'function') {
        return String(options.itemKey(item, index));
      }
      return String(item && (item.id || item.key || item.ts || item.createdAt) || index);
    }

    function getVirtualItemHeight(stateObj, item, index) {
      const options = stateObj.options || {};
      const key = getVirtualItemKey(item, index, options);
      return stateObj.heights.get(key) || options.estimateHeight || 120;
    }

    function getVirtualOffsets(stateObj) {
      const items = stateObj.items || [];
      const gap = stateObj.options.gap ?? 12;
      const offsets = new Array(items.length + 1);
      let cursor = 0;
      offsets[0] = 0;
      items.forEach((item, index) => {
        cursor += getVirtualItemHeight(stateObj, item, index);
        if (index < items.length - 1) cursor += gap;
        offsets[index + 1] = cursor;
      });
      return { offsets, totalHeight: cursor };
    }

    function findVirtualIndex(offsets, target) {
      let low = 0;
      let high = Math.max(0, offsets.length - 2);
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (offsets[mid] <= target && target < offsets[mid + 1]) {
          return mid;
        }
        if (offsets[mid] < target) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return Math.max(0, Math.min(low, offsets.length - 2));
    }

    function scheduleVirtualRender(stateObj) {
      cancelAnimationFrame(stateObj.raf);
      stateObj.raf = requestAnimationFrame(() => renderVirtualWindow(stateObj));
    }

    function measureVirtualRows(stateObj) {
      const el = stateObj.el;
      if (!el) return;
      let changed = false;
      el.querySelectorAll('.virtual-row').forEach(row => {
        const index = Number(row.dataset.vindex);
        const item = stateObj.items[index];
        if (!item) return;
        const key = getVirtualItemKey(item, index, stateObj.options);
        const height = Math.ceil(row.getBoundingClientRect().height);
        if (height > 0 && Math.abs((stateObj.heights.get(key) || 0) - height) > 2) {
          stateObj.heights.set(key, height);
          changed = true;
        }
      });
      if (changed) {
        scheduleVirtualRender(stateObj);
      }
    }

    function renderVirtualWindow(stateObj) {
      const el = stateObj.el;
      const items = stateObj.items || [];
      const options = stateObj.options || {};
      if (!el || items.length === 0) return;

      const { offsets, totalHeight } = getVirtualOffsets(stateObj);
      const viewportHeight = el.clientHeight || options.viewportHeight || 500;
      const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
      if (el.scrollTop > maxScrollTop) {
        el.scrollTop = maxScrollTop;
      }

      const scrollTop = el.scrollTop;
      const overscan = options.overscan ?? 6;
      const gap = options.gap ?? 12;
      const start = Math.max(0, findVirtualIndex(offsets, scrollTop) - overscan);
      const end = Math.min(items.length, findVirtualIndex(offsets, scrollTop + viewportHeight) + overscan + 1);
      const topHeight = offsets[start] || 0;
      const bottomHeight = Math.max(0, totalHeight - (offsets[end] || totalHeight));
      const rows = [];

      for (let index = start; index < end; index += 1) {
        const item = items[index];
        const rowClass = options.rowClass ? ` ${options.rowClass}` : '';
        const marginBottom = index < items.length - 1 ? gap : 0;
        rows.push(`
          <div class="virtual-row${rowClass}" data-vindex="${index}" style="margin-bottom:${marginBottom}px;">
            ${stateObj.renderItem(item, index)}
          </div>
        `);
      }

      el.innerHTML = `
        <div class="virtual-spacer" style="height:${topHeight}px;"></div>
        <div class="virtual-window">${rows.join('')}</div>
        <div class="virtual-spacer" style="height:${bottomHeight}px;"></div>
      `;

      cancelAnimationFrame(stateObj.measureRaf);
      stateObj.measureRaf = requestAnimationFrame(() => measureVirtualRows(stateObj));
    }

    function renderVirtualList(target, items, renderItem, options = {}) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (!el) return;
      const listItems = Array.isArray(items) ? items : [];
      const key = options.key || el.id;
      const stateObj = getVirtualState(key);

      el.classList.add('virtual-list');
      if (options.className) {
        options.className.split(/\s+/).filter(Boolean).forEach(cls => el.classList.add(cls));
      }
      el.dataset.virtualCount = String(listItems.length);

      if (stateObj.el !== el) {
        stateObj.el = el;
        el.addEventListener('scroll', () => scheduleVirtualRender(stateObj), { passive: true });
      }

      stateObj.items = listItems;
      stateObj.renderItem = renderItem;
      stateObj.options = options;

      if (listItems.length === 0) {
        el.innerHTML = options.emptyHtml || '<div class="muted">No data available.</div>';
        return;
      }

      renderVirtualWindow(stateObj);
    }

    function formatInlineMarkdown(text) {
      return escapeHtml(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    }

    function getMarkdownBlocks(text) {
      return String(text || '')
        .split(/\r?\n/)
        .map((line, index) => ({ id: index, line }));
    }

    function renderMarkdownBlockHTML(block) {
      const line = block.line || '';
      if (!line.trim()) {
        return '<div class="markdown-line markdown-line-empty">&nbsp;</div>';
      }
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        return `<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`;
      }
      const listItem = line.match(/^\s*[-*]\s+(.*)$/);
      if (listItem) {
        return `
          <div class="markdown-list-item">
            <span class="markdown-list-marker">•</span>
            <span>${formatInlineMarkdown(listItem[1])}</span>
          </div>
        `;
      }
      return `<div class="markdown-line">${formatInlineMarkdown(line)}</div>`;
    }

    function renderMarkdownVirtual(containerId, text) {
      const blocks = getMarkdownBlocks(text).filter(block => block.line.trim() || block.id === 0);
      renderVirtualList(containerId, blocks, renderMarkdownBlockHTML, {
        key: containerId,
        className: 'markdown-virtual-list',
        itemKey: block => `${block.id}:${block.line.length}`,
        estimateHeight: 32,
        overscan: 28,
        gap: 2,
        viewportHeight: 700,
        emptyHtml: '<div class="muted">No data available.</div>'
      });
    }

    async function api(path, options = {}) {
      const res = await fetch(path, options);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      return json;
    }

    function switchTab(tabId) {
      state.activeTab = tabId;
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));

      const tabs = ['dashboard', 'memory', 'radio', 'tasks', 'dispatch', 'workflows', 'analytics', 'settings', 'health', 'search', 'tools'];
      const index = tabs.indexOf(tabId);
      if (index !== -1) {
        document.querySelectorAll('.nav-item')[index].classList.add('active');
      }
      const panel = document.getElementById('tab-' + tabId);
      if (!panel) {
        state.activeTab = 'dashboard';
        document.getElementById('tab-dashboard').classList.add('active');
        document.querySelectorAll('.nav-item')[0]?.classList.add('active');
        return;
      }
      panel.classList.add('active');
      localStorage.setItem('hub_active_tab', tabId);
      
      document.getElementById('sidebar').classList.remove('active');
      requestAnimationFrame(() => {
        if (tabId === 'memory') renderMemoryHub();
        if (tabId === 'radio') renderRadioFeed();
        if (tabId === 'tasks') renderTasksList();
        if (tabId === 'workflows') renderWorkflowsPanel();
        if (tabId === 'tools') renderToolsPanel();
        if (tabId === 'analytics') renderAnalytics();
      });
    }

    function switchMemorySubTab(sub) {
      state.memorySubTab = sub;
      document.getElementById('memorySubTab-md').style.display = sub === 'md' ? 'block' : 'none';
      document.getElementById('memorySubTab-profile').style.display = sub === 'profile' ? 'block' : 'none';
      requestAnimationFrame(renderMemoryHub);
    }

    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('active');
    }

    // Realtime refresh handlers
    function toggleAutoRefresh(checked) {
      state.autoRefresh = checked;
      if (checked) {
        startInterval();
      } else {
        stopRealtime();
      }
    }

    function startInterval() {
      startRealtime();
    }

    function startFallbackInterval() {
      clearInterval(timer);
      timer = setInterval(refreshData, state.fallbackRefreshInterval);
    }

    function stopFallbackInterval() {
      clearInterval(timer);
      timer = null;
    }

    function getWebSocketUrl() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws`;
    }

    function isRealtimeConnected() {
      return socket && socket.readyState === WebSocket.OPEN;
    }

    function startRealtime() {
      clearTimeout(reconnectTimer);
      if (!window.WebSocket) {
        state.realtime.status = 'fallback';
        startFallbackInterval();
        return;
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }

      state.realtime.status = 'connecting';
      socket = new WebSocket(getWebSocketUrl());
      socket.addEventListener('open', () => {
        state.realtime.connected = true;
        state.realtime.reconnectAttempt = 0;
        state.realtime.status = 'connected';
        stopFallbackInterval();
      });
      socket.addEventListener('message', handleRealtimeMessage);
      socket.addEventListener('close', () => {
        state.realtime.connected = false;
        socket = null;
        if (state.autoRefresh) {
          scheduleRealtimeReconnect();
        }
      });
      socket.addEventListener('error', () => {
        state.realtime.status = 'error';
        if (socket) {
          socket.close();
        }
      });
    }

    function scheduleRealtimeReconnect() {
      state.realtime.status = 'reconnecting';
      const attempt = Math.min(state.realtime.reconnectAttempt + 1, 8);
      state.realtime.reconnectAttempt = attempt;
      const delay = Math.min(30000, 1000 * Math.pow(2, attempt - 1));
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(startRealtime, delay);
      startFallbackInterval();
    }

    function stopRealtime() {
      clearTimeout(reconnectTimer);
      stopFallbackInterval();
      const currentSocket = socket;
      socket = null;
      state.realtime.connected = false;
      state.realtime.status = 'idle';
      if (currentSocket) {
        currentSocket.close();
      }
    }

    function handleRealtimeMessage(event) {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (err) {
        console.error('Invalid realtime message', err);
        return;
      }
      const snapshot = message.snapshot || message.data;
      if ((message.type === 'hello' || message.type === 'snapshot') && snapshot) {
        applyDashboardSnapshot(snapshot);
      }
    }

    function applyDashboardSnapshot(snapshot) {
      state.status = snapshot.status || {};
      state.memory = snapshot.memory || {};
      state.radio = (snapshot.radio && snapshot.radio.messages) || [];
      state.tasks = (snapshot.tasks && snapshot.tasks.tasks) || [];
      state.workflows = (snapshot.workflows && snapshot.workflows.workflows) || [];
      state.dispatch = (snapshot.dispatch && snapshot.dispatch.logs) || [];
      state.relay = (snapshot.dispatch && snapshot.dispatch.relay) || [];
      state.endpointErrors = [];
      renderAll();
    }

    // Fetch API Data
    async function refreshData() {
      const btn = document.getElementById('btnRefresh');
      if (btn) btn.disabled = true;
      try {
        const endpointErrors = [];
        const recordEndpointError = (endpoint, reason) => {
          const message = reason && reason.message ? reason.message : String(reason || 'Unknown error');
          endpointErrors.push({ endpoint, message });
          console.error(`Failed to load ${endpoint}`, reason);
        };

        try {
          const snapshot = await api('/api/dashboard');
          applyDashboardSnapshot(snapshot);
          return;
        } catch (dashboardErr) {
          recordEndpointError('/api/dashboard', dashboardErr);
        }

        const [statusRes, memoryRes, radioRes, tasksRes, workflowsRes, dispatchRes] = await Promise.allSettled([
          api('/api/status'),
          api('/api/memory'),
          api('/api/radio'),
          api('/api/tasks'),
          api('/api/workflows'),
          api('/api/dispatch')
        ]);

        if (statusRes.status === 'fulfilled') {
          state.status = statusRes.value || {};
        } else {
          recordEndpointError('/api/status', statusRes.reason);
        }
        if (memoryRes.status === 'fulfilled') {
          state.memory = memoryRes.value || {};
        } else {
          recordEndpointError('/api/memory', memoryRes.reason);
        }
        if (radioRes.status === 'fulfilled') {
          state.radio = (radioRes.value && radioRes.value.messages) || [];
        } else {
          recordEndpointError('/api/radio', radioRes.reason);
          state.radio = [];
        }
        if (tasksRes.status === 'fulfilled') {
          state.tasks = (tasksRes.value && tasksRes.value.tasks) || [];
        } else {
          recordEndpointError('/api/tasks', tasksRes.reason);
          state.tasks = [];
        }
        if (workflowsRes.status === 'fulfilled') {
          state.workflows = (workflowsRes.value && workflowsRes.value.workflows) || [];
        } else {
          recordEndpointError('/api/workflows', workflowsRes.reason);
          state.workflows = [];
        }
        if (dispatchRes.status === 'fulfilled') {
          state.dispatch = (dispatchRes.value && dispatchRes.value.logs) || [];
          state.relay = (dispatchRes.value && dispatchRes.value.relay) || [];
        } else {
          recordEndpointError('/api/dispatch', dispatchRes.reason);
          state.dispatch = [];
          state.relay = [];
        }

        state.endpointErrors = endpointErrors;
        renderAll();
      } catch (err) {
        console.error(err);
        state.endpointErrors = [{ endpoint: 'refreshData', message: err.message || String(err) }];
        renderEndpointErrors();
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // Render operations
    function renderAll() {
      const tools = Array.isArray(state.status.tools) ? state.status.tools : [];
      renderEndpointErrors();

      // Inject Analytics Tab if not present
      injectAnalyticsTab();

      // Top bar info
      document.getElementById('memoryDir').textContent = state.status.memoryDir || 'unavailable';

      // Sidebar badges
      document.getElementById('sidebarPending').textContent = state.status.pendingEvents || 0;
      document.getElementById('sidebarRadio').textContent = state.radio.length;
      
      const activeTasksCount = state.tasks.filter(t => ['claimed', 'in_progress', 'blocked'].includes(t.status)).length;
      document.getElementById('sidebarTasks').textContent = activeTasksCount;
      const workflowBadge = document.getElementById('sidebarWorkflows');
      if (workflowBadge) workflowBadge.textContent = state.workflows.length;

      // Overview Metrics cards
      document.getElementById('cardActiveTasks').textContent = activeTasksCount;
      document.getElementById('cardPending').textContent = state.status.pendingEvents || 0;
      document.getElementById('cardRadio').textContent = state.radio.length;
      document.getElementById('cardLedger').textContent = state.status.ledgerEvents || 0;
      document.getElementById('cardBackups').textContent = state.status.backups || 0;

      // Compatibility variables population
      document.getElementById('pending').textContent = state.status.pendingEvents || 0;
      document.getElementById('ledger').textContent = state.status.ledgerEvents || 0;
      document.getElementById('radioCount').textContent = state.radio.length;
      document.getElementById('taskCount').textContent = activeTasksCount;
      document.getElementById('backupCount').textContent = state.status.backups || 0;
      document.getElementById('toolCount').textContent = state.status.toolSummary?.connected ?? tools.filter(t => t.connected).length;
      
      document.getElementById('memory').textContent = state.memory.memory || '';
      document.getElementById('pendingJson').textContent = JSON.stringify(state.memory.pending || [], null, 2);
      document.getElementById('radioJson').textContent = JSON.stringify(state.radio || [], null, 2);
      document.getElementById('tasksJson').textContent = JSON.stringify(state.tasks || [], null, 2);

      // Detected Tools Matrix
      const toolsHtml = tools.map(t => {
        const displayName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][t.name]) || t.name;
        const kindBadge = (toolKindBadges[state.lang] && toolKindBadges[state.lang][t.kind]) || t.kind;
        const kindClass = toolKindClasses[t.kind] || 'kind-cli';

        return `
          <div class="tool-row" onclick="showToolInstallModal('${t.name}')" title="${escapeHtml(t.connectionStatus || (t.installed ? 'installed' : 'missing'))}: ${escapeHtml(t.action || t.dir || '')}">
            <div class="tool-info">
              ${renderToolIcon(t.name, 24, t.kind)}
              <div class="tool-meta">
                <div class="tool-name">${escapeHtml(displayName)}</div>
              </div>
            </div>
            <div class="tool-right">
              <span class="tool-kind-badge ${kindClass}">${escapeHtml(kindBadge)}</span>
              <div class="tool-status ${t.connected ? 'installed' : ''}"></div>
            </div>
          </div>
        `;
      }).join('');
      document.getElementById('detectedTools').innerHTML = toolsHtml || `<div class="muted">${t('scanning')}</div>`;

      // Dropdown filters logic
      populateFilterOptions();

      // Render tab components
      renderDashboardOverview();
      renderWorkflowStages();
      renderMemoryHub();
      renderRadioFeed();
      renderTasksList();
      renderDispatchLogs();
      renderWorkflowsPanel();
      renderToolsPanel();
      renderSettingsPanel();
      renderAnalytics();
    }

    function renderEndpointErrors() {
      const el = document.getElementById('endpointErrors');
      if (!el) return;
      const errors = Array.isArray(state.endpointErrors) ? state.endpointErrors : [];
      if (errors.length === 0) {
        el.hidden = true;
        el.innerHTML = '';
        return;
      }
      el.hidden = false;
      const items = errors.map(err => `
        <div class="endpoint-error-item">
          <code>${escapeHtml(err.endpoint)}</code>
          <span>${escapeHtml(err.message)}</span>
        </div>
      `).join('');
      el.innerHTML = `
        <div class="endpoint-errors-title">${escapeHtml(t('endpointErrorTitle'))} · ${escapeHtml(t('endpointErrorSummary', { n: errors.length }))}</div>
        <div class="endpoint-errors-help">${escapeHtml(t('endpointLoadWarning'))}</div>
        <div class="endpoint-errors-list">${items}</div>
      `;
    }

    function populateFilterOptions() {
      const fromSet = new Set();
      const toSet = new Set();
      const projectSet = new Set();

      state.radio.forEach(msg => {
        if (msg.from) fromSet.add(msg.from);
        if (msg.to) toSet.add(msg.to);
        if (msg.project) projectSet.add(msg.project);
      });

      const tskProjSet = new Set();
      state.tasks.forEach(tsk => {
        if (tsk.project) {
          tskProjSet.add(tsk.project);
          projectSet.add(tsk.project);
        }
      });

      updateSelectOptions('filterRadioFromOpt', Array.from(fromSet), t('senderAll'));
      updateSelectOptions('filterRadioToOpt', Array.from(toSet), t('recipientAll'));
      updateSelectOptions('filterRadioProject', Array.from(projectSet), t('allProjects'));
      updateSelectOptions('filterTaskProject', Array.from(tskProjSet), t('allProjects'));
      updateProjectInputOptions(Array.from(projectSet));
    }

    function updateSelectOptions(elementId, values, defaultLabel) {
      const select = document.getElementById(elementId);
      if (!select) return;
      const current = select.value;
      let html = `<option value="">${defaultLabel}</option>`;
      values.sort().forEach(v => {
        html += `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
      });
      select.innerHTML = html;
      select.value = current;
    }

    function updateProjectInputOptions(values) {
      updateProjectSelectOptions('radProject', values, '');
      updateProjectSelectOptions('tskProject', values, 'default');
    }

    function updateProjectSelectOptions(elementId, values, fallbackValue) {
      const select = document.getElementById(elementId);
      if (!select) return;
      const current = select.value;
      const customOption = `<option value="__custom__">${t('customProject')}</option>`;
      const placeholder = elementId === 'radProject'
        ? `<option value="">${t('selectProject')}</option>`
        : '';
      const normalized = Array.from(new Set(values.filter(Boolean))).sort();
      const options = normalized
        .map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
        .join('');
      select.innerHTML = `${placeholder}${options}${customOption}`;

      if (current === '__custom__' || normalized.includes(current) || current === '') {
        select.value = current;
      } else if (current) {
        select.value = '__custom__';
      } else {
        select.value = fallbackValue;
      }

      toggleCustomProjectInput(elementId === 'radProject' ? 'rad' : 'tsk');
    }

    function toggleCustomProjectInput(prefix) {
      const select = document.getElementById(prefix + 'Project');
      const input = document.getElementById(prefix + 'ProjectCustom');
      if (!select || !input) return;
      const showCustom = select.value === '__custom__';
      input.style.display = showCustom ? 'block' : 'none';
      if (!showCustom) {
        input.value = '';
      }
    }

    function getProjectValue(prefix, fallbackValue = '') {
      const select = document.getElementById(prefix + 'Project');
      const input = document.getElementById(prefix + 'ProjectCustom');
      if (!select) return fallbackValue;
      if (select.value === '__custom__') {
        return (input?.value || '').trim() || fallbackValue;
      }
      return select.value || fallbackValue;
    }

    function formatDateTime(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
      return date.toLocaleString();
    }

    function getDispatchRecordForMessage(msg) {
      return state.dispatch.find(log => log.kind === 'radio' && log.refId === msg.id) || null;
    }

    function getThreadReplies(msg) {
      if (!msg.thread) return [];
      return state.radio.filter(item =>
        item.id !== msg.id &&
        item.thread &&
        item.thread === msg.thread &&
        item.type === 'status'
      );
    }

    function getDeliveryMeta(msg) {
      const dispatchRecord = getDispatchRecordForMessage(msg);
      const replies = getThreadReplies(msg);
      const badges = [
        { tone: 'delivery-written', label: t('deliveryWritten') }
      ];
      const details = [];

      if (msg.to === 'all') {
        details.push(t('dispatchToAll'));
      } else if (msg.to) {
        const targetName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][msg.to]) || msg.to;
        details.push(t('dispatchToTool', { tool: targetName }));
      }

      if (dispatchRecord) {
        if (dispatchRecord.runnable && dispatchRecord.exitCode === 0) {
          badges.push({ tone: 'delivery-dispatched', label: t('deliveryDispatched') });
        } else if (dispatchRecord.runnable) {
          badges.push({ tone: 'delivery-failed', label: t('deliveryFailed') });
        }
      } else if (msg.to && msg.to !== 'all') {
        details.push(t('deliveryPendingRead'));
      }

      if (replies.length > 0) {
        badges.push({ tone: 'delivery-replied', label: t('deliveryReplied') });
      }

      return { dispatchRecord, replies, badges, details };
    }

    function formatElapsedTime(startValue, endValue = '') {
      const startMs = Date.parse(startValue || '');
      if (Number.isNaN(startMs)) return '';
      const endMs = Date.parse(endValue || '') || Date.now();
      const diff = Math.max(0, endMs - startMs);
      if (diff < 60000) return `${Math.round(diff / 1000)}s`;
      if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
      if (diff < 86400000) return `${(diff / 3600000).toFixed(1)}h`;
      return `${(diff / 86400000).toFixed(1)}d`;
    }

    function getTaskRelay(task) {
      return state.relay.find(relay =>
        relay.sourceKind === 'task' &&
        (
          relay.sourceId === task.id ||
          relay.dispatchId === `task:${task.id}` ||
          relay.thread === task.id
        )
      ) || null;
    }

    function getLatestTaskNote(task) {
      const notes = Array.isArray(task.notes) ? task.notes : [];
      return notes.length > 0 ? notes[notes.length - 1] : null;
    }

    function renderTaskTelemetry(task) {
      const relay = getTaskRelay(task);
      const latestNote = getLatestTaskNote(task);
      const duration = formatElapsedTime(task.createdAt, task.completedAt || '');
      const dispatchState = relay?.state || task.deliveryState || 'none';
      const noteHtml = latestNote
        ? `<div class="task-handoff"><strong>${t('latestNoteLabel')}:</strong> ${escapeHtml(latestNote.text || '')}</div>`
        : '';
      return `
        <div class="task-meta">
          <span>${t('durationLabel')}: ${escapeHtml(duration || '-')}</span>
          <span>${t('dispatchStateLabel')}: <span class="badge status-${escapeHtml(dispatchState)}">${escapeHtml(dispatchState)}</span></span>
        </div>
        ${noteHtml}
      `;
    }

    // Dashboard Overview Tab Rendering
    function renderDashboardOverview() {
      // Render Active Tasks
      const activeTasks = state.tasks.filter(task => ['claimed', 'in_progress', 'blocked'].includes(task.status));
      const renderDashboardTaskCardHTML = task => {
        const assigneeDisplayName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][task.assignee]) || task.assignee || t('unassigned');
        return `
          <div class="task-card">
            <div style="display:flex;justify-content:between;align-items:start;gap:8px;">
              <div style="flex:1;">
                <span class="badge priority-${task.priority}">${t(task.priority + 'Opt')}</span>
                <h4 class="task-title">${escapeHtml(task.title)}</h4>
              </div>
              <span class="badge status-${task.status}">${t(task.status === 'in_progress' ? 'startWork' : task.status + 'Task')}</span>
            </div>
            ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
            <div class="task-meta">
              <span class="task-assignee" style="display:inline-flex;align-items:center;gap:6px;">
                👤 ${renderToolIcon(task.assignee, 22)} <span>${escapeHtml(assigneeDisplayName)}</span>
              </span>
              <span>Project: ${escapeHtml(task.project || t('defaultProj'))}</span>
            </div>
            ${renderTaskTelemetry(task)}
            ${renderTaskReviewHTML(task)}
            <div class="stream-actions">
              <button class="primary small" onclick="updateTaskStatus('${task.id}', 'done')">${t('completeTask')}</button>
              <button class="primary small" onclick="reviewTask('${task.id}', 'approved')">${t('approveTask')}</button>
              <button class="small danger" onclick="reviewTask('${task.id}', 'rejected')">${t('rejectTask')}</button>
            </div>
          </div>
        `;
      };
      renderVirtualList('dashboardTasks', activeTasks, renderDashboardTaskCardHTML, {
        key: 'dashboardTasks',
        className: 'task-list-virtual dashboard-task-virtual',
        itemKey: task => task.id,
        estimateHeight: 230,
        overscan: 4,
        gap: 12,
        viewportHeight: 500,
        emptyHtml: `<div class="muted">${t('noActiveTasks')}</div>`
      });

      // Render Recent Radio Stream (last 5)
      const recentRadio = state.radio.slice(-5).reverse();
      const recentRadHtml = recentRadio.length > 0 ? recentRadio.map(renderRadioCardHTML).join('') : `<div class="muted">${t('noRecentMessages')}</div>`;
      document.getElementById('dashboardRadio').innerHTML = recentRadHtml;
    }

    function renderWorkflowStages() {
      const workflows = Array.isArray(state.workflows) ? state.workflows : [];
      const workflowIds = new Set(workflows.map(w => w.id).filter(Boolean));
      const linkedTaskIds = new Set(workflows.flatMap(w => Array.isArray(w.linkedTasks) ? w.linkedTasks : []));
      const linkedTasks = state.tasks.filter(task => linkedTaskIds.has(task.id));
      const activeLinkedTasks = linkedTasks.filter(task => ['claimed', 'in_progress'].includes(task.status));
      const blockedLinkedTasks = linkedTasks.filter(task => task.status === 'blocked');
      const workflowRelays = state.relay.filter(relay =>
        relay.sourceKind === 'workflow' ||
        workflowIds.has(relay.sourceId) ||
        workflowIds.has(relay.thread)
      );
      const failedWorkflowRelays = workflowRelays.filter(relay => ['failed', 'abandoned'].includes(relay.state));

      const openWorkflows = workflows.filter(w => ['open', 'planned'].includes(w.status));
      const runningWorkflows = workflows.filter(w => w.status === 'in_progress');
      const verifyingWorkflows = workflows.filter(w =>
        !['done', 'cancelled'].includes(w.status) &&
        Array.isArray(w.results) &&
        w.results.length > 0 &&
        (!Array.isArray(w.reviews) || w.reviews.length === 0)
      );
      const reviewWorkflows = workflows.filter(w =>
        w.status === 'review' ||
        (!['done', 'cancelled'].includes(w.status) && Array.isArray(w.reviews) && w.reviews.length > 0)
      );
      const doneWorkflows = workflows.filter(w => w.status === 'done');
      const blockedWorkflows = workflows.filter(w => w.status === 'blocked');

      const stages = [
        {
          label: t('planningStage'),
          count: openWorkflows.length,
          detail: t('workflowStageDetail', { n: openWorkflows.length })
        },
        {
          label: t('executionStage'),
          count: runningWorkflows.length + activeLinkedTasks.length,
          detail: `${t('workflowStageDetail', { n: runningWorkflows.length })} | ${t('taskStageDetail', { n: activeLinkedTasks.length })}`
        },
        {
          label: t('verificationStage'),
          count: verifyingWorkflows.length,
          detail: t('workflowStageDetail', { n: verifyingWorkflows.length })
        },
        {
          label: t('reviewStage'),
          count: reviewWorkflows.length,
          detail: t('workflowStageDetail', { n: reviewWorkflows.length })
        },
        {
          label: t('deliveryStage'),
          count: doneWorkflows.length,
          detail: t('workflowStageDetail', { n: doneWorkflows.length })
        },
        {
          label: t('blockedStage'),
          count: blockedWorkflows.length + blockedLinkedTasks.length + failedWorkflowRelays.length,
          detail: `${t('workflowStageDetail', { n: blockedWorkflows.length })} | ${t('taskStageDetail', { n: blockedLinkedTasks.length })} | ${t('relayStageDetail', { n: failedWorkflowRelays.length })}`
        }
      ];

      document.getElementById('workflowStageStrip').innerHTML = stages.map(stage => `
        <div class="workflow-stage">
          <strong>${escapeHtml(stage.label)}</strong>
          <div class="stage-count">${stage.count}</div>
          <div class="stage-detail">${escapeHtml(stage.detail)}</div>
        </div>
      `).join('');

      const workflowRows = workflows.slice(0, 5).map(workflow => {
        const roles = [
          ...(workflow.planner || []),
          ...(workflow.executor || []),
          ...(workflow.reviewer || [])
        ].filter(Boolean).slice(0, 4).join(' -> ');
        const progress = workflow.progressPercent !== undefined && workflow.progressPercent !== null
          ? ` | ${t('progressLabel')}: ${workflow.progressPercent}%`
          : '';
        return `
          <div class="workflow-row">
            <div>
              <div class="workflow-title">${escapeHtml(workflow.title)}</div>
              <div class="workflow-meta">${escapeHtml(workflow.project || t('defaultProj'))}${roles ? ` | ${escapeHtml(roles)}` : ''}${progress}</div>
            </div>
            <span class="badge status-${workflow.status || 'open'}">${escapeHtml(workflow.status || 'open')}</span>
          </div>
        `;
      }).join('');
      document.getElementById('workflowList').innerHTML = workflowRows || `<div class="muted">${t('noWorkflows')}</div>`;
    }

    function renderRadioCardHTML(msg) {
      const fromName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][msg.from]) || msg.from;
      const toName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][msg.to]) || msg.to;
      const delivery = getDeliveryMeta(msg);
      const badgesHtml = delivery.badges
        .map(item => `<span class="stream-status-badge ${item.tone}">${escapeHtml(item.label)}</span>`)
        .join('');
      const detailHtml = delivery.details.length > 0
        ? `<span class="stream-status-detail">${escapeHtml(delivery.details.join(' · '))}</span>`
        : '';
      const threadHtml = msg.thread
        ? `<div class="stream-thread">${t('threadLabel')}: ${escapeHtml(msg.thread)}</div>`
        : '';
      const replyHtml = delivery.replies.length > 0
        ? delivery.replies.map(reply => {
            const replyFromName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][reply.from]) || reply.from;
            return `
              <details class="stream-collapsible">
                <summary>${t('replySummary', { tool: replyFromName })} · ${formatDateTime(reply.ts || reply.createdAt)}</summary>
                <div class="stream-body" style="margin-top:8px;">${escapeHtml(reply.text)}</div>
              </details>
            `;
          }).join('')
        : '';
      const shouldCollapseBody = msg.type === 'status';
      const bodyHtml = shouldCollapseBody
        ? `
          <details class="stream-collapsible">
            <summary>${t('showStatusReply')}</summary>
            <div class="stream-body" style="margin-top:8px;">${escapeHtml(msg.text)}</div>
          </details>
        `
        : `<div class="stream-body">${escapeHtml(msg.text)}</div>`;

      return `
        <div class="stream-card">
          <div class="stream-header">
            <div class="stream-meta" style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="stream-sender" style="display:inline-flex;align-items:center;gap:4px;">
                ${renderToolIcon(msg.from, 22)} <strong>${escapeHtml(fromName)}</strong>
              </span>
              <span style="color:var(--text-muted);">➡️</span>
              <span class="stream-sender" style="display:inline-flex;align-items:center;gap:4px;">
                ${renderToolIcon(msg.to, 22)} <strong>${escapeHtml(toName)}</strong>
              </span>
              <span class="badge status-open" style="margin-left:4px;">${t(msg.type + 'Opt')}</span>
            </div>
            <span class="muted">${formatDateTime(msg.ts || msg.createdAt)}</span>
          </div>
          <div class="stream-status-row">${badgesHtml}${detailHtml}</div>
          ${threadHtml}
          ${bodyHtml}
          ${replyHtml}
          ${msg.project ? `<div style="font-size:11px;"><span class="stream-project">${escapeHtml(msg.project)}</span></div>` : ''}
          <div class="stream-actions">
            <button class="small" onclick="promoteRadio('${msg.id}')">${t('promoteToMemory')}</button>
          </div>
        </div>
      `;
    }

    // Memory Hub Rendering
    function renderMemoryHub() {
      renderMarkdownVirtual('memorySubTab-md', state.memory.memory);
      renderMarkdownVirtual('memorySubTab-profile', state.memory.profile);

      const inboxRows = (state.memory.pending || []).map(event => {
        const srcName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][event.source]) || event.source;
        return `
          <tr>
            <td>
              <div style="display:inline-flex;align-items:center;gap:6px;">
                ${renderToolIcon(event.source, 22)} <strong style="color:var(--accent-purple);">${escapeHtml(srcName)}</strong>
              </div>
            </td>
            <td style="word-break:break-all;">${escapeHtml(event.text)}</td>
          </tr>
        `;
      }).join('');
      document.getElementById('inboxTable').innerHTML = inboxRows || `<tr><td colspan="2" class="muted">${t('noPendingTable')}</td></tr>`;
    }

    // Agent Radio Stream Rendering with filters
    function applyRadioFilters() {
      state.searchRadio = document.getElementById('filterRadioQuery').value.toLowerCase();
      state.filterRadioFrom = document.getElementById('filterRadioFromOpt').value;
      state.filterRadioTo = document.getElementById('filterRadioToOpt').value;
      state.filterRadioType = document.getElementById('filterRadioTypeOpt').value;
      renderRadioFeed();
    }

    function renderRadioFeed() {
      let filtered = [...state.radio];

      if (state.searchRadio) {
        filtered = filtered.filter(m => String(m.text).toLowerCase().includes(state.searchRadio));
      }
      if (state.filterRadioFrom) {
        filtered = filtered.filter(m => m.from === state.filterRadioFrom);
      }
      if (state.filterRadioTo) {
        filtered = filtered.filter(m => m.to === state.filterRadioTo);
      }
      if (state.filterRadioType) {
        filtered = filtered.filter(m => m.type === state.filterRadioType);
      }

      renderVirtualList('radioFeed', filtered.reverse(), renderRadioCardHTML, {
        key: 'radioFeed',
        className: 'stream-virtual',
        itemKey: msg => msg.id || `${msg.ts || msg.createdAt}:${msg.from}:${msg.to}`,
        estimateHeight: 175,
        overscan: 6,
        gap: 12,
        viewportHeight: 500,
        emptyHtml: `<div class="muted">${t('noRadioMessages')}</div>`
      });
    }

    // Tasks Board Rendering
    function renderTasksList() {
      state.filterTaskProject = document.getElementById('filterTaskProject').value;
      state.filterTaskPriority = document.getElementById('filterTaskPriority').value;

      let filtered = [...state.tasks];

      if (state.filterTaskProject) {
        filtered = filtered.filter(t => t.project === state.filterTaskProject);
      }
      if (state.filterTaskPriority) {
        filtered = filtered.filter(t => t.priority === state.filterTaskPriority);
      }

      const colOpen = [];
      const colActive = [];
      const colCompleted = [];

      filtered.forEach(t => {
        if (['open'].includes(t.status)) {
          colOpen.push(t);
        } else if (['claimed', 'in_progress', 'blocked'].includes(t.status)) {
          colActive.push(t);
        } else if (['done', 'cancelled'].includes(t.status)) {
          colCompleted.push(t);
        }
      });

      document.getElementById('countOpen').textContent = colOpen.length;
      document.getElementById('countActive').textContent = colActive.length;
      document.getElementById('countCompleted').textContent = colCompleted.length;

      renderVirtualList('col-open', colOpen, renderTaskCardHTML, {
        key: 'tasks-open',
        className: 'task-list-virtual',
        itemKey: task => task.id,
        estimateHeight: 270,
        overscan: 5,
        gap: 12,
        viewportHeight: 620,
        emptyHtml: `<div class="muted" style="text-align:center;padding:20px;">${t('noOpenTasks')}</div>`
      });
      renderVirtualList('col-active', colActive, renderTaskCardHTML, {
        key: 'tasks-active',
        className: 'task-list-virtual',
        itemKey: task => task.id,
        estimateHeight: 270,
        overscan: 5,
        gap: 12,
        viewportHeight: 620,
        emptyHtml: `<div class="muted" style="text-align:center;padding:20px;">${t('noActiveClaimedTasks')}</div>`
      });
      renderVirtualList('col-completed', colCompleted, renderTaskCardHTML, {
        key: 'tasks-completed',
        className: 'task-list-virtual',
        itemKey: task => task.id,
        estimateHeight: 270,
        overscan: 5,
        gap: 12,
        viewportHeight: 620,
        emptyHtml: `<div class="muted" style="text-align:center;padding:20px;">${t('noCompletedTasks')}</div>`
      });
    }

    function renderTaskCardHTML(tItem) {
      const notesHtml = (tItem.notes || []).map(n => {
        const noteAuthorName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][n.by]) || n.by;
        return `
          <div class="task-note-item">
            <strong style="display:inline-flex;align-items:center;gap:4px;">
              [${renderToolIcon(n.by, 16)} <span>${escapeHtml(noteAuthorName)}</span>]:
            </strong> ${escapeHtml(n.text)}
            <span style="font-size:10px;display:block;" class="muted">${new Date(n.ts).toLocaleString()}</span>
          </div>
        `;
      }).join('');

      let actionButtons = '';
      if (tItem.status === 'open') {
        actionButtons += `<button class="primary small" onclick="claimTask('${tItem.id}')">${t('claimTask')}</button>`;
      } else if (['claimed', 'in_progress', 'blocked'].includes(tItem.status)) {
        if (tItem.status !== 'in_progress') {
          actionButtons += `<button class="small" onclick="updateTaskStatus('${tItem.id}', 'in_progress')">${t('startWork')}</button>`;
        }
        if (tItem.status !== 'blocked') {
          actionButtons += `<button class="small danger" onclick="promptBlockTask('${tItem.id}')">${t('blockTask')}</button>`;
        } else {
          actionButtons += `<button class="small" onclick="updateTaskStatus('${tItem.id}', 'in_progress')">${t('unblockTask')}</button>`;
        }
        actionButtons += `<button class="primary small" onclick="updateTaskStatus('${tItem.id}', 'done')">${t('completeTask')}</button>`;
      } else if (['done', 'cancelled'].includes(tItem.status)) {
        actionButtons += `<button class="small" onclick="updateTaskStatus('${tItem.id}', 'open')">${t('reopenTask')}</button>`;
      }

      const assigneeDisplayName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][tItem.assignee]) || tItem.assignee || t('unassigned');

      if (tItem.status !== 'cancelled') {
        actionButtons += `<button class="primary small" onclick="reviewTask('${tItem.id}', 'approved')">${t('approveTask')}</button>`;
        actionButtons += `<button class="small danger" onclick="reviewTask('${tItem.id}', 'rejected')">${t('rejectTask')}</button>`;
      }

      return `
        <div class="task-card">
          <div style="display:flex;justify-content:between;align-items:start;gap:8px;">
            <div style="flex:1;">
              <span class="badge priority-${tItem.priority}">${t(tItem.priority + 'Opt')}</span>
              <h4 class="task-title">${escapeHtml(tItem.title)}</h4>
            </div>
            <span class="badge status-${tItem.status}">${t(tItem.status === 'in_progress' ? 'startWork' : tItem.status + 'Task')}</span>
          </div>
          ${tItem.description ? `<div class="task-desc">${escapeHtml(tItem.description)}</div>` : ''}
          ${tItem.handoff ? `<div class="task-handoff"><strong>Handoff:</strong> ${escapeHtml(tItem.handoff)}</div>` : ''}
          <div class="task-meta">
            <span class="task-assignee" style="display:inline-flex;align-items:center;gap:6px;">
              👤 ${renderToolIcon(tItem.assignee, 22)} <span>${escapeHtml(assigneeDisplayName)}</span>
            </span>
            <span>Proj: ${escapeHtml(tItem.project || t('defaultProj'))}</span>
          </div>
          ${renderTaskTelemetry(tItem)}
          ${renderTaskReviewHTML(tItem)}
          ${notesHtml ? `<div class="task-notes"><h5>Notes:</h5>${notesHtml}</div>` : ''}
          
          <div style="display:flex;gap:6px;align-items:center;margin-top:8px;">
            <input type="text" placeholder="${t('addNotePlaceholder')}" id="note-in-${tItem.id}" style="padding:6px;font-size:12px;" onkeydown="if(event.key==='Enter') submitTaskNote('${tItem.id}')">
            <button class="small" onclick="submitTaskNote('${tItem.id}')">💬</button>
          </div>

          <div class="stream-actions" style="margin-top:8px;">
            ${actionButtons}
          </div>
        </div>
      `;
    }

    function renderTaskReviewHTML(task) {
      if (!task.reviewStatus) return '';
      const reviewerName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][task.reviewedBy]) || task.reviewedBy || '-';
      const reviewedAt = task.reviewedAt ? formatDateTime(task.reviewedAt) : '-';
      const statusClass = task.reviewStatus === 'approved' ? 'status-done' : 'status-blocked';
      return `
        <div class="task-review">
          <div><strong>${t('reviewDecisionLabel')}:</strong> <span class="badge ${statusClass}">${escapeHtml(task.reviewStatus)}</span></div>
          <div>${t('reviewedByLabel')}: ${escapeHtml(reviewerName)} · ${escapeHtml(reviewedAt)}</div>
          ${task.reviewNote ? `<div>${escapeHtml(task.reviewNote)}</div>` : ''}
        </div>
      `;
    }

    // Dispatch Logs tab rendering
    function renderDispatchLogs() {
      const relayHtml = state.relay.length > 0 ? state.relay.map(relay => {
        const toolDisplayName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][relay.tool]) || relay.tool || 'unknown';
        const stateClass = 'status-' + (relay.state || 'open');
        const progressParts = [];
        if (relay.progressPercent !== undefined && relay.progressPercent !== null) {
          progressParts.push(`${t('progressLabel')}: ${relay.progressPercent}%`);
        }
        if (relay.progressStatus) {
          progressParts.push(relay.progressStatus);
        }
        if (relay.progressBy) {
          progressParts.push(`${t('progressBy')}: ${relay.progressBy}`);
        }
        const progressHtml = progressParts.length > 0
          ? `<div class="dispatch-output-box" style="margin-top:8px;">${escapeHtml(progressParts.join(' | '))}</div>`
          : '';
        const errorHtml = relay.lastError
          ? `<div class="dispatch-output-box" style="margin-top:8px;color:#ff7b72;">${escapeHtml(relay.lastError)}</div>`
          : '';

        return `
          <div class="dispatch-log-card">
            <div class="dispatch-log-header">
              <div class="dispatch-log-meta" style="display:inline-flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span class="dispatch-log-tool" style="display:inline-flex;align-items:center;gap:6px;">
                  ${renderToolIcon(relay.tool, 22)} <strong>${escapeHtml(toolDisplayName)}</strong>
                </span>
                <span class="dispatch-log-project">${escapeHtml(relay.project || 'no-project')}</span>
                <span style="font-size:11px;" class="muted">${formatDateTime(relay.ts || relay.progressAt)}</span>
              </div>
              <span class="badge ${stateClass}">${escapeHtml(relay.state || 'unknown')}</span>
            </div>
            <div style="font-size:13px;margin-top:8px;">
              <strong>Thread:</strong> ${escapeHtml(relay.threadKey || relay.thread || relay.sourceId || '')}
              <span class="muted"> | attempt ${Number(relay.attempt || 0)}/${Number(relay.maxRetries || 0)}</span>
            </div>
            ${progressHtml}
            ${errorHtml}
          </div>
        `;
      }).join('') : `<div class="muted">${t('noDispatcherEvents')}</div>`;

      const logsHtml = state.dispatch.length > 0 ? state.dispatch.map(log => {
        const exitText = log.exitCode === 0 ? t('successText') + ' (0)' : t('failedText') + ' (' + log.exitCode + ')';
        const statusClass = log.exitCode === 0 ? 'status-done' : 'status-blocked';
        const runnableText = log.runnable ? t('runnableText') : t('notRunnableText');
        const toolDisplayName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][log.tool]) || log.tool;
        
        return `
          <div class="dispatch-log-card">
            <div class="dispatch-log-header" onclick="toggleLogAccordion('${log.id}')">
              <div class="dispatch-log-meta" style="display:inline-flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span class="dispatch-log-tool" style="display:inline-flex;align-items:center;gap:6px;">
                  ${renderToolIcon(log.tool, 22)} <strong>${escapeHtml(toolDisplayName)}</strong>
                </span>
                <span class="dispatch-log-project">${escapeHtml(log.project || 'no-project')}</span>
                <span style="font-size:11px;" class="muted">${new Date(log.dispatchedAt || log.ts).toLocaleString()}</span>
              </div>
              <span class="badge ${statusClass}">${exitText}</span>
            </div>
            <div class="dispatch-log-details" id="acc-${log.id}">
              <div style="font-size:13px;margin-bottom:8px;">
                <strong>Trigger:</strong> ${escapeHtml(log.kind)} | <strong>Status:</strong> ${runnableText}
              </div>
              <div><strong>Command Payload:</strong></div>
              <div class="dispatch-output-box">${escapeHtml(log.text)}</div>
              ${log.stdout ? `<div><strong>Stdout:</strong></div><div class="dispatch-output-box">${escapeHtml(log.stdout)}</div>` : ''}
              ${log.stderr ? `<div><strong>Stderr:</strong></div><div class="dispatch-output-box" style="color:#ff7b72;">${escapeHtml(log.stderr)}</div>` : ''}
              ${log.error ? `<div><strong>Error:</strong></div><div class="dispatch-output-box" style="color:#ff7b72;">${escapeHtml(log.error)}</div>` : ''}
            </div>
          </div>
        `;
      }).join('') : `<div class="muted">${t('noDispatch')}</div>`;
      
      document.getElementById('dispatchRelay').innerHTML = relayHtml;
      document.getElementById('dispatchLogs').innerHTML = logsHtml;
    }

    function toggleLogAccordion(id) {
      document.getElementById('acc-' + id).classList.toggle('active');
    }

    // API Submit Actions
    async function submitMemory() {
      const text = document.getElementById('memText').value.trim();
      if (!text) return;
      await api('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          source: document.getElementById('memSource').value || 'dashboard',
          kind: document.getElementById('memKind').value
        })
      });
      document.getElementById('memText').value = '';
      await refreshData();
    }

    async function submitRadio() {
      const text = document.getElementById('radText').value.trim();
      if (!text) return;
      await api('/api/radio/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          from: document.getElementById('radFrom').value || 'dashboard',
          to: document.getElementById('radTo').value || 'all',
          type: document.getElementById('radType').value,
          project: getProjectValue('rad')
        })
      });
      document.getElementById('radText').value = '';
      document.getElementById('radProject').value = '';
      document.getElementById('radProjectCustom').value = '';
      toggleCustomProjectInput('rad');
      await refreshData();
    }

    async function submitTask() {
      const title = document.getElementById('tskTitle').value.trim();
      if (!title) return;
      await api('/api/task/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: document.getElementById('tskDesc').value,
          handoff: document.getElementById('tskHandoff').value,
          from: 'dashboard',
          project: getProjectValue('tsk', 'default'),
          priority: document.getElementById('tskPriority').value
        })
      });
      document.getElementById('tskTitle').value = '';
      document.getElementById('tskDesc').value = '';
      document.getElementById('tskHandoff').value = '';
      document.getElementById('tskProject').value = 'default';
      document.getElementById('tskProjectCustom').value = '';
      toggleCustomProjectInput('tsk');
      await refreshData();
    }

    async function claimTask(taskId) {
      const namePromptText = t('promptClaim');
      const byName = prompt(namePromptText, "user") || "user";
      await api('/api/task/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, by: byName })
      });
      await refreshData();
    }

    async function updateTaskStatus(taskId, statusValue) {
      await api('/api/task/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: statusValue })
      });
      await refreshData();
    }

    async function reviewTask(taskId, decision) {
      const byName = prompt(t('promptReviewBy'), "user") || "user";
      const note = prompt(t('promptReviewNote')) || "";
      await api('/api/task/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, decision, by: byName, note })
      });
      await refreshData();
    }

    async function promptBlockTask(taskId) {
      const blockPromptText = t('promptBlock');
      const reason = prompt(blockPromptText);
      if (!reason) return;
      await api('/api/task/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: 'blocked', note: 'Blocked: ' + reason })
      });
      await refreshData();
    }

    async function submitTaskNote(taskId) {
      const input = document.getElementById('note-in-' + taskId);
      const text = input.value.trim();
      if (!text) return;
      const notePromptText = t('promptNote');
      const byName = prompt(notePromptText, "user") || "user";
      
      const currentTask = state.tasks.find(t => t.id === taskId);
      await api('/api/task/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: currentTask.status, by: byName, note: text })
      });
      input.value = '';
      await refreshData();
    }

    async function promoteRadio(messageId) {
      await api('/api/radio/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: messageId })
      });
      alert(t('alertPromoted'));
      await refreshData();
    }

    // --- Analytics Logic ---
    let charts = {};

    function loadChartJs() {
      if (window.Chart) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    function injectAnalyticsTab() {
      if (document.getElementById('tab-analytics')) return;

      const navBar = document.querySelector('.sidebar-nav');
      if (navBar) {
        const navItem = document.createElement('div');
        navItem.className = 'nav-item';
        navItem.onclick = () => switchTab('analytics');
        navItem.innerHTML = `<span data-i18n="analytics">${t('analytics')}</span>`;
        // Insert before Dispatch Logs if possible
        const dispatchNavItem = Array.from(navBar.querySelectorAll('.nav-item')).find(el => {
           const span = el.querySelector('span');
           return span && (span.getAttribute('data-i18n') === 'dispatchLogs');
        });
        if (dispatchNavItem) {
          navBar.insertBefore(navItem, dispatchNavItem);
        } else {
          navBar.appendChild(navItem);
        }
      }

      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        const panel = document.createElement('div');
        panel.id = 'tab-analytics';
        panel.className = 'tab-panel';
        panel.innerHTML = `
          <div class="panel-header" style="margin-bottom: 20px;">
            <h2 data-i18n="analytics">${t('analytics')}</h2>
          </div>
          <div class="analytics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
            <div class="chart-card" style="background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color);">
              <h3 style="margin-bottom: 15px;" data-i18n="memoryGrowth">${t('memoryGrowth')}</h3>
              <div style="height: 300px;"><canvas id="memoryGrowthChart"></canvas></div>
            </div>
            <div class="chart-card" style="background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color);">
              <h3 style="margin-bottom: 15px;" data-i18n="taskCompletion">${t('taskCompletion')}</h3>
              <div style="height: 300px;"><canvas id="taskCompletionChart"></canvas></div>
            </div>
            <div class="chart-card" style="background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color);">
               <h3 style="margin-bottom: 15px;" data-i18n="radioActivity">${t('radioActivity')}</h3>
               <div style="height: 300px;"><canvas id="radioActivityChart"></canvas></div>
            </div>
          </div>
        `;
        mainContent.appendChild(panel);
      }
    }

    async function renderAnalytics() {
      if (state.activeTab !== 'analytics') return;
      const ledgerCount = state.status.ledgerEvents || 0;
      const pendingCount = state.status.pendingEvents || 0;
      const backupCount = state.status.backups || 0;
      const openTasks = state.tasks.filter(t => t.status === 'open').length;
      const activeTasks = state.tasks.filter(t => ['claimed', 'in_progress', 'blocked'].includes(t.status)).length;
      const doneTasks = state.tasks.filter(t => t.status === 'done').length;
      const activityMap = {};
      state.radio.forEach(msg => {
        const key = msg.from || 'unknown';
        activityMap[key] = (activityMap[key] || 0) + 1;
      });
      if (!window.echarts) {
        ['chartMemoryGrowth', 'chartTaskCompletion', 'chartRadioActivity'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = `<div class="muted">${escapeHtml(t('scanning'))}</div>`;
        });
        return;
      }

      const getChart = (key, id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        if (!charts[key] || charts[key].getDom?.() !== el) {
          charts[key]?.dispose?.();
          charts[key] = echarts.init(el, 'dark');
        }
        return charts[key];
      };

      getChart('memory', 'chartMemoryGrowth')?.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: [t('durableLedger'), t('pendingEvents'), t('backups')] },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: [ledgerCount, pendingCount, backupCount],
          itemStyle: { color: '#4facfe' }
        }]
      });

      getChart('tasks', 'chartTaskCompletion')?.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { color: '#8b9bb4' } },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          data: [
            { name: 'Open', value: openTasks },
            { name: 'Active', value: activeTasks },
            { name: 'Done', value: doneTasks }
          ],
          emphasis: {
            itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' }
          }
        }]
      });

      getChart('radio', 'chartRadioActivity')?.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'value' },
        yAxis: {
          type: 'category',
          data: Object.keys(activityMap),
          axisLabel: { color: '#8b9bb4' }
        },
        series: [{
          type: 'bar',
          data: Object.values(activityMap),
          itemStyle: { color: '#00f2fe' }
        }]
      });
    }

    // Top action handlers
    async function runSync() {
      const btn = document.getElementById('btnSync');
      btn.innerHTML = '<span class="spinner"></span> Syncing...';
      btn.disabled = true;
      try {
        await api('/api/sync', { method: 'POST' });
        await refreshData();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.innerHTML = t('syncInbox');
        btn.disabled = false;
      }
    }

    async function runPull() {
      const btn = document.getElementById('btnPull');
      btn.innerHTML = '<span class="spinner"></span> Rebuilding...';
      btn.disabled = true;
      try {
        await api('/api/pull', { method: 'POST' });
        await refreshData();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.innerHTML = t('rebuild');
        btn.disabled = false;
      }
    }

    async function triggerDispatcher() {
      const btn = document.getElementById('btnTriggerDispatch');
      btn.innerHTML = '<span class="spinner"></span> Running...';
      btn.disabled = true;
      try {
        const forceRun = confirm(t('confirmForceDispatch'));
        const res = await api('/api/dispatch/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: forceRun })
        });
        alert(t('alertDispatched', { n: (res.results ? res.results.length : 0) }));
        await refreshData();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.innerHTML = t('triggerDispatch');
        btn.disabled = false;
      }
    }

    let currentSelectedTool = null;

    async function showToolInstallModal(toolName) {
      currentSelectedTool = toolName;
      const tool = state.status.tools.find(t => t.name === toolName);
      if (!tool) return;
      
      const displayName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][tool.name]) || tool.name;
      
      // Update UI with static tool metadata first
      document.getElementById('modalToolIcon').innerHTML = renderToolIcon(tool.name, 32, tool.kind);
      document.getElementById('modalToolName').textContent = displayName;
      
      const statusText = tool.installed 
        ? (state.lang === 'zh' ? '已检测到' : 'Detected') 
        : (state.lang === 'zh' ? '未检测到' : 'Missing');
      document.getElementById('modalToolStatus').textContent = statusText;
      document.getElementById('modalToolStatus').className = tool.installed ? 'status-done' : 'status-blocked';

      // Reset button states and display
      document.getElementById('btnInstallLocal').style.display = 'inline-block';
      document.getElementById('btnInstallGlobal').style.display = 'inline-block';
      document.getElementById('btnInstallLocal').disabled = false;
      document.getElementById('btnInstallGlobal').disabled = false;

      // Preview local by default
      document.getElementById('modalToolSnippet').textContent = 'Loading rule preview...';
      document.getElementById('modalToolPath').textContent = '';
      document.getElementById('toolModal').style.display = 'flex';
      
      try {
        const localPreview = await api(`/api/install/preview?tool=${encodeURIComponent(toolName)}&scope=local`).catch(() => null);
        const globalPreview = await api(`/api/install/preview?tool=${encodeURIComponent(toolName)}&scope=global`).catch(() => null);
        
        let pathHtml = '';
        if (localPreview) {
          pathHtml += `<strong>Workspace CWD Target:</strong> <code style="color:var(--accent-purple);">${escapeHtml(localPreview.file)}</code><br>`;
        } else {
          document.getElementById('btnInstallLocal').style.display = 'none';
        }
        if (globalPreview) {
          pathHtml += `<strong>Global System Target:</strong> <code style="color:var(--accent-purple);">${escapeHtml(globalPreview.file)}</code>`;
        } else {
          document.getElementById('btnInstallGlobal').style.display = 'none';
        }
        
        if (tool.dir) {
          pathHtml = `<strong>Detected Config Path:</strong> <code>${escapeHtml(tool.dir)}</code><br>` + pathHtml;
        }
        document.getElementById('modalToolPath').innerHTML = pathHtml;
        
        const preview = localPreview || globalPreview;
        document.getElementById('modalToolSnippet').textContent = preview ? preview.snippet : 'No integration rule template found for this tool.';
      } catch (err) {
        document.getElementById('modalToolSnippet').textContent = 'Error loading preview: ' + err.message;
      }
    }

    function closeToolModal(e) {
      if (e && e.target !== e.currentTarget) return;
      document.getElementById('toolModal').style.display = 'none';
    }

    async function applyToolRules(scope) {
      if (!currentSelectedTool) return;
      const btn = scope === 'local' ? document.getElementById('btnInstallLocal') : document.getElementById('btnInstallGlobal');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Installing...';
      
      try {
        const res = await api('/api/install/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: currentSelectedTool, scope: scope })
        });
        alert((state.lang === 'zh' ? '已成功将规则写入文件：\n' : 'Successfully wrote rules to:\n') + res.file);
        closeToolModal();
        await refreshData();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }

    function renderWorkflowsPanel() {
      const container = document.getElementById('workflowsList');
      if (!container) return;
      const workflows = Array.isArray(state.workflows) ? state.workflows : [];
      if (workflows.length === 0) {
        container.innerHTML = `<div class="muted">${t('noWorkflows')}</div>`;
        return;
      }
      container.innerHTML = workflows.map(workflow => {
        const roles = ['planner', 'executor', 'reviewer', 'observer']
          .map(role => {
            const values = Array.isArray(workflow[role]) ? workflow[role] : workflow[role] ? [workflow[role]] : [];
            return values.length > 0 ? `${role}: ${values.join(', ')}` : '';
          })
          .filter(Boolean)
          .join(' | ');
        const results = Array.isArray(workflow.results) ? workflow.results.length : 0;
        const reviews = Array.isArray(workflow.reviews) ? workflow.reviews.length : 0;
        return `
          <div class="workflow-row">
            <div>
              <div class="workflow-title">${escapeHtml(workflow.title || 'Untitled Workflow')}</div>
              <div class="workflow-meta">${escapeHtml(workflow.project || t('defaultProj'))}${roles ? ` | ${escapeHtml(roles)}` : ''}</div>
              <div class="workflow-meta">${results} result(s) | ${reviews} review(s)</div>
            </div>
            <span class="badge status-${escapeHtml(workflow.status || 'open')}">${escapeHtml(workflow.status || 'open')}</span>
          </div>
        `;
      }).join('');
    }

    function createWorkflow() {
      alert(state.lang === 'zh'
        ? '当前面板仅展示工作流。创建工作流请先使用 ai-memory-hub workflow create。'
        : 'This panel is read-only. Create workflows with ai-memory-hub workflow create.');
    }

    function renderSettingsPanel() {
      const refreshInput = document.getElementById('settingRefreshInterval');
      const languageInput = document.getElementById('settingLanguage');
      if (refreshInput) refreshInput.value = String(Math.max(1, Math.round(state.refreshInterval / 1000)));
      if (languageInput) languageInput.value = state.lang;
    }

    function saveSettings() {
      const refreshInput = document.getElementById('settingRefreshInterval');
      const languageInput = document.getElementById('settingLanguage');
      const nextInterval = Number(refreshInput?.value || 5);
      if (Number.isFinite(nextInterval) && nextInterval >= 1) {
        state.refreshInterval = nextInterval * 1000;
        state.fallbackRefreshInterval = Math.max(5000, nextInterval * 1000);
        if (state.autoRefresh) startInterval();
      }
      if (languageInput?.value && languageInput.value !== state.lang) {
        state.lang = languageInput.value;
        localStorage.setItem('hub_lang', state.lang);
        translatePage();
      }
      renderAll();
    }

    function renderToolsPanel() {
      const tools = Array.isArray(state.status.tools) ? state.status.tools : [];
      const connected = tools.filter(tool => tool.connected).length;
      const cliTools = tools.filter(tool => tool.kind === 'cli-config').length;
      const apps = tools.filter(tool => ['app-state', 'local-model-runtime'].includes(tool.kind)).length;
      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      setText('toolsConnected', connected);
      setText('toolsRunnable', tools.filter(tool => tool.runnable || tool.installed || tool.connected).length);
      setText('toolsCLI', cliTools);
      setText('toolsApps', apps);

      const grid = document.getElementById('toolsGrid');
      if (!grid) return;
      grid.innerHTML = tools.map(tool => {
        const displayName = (toolDisplayNames[state.lang] && toolDisplayNames[state.lang][tool.name]) || tool.name;
        const kindBadge = (toolKindBadges[state.lang] && toolKindBadges[state.lang][tool.kind]) || tool.kind || '';
        return `
          <div class="tool-card" onclick="showToolInstallModal('${escapeHtml(tool.name)}')">
            <div style="display:flex;align-items:center;gap:10px;">
              ${renderToolIcon(tool.name, 28, tool.kind)}
              <div>
                <strong>${escapeHtml(displayName)}</strong>
                <div class="muted" style="font-size:12px;">${escapeHtml(kindBadge)}</div>
              </div>
            </div>
            <span class="badge ${tool.connected ? 'status-done' : 'status-open'}">${tool.connected ? 'connected' : 'missing'}</span>
          </div>
        `;
      }).join('') || `<div class="muted">${t('scanning')}</div>`;
    }

    async function refreshTools() {
      const response = await api('/api/detect');
      state.status.tools = Array.isArray(response.tools) ? response.tools : [];
      renderToolsPanel();
    }

    function performSearch() {
      const query = String(document.getElementById('searchQuery')?.value || '').trim().toLowerCase();
      const type = document.getElementById('searchType')?.value || 'all';
      const target = document.getElementById('searchResults');
      if (!target) return;
      if (!query) {
        target.innerHTML = `<div class="muted">Enter a query to search...</div>`;
        return;
      }
      const results = [];
      const include = (kind) => type === 'all' || type === kind;
      if (include('memory')) {
        String(state.memory.memory || '').split(/\r?\n/).forEach((line, index) => {
          if (line.toLowerCase().includes(query)) results.push({ kind: 'Memory', title: `MEMORY.md:${index + 1}`, text: line });
        });
      }
      if (include('task')) {
        state.tasks.forEach(task => {
          const text = [task.title, task.description, task.project, task.assignee, task.status].filter(Boolean).join(' ');
          if (text.toLowerCase().includes(query)) results.push({ kind: 'Task', title: task.title, text });
        });
      }
      if (include('radio')) {
        state.radio.forEach(message => {
          const text = [message.from, message.to, message.type, message.project, message.text].filter(Boolean).join(' ');
          if (text.toLowerCase().includes(query)) results.push({ kind: 'Radio', title: `${message.from || '?'} -> ${message.to || '?'}`, text });
        });
      }
      target.innerHTML = results.slice(0, 50).map(result => `
        <div class="stream-card">
          <div class="stream-header">
            <strong>${escapeHtml(result.kind)}: ${escapeHtml(result.title || '')}</strong>
          </div>
          <div class="stream-body">${escapeHtml(result.text || '')}</div>
        </div>
      `).join('') || `<div class="muted">No matching results.</div>`;
    }

    async function runHealthCheck() {
      const target = document.getElementById('healthReport');
      if (!target) return;
      target.innerHTML = `<div class="muted">${t('scanning')}</div>`;
      try {
        const report = await api('/api/health');
        target.innerHTML = `
          <pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:12px;">${escapeHtml(report.stdout || report.stderr || 'No health output.')}</pre>
        `;
      } catch (error) {
        target.innerHTML = `<div class="endpoint-error-item">${escapeHtml(error.message || String(error))}</div>`;
      }
    }

    // Initialization
    const lastTab = localStorage.getItem('hub_active_tab') || 'dashboard';
    switchTab(lastTab);
    
    // Check screen width to handle mobile side menu toggle
    function checkWidth() {
      const btn = document.getElementById('sidebarToggle');
      if (window.innerWidth <= 992) {
        btn.style.display = 'inline-flex';
      } else {
        btn.style.display = 'none';
        document.getElementById('sidebar').classList.remove('active');
      }
    }
    window.addEventListener('resize', checkWidth);
    checkWidth();

    // Initial translation and data fetch
    translatePage();
    refreshData().then(() => {
      if (state.autoRefresh) startInterval();
    });
