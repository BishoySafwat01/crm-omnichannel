import React, { useState, useEffect } from 'react';
import {
  Palette,
  Sparkles,
  Image as ImageIcon,
  Globe,
  Check,
  Save,
  RotateCcw,
  Loader2,
  AlertCircle,
  Eye,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { usePortalBrandingStore } from '../../store/usePortalBrandingStore';
import luxiraLogo from '../../assets/luxira-logo.png';

const PRESET_PALETTES = [
  { hex: '#1A73E8', label: 'أزرق قياسي', name: 'Google Blue' },
  { hex: '#0D9488', label: 'لوكسيرا تيل', name: 'Luxira Teal' },
  { hex: '#0F9D58', label: 'زمردي مؤسسي', name: 'Emerald' },
  { hex: '#7C3AED', label: 'أرجواني ملكي', name: 'Royal Indigo' },
  { hex: '#E11D48', label: 'قرمزي أنيق', name: 'Rose' },
];

export const PortalIdentitySettings: React.FC = () => {
  const { branding, isSaving, updateBranding, fetchBranding } = usePortalBrandingStore();

  const [displayName, setDisplayName] = useState(branding.brand_display_name || '');
  const [logoUrl, setLogoUrl] = useState(branding.brand_logo_url || '');
  const [faviconUrl, setFaviconUrl] = useState(branding.favicon_url || '');
  const [primaryColor, setPrimaryColor] = useState(branding.theme_primary_color || '#1A73E8');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setDisplayName(branding.brand_display_name || '');
    setLogoUrl(branding.brand_logo_url || '');
    setFaviconUrl(branding.favicon_url || '');
    setPrimaryColor(branding.theme_primary_color || '#1A73E8');
  }, [branding]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    try {
      await updateBranding({
        brand_display_name: displayName.trim() || 'مجموعة لوكسيرا - نظام إدارة العملاء الموحد',
        brand_logo_url: logoUrl.trim() || null,
        favicon_url: faviconUrl.trim() || null,
        theme_primary_color: primaryColor.trim() || '#1A73E8',
      });

      setFeedback({
        type: 'success',
        message: 'تم حفظ هوية ومظهر المنظومة بنجاح وتطبيق السمة فورياً ✨',
      });

      setTimeout(() => {
        setFeedback(null);
      }, 5000);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'فشل حفظ إعدادات الهوية. يرجى المحاولة مرة أخرى.',
      });
    }
  };

  const handleResetToDefault = () => {
    setDisplayName('مجموعة لوكسيرا - نظام إدارة العملاء الموحد');
    setLogoUrl('');
    setFaviconUrl('');
    setPrimaryColor('#1A73E8');
  };

  return (
    <div className="space-y-6 dir-rtl text-right">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: primaryColor }}
            >
              <Palette className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">هوية ومظهر المنظومة (Portal Customization)</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            تخصيص الهوية البصرية، اسم المنظومة، الشعار، وألوان الواجهة الخاصة بالمؤسسة والفروع.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 transition animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs'
              : 'bg-rose-50 text-rose-800 border border-rose-200 shadow-xs'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Main Column: Settings Form (7 cols) */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-5">
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-5">
            {/* 1. Brand System Name */}
            <div>
              <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                اسم النظام المعروض (Brand System Name)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="مجموعة لوكسيرا - نظام إدارة العملاء الموحد"
                className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-xs font-bold text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                الاسم الظاهر في الشريط العلوي، شاشة تسجيل الدخول، وعنوان تبويب المتصفح.
              </p>
            </div>

            {/* 2. Brand Logo URL */}
            <div>
              <label className="block text-xs font-extrabold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>رابط الشعار المخصص (Brand Logo URL)</span>
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://your-domain.com/assets/logo.png"
                className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                رابط مباشر لصورة الشعار (PNG أو SVG بخلفية شفافة). اتركه فارغاً للاحتفاظ بشعار LUXIRA.
              </p>
            </div>

            {/* 3. Favicon URL */}
            <div>
              <label className="block text-xs font-extrabold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                <span>رابط أيقونة المتصفح (Favicon URL)</span>
              </label>
              <input
                type="url"
                value={faviconUrl}
                onChange={(e) => setFaviconUrl(e.target.value)}
                placeholder="https://your-domain.com/assets/favicon.ico"
                className="w-full bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-xs font-medium text-slate-900 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-theme-primary/20 focus:border-theme-primary transition"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                أيقونة الموقع التي تظهر في شريط متصفح المستخدم (.ico أو .png).
              </p>
            </div>

            {/* 4. Primary Brand Color Picker */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1">
                  لون المظهر الرئيسي (Primary Theme Color)
                </label>
                <p className="text-[11px] text-slate-400">
                  اختر من لوحات الألوان المؤسسية المعتمدة أو حدد كود هيكس مخصص.
                </p>
              </div>

              {/* Curated enterprise palette */}
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_PALETTES.map((palette) => {
                  const isSelected = primaryColor.toUpperCase() === palette.hex.toUpperCase();
                  return (
                    <button
                      key={palette.hex}
                      type="button"
                      onClick={() => setPrimaryColor(palette.hex)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition duration-150 cursor-pointer ${
                        isSelected
                          ? 'border-slate-800 bg-slate-900 text-white shadow-xs'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full ring-1 ring-white/50"
                        style={{ backgroundColor: palette.hex }}
                      />
                      <span>{palette.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Hex input */}
              <div className="flex items-center gap-3 pt-1">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
                  <input
                    type="color"
                    value={primaryColor.startsWith('#') ? primaryColor : `#${primaryColor}`}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer p-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#1A73E8"
                    className="w-24 bg-transparent font-mono text-xs font-extrabold text-slate-800 focus:outline-none uppercase"
                  />
                </div>
                <span className="text-[11px] text-slate-400 font-medium">كود اللون المخصص (Hex Code)</span>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl text-white text-xs font-bold transition flex items-center gap-2 shadow-md hover:brightness-110 active:scale-98 disabled:opacity-50 cursor-pointer"
                style={{ backgroundColor: primaryColor }}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>حفظ وتطبيق الهوية</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Right Column: Live Interactive Preview Dock (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-50/80 rounded-3xl p-5 border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-black text-slate-900">معاينة تفاعلية فورية (Live Preview)</h3>
              </div>
              <span className="text-[10px] bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                مباشر
              </span>
            </div>

            {/* Mini TopBar Mockup */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400">شريط الواجهة الرئيسي (Top Bar Preview):</span>
              <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-slate-950 p-1 flex items-center justify-center border border-theme-primary/20 overflow-hidden">
                    <img
                      src={logoUrl || luxiraLogo}
                      alt="Brand Preview"
                      className="h-6 w-6 object-contain"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-slate-900 truncate max-w-[140px]">
                      {displayName || 'مجموعة لوكسيرا'}
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 tracking-widest uppercase">
                      OMNICHANNEL CRM
                    </span>
                  </div>
                </div>

                {/* Active Tab Mock */}
                <div
                  className="px-2.5 py-1 rounded-lg text-white text-[10px] font-bold shadow-xs"
                  style={{ backgroundColor: primaryColor }}
                >
                  الشات المباشر
                </div>
              </div>
            </div>

            {/* Button Theme Preview */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400">عناصر التحكم والأزرار (Theme Elements):</span>
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs"
                    style={{ backgroundColor: primaryColor }}
                  >
                    زر أساسي (Primary Action)
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl border text-xs font-bold bg-white text-slate-700"
                    style={{ borderColor: primaryColor }}
                  >
                    زر ثانوي
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <span
                    className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    شارة مميزة (Badge)
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    كود اللون: {primaryColor}
                  </span>
                </div>
              </div>
            </div>

            {/* Login Preview Mock */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400">بطاقة الدخول (Login Branding):</span>
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-slate-950 p-1.5 mx-auto flex items-center justify-center border border-theme-primary/20 overflow-hidden">
                  <img
                    src={logoUrl || luxiraLogo}
                    alt="Brand Preview"
                    className="w-7 h-7 object-contain"
                  />
                </div>
                <h4 className="text-xs font-black text-slate-900 truncate">
                  {displayName || 'مجموعة لوكسيرا'}
                </h4>
                <div
                  className="w-full py-1.5 rounded-lg text-white text-[10px] font-bold"
                  style={{ backgroundColor: primaryColor }}
                >
                  تسجيل الدخول للنظام
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalIdentitySettings;
