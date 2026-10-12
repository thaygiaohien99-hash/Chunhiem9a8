import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import {
  getGoogleScriptUrl,
  prewarmGoogleScriptConnection,
  authenticateWithGoogleSheetFast,
  getSystemConfig
} from '../services/dataService';

interface AuthViewProps {
  onLoginSuccess: (user: User) => void;
  onLoginLater?: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const AuthView: React.FC<AuthViewProps> = ({ 
  onLoginSuccess, 
  onLoginLater, 
  onClose, 
  isModal = true 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Làm ấm sẵn kết nối với Google Apps Script ngay khi mở cửa sổ đăng nhập
  useEffect(() => {
    prewarmGoogleScriptConnection();
  }, []);

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (onLoginLater) {
      onLoginLater();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.trim().replace(/[\s.-]/g, '');
    const cleanPassword = password.trim();

    if (!cleanPhone) {
      setError('Vui lòng nhập số điện thoại');
      return;
    }
    if (!cleanPassword) {
      setError('Vui lòng nhập mật khẩu');
      return;
    }

    // 1. Kiểm tra Admin Quản trị cao nhất (0966000224 / $Hongphat2022)
    const normalizedPhone = cleanPhone.replace(/^0+/, '');
    if ((cleanPhone === '0966000224' || normalizedPhone === '966000224') && cleanPassword === '$Hongphat2022') {
      const adminUser: User = {
        studentId: 'GV01',
        phone: '0966000224',
        name: 'Quản Trị Cao Nhất',
        className: getSystemConfig().className || '10A6',
        role: UserRole.ADMIN,
        managedScope: 'Toàn diện lớp',
        totalScore: 9999,
        examHistory: []
      };
      onLoginSuccess(adminUser);
      return;
    }

    // 2. Xác thực tốc độ cao với Google Apps Script (Sheet 01_QUAN_LI)
    const activeScriptUrl = getGoogleScriptUrl();
    if (!activeScriptUrl.includes('http')) {
      setError('Lỗi cấu hình: Chưa kết nối máy chủ Google Sheet.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await authenticateWithGoogleSheetFast(cleanPhone, cleanPassword);

      if (data && data.success && data.user) {
        const rawStatus = (data.user.status || data.user.Trang_Thai || 'Hoạt động').toString().trim().toLowerCase();
        if (rawStatus === 'khóa' || rawStatus === 'khoa') {
          setError('⚠️ Tài khoản của bạn hiện đang bị KHÓA. Vui lòng liên hệ GVCN.');
          setIsLoading(false);
          return;
        }

        const roleRaw = (data.user.role || '').toString().trim().toUpperCase();
        const userPhoneClean = (data.user.phone || cleanPhone).toString().trim().replace(/^0+/, '');

        const isTeacherAdmin = 
          roleRaw === 'ADMIN' || 
          roleRaw === 'GVCN' || 
          userPhoneClean === '966000224' ||
          userPhoneClean === '792428799' ||
          userPhoneClean === '974781337';

        // Chuẩn hóa phạm vi quản lý của Tổ trưởng (Tổ 1 đến Tổ 8...)
        let resolvedScope = (data.user.managedScope || '').toString().trim();
        const combinedRoleScope = `${roleRaw} ${resolvedScope} ${data.user.note || ''}`.toLowerCase();
        if (!isTeacherAdmin && !combinedRoleScope.includes('lớp trưởng') && !combinedRoleScope.includes('lop_truong')) {
          const matchTo = combinedRoleScope.match(/(?:to_truong_|tổ trưởng|to truong|tổ|tt|to)\s*_?(\d+)/i) || combinedRoleScope.match(/\b([1-9]|1[0-2])\b/);
          if (matchTo) resolvedScope = `Tổ ${matchTo[1]}`;
        }

        const loggedUser: User = {
          studentId: data.user.id || 'CB_' + cleanPhone.slice(-4),
          phone: data.user.phone || cleanPhone,
          name: data.user.name || 'Cán sự lớp',
          className: data.user.className || getSystemConfig().className || '9A8',
          role: isTeacherAdmin ? UserRole.ADMIN : UserRole.STUDENT,
          managedScope: resolvedScope || 'Toàn diện lớp',
          totalScore: 0,
          examHistory: [],
          status: 'active'
        };

        onLoginSuccess(loggedUser);
      } else {
        setError(data?.message || 'Số điện thoại hoặc mật khẩu không chính xác.');
      }
    } catch (err) {
      console.error('Lỗi đăng nhập:', err);
      setError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng hoặc thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const containerClasses = isModal
    ? "fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
    : "min-h-screen bg-gray-50 flex items-center justify-center p-4";

  return (
    <div className={containerClasses} onClick={isModal ? handleClose : undefined}>
      {/* Modal Dialog Card (Chuẩn 100% theo ảnh mẫu) */}
      <div 
        className="bg-white w-full max-w-[420px] rounded-3xl shadow-2xl p-5 sm:p-7 relative animate-scale-up border border-gray-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Header: Tiêu đề "Đăng nhập" & Nút đóng "✕" */}
        <div className="flex items-center justify-between pb-3.5 sm:pb-4 border-b border-gray-100 mb-5 sm:mb-6">
          <h2 className="text-lg sm:text-2xl font-black text-gray-900 tracking-tight">
            Đăng nhập
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer text-lg leading-none"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Thông báo lỗi nếu có */}
        {error && (
          <div className="mb-4 sm:mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold flex items-center gap-2 animate-pulse">
            <span className="text-base shrink-0">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Biểu mẫu đăng nhập */}
        <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
          {/* Trường 1: Tài khoản (Số điện thoại) */}
          <div>
            <label className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-800 mb-1.5 sm:mb-2">
              <svg 
                className="w-4 h-4 text-[#047857]" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>Tài khoản (Số điện thoại)</span>
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Nhập số điện thoại"
              autoComplete="username"
              className="w-full px-4 py-3 text-base sm:text-sm text-gray-900 bg-white border border-blue-200 rounded-2xl placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all shadow-xs"
            />
          </div>

          {/* Trường 2: Mật khẩu */}
          <div>
            <label className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-800 mb-1.5 sm:mb-2">
              <svg 
                className="w-4 h-4 text-[#047857]" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Mật khẩu</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                className="w-full px-4 py-3 pr-11 text-base sm:text-sm text-gray-900 bg-white border border-blue-200 rounded-2xl placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all shadow-xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                tabIndex={-1}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Nút bấm Đăng nhập (Màu xanh chuẩn theo ảnh mẫu) */}
          <div className="pt-1 sm:pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-[#047857] hover:bg-[#065f46] active:scale-[0.99] text-white font-extrabold text-sm sm:text-base rounded-2xl transition-all duration-150 shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></div>
              )}
              <span>{isLoading ? 'Đang xác thực...' : 'Đăng nhập'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
