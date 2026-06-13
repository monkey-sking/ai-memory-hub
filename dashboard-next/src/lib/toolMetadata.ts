import type { AppLanguage } from './i18n'

type Language = AppLanguage

export const toolIconAssetVersion = '20260606-app-icons-v2'

export const toolIconFiles: Record<string, string> = {
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

export const toolKinds: Record<string, string> = {
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

export const toolKindBadges: Record<Language, Record<string, string>> = {
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

export const toolDisplayNames: Record<Language, Record<string, string>> = {
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

