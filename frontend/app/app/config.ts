export type MetricTemplate = {
  key: string;
  label: string;
  placeholder?: string;
};

export type HabitTemplate = {
  id: string;
  label: string;
};

export type AnalyticsCategory = {
  id: string;
  label: string;
  description?: string;
  metricKeys: string[];
  habitIds: string[];
};

export const metricTemplates: MetricTemplate[] = [
  { key: 'mood', label: 'Mood (1-10)', placeholder: '7' },
  { key: 'energy', label: 'Energy (1-10)', placeholder: '8' },
  { key: 'sleep_hours', label: 'Sleep hours', placeholder: '7.5' },
  { key: 'steps', label: 'Steps walked', placeholder: '10000' },
];

export const habitTemplates: HabitTemplate[] = [
  { id: 'exercise', label: 'Exercise' },
  { id: 'meditation', label: 'Meditation' },
  { id: 'journaling', label: 'Journaling' },
  { id: 'reading', label: 'Reading' },
];

export const analyticsCategories: AnalyticsCategory[] = [
  {
    id: 'all',
    label: 'All data',
    description: 'Everything you have tracked so far.',
    metricKeys: metricTemplates.map((m) => m.key),
    habitIds: habitTemplates.map((h) => h.id),
  },
  {
    id: 'wellness',
    label: 'Wellness',
    description: 'Mood, energy, sleep, and mindful routines.',
    metricKeys: ['mood', 'energy', 'sleep_hours'],
    habitIds: ['meditation', 'reading'],
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Exercise, movement, and habit streaks.',
    metricKeys: ['steps', 'energy'],
    habitIds: ['exercise', 'journaling'],
  },
];
