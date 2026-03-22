export const THEMES = ['light', 'dark', 'system']

export function getTheme() {
  return localStorage.getItem('theme') || 'system'
}

export function setTheme(t) {
  localStorage.setItem('theme', t)
  if (t === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', t)
  }
}
