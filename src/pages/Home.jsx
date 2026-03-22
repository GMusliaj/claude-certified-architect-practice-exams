import { Link } from 'react-router-dom'
import exams from '../data/exams.json'
import { loadProgress, loadHistory } from '../lib/storage'

function ExamCard({ exam, bestPct, attemptCount }) {
  const saved = loadProgress(exam.id)
  const total = Object.values(exam.selection).reduce((a, b) => a + b, 0)

  return (
    <Link
      to={`/exam/${exam.id}`}
      className="exam-card"
      style={{ '--accent': exam.accent, '--accent-dim': exam.accentDim }}
    >
      <div className="card-accent" />
      <div className="card-body">
        <div className="card-top">
          <span className="card-title">{exam.title}</span>
          <span className="card-badge">{exam.badge}</span>
        </div>
        <p className="card-desc">{exam.description}</p>
        <div className="card-meta">
          <span className="card-stat"><strong>{exam.timeLimitMin} min</strong> practice</span>
          <span className="card-stat"><strong>{exam.officialTimeLimitMin} min</strong> official</span>
          <span className="card-stat">Pass: <strong>{exam.passMark}%</strong></span>
        </div>
        <div className="card-footer-row">
          {attemptCount > 0 ? (
            <span className="history-pill">
              <span className={`dot-history ${bestPct >= exam.passMark ? 'pass' : 'fail'}`} />
              Best: <strong>{bestPct}%</strong> · {attemptCount} attempt{attemptCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="history-pill not-started">Not started</span>
          )}
          {saved && (
            <span className="progress-pill">
              <span className="dot-saved" />
              Q{saved.current + 1}/{total} in progress
            </span>
          )}
        </div>
      </div>
      <div className="card-arrow">→</div>
    </Link>
  )
}

export default function Home() {
  const history = loadHistory()
  const examStats = {}
  for (const h of history) {
    if (!examStats[h.examId]) examStats[h.examId] = { best: 0, count: 0 }
    examStats[h.examId].count++
    if (h.pct > examStats[h.examId].best) examStats[h.examId].best = h.pct
  }

  return (
    <div className="home">
      <header className="home-header">
        <nav className="header-nav">
          <Link to="/history">History</Link>
          <Link to="/analytics">Analytics</Link>
          <a href="/backlog.html">Backlog</a>
        </nav>
<h1 className="home-title">Claude Certified Architect</h1>
        <p className="home-subtitle">
          Practice exams grounded in The Architect's Playbook and the official Foundations Exam Guide.
          Every question maps to a named production pattern.
        </p>
      </header>

      <div className="page-wrap" style={{ paddingTop: '1rem' }}>
        <p className="section-label" style={{ padding: 0 }}>Exams</p>
        <div className="exam-grid" style={{ padding: 0, marginBottom: '2rem' }}>
          {exams.map(exam => (
          <ExamCard
            key={exam.id}
            exam={exam}
            bestPct={examStats[exam.id]?.best ?? 0}
            attemptCount={examStats[exam.id]?.count ?? 0}
          />
        ))}
        </div>

        <div className="tips">
          <h3>Study Notes</h3>
          <div className="tip-list">
            <div className="tip">
              <span className="tip-icon">·</span>
              <span>After answering, read the <strong>Background</strong> panel — it explains the underlying concept, not just why the correct option wins.</span>
            </div>
            <div className="tip">
              <span className="tip-icon">·</span>
              <span>Progress is auto-saved — close the tab and resume exactly where you left off.</span>
            </div>
            <div className="tip">
              <span className="tip-icon">·</span>
              <span>Focus on <em>why wrong answers are wrong</em>. The exam tests your ability to reject plausible-sounding distractors.</span>
            </div>
            <div className="tip">
              <span className="tip-icon">·</span>
              <span>The <strong>History</strong> and <strong>Analytics</strong> pages track your progress and surface the questions you find hardest.</span>
            </div>
          </div>
        </div>
      </div>

      <footer className="site-footer">
        <p>This is a <strong>personal hobby project</strong> — not affiliated with or endorsed by Anthropic.</p>
        <p>
          Practice questions are AI-generated and unverified. Always consult the{' '}
          <a href="https://docs.anthropic.com" target="_blank" rel="noopener">official Anthropic documentation</a>{' '}
          before sitting any certification exam.
        </p>
        <p>
          <a href="/DISCLAIMER.md">Disclaimer</a>
          {' · '}
          <a href="/LICENSE.md">License (MIT-0)</a>
        </p>
      </footer>
    </div>
  )
}
