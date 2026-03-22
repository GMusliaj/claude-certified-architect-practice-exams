#!/usr/bin/env node
/**
 * fetch_materials — download and store a resource in the materials bank.
 *
 * Supports: HTTP/HTTPS URLs · local files (PDF, HTML, MD, TXT)
 * Output  : materials/<timestamp>_<slug>.json
 *
 * Usage:
 *   node scripts/tools/fetch_materials.js <url-or-path> [--name <label>]
 *   npm run fetch -- <url-or-path> [--name <label>]
 *
 * Examples:
 *   npm run fetch -- https://docs.anthropic.com/en/docs/agents-and-tools
 *   npm run fetch -- ~/Downloads/Anthropic_Exam_Guide.pdf --name "Official Exam Guide"
 *   npm run fetch -- ./notes.md
 */
const fs   = require('fs');
const path = require('path');
const { save } = require('./lib/materials');

// ── HTML text extraction (no extra lib) ──────────────────────────────────────
function extractHTML(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s{2,}/g, ' ')
    .trim();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  return { text, title: titleMatch?.[1]?.trim() || null };
}

// ── PDF extraction ────────────────────────────────────────────────────────────
async function extractPDF(buffer) {
  const pdfParse = require('pdf-parse');
  const data     = await pdfParse(buffer);
  return {
    text  : data.text.replace(/\s{3,}/g, '\n\n').trim(),
    title : data.info?.Title || null,
    pages : data.numpages,
  };
}

// ── Fetch a URL ───────────────────────────────────────────────────────────────
async function fetchURL(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'claude-exam-guide/1.0 (educational research)' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);

  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
    return { buffer: Buffer.from(await resp.arrayBuffer()), type: 'pdf' };
  }
  return { html: await resp.text(), type: 'html' };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '--help') {
    console.log(
      'Usage: node scripts/tools/fetch_materials.js <url-or-path> [--name <label>]\n' +
      '\nExamples:\n' +
      '  node scripts/tools/fetch_materials.js https://docs.anthropic.com/en/docs/agents-and-tools\n' +
      '  node scripts/tools/fetch_materials.js ~/Downloads/exam.pdf --name "Official Exam Guide"'
    );
    process.exit(argv[0] === '--help' ? 0 : 1);
  }

  const input       = argv[0];
  const nameIdx     = argv.indexOf('--name');
  const overrideName = nameIdx !== -1 ? argv[nameIdx + 1] : null;

  const isURL   = /^https?:\/\//.test(input);
  const absPath = isURL ? null : path.resolve(input.replace(/^~/, process.env.HOME || '~'));

  let text, title, type, meta = {};

  console.log(`\nFetching: ${input}`);

  if (isURL) {
    const res = await fetchURL(input);
    if (res.type === 'pdf') {
      const ex = await extractPDF(res.buffer);
      ({ text, title } = ex); meta.pages = ex.pages; type = 'pdf';
    } else {
      const ex = extractHTML(res.html);
      ({ text, title } = ex); type = 'html';
    }
  } else {
    if (!fs.existsSync(absPath)) {
      console.error(`File not found: ${absPath}`);
      process.exit(1);
    }
    const ext = path.extname(absPath).toLowerCase();
    if (ext === '.pdf') {
      const ex = await extractPDF(fs.readFileSync(absPath));
      ({ text, title } = ex); meta.pages = ex.pages; type = 'pdf';
    } else if (['.html', '.htm'].includes(ext)) {
      const ex = extractHTML(fs.readFileSync(absPath, 'utf8'));
      ({ text, title } = ex); type = 'html';
    } else {
      text = fs.readFileSync(absPath, 'utf8');
      title = path.basename(absPath, ext);
      type = 'text';
    }
  }

  const material = {
    source   : isURL ? input : `file://${absPath}`,
    title    : overrideName || title || path.basename(input),
    type,
    fetchedAt: new Date().toISOString(),
    text,
    ...meta,
  };

  const outPath = save(material);

  console.log(`\n  Saved  : ${outPath}`);
  console.log(`  Title  : ${material.title}`);
  console.log(`  Type   : ${type}${meta.pages ? ` · ${meta.pages} pages` : ''}`);
  console.log(`  Length : ${text.length.toLocaleString()} chars\n`);
}

run().catch(e => { console.error('\nError:', e.message); process.exit(1); });
