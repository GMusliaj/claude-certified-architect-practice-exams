import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import exams from '../data/exams.json'
import { loadQuestions } from '../lib/loadQuestions'
import { buildExam, buildDrillExam } from '../lib/buildExam'
import { saveProgress, loadProgress, clearProgress, saveResult } from '../lib/storage'
import { fmtTime, calcDomainScores } from '../lib/format'

const OPT_LABEL = ['A', 'B', 'C', 'D']

// Always-current ref — avoids stale closures in intervals/effects
function useLatest(value) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

// ── Start Screen ──────────────────────────────────────────────────────────────
function StartScreen({ exam, savedState, drillDomains, onStart, onResume }) {
  const [study, setStudy] = useState(false)
  const total = drillDomains ? 10 : Object.values(exam.selection).reduce((a, b) => a + b, 0)
  return (
    <div className="start-screen">
      <div className="start-inner">
        <p className="start-label">{drillDomains ? 'Weak-Area Drill' : 'Practice Exam'}</p>
        <h2>{exam.title}</h2>

        {drillDomains ? (
          <div className="drill-notice">
            <p className="drill-notice-title">Targeting your weak domains</p>
            <ul className="drill-domain-list">
              {drillDomains.map(d => <li key={d}>{d}</li>)}
            </ul>
            <p className="drill-notice-sub">10 questions · no pass/fail verdict · not saved to history</p>
          </div>
        ) : (
          <>
            <div className="meta-grid">
              <div className="meta-item"><span className="mi-label">Practice</span><span className="mi-val">{exam.timeLimitMin} min</span></div>
              <div className="meta-item"><span className="mi-label">Official</span><span className="mi-val">{exam.officialTimeLimitMin} min</span></div>
              <div className="meta-item"><span className="mi-label">Questions</span><span className="mi-val">{total}</span></div>
              <div className="meta-item"><span className="mi-label">Pass Mark</span><span className="mi-val">{exam.passMark}%</span></div>
            </div>

            <div className="dw-wrap">
              <p className="dw-title">Domain Weights</p>
              {exam.domains.map(d => (
                <div key={d.name} className="dw-row">
                  <span className="dw-label">{d.name}</span>
                  <div className="dw-bar-wrap"><div className="dw-bar" style={{ width: `${d.weight}%` }} /></div>
                  <span className="dw-pct">{d.weight}%</span>
                </div>
              ))}
            </div>

            <div className="mode-toggle">
              <label className={`mode-opt ${!study ? 'active' : ''}`}>
                <input type="radio" name="mode" checked={!study} onChange={() => setStudy(false)} />
                <span className="mode-opt-label">Exam Mode</span>
                <span className="mode-opt-desc">Timed · pass/fail verdict · saved to history</span>
              </label>
              <label className={`mode-opt ${study ? 'active' : ''}`}>
                <input type="radio" name="mode" checked={study} onChange={() => setStudy(true)} />
                <span className="mode-opt-label">Study Mode</span>
                <span className="mode-opt-desc">No timer · explanations first · not saved to history</span>
              </label>
            </div>
          </>
        )}

        {!drillDomains && !study && savedState && (
          <div className="resume-bar">
            <span className="resume-bar-text">
              In progress · Q{savedState.current + 1}/{total} · {savedState.answers.filter(Boolean).length} answered · {fmtTime(savedState.elapsed)} elapsed
            </span>
            <button className="btn btn-ghost" onClick={onResume}>Resume</button>
          </div>
        )}

        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => onStart(study || !!drillDomains)}>
            {drillDomains ? 'Start Drill' : study ? 'Start Study' : savedState ? 'Start Fresh' : 'Start Exam'}
          </button>
          <Link to="/" className="btn btn-ghost">← Exams</Link>
        </div>
      </div>
    </div>
  )
}

// ── Question Screen ───────────────────────────────────────────────────────────
function QuestionScreen({ exam, questions, current, answers, elapsed, studyMode, paused, onSelect, onNext, onBack, onPause, onUnpause }) {
  const q       = questions[current]
  const answer  = answers[current]
  const answered = answer !== undefined
  const remaining = exam.timeLimitMin * 60 - elapsed
  const warn      = remaining <= exam.warnSecs

  function optClass(i) {
    if (!answered) return 'option'
    if (i === q.answer) return 'option correct'
    if (i === answer.selected) return 'option wrong'
    return 'option disabled'
  }

  return (
    <div className="exam-page">
      <div className="exam-header">
        <Link to="/" className="back-link">← Exams</Link>
        <div className="progress-wrap">
          <div className="progress-meta">
            <span>{current + 1} / {questions.length}</span>
            {studyMode ? (
              <span className="mode-badge-study">Study</span>
            ) : (
              <span className={`timer${warn ? ' warn' : ''}`}>
                {paused ? 'Paused' : remaining <= 0 ? 'Time up' : fmtTime(remaining)}
              </span>
            )}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(current / questions.length) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="page-wrap question-wrap">
        {paused ? (
          <div className="pause-overlay">
            <div className="pause-icon">⏸</div>
            <h2 className="pause-title">Exam Paused</h2>
            <p className="pause-sub">Your progress is saved. The timer is stopped.</p>
            <button className="btn btn-primary" onClick={onUnpause}>Resume Exam</button>
          </div>
        ) : (<>
        <div className="card">
          <div className="q-meta">
            <span className="domain-pill">{q.domain}</span>
            <span className="question-number">Q{current + 1}</span>
          </div>
          <p className="question-text" dangerouslySetInnerHTML={{ __html: q.text }} />

          <div className="options">
            {q.options.map((opt, i) => (
              <button key={i} className={optClass(i)} onClick={() => onSelect(i)}>
                <span className="option-key">{OPT_LABEL[i]}</span>
                <span className="option-text" dangerouslySetInnerHTML={{ __html: opt }} />
              </button>
            ))}
          </div>

          {answered && (
            <div className="explanation">
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

        <div className="btn-row">
          <button className="btn btn-ghost" onClick={onBack} disabled={current === 0}>← Back</button>
          {!studyMode && (
            <button className="btn btn-ghost btn-pause-row" onClick={onPause}>⏸ Pause</button>
          )}
          <button className="btn btn-primary" onClick={onNext} disabled={!answered}>
            {current + 1 === questions.length ? 'Finish' : 'Next →'}
          </button>
        </div>
        </>
      )}
      </div>
    </div>
  )
}

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ pct, pass }) {
  const r = 52
  const c = 2 * Math.PI * r
  const color = pass ? 'var(--green)' : 'var(--red)'
  return (
    <svg viewBox="0 0 120 120" className="score-ring">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface2)" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={r} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="56" textAnchor="middle" fill={color} fontSize="22" fontWeight="700" fontFamily="system-ui,sans-serif">{pct}%</text>
      <text x="60" y="74" textAnchor="middle" fill={color} fontSize="11" fontWeight="600" fontFamily="system-ui,sans-serif" letterSpacing="1">{pass ? 'PASS' : 'FAIL'}</text>
    </svg>
  )
}

// ── Results Screen ────────────────────────────────────────────────────────────
function ResultsScreen({ exam, questions, answers, elapsed, studyMode, onRetake, onHome, onDrill }) {
  const correct = answers.filter(a => a?.correct).length
  const total   = questions.length
  const pct     = Math.round((correct / total) * 100)
  const pass    = pct >= exam.passMark
  const withinOfficial = elapsed <= exam.officialTimeLimitMin * 60

  const domainScores = calcDomainScores(questions, answers)

  const weakDomains = Object.entries(domainScores)
    .filter(([, s]) => Math.round((s.correct / s.total) * 100) < 75)
    .map(([name]) => name)

  function saveJSON() {
    const data = {
      exam: exam.title, date: new Date().toISOString(), durationSec: elapsed,
      score: { correct, total, pct, pass },
      domains: Object.entries(domainScores).map(([name, s]) => ({
        name, correct: s.correct, total: s.total, pct: Math.round((s.correct / s.total) * 100),
      })),
      questions: questions.map((q, i) => ({
        id: q.id,
        text: q.text.replace(/<[^>]+>/g, '').slice(0, 120),
        correct: answers[i]?.correct ?? false,
        selected: q.options[answers[i]?.selected] ?? null,
        correctAnswer: q.options[q.answer],
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${exam.id}-${Date.now()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page-wrap results">
      <div className="results-header">
        {studyMode ? (
          <div className="study-results-badge">
            <div className="study-results-pct">{pct}%</div>
            <div className="study-results-label">Study Session</div>
          </div>
        ) : (
          <ScoreRing pct={pct} pass={pass} />
        )}
        <div className="results-summary">
          {studyMode ? (
            <div className="verdict study">Learning Summary</div>
          ) : (
            <div className={`verdict ${pass ? 'pass' : 'fail'}`}>{pass ? 'Passed' : 'Not Yet'}</div>
          )}
          <div className="results-score">{correct} / {total} correct</div>
          <div className="results-meta">
            <span>Time taken: {fmtTime(elapsed)}</span>
            {!studyMode && (
              <span className={withinOfficial ? 'within-limit' : 'over-limit'}>
                {withinOfficial
                  ? `✓ Under ${exam.officialTimeLimitMin}min official limit`
                  : `⚠ Over ${exam.officialTimeLimitMin}min official limit`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="breakdown">
        <h3>Domain Breakdown</h3>
        {Object.entries(domainScores).map(([name, s]) => {
          const dp = Math.round((s.correct / s.total) * 100)
          return (
            <div key={name} className="domain-row">
              <span className="domain-name">{name}</span>
              <div className="domain-bar-wrap">
                <div className={`domain-bar ${dp >= exam.passMark ? 'good' : 'bad'}`} style={{ width: `${dp}%` }} />
              </div>
              <span className="domain-score">{s.correct}/{s.total} · {dp}%</span>
            </div>
          )
        })}
      </div>

      <div className="save-row">
        <button className="btn btn-ghost" onClick={saveJSON}>Save Results (JSON)</button>
        <button className="btn btn-ghost" onClick={onRetake}>Retake</button>
        {weakDomains.length > 0 && (
          <button className="btn btn-drill" onClick={() => onDrill(weakDomains)}>
            Drill Weak Areas ({weakDomains.length})
          </button>
        )}
        <button className="btn btn-primary" onClick={onHome}>← All Exams</button>
      </div>

      <div className="breakdown">
        <h3>Question Review</h3>
        {questions.map((q, i) => {
          const ans = answers[i]
          return (
            <div key={q.id} className={`breakdown-item ${ans?.correct ? 'bi-correct' : 'bi-wrong'}`}>
              <span className="bi-icon">{ans?.correct ? '✓' : '✗'}</span>
              <div className="bi-body">
                <span className="bi-q" dangerouslySetInnerHTML={{ __html: q.text }} />
                {!ans?.correct && (
                  <div className="bi-ans">
                    <span className="bi-label">Correct:</span>
                    <span dangerouslySetInnerHTML={{ __html: q.options[q.answer] }} />
                  </div>
                )}
                <span className="bi-domain">{q.domain}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Exam Controller ───────────────────────────────────────────────────────────
export default function Exam() {
  const { examId }   = useParams()
  const navigate     = useNavigate()
  const location     = useLocation()
  const drillDomains = location.state?.drillDomains ?? null
  const exam         = exams.find(e => e.id === examId)

  const [phase,     setPhase]     = useState('loading')
  const [questions, setQuestions] = useState([])
  const [current,   setCurrent]   = useState(0)
  const [answers,   setAnswers]   = useState([])
  const [elapsed,   setElapsed]   = useState(0)
  const [bank,      setBank]      = useState([])
  const [studyMode, setStudyMode] = useState(false)
  const [paused,    setPaused]    = useState(false)

  const timerRef    = useRef(null)
  const startRef    = useRef(null)
  const answersRef  = useLatest(answers)
  const questionsRef= useLatest(questions)
  const elapsedRef  = useLatest(elapsed)

  // Load questions on mount
  useEffect(() => {
    if (!exam) return
    loadQuestions(exam.questionFile).then(b => {
      setBank(b)
      const qs = drillDomains
        ? buildDrillExam(b, drillDomains, 10)
        : buildExam(b, exam.selection)
      setQuestions(qs)
      setPhase('start')
    })
    return () => clearInterval(timerRef.current)
  }, [examId])

  function startTimer(initial = 0) {
    clearInterval(timerRef.current)
    startRef.current = Date.now() - initial * 1000
    timerRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - startRef.current) / 1000)
      setElapsed(e)
      // Auto-finish when time limit reached
      if (e >= exam.timeLimitMin * 60) {
        clearInterval(timerRef.current)
        doFinish()
      }
    }, 500)
  }

  // doFinish reads from refs so it always has fresh data regardless of closure age
  function doFinish() {
    clearInterval(timerRef.current)
    const finalElapsed = Math.floor((Date.now() - startRef.current) / 1000)
    const finAnswers   = answersRef.current
    const qs           = questionsRef.current

    const correct = finAnswers.filter(a => a?.correct).length
    const total   = qs.length
    const pct     = Math.round((correct / total) * 100)

    const domainScores = calcDomainScores(qs, finAnswers)

    if (!studyMode && !drillDomains) {
      saveResult({
        id: Date.now().toString(),
        examId: exam.id,
        examTitle: exam.title,
        date: new Date().toISOString(),
        score: correct, total, pct,
        pass: pct >= exam.passMark,
        elapsed: finalElapsed,
        domainScores,
        questionResults: qs.map((q, i) => ({
          id: q.id,
          correct: finAnswers[i]?.correct ?? false,
          domain: q.domain,
          pattern: q.pattern,
          text: q.text.replace(/<[^>]+>/g, '').slice(0, 120),
        })),
      })
    }

    clearProgress(exam.id)
    setElapsed(finalElapsed)
    setPhase('results')
  }

  // Auto-save progress whenever question or answers change
  useEffect(() => {
    if (phase === 'question') {
      saveProgress(exam.id, { current, answers, elapsed: elapsedRef.current })
    }
  }, [current, answers])

  const savedState = exam ? loadProgress(exam.id) : null

  function startFresh(isStudy = false) {
    if (!drillDomains) clearProgress(exam.id)
    const qs = drillDomains
      ? buildDrillExam(bank, drillDomains, 10)
      : buildExam(bank, exam.selection)
    setStudyMode(isStudy)
    setQuestions(qs)
    setCurrent(0); setAnswers([]); setElapsed(0)
    setPaused(false)
    setPhase('question')
    startTimer(0)
  }

  function drillWeakAreas(weakDomains) {
    navigate(`/exam/${exam.id}`, { state: { drillDomains: weakDomains } })
  }

  function pause() {
    clearInterval(timerRef.current)
    setPaused(true)
  }

  function unpause() {
    startTimer(elapsedRef.current)
    setPaused(false)
  }

  // ── Keyboard navigation (P2.2) ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'question' || paused) return
    function onKey(e) {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === '1') selectAnswer(0)
      else if (e.key === '2') selectAnswer(1)
      else if (e.key === '3') selectAnswer(2)
      else if (e.key === '4') selectAnswer(3)
      else if ((e.key === 'Enter' || e.key === ' ') && answersRef.current[current] !== undefined) {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, current, paused])

  function resume() {
    const s = loadProgress(exam.id)
    setCurrent(s.current); setAnswers(s.answers); setElapsed(s.elapsed)
    setPaused(false)
    setPhase('question')
    startTimer(s.elapsed)
  }

  function selectAnswer(i) {
    setAnswers(prev => {
      if (prev[current] !== undefined) return prev
      const next = [...prev]
      next[current] = { selected: i, correct: i === questionsRef.current[current].answer }
      return next
    })
  }

  function next() {
    if (current + 1 >= questions.length) doFinish()
    else setCurrent(c => c + 1)
  }

  function back() {
    if (current > 0) setCurrent(c => c - 1)
  }

  if (!exam)              return <div className="page-center">Exam not found. <Link to="/">← Back</Link></div>
  if (phase === 'loading') return <div className="page-center">Loading questions…</div>

  const accentStyle = { '--accent': exam.accent, '--accent-dim': exam.accentDim }

  if (phase === 'start')
    return <div style={accentStyle}><StartScreen exam={exam} savedState={drillDomains ? null : savedState} drillDomains={drillDomains} onStart={startFresh} onResume={resume} /></div>

  if (phase === 'question')
    return (
      <div style={accentStyle}>
        <QuestionScreen
          exam={exam} questions={questions} current={current}
          answers={answers} elapsed={elapsed} studyMode={studyMode}
          paused={paused}
          onSelect={selectAnswer} onNext={next} onBack={back}
          onPause={pause} onUnpause={unpause}
        />
      </div>
    )

  if (phase === 'results')
    return (
      <div style={accentStyle}>
        <ResultsScreen
          exam={exam} questions={questions} answers={answers} elapsed={elapsed}
          studyMode={studyMode}
          onRetake={startFresh} onHome={() => navigate('/')} onDrill={drillWeakAreas}
        />
      </div>
    )
}
