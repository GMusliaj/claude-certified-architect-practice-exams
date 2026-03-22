import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { loadHistory } from '../lib/storage'
import exams from '../data/exams.json'
import { fmtStudyTime } from '../lib/format'
import ThemeToggle from '../components/ThemeToggle'

// SVG sparkline — no library needed
function Sparkline({ points }) {
  if (points.length < 2) return <span style={{ color: 'var(--muted)', fontSize: '.8rem' }}>Not enough data</span>
  const W = 160, H = 44
  const min = Math.min(...points, 0)
  const max = Math.max(...points, 100)
  const range = max - min || 1
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map(p => H - ((p - min) / range) * H * 0.85)
  const polyPoints = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  const last = points[points.length - 1]
  const lastColor = last >= 72 ? 'var(--green)' : 'var(--red)'
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <polyline points={polyPoints} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r="3"
          fill={i === points.length - 1 ? lastColor : 'var(--surface2)'}
          stroke={i === points.length - 1 ? lastColor : 'var(--accent)'}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  )
}

export default function Analytics() {
  const history = loadHistory()

  const stats = useMemo(() => {
    if (!history.length) return null
    const totalTime    = history.reduce((a, h) => a + (h.elapsed ?? 0), 0)
    const totalAnswered= history.reduce((a, h) => a + h.total, 0)
    const passRate     = Math.round((history.filter(h => h.pass).length / history.length) * 100)
    const avgScore     = Math.round(history.reduce((a, h) => a + h.pct, 0) / history.length)
    return { totalTime, totalAnswered, passRate, avgScore, attempts: history.length }
  }, [history])

  // Aggregate domain performance across all attempts
  const domainPerf = useMemo(() => {
    const map = {}
    history.forEach(h => {
      Object.entries(h.domainScores ?? {}).forEach(([name, s]) => {
        if (!map[name]) map[name] = { correct: 0, total: 0 }
        map[name].correct += s.correct
        map[name].total   += s.total
      })
    })
    return Object.entries(map)
      .map(([name, s]) => ({ name, pct: Math.round((s.correct / s.total) * 100), correct: s.correct, total: s.total }))
      .sort((a, b) => a.pct - b.pct)
  }, [history])

  // Per-question difficulty (questions that appeared ≥2 times)
  const questionDiff = useMemo(() => {
    const map = {}
    history.forEach(h => {
      (h.questionResults ?? []).forEach(r => {
        if (!map[r.id]) map[r.id] = { correct: 0, total: 0, text: r.text, domain: r.domain, pattern: r.pattern }
        map[r.id].correct += r.correct ? 1 : 0
        map[r.id].total   += 1
      })
    })
    return Object.entries(map)
      .filter(([, v]) => v.total >= 2)
      .map(([id, v]) => ({ id, ...v, rate: Math.round((v.correct / v.total) * 100) }))
  }, [history])

  const hardest = [...questionDiff].sort((a, b) => a.rate - b.rate).slice(0, 8)
  const easiest = [...questionDiff].sort((a, b) => b.rate - a.rate).slice(0, 5)

  // Score trend per exam
  const trends = useMemo(() => {
    return exams
      .map(exam => {
        const attempts = history.filter(h => h.examId === exam.id).slice(0, 10).reverse()
        return { exam, points: attempts.map(h => h.pct), avg: attempts.length ? Math.round(attempts.reduce((a, h) => a + h.pct, 0) / attempts.length) : 0 }
      })
      .filter(t => t.points.length > 0)
  }, [history])

  return (
    <div className="analytics-page">
      <div className="page-nav">
        <div>
          <Link to="/" className="btn btn-ghost" style={{ marginRight: '.5rem' }}>← Exams</Link>
          <Link to="/history" className="btn btn-ghost">History</Link>
        </div>
        <div className="page-nav-actions">
          <ThemeToggle />
        </div>
      </div>

      <div className="page-header">
        <h1>Analytics</h1>
        <p>Aggregated insights across all your exam attempts.</p>
      </div>

      {!history.length ? (
        <div className="empty-state">
          <p>No data yet.</p>
          <p><Link to="/">Complete an exam</Link> to see analytics.</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="analytics-grid" style={{ marginBottom: '2rem' }}>
            <div className="analytics-stat-box"><div className="val">{stats.attempts}</div><div className="lbl">Total Attempts</div></div>
            <div className="analytics-stat-box"><div className="val">{stats.avgScore}%</div><div className="lbl">Average Score</div></div>
            <div className="analytics-stat-box"><div className="val" style={{ color: 'var(--green)' }}>{stats.passRate}%</div><div className="lbl">Pass Rate</div></div>
            <div className="analytics-stat-box"><div className="val">{stats.totalAnswered.toLocaleString()}</div><div className="lbl">Questions Answered</div></div>
            <div className="analytics-stat-box"><div className="val">{fmtStudyTime(stats.totalTime)}</div><div className="lbl">Total Study Time</div></div>
          </div>

          {/* Domain performance */}
          <div className="analytics-section">
            <h2>Domain Performance</h2>
            <div className="domain-perf-grid">
              {domainPerf.map(d => {
                const cls = d.pct >= 80 ? 'good' : d.pct >= 60 ? 'ok' : 'bad'
                const color = d.pct >= 80 ? 'var(--green)' : d.pct >= 60 ? 'var(--accent)' : 'var(--red)'
                return (
                  <div key={d.name} className="domain-perf-card">
                    <div className="domain-perf-name">{d.name}</div>
                    <div className="domain-perf-bar-wrap">
                      <div className={`domain-perf-bar ${cls}`} style={{ width: `${d.pct}%` }} />
                    </div>
                    <div className="domain-perf-meta">
                      <span>{d.correct}/{d.total} correct</span>
                      <span style={{ color, fontWeight: 600 }}>{d.pct}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Questions you struggle with */}
          {hardest.length > 0 && (
            <div className="analytics-section">
              <h2>Questions You Find Hardest</h2>
              <div className="question-diff-list">
                {hardest.map(q => (
                  <div key={q.id} className="diff-item">
                    <span className={`diff-rate ${q.rate < 50 ? 'bad' : 'good'}`}>{q.rate}%</span>
                    <div className="diff-body">
                      <div className="diff-text">{q.text}</div>
                      <div className="diff-meta">{q.domain} · {q.pattern}</div>
                    </div>
                    <span className="diff-attempts">{q.correct}/{q.total} correct</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Questions you find easiest */}
          {easiest.length > 0 && (
            <div className="analytics-section">
              <h2>Your Strongest Questions</h2>
              <div className="question-diff-list">
                {easiest.map(q => (
                  <div key={q.id} className="diff-item">
                    <span className="diff-rate good">{q.rate}%</span>
                    <div className="diff-body">
                      <div className="diff-text">{q.text}</div>
                      <div className="diff-meta">{q.domain} · {q.pattern}</div>
                    </div>
                    <span className="diff-attempts">{q.correct}/{q.total} correct</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score trends */}
          {trends.length > 0 && (
            <div className="analytics-section">
              <h2>Score Trends</h2>
              <div className="trend-grid">
                {trends.map(({ exam, points, avg }) => (
                  <div key={exam.id} className="trend-card" style={{ '--accent': exam.accent }}>
                    <div className="trend-card-header">
                      <span className="trend-card-title">{exam.badge}</span>
                      <span className="trend-card-avg">avg {avg}%</span>
                    </div>
                    <Sparkline points={points} />
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: '.4rem' }}>
                      {points.length} attempt{points.length !== 1 ? 's' : ''} · latest: {points[points.length - 1]}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {questionDiff.length === 0 && (
            <div className="analytics-section">
              <h2>Question Difficulty</h2>
              <div className="empty-state" style={{ padding: '2rem' }}>
                <p>Complete at least 2 attempts to see per-question difficulty data.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
