import React, { useState } from 'react';
import {
  Palette,
  Radio,
  Shield,
  Sliders,
  Settings as SettingsIcon,
  Layers,
  Facebook,
} from 'lucide-react';
import { PortalIdentitySettings } from './PortalIdentitySettings';
import { MetaChannelsSettings } from '../../components/settings/MetaChannelsSettings';
import { useAuthStore, isAdminUser } from '../../store/useAuthStore';

type SettingsTab = 'identity' | 'channels';

export const SettingsPage: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = isAdminUser(user);

  const [activeTab, setActiveTab] = useState<SettingsTab>('identity');

  if (!isAdmin) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center dir-rtl text-right">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center border border-slate-200 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <Shield className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-900">غير مصرح بالوصول</h3>
          <p className="text-xs text-slate-500">
            إعدادات هوية ومظهر المنظومة مقتصرة حصرياً على مديري النظام (Admins & Superadmins).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 md:p-8 dir-rtl text-right">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Settings Navigation Header */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-950 text-white flex items-center justify-center shadow-xs">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900">إعدادات المنظومة والمظهر (System Settings)</h1>
              <p className="text-xs text-slate-500 font-medium">لوحة التحكم المركزية لتخصيص الواجهة والقنوات</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60">
            <button
              onClick={() => setActiveTab('identity')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'identity'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Palette className="w-3.5 h-3.5 text-theme-primary" />
              <span>هوية ومظهر المنظومة</span>
            </button>

            <button
              onClick={() => setActiveTab('channels')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'channels'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Facebook className="w-3.5 h-3.5 text-blue-600" />
              <span>قنوات ميتا والصفحات</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'identity' && <PortalIdentitySettings />}
        {activeTab === 'channels' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs">
            <MetaChannelsSettings />
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
