export interface LevelInfo {
  id: string
  label: string
  short: string
  jlpt: number
  color: string
}

export const LEVELS: LevelInfo[] = [
  { id: 'beginner-1', label: 'Beginner 1', short: 'B1', jlpt: 5, color: '#4caf50' },
  { id: 'beginner-2', label: 'Beginner 2', short: 'B2', jlpt: 5, color: '#43a047' },
  { id: 'beginner-3', label: 'Beginner 3', short: 'B3', jlpt: 5, color: '#2e7d32' },
  { id: 'elementary', label: 'Elementary', short: 'EL', jlpt: 4, color: '#1e88e5' },
  { id: 'intermediate', label: 'Intermediate', short: 'IN', jlpt: 3, color: '#8e24aa' },
  { id: 'advanced', label: 'Advanced', short: 'AD', jlpt: 2, color: '#e65100' },
  { id: 'master', label: 'Master', short: 'MA', jlpt: 1, color: '#c62828' },
]

export function levelInfo(id: string): LevelInfo {
  return LEVELS.find((l) => l.id === id) ?? { id, label: id === 'custom' ? 'My text' : id, short: '•', jlpt: 0, color: '#757575' }
}

export function levelJlpt(id: string): number {
  return levelInfo(id).jlpt || 1
}

export const CATEGORIES: Record<string, string> = {
  'daily-life': 'Daily life',
  food: 'Food',
  travel: 'Travel',
  culture: 'Culture',
  folktale: 'Folktales',
  history: 'History',
  nature: 'Nature',
  school: 'School',
  work: 'Work',
  society: 'Society',
  science: 'Science',
  humor: 'Humor',
  literature: 'Literature',
  'news-style': 'News',
  conversation: 'Conversation',
  misc: 'Other',
}

export const JLPT_COLORS: Record<number, string> = {
  5: 'var(--n5)',
  4: 'var(--n4)',
  3: 'var(--n3)',
  2: 'var(--n2)',
  1: 'var(--n1)',
}
