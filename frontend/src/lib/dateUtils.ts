/**
 * Date utility functions for Chat timeline
 */

export function isDifferentDay(dateStr1?: string | null, dateStr2?: string | null): boolean {
  if (!dateStr1 || !dateStr2) return true;
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return (
    d1.getFullYear() !== d2.getFullYear() ||
    d1.getMonth() !== d2.getMonth() ||
    d1.getDate() !== d2.getDate()
  );
}

export function formatChatDateDivider(dateStr?: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return 'اليوم';
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return 'أمس';
  }

  return date.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
