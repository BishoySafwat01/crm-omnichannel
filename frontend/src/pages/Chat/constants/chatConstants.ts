import { MetaMessageTag } from '../../../types/crm';

export const CANNED_RESPONSES = [
  'أهلاً بك! يسعدنا تواصلك مع مجموعة LUXIRA.',
  'تم تسجيل طلبك بنجاح، وسيتم التواصل معك خلال لحظات.',
  'المنتج متوفر حالياً وخصم خاص بمناسبة العرض الحالي.',
  'شكراً لثقتكم بنا، هل يمكنني مساعدتك بأي استفسار آخر؟',
];

export const META_TAGS: { id: MetaMessageTag; label: string }[] = [
  { id: 'HUMAN_AGENT', label: 'HUMAN_AGENT (رد موظف دعم)' },
  { id: 'CONFIRMED_EVENT_UPDATE', label: 'CONFIRMED_EVENT_UPDATE (تحديث موعد)' },
  { id: 'POST_PURCHASE_UPDATE', label: 'POST_PURCHASE_UPDATE (تحديث الطلب)' },
];

export const AGENTS = [
  { id: '', name: 'غير مخصص' },
  { id: 'أحمد محمود', name: 'أحمد محمود' },
  { id: 'سارة علي', name: 'سارة علي' },
  { id: 'محمد حسن', name: 'محمد حسن' },
];

export const AVAILABLE_BRANDS = [
  { id: 'LAVVA', label: 'LAVVA' },
  { id: 'MOON LIGHT', label: 'MOON LIGHT' },
  { id: 'LOTUS BLUE', label: 'LOTUS BLUE' },
  { id: 'BEAUTY CENTER', label: 'BEAUTY CENTER' },
  { id: 'LOXX KING', label: 'LOXX KING' },
  { id: 'FLARE', label: 'FLARE' },
];
