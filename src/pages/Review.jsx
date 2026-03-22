import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { loadHistory } from '../lib/storage'
import { fmtTime, fmtDate, getWeakDomains, OPT_LABEL } from '../lib/format'
import exams from '../data/exams.json'
import ThemeToggle from '../components/ThemeToggle'

export default function Review() {
  const { attemptId } = useParams()
  const navigate      = useNavigate()
  const [expanded, setExpanded] = useState(null)

  const attempt = useMemo(() => loadHistory().find(h => h.id === attemptId), [attemptId])
  if (!attempt) {
    return (
      <div className="page-center">
        Attempt not found. <Link to="/history">← History</Link>
      </div>
    )
  }

  const exam        = exams.find(e => e.id === attempt.examId)
  const accentStyle = exam ? { '--accent': exam.accent, '--accent-dim': exam.accentDim } : {}
  const questions   = attempt.questionResults ?? []

  // Domain breakdown for weak-area drill
  const domainScores = attempt.domainScores ?? {}
  const weakDomains  = getWeakDomains(domainScores)

  function drillWeakAreas() {
    if (exam) navigate(`/exam/${exam.id}?s=${Date.now()}`, { state: { drillDomains: weakDomains } })
  }

  const correctCount = questions.filter(q => q.correct).length

  return (
    <div className="history-page" style={accentStyle}>
      <div className="page-nav">
        <div>
          <Link to="/history" className="btn btn-ghost" style={{ marginRight: '.5rem' }}>← History</Link>
        </div>
        <div className="page-nav-actions">
          <ThemeToggle />
        </div>
      </div>

      <div className="page-header">
        <h1>Attempt Review</h1>
        <p>{attempt.examTitle} · {fmtDate(attempt.date)}</p>
      </div>

      {/* Summary row */}
      <div className="stats-bar" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-box">
          <span className="stat-box-val" style={{ color: attempt.pass ? 'var(--green)' : 'var(--red)' }}>
            {attempt.pct}%
          </span>
          <span className="stat-box-label">{attempt.pass ? 'PASS' : 'FAIL'}</span>
        </div>
        <div className="stat-box">
          <span className="stat-box-val">{correctCount}/{attempt.total}</span>
          <span className="stat-box-label">Correct</span>
        </div>
        <div className="stat-box">
          <span className="stat-box-val">{fmtTime(attempt.elapsed)}</span>
          <span className="stat-box-label">Time</span>
        </div>
        {weakDomains.length > 0 && (
          <div className="stat-box">
            <button className="btn btn-drill" onClick={drillWeakAreas} style={{ fontSize: '.82rem' }}>
              Drill Weak Areas ({weakDomains.length})
            </button>
          </div>
        )}
      </div>

      {/* Domain breakdown */}
      <div className="breakdown" style={{ marginBottom: '1.5rem' }}>
        <h3>Domain Breakdown</h3>
        {Object.entries(domainScores).map(([name, s]) => {
          const dp = Math.round((s.correct / s.total) * 100)
          return (
            <div key={name} className="domain-row">
              <span className="domain-name">{name}</span>
              <div className="domain-bar-wrap">
                <div
                  className={`domain-bar ${dp >= (exam?.passMark ?? 72) ? 'good' : 'bad'}`}
                  style={{ width: `${dp}%` }}
                />
              </div>
              <span className="domain-score">{s.correct}/{s.total} · {dp}%</span>
            </div>
          )
        })}
      </div>

      {/* Question-by-question review */}
      <div className="breakdown">
        <h3>Question Review ({questions.length})</h3>
        {questions.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: '.88rem', padding: '1rem 0' }}>
            Detailed question data not available for this attempt. Future attempts will include full review.
          </p>
        )}
        {questions.map((q, idx) => {
          const isOpen   = expanded === idx
          const hasDetail = q.options?.length > 0

          return (
            <div key={q.id ?? idx} className={`review-item ${q.correct ? 'bi-correct' : 'bi-wrong'}`}>
              {/* Header row — always visible */}
              <button
                className="review-header"
                onClick={() => hasDetail && setExpanded(isOpen ? null : idx)}
                disabled={!hasDetail}
                aria-expanded={isOpen}
              >
                <span className={`bi-icon ${q.correct ? '' : 'wrong'}`}>
                  {q.correct ? '✓' : '✗'}
                </span>
                <span className="review-q-text" dangerouslySetInnerHTML={{ __html: q.text }} />
                <span className="review-domain-pill">{q.domain?.split(' ')[0]}</span>
                {hasDetail && (
                  <span className="review-chevron">{isOpen ? '▲' : '▼'}</span>
                )}
              </button>

              {/* Expanded detail */}
              {isOpen && hasDetail && (
                <div className="review-detail">
                  <div className="review-options">
                    {q.options.map((opt, i) => {
                      let cls = 'review-option'
                      if (i === q.answer)   cls += ' review-opt-correct'
                      if (i === q.selected && !q.correct) cls += ' review-opt-wrong'
                      return (
                        <div key={i} className={cls}>
                          <span className="option-key">{OPT_LABEL[i]}</span>
                          <span dangerouslySetInnerHTML={{ __html: opt }} />
                          {i === q.answer && <span className="review-opt-tag correct-tag">correct</span>}
                          {i === q.selected && !q.correct && <span className="review-opt-tag your-tag">your answer</span>}
                        </div>
                      )
                    })}
                  </div>

                  {q.explanation && (
                    <div className="explanation" style={{ marginTop: '.75rem' }}>
                      <p dangerouslySetInnerHTML={{ __html: q.explanation }} />
                      <div className="pattern-tag">Pattern: {q.pattern}</div>
                      {q.background && (
                        <div className="question-bg">
                          <strong>Background</strong>
                          <p dangerouslySetInnerHTML={{ __html: q.background }} />
                        </div>
                      )}
                      {q.refs?.length > 0 && (
                        <div className="ref-links">
                          <span className="ref-links-label">Official Docs</span>
                          {q.refs.map((r, i) => (
                            <a key={i} href={r.url} target="_blank" rel="noopener" className="ref-link">{r.label}</a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="save-row" style={{ marginTop: '1.5rem' }}>
        {weakDomains.length > 0 && (
          <button className="btn btn-drill" onClick={drillWeakAreas}>
            Drill Weak Areas ({weakDomains.length})
          </button>
        )}
        <Link to="/history" className="btn btn-primary">← History</Link>
      </div>
    </div>
  )
}
