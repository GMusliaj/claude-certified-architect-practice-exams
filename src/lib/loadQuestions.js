// Explicit map required — Vite needs statically-analysable import paths for code splitting
const loaders = {
  full:        () => import('../../questions/full.json'),
  foundations: () => import('../../questions/foundations.json'),
  agents:      () => import('../../questions/agents.json'),
  extraction:  () => import('../../questions/extraction.json'),
}

export async function loadQuestions(key) {
  const mod = await loaders[key]()
  return mod.default
}
