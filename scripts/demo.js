#!/usr/bin/env node
// Quick Demo Script for AI Memory Hub

import { execSync } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60) + '\n');
}

function exec(command, description) {
  log(`→ ${description}`, 'blue');
  log(`  Command: ${command}`, 'yellow');
  try {
    const output = execSync(command, { encoding: 'utf-8' });
    if (output.trim()) {
      console.log(output);
    }
    log('  ✓ Success', 'green');
    return output;
  } catch (error) {
    log(`  ✗ Failed: ${error.message}`, 'red');
    return null;
  }
}

async function demo() {
  log('\n🚀 AI Memory Hub - Quick Demo\n', 'bright');

  // 1. Status Check
  section('1. System Status');
  exec('ai-memory-hub status', 'Check system status');

  // 2. Task Management
  section('2. Task Management');

  const taskOutput = exec(
    'ai-memory-hub task add "Demo: Implement feature X" --from claude --project demo --priority normal',
    'Create a task'
  );

  exec('ai-memory-hub task list --status active --project demo', 'List active tasks');

  // Extract task ID if possible
  if (taskOutput) {
    try {
      const taskId = JSON.parse(taskOutput).id;
      log(`  Task ID: ${taskId}`, 'yellow');

      exec(`ai-memory-hub task claim --id ${taskId} --by claude`, 'Claim the task');
      exec(`ai-memory-hub task done --id ${taskId} --by claude`, 'Complete the task');
    } catch (e) {
      log('  Could not parse task ID', 'yellow');
    }
  }

  // 3. Memory
  section('3. Shared Memory');

  exec(
    'echo \'{"source":"claude","text":"Demo: Use PostgreSQL for the database","metadata":{"kind":"project","project":"demo"}}\' >> ~/.ai-memory/inbox/events.jsonl',
    'Write to memory inbox'
  );

  exec('ai-memory-hub sync', 'Sync memory');
  exec('ai-memory-hub search "PostgreSQL" --limit 3', 'Search memory');

  // 4. Radio
  section('4. Radio Messages');

  exec(
    'ai-memory-hub radio send --from claude --to codex --text "Demo: Ready for review" --type note',
    'Send radio message'
  );

  exec('ai-memory-hub radio list --limit 5', 'List recent messages');

  // 5. Tool Detection
  section('5. Tool Detection');
  exec('ai-memory-hub detect', 'Detect installed tools');

  // 6. Policy
  section('6. Permission Policy');
  exec('ai-memory-hub policy list', 'List policies');

  // Summary
  section('✅ Demo Complete!');
  log('All core features have been demonstrated.', 'green');
  log('\nNext steps:', 'bright');
  log('1. Start CDP Bridge: npm run cdp-bridge', 'blue');
  log('2. Generate VS Code extension: node scripts/generate-vscode-extension.js', 'blue');
  log('3. Read full guide: docs/usage-and-verification-guide.md', 'blue');
  log('\n');
}

// Run demo
demo().catch(error => {
  log(`\nDemo failed: ${error.message}`, 'red');
  process.exit(1);
});
