#!/usr/bin/env node
/**
 * generate_questions — produce new exam questions from the materials bank.
 *
 * Pipeline:
 *   1. Load materials bank (all or specific file)
 *   2. Load existing questions from target bank (to avoid pattern duplication)
 *   3. Ask Claude (opus) via the local `claude` CLI to generate N questions in structured JSON
 *   4. Shuffle each question's answer options (Fisher-Yates), update answer index
 *   5. Run a verification pass — Claude checks each question for factual accuracy
 *   6. Append verified questions to questions/<bank>.json
 *
 * Requires: claude CLI installed and authenticated
 *
 * Usage:
 *   node scripts/tools/generate_questions.js [options]
 *   npm run generate -- [options]
 *
 * Options:
 *   --bank  foundations|agents|extraction|full   Target question bank (required)
 *   --count <n>                                  Questions to generate (default: 5)
 *   --material <path>                            Use a specific material file
 *                                                (default: all materials in materials/)
 *   --no-verify                                  Skip the verification pass
 *   --dry-run                                    Print questions, do not append to bank
 *
 * Examples:
 *   npm run generate -- --bank foundations --count 5
 *   npm run generate -- --bank full --count 10 --material materials/2025-01-01_exam-guide.json
 */
const fs   = require('fs');
const path = require('path');
const { ask } = require('./lib/claude');
const { loadAll, loadFile } = require('./lib/materials');

// ── Bank configuration ────────────────────────────────────────────────────────
const BANKS = {
  foundations: {
    file   : 'questions/foundations.json',
    domains: [
      'Agentic Architecture & Orchestration',
      'Tool Design & MCP Integration',
      'Claude Code Configuration & Workflows',
      'Prompt Engineering & Structured Output',
      'Context Management & Reliability',
    ],
  },
  agents: {
    file   : 'questions/agents.json',
    domains: ['Multi-Agent Orchestration', 'Memory & Context Architecture', 'Execution & Reliability'],
  },
  extraction: {
    file   : 'questions/extraction.json',
    domains: ['Schema Design & Extraction', 'Compliance & Human-in-the-Loop', 'Error Handling & Validation'],
  },
  full: {
    file   : 'questions/full.json',
    domains: [
      'Agentic Architecture & Orchestration',
      'Tool Design & MCP Integration',
      'Claude Code Configuration & Workflows',
      'Prompt Engineering & Structured Output',
      'Context Management & Reliability',
    ],
  },
};

// ── Shuffle helpers ───────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffle a question's options and update the answer index to match.
// Expects Claude to return { correct, distractors } rather than options + answer.
function finaliseOptions(q) {
  const options = shuffle([q.correct, ...q.distractors]);
  return {
    ...q,
    options,
    answer    : options.indexOf(q.correct),
    // Remove generation-only fields
    correct   : undefined,
    distractors: undefined,
  };
}

// ── Build the generation prompt ───────────────────────────────────────────────
function buildGenerationPrompt(bank, existingPatterns, materials, count) {
  const domainList = BANKS[bank].domains.map((d, i) => `  ${i + 1}. ${d}`).join('\n');
  const patternList = existingPatterns.length
    ? existingPatterns.map(p => `  • ${p}`).join('\n')
    : '  (none — all patterns are available)';

  // Trim materials to fit context — use the most recent and highest-value content
  const materialsText = materials
    .sort((a, b) => new Date(b.fetchedAt) - new Date(a.fetchedAt))
    .slice(0, 8)
    .map(m => `### ${m.title}\nSource: ${m.source}\n\n${(m.text || '').slice(0, 3000)}`)
    .join('\n\n---\n\n');

  return {
    system: `You are a senior Anthropic solutions architect and certification exam author. Your job is to write rigorous multiple-choice questions for the Claude Certified Architect — Foundations exam.

Quality standards:
- Every question must test a SPECIFIC, NAMED production pattern, anti-pattern, or API behaviour
- Exactly one unambiguously correct answer — if a knowledgeable architect would debate it, rewrite the question
- Three plausible distractors: each must be something an inexperienced developer might genuinely choose
- CRITICAL — option length balance: all four options (correct + 3 distractors) must be roughly the same length and level of detail. Distractors must be specific and confident, not vague or brief. A test-taker must NOT be able to identify the correct answer by length alone. If your correct answer is 2 sentences, your distractors must also be ~2 sentences. Never write a long, detailed correct answer alongside short, one-phrase distractors.
- Question stems may use HTML: <code> for inline code, <em> for emphasis — nothing else
- All claims must be grounded in official Anthropic documentation
- refs must link to real, verified documentation URLs — never a top-level index page
- The Anthropic docs have migrated. Use ONLY these verified working URLs (do NOT invent paths):

  Tool use / tool_choice:
    https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

  Agent SDK / multi-agent orchestration:
    https://platform.claude.com/docs/en/agent-sdk/overview
    https://platform.claude.com/docs/en/agent-sdk/agent-loop

  MCP:
    https://platform.claude.com/docs/en/agents-and-tools/mcp

  Prompt engineering:
    https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
    https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

  Structured output:
    https://platform.claude.com/docs/en/build-with-claude/structured-outputs

  Batch processing:
    https://platform.claude.com/docs/en/build-with-claude/batch-processing

  Context windows / prompt caching:
    https://platform.claude.com/docs/en/build-with-claude/context-windows
    https://platform.claude.com/docs/en/build-with-claude/prompt-caching

  Claude Code (docs moved to code.claude.com):
    https://code.claude.com/docs/en/overview         ← general / plan mode / sessions
    https://code.claude.com/docs/en/memory           ← CLAUDE.md, context, imports
    https://code.claude.com/docs/en/hooks            ← PostToolUse / PreToolUse hooks
    https://code.claude.com/docs/en/skills           ← skills / slash commands
    https://code.claude.com/docs/en/settings         ← settings.json, MCP config
    https://code.claude.com/docs/en/cli-reference    ← CLI flags (--print, --output-format)
    https://code.claude.com/docs/en/github-actions   ← CI/CD pipelines

  Message API:
    https://platform.claude.com/docs/en/api/messages

- NEVER use these broken or generic URLs:
    https://docs.anthropic.com/en/docs/build-with-claude/agentic-systems  ← broken (page removed)
    https://docs.anthropic.com/en/docs/build-with-claude/agent-sdk/*      ← broken (moved)
    https://docs.anthropic.com/en/docs/build-with-claude/structured-output ← broken (use structured-outputs)
    https://docs.anthropic.com/en/docs/build-with-claude/batch-api         ← broken (use batch-processing)
    https://docs.anthropic.com/en/docs/build-with-claude                   ← too broad
    https://docs.anthropic.com/en/docs/agents-and-tools                    ← too broad
    https://docs.anthropic.com/en/docs/claude-code                         ← broken (use code.claude.com/docs/en/*)
    https://code.claude.com/docs/overview                                  ← wrong prefix (use /docs/en/overview)

- IMPORTANT: vary which option you place in "correct" — do NOT consistently put the answer in the same position. The system will shuffle options automatically, but you must still vary placement across questions.`,

    user: `Generate exactly ${count} new multiple-choice questions for the "${bank}" question bank.

AVAILABLE DOMAINS (choose from these only):
${domainList}

ALREADY-COVERED PATTERNS (do NOT duplicate any of these):
${patternList}

REFERENCE MATERIALS:
${materialsText}

OUTPUT FORMAT — return a single JSON array, no prose outside it:
[
  {
    "domain": "<exact domain name from the list above>",
    "text": "<question stem — HTML <code> allowed>",
    "correct": "<text of the correct answer>",
    "distractors": [
      "<wrong option 1>",
      "<wrong option 2>",
      "<wrong option 3>"
    ],
    "pattern": "<Pattern Name — short label, max 8 words>",
    "explanation": "<Why correct wins. Why each distractor fails. Be specific.>",
    "background": "<2-3 sentences on the underlying concept — what a study note would say>",
    "refs": [
      { "label": "<link label>", "url": "https://docs.anthropic.com/..." }
    ]
  }
]`,
  };
}

// ── Verification pass ─────────────────────────────────────────────────────────
async function verifyQuestions(questions) {
  const list = questions.map((q, i) =>
    `Q${i + 1} (pattern: ${q.pattern})\n  Stem: ${q.text.replace(/<[^>]+>/g, '')}\n  Correct: ${q.options[q.answer]}`
  ).join('\n\n');

  const result = await ask(
    `You are a Claude API expert and exam verifier. Your job is to flag questions with factual errors, misleading stems, or incorrect answers against official Anthropic documentation.`,
    `Verify the following exam questions for factual accuracy. For each, reply with a JSON array entry:
{ "index": <0-based>, "accurate": true|false, "issue": "<null or description of the error>" }

Questions to verify:
${list}

Return ONLY a JSON array, no prose outside it.`,
    { model: 'claude-opus-4-6', maxTokens: 4000 },
  );

  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    console.warn('  ⚠  Could not parse verification response — skipping verification.');
    return [];
  }
}

// ── Parse Claude's generation output ─────────────────────────────────────────
function parseGeneratedQuestions(raw) {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array found in generation response.');
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error('Response is not a JSON array.');

  // Validate required fields
  const required = ['domain', 'text', 'correct', 'distractors', 'pattern', 'explanation', 'background', 'refs'];
  return parsed.map((q, i) => {
    for (const field of required) {
      if (!q[field]) throw new Error(`Question ${i + 1} missing field: ${field}`);
    }
    if (!Array.isArray(q.distractors) || q.distractors.length !== 3) {
      throw new Error(`Question ${i + 1}: distractors must be an array of 3 items`);
    }
    return q;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const argv    = process.argv.slice(2);
  const bankIdx = argv.indexOf('--bank');
  const countIdx = argv.indexOf('--count');
  const matIdx  = argv.indexOf('--material');
  const dryRun  = argv.includes('--dry-run');
  const noVerify = argv.includes('--no-verify');

  if (bankIdx === -1) {
    console.error('\nError: --bank is required. Valid values: ' + Object.keys(BANKS).join(', '));
    process.exit(1);
  }

  const bankName = argv[bankIdx + 1];
  if (!BANKS[bankName]) {
    console.error(`\nUnknown bank: ${bankName}. Valid: ${Object.keys(BANKS).join(', ')}`);
    process.exit(1);
  }

  const count    = countIdx !== -1 ? Math.max(1, parseInt(argv[countIdx + 1], 10)) : 5;
  const bankCfg  = BANKS[bankName];
  const bankPath = path.join(__dirname, '../..', bankCfg.file);

  // Load existing questions to build covered-pattern list
  const existing = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  const existingPatterns = existing.map(q => q.pattern).filter(Boolean);
  const nextId = Math.max(0, ...existing.map(q => q.id || 0)) + 1;

  // Load materials
  let materials;
  if (matIdx !== -1) {
    const matPath = path.resolve(argv[matIdx + 1].replace(/^~/, process.env.HOME || '~'));
    materials = [loadFile(matPath)];
    console.log(`\nUsing material: ${materials[0].title}`);
  } else {
    materials = loadAll();
    if (!materials.length) {
      console.error('\nNo materials found. Run `npm run fetch` or `npm run search` first.');
      process.exit(1);
    }
    console.log(`\nLoaded ${materials.length} materials from materials/`);
  }

  console.log(`Generating ${count} question(s) for bank: ${bankName}`);
  console.log(`Existing patterns covered: ${existingPatterns.length}\n`);

  // ── Generation pass ─────────────────────────────────────────────────────────
  const { system, user } = buildGenerationPrompt(bankName, existingPatterns, materials, count);

  process.stdout.write('Calling Claude (generation pass)… ');
  const rawGeneration = await ask(system, user, { model: 'claude-opus-4-6', maxTokens: 8000 });
  console.log('done.');

  let questions;
  try {
    questions = parseGeneratedQuestions(rawGeneration);
  } catch (e) {
    console.error('\nFailed to parse generated questions:', e.message);
    console.error('Raw response (first 1000 chars):');
    console.error(rawGeneration.slice(0, 1000));
    process.exit(1);
  }

  // ── Shuffle options ─────────────────────────────────────────────────────────
  questions = questions.map(finaliseOptions);

  // ── Verification pass ───────────────────────────────────────────────────────
  let verificationResults = [];
  if (!noVerify) {
    process.stdout.write('Running verification pass… ');
    verificationResults = await verifyQuestions(questions);
    console.log('done.');

    const failed = verificationResults.filter(v => !v.accurate);
    if (failed.length) {
      console.warn(`\n⚠  ${failed.length} question(s) flagged:`);
      failed.forEach(v => {
        console.warn(`  Q${v.index + 1}: ${v.issue}`);
      });
      // Remove flagged questions
      const flaggedIdx = new Set(failed.map(v => v.index));
      questions = questions.filter((_, i) => !flaggedIdx.has(i));
      console.warn(`  Removed ${failed.length} flagged question(s). ${questions.length} remaining.\n`);
    } else {
      console.log('  All questions passed verification.\n');
    }
  }

  if (!questions.length) {
    console.error('No questions remain after verification. Try again or review the materials.');
    process.exit(1);
  }

  // ── Assign IDs ──────────────────────────────────────────────────────────────
  questions = questions.map((q, i) => ({ id: nextId + i, ...q }));

  // ── Preview (stem + domain only — no answer revealed) ───────────────────────
  console.log(`\n── Preview (${questions.length} questions) ──────────────────────────────────`);
  questions.forEach((q, i) => {
    console.log(`\n${i + 1}. [${q.domain}] — ${q.pattern}`);
    console.log(`   ${q.text.replace(/<[^>]+>/g, '').slice(0, 100)}…`);
  });
  console.log('\n────────────────────────────────────────────────────────────────────────\n');

  if (dryRun) {
    console.log('Dry run — not appended to bank. Full JSON:\n');
    console.log(JSON.stringify(questions, null, 2));
    return;
  }

  // ── Append to bank ──────────────────────────────────────────────────────────
  const updated = [...existing, ...questions];
  fs.writeFileSync(bankPath, JSON.stringify(updated, null, 2));

  console.log(`✓ Appended ${questions.length} question(s) to ${bankCfg.file}`);
  console.log(`  Bank now has ${updated.length} questions (was ${existing.length}).\n`);
  console.log('Next step: raise the matching selection count in the exam HTML if you want');
  console.log(`the new questions to be drawn. Current selection in exam HTML reads domains`);
  console.log(`from the bank — any question whose domain is already in selection is eligible.\n`);
}

run().catch(e => { console.error('\nError:', e.message); process.exit(1); });
