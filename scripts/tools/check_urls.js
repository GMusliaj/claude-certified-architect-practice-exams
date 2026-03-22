#!/usr/bin/env node
/**
 * check_urls.js — verify all ref URLs across question banks
 *
 * Usage:
 *   node scripts/tools/check_urls.js [--bank <name>] [--concurrency <n>]
 *
 * Options:
 *   --bank <name>        Check only this bank (foundations|agents|extraction|full)
 *   --concurrency <n>    Parallel requests (default: 8)
 *
 * Exit codes:
 *   0 — all URLs OK
 *   1 — one or more broken URLs found
 */

const fs      = require('fs')
const path    = require('path')
const https   = require('https')
const http    = require('http')
const { createLogger } = require('./lib/logger')
const { SPA_DOMAINS, fetchBody, isNotFoundBody, TIMEOUT_MS, USER_AGENT } = require('./lib/urlcheck')

const QUESTIONS_DIR = path.join(__dirname, '../../questions')
const BANKS         = ['foundations', 'agents', 'extraction', 'full']

// ── CLI args ─────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2)
const bankArg     = args.includes('--bank') ? args[args.indexOf('--bank') + 1] : null
const concurrency = args.includes('--concurrency')
  ? parseInt(args[args.indexOf('--concurrency') + 1], 10)
  : 8

const banksToCheck = bankArg ? [bankArg] : BANKS

// ── HTTP check ────────────────────────────────────────────────────────────────
function checkUrl(url) {
  return new Promise(resolve => {
    const parsed   = new URL(url)
    const lib      = parsed.protocol === 'https:' ? https : http
    const options  = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'HEAD',
      timeout:  TIMEOUT_MS,
      headers:  { 'User-Agent': USER_AGENT },
    }

    const req = lib.request(options, res => {
      // If HEAD is forbidden, retry with GET
      if (res.statusCode === 405) {
        options.method = 'GET'
        const req2 = lib.request(options, res2 => {
          resolve({ url, status: res2.statusCode, ok: res2.statusCode < 400 })
          res2.resume()
        })
        req2.on('error', err => resolve({ url, status: null, ok: false, error: err.message }))
        req2.on('timeout', () => { req2.destroy(); resolve({ url, status: null, ok: false, error: 'timeout' }) })
        req2.end()
        return
      }
      // Follow redirects (3xx → check Location)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        try {
          const redirectUrl = new URL(res.headers.location, url).href
          return checkUrl(redirectUrl).then(r => resolve({ ...r, url, redirectedTo: r.url }))
        } catch {
          resolve({ url, status: res.statusCode, ok: false, error: 'bad redirect' })
          return
        }
      }
      // For SPA domains: HTTP 200 can still be "Not Found" — fetch body to confirm
      if (res.statusCode === 200 && SPA_DOMAINS.has(parsed.hostname)) {
        res.resume()
        fetchBody(url).then(({ body }) => {
          if (isNotFoundBody(body)) {
            resolve({ url, status: 200, ok: false, error: 'SPA Not Found page' })
          } else {
            resolve({ url, status: 200, ok: true })
          }
        })
        return
      }
      resolve({ url, status: res.statusCode, ok: res.statusCode < 400 })
      res.resume()
    })

    req.on('error',   err => resolve({ url, status: null, ok: false, error: err.message }))
    req.on('timeout', ()  => { req.destroy(); resolve({ url, status: null, ok: false, error: 'timeout' }) })
    req.end()
  })
}

// ── Pool runner ───────────────────────────────────────────────────────────────
async function runPool(tasks, limit) {
  const results = []
  let i = 0
  async function worker() {
    while (i < tasks.length) {
      const task = tasks[i++]
      results.push(await task())
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const log = createLogger('check-urls')

  // Collect all (url, questionId, bank) triples — deduplicate URLs
  const urlMap = new Map() // url → [{ bank, questionId, label }]

  for (const bank of banksToCheck) {
    const bankPath = path.join(QUESTIONS_DIR, `${bank}.json`)
    if (!fs.existsSync(bankPath)) {
      log(`bank not found: ${bank}.json — skipping`)
      continue
    }
    let questions
    try { questions = JSON.parse(fs.readFileSync(bankPath, 'utf8')) }
    catch (e) { log(`invalid JSON in ${bank}.json: ${e.message}`); continue }

    for (const q of questions) {
      for (const ref of (q.refs ?? [])) {
        if (!ref.url) continue
        if (!urlMap.has(ref.url)) urlMap.set(ref.url, [])
        urlMap.get(ref.url).push({ bank, questionId: q.id, label: ref.label })
      }
    }
  }

  const uniqueUrls = [...urlMap.keys()]
  log(`checking ${uniqueUrls.length} unique URLs across ${banksToCheck.join(', ')}`)
  console.log(`\nChecking ${uniqueUrls.length} unique URLs…\n`)

  const tasks   = uniqueUrls.map(url => () => checkUrl(url))
  const results = await runPool(tasks, concurrency)

  const broken = results.filter(r => !r.ok)
  const ok     = results.filter(r => r.ok)

  console.log(`✓ ${ok.length} OK`)

  if (broken.length === 0) {
    console.log('✓ All URLs are reachable.\n')
    log('all URLs OK')
    process.exit(0)
  }

  console.log(`✗ ${broken.length} broken:\n`)
  for (const r of broken) {
    const refs = urlMap.get(r.url) ?? []
    const where = refs.map(x => `${x.bank}#${x.questionId}`).join(', ')
    const status = r.error ?? `HTTP ${r.status}`
    console.log(`  [${status}]  ${r.url}`)
    console.log(`           used in: ${where}`)
    if (r.redirectedTo) console.log(`           redirected to: ${r.redirectedTo}`)
  }
  console.log('')
  log(`${broken.length} broken URLs found`)
  process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
