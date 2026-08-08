---
name: multi-expert-doc-review
description: Use when a document (PRD, design doc, spec, contract) needs review from multiple domain perspectives in parallel. Dispatches one subagent per domain (e.g. gameplay/technical/art/monetization/compliance), each returns a structured review, then merges them into one consolidated report.
---
# Multi-Expert Parallel Document Review

## When to use
- A shared document needs review from 2+ domain angles.
- You want independent, bias-free perspectives instead of one agent juggling every lens.
- The document is large enough that parallel reading beats sequential reading.

## Method (3 steps)
1. **Pick domains.** Choose the relevant expert lenses for the document (common set: 策划 / 技术客户端 / 美术UI / 商业化增长 / IP合规). One subagent per domain.
2. **Dispatch in parallel.** Spawn one general-purpose subagent per domain, all reading the *same* source document. Give each the exact brief:
   - 总体评价 (overall assessment)
   - 关键风险 (key risks, tagged 高 / 中 / 低)
   - 建议 (recommendations)
   - 待澄清 (open questions)
   Each subagent must return that structured block and must NOT inherit your session history.
3. **Merge.** As the main agent, consolidate the per-domain blocks into one 总评报告 (consolidated report): dedupe risks, resolve contradictions, and surface cross-cutting issues (e.g. a compliance risk that blocks a monetization feature).

## Rules
- Subagents read the source doc directly; do not pre-summarize it for them.
- Keep each domain's verdict isolated until merge to avoid contamination.
- Tag every risk 高/中/低 so the merge can prioritize.
- Deliver the consolidated report, not raw subagent dumps.

## Example
Reviewing a game design doc: spawn 策划 / 技术客户端 / 美术UI / 商业化增长 / IP合规 as five parallel subagents; each returns its block; the main agent merges them into the final review.
