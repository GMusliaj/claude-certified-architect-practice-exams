export function fmtTime(s) {
  const m = Math.floor(Math.abs(s) / 60)
  const sec = Math.abs(s) % 60
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

export function fmtStudyTime(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Domain score aggregation used in ResultsScreen and doFinish
export function calcDomainScores(questions, answers) {
  const scores = {}
  questions.forEach((q, i) => {
    if (!scores[q.domain]) scores[q.domain] = { correct: 0, total: 0 }
    scores[q.domain].total++
    if (answers[i]?.correct) scores[q.domain].correct++
  })
  return scores
}
