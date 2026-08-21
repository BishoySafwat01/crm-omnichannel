import { useState, useEffect } from 'react';
import { formatCustomerPresence, PresenceState } from '../utils/presence';

export function useCustomerPresence(
  lastActivityAt?: string | Date | null,
  isTyping: boolean = false
): PresenceState {
  const [presence, setPresence] = useState<PresenceState>(() =>
    formatCustomerPresence(lastActivityAt, isTyping)
  );

  // 30-second interval ticker for dynamic relative time updates
  useEffect(() => {
    setPresence(formatCustomerPresence(lastActivityAt, isTyping));

    const interval = setInterval(() => {
      setPresence(formatCustomerPresence(lastActivityAt, isTyping));
    }, 30000);

    return () => clearInterval(interval);
  }, [lastActivityAt, isTyping]);

  return presence;
}
