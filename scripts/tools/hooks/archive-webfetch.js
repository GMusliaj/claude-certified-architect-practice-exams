#!/usr/bin/env node
/**
 * PostToolUse hook — WebFetch
 *
 * Fires after Claude uses the WebFetch tool during a session.
 * Reads the tool payload from stdin, extracts the URL and fetched content,
 * and saves it to materials/ if the content is substantial.
 *
 * Logs every run to logs/archive-webfetch-<datetime>.log
 *
 * Configured in .claude/settings.json:
 *   { "hooks": { "PostToolUse": [{ "matcher": "WebFetch", "hooks": [{ "type": "command", "command": "node scripts/tools/hooks/archive-webfetch.js" }] }] } }
 */
const fs   = require('fs');
const path = require('path');
const { save, list }     = require('../lib/materials');
const { createLogger }   = require('../lib/logger');

const MIN_CHARS = 500;

async function main() {
  const log = createLogger('archive-webfetch');

  // Read stdin payload
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

  const url     = payload?.tool_input?.url;
  const content = payload?.tool_response?.content || payload?.tool_response?.output || '';

  log(`tool: ${payload?.tool_name ?? 'unknown'}`);
  log(`url: ${url ?? '(none)'}`);
  log(`raw content length: ${content.length} chars`);

  if (!url) { log('no url in payload — skipping'); process.exit(0); }
  if (!content) { log('no content in response — skipping'); process.exit(0); }
  if (content.length < MIN_CHARS) { log(`content too short (${content.length} < ${MIN_CHARS}) — skipping`); process.exit(0); }
  if (!url.startsWith('http')) { log(`non-http url "${url}" — skipping`); process.exit(0); }

  // Duplicate check
  const existing = list().find(m => m.source === url);
  if (existing) { log(`already in materials bank — skipping`); process.exit(0); }

  // Strip HTML
  const text = content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (text.length < MIN_CHARS) {
    log(`text after strip too short (${text.length} < ${MIN_CHARS}) — skipping`);
    process.exit(0);
  }

  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  const title      = titleMatch?.[1]?.trim() || url;

  log(`title: ${title}`);
  log(`text length after strip: ${text.length} chars`);

  const saved = save({
    source   : url,
    title,
    type     : 'html',
    fetchedAt: new Date().toISOString(),
    text,
    fromHook : 'PostToolUse:WebFetch',
  });

  log(`saved → ${path.basename(saved)}`);
}

main().catch(e => {
  // Best-effort: try to log the error, then exit cleanly so the session is not affected
  try {
    const { createLogger } = require('../lib/logger');
    const log = createLogger('archive-webfetch-error');
    log(`unhandled error: ${e.message}`);
  } catch { /* ignore */ }
  process.exit(0);
});
