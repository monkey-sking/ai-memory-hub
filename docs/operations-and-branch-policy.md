# AMH Operations and Branch Baseline

## Git branch baseline

Keep only main locally and on origin by default. Merge temporary branches, check conflicts, test, and push before deleting them. Never force-reset over another AI agents committed work.

## Safe daemon restart

1. Run ai-memory-hub daemon status and confirm the PID.
2. Send SIGTERM to the confirmed AMH daemon and wait for the old PID to stop.
3. Start ai-memory-hub daemon --interval-ms 10000.
4. Run status again and confirm the new PID is live, stalePid=false, and lastError is empty.

Use --force only after confirming the old daemon is no longer alive. The daemon also owns an atomic state/daemon.lock; a live lock is never overridden.


See [AMH Git Agent Workflow](git-agent-workflow.md) for the pre-commit plan, staged-diff scan, verification gate, and push authorization rules.
