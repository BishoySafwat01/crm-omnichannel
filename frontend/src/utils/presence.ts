export interface PresenceState {
  statusText: string;
  isOnline: boolean;
  colorClass: string;
  dotColor: string;
}

/**
 * Pure utility function evaluating customer online presence & activity label with accurate Arabic grammar rules.
 */
export function formatCustomerPresence(
  lastActivityAt?: string | Date | null,
  isTyping: boolean = false
): PresenceState {
  if (isTyping) {
    return {
      statusText: 'يكتب الآن...',
      isOnline: true,
      colorClass: 'text-emerald-600 font-bold',
      dotColor: 'bg-emerald-500 animate-pulse',
    };
  }

  if (!lastActivityAt) {
    return {
      statusText: 'غير متصل',
      isOnline: false,
      colorClass: 'text-slate-400 font-medium',
      dotColor: 'bg-slate-300',
    };
  }

  const date = typeof lastActivityAt === 'string' ? new Date(lastActivityAt) : lastActivityAt;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (isNaN(diffMs) || diffMs < 0) {
    return {
      statusText: 'متصل الآن',
      isOnline: true,
      colorClass: 'text-emerald-600 font-bold',
      dotColor: 'bg-emerald-500',
    };
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Active window (< 2 minutes)
  if (diffMinutes < 2) {
    return {
      statusText: 'متصل الآن',
      isOnline: true,
      colorClass: 'text-emerald-600 font-bold',
      dotColor: 'bg-emerald-500',
    };
  }

  // Recent inactive window (2 <= delta < 60 minutes)
  if (diffMinutes < 60) {
    let minText = '';
    if (diffMinutes === 2) {
      minText = 'دقيقتين';
    } else if (diffMinutes >= 3 && diffMinutes <= 10) {
      minText = `${diffMinutes} دقائق`;
    } else {
      minText = `${diffMinutes} دقيقة`;
    }
    return {
      statusText: `نشط منذ ${minText}`,
      isOnline: false,
      colorClass: 'text-slate-500 font-medium',
      dotColor: 'bg-slate-400',
    };
  }

  // Hourly inactive window (1 <= delta_hours < 24 hours)
  if (diffHours < 24) {
    let hourText = '';
    if (diffHours === 1) {
      hourText = 'ساعة';
    } else if (diffHours === 2) {
      hourText = 'ساعتين';
    } else if (diffHours >= 3 && diffHours <= 10) {
      hourText = `${diffHours} ساعات`;
    } else {
      hourText = `${diffHours} ساعة`;
    }
    return {
      statusText: `نشط منذ ${hourText}`,
      isOnline: false,
      colorClass: 'text-slate-500 font-medium',
      dotColor: 'bg-slate-400',
    };
  }

  // Daily inactive window (1 <= delta_days < 30 days)
  if (diffDays < 30) {
    let dayText = '';
    if (diffDays === 1) {
      dayText = 'يوم';
    } else if (diffDays === 2) {
      dayText = 'يومين';
    } else if (diffDays >= 3 && diffDays <= 10) {
      dayText = `${diffDays} أيام`;
    } else {
      dayText = `${diffDays} يوم`;
    }
    return {
      statusText: `نشط منذ ${dayText}`,
      isOnline: false,
      colorClass: 'text-slate-500 font-medium',
      dotColor: 'bg-slate-400',
    };
  }

  // Stale / Unknown (>= 30 days)
  return {
    statusText: 'غير متصل',
    isOnline: false,
    colorClass: 'text-slate-400 font-medium',
    dotColor: 'bg-slate-300',
  };
}
