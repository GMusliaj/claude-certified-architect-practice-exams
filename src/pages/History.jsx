import { useState } from 'react'
import { Link } from 'react-router-dom'
import { loadHistory, clearHistory } from '../lib/storage'
import exams from '../data/exams.json'
import { fmtTime } from '../lib/format'
import ThemeToggle from '../components/ThemeToggle'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function History() {
  const [filter, setFilter]   = useState('all')
  const [history, setHistory] = useState(loadHistory)

  const filtered = filter === 'all' ? history : history.filter(h => h.examId === filter)

  const totalAttempts = history.length
  const passCount     = history.filter(h => h.pass).length
  const passRate      = totalAttempts ? Math.round((passCount / totalAttempts) * 100) : 0
  const avgScore      = totalAttempts ? Math.round(history.reduce((a, h) => a + h.pct, 0) / totalAttempts) : 0
  const bestScore     = totalAttempts ? Math.max(...history.map(h => h.pct)) : 0

  function handleClear() {
    if (window.confirm('Clear all exam history? This cannot be undone.')) {
      clearHistory(); setHistory([])
    }
  }

  return (
    <div className="history-page">
      <div className="page-nav">
        <div>
          <Link to="/" className="btn btn-ghost" style={{ marginRight: '.5rem' }}>← Exams</Link>
          <Link to="/analytics" className="btn btn-ghost">Analytics</Link>
        </div>
        <div className="page-nav-actions">
          <ThemeToggle />
        </div>
        {history.length > 0 && (
          <button className="btn btn-ghost" onClick={handleClear} style={{ color: 'var(--red)' }}>
            Clear History
          </button>
        )}
      </div>

      <div className="page-header">
        <h1>Exam History</h1>
        <p>Every attempt you've completed across all exams.</p>
      </div>

      {history.length === 0 ? (
        <div className="empty-state">
          <p>No attempts yet.</p>
          <p><Link to="/">Start an exam</Link> to begin tracking your progress.</p>
        </div>
      ) : (
        <>
          <div className="stats-bar">
            <div className="stat-box"><span className="stat-box-val">{totalAttempts}</span><span className="stat-box-label">Total Attempts</span></div>
            <div className="stat-box"><span className="stat-box-val" style={{ color: 'var(--green)' }}>{passCount}</span><span className="stat-box-label">Passed</span></div>
            <div className="stat-box"><span className="stat-box-val">{passRate}%</span><span className="stat-box-label">Pass Rate</span></div>
            <div className="stat-box"><span className="stat-box-val">{avgScore}%</span><span className="stat-box-label">Avg Score</span></div>
            <div className="stat-box"><span className="stat-box-val" style={{ color: 'var(--accent)' }}>{bestScore}%</span><span className="stat-box-label">Best Score</span></div>
          </div>

          <div className="filter-tabs">
            <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              All ({history.length})
            </button>
            {exams.map(e => {
              const count = history.filter(h => h.examId === e.id).length
              if (!count) return null
              return (
                <button
                  key={e.id}
                  className={`filter-tab ${filter === e.id ? 'active' : ''}`}
                  style={filter === e.id ? { '--accent': e.accent, '--accent-dim': e.accentDim } : {}}
                  onClick={() => setFilter(e.id)}
                >
                  {e.badge} ({count})
                </button>
              )
            })}
          </div>

          <div className="attempt-list">
            {filtered.map(attempt => {
              const exam = exams.find(e => e.id === attempt.examId)
              const accent = exam?.accent ?? 'var(--accent)'
              return (
                <div key={attempt.id} className="attempt-card">
                  <div className={`attempt-score-badge ${attempt.pass ? 'pass' : 'fail'}`}>
                    {attempt.pct}%
                    <span>{attempt.pass ? 'PASS' : 'FAIL'}</span>
                  </div>

                  <div className="attempt-info">
                    <div className="attempt-title">{attempt.examTitle}</div>
                    <div className="attempt-date">{fmtDate(attempt.date)} · {attempt.score}/{attempt.total} correct</div>
                  </div>

                  <div className="attempt-domains">
                    {Object.entries(attempt.domainScores ?? {}).map(([name, s]) => {
                      const dp = Math.round((s.correct / s.total) * 100)
                      return (
                        <div key={name} className="attempt-domain-row">
                          <span style={{ width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {name.split(' ')[0]}
                          </span>
                          <div className="attempt-domain-bar-wrap">
                            <div
                              className={`attempt-domain-bar ${dp >= 72 ? 'good' : 'bad'}`}
                              style={{ width: `${dp}%`, background: dp >= 72 ? 'var(--green)' : 'var(--red)' }}
                            />
                          </div>
                          <span style={{ width: 32, textAlign: 'right' }}>{dp}%</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="attempt-time" style={{ '--accent': accent }}>
                    {fmtTime(attempt.elapsed)}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
