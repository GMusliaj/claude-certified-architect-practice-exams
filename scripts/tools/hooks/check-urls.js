#!/usr/bin/env node
/**
 * PostToolUse hook — Write (questions/*.json)
 *
 * Fires after Claude writes any file inside the questions/ directory.
 * Checks all ref URLs in the written bank for reachability (HEAD request,
 * 8s timeout). Broken URLs are logged and printed to stderr so they appear
 * in Claude Code's hook output — generation can continue but the author
 * is immediately notified of bad links.
 *
 * Logs every run to logs/check-urls-<datetime>.log
 */
const fs   = require('fs')
const path = require('path')
const https = require('https')
const http  = require('http')
const { createLogger } = require('../lib/logger')

const QUESTIONS_DIR = path.join(__dirname, '../../../questions')
const TIMEOUT_MS    = 8000
const USER_AGENT    = 'Mozilla/5.0 (compatible; claude-exam-url-checker/1.0)'

function checkUrl(url) {
  return new Promise(resolve => {
    let parsed
    try { parsed = new URL(url) }
    catch { return resolve({ url, ok: false, error: 'invalid URL' }) }

    const lib     = parsed.protocol === 'https:' ? https : http
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'HEAD',
      timeout:  TIMEOUT_MS,
      headers:  { 'User-Agent': USER_AGENT },
    }
    const req = lib.request(options, res => {
      if (res.statusCode === 405) {
        // HEAD not allowed — retry GET
        options.method = 'GET'
        const req2 = lib.request(options, res2 => {
          resolve({ url, ok: res2.statusCode < 400, status: res2.statusCode })
          res2.resume()
        })
        req2.on('error', err => resolve({ url, ok: false, error: err.message }))
        req2.on('timeout', () => { req2.destroy(); resolve({ url, ok: false, error: 'timeout' }) })
        req2.end()
        return
      }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        try {
          return checkUrl(new URL(res.headers.location, url).href)
            .then(r => resolve({ ...r, url }))
        } catch {
          resolve({ url, ok: false, error: 'bad redirect' })
          return
        }
      }
      resolve({ url, ok: res.statusCode < 400, status: res.statusCode })
      res.resume()
    })
    req.on('error',   err => resolve({ url, ok: false, error: err.message }))
    req.on('timeout', ()  => { req.destroy(); resolve({ url, ok: false, error: 'timeout' }) })
    req.end()
  })
}

async function main() {
  const log = createLogger('check-urls')

  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) { log('no stdin — exiting'); process.exit(0) }

  let payload
  try { payload = JSON.parse(raw) } catch { process.exit(0) }

  const filePath = payload?.tool_input?.file_path ?? ''
  const absPath  = path.resolve(filePath)

  if (!absPath.startsWith(path.resolve(QUESTIONS_DIR)) || !absPath.endsWith('.json')) {
    log('not a questions/*.json file — skipping')
    process.exit(0)
  }

  let questions
  try { questions = JSON.parse(fs.readFileSync(absPath, 'utf8')) }
  catch (e) { log(`invalid JSON: ${e.message}`); process.exit(0) }

  const urls = [...new Set(
    questions.flatMap(q => (q.refs ?? []).map(r => r.url).filter(Boolean))
  )]

  log(`checking ${urls.length} URLs in ${path.basename(absPath)}`)

  const results = await Promise.all(urls.map(checkUrl))
  const broken  = results.filter(r => !r.ok)

  if (broken.length === 0) {
    log(`✓ all ${urls.length} URLs OK`)
  } else {
    log(`✗ ${broken.length} broken URL(s) in ${path.basename(absPath)}:`)
    broken.forEach(r => log(`  · ${r.url}  (${r.error ?? `HTTP ${r.status}`})`))
    process.stderr.write(`\n[check-urls] ✗ ${broken.length} broken URL(s):\n`)
    broken.forEach(r => process.stderr.write(`  · ${r.url}  (${r.error ?? `HTTP ${r.status}`})\n`))
    process.stderr.write('\n')
  }
}

main().catch(e => {
  try {
    const { createLogger } = require('../lib/logger')
    createLogger('check-urls-error')(`unhandled error: ${e.message}`)
  } catch { /* ignore */ }
  process.exit(0)
})
