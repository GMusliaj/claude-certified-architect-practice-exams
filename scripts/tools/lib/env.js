/**
 * Loads a .env file from the project root into process.env.
 * Does not overwrite variables already set in the shell.
 */
const fs   = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)\s*$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
