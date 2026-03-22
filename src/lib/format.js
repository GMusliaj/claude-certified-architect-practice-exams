export const OPT_LABEL = ['A', 'B', 'C', 'D']

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function getWeakDomains(domainScores, threshold = 75) {
  return Object.entries(domainScores)
    .filter(([, s]) => Math.round((s.correct / s.total) * 100) < threshold)
    .map(([name]) => name)
}

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

export function getExamTotal(selection) {
  return Object.values(selection).reduce((a, b) => a + b, 0)
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
