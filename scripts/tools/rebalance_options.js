#!/usr/bin/env node
/**
 * rebalance_options — fix length-bias in question banks.
 *
 * The bias: LLM-generated correct answers are consistently longer/more detailed
 * than the distractors (85-100% of questions). A test-taker can identify the
 * correct answer by length alone, defeating the exam's purpose.
 *
 * Fix: for every question where the correct option is >40% longer than the
 * average distractor, ask Claude to rewrite the three distractors to be
 * comparable in length and specificity while remaining clearly wrong.
 *
 * Usage:
 *   node scripts/tools/rebalance_options.js [--bank <name>] [--dry-run] [--threshold <pct>]
 *
 * Options:
 *   --bank foundations|agents|extraction|full   Target bank (default: all)
 *   --dry-run                                    Print changes, do not write
 *   --threshold <n>                              Length ratio threshold % (default: 40)
 */
const fs   = require('fs');
const path = require('path');
const { ask } = require('./lib/claude');

const ROOT = path.join(__dirname, '../..');
const BANKS = {
  foundations : 'questions/foundations.json',
  agents      : 'questions/agents.json',
  extraction  : 'questions/extraction.json',
  full        : 'questions/full.json',
};

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv       = process.argv.slice(2);
const bankArg    = argv[argv.indexOf('--bank') + 1];
const dryRun     = argv.includes('--dry-run');
const threshIdx  = argv.indexOf('--threshold');
const THRESHOLD  = threshIdx !== -1 ? parseInt(argv[threshIdx + 1], 10) / 100 : 0.40;

const targetBanks = bankArg && BANKS[bankArg]
  ? { [bankArg]: BANKS[bankArg] }
  : BANKS;

// ── Bias detection ────────────────────────────────────────────────────────────
function isBiased(q) {
  const correctLen     = q.options[q.answer].length;
  const distractors    = q.options.filter((_, i) => i !== q.answer);
  const avgDistractor  = distractors.reduce((s, o) => s + o.length, 0) / distractors.length;
  return correctLen > avgDistractor * (1 + THRESHOLD);
}

// ── Rewrite prompt ────────────────────────────────────────────────────────────
function buildRewritePrompt(questions) {
  const items = questions.map((q, i) => {
    const correct     = q.options[q.answer];
    const distractors = q.options.filter((_, idx) => idx !== q.answer);
    return `QUESTION ${i}:
Stem: ${q.text.replace(/<[^>]+>/g, '')}
Correct answer (keep this EXACTLY as-is): ${correct}
Current distractors (too short/vague — rewrite these):
  1. ${distractors[0]}
  2. ${distractors[1]}
  3. ${distractors[2]}`;
  }).join('\n\n');

  return {
    system: `You are a senior Anthropic solutions architect rewriting exam distractors.
Your ONLY job is to rewrite the three distractors for each question so they are:
- Roughly the same length and level of detail as the correct answer
- Specific and confident — not vague, not one-liners
- Plausible to an inexperienced developer (a real mistake someone would make)
- Clearly wrong to an expert who knows the Anthropic docs
- NOT identical or near-identical to any other option

DO NOT change the correct answer. DO NOT change the question stem.
Return ONLY a JSON array (no prose), one entry per question:
[{ "distractors": ["<new d1>", "<new d2>", "<new d3>"] }, ...]`,

    user: `Rewrite the distractors for each question below so they match the length and specificity of the correct answer.

${items}

Return ONLY a JSON array with ${questions.length} entries, each with a "distractors" array of 3 strings.`,
  };
}

// ── Apply rewritten distractors back onto a question ─────────────────────────
function applyRewrite(q, newDistractors) {
  const correct = q.options[q.answer];
  // Rebuild options: place correct back at same index, fill others with new distractors
  const options = [...q.options];
  let di = 0;
  for (let i = 0; i < options.length; i++) {
    if (i !== q.answer) options[i] = newDistractors[di++];
  }
  return { ...q, options };
}

// ── Process one bank ──────────────────────────────────────────────────────────
async function processBank(bankName, relPath) {
  const absPath = path.join(ROOT, relPath);
  const bank    = JSON.parse(fs.readFileSync(absPath, 'utf8'));

  const biased = bank.map((q, i) => ({ q, i })).filter(({ q }) => isBiased(q));

  console.log(`\n[${bankName}] ${bank.length} questions — ${biased.length} biased (threshold: +${Math.round(THRESHOLD * 100)}%)`);

  if (!biased.length) {
    console.log('  No rewriting needed.');
    return;
  }

  // Process in batches of 10 to keep prompts manageable
  const BATCH = 10;
  let fixed = 0;

  for (let b = 0; b < biased.length; b += BATCH) {
    const slice     = biased.slice(b, b + BATCH);
    const questions = slice.map(({ q }) => q);

    process.stdout.write(`  Rewriting questions ${b + 1}–${Math.min(b + BATCH, biased.length)}… `);
    const { system, user } = buildRewritePrompt(questions);

    let rewrites;
    try {
      const raw = await ask(system, user, { model: 'claude-opus-4-6' });
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array in response');
      rewrites = JSON.parse(match[0]);
      if (!Array.isArray(rewrites) || rewrites.length !== questions.length) {
        throw new Error(`Expected ${questions.length} entries, got ${rewrites?.length}`);
      }
    } catch (e) {
      console.error(`\n  ⚠ Batch ${b}–${b + BATCH} failed: ${e.message}`);
      continue;
    }

    console.log('done.');

    for (let j = 0; j < slice.length; j++) {
      const { i }        = slice[j];
      const newDistractors = rewrites[j]?.distractors;
      if (!Array.isArray(newDistractors) || newDistractors.length !== 3) {
        console.warn(`  ⚠ Q${i} (id ${bank[i].id}): bad rewrite response, skipping.`);
        continue;
      }
      if (dryRun) {
        const q = bank[i];
        console.log(`\n  [DRY RUN] Q${i} id=${q.id}`);
        console.log(`    Correct  : ${q.options[q.answer].slice(0, 80)}`);
        newDistractors.forEach((d, k) => console.log(`    New d${k + 1}  : ${d.slice(0, 80)}`));
      } else {
        bank[i] = applyRewrite(bank[i], newDistractors);
      }
      fixed++;
    }
  }

  if (!dryRun) {
    fs.writeFileSync(absPath, JSON.stringify(bank, null, 2));
    console.log(`  ✓ Rewrote ${fixed} questions and saved ${relPath}`);
  } else {
    console.log(`\n  Dry run complete — ${fixed} questions would be rewritten.`);
  }
}

// ── Bias report ───────────────────────────────────────────────────────────────
function reportBias(label, relPath) {
  const bank = JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
  let longestCorrect = 0;
  bank.forEach(q => {
    const lengths = q.options.map(o => o.length);
    const maxLen  = Math.max(...lengths);
    if (lengths[q.answer] === maxLen) longestCorrect++;
  });
  const pct = Math.round(longestCorrect / bank.length * 100);
  return `  ${label.padEnd(14)} ${longestCorrect}/${bank.length} (${pct}%) correct = longest option`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n════ rebalance_options ════════════════════════════════════════════\n');
  console.log('Bias report BEFORE:');
  Object.entries(targetBanks).forEach(([name, p]) => console.log(reportBias(name, p)));

  for (const [name, relPath] of Object.entries(targetBanks)) {
    await processBank(name, relPath);
  }

  if (!dryRun) {
    console.log('\nBias report AFTER:');
    Object.entries(targetBanks).forEach(([name, p]) => console.log(reportBias(name, p)));
  }

  console.log('\n════════════════════════════════════════════════════════════════════\n');
}

run().catch(e => { console.error('\nError:', e.message); process.exit(1); });
