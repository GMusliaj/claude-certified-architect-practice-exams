#!/usr/bin/env node
/**
 * fix_ref_urls.js — upgrade generic ref URLs to specific sub-pages
 *
 * Many generated questions have a specific label (e.g. "tool_choice parameter")
 * but point at a generic overview URL. This script routes each ref to the most
 * relevant sub-page based on label keywords.
 *
 * Usage:  node scripts/tools/fix_ref_urls.js [--dry-run]
 */

const fs   = require('fs')
const path = require('path')

const DRY_RUN       = process.argv.includes('--dry-run')
const QUESTIONS_DIR = path.join(__dirname, '../../questions')
const BANKS         = ['foundations', 'agents', 'extraction', 'full']

// ── Routing rules ─────────────────────────────────────────────────────────────
// Each rule: { from, match, to }
//   from  — the generic URL to replace
//   match — keywords in the label that trigger this specific URL (any match wins)
//   to    — the better URL to use
// Rules are checked in order; first match wins. A rule with no `match` is a
// catch-all for that `from` URL.

const RULES = [
  // ── build-with-claude/tool-use ──────────────────────────────────────────────
  { from: 'https://docs.anthropic.com/en/docs/build-with-claude/tool-use',
    match: ['tool_choice', 'tool choice', 'forcing', 'execution order', 'force'],
    to:   'https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview#forcing-tool-use' },
  { from: 'https://docs.anthropic.com/en/docs/build-with-claude/tool-use',
    to:   'https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview' },

  // ── build-with-claude/tool-use/overview (already specific, keep) ────────────

  // ── agents-and-tools ────────────────────────────────────────────────────────
  { from: 'https://docs.anthropic.com/en/docs/agents-and-tools',
    match: ['mcp', 'model context protocol'],
    to:   'https://docs.anthropic.com/en/docs/agents-and-tools/mcp' },
  { from: 'https://docs.anthropic.com/en/docs/agents-and-tools',
    match: ['agent sdk', 'agentsdk', 'task tool', 'subagent', 'sub-agent', 'coordinator',
            'agent definition', 'orchestrat', 'allowedtools', 'allowed_tools'],
    to:   'https://docs.anthropic.com/en/docs/build-with-claude/agent-sdk/core-concepts' },
  { from: 'https://docs.anthropic.com/en/docs/agents-and-tools',
    to:   'https://docs.anthropic.com/en/docs/build-with-claude/agentic-systems' },

  // ── build-with-claude/agentic (old path) ────────────────────────────────────
  { from: 'https://docs.anthropic.com/en/docs/build-with-claude/agentic',
    to:   'https://docs.anthropic.com/en/docs/build-with-claude/agentic-systems' },

  // ── build-with-claude (top-level) ───────────────────────────────────────────
  { from: 'https://docs.anthropic.com/en/docs/build-with-claude',
    to:   'https://docs.anthropic.com/en/docs/build-with-claude/agentic-systems' },

  // ── claude-code ─────────────────────────────────────────────────────────────
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['hook', 'post tool', 'pre tool'],
    to:   'https://docs.anthropic.com/en/docs/claude-code/hooks' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['skill', 'slash command', 'commands'],
    to:   'https://docs.anthropic.com/en/docs/claude-code/skills' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['setting', 'config', 'configuration', '.claude/', 'mcp.json'],
    to:   'https://docs.anthropic.com/en/docs/claude-code/settings' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['claude.md', 'claudemd', 'memory', 'import depth'],
    to:   'https://docs.anthropic.com/en/docs/claude-code/memory' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['cli', 'flag', '--print', '--output-format', 'headless'],
    to:   'https://docs.anthropic.com/en/docs/claude-code/cli-reference' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['ci/cd', 'github', 'action', 'pipeline'],
    to:   'https://docs.anthropic.com/en/docs/claude-code/github-actions' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    to:   'https://docs.anthropic.com/en/docs/claude-code/overview' },
]

function bestUrl(ref) {
  const label = (ref.label ?? '').toLowerCase()
  for (const rule of RULES) {
    if (ref.url !== rule.from) continue
    if (!rule.match) return rule.to                              // catch-all
    if (rule.match.some(kw => label.includes(kw))) return rule.to
  }
  return ref.url  // no rule matched — leave as-is
}

// ── Main ──────────────────────────────────────────────────────────────────────
let totalFixed = 0

for (const bank of BANKS) {
  const bankPath = path.join(QUESTIONS_DIR, `${bank}.json`)
  const questions = JSON.parse(fs.readFileSync(bankPath, 'utf8'))
  let changed = 0

  for (const q of questions) {
    for (const ref of (q.refs ?? [])) {
      const better = bestUrl(ref)
      if (better !== ref.url) {
        if (DRY_RUN) {
          console.log(`[${bank}#${q.id}] "${ref.label}"`)
          console.log(`  ${ref.url}`)
          console.log(`→ ${better}\n`)
        }
        ref.url = better
        changed++
      }
    }
  }

  if (!DRY_RUN) {
    fs.writeFileSync(bankPath, JSON.stringify(questions, null, 2))
  }
  console.log(`${bank}: ${changed} refs updated`)
  totalFixed += changed
}

console.log(`\nTotal: ${totalFixed} refs ${DRY_RUN ? 'would be ' : ''}updated`)
