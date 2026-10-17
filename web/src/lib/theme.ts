export type ThemeMode = 'dark' | 'light'

export type AccentTheme = {
  id: string
  name: string
  accent: string
  accent2: string
}

/** Accent palettes — each one re-tints the whole space background and UI. */
export const ACCENTS: AccentTheme[] = [
  { id: 'solana', name: 'Solana Space', accent: '#9945ff', accent2: '#14f195' },
  { id: 'nebula', name: 'Nebula Pink', accent: '#ff4fd8', accent2: '#7a5cff' },
  { id: 'aqua', name: 'Deep Aqua', accent: '#00d4ff', accent2: '#38f9d7' },
  { id: 'solar', name: 'Solar Amber', accent: '#ffb020', accent2: '#ff6a3d' },
  { id: 'aurora', name: 'Aurora Green', accent: '#22e07a', accent2: '#a6ff4d' },
  { id: 'cosmos', name: 'Cosmos Blue', accent: '#3b6bff', accent2: '#00c2ff' },
  { id: 'royal', name: 'Royal Violet', accent: '#7c3aed', accent2: '#c084fc' },
  { id: 'ember', name: 'Ember Red', accent: '#ff3d5a', accent2: '#ff8a3d' },
  { id: 'ice', name: 'Ice White', accent: '#9fb3d1', accent2: '#e6ecff' },
  { id: 'gold', name: 'Chain Gold', accent: '#e2b53d', accent2: '#fff1a8' },
]

export function accentById(id: string): AccentTheme {
  return ACCENTS.find((accent) => accent.id === id) || ACCENTS[0]
}

export function applyTheme(mode: ThemeMode, accentId: string, themeColor?: string) {
  const root = document.documentElement
  const accent = accentById(accentId)
  root.style.setProperty('--accent', themeColor || accent.accent)
  root.style.setProperty('--accent-2', themeColor ? themeColor : accent.accent2)
  root.classList.toggle('light', mode === 'light')

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'light' ? '#f5f6fb' : '#05060f')
}
