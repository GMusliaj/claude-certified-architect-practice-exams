#!/usr/bin/env node
/**
 * PostToolUse hook — Write (questions/*.json)
 *
 * Fires after Claude writes any file inside the questions/ directory.
 * Validates the JSON structure of the written bank: checks all required
 * fields, unique IDs, valid answer indices, and 4-option arrays.
 *
 * Logs every run to logs/validate-questions-<datetime>.log
 *
 * Configured in .claude/settings.json:
 *   { "hooks": { "PostToolUse": [{ "matcher": "Write", "hooks": [{ "type": "command", "command": "node scripts/tools/hooks/validate-questions.js" }] }] } }
 */
const fs   = require('fs');
const path = require('path');
const { createLogger } = require('../lib/logger');

const REQUIRED      = ['id', 'domain', 'text', 'options', 'answer', 'pattern', 'explanation', 'background', 'refs'];
const QUESTIONS_DIR = path.join(__dirname, '../../../questions');

async function main() {
  const log = createLogger('validate-questions');

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) { log('no stdin payload — exiting'); process.exit(0); }
  log(`stdin received: ${raw.length} bytes`);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    log(`failed to parse JSON: ${e.message}`);
    process.exit(0);
  }

  const filePath = payload?.tool_input?.file_path || '';
  const absPath  = path.resolve(filePath);

  log(`tool: ${payload?.tool_name ?? 'unknown'}`);
  log(`file_path: ${filePath}`);

  if (!absPath.startsWith(path.resolve(QUESTIONS_DIR))) {
    log('file is not inside questions/ — skipping');
    process.exit(0);
  }
  if (!absPath.endsWith('.json')) {
    log('file is not a .json file — skipping');
    process.exit(0);
  }

  const bankName = path.basename(absPath);
  log(`validating bank: ${bankName}`);

  let questions;
  try {
    questions = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (e) {
    log(`✗ invalid JSON: ${e.message}`);
    process.exit(0);
  }

  if (!Array.isArray(questions)) {
    log('✗ root value must be a JSON array');
    process.exit(0);
  }

  log(`loaded ${questions.length} questions`);

  const errors    = [];
  const seenIds   = new Set();
  const seenStems = new Map(); // stem → first question label

  questions.forEach((q, i) => {
    const label = `Q${i + 1} (id:${q.id ?? '?'})`;

    for (const field of REQUIRED) {
      if (q[field] === undefined || q[field] === null || q[field] === '') {
        errors.push(`${label}: missing field "${field}"`);
      }
    }

    if (q.id !== undefined) {
      if (seenIds.has(q.id)) errors.push(`${label}: duplicate id ${q.id}`);
      else seenIds.add(q.id);
    }

    // Duplicate question-stem detection (first 80 chars, case-insensitive, HTML stripped)
    if (q.text) {
      const stem = q.text.replace(/<[^>]+>/g, '').trim().slice(0, 80).toLowerCase();
      if (seenStems.has(stem)) {
        errors.push(`${label}: duplicate question stem (same as ${seenStems.get(stem)})`);
      } else {
        seenStems.set(stem, label);
      }
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`${label}: options must be array of 4 (got ${Array.isArray(q.options) ? q.options.length : typeof q.options})`);
    }

    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) {
      errors.push(`${label}: answer must be 0–3 (got ${q.answer})`);
    }

    if (!Array.isArray(q.refs) || q.refs.length === 0) {
      errors.push(`${label}: refs must be a non-empty array`);
    }
  });

  if (errors.length) {
    log(`✗ ${bankName}: ${errors.length} issue(s) found`);
    errors.forEach(e => log(`  · ${e}`));
  } else {
    log(`✓ ${bankName}: all ${questions.length} questions valid`);
  }
}

main().catch(e => {
  try {
    const { createLogger } = require('../lib/logger');
    const log = createLogger('validate-questions-error');
    log(`unhandled error: ${e.message}`);
  } catch { /* ignore */ }
  process.exit(0);
});
