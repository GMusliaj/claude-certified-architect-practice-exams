#!/usr/bin/env node
/**
 * PostToolUse hook — Write (worklog.txt)
 *
 * Fires after Claude writes worklog.txt.
 * Parses the worklog and regenerates backlog.html — a hand-crafted visual
 * backlog board with a parchment/brown aesthetic and handwritten font.
 *
 * Configured in .claude/settings.json alongside validate-questions.js.
 * Logs to logs/render-backlog-<datetime>.log
 */
const fs   = require('fs');
const path = require('path');
const { createLogger } = require('../lib/logger');

const ROOT    = path.resolve(__dirname, '../../../');
const WORKLOG = path.join(ROOT, 'worklog.txt');
// Output to public/ so Vite includes it in the build and it's served as a static asset
const OUTPUT  = path.join(ROOT, 'public', 'backlog.html');

// ── Parser ─────────────────────────────────────────────────────────────────
function parseWorklog(text) {
  const lines    = text.split('\n');
  const sections = [];
  let   current  = null;
  let   currentTask = null;
  let   inAudit  = false;
  let   auditLines = [];

  const SEP   = /^={10,}/;
  const TASK  = /^\s{2,4}(\[[x\-! ]\])\s+([\w.]+)\s{2,}(.+)$/;
  const DESC  = /^\s{12,}(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section separator
    if (SEP.test(line)) {
      // peek at next non-empty line for section title
      const titleLine = lines[i + 1] || '';
      if (titleLine.trim() && !SEP.test(titleLine)) {
        if (currentTask && current) current.tasks.push(currentTask);
        currentTask = null;

        if (titleLine.includes('AUDIT BASELINE')) {
          inAudit = true;
          current = { title: titleLine.trim(), tasks: [], isAudit: true, auditLines: [] };
          sections.push(current);
          i++; // consume title line
        } else {
          inAudit = false;
          current = { title: titleLine.trim(), tasks: [], isAudit: false };
          sections.push(current);
          i++; // consume title line
        }
      }
      continue;
    }

    if (!current) continue;

    // Task line
    const taskMatch = line.match(TASK);
    if (taskMatch) {
      if (currentTask) current.tasks.push(currentTask);
      const statusChar = taskMatch[1]; // e.g. [x]
      currentTask = {
        status: statusChar === '[x]' ? 'done'
               : statusChar === '[-]' ? 'progress'
               : statusChar === '[!]' ? 'blocked'
               : 'pending',
        id  : taskMatch[2],
        title: taskMatch[3].trim(),
        desc : [],
      };
      continue;
    }

    // Description continuation
    const descMatch = line.match(DESC);
    if (descMatch && currentTask) {
      currentTask.desc.push(descMatch[1].trim());
      continue;
    }

    // Audit section: score lines
    if (current?.isAudit && line.trim()) {
      current.auditLines.push(line.trim());
    }
  }

  if (currentTask && current) current.tasks.push(currentTask);
  return sections.filter(s => s.tasks.length > 0 || s.isAudit);
}

// ── Stats ──────────────────────────────────────────────────────────────────
function stats(sections) {
  let total = 0, done = 0, progress = 0, pending = 0, blocked = 0;
  for (const s of sections) {
    for (const t of s.tasks) {
      total++;
      if (t.status === 'done')     done++;
      else if (t.status === 'progress') progress++;
      else if (t.status === 'blocked')  blocked++;
      else pending++;
    }
  }
  return { total, done, progress, pending, blocked };
}

// ── HTML helpers ───────────────────────────────────────────────────────────
const STATUS_ICON  = { done: '✓', progress: '⟳', pending: '○', blocked: '⚠' };
const STATUS_CLASS = { done: 'done', progress: 'progress', pending: 'pending', blocked: 'blocked' };

function taskHTML(t) {
  const cls  = STATUS_CLASS[t.status];
  const icon = STATUS_ICON[t.status];
  const desc = t.desc.length
    ? `<p class="task-desc">${t.desc.join(' ')}</p>`
    : '';
  return `
    <div class="task ${cls}">
      <span class="task-icon">${icon}</span>
      <div class="task-body">
        <span class="task-id">${t.id}</span>
        <span class="task-title">${t.title}</span>
        ${desc}
      </div>
    </div>`;
}

function sectionHTML(s) {
  const tasks = s.tasks.map(taskHTML).join('');
  const done  = s.tasks.filter(t => t.status === 'done').length;
  const total = s.tasks.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  const bar   = total
    ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`
    : '';
  return `
    <section class="card">
      <h2>${s.title}</h2>
      ${bar}
      <div class="tasks">${tasks}</div>
    </section>`;
}

function auditHTML(s) {
  const scoreLines = s.auditLines.filter(l => l.includes('/'));
  const rows = scoreLines.map(l => {
    const parts = l.split(/\s{2,}/);
    const label = parts[0] || l;
    const score = parts[1] || '';
    const note  = parts.slice(2).join('  ');
    const numMatch = score.match(/([\d.]+)/);
    const num = numMatch ? parseFloat(numMatch[1]) : 0;
    const pct = (num / 10) * 100;
    return `
      <div class="audit-row">
        <span class="audit-label">${label}</span>
        <div class="audit-bar-wrap">
          <div class="audit-bar" style="width:${pct}%"></div>
        </div>
        <span class="audit-score">${score}</span>
      </div>`;
  }).join('');
  return `
    <section class="card audit-card">
      <h2>${s.title}</h2>
      <div class="audit-scores">${rows}</div>
    </section>`;
}

// ── Template ───────────────────────────────────────────────────────────────
function generateHTML(worklogText) {
  const sections = parseWorklog(worklogText);
  const s        = stats(sections);
  const now      = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const pct      = s.total ? Math.round((s.done / s.total) * 100) : 0;

  const bodyParts = sections.map(sec =>
    sec.isAudit ? auditHTML(sec) : sectionHTML(sec)
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backlog — Claude Exam Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Caveat', cursive;
    background: #4a2410;
    background-image:
      radial-gradient(ellipse at 20% 50%, #5c3020 0%, transparent 60%),
      radial-gradient(ellipse at 80% 20%, #3a1a08 0%, transparent 50%);
    min-height: 100vh;
    padding: 2rem 1.5rem 4rem;
    color: #2a1205;
  }

  /* ── Header ── */
  .header {
    text-align: center;
    margin-bottom: 2.5rem;
  }
  .header h1 {
    font-size: 3rem;
    font-weight: 700;
    color: #f5e6c8;
    text-shadow: 2px 3px 6px rgba(0,0,0,.5);
    letter-spacing: 1px;
  }
  .header .subtitle {
    font-size: 1.3rem;
    color: #c9a87a;
    margin-top: .4rem;
  }

  /* ── Overall progress ── */
  .overall {
    max-width: 680px;
    margin: 0 auto 2.5rem;
    background: rgba(245,230,200,.12);
    border: 2px solid rgba(245,230,200,.2);
    border-radius: 12px;
    padding: 1.2rem 1.8rem;
  }
  .overall-stats {
    display: flex;
    gap: 2rem;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: .8rem;
    font-size: 1.4rem;
    color: #f5e6c8;
  }
  .stat { display: flex; flex-direction: column; align-items: center; gap: .1rem; }
  .stat-num { font-size: 2.2rem; font-weight: 700; line-height: 1; }
  .stat-num.done-col     { color: #7fbf6a; }
  .stat-num.progress-col { color: #e8c050; }
  .stat-num.pending-col  { color: #c9a87a; }
  .stat-num.blocked-col  { color: #d4604a; }
  .stat-label { font-size: 1rem; color: #c9a87a; }
  .overall-bar {
    height: 12px;
    background: rgba(0,0,0,.3);
    border-radius: 6px;
    overflow: hidden;
  }
  .overall-fill {
    height: 100%;
    background: linear-gradient(90deg, #7fbf6a, #5a9e50);
    border-radius: 6px;
    transition: width .4s ease;
  }
  .overall-pct {
    text-align: right;
    font-size: 1rem;
    color: #c9a87a;
    margin-top: .3rem;
  }

  /* ── Grid ── */
  .grid {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1.8rem;
  }

  /* ── Cards (parchment) ── */
  .card {
    background: #f5e6c8;
    background-image:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='.04'/%3E%3C/svg%3E");
    border-radius: 4px 8px 6px 4px;
    padding: 1.4rem 1.6rem 1.6rem;
    box-shadow:
      3px 4px 12px rgba(0,0,0,.35),
      inset 0 0 30px rgba(180,140,80,.08);
    position: relative;
    border-top: 4px solid #c4955a;
  }
  /* Pin */
  .card::before {
    content: '';
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 18px;
    height: 18px;
    background: radial-gradient(circle at 40% 40%, #d47050, #8b2500);
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0,0,0,.5);
  }

  .card h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #3d1f0d;
    margin-bottom: .9rem;
    padding-bottom: .5rem;
    border-bottom: 2px dashed #c4955a;
    line-height: 1.3;
  }

  /* ── Section progress bar ── */
  .progress-bar {
    height: 8px;
    background: rgba(0,0,0,.15);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 1rem;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #7fbf6a, #5a9e50);
    border-radius: 4px;
  }

  /* ── Tasks ── */
  .tasks { display: flex; flex-direction: column; gap: .7rem; }

  .task {
    display: flex;
    align-items: flex-start;
    gap: .7rem;
    padding: .5rem .7rem;
    border-radius: 4px;
    background: rgba(255,255,255,.45);
    border-left: 3px solid #c4955a;
  }
  .task.done     { border-left-color: #5a9e50; background: rgba(90,158,80,.08); }
  .task.progress { border-left-color: #c8a020; background: rgba(200,160,32,.08); }
  .task.blocked  { border-left-color: #c04030; background: rgba(192,64,48,.08); }

  .task-icon {
    font-size: 1.5rem;
    line-height: 1;
    flex-shrink: 0;
    margin-top: .1rem;
  }
  .task.done     .task-icon { color: #5a9e50; }
  .task.progress .task-icon { color: #c8a020; animation: spin 2s linear infinite; display: inline-block; }
  .task.blocked  .task-icon { color: #c04030; }
  .task.pending  .task-icon { color: #8b6040; }

  @keyframes spin { to { transform: rotate(360deg); } }

  .task-body { flex: 1; min-width: 0; }

  .task-id {
    display: inline-block;
    font-size: 1rem;
    font-weight: 700;
    color: #5c3320;
    background: rgba(100,60,20,.12);
    border-radius: 3px;
    padding: 0 .4rem;
    margin-right: .4rem;
  }
  .task.done .task-id { opacity: .6; }

  .task-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #2a1205;
  }
  .task.done .task-title {
    text-decoration: line-through;
    text-decoration-thickness: 2px;
    color: #6b5040;
  }

  .task-desc {
    font-size: 1.05rem;
    color: #5c3a20;
    margin-top: .25rem;
    line-height: 1.5;
  }

  /* ── Audit card ── */
  .audit-card { grid-column: 1 / -1; }
  .audit-scores { display: flex; flex-direction: column; gap: .6rem; margin-top: .4rem; }
  .audit-row {
    display: grid;
    grid-template-columns: 260px 1fr 80px;
    align-items: center;
    gap: .8rem;
  }
  .audit-label { font-size: 1.2rem; font-weight: 600; color: #3d1f0d; }
  .audit-bar-wrap { height: 10px; background: rgba(0,0,0,.15); border-radius: 5px; overflow: hidden; }
  .audit-bar { height: 100%; background: linear-gradient(90deg, #8b5a2b, #c4955a); border-radius: 5px; }
  .audit-score { font-size: 1.2rem; font-weight: 700; color: #3d1f0d; text-align: right; }

  /* ── Footer ── */
  .footer {
    text-align: center;
    margin-top: 3rem;
    color: #c9a87a;
    font-size: 1.1rem;
  }
  .footer a { color: #e8c87a; text-decoration: none; }
  .footer a:hover { text-decoration: underline; }

  @media (max-width: 600px) {
    .header h1 { font-size: 2.2rem; }
    .audit-row { grid-template-columns: 1fr 60px; }
    .audit-bar-wrap { display: none; }
  }
</style>
</head>
<body>

<header class="header">
  <h1>📋 Claude Exam Guide — Backlog</h1>
  <p class="subtitle">Last updated: ${now}</p>
</header>

<div class="overall">
  <div class="overall-stats">
    <div class="stat"><span class="stat-num done-col">${s.done}</span><span class="stat-label">Done</span></div>
    <div class="stat"><span class="stat-num progress-col">${s.progress}</span><span class="stat-label">In Progress</span></div>
    <div class="stat"><span class="stat-num pending-col">${s.pending}</span><span class="stat-label">Pending</span></div>
    <div class="stat"><span class="stat-num blocked-col">${s.blocked}</span><span class="stat-label">Blocked</span></div>
  </div>
  <div class="overall-bar"><div class="overall-fill" style="width:${pct}%"></div></div>
  <div class="overall-pct">${pct}% complete (${s.done} / ${s.total})</div>
</div>

<div class="grid">
${bodyParts}
</div>

<footer class="footer">
  <p>← <a href="index.html">Back to Exams</a> &nbsp;·&nbsp; <a href="worklog.txt">View raw worklog</a></p>
</footer>

</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const log = createLogger('render-backlog');

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();

  if (!raw) { log('no stdin payload — exiting'); process.exit(0); }
  log(`stdin received: ${raw.length} bytes`);

  let payload;
  try { payload = JSON.parse(raw); } catch (e) {
    log(`failed to parse JSON: ${e.message}`); process.exit(0);
  }

  const filePath = payload?.tool_input?.file_path || '';
  const absPath  = path.resolve(filePath);

  log(`tool: ${payload?.tool_name ?? 'unknown'}`);
  log(`file_path: ${filePath}`);

  if (!absPath.endsWith('worklog.txt')) {
    log('not worklog.txt — skipping');
    process.exit(0);
  }

  if (!fs.existsSync(WORKLOG)) {
    log('worklog.txt not found — skipping');
    process.exit(0);
  }

  const text = fs.readFileSync(WORKLOG, 'utf8');
  log(`worklog read: ${text.length} chars`);

  const html = generateHTML(text);
  fs.writeFileSync(OUTPUT, html, 'utf8');
  log(`backlog.html written → ${OUTPUT} (${html.length} chars)`);
}

main().catch(e => {
  try {
    const { createLogger } = require('../lib/logger');
    const log = createLogger('render-backlog-error');
    log(`unhandled error: ${e.message}`);
  } catch { /* ignore */ }
  process.exit(0);
});
