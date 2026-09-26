import React from 'react';
import {
  Shield,
  Settings as SettingsIcon,
} from 'lucide-react';
import { PortalIdentitySettings } from './PortalIdentitySettings';
import { useAuthStore, isAdminUser } from '../../store/useAuthStore';

export const SettingsPage: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = isAdminUser(user);

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
    <div className="flex-1 overflow-y-auto bg-slate-50/50 w-full max-w-full px-4 sm:px-6 lg:px-8 py-6 dir-rtl text-right">
      <div className="w-full max-w-full space-y-6">
        {/* Settings Header */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-950 text-white flex items-center justify-center shadow-xs">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900">إعدادات المنظومة والمظهر (System Settings)</h1>
            <p className="text-xs text-slate-500 font-medium">تخصيص هوية المنظومة ومظهرها وإعداداتها العامة</p>
          </div>
        </div>

        <PortalIdentitySettings />
      </div>
    </div>
  );
};

export default SettingsPage;
