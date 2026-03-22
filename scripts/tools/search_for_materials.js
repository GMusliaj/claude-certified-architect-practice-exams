#!/usr/bin/env node
/**
 * search_for_materials — discover and store new Claude exam resources.
 *
 * Calls the local `claude` CLI with WebSearch + WebFetch tools enabled.
 * Results are cached in materials/ — a query that has already been searched
 * is skipped automatically. Pass --force to re-run cached queries.
 *
 * Usage:
 *   node scripts/tools/search_for_materials.js [options]
 *   npm run search -- [options]
 *
 * Options:
 *   --topic  agentic|tools|claudecode|prompting|context
 *   --query  "custom query string"   (overrides topic)
 *   --limit  <n>                     max URLs to fetch per query (default: 5)
 *   --force                          ignore cache, re-run all queries
 *   --dry-run                        print discoveries, do not save
 *
 * Examples:
 *   npm run search
 *   npm run search -- --topic agentic
 *   npm run search -- --query "Claude MCP server tool design 2025"
 *   npm run search -- --force
 */
const { askWithSearch }              = require('./lib/claude');
const { save, loadAll }              = require('./lib/materials');
const { createLogger }               = require('./lib/logger');

// ── Default queries per domain ────────────────────────────────────────────────
const QUERIES = {
  agentic   : [
    'Anthropic Claude multi-agent orchestration agentic architecture production patterns 2025',
    'Claude API stop_reason tool_use agentic loop best practices',
  ],
  tools     : [
    'Anthropic Model Context Protocol MCP tool design server integration 2025',
    'Claude tool_choice structured output JSON schema API patterns',
  ],
  claudecode: [
    'Claude Code CLAUDE.md configuration agent skills MCP settings 2025',
    'Anthropic Claude Code hooks PreToolUse PostToolUse plan mode workflow',
  ],
  prompting : [
    'Claude API prompt engineering few-shot structured output JSON schema extraction',
    'Anthropic Batch API message batches custom_id reliability patterns',
  ],
  context   : [
    'Claude context window management long document reliability escalation handoff',
    'Anthropic Claude lost in the middle context window provenance structured state',
  ],
};

const ALL_QUERIES = Object.values(QUERIES).flat();

// ── HTML text extraction ──────────────────────────────────────────────────────
function extractHTML(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s{2,}/g, ' ').trim();
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  return { text, title: titleMatch?.[1]?.trim() || null };
}

async function fetchSource(url) {
  try {
    const resp = await fetch(url, {
      signal : AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'claude-exam-guide/1.0 (educational research)' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return extractHTML(await resp.text());
  } catch (e) {
    return { error: e.message };
  }
}

// ── Build the search prompt ───────────────────────────────────────────────────
function buildPrompt(query) {
  return `You are researching materials for the Claude Certified Architect exam.

Search for: ${query}

Instructions:
1. Use WebSearch and WebFetch to find the most relevant and recent official Anthropic documentation, guides, and production patterns related to this query.
2. Prioritise: docs.anthropic.com, the Anthropic blog, official GitHub repos, and authoritative technical resources.
3. After searching and reading the top results, return a JSON object with exactly these fields:
   - "summary": a 3–5 sentence synthesis of the key findings
   - "urls": array of the top source URLs found (max 5, most valuable first)
   - "keyPoints": array of the most exam-relevant facts or patterns discovered (max 8)

Return ONLY valid JSON. No prose, no markdown fences, no explanation outside the JSON object.`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const log = createLogger('search-materials');

  const argv     = process.argv.slice(2);
  const dryRun   = argv.includes('--dry-run');
  const force    = argv.includes('--force');
  const topicIdx = argv.indexOf('--topic');
  const queryIdx = argv.indexOf('--query');
  const limitIdx = argv.indexOf('--limit');
  const limit    = limitIdx !== -1 ? parseInt(argv[limitIdx + 1], 10) : 5;

  log(`started — args: ${argv.join(' ') || '(none)'}`);
  log(`dry-run: ${dryRun} | force: ${force} | limit: ${limit}`);

  let queries;
  if (queryIdx !== -1) {
    queries = [argv[queryIdx + 1]];
  } else if (topicIdx !== -1) {
    const topic = argv[topicIdx + 1];
    if (!QUERIES[topic]) {
      const msg = `Unknown topic: ${topic}. Valid: ${Object.keys(QUERIES).join(', ')}`;
      log(msg); console.error(msg); process.exit(1);
    }
    queries = QUERIES[topic];
  } else {
    queries = ALL_QUERIES;
  }

  log(`queries to run: ${queries.length}`);

  // ── Build cache from persisted materials bank ─────────────────────────────
  // cached queries  : search-result entries keyed by their query string
  // cached URLs     : all source URLs already stored (any type)
  const allMaterials  = loadAll();
  const cachedQueries = new Set(
    allMaterials.filter(m => m.type === 'search-result').map(m => m.query)
  );
  const cachedURLs = new Set(
    allMaterials.map(m => m.source).filter(Boolean)
  );

  log(`cache state: ${cachedQueries.size} cached queries, ${cachedURLs.size} cached URLs`);

  let totalSaved   = 0;
  let totalSkipped = 0;

  for (const query of queries) {
    // ── Query-level cache check ─────────────────────────────────────────────
    if (!force && cachedQueries.has(query)) {
      const msg = `  [cached] "${query.slice(0, 70)}"`;
      console.log(msg); log(`SKIP (cached): ${query}`);
      totalSkipped++;
      continue;
    }

    console.log(`\nSearching: "${query}"`);
    log(`running search: ${query}`);
    process.stdout.write('  Calling claude (WebSearch + WebFetch)… ');

    let result;
    try {
      const raw = await askWithSearch(
        'You are a research assistant specialising in Anthropic documentation and Claude API patterns.',
        buildPrompt(query),
      );
      log(`claude response: ${raw.length} chars`);

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no JSON object in response');
      result = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log(`failed`);
      log(`ERROR: ${e.message}`);
      continue;
    }
    console.log('done.');

    const summary   = result.summary   || '';
    const urls      = result.urls      || [];
    const keyPoints = result.keyPoints || [];

    log(`summary length: ${summary.length} chars`);
    log(`urls found: ${urls.length}`);
    log(`keyPoints: ${keyPoints.length}`);
    keyPoints.forEach(p => log(`  · ${p.slice(0, 120)}`));

    console.log(`  Summary  : ${summary.slice(0, 120)}…`);
    console.log(`  URLs     : ${urls.length}`);
    keyPoints.slice(0, 3).forEach(p => console.log(`  · ${p.slice(0, 100)}`));

    // Save the search-result summary
    if (!dryRun) {
      const saved = save({
        source   : `search:${query}`,
        title    : `Search: ${query.slice(0, 60)}`,
        type     : 'search-result',
        fetchedAt: new Date().toISOString(),
        text     : [summary, ...keyPoints, ...urls.map(u => `Source: ${u}`)].join('\n\n'),
        query,
        urls,
        keyPoints,
      });
      cachedQueries.add(query); // update in-run cache
      log(`saved search-result → ${saved}`);
      totalSaved++;
    }

    // Fetch and save each discovered URL (skip URLs already in the bank)
    for (const url of urls.slice(0, limit)) {
      if (cachedURLs.has(url) || cachedURLs.has(`search:${url}`)) {
        console.log(`  [cached] ${url}`);
        log(`SKIP URL (cached): ${url}`);
        continue;
      }
      if (dryRun) { console.log(`  [dry-run] would fetch: ${url}`); continue; }

      process.stdout.write(`  Fetching ${url} … `);
      log(`fetching URL: ${url}`);

      const page = await fetchSource(url);
      if (page.error || !page.text || page.text.length < 200) {
        const reason = page.error || 'too short';
        console.log(`skipped (${reason})`);
        log(`SKIP URL (${reason}): ${url}`);
        continue;
      }

      const mat = save({
        source   : url,
        title    : page.title || url,
        type     : 'html',
        fetchedAt: new Date().toISOString(),
        text     : page.text,
        fromQuery: query,
      });
      cachedURLs.add(url); // update in-run cache
      console.log(`saved (${page.text.length.toLocaleString()} chars)`);
      log(`saved URL → ${mat}`);
      totalSaved++;
    }
  }

  const summary = `Done. ${totalSaved} saved, ${totalSkipped} skipped (cached).`;
  console.log(`\n${summary}\n`);
  log(summary);
}

run().catch(e => {
  console.error('\nError:', e.message);
  process.exit(1);
});
