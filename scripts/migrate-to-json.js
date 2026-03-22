#!/usr/bin/env node
/**
 * Migrates each exam HTML from inline questions to JSON-backed, domain-sampled,
 * shuffled loading.
 *
 * Run from the project root:  node scripts/migrate-to-json.js
 */
const fs   = require('fs');
const path = require('path');

// ── Per-exam configuration ───────────────────────────────────────────────────
// selection: how many questions to draw per domain from the JSON bank.
// If the bank has more questions than `count`, they are randomly sampled.
// Add more questions to a bank file and raise the count to expand coverage.

const exams = [
  {
    html: 'exam.html',
    questionFile: 'questions/foundations.json',
    selection: {
      'Agentic Architecture & Orchestration': 8,
      'Tool Design & MCP Integration': 5,
      'Claude Code Configuration & Workflows': 6,
      'Prompt Engineering & Structured Output': 6,
      'Context Management & Reliability': 5,
    },
  },
  {
    html: 'exam-agents-advanced.html',
    questionFile: 'questions/agents.json',
    selection: {
      'Multi-Agent Orchestration': 4,
      'Memory & Context Architecture': 3,
      'Execution & Reliability': 3,
    },
  },
  {
    html: 'exam-extraction-reliability.html',
    questionFile: 'questions/extraction.json',
    selection: {
      'Schema Design & Extraction': 4,
      'Compliance & Human-in-the-Loop': 3,
      'Error Handling & Validation': 3,
    },
  },
  {
    html: 'exam-full.html',
    questionFile: 'questions/full.json',
    selection: {
      'Agentic Architecture & Orchestration': 16,
      'Tool Design & MCP Integration': 11,
      'Claude Code Configuration & Workflows': 12,
      'Prompt Engineering & Structured Output': 12,
      'Context Management & Reliability': 9,
    },
  },
];

// ── Shared init/shuffle code inserted before STORAGE_KEY in every file ───────
const LOADER_CODE = `\
// ─────────────────────────────────────────────────────────────────────────────
// QUESTION LOADING — fetch JSON bank, sample by domain weight, shuffle
// ─────────────────────────────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
// Shuffle each question's answer options while keeping the correct-answer pointer valid.
function shuffleOptions(q) {
  const correct = q.options[q.answer];
  const opts = shuffle([...q.options]);
  return { ...q, options: opts, answer: opts.indexOf(correct) };
}
// Draw count questions per domain (random sample when bank > count), then
// shuffle the final set and randomise each question's answer order.
function buildExam(bank) {
  const byDomain = {};
  for (const q of bank) (byDomain[q.domain] = byDomain[q.domain] || []).push(q);
  const selected = [];
  for (const [domain, count] of Object.entries(EXAM.selection))
    selected.push(...shuffle(byDomain[domain] || []).slice(0, count));
  return shuffle(selected).map(shuffleOptions);
}
async function init() {
  document.getElementById('app').innerHTML =
    '<div style="padding:3rem 1.5rem;text-align:center;color:var(--muted)">Loading questions…</div>';
  try {
    const resp = await fetch(EXAM.questionFile);
    if (!resp.ok) throw new Error(resp.statusText);
    EXAM.questions = buildExam(await resp.json());
  } catch (e) {
    document.getElementById('app').innerHTML =
      \`<div style="padding:3rem 1.5rem;text-align:center;color:#ef4444">
        Failed to load questions: \${e.message}<br>
        <small style="color:var(--muted)">Serve this page from a local web server (e.g. <code>npx serve .</code>)</small>
      </div>\`;
    return;
  }
  render();
}

`;

// ── Transform one HTML file ──────────────────────────────────────────────────
function transform(html, questionFile, selection) {
  const htmlPath = path.join(__dirname, '..', html);
  let content    = fs.readFileSync(htmlPath, 'utf8');

  // 1 — Locate the opening of the questions array in the EXAM object
  const questionsTag = '\n  questions: [';
  const qStart = content.indexOf(questionsTag);
  if (qStart === -1) throw new Error(`"questions: [" not found in ${html}`);

  // 2 — Locate the closing "  ];\n};" of the EXAM object (first occurrence after qStart)
  //     The array close is "  ]" followed by a newline then "};" (the EXAM object close).
  const examClose = '\n];\n};';
  let qEnd = content.indexOf(examClose, qStart);
  if (qEnd === -1) {
    // Some files use "  ]\n};" (no semicolon on array line)
    const alt = '\n  ]\n};';
    qEnd = content.indexOf(alt, qStart);
    if (qEnd === -1) throw new Error(`EXAM closing not found in ${html}`);
  }
  // Advance past the closing marker
  const afterClose = content.indexOf('\n', qEnd + examClose.length);

  // 3 — Build replacement: swap questions array for questionFile + selection
  const selectionStr = JSON.stringify(selection, null, 2)
    .split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n');

  const replacement =
    `\n  questionFile: '${questionFile}',\n  selection: ${selectionStr},\n};\n`;

  content = content.slice(0, qStart) + replacement + content.slice(afterClose + 1);

  // 4 — Add the loader/shuffle code just before "const STORAGE_KEY"
  const storageKeyMarker = '\nconst STORAGE_KEY';
  const skIdx = content.indexOf(storageKeyMarker);
  if (skIdx === -1) throw new Error(`STORAGE_KEY not found in ${html}`);

  content = content.slice(0, skIdx) + '\n' + LOADER_CODE + content.slice(skIdx + 1);

  // 5 — Replace the bare `render();` bootstrap call at the end with `init();`
  //     Match the last standalone `render();` before </script>
  content = content.replace(/\nrender\(\);\n(<\/script>)/, '\ninit();\n$1');

  fs.writeFileSync(htmlPath, content);
  console.log(`✓ ${html}: migrated to ${questionFile}`);
}

// ── Run ──────────────────────────────────────────────────────────────────────
for (const { html, questionFile, selection } of exams) {
  try {
    transform(html, questionFile, selection);
  } catch (e) {
    console.error(`✗ ${html}: ${e.message}`);
  }
}
