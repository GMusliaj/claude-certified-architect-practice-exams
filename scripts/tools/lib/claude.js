/**
 * Thin wrapper around the local `claude` CLI for scripted, non-interactive use.
 * Replaces the Anthropic SDK — no API key management here; the CLI handles auth.
 *
 * Flags used on every call:
 *   --print                  non-interactive, exit after one turn
 *   --no-session-persistence do not write session files to disk
 *   --output-format text     plain text stdout (default, but explicit)
 *
 * NOTE: --bare is intentionally NOT used. It blocks OAuth / keychain auth and
 * requires a raw ANTHROPIC_API_KEY, which defeats the purpose of delegating to
 * the CLI. --no-session-persistence is sufficient to avoid disk side-effects.
 *
 * The prompt is always written to stdin to avoid shell argument-length limits.
 */
const { spawn } = require('child_process');

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

/**
 * Low-level call — spawn claude with the given args, write prompt to stdin.
 * Returns the trimmed stdout string.
 *
 * @param {string}   prompt
 * @param {object}   opts
 * @param {string}   [opts.systemPrompt]
 * @param {string}   [opts.model='opus']
 * @param {string[]} [opts.allowedTools]   — if set, passed as --allowedTools
 * @param {boolean}  [opts.noTools=true]   — if true (and no allowedTools), passes --tools ""
 */
function call(prompt, { systemPrompt, model = 'opus', allowedTools, noTools = true } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '--print',
      '--no-session-persistence',
      '--output-format', 'text',
      '--model', model,
    ];

    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    if (allowedTools && allowedTools.length) {
      args.push('--allowedTools', allowedTools.join(','));
    } else if (noTools) {
      args.push('--tools', '');
    }

    const child = spawn(CLAUDE_BIN, args, { env: process.env });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', err => reject(new Error(`Failed to spawn claude: ${err.message}`)));
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(
          `claude exited with code ${code}` +
          (stderr.trim() ? `\n${stderr.trim().slice(0, 400)}` : '')
        ));
      } else {
        resolve(stdout.trim());
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * One-shot prompt + system prompt, no tools.
 * Drop-in replacement for the former SDK-based ask().
 */
async function ask(systemPrompt, userPrompt, { model = 'opus' } = {}) {
  return call(userPrompt, { systemPrompt, model, noTools: true });
}

/**
 * Prompt with WebSearch and WebFetch tools enabled.
 * Used by search_for_materials.
 */
async function askWithSearch(systemPrompt, userPrompt, { model = 'opus' } = {}) {
  return call(userPrompt, {
    systemPrompt,
    model,
    allowedTools: ['WebSearch', 'WebFetch'],
  });
}

module.exports = { call, ask, askWithSearch };
