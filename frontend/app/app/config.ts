export type MetricTemplate = {
  key: string;
  label: string;
  placeholder?: string;
};

export type HabitTemplate = {
  id: string;
  label: string;
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
