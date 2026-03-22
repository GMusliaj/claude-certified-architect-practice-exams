const HISTORY_KEY = 'exam_history'

export function saveProgress(examId, state) {
  try {
    localStorage.setItem(`exam_progress_${examId}`, JSON.stringify(state))
  } catch { /* storage full */ }
}

export function loadProgress(examId) {
  try {
    const raw = localStorage.getItem(`exam_progress_${examId}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearProgress(examId) {
  localStorage.removeItem(`exam_progress_${examId}`)
  localStorage.removeItem(`exam_snapshot_${examId}`)
}

// Question snapshot — written once when an exam starts, never on every advance.
// Keeps the auto-save payload small (only current/answers/elapsed/studyMode).
export function saveSnapshot(examId, questions) {
  try {
    localStorage.setItem(`exam_snapshot_${examId}`, JSON.stringify(questions))
  } catch { /* storage full */ }
}

export function loadSnapshot(examId) {
  try {
    const raw = localStorage.getItem(`exam_snapshot_${examId}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveResult(result) {
  const history = loadHistory()
  history.unshift(result)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch { /* storage full */ }
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY)
}
