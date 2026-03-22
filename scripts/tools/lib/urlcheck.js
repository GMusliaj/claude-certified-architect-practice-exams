/**
 * Shared URL-check utilities used by check_urls.js (CLI) and hooks/check-urls.js (hook).
 *
 * platform.claude.com and code.claude.com are Next.js SPAs that return HTTP 200 for all
 * paths, including broken ones. Detect "Not Found" pages by checking the og:title in the
 * response body.
 */
const https = require('https')
const http  = require('http')

const TIMEOUT_MS = 8000
const USER_AGENT = 'Mozilla/5.0 (compatible; claude-exam-url-checker/1.0)'

const SPA_DOMAINS = new Set(['platform.claude.com', 'code.claude.com'])

/** Fetch up to 4096 bytes of a URL's response body. Returns { status, body }. */
function fetchBody(url) {
  return new Promise(resolve => {
    const parsed  = new URL(url)
    const lib     = parsed.protocol === 'https:' ? https : http
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      timeout:  TIMEOUT_MS,
      headers:  { 'User-Agent': USER_AGENT },
    }
    const req = lib.request(options, res => {
      const chunks = []
      let accumulatedLen = 0
      res.on('data', c => {
        if (accumulatedLen < 4096) {
          chunks.push(c)
          accumulatedLen += c.length
        }
      })
      res.on('end',   () => resolve({ status: res.statusCode, body: chunks.join('') }))
      res.on('error', () => resolve({ status: res.statusCode, body: '' }))
    })
    req.on('error',   () => resolve({ status: null, body: '' }))
    req.on('timeout', () => { req.destroy(); resolve({ status: null, body: '' }) })
    req.end()
  })
}

/** Return true if the response body is an SPA "Not Found" page. */
function isNotFoundBody(body) {
  return /<meta[^>]+property="og:title"[^>]+content="Not Found/.test(body) ||
         /<title>Not Found/.test(body)
}

module.exports = { SPA_DOMAINS, fetchBody, isNotFoundBody, TIMEOUT_MS, USER_AGENT }
