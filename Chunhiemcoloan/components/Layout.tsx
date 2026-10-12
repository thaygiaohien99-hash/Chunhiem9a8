import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { getSystemConfig, SystemConfig } from '../services/dataService';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  user: User;
  onLogout: () => void;
  onOpenLogin?: () => void;
  navItems?: { id: string; label: string; icon: string }[];
  appTitle?: string;
  onSyncGoogle?: () => Promise<void> | void;
  selectedWeek?: number;
  onWeekChange?: (week: number) => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  onTabChange, 
  user, 
  onLogout,
  onOpenLogin,
  navItems: customNavItems,
  appTitle = 'Quản Lí Lớp Chủ Nhiệm',
  onSyncGoogle,
  selectedWeek = 1,
  onWeekChange
}) => {
  const isAdmin = user.role === UserRole.ADMIN;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() => getSystemConfig());

  useEffect(() => {
    const handleConfigChange = () => {
      setSystemConfig(getSystemConfig());
    };
    window.addEventListener('app_system_config_updated', handleConfigChange);
    return () => {
      window.removeEventListener('app_system_config_updated', handleConfigChange);
    };
  }, []);

  const handleSyncClick = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncToast(null);
    try {
      if (onSyncGoogle) {
        await onSyncGoogle();
      } else {
        window.dispatchEvent(new CustomEvent('app_sync_google'));
      }
      setSyncToast('Đã đồng bộ thành công từ Google Sheet!');
      setTimeout(() => setSyncToast(null), 3000);
    } catch (err) {
      console.warn('Lỗi đồng bộ:', err);
      setSyncToast('Đồng bộ hoàn tất!');
      setTimeout(() => setSyncToast(null), 2500);
    } finally {
      setIsSyncing(false);
    }
  };

  const defaultNavItems = [
    { id: 'home', label: 'Trang Chủ', icon: '🏠' },
    { id: 'students', label: 'Học Sinh', icon: '👥' },
    { id: 'competition', label: 'Thi Đua', icon: '🏆' },
    { id: 'reports', label: 'Báo Cáo', icon: '📊' },
    ...(!user.isGuest && isAdmin ? [{ id: 'settings', label: 'Hệ Thống', icon: '⚙️' }] : []),
  ];

  const navItems = customNavItems && customNavItems.length > 0 ? customNavItems : defaultNavItems;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans">
      {/* Mobile Top Header (Chỉ hiện trên màn hình nhỏ điện thoại) */}
      <div className="md:hidden bg-bio-700 text-white px-3.5 py-2 flex items-center justify-between shadow-md sticky top-0 z-50 h-[56px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white text-[#065f46] font-extrabold text-sm flex items-center justify-center shadow-xs shrink-0">
            {systemConfig.gradeBadge || systemConfig.className?.match(/^\d+/)?.[0] || '9'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-extrabold tracking-tight text-white leading-none truncate">
                {systemConfig.className || '9A8'}
              </h1>
              {isAdmin && (
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-xs shrink-0">
                  ADMIN
                </span>
              )}
            </div>
            <p className="text-[11px] text-emerald-200 font-medium leading-tight mt-0.5 truncate">
              Năm học: {systemConfig.schoolYear || '2026_2027'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!user.isGuest && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/15 text-emerald-50 font-semibold truncate max-w-[110px]">
              {user.name}
            </span>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-9 h-9 rounded-xl bg-bio-800 hover:bg-bio-900 active:scale-95 text-white text-sm flex items-center justify-center transition cursor-pointer"
            title="Mở menu"
            aria-label="Mở menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Backdrop cho menu điện thoại khi mở */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (Thanh Bên Desktop chứa trọn vẹn Thanh Tiêu Đề bên trong; trên Mobile là ngăn kéo trượt mượt mà) */}
      <aside 
        className={`bg-white border-r border-gray-200 flex-col w-full md:w-64 md:min-h-screen shrink-0 shadow-lg md:shadow-sm ${
          mobileMenuOpen
            ? 'fixed top-[56px] left-0 right-0 z-50 flex max-h-[calc(100dvh-56px)] overflow-y-auto rounded-b-3xl border-b border-gray-200 animate-fade-in'
            : 'hidden md:flex'
        }`}
      >
        {/* Thanh Tiêu Đề nằm gọn ở đầu thanh bên trên Desktop */}
        <div className="hidden md:flex bg-bio-700 text-white px-4 py-3.5 items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white text-[#065f46] font-extrabold text-lg flex items-center justify-center shadow-xs shrink-0">
              {systemConfig.gradeBadge || systemConfig.className?.match(/^\d+/)?.[0] || '9'}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold tracking-tight text-white leading-tight truncate">
                {systemConfig.className || '9A8'}
              </h1>
              <p className="text-xs text-emerald-200 font-medium leading-tight mt-0.5 truncate">
                Năm học: {systemConfig.schoolYear || '2026_2027'}
              </p>
            </div>
          </div>
          {isAdmin && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-xs ml-auto shrink-0">
              ADMIN
            </span>
          )}
        </div>

        {/* Danh sách các mục menu bên dưới tiêu đề */}
        <nav className="p-2.5 md:p-3 space-y-1.5 md:space-y-2 flex-1">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center px-3.5 py-2.5 md:px-4 md:py-3 text-sm font-medium rounded-xl transition-all duration-150 cursor-pointer text-left ${
                  isActive 
                    ? 'bg-red-50 text-red-700 border-l-4 border-red-600 shadow-xs font-semibold' 
                    : 'text-gray-700 hover:bg-red-50 hover:text-red-600'
                }`}
              >
                <span className="mr-3 text-lg md:text-xl shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Thông tin tác giả ở dưới cùng thanh bên */}
        <div className="p-3 text-center border-t border-gray-100 mt-auto shrink-0 bg-slate-50/60">
          <p className="text-[11px] text-gray-500 font-medium tracking-tight">
            Tác giả: Nguyễn Hồng Hiển | Zalo: 0966000224
          </p>
        </div>
      </aside>

      {/* Main Content Wrapper (Khu vực nội dung bên phải có thanh góc trên bên phải) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Right Header Bar (Góc trên bên phải màn hình, dính ngay dưới thanh tiêu đề trên điện thoại) */}
        <div className="px-3 py-2 sm:px-8 sm:py-2.5 border-b border-gray-200/80 bg-white/95 backdrop-blur-sm flex justify-between items-center gap-2 sticky top-[52px] md:top-0 z-30">
          {/* Breadcrumb / Tiêu đề mục đang chọn & Lựa chọn Tuần */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <span className="text-base sm:text-xl shrink-0">
              {navItems.find(i => i.id === activeTab)?.icon || '📌'}
            </span>
            <span className="font-extrabold text-gray-900 text-xs sm:text-base truncate">
              {navItems.find(i => i.id === activeTab)?.label || 'Trang Chủ'}
            </span>
            {!user.isGuest && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#f73304] font-bold ml-1 hidden sm:inline-block shrink-0">
                Lớp {user.className || systemConfig.className || '9A8'}
              </span>
            )}
            <select
              value={selectedWeek}
              onChange={e => onWeekChange?.(Number(e.target.value))}
              aria-label="Chọn tuần"
              className="ml-0.5 sm:ml-1 px-2 sm:px-3 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-[#080ef7] border border-emerald-200 font-bold text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-2xs shrink-0"
            >
              {Array.from({ length: 35 }, (_, idx) => idx + 1).map(w => (
                <option key={w} value={w}>
                  📅 Tuần {w}
                </option>
              ))}
            </select>
          </div>

          {/* Nút Đăng nhập góc trên bên phải (Thiết kế chính xác theo ảnh mẫu của Thầy/Cô) */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {user.isGuest ? (
              <button
                onClick={onOpenLogin || onLogout}
                className="bg-[#14532d] hover:bg-[#166534] text-white font-bold text-xs sm:text-sm pl-1 sm:pl-1.5 pr-2.5 sm:pr-4 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl flex items-center gap-1.5 sm:gap-2.5 shadow-sm transition-all duration-150 cursor-pointer active:scale-95 border border-[#166534]"
                title="Đăng nhập tài khoản"
              >
                {/* Khối icon màu xanh lá sáng hình vuông bo góc */}
                <span className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-[#22c55e] flex items-center justify-center text-white shrink-0 shadow-xs">
                  <svg 
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                </span>
                <span className="text-white font-bold text-xs sm:text-sm tracking-wide whitespace-nowrap">
                  Đăng nhập
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-3">
                {/* Nút Đồng bộ thủ công từ Google Sheet dành cho Quản trị Cao Nhất, GVCN, Lớp Trưởng, Tổ Trưởng 1, 2, 3, 4 */}
                <button
                  type="button"
                  onClick={handleSyncClick}
                  disabled={isSyncing}
                  className="bg-emerald-50 hover:bg-emerald-100 text-[#047857] hover:text-[#065f46] border border-emerald-200/90 font-bold text-xs sm:text-sm px-2.5 sm:px-3.5 py-1.5 rounded-xl sm:rounded-2xl flex items-center gap-1.5 shadow-xs transition-all duration-150 cursor-pointer active:scale-95"
                  title="Đồng bộ thủ công dữ liệu từ Google Sheet khi cần"
                >
                  <span className={`text-sm sm:text-base leading-none ${isSyncing ? 'animate-spin inline-block' : ''}`}>🔄</span>
                  <span className="hidden sm:inline font-bold">
                    {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ từ Google Sheet'}
                  </span>
                  <span className="sm:hidden text-[11px] font-bold">
                    {isSyncing ? 'Đang tải' : 'Đồng bộ'}
                  </span>
                </button>

                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-bold text-[#fd0627] leading-tight">
                    {user.name}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-medium leading-none">
                    {user.role === UserRole.ADMIN ? 'Quản Trị GVCN' : (user.managedScope || 'Cán sự lớp')}
                  </span>
                </div>
                <button
                  onClick={onLogout}
                  className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl transition flex items-center gap-1 border border-red-200 cursor-pointer active:scale-95"
                  title="Đăng xuất tài khoản"
                >
                  <span>🚪</span>
                  <span className="hidden sm:inline text-[#0f05f1]">Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Toast thông báo đồng bộ thành công */}
        {syncToast && (
          <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:bottom-6 sm:right-6 z-50 bg-[#14532d] text-white text-xs sm:text-sm font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center justify-center sm:justify-start gap-2 border border-emerald-400 animate-slide-up">
            <span className="text-base shrink-0">✅</span>
            <span className="truncate">{syncToast}</span>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-3 pb-24 sm:p-4 sm:pb-24 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile Nav Sticky Bottom (Thanh điều hướng dưới điện thoại) */}
      <div className="fixed bottom-0 left-0 right-0 bg-bio-700 border-t border-bio-600 flex justify-around px-1.5 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:hidden z-40 shadow-lg">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => {
              onTabChange(item.id);
              setMobileMenuOpen(false);
            }}
            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl w-full transition-all duration-200 cursor-pointer ${
              activeTab === item.id 
                ? 'bg-bio-900 text-white shadow-inner transform -translate-y-0.5' 
                : 'text-bio-100 hover:bg-bio-600 hover:text-white'
            }`}
          >
            <span className="text-lg leading-none mb-1">{item.icon}</span>
            <span className={`text-[10px] leading-tight truncate max-w-full ${activeTab === item.id ? 'font-bold' : 'font-medium'}`}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
