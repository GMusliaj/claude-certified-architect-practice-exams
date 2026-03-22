export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function shuffleOptions(q) {
  const indices = shuffle([0, 1, 2, 3])
  return {
    ...q,
    options: indices.map(i => q.options[i]),
    answer:  indices.indexOf(q.answer),
  }
}

export function buildExam(bank, selection) {
  const byDomain = {}
  for (const q of bank) {
    if (!byDomain[q.domain]) byDomain[q.domain] = []
    byDomain[q.domain].push(q)
  }
  const selected = []
  const seenIds = new Set()
  for (const [domain, count] of Object.entries(selection)) {
    let taken = 0
    for (const q of shuffle(byDomain[domain] || [])) {
      if (seenIds.has(q.id)) continue
      seenIds.add(q.id)
      selected.push(q)
      if (++taken >= count) break
    }
  }
  return shuffle(selected).map(shuffleOptions)
}

// Build a drill exam from weak domains — up to `count` questions drawn evenly
export function buildDrillExam(bank, weakDomains, count = 10) {
  const filtered = bank.filter(q => weakDomains.includes(q.domain))
  if (!filtered.length) return []
  // Distribute draws evenly across domains
  const perDomain = Math.ceil(count / weakDomains.length)
  const byDomain = {}
  for (const q of filtered) {
    if (!byDomain[q.domain]) byDomain[q.domain] = []
    byDomain[q.domain].push(q)
  }
  const selected = []
  for (const domain of weakDomains) {
    selected.push(...shuffle(byDomain[domain] || []).slice(0, perDomain))
  }
  return shuffle(selected).slice(0, count).map(shuffleOptions)
}
