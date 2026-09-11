import { Conversation, Message } from '../../types/crm';

export const mergeAndDeduplicateMessages = (existing: Message[], incoming: Message[]): Message[] => {
  const result: Message[] = [];
  const seenIds = new Set<string>();
  const seenExternalIds = new Set<string>();

  // 1. Process incoming authoritative messages from backend
  incoming.forEach((msg) => {
    if (!msg || !msg.id) return;
    if (seenIds.has(msg.id)) return;
    if (msg.external_message_id && seenExternalIds.has(msg.external_message_id)) return;

    seenIds.add(msg.id);
    if (msg.external_message_id) seenExternalIds.add(msg.external_message_id);
    result.push(msg);
  });

  // 2. Only keep recent pending optimistic messages from existing state that are not yet in server list
  const now = Date.now();
  existing.forEach((msg) => {
    if (!msg || !msg.id) return;
    if (seenIds.has(msg.id)) return;
    if (msg.external_message_id && seenExternalIds.has(msg.external_message_id)) return;

    const isTemp = msg.id.startsWith('temp-') || msg.delivery_status === 'pending';
    if (isTemp) {
      const msgTime = new Date(msg.created_at || now).getTime();
      const isRecent = (now - msgTime) < 30000;
      const alreadyHasSameText = incoming.some(
        (inc) =>
          inc.text === msg.text &&
          inc.sender_type === msg.sender_type &&
          Math.abs(new Date(inc.created_at || now).getTime() - msgTime) < 30000
      );

      if (isRecent && !alreadyHasSameText) {
        seenIds.add(msg.id);
        result.push(msg);
      }
    }
  });

  return result.sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
};

export const sortConversationsByLatest = (convs: Conversation[]): Conversation[] => {
  return [...convs].sort((a, b) => {
    const timeA = new Date(a.last_message_at || a.last_activity_at || a.created_at || 0).getTime();
    const timeB = new Date(b.last_message_at || b.last_activity_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
};

export const areConversationsEqual = (a: Conversation[], b: Conversation[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].brand !== b[i].brand ||
      a[i].status !== b[i].status ||
      a[i].priority !== b[i].priority ||
      a[i].assigned_agent_id !== b[i].assigned_agent_id ||
      a[i].unread_count !== b[i].unread_count ||
      a[i].last_message_text !== b[i].last_message_text ||
      a[i].last_message_at !== b[i].last_message_at ||
      a[i].customer_display_name !== b[i].customer_display_name ||
      a[i].customer?.location !== b[i].customer?.location ||
      a[i].customer?.country !== b[i].customer?.country ||
      a[i].customer?.tier !== b[i].customer?.tier ||
      a[i].customer?.skin_type !== b[i].customer?.skin_type ||
      a[i].customer?.stage !== b[i].customer?.stage
    ) {
      return false;
    }
  }
  return true;
};

export const areMessagesEqual = (a: Message[] | undefined, b: Message[]): boolean => {
  if (!a) return b.length === 0;
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const firstA = a[0];
  const firstB = b[0];
  const lastA = a[a.length - 1];
  const lastB = b[b.length - 1];
  return (
    firstA.id === firstB.id &&
    lastA.id === lastB.id &&
    lastA.text === lastB.text &&
    (lastA as any).delivery_status === (lastB as any).delivery_status &&
    (lastA as any).is_edited === (lastB as any).is_edited &&
    (lastA as any).is_deleted === (lastB as any).is_deleted &&
    (lastA as any).is_pinned === (lastB as any).is_pinned &&
    ((lastA.reactions?.length || 0) === (lastB.reactions?.length || 0))
  );
};
