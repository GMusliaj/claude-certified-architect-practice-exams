/**
 * Shared file logger for hook scripts.
 *
 * Creates logs/<tool-name>-<YYYY-MM-DD-HH-MM-SS>.log on first write.
 * Every line is also written to stderr so it appears in Claude Code's
 * hook output panel.
 *
 * Usage:
 *   const { createLogger } = require('../lib/logger');
 *   const log = createLogger('archive-webfetch');
 *   log('hook fired');
 */
const fs   = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '../../../logs');

function createLogger(toolName) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const ts  = new Date().toISOString()
    .replace('T', '-')
    .replace(/:/g, '-')
    .slice(0, 19); // YYYY-MM-DD-HH-MM-SS

  const logPath = path.join(LOGS_DIR, `${toolName}-${ts}.log`);

  function log(message) {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    try { fs.appendFileSync(logPath, line); } catch { /* never crash a hook */ }
    process.stderr.write(line);
  }

  log(`=== ${toolName} started ===`);
  return log;
}

module.exports = { createLogger };
