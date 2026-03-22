/**
 * Materials store — thin read/write layer over materials/*.json.
 * Each material file is a self-contained JSON object:
 *   { source, title, type, fetchedAt, text, ...meta }
 */
const fs   = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../../../materials');

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
}

/** Persist a material and return its file path. */
function save(data) {
  ensureDir();
  const slug = (data.title || data.source || 'material')
    .replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const file = path.join(DIR, `${ts}_${slug}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/** Load one material by absolute path. */
function loadFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Load all materials in the store. */
function loadAll() {
  ensureDir();
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean);
}

/** List metadata (no text) for all materials — fast overview. */
function list() {
  ensureDir();
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => {
      try {
        const m = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
        return { file: f, title: m.title, source: m.source, fetchedAt: m.fetchedAt, chars: (m.text || '').length };
      } catch { return null; }
    })
    .filter(Boolean);
}

module.exports = { save, loadFile, loadAll, list, DIR };
