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

    const SIDEBAR_BREAKPOINT = 992;

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
        overviewNav: "Overview",
        memoryHub: "Memory Hub",
        agentRadio: "Collaboration Broadcast",
        tasksBoard: "Tasks Board",
        dispatchLogs: "⚡ Dispatch Logs",
        dispatchLogsNav: "Dispatch Logs",
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
        backupsPanel: "Backups",
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
        loadingDashboard: "Loading dashboard data...",
        refreshingDashboard: "Refreshing dashboard data...",
        dashboardReady: "Updated just now",
        dashboardPartial: "Partial data loaded",
        dashboardFailed: "Refresh failed",
        retryLoad: "Retry",
        unknownError: "Unknown error",
        requestFailed: "Request failed",
        networkRequestFailed: "Network error while loading {endpoint}: {message}",
        httpRequestFailed: "{endpoint} returned HTTP {status}: {message}",
        invalidJsonError: "{endpoint} returned invalid JSON.",
        emptyErrorDetail: "No details provided.",
        actionInProgress: "Working...",
        syncing: "Syncing...",
        rebuilding: "Rebuilding...",
        running: "Running...",
        
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
        settingsCurrentSnapshot: "Snapshot Limit",
        settingsCurrentRefresh: "Refresh Interval",
        settingsCurrentTheme: "Theme",
        settingsCurrentAlerts: "Notifications",
        settingsSnapshotSection: "Memory Snapshot",
        settingsRefreshSection: "Refresh",
        settingsAppearanceSection: "Appearance",
        settingsNotificationSection: "Notifications",
        settingsShortcutsSection: "Global Shortcuts",
        snapshotLimit: "Snapshot Limit",
        snapshotLimitDesc: "Records included in generated MEMORY.md snapshots.",
        refreshInterval: "Refresh Interval (seconds)",
        settingsAutoRefresh: "Auto Refresh",
        settingsAutoRefreshDesc: "Keep the dashboard connected to live hub updates.",
        themeLabel: "Theme",
        darkMode: "Dark Mode",
        lightMode: "Light Mode",
        languageLabel: "Language",
        notificationLabel: "Dashboard Notifications",
        notificationDesc: "Show success and status notifications for dashboard actions.",
        shortcutEnableLabel: "Keyboard Shortcuts",
        shortcutEnableDesc: "Enable global dashboard shortcuts for search, panels, and overlays.",
        shortcutShowHelp: "Show shortcuts",
        shortcutFormatHint: "Use keys like /, escape, ctrl+k, mod+k, or alt+1.",
        shortcutDisabled: "Keyboard shortcuts are disabled.",
        enabled: "On",
        disabled: "Off",
        invalidSettings: "Settings contain invalid values.",
        saveSettings: "Save Settings",
        connectedTools: "Connected Tools",
        runnableTools: "Runnable",
        cliTools: "CLI Tools",
        appTools: "Apps",
        configuredTools: "Configured",
        dispatchSuccess: "Dispatch Success",
        activeDispatches: "Active Dispatches",
        toolManagement: "🔧 Tool Management",
        refreshTools: "Refresh",
        loadingTools: "Loading tools...",
        liveToolStatus: "Live Tool Status",
        performanceMonitoring: "Performance Monitoring",
        usageStats: "Usage Statistics",
        toolConfigManagement: "Configuration Management",
        toolsStatusAll: "All tools",
        toolsStatusConnected: "Connected",
        toolsStatusNeedsConfig: "Needs config",
        toolsStatusMissing: "Missing",
        selectToolConfig: "Select a tool to inspect configuration.",
        noToolsMatch: "No tools match this filter.",
        noRuns: "No dispatch runs yet.",
        runsLabel: "Runs",
        successRate: "Success",
        avgRuntime: "Avg runtime",
        lastRun: "Last run",
        latestError: "Latest error",
        connectionStatus: "Connection",
        instructionFile: "Instruction file",
        runnerCommand: "Runner command",
        detectionPath: "Detection path",
        manageConfig: "Manage config",
        configHotUpdate: "Config changes refresh status immediately.",
        runnerReady: "Runner ready",
        setupRequired: "Setup required",
        sharedStateOnly: "Shared state only",
        globalSearch: "🔍 Global Search",
        searchPlaceholder: "Search across memories, tasks, and messages...",
        searchAll: "All",
        searchMemories: "Memories",
        searchTasks: "Tasks",
        searchRadio: "Radio Messages",
        searchWorkflows: "Workflows",
        searchAnyTime: "Any time",
        search24h: "Last 24 hours",
        search7d: "Last 7 days",
        search30d: "Last 30 days",
        search90d: "Last 90 days",
        sortRelevance: "Relevance",
        sortNewest: "Newest",
        sortOldest: "Oldest",
        searchTagCloud: "Tag cloud",
        searchClearTag: "Clear tag",
        searchTagged: "Tag: {tag}",
        searchResultSummary: "{n} result(s) in {ms} ms",
        searchButton: "Search",
        searchPrompt: "Enter a query to search...",
        noSearchResults: "No matching results.",
        healthReport: "💊 System Health Report",
        runHealthCheck: "Run Health Check",
        healthPrompt: "Click \"Run Health Check\" to generate report...",
        healthScore: "Health Score",
        healthStatus: "Status",
        totalRecords: "Memory Records",
        duplicateRecords: "Duplicates",
        corruptedRecords: "Corrupted",
        storageUsed: "Storage Used",
        healthIssues: "Issues",
        repairSuggestions: "Repair Suggestions",
        duplicateExamples: "Duplicate Examples",
        corruptedExamples: "Corrupted Examples",
        storageBreakdown: "Storage Breakdown",
        commandLabel: "Command",
        copyCommand: "Copy command",
        runAction: "Run action",
        noHealthIssues: "No optimization issues detected.",
        noHealthExamples: "No examples to show.",
        actionCopied: "Command copied.",
        repairApplied: "Health repair completed.",
        backupManagement: "🗄️ Backup Management",
        backupCountLabel: "Backup Sets",
        backupSizeLabel: "Storage Used",
        backupKeepLabel: "Retained",
        backupPruneLabel: "Cleanup Preview",
        createBackup: "Create Backup",
        previewCleanup: "Preview Cleanup",
        backupReason: "Backup Reason",
        dailyRetention: "Daily Retention",
        weeklyRetention: "Weekly Retention",
        preSyncRetention: "Pre-sync Retention",
        pruneAfterSync: "Prune After Sync",
        saveBackupPolicy: "Save Schedule",
        backupPolicySaved: "Backup schedule saved.",
        backupFileBrowser: "Backup File Browser",
        selectBackupPrompt: "Select a backup to inspect files.",
        browseFiles: "Browse",
        previewRestore: "Preview Restore",
        restoreBackup: "Restore",
        restorePreviewReady: "Restore preview ready.",
        restoreComplete: "Backup restored.",
        restoreConfirm: "Restoring will overwrite current hub files from the selected backup after creating a pre-restore backup. Continue?",
        restorePrompt: "Type RESTORE to apply this backup.",
        restoreTokenMismatch: "Restore cancelled: confirmation text did not match.",
        noBackups: "No backups found.",
        changedFiles: "Changed files",
        noRestoreChanges: "No restore changes detected.",
        loadingBackups: "Loading backups...",
        backupCreated: "Backup created.",
        backupPreviewReady: "Cleanup preview ready.",
        settingsSaved: "Settings saved.",
        keyboardShortcuts: "Keyboard Shortcuts",
        shortcutSearch: "Focus search",
        shortcutCommand: "Open search",
        shortcutTabs: "Switch panels",
        shortcutClose: "Close modal or sidebar",
        healthRawReport: "Raw Report",
        loadingMemory: "Loading MEMORY.md...",
        loadingProfile: "Loading profile.md...",
        memoryTab: "MEMORY.md",
        profileTab: "profile.md",
        sharedSnapshot: "Shared Snapshot (MEMORY.md)",
        pendingInbox: "Pending Inbox",
        activeTasksJson: "Active Tasks",
        radioMessagesJson: "Agent Radio Messages",
        columnOpen: "OPEN",
        columnActive: "ACTIVE",
        columnCompleted: "COMPLETED",
        analytics: "📈 Analytics",
        memoryGrowth: "Memory Growth",
        taskCompletion: "Task Completion",
        radioActivity: "Radio Activity",
        memoryGrowthTrend: "🧠 Memory Growth Trend",
        taskCompletionRate: "📋 Task Completion Rate"
      },
      zh: {
        overview: "📊 概览看板",
        overviewNav: "概览看板",
        memoryHub: "记忆中枢",
        agentRadio: "协作广播",
        tasksBoard: "任务看板",
        dispatchLogs: "⚡ 调度日志",
        dispatchLogsNav: "调度日志",
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
        backupsPanel: "备份管理",
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
        loadingDashboard: "正在加载看板数据...",
        refreshingDashboard: "正在刷新看板数据...",
        dashboardReady: "刚刚已更新",
        dashboardPartial: "已加载部分数据",
        dashboardFailed: "刷新失败",
        retryLoad: "重试",
        unknownError: "未知错误",
        requestFailed: "请求失败",
        networkRequestFailed: "加载 {endpoint} 时网络异常：{message}",
        httpRequestFailed: "{endpoint} 返回 HTTP {status}：{message}",
        invalidJsonError: "{endpoint} 返回了无效 JSON。",
        emptyErrorDetail: "没有提供错误详情。",
        actionInProgress: "处理中...",
        syncing: "同步中...",
        rebuilding: "重建中...",
        running: "运行中...",
        
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
        settingsCurrentSnapshot: "快照限制",
        settingsCurrentRefresh: "刷新间隔",
        settingsCurrentTheme: "主题",
        settingsCurrentAlerts: "通知",
        settingsSnapshotSection: "记忆快照",
        settingsRefreshSection: "刷新",
        settingsAppearanceSection: "外观",
        settingsNotificationSection: "通知",
        settingsShortcutsSection: "全局快捷键",
        snapshotLimit: "快照限制",
        snapshotLimitDesc: "生成 MEMORY.md 快照时包含的记录数。",
        refreshInterval: "刷新间隔 (秒)",
        settingsAutoRefresh: "自动刷新",
        settingsAutoRefreshDesc: "让看板保持连接并接收实时更新。",
        themeLabel: "主题",
        darkMode: "深色模式",
        lightMode: "浅色模式",
        languageLabel: "语言",
        notificationLabel: "看板通知",
        notificationDesc: "显示看板操作的成功和状态通知。",
        shortcutEnableLabel: "键盘快捷键",
        shortcutEnableDesc: "启用搜索、面板切换和弹层关闭的全局看板快捷键。",
        shortcutShowHelp: "显示快捷键",
        shortcutFormatHint: "可使用 /、escape、ctrl+k、mod+k 或 alt+1 这类组合。",
        shortcutDisabled: "键盘快捷键已关闭。",
        enabled: "开",
        disabled: "关",
        invalidSettings: "设置项包含无效值。",
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
        searchWorkflows: "工作流",
        searchAnyTime: "不限时间",
        search24h: "近 24 小时",
        search7d: "近 7 天",
        search30d: "近 30 天",
        search90d: "近 90 天",
        sortRelevance: "相关性",
        sortNewest: "最新优先",
        sortOldest: "最早优先",
        searchTagCloud: "标签云",
        searchClearTag: "清除标签",
        searchTagged: "标签：{tag}",
        searchResultSummary: "{n} 条结果，用时 {ms} ms",
        searchButton: "搜索",
        searchPrompt: "输入搜索关键词...",
        noSearchResults: "没有匹配结果。",
        healthReport: "💊 系统健康报告",
        runHealthCheck: "运行健康检查",
        healthPrompt: "点击“运行健康检查”生成报告...",
        healthScore: "健康评分",
        healthStatus: "状态",
        totalRecords: "记忆记录",
        duplicateRecords: "重复记录",
        corruptedRecords: "损坏记录",
        storageUsed: "存储占用",
        healthIssues: "问题列表",
        repairSuggestions: "修复建议",
        duplicateExamples: "重复示例",
        corruptedExamples: "损坏示例",
        storageBreakdown: "存储明细",
        commandLabel: "命令",
        copyCommand: "复制命令",
        runAction: "执行操作",
        noHealthIssues: "未检测到需要优化的问题。",
        noHealthExamples: "暂无示例。",
        actionCopied: "命令已复制。",
        repairApplied: "健康修复已完成。",
        backupManagement: "🗄️ 备份管理",
        backupCountLabel: "备份集",
        backupSizeLabel: "存储占用",
        backupKeepLabel: "保留数量",
        backupPruneLabel: "清理预览",
        createBackup: "创建备份",
        previewCleanup: "预览清理",
        backupReason: "备份原因",
        dailyRetention: "每日保留",
        weeklyRetention: "每周保留",
        preSyncRetention: "同步前保留",
        pruneAfterSync: "同步后自动清理",
        saveBackupPolicy: "保存计划",
        backupPolicySaved: "备份计划已保存。",
        backupFileBrowser: "备份文件浏览",
        selectBackupPrompt: "选择一个备份查看文件。",
        browseFiles: "浏览",
        previewRestore: "预览恢复",
        restoreBackup: "恢复",
        restorePreviewReady: "恢复预览已生成。",
        restoreComplete: "备份已恢复。",
        restoreConfirm: "恢复会先创建 pre-restore 备份，然后用所选备份覆盖当前 Hub 文件。是否继续？",
        restorePrompt: "输入 RESTORE 以应用该备份。",
        restoreTokenMismatch: "恢复已取消：确认文本不匹配。",
        noBackups: "暂无备份。",
        changedFiles: "变更文件",
        noRestoreChanges: "未检测到需要恢复的变更。",
        loadingBackups: "加载备份中...",
        backupCreated: "备份已创建。",
        backupPreviewReady: "清理预览已生成。",
        settingsSaved: "设置已保存。",
        keyboardShortcuts: "键盘快捷键",
        shortcutSearch: "聚焦搜索",
        shortcutCommand: "打开搜索",
        shortcutTabs: "切换面板",
        shortcutClose: "关闭弹窗或侧栏",
        healthRawReport: "原始报告",
        loadingMemory: "加载 MEMORY.md 中...",
        loadingProfile: "加载 profile.md 中...",
        memoryTab: "MEMORY.md",
        profileTab: "profile.md",
        sharedSnapshot: "共享快照 (MEMORY.md)",
        pendingInbox: "待处理收件箱",
        activeTasksJson: "活跃任务",
        radioMessagesJson: "广播消息",
        columnOpen: "待认领",
        columnActive: "执行中",
        columnCompleted: "已完成",
        analytics: "📈 数据分析",
        memoryGrowth: "记忆增长趋势",
        taskCompletion: "任务完成率",
        radioActivity: "Radio活跃度",
        memoryGrowthTrend: "🧠 记忆增长趋势",
        taskCompletionRate: "📋 任务完成率"
      }
    };

    const DEFAULT_SHORTCUTS = {
      enabled: true,
      bindings: {
        focusSearch: '/',
        openSearch: 'mod+k',
        showHelp: 'ctrl+/',
        closeLayer: 'escape'
      },
      tabBindings: {
        dashboard: '1',
        memory: '2',
        radio: '3',
        tasks: '4',
        dispatch: '5',
        workflows: '6',
        analytics: '7',
        backups: '8',
        settings: '9',
        health: '0'
      }
    };

    const SHORTCUT_COMMAND_INPUTS = [
      { id: 'focusSearch', inputId: 'shortcutFocusSearch', labelKey: 'shortcutSearch' },
      { id: 'openSearch', inputId: 'shortcutOpenSearch', labelKey: 'shortcutCommand' },
      { id: 'showHelp', inputId: 'shortcutShowHelpInput', labelKey: 'shortcutShowHelp' },
      { id: 'closeLayer', inputId: 'shortcutCloseLayer', labelKey: 'shortcutClose' }
    ];

    const SHORTCUT_TAB_INPUTS = [
      { tab: 'dashboard', inputId: 'shortcutTabDashboard', labelKey: 'overview' },
      { tab: 'memory', inputId: 'shortcutTabMemory', labelKey: 'memoryHub' },
      { tab: 'radio', inputId: 'shortcutTabRadio', labelKey: 'agentRadio' },
      { tab: 'tasks', inputId: 'shortcutTabTasks', labelKey: 'tasksBoard' },
      { tab: 'dispatch', inputId: 'shortcutTabDispatch', labelKey: 'dispatchLogs' },
      { tab: 'workflows', inputId: 'shortcutTabWorkflows', labelKey: 'workflowsPanel' },
      { tab: 'analytics', inputId: 'shortcutTabAnalytics', labelKey: 'analyticsPanel' },
      { tab: 'backups', inputId: 'shortcutTabBackups', labelKey: 'backupsPanel' },
      { tab: 'settings', inputId: 'shortcutTabSettings', labelKey: 'settingsPanel' },
      { tab: 'health', inputId: 'shortcutTabHealth', labelKey: 'healthPanel' }
    ];

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
      tools: null,
      selectedTool: '',
      backups: null,
      selectedBackupName: '',
      backupDetail: null,
      backupRestorePlan: null,
      settings: null,
      health: null,
      autoRefresh: localStorage.getItem('hub_auto_refresh') !== 'false',
      refreshInterval: Number(localStorage.getItem('hub_refresh_interval_ms') || 5000),
      sidebarCollapsed: localStorage.getItem('hub_sidebar_collapsed') === 'true',
      fallbackRefreshInterval: 30000,
      realtime: {
        connected: false,
        reconnectAttempt: 0,
        status: 'idle'
      },
      searchRadio: '',
      search: {
        tag: '',
        lastPayload: null,
        debounceTimer: null
      },
      filterRadioType: '',
      filterRadioFrom: '',
      filterRadioTo: '',
      filterRadioProject: '',
      filterTaskProject: '',
      filterTaskPriority: '',
      endpointErrors: [],
      loading: {
        initial: true,
        refreshing: false,
        messageKey: 'loadingDashboard',
        lastSuccessAt: '',
        lastError: ''
      },
      notifications: localStorage.getItem('hub_notifications') !== 'false',
      shortcuts: cloneDefaultShortcuts(),
      lang: localStorage.getItem('hub_lang') || 'zh'
    };

    state.refreshInterval = Number.isFinite(state.refreshInterval) && state.refreshInterval >= 1000 ? state.refreshInterval : 5000;
    state.fallbackRefreshInterval = Math.max(5000, state.refreshInterval);

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

    function normalizeLanguage(value) {
      return ['zh', 'en'].includes(value) ? value : 'zh';
    }

    function normalizeTheme(value) {
      return ['dark', 'light'].includes(value) ? value : 'dark';
    }

    function cloneDefaultShortcuts() {
      return {
        enabled: DEFAULT_SHORTCUTS.enabled,
        bindings: { ...DEFAULT_SHORTCUTS.bindings },
        tabBindings: { ...DEFAULT_SHORTCUTS.tabBindings }
      };
    }

    function normalizeShortcutBinding(value, fallback = '') {
      const raw = String(value ?? '').trim();
      if (!raw) return fallback;
      const clean = raw
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/command/g, 'meta')
        .replace(/cmd/g, 'meta')
        .replace(/option/g, 'alt')
        .replace(/^esc$/, 'escape');
      const parts = clean.split('+').filter(Boolean);
      const modifiers = ['ctrl', 'mod', 'meta', 'alt', 'shift'].filter(mod => parts.includes(mod));
      let key = parts.find(part => !['ctrl', 'mod', 'meta', 'alt', 'shift'].includes(part)) || '';
      if (key === 'esc') key = 'escape';
      if (key === 'spacebar') key = 'space';
      if (!key) return fallback;
      return [...modifiers, key].join('+');
    }

    function normalizeShortcutList(value, fallback = '') {
      const rawItems = String(value ?? '').split(/[|,]/).map(item => item.trim()).filter(Boolean);
      const source = rawItems.length ? rawItems : [fallback];
      const normalized = source
        .map(item => normalizeShortcutBinding(item, ''))
        .filter(Boolean);
      return normalized.length ? normalized.join(',') : fallback;
    }

    function normalizeShortcutSettings(input = {}) {
      const defaults = cloneDefaultShortcuts();
      const source = input && typeof input === 'object' ? input : {};
      const bindings = {};
      Object.keys(defaults.bindings).forEach(key => {
        bindings[key] = normalizeShortcutList(source.bindings?.[key], defaults.bindings[key]);
      });
      const tabBindings = {};
      Object.keys(defaults.tabBindings).forEach(key => {
        tabBindings[key] = normalizeShortcutList(source.tabBindings?.[key], defaults.tabBindings[key]);
      });
      return {
        enabled: source.enabled !== undefined ? Boolean(source.enabled) : defaults.enabled,
        bindings,
        tabBindings
      };
    }

    function normalizeEventKey(key) {
      const raw = String(key || '').toLowerCase();
      if (raw === ' ') return 'space';
      if (raw === 'esc') return 'escape';
      return raw;
    }

    function shortcutEventToBinding(event) {
      const key = normalizeEventKey(event.key);
      if (!key || ['control', 'meta', 'alt', 'shift'].includes(key)) return '';
      const modifiers = [];
      if (event.ctrlKey) modifiers.push('ctrl');
      if (event.metaKey) modifiers.push('meta');
      if (event.altKey) modifiers.push('alt');
      if (event.shiftKey) modifiers.push('shift');
      return [...modifiers, key].join('+');
    }

    function expandShortcutBinding(binding) {
      return normalizeShortcutList(binding)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
        .flatMap(item => item.includes('mod+')
          ? [item.replace('mod+', 'ctrl+'), item.replace('mod+', 'meta+')]
          : [item]);
    }

    function shortcutMatches(event, binding) {
      const eventBinding = shortcutEventToBinding(event);
      return Boolean(eventBinding && expandShortcutBinding(binding).includes(eventBinding));
    }

    function formatShortcutLabel(binding) {
      return String(binding || '')
        .split('+')
        .filter(Boolean)
        .map(part => {
          const labels = { ctrl: 'Ctrl', mod: 'Ctrl/Cmd', meta: 'Cmd', alt: 'Alt', shift: 'Shift', escape: 'Esc', space: 'Space' };
          return labels[part] || part.toUpperCase();
        });
    }

    function renderShortcutKeys(binding) {
      const groups = normalizeShortcutList(binding)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      return `<span class="shortcut-keyset">${groups.map((item, index) => {
        const keys = formatShortcutLabel(item).map(part => `<kbd>${escapeHtml(part)}</kbd>`).join('');
        return `${index > 0 ? '<span class="shortcut-separator">,</span>' : ''}${keys}`;
      }).join('')}</span>`;
    }

    function setInputValue(input, value) {
      if (!input || document.activeElement === input) return;
      input.value = value;
    }

    function mergeLocalSettings(syncPatch = {}, dashboardPatch = {}) {
      const current = state.settings || {};
      state.settings = {
        ...current,
        sync: {
          ...(current.sync || {}),
          ...syncPatch
        },
        dashboard: {
          ...(current.dashboard || {}),
          ...dashboardPatch
        }
      };
      return state.settings;
    }

    function getDashboardSettingValues(settings = state.settings) {
      const dashboard = settings?.dashboard || {};
      const refreshIntervalMs = Number(dashboard.refreshIntervalMs || state.refreshInterval || 5000);
      return {
        autoRefresh: dashboard.autoRefresh !== undefined ? Boolean(dashboard.autoRefresh) : state.autoRefresh,
        notifications: dashboard.notifications !== undefined ? Boolean(dashboard.notifications) : state.notifications,
        refreshIntervalMs: Number.isFinite(refreshIntervalMs) && refreshIntervalMs >= 1000 ? Math.min(60000, refreshIntervalMs) : 5000,
        language: normalizeLanguage(dashboard.language || state.lang || localStorage.getItem('hub_lang')),
        theme: normalizeTheme(dashboard.theme || localStorage.getItem('hub_theme') || 'dark'),
        shortcuts: normalizeShortcutSettings(dashboard.shortcuts || state.shortcuts)
      };
    }

    function applyTheme(theme) {
      const nextTheme = normalizeTheme(theme);
      document.body.setAttribute('data-theme', nextTheme);
      localStorage.setItem('hub_theme', nextTheme);
    }

    function applyRuntimeSettings(settings = state.settings, options = {}) {
      const values = getDashboardSettingValues(settings);
      state.autoRefresh = values.autoRefresh;
      state.notifications = values.notifications;
      state.shortcuts = values.shortcuts;
      state.refreshInterval = values.refreshIntervalMs;
      state.fallbackRefreshInterval = Math.max(5000, values.refreshIntervalMs);
      localStorage.setItem('hub_auto_refresh', values.autoRefresh ? 'true' : 'false');
      localStorage.setItem('hub_notifications', values.notifications ? 'true' : 'false');
      localStorage.setItem('hub_refresh_interval_ms', String(values.refreshIntervalMs));

      const languageChanged = state.lang !== values.language;
      state.lang = values.language;
      localStorage.setItem('hub_lang', state.lang);
      applyTheme(values.theme);

      const topAutoRefresh = document.getElementById('autoRefreshCheckbox');
      if (topAutoRefresh) topAutoRefresh.checked = state.autoRefresh;
      const settingsAutoRefresh = document.getElementById('settingAutoRefresh');
      if (settingsAutoRefresh) settingsAutoRefresh.checked = state.autoRefresh;
      const settingsNotifications = document.getElementById('settingNotifications');
      if (settingsNotifications) settingsNotifications.checked = state.notifications;
      const settingsShortcuts = document.getElementById('settingShortcutsEnabled');
      if (settingsShortcuts) settingsShortcuts.checked = state.shortcuts.enabled;

      if (languageChanged || options.translate) {
        translatePage();
      } else {
        document.getElementById('btnLang').textContent = state.lang === 'zh' ? '🌐 English' : '🌐 中文';
      }

      if (options.reconnect !== false) {
        if (state.autoRefresh) startInterval();
        else stopRealtime();
      }
      updateSettingsSummary();
      renderShortcutHelp();
    }

    function buildSettingsPayload() {
      const snapshotInput = document.getElementById('settingSnapshotLimit');
      const refreshInput = document.getElementById('settingRefreshInterval');
      const autoRefreshInput = document.getElementById('settingAutoRefresh');
      const notificationsInput = document.getElementById('settingNotifications');
      const languageInput = document.getElementById('settingLanguage');
      const themeInput = document.getElementById('settingTheme');
      const shortcutInput = document.getElementById('settingShortcutsEnabled');

      const snapshotLimit = Number(snapshotInput?.value || state.settings?.sync?.snapshotLimit || 120);
      const refreshSeconds = Number(refreshInput?.value || Math.round(state.refreshInterval / 1000) || 5);
      if (!Number.isInteger(snapshotLimit) || snapshotLimit <= 0 || !Number.isFinite(refreshSeconds) || refreshSeconds < 1 || refreshSeconds > 60) {
        throw new Error(t('invalidSettings'));
      }

      return {
        sync: {
          snapshotLimit
        },
        dashboard: {
          autoRefresh: autoRefreshInput ? autoRefreshInput.checked : state.autoRefresh,
          refreshIntervalMs: Math.round(refreshSeconds * 1000),
          language: normalizeLanguage(languageInput?.value || state.lang),
          theme: normalizeTheme(themeInput?.value || localStorage.getItem('hub_theme') || 'dark'),
          notifications: notificationsInput ? notificationsInput.checked : state.notifications,
          shortcuts: buildShortcutSettingsPayload(shortcutInput ? shortcutInput.checked : state.shortcuts.enabled)
        }
      };
    }

    function buildShortcutSettingsPayload(enabled) {
      const defaults = cloneDefaultShortcuts();
      const bindings = {};
      SHORTCUT_COMMAND_INPUTS.forEach(item => {
        bindings[item.id] = normalizeShortcutList(
          document.getElementById(item.inputId)?.value,
          defaults.bindings[item.id]
        );
      });
      const tabBindings = {};
      SHORTCUT_TAB_INPUTS.forEach(item => {
        tabBindings[item.tab] = normalizeShortcutList(
          document.getElementById(item.inputId)?.value,
          defaults.tabBindings[item.tab]
        );
      });
      return { enabled: Boolean(enabled), bindings, tabBindings };
    }

    function applySettingsDraft() {
      let payload;
      try {
        payload = buildSettingsPayload();
      } catch {
        updateSettingsSummary();
        return null;
      }
      mergeLocalSettings(payload.sync, payload.dashboard);
      applyRuntimeSettings(state.settings, { reconnect: true, translate: true });
      const status = document.getElementById('settingsSaveStatus');
      if (status) status.textContent = '';
      renderSettingsPanel();
      return payload;
    }

    function toggleLanguage() {
      state.lang = state.lang === 'zh' ? 'en' : 'zh';
      mergeLocalSettings({}, { language: state.lang });
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
      updateSidebarToggleButton();
      renderShortcutHelp();
    }

    function isMobileSidebarMode() {
      return window.innerWidth <= SIDEBAR_BREAKPOINT;
    }

    function updateSidebarToggleButton() {
      const btn = document.getElementById('sidebarToggle');
      if (!btn) return;
      const mobile = isMobileSidebarMode();
      btn.style.display = 'inline-flex';
      if (mobile) {
        btn.textContent = '☰';
        btn.setAttribute('aria-label', state.lang === 'zh' ? '打开侧边栏' : 'Open sidebar');
        btn.title = state.lang === 'zh' ? '打开侧边栏' : 'Open sidebar';
      } else if (state.sidebarCollapsed) {
        btn.textContent = '›';
        btn.setAttribute('aria-label', state.lang === 'zh' ? '展开侧边栏' : 'Expand sidebar');
        btn.title = state.lang === 'zh' ? '展开侧边栏' : 'Expand sidebar';
      } else {
        btn.textContent = '‹';
        btn.setAttribute('aria-label', state.lang === 'zh' ? '收起侧边栏' : 'Collapse sidebar');
        btn.title = state.lang === 'zh' ? '收起侧边栏' : 'Collapse sidebar';
      }
    }

    function applySidebarMode() {
      const sidebar = document.getElementById('sidebar');
      const mobile = isMobileSidebarMode();
      document.body.classList.toggle('sidebar-collapsed', !mobile && state.sidebarCollapsed);
      if (!mobile) {
        sidebar?.classList.remove('active');
      }
      updateSidebarToggleButton();
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

    function escapeJsString(val) {
      return String(val || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/</g, '\\x3c');
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

    function truncateErrorDetail(value, maxLength = 700) {
      const text = String(value || '').trim();
      if (!text) return '';
      return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
    }

    function createDisplayError(message, metadata = {}) {
      const error = new Error(message || t('unknownError'));
      Object.assign(error, metadata);
      return error;
    }

    function formatApiError(path, response, payload, rawText) {
      const payloadMessage = payload && typeof payload === 'object'
        ? (payload.error || payload.message || payload.detail)
        : '';
      const rawMessage = !payloadMessage && rawText ? truncateErrorDetail(rawText, 220) : '';
      const serverMessage = payloadMessage || rawMessage || response.statusText || t('emptyErrorDetail');
      const detailSource = payload && typeof payload === 'object'
        ? (payload.details || payload.stack || rawText)
        : rawText;
      return createDisplayError(t('httpRequestFailed', {
        endpoint: path,
        status: response.status,
        message: serverMessage
      }), {
        endpoint: path,
        status: response.status,
        detail: truncateErrorDetail(detailSource)
      });
    }

    function getErrorMessage(error) {
      if (!error) return t('unknownError');
      return error.message || String(error);
    }

    function getErrorDetail(error) {
      const detail = error && (error.detail || error.cause?.message);
      return truncateErrorDetail(detail);
    }

    async function api(path, options = {}) {
      let res;
      try {
        res = await fetch(path, options);
      } catch (error) {
        throw createDisplayError(t('networkRequestFailed', {
          endpoint: path,
          message: getErrorMessage(error)
        }), {
          endpoint: path,
          detail: getErrorMessage(error),
          cause: error
        });
      }

      const text = await res.text();
      let json = {};
      if (text) {
        try {
          json = JSON.parse(text);
        } catch (error) {
          if (res.ok) {
            throw createDisplayError(t('invalidJsonError', { endpoint: path }), {
              endpoint: path,
              detail: truncateErrorDetail(text),
              cause: error
            });
          }
          json = null;
        }
      }

      if (!res.ok) throw formatApiError(path, res, json, text);
      return json;
    }

    function showToast(message, type = 'info') {
      if (!state.notifications && type !== 'error') return;
      const stack = document.getElementById('toastStack');
      if (!stack) return;
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = String(message || t('unknownError'));
      stack.appendChild(toast);
      setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 220);
      }, 3600);
    }

    function setButtonLoading(button, loading, label) {
      if (!button) return;
      if (loading) {
        if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
        button.disabled = true;
        button.innerHTML = `<span class="spinner"></span> ${escapeHtml(label || t('actionInProgress'))}`;
      } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || button.textContent;
        delete button.dataset.originalText;
      }
    }

    function switchTab(tabId) {
      state.activeTab = tabId;
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));

      const tabs = ['dashboard', 'memory', 'radio', 'tasks', 'dispatch', 'workflows', 'analytics', 'backups', 'settings', 'health', 'search', 'tools'];
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
        if (tabId === 'backups') {
          renderBackupsPanel();
          if (!state.backups) loadBackups();
        }
        if (tabId === 'settings') renderSettingsPanel();
        if (tabId === 'search') {
          renderSearchPanel();
          document.getElementById('searchQuery')?.focus();
        }
        if (tabId === 'tools') renderToolsPanel();
        if (tabId === 'analytics') renderAnalytics();
        if (tabId === 'health') {
          if (state.health) renderHealthReport();
          else runHealthCheck();
        }
      });
    }

    function switchMemorySubTab(sub) {
      state.memorySubTab = sub;
      document.getElementById('memorySubTab-md').style.display = sub === 'md' ? 'block' : 'none';
      document.getElementById('memorySubTab-profile').style.display = sub === 'profile' ? 'block' : 'none';
      requestAnimationFrame(renderMemoryHub);
    }

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      if (isMobileSidebarMode()) {
        sidebar?.classList.toggle('active');
        return;
      }
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem('hub_sidebar_collapsed', state.sidebarCollapsed ? 'true' : 'false');
      applySidebarMode();
    }

    // Realtime refresh handlers
    function toggleAutoRefresh(checked) {
      mergeLocalSettings({}, { autoRefresh: Boolean(checked) });
      applyRuntimeSettings(state.settings, { reconnect: true });
      renderSettingsPanel();
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
      state.tools = snapshot.tools || state.tools;
      state.backups = snapshot.backups || state.backups;
      state.settings = snapshot.settings || state.settings;
      if (state.settings) applyRuntimeSettings(state.settings, { reconnect: true });
      state.endpointErrors = [];
      renderAll();
    }

    function renderLoadingState() {
      const isLoading = Boolean(state.loading.initial || state.loading.refreshing);
      const message = t(state.loading.messageKey || (state.loading.initial ? 'loadingDashboard' : 'refreshingDashboard'));
      const banner = document.getElementById('dashboardLoading');
      const bannerText = document.getElementById('dashboardLoadingText');
      if (banner) banner.hidden = !isLoading;
      if (bannerText) bannerText.textContent = message;

      const refreshStatus = document.getElementById('refreshStatus');
      if (refreshStatus) {
        refreshStatus.className = 'refresh-status';
        if (isLoading) {
          refreshStatus.classList.add('loading');
          refreshStatus.textContent = message;
        } else if (state.loading.lastError) {
          refreshStatus.classList.add('error');
          refreshStatus.textContent = t('dashboardFailed');
        } else if (state.endpointErrors.length > 0) {
          refreshStatus.classList.add('error');
          refreshStatus.textContent = t('dashboardPartial');
        } else if (state.loading.lastSuccessAt) {
          refreshStatus.classList.add('ok');
          refreshStatus.textContent = t('dashboardReady');
        } else {
          refreshStatus.textContent = '';
        }
      }

      document.body.classList.toggle('is-refreshing', isLoading);
      document.querySelector('main')?.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      const statusLine = document.getElementById('statusLine');
      if (statusLine) {
        const tone = state.loading.lastError || state.endpointErrors.length > 0 ? 'error' : 'ok';
        statusLine.className = `status ${tone}`;
        const label = isLoading ? message : (state.loading.lastError ? t('dashboardFailed') : t('dashboardReady'));
        const textNode = statusLine.querySelector('span:last-child');
        if (textNode) textNode.textContent = label;
      }
    }

    function setDashboardLoading(loading, messageKey) {
      state.loading.refreshing = Boolean(loading);
      state.loading.messageKey = messageKey || (state.loading.initial ? 'loadingDashboard' : 'refreshingDashboard');
      if (loading) state.loading.lastError = '';
      renderLoadingState();
    }

    function markDashboardLoaded() {
      state.loading.initial = false;
      state.loading.refreshing = false;
      state.loading.lastSuccessAt = new Date().toISOString();
      state.loading.lastError = '';
      renderLoadingState();
    }

    function markDashboardFailed(error) {
      state.loading.initial = false;
      state.loading.refreshing = false;
      state.loading.lastError = getErrorMessage(error);
      renderLoadingState();
    }

    function renderLoadingPlaceholders() {
      if (!state.loading.initial) return;
      const skeleton = `<div class="skeleton-list"><div></div><div></div><div></div></div>`;
      const smallLoading = `<div class="muted"><span class="spinner"></span> ${escapeHtml(t('loadingDashboard'))}</div>`;
      const set = (id, html) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
      };
      set('dashboardTasks', skeleton);
      set('dashboardRadio', skeleton);
      set('workflowStageStrip', smallLoading);
      set('workflowList', '');
      set('detectedTools', smallLoading);
      set('col-open', skeleton);
      set('col-active', skeleton);
      set('col-completed', skeleton);
      set('dispatchRelay', skeleton);
      set('dispatchLogs', skeleton);
      set('toolsGrid', skeleton);
      set('backupsList', skeleton);
      set('searchTagCloud', smallLoading);
    }

    // Fetch API Data
    async function refreshData() {
      const btn = document.getElementById('btnRefresh');
      const firstLoad = state.loading.initial;
      setDashboardLoading(true, firstLoad ? 'loadingDashboard' : 'refreshingDashboard');
      if (firstLoad) renderLoadingPlaceholders();
      setButtonLoading(btn, true, firstLoad ? t('loadingDashboard') : t('refreshingDashboard'));
      try {
        const endpointErrors = [];
        const recordEndpointError = (endpoint, reason) => {
          const message = getErrorMessage(reason);
          endpointErrors.push({ endpoint, message, detail: getErrorDetail(reason) });
          console.error(`Failed to load ${endpoint}`, reason);
        };

        try {
          const snapshot = await api('/api/dashboard');
          applyDashboardSnapshot(snapshot);
          markDashboardLoaded();
          return;
        } catch (dashboardErr) {
          recordEndpointError('/api/dashboard', dashboardErr);
        }

        const [statusRes, memoryRes, radioRes, tasksRes, workflowsRes, dispatchRes, toolsRes, backupsRes, settingsRes] = await Promise.allSettled([
          api('/api/status'),
          api('/api/memory'),
          api('/api/radio'),
          api('/api/tasks'),
          api('/api/workflows'),
          api('/api/dispatch'),
          api('/api/tools'),
          api('/api/backups'),
          api('/api/settings')
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
        if (toolsRes.status === 'fulfilled') {
          state.tools = toolsRes.value || null;
          if (Array.isArray(state.tools?.tools)) {
            state.status.tools = state.tools.tools;
            state.status.toolSummary = state.tools.summary || state.status.toolSummary;
          }
        } else {
          recordEndpointError('/api/tools', toolsRes.reason);
          state.tools = null;
        }
        if (backupsRes.status === 'fulfilled') {
          state.backups = backupsRes.value || null;
        } else {
          recordEndpointError('/api/backups', backupsRes.reason);
          state.backups = null;
        }
        if (settingsRes.status === 'fulfilled') {
          state.settings = settingsRes.value || null;
          if (state.settings) applyRuntimeSettings(state.settings, { reconnect: true });
        } else {
          recordEndpointError('/api/settings', settingsRes.reason);
          state.settings = null;
        }

        state.endpointErrors = endpointErrors;
        renderAll();
        markDashboardLoaded();
      } catch (err) {
        console.error(err);
        state.endpointErrors = [{ endpoint: 'refreshData', message: getErrorMessage(err), detail: getErrorDetail(err) }];
        renderEndpointErrors();
        showToast(getErrorMessage(err), 'error');
        markDashboardFailed(err);
      } finally {
        setButtonLoading(btn, false);
        renderLoadingState();
      }
    }

    // Render operations
    function renderAll() {
      const tools = Array.isArray(state.status.tools) ? state.status.tools : [];
      renderEndpointErrors();
      renderLoadingState();

      // Inject Analytics Tab if not present
      injectAnalyticsTab();

      // Top bar info
      document.getElementById('memoryDir').textContent = state.status.memoryDir || 'unavailable';
      const autoRefreshCheckbox = document.getElementById('autoRefreshCheckbox');
      if (autoRefreshCheckbox) autoRefreshCheckbox.checked = state.autoRefresh;

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
      renderBackupsPanel();
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
          ${err.detail ? `<span class="error-message-detail">${escapeHtml(err.detail)}</span>` : ''}
        </div>
      `).join('');
      el.innerHTML = `
        <div class="endpoint-errors-title-row">
          <div class="endpoint-errors-title">${escapeHtml(t('endpointErrorTitle'))} · ${escapeHtml(t('endpointErrorSummary', { n: errors.length }))}</div>
          <button class="btn small" type="button" onclick="refreshData()">${escapeHtml(t('retryLoad'))}</button>
        </div>
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
      showToast(t('alertPromoted'), 'success');
      await refreshData();
    }

    // --- Analytics Logic ---
    let charts = {};

    function loadChartJs() {
      if (window.Chart) return Promise.resolve();
      const existing = document.getElementById('chartjs-loader');
      if (existing) {
        return new Promise((resolve, reject) => {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
        });
      }
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'chartjs-loader';
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
        navItem.title = t('analyticsPanel');
        navItem.innerHTML = `<span class="nav-icon" aria-hidden="true">📈</span><span class="nav-label" data-i18n="analyticsPanel">${t('analyticsPanel')}</span>`;
        // Insert before Dispatch Logs if possible
        const dispatchNavItem = Array.from(navBar.querySelectorAll('.nav-item')).find(el => {
           const label = el.querySelector('.nav-label');
           return label && (label.getAttribute('data-i18n') === 'dispatchLogsNav');
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
            <div class="chart-card" style="background: var(--bg-surface); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">
              <h3 style="margin-bottom: 15px;" data-i18n="memoryGrowth">${t('memoryGrowth')}</h3>
              <div style="height: 300px;"><canvas id="memoryGrowthChart"></canvas></div>
            </div>
            <div class="chart-card" style="background: var(--bg-surface); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">
              <h3 style="margin-bottom: 15px;" data-i18n="taskCompletion">${t('taskCompletion')}</h3>
              <div style="height: 300px;"><canvas id="taskCompletionChart"></canvas></div>
            </div>
            <div class="chart-card" style="background: var(--bg-surface); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">
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
      try {
        await loadChartJs();
      } catch (error) {
        ['memoryGrowthChart', 'taskCompletionChart', 'radioActivityChart'].forEach(id => {
          const el = document.getElementById(id);
          if (el?.parentElement) el.parentElement.innerHTML = `<div class="muted">${escapeHtml(getErrorMessage(error))}</div>`;
        });
        return;
      }
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
      const upsertChart = (key, id, config) => {
        const el = document.getElementById(id);
        if (!el) return null;
        if (charts[key]) {
          charts[key].data = config.data;
          charts[key].options = config.options;
          charts[key].update();
          return charts[key];
        }
        charts[key] = new Chart(el, config);
        return charts[key];
      };
      const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#8b9bb4' } }
        },
        scales: {
          x: { ticks: { color: '#8b9bb4' }, grid: { color: 'rgba(139, 155, 180, 0.16)' } },
          y: { ticks: { color: '#8b9bb4' }, grid: { color: 'rgba(139, 155, 180, 0.16)' }, beginAtZero: true }
        }
      };

      upsertChart('memory', 'memoryGrowthChart', {
        type: 'bar',
        data: {
          labels: [t('durableLedger'), t('pendingEvents'), t('backups')],
          datasets: [{
            label: t('memoryGrowth'),
            data: [ledgerCount, pendingCount, backupCount],
            backgroundColor: '#4facfe'
          }]
        },
        options: baseOptions
      });

      upsertChart('tasks', 'taskCompletionChart', {
        type: 'doughnut',
        data: {
          labels: ['Open', 'Active', 'Done'],
          datasets: [{
            data: [openTasks, activeTasks, doneTasks],
            backgroundColor: ['#f59e0b', '#4facfe', '#22c55e'],
            borderColor: 'rgba(8, 13, 26, 0.9)',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#8b9bb4' } }
          }
        }
      });

      upsertChart('radio', 'radioActivityChart', {
        type: 'bar',
        data: {
          labels: Object.keys(activityMap),
          datasets: [{
            label: t('radioActivity'),
            data: Object.values(activityMap),
            backgroundColor: '#00f2fe'
          }]
        },
        options: {
          ...baseOptions,
          indexAxis: 'y'
        }
      });
    }

    // Top action handlers
    async function runSync() {
      const btn = document.getElementById('btnSync');
      setButtonLoading(btn, true, t('syncing'));
      try {
        await api('/api/sync', { method: 'POST' });
        await refreshData();
      } catch (err) {
        showToast(getErrorMessage(err), 'error');
      } finally {
        setButtonLoading(btn, false);
      }
    }

    async function runPull() {
      const btn = document.getElementById('btnPull');
      setButtonLoading(btn, true, t('rebuilding'));
      try {
        await api('/api/pull', { method: 'POST' });
        await refreshData();
      } catch (err) {
        showToast(getErrorMessage(err), 'error');
      } finally {
        setButtonLoading(btn, false);
      }
    }

    async function triggerDispatcher() {
      const btn = document.getElementById('btnTriggerDispatch');
      setButtonLoading(btn, true, t('running'));
      try {
        const forceRun = confirm(t('confirmForceDispatch'));
        const res = await api('/api/dispatch/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: forceRun })
        });
        showToast(t('alertDispatched', { n: (res.results ? res.results.length : 0) }), 'success');
        await refreshData();
      } catch (err) {
        showToast(getErrorMessage(err), 'error');
      } finally {
        setButtonLoading(btn, false);
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
        document.getElementById('modalToolSnippet').textContent = 'Error loading preview: ' + getErrorMessage(err);
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
        showToast((state.lang === 'zh' ? '已写入规则: ' : 'Rules written: ') + res.file, 'success');
        closeToolModal();
        await refreshData();
      } catch (err) {
        showToast(getErrorMessage(err), 'error');
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
      showToast(state.lang === 'zh'
        ? '当前面板仅展示工作流。创建工作流请先使用 ai-memory-hub workflow create。'
        : 'This panel is read-only. Create workflows with ai-memory-hub workflow create.', 'info');
    }

    function renderBackupsPanel() {
      const backups = state.backups || {};
      const list = Array.isArray(backups.backups) ? backups.backups : [];
      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      setText('backupsTotal', backups.count ?? state.status.backups ?? 0);
      setText('backupsBytes', backups.totalDisplay || '0 B');
      setText('backupsKeep', backups.retention?.keep ?? 0);
      setText('backupsPrune', backups.retention?.prune ?? 0);

      const daily = document.getElementById('backupDailyRetention');
      const weekly = document.getElementById('backupWeeklyRetention');
      const preSync = document.getElementById('backupPreSyncRetention');
      const pruneAfterSync = document.getElementById('backupPruneAfterSync');
      const policy = backups.policy || state.settings?.backupPolicy || {};
      if (daily && policy.daily) daily.value = String(policy.daily);
      if (weekly && policy.weekly) weekly.value = String(policy.weekly);
      if (preSync && policy.preSync) preSync.value = String(policy.preSync);
      if (pruneAfterSync && policy.pruneAfterSync !== undefined) pruneAfterSync.checked = policy.pruneAfterSync !== false;
      if (!state.selectedBackupName && list[0]?.name) {
        state.selectedBackupName = list[0].name;
      }

      const target = document.getElementById('backupsList');
      if (!target) {
        renderBackupDetailPanel();
        return;
      }
      if (list.length === 0) {
        target.innerHTML = `<div class="muted">${state.backups ? t('noBackups') : t('loadingBackups')}</div>`;
        renderBackupDetailPanel();
        return;
      }
      target.innerHTML = list.map(backup => `
        <div class="backup-row ${backup.name === state.selectedBackupName ? 'active' : ''}">
          <div>
            <strong>${escapeHtml(backup.name || '')}</strong>
            <div class="muted">${escapeHtml([backup.createdAt, backup.reason, backup.display].filter(Boolean).join(' · '))}</div>
            <div class="muted">${escapeHtml((backup.files || []).slice(0, 8).join(', '))}</div>
          </div>
          <div class="backup-row-actions">
            <span class="badge ${backup.retention === 'keep' ? 'status-done' : 'status-open'}">${escapeHtml(backup.retentionReason || backup.retention || '')}</span>
            <button class="btn small" data-backup-action="browse" data-backup-name="${escapeHtml(backup.name || '')}">${escapeHtml(t('browseFiles'))}</button>
            <button class="btn small" data-backup-action="preview" data-backup-name="${escapeHtml(backup.name || '')}">${escapeHtml(t('previewRestore'))}</button>
          </div>
        </div>
      `).join('');
      target.querySelectorAll('[data-backup-action]').forEach(button => {
        button.addEventListener('click', () => {
          const name = button.getAttribute('data-backup-name') || '';
          const action = button.getAttribute('data-backup-action');
          if (action === 'preview') previewBackupRestore(name);
          else loadBackupDetail(name);
        });
      });
      renderBackupDetailPanel();
    }

    async function loadBackups() {
      const target = document.getElementById('backupsList');
      if (target) target.innerHTML = `<div class="skeleton-list"><div></div><div></div><div></div></div>`;
      try {
        state.backups = await api('/api/backups');
        renderBackupsPanel();
        const list = Array.isArray(state.backups.backups) ? state.backups.backups : [];
        const selected = state.selectedBackupName || list[0]?.name || '';
        if (selected) await loadBackupDetail(selected, { silent: true });
      } catch (error) {
        if (target) target.innerHTML = `<div class="endpoint-error-item">${escapeHtml(getErrorMessage(error))}</div>`;
        showToast(getErrorMessage(error), 'error');
      }
    }

    async function createBackup() {
      const reason = document.getElementById('backupReason')?.value || 'dashboard-manual';
      try {
        const result = await api('/api/backups/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        state.backups = result.backups || state.backups;
        showToast(t('backupCreated'), 'success');
        renderBackupsPanel();
        await refreshData();
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      }
    }

    function getBackupPolicyInputs() {
      const daily = Number(document.getElementById('backupDailyRetention')?.value || 7);
      const weekly = Number(document.getElementById('backupWeeklyRetention')?.value || 4);
      const preSync = Number(document.getElementById('backupPreSyncRetention')?.value || 20);
      const pruneAfterSync = document.getElementById('backupPruneAfterSync')?.checked !== false;
      if (![daily, weekly, preSync].every(value => Number.isInteger(value) && value > 0)) {
        throw new Error(t('invalidSettings'));
      }
      return { daily, weekly, preSync, pruneAfterSync };
    }

    async function previewBackupPrune() {
      const preview = document.getElementById('backupPrunePreview');
      if (preview) preview.innerHTML = `<span class="spinner"></span> ${escapeHtml(t('scanning'))}`;
      try {
        const policy = getBackupPolicyInputs();
        const result = await api('/api/backups/prune', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply: false, ...policy })
        });
        state.backups = result.backups || state.backups;
        if (preview) {
          preview.textContent = `${result.prune || 0} backup(s), ${result.pruneDisplay || '0 B'} outside retention policy.`;
        }
        showToast(t('backupPreviewReady'), 'success');
        renderBackupsPanel();
      } catch (error) {
        if (preview) preview.textContent = getErrorMessage(error);
        showToast(getErrorMessage(error), 'error');
      }
    }

    async function saveBackupPolicy() {
      try {
        const policy = getBackupPolicyInputs();
        const response = await api('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupPolicy: policy })
        });
        state.settings = response.settings || state.settings;
        showToast(t('backupPolicySaved'), 'success');
        await loadBackups();
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      }
    }

    async function loadBackupDetail(name, options = {}) {
      if (!name) return;
      state.selectedBackupName = name;
      const filesTarget = document.getElementById('backupFilesList');
      if (!options.silent && filesTarget) {
        filesTarget.innerHTML = `<div class="skeleton-list"><div></div><div></div><div></div></div>`;
      }
      renderBackupsPanel();
      try {
        const detail = await api(`/api/backups/detail?name=${encodeURIComponent(name)}`);
        state.backupDetail = detail;
        state.backupRestorePlan = detail.restore || null;
        renderBackupsPanel();
      } catch (error) {
        if (filesTarget) filesTarget.innerHTML = `<div class="endpoint-error-item">${escapeHtml(getErrorMessage(error))}</div>`;
        showToast(getErrorMessage(error), 'error');
      }
    }

    function renderBackupDetailPanel() {
      const title = document.getElementById('backupDetailTitle');
      const meta = document.getElementById('backupDetailMeta');
      const summary = document.getElementById('backupRestoreSummary');
      const filesTarget = document.getElementById('backupFilesList');
      const detail = state.backupDetail;
      if (!filesTarget) return;
      if (!detail?.backup) {
        if (title) title.textContent = t('backupFileBrowser');
        if (meta) meta.textContent = t('selectBackupPrompt');
        if (summary) summary.innerHTML = '';
        filesTarget.innerHTML = `<div class="muted">${t('selectBackupPrompt')}</div>`;
        return;
      }
      if (title) title.textContent = detail.backup.name || t('backupFileBrowser');
      if (meta) meta.textContent = [detail.backup.createdAt, detail.backup.reason, detail.backup.display].filter(Boolean).join(' · ');
      renderBackupRestoreSummary(state.backupRestorePlan || detail.restore);
      const files = Array.isArray(detail.files) ? detail.files : [];
      filesTarget.innerHTML = files.length ? files.map(file => `
        <div class="backup-file-row">
          <div style="display:flex;gap:8px;justify-content:space-between;align-items:flex-start;">
            <strong>${escapeHtml(file.name || '')}</strong>
            <span class="badge ${backupStatusBadgeClass(file.status)}">${escapeHtml(formatBackupFileStatus(file.status))}</span>
          </div>
          <div class="backup-file-meta">${escapeHtml([file.kind, file.display, file.currentPath ? `${file.currentPath}: ${file.currentExists ? file.currentDisplay : 'missing'}` : 'backup metadata'].filter(Boolean).join(' · '))}</div>
          ${file.preview ? `<pre class="backup-file-preview">${escapeHtml(file.preview)}</pre>` : ''}
        </div>
      `).join('') : `<div class="muted">${t('noBackups')}</div>`;
    }

    function renderBackupRestoreSummary(plan) {
      const summary = document.getElementById('backupRestoreSummary');
      if (!summary) return;
      if (!plan?.summary) {
        summary.innerHTML = '';
        return;
      }
      const changed = plan.summary.changed || 0;
      const text = changed
        ? `${t('changedFiles')}: ${changed}/${plan.summary.total || 0} (${plan.summary.display || '0 B'})`
        : t('noRestoreChanges');
      summary.innerHTML = `<div class="endpoint-error-item">${escapeHtml(text)}</div>`;
    }

    function backupStatusBadgeClass(status) {
      if (status === 'unchanged') return 'status-done';
      if (status === 'different') return 'status-blocked';
      if (status === 'missing-current') return 'status-claimed';
      return 'status-open';
    }

    function formatBackupFileStatus(status) {
      const labels = state.lang === 'zh'
        ? { unchanged: '未变更', different: '将覆盖', 'missing-current': '将创建', 'browse-only': '仅浏览' }
        : { unchanged: 'unchanged', different: 'will overwrite', 'missing-current': 'will create', 'browse-only': 'browse only' };
      return labels[status] || status || '';
    }

    async function previewBackupRestore(name = state.selectedBackupName) {
      const selected = name || state.backups?.backups?.[0]?.name || '';
      if (!selected) return;
      try {
        state.selectedBackupName = selected;
        const result = await api('/api/backups/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: selected, apply: false })
        });
        state.backupRestorePlan = result.plan || null;
        if (!state.backupDetail || state.backupDetail.backup?.name !== selected) {
          await loadBackupDetail(selected, { silent: true });
        } else {
          renderBackupsPanel();
        }
        showToast(t('restorePreviewReady'), 'success');
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      }
    }

    async function restoreSelectedBackup() {
      const selected = state.selectedBackupName || state.backups?.backups?.[0]?.name || '';
      if (!selected) return;
      if (!window.confirm(t('restoreConfirm'))) return;
      const confirmText = window.prompt(t('restorePrompt'), '');
      if (confirmText !== 'RESTORE') {
        showToast(t('restoreTokenMismatch'), 'error');
        return;
      }
      try {
        const result = await api('/api/backups/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: selected, apply: true, confirm: confirmText })
        });
        state.backups = result.backups || state.backups;
        state.backupRestorePlan = result.after || null;
        showToast(t('restoreComplete'), 'success');
        await refreshData();
        await loadBackupDetail(selected, { silent: true });
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      }
    }

    function renderSettingsPanel() {
      const snapshotInput = document.getElementById('settingSnapshotLimit');
      const refreshInput = document.getElementById('settingRefreshInterval');
      const autoRefreshInput = document.getElementById('settingAutoRefresh');
      const notificationsInput = document.getElementById('settingNotifications');
      const languageInput = document.getElementById('settingLanguage');
      const themeInput = document.getElementById('settingTheme');
      const settings = state.settings || {};
      const values = getDashboardSettingValues(settings);
      setInputValue(snapshotInput, String(settings.sync?.snapshotLimit || 120));
      setInputValue(refreshInput, String(Math.max(1, Math.round(values.refreshIntervalMs / 1000))));
      if (autoRefreshInput) autoRefreshInput.checked = values.autoRefresh;
      if (notificationsInput) notificationsInput.checked = values.notifications;
      if (languageInput) languageInput.value = values.language;
      if (themeInput) themeInput.value = values.theme;
      const shortcutsInput = document.getElementById('settingShortcutsEnabled');
      if (shortcutsInput) shortcutsInput.checked = values.shortcuts.enabled;
      SHORTCUT_COMMAND_INPUTS.forEach(item => {
        setInputValue(document.getElementById(item.inputId), values.shortcuts.bindings[item.id]);
      });
      SHORTCUT_TAB_INPUTS.forEach(item => {
        setInputValue(document.getElementById(item.inputId), values.shortcuts.tabBindings[item.tab]);
      });
      updateSettingsSummary();
    }

    function updateSettingsSummary() {
      const settings = state.settings || {};
      const values = getDashboardSettingValues(settings);
      const snapshot = settings.sync?.snapshotLimit || Number(document.getElementById('settingSnapshotLimit')?.value || 120);
      const refreshSeconds = Math.max(1, Math.round(values.refreshIntervalMs / 1000));
      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      setText('settingsSnapshotValue', String(snapshot));
      setText('settingsRefreshValue', `${refreshSeconds}s`);
      setText('settingsThemeValue', values.theme === 'light' ? t('lightMode') : t('darkMode'));
      setText('settingsNotificationsValue', values.notifications ? t('enabled') : t('disabled'));
    }

    async function saveSettings() {
      const status = document.getElementById('settingsSaveStatus');
      let payload;
      try {
        payload = applySettingsDraft() || buildSettingsPayload();
      } catch (error) {
        if (status) status.textContent = getErrorMessage(error);
        showToast(getErrorMessage(error), 'error');
        return;
      }
      try {
        if (status) status.innerHTML = `<span class="spinner"></span> ${escapeHtml(t('scanning'))}`;
        const response = await api('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        state.settings = response.settings || state.settings;
        if (state.settings) applyRuntimeSettings(state.settings, { reconnect: true, translate: true });
        if (status) status.textContent = t('settingsSaved');
        showToast(t('settingsSaved'), 'success');
      } catch (error) {
        if (status) status.textContent = getErrorMessage(error);
        showToast(getErrorMessage(error), 'error');
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
        const detail = [tool.connectionStatus, tool.runnerCommandKind, tool.action || tool.dir].filter(Boolean).join(' · ');
        return `
          <div class="tool-card" onclick="showToolInstallModal('${escapeHtml(tool.name)}')">
            <div style="display:flex;align-items:center;gap:10px;">
              ${renderToolIcon(tool.name, 28, tool.kind)}
              <div>
                <strong>${escapeHtml(displayName)}</strong>
                <div class="muted" style="font-size:12px;">${escapeHtml(kindBadge)}</div>
                <div class="muted tool-card-detail">${escapeHtml(detail || 'not detected')}</div>
              </div>
            </div>
            <span class="badge ${tool.connected ? 'status-done' : 'status-open'}">${tool.connected ? 'connected' : 'missing'}</span>
          </div>
        `;
      }).join('') || `<div class="muted">${t('scanning')}</div>`;
    }

    async function refreshTools() {
      try {
        const response = await api('/api/detect');
        state.status.tools = Array.isArray(response.tools) ? response.tools : [];
        renderToolsPanel();
        showToast(t('refreshTools'), 'success');
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      }
    }

    function scheduleSearch() {
      clearTimeout(state.search.debounceTimer);
      state.search.debounceTimer = setTimeout(performSearch, 180);
    }

    async function renderSearchPanel() {
      if (!state.search.lastPayload) {
        await loadSearchFacets();
      } else {
        renderSearchFacets(state.search.lastPayload);
        updateSearchMeta(state.search.lastPayload);
      }
    }

    async function loadSearchFacets() {
      try {
        const payload = await api('/api/search?limit=0');
        state.search.lastPayload = payload;
        renderSearchFacets(payload);
        updateSearchMeta(payload);
      } catch (error) {
        const tagCloud = document.getElementById('searchTagCloud');
        if (tagCloud) {
          tagCloud.innerHTML = `<span class="endpoint-error-item">${escapeHtml(getErrorMessage(error))}</span>`;
        }
      }
    }

    async function performSearch() {
      clearTimeout(state.search.debounceTimer);
      const rawQuery = String(document.getElementById('searchQuery')?.value || '').trim();
      const type = document.getElementById('searchType')?.value || 'all';
      const range = document.getElementById('searchRange')?.value || 'all';
      const sort = document.getElementById('searchSort')?.value || 'relevance';
      const tag = state.search.tag || '';
      const target = document.getElementById('searchResults');
      if (!target) return;

      const params = new URLSearchParams({
        q: rawQuery,
        type,
        range,
        sort,
        limit: rawQuery || tag ? '80' : '0'
      });
      if (tag) params.set('tag', tag);

      if (!rawQuery && !tag) {
        target.innerHTML = `<div class="muted">${t('searchPrompt')}</div>`;
      } else {
        target.innerHTML = `<div class="skeleton-list"><div></div><div></div><div></div></div>`;
      }

      try {
        const payload = await api(`/api/search?${params.toString()}`);
        state.search.lastPayload = payload;
        renderSearchFacets(payload);
        updateSearchMeta(payload);

        const results = Array.isArray(payload.results) ? payload.results : [];
        const highlightQuery = rawQuery || tag;
        if (!rawQuery && !tag) {
          return;
        }
        target.innerHTML = results.map(result => {
          const meta = [
            result.meta?.project,
            result.meta?.status,
            result.meta?.priority,
            result.meta?.type,
            result.ts
          ].filter(Boolean).join(' · ');
          const tags = Array.isArray(result.tags) && result.tags.length
            ? `<div class="search-result-tags">${result.tags.slice(0, 6).map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
            : '';
          return `
            <div class="stream-card search-result-card">
              <div class="stream-header">
                <strong>${escapeHtml(String(result.kind || '').toUpperCase())}: ${escapeHtml(result.title || '')}</strong>
                <span class="badge status-open">${escapeHtml(String(Math.round(Number(result.score || 0) * 10) / 10))}</span>
              </div>
              <div class="stream-body">${highlightSearchText(result.preview || result.text || '', highlightQuery)}</div>
              ${tags}
              <div class="muted">${escapeHtml(meta)}</div>
            </div>
          `;
        }).join('') || `<div class="muted">${t('noSearchResults')}</div>`;
      } catch (error) {
        target.innerHTML = `<div class="endpoint-error-item">${escapeHtml(getErrorMessage(error))}</div>`;
        showToast(getErrorMessage(error), 'error');
      }
    }

    function renderSearchFacets(payload) {
      const tagCloud = document.getElementById('searchTagCloud');
      if (!tagCloud) return;
      const tags = (payload?.facets?.tags || []).slice(0, 28);
      if (!tags.length) {
        tagCloud.innerHTML = `<span class="muted">${t('noSearchResults')}</span>`;
      } else {
        tagCloud.innerHTML = tags.map(item => {
          const key = String(item.key || '');
          const activeClass = key.toLowerCase() === String(state.search.tag || '').toLowerCase() ? ' active' : '';
          return `<button class="tag-chip${activeClass}" onclick="setSearchTag('${escapeJsString(key)}')">${escapeHtml(key)} <span>${escapeHtml(String(item.count || 0))}</span></button>`;
        }).join('');
      }
      const clearButton = document.getElementById('searchClearTag');
      if (clearButton) {
        clearButton.hidden = !state.search.tag;
        clearButton.textContent = state.search.tag ? t('searchTagged', { tag: state.search.tag }) : t('searchClearTag');
      }
    }

    function updateSearchMeta(payload) {
      const target = document.getElementById('searchMeta');
      if (!target || !payload) return;
      target.textContent = t('searchResultSummary', {
        n: String(payload.count || 0),
        ms: String(payload.elapsedMs ?? 0)
      });
    }

    function setSearchTag(tag) {
      state.search.tag = String(tag || '');
      performSearch();
    }

    function clearSearchTag() {
      state.search.tag = '';
      performSearch();
    }

    function highlightSearchText(text, query) {
      const source = String(text || '');
      const needle = String(query || '').trim();
      if (!needle) return escapeHtml(source);
      const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        return escapeHtml(source).replace(new RegExp(escapedNeedle, 'ig'), (match) => `<mark>${match}</mark>`);
      } catch {
        return escapeHtml(source);
      }
    }

    async function runHealthCheck() {
      const target = document.getElementById('healthReport');
      if (!target) return;
      target.innerHTML = `<div class="muted">${t('scanning')}</div>`;
      try {
        const report = await api('/api/health');
        state.health = report;
        renderHealthReport();
      } catch (error) {
        target.innerHTML = `<div class="endpoint-error-item">${escapeHtml(getErrorMessage(error))}</div>`;
        showToast(getErrorMessage(error), 'error');
      }
    }

    function getHealthAction(actionId) {
      const actions = (state.health?.analysis?.repairSuggestions || []);
      return actions.find(action => action.id === actionId) || null;
    }

    async function copyHealthActionCommand(actionId) {
      const action = getHealthAction(actionId);
      if (!action?.command) return;
      try {
        await navigator.clipboard.writeText(action.command);
        showToast(t('actionCopied'), 'success');
      } catch {
        prompt(t('copyCommand'), action.command);
      }
    }

    async function runHealthAction(actionId) {
      const action = getHealthAction(actionId);
      if (!action?.endpoint) {
        await copyHealthActionCommand(actionId);
        return;
      }
      const message = `${action.label}\n\n${action.detail || ''}\n\n${t('commandLabel')}: ${action.command || action.endpoint}`;
      if (!confirm(message)) return;
      const target = document.getElementById('healthReport');
      if (target) target.innerHTML = `<div class="muted">${t('scanning')}</div>`;
      try {
        const response = await api(action.endpoint, {
          method: action.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply: true })
        });
        if (response?.applied) {
          showToast(`${t('repairApplied')} ${response.applied.ledgerRecordsUpdated || 0}`, 'success');
        } else {
          showToast(action.label || t('runAction'), 'success');
        }
        await runHealthCheck();
      } catch (error) {
        if (target) target.innerHTML = `<div class="endpoint-error-item">${escapeHtml(getErrorMessage(error))}</div>`;
        showToast(getErrorMessage(error), 'error');
      }
    }

    function renderHealthReport() {
      const target = document.getElementById('healthReport');
      if (!target) return;
      const report = state.health;
      if (!report?.analysis) {
        target.innerHTML = `<div class="muted">${t('healthPrompt')}</div>`;
        return;
      }

      const analysis = report.analysis;
      const issues = Array.isArray(analysis.issues) ? analysis.issues : [];
      const actions = Array.isArray(analysis.repairSuggestions) ? analysis.repairSuggestions : [];
      const duplicateGroups = Array.isArray(analysis.duplicateGroups) ? analysis.duplicateGroups : [];
      const corruptedRecords = Array.isArray(analysis.corruptedRecords) ? analysis.corruptedRecords : [];
      const storageItems = Array.isArray(analysis.storage?.items) ? analysis.storage.items : [];
      const scoreClass = analysis.score >= 90 ? 'good' : analysis.score >= 70 ? 'warn' : 'bad';

      const renderActionButton = (action) => {
        if (!action) return '';
        const id = escapeJsString(action.id);
        const label = action.endpoint ? t('runAction') : t('copyCommand');
        const handler = action.endpoint ? `runHealthAction('${id}')` : `copyHealthActionCommand('${id}')`;
        const buttonClass = action.endpoint ? 'primary small' : 'btn small';
        return `<button class="${buttonClass}" onclick="${handler}">${escapeHtml(label)}</button>`;
      };

      const issueHtml = issues.length
        ? issues.map(issue => `
          <div class="health-issue-row level-${escapeHtml(issue.level || 'low')}">
            <div>
              <div class="health-issue-title">
                <span class="badge status-${escapeHtml(issue.level === 'high' ? 'blocked' : issue.level === 'medium' ? 'claimed' : 'open')}">${escapeHtml(issue.level || 'low')}</span>
                <strong>${escapeHtml(issue.title || '')}</strong>
              </div>
              <div class="muted">${escapeHtml(issue.detail || '')}</div>
              ${issue.action?.command ? `<code class="health-command">${escapeHtml(issue.action.command)}</code>` : ''}
            </div>
            <div class="health-row-action">${renderActionButton(issue.action)}</div>
          </div>
        `).join('')
        : `<div class="muted">${t('noHealthIssues')}</div>`;

      const actionHtml = actions.length
        ? actions.map(action => `
          <div class="health-action-row">
            <div>
              <strong>${escapeHtml(action.label || '')}</strong>
              <div class="muted">${escapeHtml(action.detail || '')}</div>
              ${action.command ? `<code class="health-command">${escapeHtml(action.command)}</code>` : ''}
            </div>
            <div>${renderActionButton(action)}</div>
          </div>
        `).join('')
        : `<div class="muted">${t('noHealthIssues')}</div>`;

      const duplicateHtml = duplicateGroups.length
        ? duplicateGroups.map(group => `
          <div class="health-example">
            <div><strong>${escapeHtml(String(group.count || 0))}x</strong> ${escapeHtml(group.example || '')}</div>
            <div class="muted">${(group.records || []).map(record => escapeHtml(record.pointer || record.id || '')).join(' · ')}</div>
          </div>
        `).join('')
        : `<div class="muted">${t('noHealthExamples')}</div>`;

      const corruptedHtml = corruptedRecords.length
        ? corruptedRecords.map(record => `
          <div class="health-example">
            <div><strong>${escapeHtml(record.pointer || '')}</strong></div>
            <div class="muted">${escapeHtml(record.text || '')}</div>
          </div>
        `).join('')
        : `<div class="muted">${t('noHealthExamples')}</div>`;

      const storageHtml = storageItems.map(item => `
        <div class="health-storage-row">
          <span>${escapeHtml(item.label || '')}</span>
          <strong>${escapeHtml(item.display || String(item.bytes || 0))}</strong>
        </div>
      `).join('');

      target.innerHTML = `
        <div class="health-summary">
          <div class="health-score ${scoreClass}">
            <span>${t('healthScore')}</span>
            <strong>${escapeHtml(String(analysis.score ?? 0))}</strong>
            <small>${escapeHtml(analysis.status || '')}</small>
          </div>
          <div class="health-metric"><span>${t('totalRecords')}</span><strong>${escapeHtml(String(analysis.totalRecords || 0))}</strong></div>
          <div class="health-metric"><span>${t('duplicateRecords')}</span><strong>${escapeHtml(String(analysis.duplicateRecords || 0))}</strong><small>${escapeHtml(analysis.duplicateRatePercent || '0.0%')}</small></div>
          <div class="health-metric"><span>${t('corruptedRecords')}</span><strong>${escapeHtml(String(analysis.corruptedRecordsCount || 0))}</strong></div>
          <div class="health-metric"><span>${t('storageUsed')}</span><strong>${escapeHtml(analysis.storage?.totalDisplay || '0 B')}</strong></div>
        </div>

        <div class="health-grid">
          <section class="health-section">
            <div class="health-section-header">
              <h4>${t('healthIssues')}</h4>
              <span class="badge status-${issues.length ? 'claimed' : 'done'}">${escapeHtml(String(issues.length))}</span>
            </div>
            ${issueHtml}
          </section>

          <section class="health-section">
            <div class="health-section-header">
              <h4>${t('repairSuggestions')}</h4>
              <span class="badge status-${actions.length ? 'progress' : 'done'}">${escapeHtml(String(actions.length))}</span>
            </div>
            ${actionHtml}
          </section>

          <section class="health-section">
            <div class="health-section-header"><h4>${t('duplicateExamples')}</h4></div>
            ${duplicateHtml}
          </section>

          <section class="health-section">
            <div class="health-section-header"><h4>${t('corruptedExamples')}</h4></div>
            ${corruptedHtml}
          </section>

          <section class="health-section">
            <div class="health-section-header"><h4>${t('storageBreakdown')}</h4></div>
            <div class="health-storage-list">${storageHtml}</div>
          </section>

          <section class="health-section">
            <details>
              <summary>${t('healthRawReport')}</summary>
              <pre class="health-raw">${escapeHtml(report.report || report.stdout || '')}</pre>
            </details>
          </section>
        </div>
      `;
    }

    function isTypingTarget(target) {
      const tag = String(target?.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
    }

    function focusGlobalSearch() {
      switchTab('search');
      requestAnimationFrame(() => {
        const input = document.getElementById('searchQuery');
        input?.focus();
        input?.select();
      });
    }

    function renderShortcutHelp() {
      const target = document.getElementById('shortcutHelpGrid');
      if (!target) return;
      const shortcuts = state.shortcuts || cloneDefaultShortcuts();
      if (!shortcuts.enabled) {
        target.innerHTML = `<div><span class="shortcut-keyset"></span><span>${escapeHtml(t('shortcutDisabled'))}</span></div>`;
        return;
      }
      const commandRows = SHORTCUT_COMMAND_INPUTS.map(item => ({
        binding: shortcuts.bindings[item.id],
        label: t(item.labelKey)
      }));
      const tabBindings = SHORTCUT_TAB_INPUTS
        .map(item => shortcuts.tabBindings[item.tab])
        .filter(Boolean)
        .join(',');
      const rows = [
        ...commandRows,
        { binding: tabBindings, label: t('shortcutTabs') }
      ];
      target.innerHTML = rows.map(row => `
        <div>
          ${renderShortcutKeys(row.binding)}
          <span>${escapeHtml(row.label)}</span>
        </div>
      `).join('');
    }

    function showShortcutHelp() {
      renderShortcutHelp();
      const el = document.getElementById('shortcutHelp');
      if (el) el.style.display = 'flex';
    }

    function closeShortcutHelp(event) {
      if (event && event.target !== event.currentTarget) return;
      const el = document.getElementById('shortcutHelp');
      if (el) el.style.display = 'none';
    }

    function closeTopLayer() {
      const shortcut = document.getElementById('shortcutHelp');
      if (shortcut && shortcut.style.display !== 'none') {
        shortcut.style.display = 'none';
        return true;
      }
      const toolModal = document.getElementById('toolModal');
      if (toolModal && toolModal.style.display !== 'none') {
        toolModal.style.display = 'none';
        return true;
      }
      const sidebar = document.getElementById('sidebar');
      if (sidebar?.classList.contains('active')) {
        sidebar.classList.remove('active');
        return true;
      }
      return false;
    }

    function handleGlobalShortcuts(event) {
      const shortcuts = state.shortcuts || cloneDefaultShortcuts();
      if (!shortcuts.enabled) return;
      const typing = isTypingTarget(event.target);
      const closeBinding = shortcuts.bindings.closeLayer;
      if (shortcutMatches(event, closeBinding)) {
        if (closeTopLayer()) event.preventDefault();
        return;
      }

      const commandBindings = [
        { binding: shortcuts.bindings.focusSearch, action: focusGlobalSearch },
        { binding: shortcuts.bindings.openSearch, action: focusGlobalSearch },
        { binding: shortcuts.bindings.showHelp, action: showShortcutHelp }
      ];
      for (const item of commandBindings) {
        if (shortcutMatches(event, item.binding)) {
          if (typing && !(event.ctrlKey || event.metaKey || event.altKey)) return;
          event.preventDefault();
          item.action();
          return;
        }
      }

      if (typing) return;
      for (const item of SHORTCUT_TAB_INPUTS) {
        if (shortcutMatches(event, shortcuts.tabBindings[item.tab])) {
          event.preventDefault();
          switchTab(item.tab);
          return;
        }
      }
    }

    document.addEventListener('keydown', handleGlobalShortcuts);

    // Initialization
    applyTheme(localStorage.getItem('hub_theme') || 'dark');
    applySidebarMode();
    const lastTab = localStorage.getItem('hub_active_tab') || 'dashboard';
    switchTab(lastTab);
    
    // Keep the sidebar in mobile drawer mode or desktop collapsed mode.
    function checkWidth() {
      applySidebarMode();
    }
    window.addEventListener('resize', checkWidth);
    checkWidth();

    // Initial translation and data fetch
    translatePage();
    refreshData().then(() => {
      if (state.autoRefresh) startInterval();
    });
