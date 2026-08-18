import React from 'react';
import { User, Phone, Mail, Sliders, Layers, MessageSquareText } from 'lucide-react';
import { useCrmStore } from '../store/useCrmStore';
import { TagGroup } from '../types/crm';
import { UserAvatar } from './UserAvatar';

const TAG_GROUPS: TagGroup[] = [
  {
    id: 'classification',
    title: 'الخصائص والتقييم',
    tags: [
      { id: 't1', label: 'درجة أولى', templateText: 'عميلنا العزيز، بصفتك من كبار عملاء LUXIRA الدرجة الأولى، نتشرف بتقديم خصم حصري ٢٠٪' },
      { id: 't2', label: 'درجة ثانية', templateText: 'أهلاً بك! لدينا عرض خاص ومميز يناسبك اليوم' },
      { id: 't3', label: 'درجة ثالثة', templateText: 'مرحباً بك في مجموعة LUXIRA! يسعدنا مساعدتك.' },
    ],
  },
  {
    id: 'skin_type',
    title: 'تصنيف العميل / نوع البشرة',
    tags: [
      { id: 't4', label: 'دهنية', templateText: 'بناءً على اختيارك للبشرة الدهنية، ننصحك بمجموعة السيروم المخصصة للتوازن وتفتيح المسام' },
      { id: 't5', label: 'جافة', templateText: 'لكريم العناية بالبشرة الجافة ترطيب عميق يدوم ٢٤ ساعة' },
      { id: 't6', label: 'مختلطة', templateText: 'مجموعة البشرة المختلطة توفر التوازن المثالي اليومي' },
      { id: 't7', label: 'عادية', templateText: 'روتين النضارة اليومية متوفر الآن مع شحن مجاني' },
    ],
  },
  {
    id: 'status_pipeline',
    title: 'مرحلة الاقتناع والطلب',
    tags: [
      { id: 't8', label: 'جديد', templateText: 'أهلاً بك! يسعدنا انضمامك إلى عائلة LUXIRA' },
      { id: 't9', label: 'قيد المتابعة', templateText: 'مرحباً، هل استطعت مراجعة العرض المرسل لك سابقاً؟' },
      { id: 't10', label: 'تم البيع', templateText: 'تم تأكيد طلبك وشحنه بنجاح! يسعدنا تقييمك للخدمة' },
      { id: 't11', label: 'ملغى', templateText: 'تم إلغاء الطلب بناءً على رغبتك، نتمنى خدمتك في المرات القادمة.' },
    ],
  },
];

export const CustomerProfileSidebar: React.FC = () => {
  const { conversations, activeConversationId, toggleCustomerTag } = useCrmStore();

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const customer = activeConv?.customer || (activeConv ? {
    id: activeConv.customer_id || '',
    display_name: activeConv.customer_display_name || 'عميل جديد',
    phone: '',
    email: '',
    tags: [],
    created_at: '',
    updated_at: '',
  } : null);
  const customerTags = customer?.tags || [];

  if (!activeConv || !customer) {
    return (
      <aside className="w-72 md:w-80 bg-white/80 backdrop-blur-md border-r border-slate-200/80 p-6 shrink-0 h-full hidden lg:flex flex-col justify-center items-center text-slate-400 text-xs">
        <User className="w-10 h-10 text-slate-300 mb-2" />
        <span>اختر محادثة لعرض ملف العميل</span>
      </aside>
    );
  }

  return (
    <aside className="w-72 md:w-80 bg-white/80 backdrop-blur-md border-r border-slate-200/80 p-4 shrink-0 h-full overflow-y-auto hidden lg:flex flex-col space-y-4 relative z-10">
      {/* Customer Header Card */}
      <div className="glass-card p-4 rounded-2xl text-center space-y-2 border border-slate-200/70 flex flex-col items-center">
        <UserAvatar name={customer.display_name} avatarUrl={activeConv?.customer_avatar_url || customer.avatar_url} size="lg" />
        <div>
          <h3 className="text-xs font-bold text-slate-900">{customer.display_name}</h3>
          <p className="text-[11px] text-teal-700 font-semibold mt-0.5">
            {activeConv.brand_name || 'LUXIRA'} • {activeConv.channel}
            {customer.locale && ` • ${customer.locale}`}
          </p>
        </div>
      </div>

      {/* Contact Details */}
      <div className="glass-card p-3 rounded-2xl space-y-2 text-xs text-slate-700 border border-slate-200/70">
        <div className="flex items-center gap-2 text-slate-600">
          <Phone className="w-3.5 h-3.5 text-teal-600" />
          <span>{customer.phone || 'غير مسجل'}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Mail className="w-3.5 h-3.5 text-teal-600" />
          <span className="truncate">{customer.email || 'غير مسجل'}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Layers className="w-3.5 h-3.5 text-teal-600" />
          <span className="text-[10px] font-mono text-slate-500">{activeConv.external_conversation_id}</span>
        </div>
      </div>

      {/* Material 3 Filter Chips Tag Engine */}
      <div className="space-y-4 pt-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 border-b border-slate-200/80 pb-2">
          <Sliders className="w-4 h-4 text-teal-600" />
          <span>تصنيف العميل والقوالب السريعة</span>
        </div>

        {TAG_GROUPS.map((group) => (
          <div key={group.id} className="space-y-2">
            <h4 className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
              <span>{group.title}</span>
              <span className="text-[9px] text-teal-700 flex items-center gap-0.5 font-medium">
                <MessageSquareText className="w-3 h-3" />
                نسخ القالب
              </span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {group.tags.map((tag) => {
                const isSelected = customerTags.includes(tag.label);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleCustomerTag(tag.label, tag.templateText)}
                    title={tag.templateText ? `قالب: ${tag.templateText}` : undefined}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all duration-150 border ${
                      isSelected
                        ? 'bg-teal-50 text-teal-800 border-teal-300 font-bold ring-1 ring-teal-200 shadow-xs'
                        : 'bg-slate-100/70 text-slate-600 hover:bg-slate-200 border-slate-200/60 font-medium'
                    }`}
                  >
                    {tag.label} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
