#!/usr/bin/env node
/**
 * PostToolUse hook — Write (questions/*.json)
 *
 * Fires after Claude writes any file inside the questions/ directory.
 * Upgrades generic ref URLs to specific sub-pages using the same label-keyword
 * rules as scripts/tools/fix_ref_urls.js, operating only on the written file.
 *
 * Runs silently when nothing needs changing. Logs every run to
 * logs/fix-ref-urls-<datetime>.log
 */
const fs   = require('fs')
const path = require('path')
const { createLogger } = require('../lib/logger')

const QUESTIONS_DIR = path.join(__dirname, '../../../questions')

// Canonical URL map — platform.claude.com paths verified working
const RULES = [
  // Tool use
  { from: 'https://docs.anthropic.com/en/docs/build-with-claude/tool-use',
    to:   'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview' },

  // Agentic / Agent SDK
  { from: 'https://docs.anthropic.com/en/docs/agents-and-tools',
    match: ['mcp', 'model context protocol'],
    to:   'https://platform.claude.com/docs/en/agents-and-tools/mcp' },
  { from: 'https://docs.anthropic.com/en/docs/agents-and-tools',
    match: ['agent loop', 'how the agent loop'],
    to:   'https://platform.claude.com/docs/en/agent-sdk/agent-loop' },
  { from: 'https://docs.anthropic.com/en/docs/agents-and-tools',
    match: ['agent sdk', 'agentsdk', 'task tool', 'subagent', 'sub-agent', 'coordinator',
            'agent definition', 'orchestrat', 'allowedtools', 'allowed_tools'],
    to:   'https://platform.claude.com/docs/en/agent-sdk/overview' },
  { from: 'https://docs.anthropic.com/en/docs/agents-and-tools',
    to:   'https://platform.claude.com/docs/en/agent-sdk/overview' },

  { from: 'https://docs.anthropic.com/en/docs/build-with-claude/agentic',
    to:   'https://platform.claude.com/docs/en/agent-sdk/overview' },
  { from: 'https://docs.anthropic.com/en/docs/build-with-claude/agentic-systems',
    to:   'https://platform.claude.com/docs/en/agent-sdk/overview' },
  { from: 'https://docs.anthropic.com/en/docs/build-with-claude/agent-sdk/core-concepts',
    to:   'https://platform.claude.com/docs/en/agent-sdk/overview' },
  { from: 'https://docs.anthropic.com/en/docs/build-with-claude/agent-sdk/how-the-agent-loop-works',
    to:   'https://platform.claude.com/docs/en/agent-sdk/agent-loop' },
  { from: 'https://docs.anthropic.com/en/docs/agents/core-concepts',
    to:   'https://platform.claude.com/docs/en/agent-sdk/overview' },

  { from: 'https://docs.anthropic.com/en/docs/build-with-claude',
    to:   'https://platform.claude.com/docs/en/agent-sdk/overview' },

  // Claude Code — all redirect to code.claude.com
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['hook', 'post tool', 'pre tool'],
    to:   'https://code.claude.com/docs/en/hooks' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['skill', 'slash command', 'commands'],
    to:   'https://code.claude.com/docs/en/skills' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['setting', 'config', 'configuration', '.claude/', 'mcp.json'],
    to:   'https://code.claude.com/docs/en/settings' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['claude.md', 'claudemd', 'memory', 'import depth'],
    to:   'https://code.claude.com/docs/en/memory' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['cli', 'flag', '--print', '--output-format', 'headless'],
    to:   'https://code.claude.com/docs/en/cli-reference' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    match: ['ci/cd', 'github', 'action', 'pipeline'],
    to:   'https://code.claude.com/docs/en/github-actions' },
  { from: 'https://docs.anthropic.com/en/docs/claude-code',
    to:   'https://code.claude.com/docs/en/overview' },
]

function bestUrl(ref) {
  const label = (ref.label ?? '').toLowerCase()
  for (const rule of RULES) {
    if (ref.url !== rule.from) continue
    if (!rule.match) return rule.to
    if (rule.match.some(kw => label.includes(kw))) return rule.to
  }
  return ref.url
}

async function main() {
  const log = createLogger('fix-ref-urls')

  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) { log('no stdin — exiting'); process.exit(0) }

  let payload
  try { payload = JSON.parse(raw) } catch { process.exit(0) }

  const filePath = payload?.tool_input?.file_path ?? ''
  const absPath  = path.resolve(filePath)

  if (!absPath.startsWith(path.resolve(QUESTIONS_DIR)) || !absPath.endsWith('.json')) {
    log('not a questions/*.json file — skipping')
    process.exit(0)
  }

  let questions
  try { questions = JSON.parse(fs.readFileSync(absPath, 'utf8')) }
  catch (e) { log(`invalid JSON: ${e.message}`); process.exit(0) }

  let changed = 0
  for (const q of questions) {
    for (const ref of (q.refs ?? [])) {
      const better = bestUrl(ref)
      if (better !== ref.url) {
        log(`Q${q.id} "${ref.label}": ${ref.url} → ${better}`)
        ref.url = better
        changed++
      }
    }
  }

  if (changed > 0) {
    fs.writeFileSync(absPath, JSON.stringify(questions, null, 2))
    log(`✓ fixed ${changed} ref(s) in ${path.basename(absPath)}`)
    process.stderr.write(`[fix-ref-urls] ✓ upgraded ${changed} generic ref URL(s) to specific sub-pages\n`)
  } else {
    log('✓ all refs already specific — no changes needed')
  }
}

main().catch(e => {
  try {
    const { createLogger } = require('../lib/logger')
    createLogger('fix-ref-urls-error')(`unhandled error: ${e.message}`)
  } catch { /* ignore */ }
  process.exit(0)
})
