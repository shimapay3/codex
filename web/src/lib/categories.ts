export type Category = {
  id: string
  label: string
  color: string
  emoji: string
}

export const CATEGORIES: Category[] = [
  { id: 'pay', label: 'Thanh toán', color: '#3b6bff', emoji: '💸' },
  { id: 'gift', label: 'Quà tặng', color: '#ff4fd8', emoji: '🎁' },
  { id: 'salary', label: 'Lương', color: '#22e07a', emoji: '💼' },
  { id: 'food', label: 'Ăn uống', color: '#ffb020', emoji: '🍜' },
  { id: 'bill', label: 'Hoá đơn', color: '#00d4ff', emoji: '🧾' },
  { id: 'save', label: 'Tiết kiệm', color: '#9945ff', emoji: '🏦' },
  { id: 'lucky', label: 'Lì xì', color: '#ff3d5a', emoji: '🧧' },
  { id: 'other', label: 'Khác', color: '#9fb3d1', emoji: '✨' },
]

export const WISHES = [
  'Chúc mừng sinh nhật 🎂',
  'Cảm ơn bạn ❤️',
  'Lì xì may mắn 🧧',
  'Chúc sức khoẻ 🌿',
  'Đi chơi vui vẻ 🎉',
  'Thanh toán dịch vụ 🧾',
  'Chúc ngủ ngon 🌙',
  'Hẹn gặp lại 👋',
]

export function categoryById(id?: string | null): Category {
  return CATEGORIES.find((category) => category.id === id) || CATEGORIES[CATEGORIES.length - 1]
}

/** Best-effort category detection for incoming transfers that only carry a MEMO. */
export function detectCategoryFromMemo(memo?: string | null): Category {
  if (!memo) return CATEGORIES[0]
  const lower = memo.toLowerCase()
  if (/sinh nhật|birthday|🎂/.test(lower)) return categoryById('gift')
  if (/lì xì|may mắn|🧧|lucky/.test(lower)) return categoryById('lucky')
  if (/cảm ơn|thank|❤️/.test(lower)) return categoryById('gift')
  if (/lương|salary|💼/.test(lower)) return categoryById('salary')
  if (/hoá đơn|hóa đơn|bill|invoice|🧾/.test(lower)) return categoryById('bill')
  if (/ăn|uống|cà phê|coffee|🍜/.test(lower)) return categoryById('food')
  if (/tiết kiệm|save|🏦/.test(lower)) return categoryById('save')
  return CATEGORIES[0]
}

export function buildMemo(categoryId: string, wish: string, note: string): string {
  const category = categoryById(categoryId)
  const parts = [`${category.emoji} ${category.label}`]
  if (wish) parts.push(wish)
  if (note.trim()) parts.push(note.trim())
  return parts.join(' · ').slice(0, 200)
}

export function splitMemo(memo?: string | null) {
  if (!memo) return { category: categoryById('other'), title: '', detail: '' }
  const segments = memo.split('·').map((segment) => segment.trim())
  const first = segments[0] || ''
  const matched = CATEGORIES.find((category) => first.includes(category.emoji) || first.includes(category.label))
  const category = matched || detectCategoryFromMemo(memo)
  const rest = segments.filter((segment, index) => (index === 0 && matched ? false : true))
  return { category, title: rest[0] || '', detail: rest.slice(1).join(' · ') }
}
