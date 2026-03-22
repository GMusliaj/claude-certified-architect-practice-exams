#!/usr/bin/env node
/**
 * screenshot.js — capture all app routes and inject screenshots into README.md
 *
 * Usage:
 *   npm run screenshot
 *
 * What it does:
 *   1. Builds the app (vite build)
 *   2. Starts the static server on an ephemeral port
 *   3. Uses Playwright/Chromium to screenshot every route
 *   4. Saves PNGs to screenshots/
 *   5. Replaces the ## Screenshots section in README.md
 */

const { chromium }  = require('playwright')
const { spawnSync, spawn } = require('child_process')
const path  = require('path')
const fs    = require('fs')

const ROOT  = path.join(__dirname, '..')
const PORT  = 3097
const BASE  = `http://localhost:${PORT}`
const OUT   = path.join(ROOT, 'screenshots')

// App uses HashRouter — all routes prefixed with /#/
const ROUTES = [
  { file: '01-home.png',          path: '/#/',                  caption: 'Home — exam cards with score history badges' },
  { file: '02-exam-start.png',    path: '/#/exam/foundations',  caption: 'Start screen — Exam Mode / Study Mode toggle with domain weights' },
  { file: '03-exam-study.png',    path: '/#/exam/foundations',  caption: 'Start screen — Study Mode selected',
    action: async page => {
      await page.waitForSelector('.mode-toggle', { timeout: 20000 })
      await page.locator('.mode-opt').nth(1).click()
    }
  },
  { file: '04-exam-question.png', path: '/#/exam/foundations',  caption: 'Question screen — domain pill, options, progress bar, timer',
    action: async page => {
      await page.waitForSelector('.mode-toggle', { timeout: 20000 })
      await page.locator('.btn-primary').click()
      await page.waitForSelector('.question-text', { timeout: 15000 })
    }
  },
  { file: '05-exam-answered.png', path: '/#/exam/foundations',  caption: 'Question screen — answer selected with explanation and Background panel',
    action: async page => {
      await page.waitForSelector('.mode-toggle', { timeout: 20000 })
      await page.locator('.btn-primary').click()
      await page.waitForSelector('.question-text', { timeout: 15000 })
      await page.locator('.option').first().click()
      await page.waitForSelector('.explanation', { timeout: 10000 })
    }
  },
  { file: '06-history.png',       path: '/#/history',           caption: 'History — attempt log with stats bar (empty state)' },
  { file: '07-analytics.png',     path: '/#/analytics',         caption: 'Analytics — domain performance, score trends (empty state)' },
]

async function waitForServer (url, retries = 20) {
  const http = require('http')
  for (let i = 0; i < retries; i++) {
    await new Promise(r => setTimeout(r, 300))
    try {
      await new Promise((res, rej) => {
        http.get(url, r => res(r)).on('error', rej)
      })
      return
    } catch { /* keep trying */ }
  }
  throw new Error(`Server did not start at ${url}`)
}

async function main () {
  // 1. Build
  console.log('▸ Building app…')
  const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true })
  if (build.status !== 0) { console.error('Build failed'); process.exit(1) }

  // 2. Start server
  console.log(`▸ Starting server on :${PORT}…`)
  const server = spawn('node', ['scripts/serve.js', 'dist', String(PORT)], {
    cwd: ROOT, stdio: 'ignore', detached: false,
  })
  await waitForServer(BASE)

  // 3. Ensure output dir
  fs.mkdirSync(OUT, { recursive: true })

  // 4. Screenshot
  console.log('▸ Launching Chromium…')
  const browser = await chromium.launch()
  const shots   = []

  for (const route of ROUTES) {
    const ctx  = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: 'dark',
    })
    const page = await ctx.newPage()

    console.log(`  → ${route.file}  (${route.path})`)
    await page.goto(`${BASE}${route.path}`)
    // Wait for React to fully hydrate — dynamic JSON imports resolve after initial render
    await page.waitForTimeout(1500)

    if (route.action) await route.action(page)

    // Let CSS transitions settle
    await page.waitForTimeout(500)

    const dest = path.join(OUT, route.file)
    await page.screenshot({ path: dest, fullPage: false })
    shots.push(route)

    await ctx.close()
  }

  await browser.close()
  server.kill()
  console.log(`▸ Saved ${shots.length} screenshots to screenshots/`)

  // 5. Update README
  updateReadme(shots)
}

function updateReadme (shots) {
  const readmePath = path.join(ROOT, 'README.md')
  let readme = fs.readFileSync(readmePath, 'utf8')

  const lines = [
    '## Screenshots\n',
    ...shots.map(s =>
      `<img src="screenshots/${s.file}" width="640" alt="${s.caption}">\n\n*${s.caption}*\n`
    ),
  ]
  const section = lines.join('\n')

  if (readme.includes('## Screenshots')) {
    // Replace existing section (everything up to the next ## or end of file)
    readme = readme.replace(/## Screenshots[\s\S]*?(?=\n## |\n---\n|$)/, section + '\n')
  } else {
    // Insert before ## Prerequisites
    readme = readme.replace('## Prerequisites', section + '\n---\n\n## Prerequisites')
  }

  fs.writeFileSync(readmePath, readme)
  console.log('▸ README.md updated with screenshots')
}

main().catch(e => { console.error(e); process.exit(1) })
