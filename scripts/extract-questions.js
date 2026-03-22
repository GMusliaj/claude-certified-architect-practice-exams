#!/usr/bin/env node
/**
 * One-time extraction script.
 * Reads each exam HTML, evaluates the EXAM.questions array in a Node VM sandbox,
 * and writes it to questions/<name>.json.
 *
 * Run from the project root:  node scripts/extract-questions.js
 */
const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const files = [
  { html: 'exam.html',                     out: 'questions/foundations.json' },
  { html: 'exam-agents-advanced.html',     out: 'questions/agents.json'      },
  { html: 'exam-extraction-reliability.html', out: 'questions/extraction.json' },
  { html: 'exam-full.html',                out: 'questions/full.json'        },
];

// Minimal DOM/browser stubs so the scripts don't throw before EXAM is defined
function makeCtx() {
  const el = () => ({
    innerHTML : '',
    textContent: '',
    className : '',
    style     : {},
    addEventListener: () => {},
  });
  return {
    document: {
      getElementById     : el,
      querySelector      : el,
      querySelectorAll   : () => [],
      addEventListener   : () => {},
      createElement      : () => el(),
    },
    window        : {},
    localStorage  : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setInterval   : () => 0,
    clearInterval : () => {},
    setTimeout    : () => 0,
    clearTimeout  : () => {},
    console,
    Math, String, Array, JSON, Date, Object, Number, Boolean, RegExp, Error,
  };
}

fs.mkdirSync(path.join(__dirname, '..', 'questions'), { recursive: true });

for (const { html, out } of files) {
  const htmlPath = path.join(__dirname, '..', html);
  const outPath  = path.join(__dirname, '..', out);

  const content = fs.readFileSync(htmlPath, 'utf8');

  // Extract the contents of the first <script> block (the exam runtime)
  const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) { console.error(`No <script> block found in ${html}`); continue; }

  // `const`/`let` declarations don't surface on the vm context — convert EXAM
  // and STORAGE_KEY to bare assignments so they land on ctx.
  const src = scriptMatch[1]
    .replace(/\bconst\s+EXAM\s*=/, 'EXAM =')
    .replace(/\bconst\s+STORAGE_KEY\s*=/, 'STORAGE_KEY =')
    .replace(/\bconst\s+app\s*=/, 'app =');

  const ctx = makeCtx();
  try {
    vm.runInNewContext(src, ctx);
  } catch (e) {
    // DOM errors after EXAM is defined are expected — ignore them
  }

  if (!ctx.EXAM || !Array.isArray(ctx.EXAM.questions)) {
    console.error(`EXAM.questions not found in ${html}`); continue;
  }

  fs.writeFileSync(outPath, JSON.stringify(ctx.EXAM.questions, null, 2));
  console.log(`✓ ${html}: ${ctx.EXAM.questions.length} questions → ${out}`);
}
