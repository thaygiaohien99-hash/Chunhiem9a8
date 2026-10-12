import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { Layout } from './components/Layout';
import { AuthView } from './views/AuthView';
import { HomeView } from './views/HomeView';
import { StudentsView } from './views/StudentsView';
import { CompetitionView } from './views/CompetitionView';
import { ReportsView } from './views/ReportsView';
import { SystemSettingsView } from './views/SystemSettingsView';
import {
  fetchBehaviorRulesFromGoogleSheet,
  fetchManagersFromGoogleSheet,
  fetchStudentsFromGoogleSheet,
  fetchCompetitionFromGoogleSheet,
  prewarmGoogleScriptConnection,
  getSystemConfig,
  saveSystemConfig
} from './services/dataService';

const createDefaultGuestUser = (): User => {
  const cfg = getSystemConfig();
  return {
    phone: 'guest',
    name: 'Người dùng',
    className: cfg.className || '9A8',
    role: UserRole.STUDENT,
    totalScore: 0,
    examHistory: [],
    isGuest: true
  };
};

const isUserTeacherOrAdmin = (u: any): boolean => {
  if (!u) return false;
  if (u.role === UserRole.ADMIN) return true;
  const phone = (u.phone || '').toString().trim().replace(/^0+/, '');
  if (
    phone === '966000224' || u.phone === '0966000224' ||
    phone === '792428799' || u.phone === '0792428799' ||
    phone === '974781337' || u.phone === '0974781337'
  ) return true;
  const name = (u.name || '').toString().toLowerCase();
  if (name.includes('admin') || name.includes('quản trị') || name.includes('quan tri') || name.includes('giáo viên') || name.includes('giao vien') || name.includes('thầy') || name.includes('cô') || name.includes('hiển') || name.includes('phi') || name.includes('loan')) return true;
  const cls = (u.className || '').toString().toLowerCase();
  if (cls.includes('admin') || cls.includes('giáo viên') || cls.includes('giao vien')) return true;
  return false;
};

const getInitialUser = (): User => {
  try {
    const session = localStorage.getItem('current_user_phone');
    if (session) {
      if (session === 'guest') {
        const guestData = localStorage.getItem('user_guest');
        if (guestData) {
          const parsed = JSON.parse(guestData);
          const cfg = getSystemConfig();
          if (cfg.className) parsed.className = cfg.className;
          if (isUserTeacherOrAdmin(parsed)) parsed.role = UserRole.ADMIN;
          return parsed;
        }
      } else {
        const userData = localStorage.getItem(`user_${session}`);
        if (userData) {
          const parsed = JSON.parse(userData);
          if (isUserTeacherOrAdmin(parsed)) parsed.role = UserRole.ADMIN;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error('Error loading session:', err);
  }
  return createDefaultGuestUser();
};

const navItems = [
  { id: 'home', label: 'Trang Chủ', icon: '🏠' },
  { id: 'students', label: 'Học Sinh', icon: '👥' },
  { id: 'competition', label: 'Thi Đua', icon: '🏆' },
  { id: 'reports', label: 'Báo Cáo', icon: '📊' },
  { id: 'settings', label: 'Hệ Thống', icon: '⚙️' },
];

const App: React.FC = () => {
  const [user, setUser] = useState<User>(getInitialUser);
  const [activeTab, setActiveTab] = useState('home');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number>(() => {
    const saved = Number(localStorage.getItem('app_selected_week'));
    return saved >= 1 && saved <= 35 ? saved : 1;
  });

  const handleWeekChange = (week: number) => {
    setSelectedWeek(week);
    localStorage.setItem('app_selected_week', String(week));
    window.dispatchEvent(new CustomEvent('app_data_updated', { detail: { selectedWeek: week } }));
  };

  // Hỗ trợ liên kết chuyển tab (Ví dụ từ cảnh báo sang thi đua)
  useEffect(() => {
    const handleTabSwitch = (e: any) => {
      if (e?.detail?.tab) {
        setActiveTab(e.detail.tab);
      }
      if (e?.detail?.week) {
        handleWeekChange(Number(e.detail.week));
      }
    };
    window.addEventListener('app_change_tab', handleTabSwitch);
    return () => window.removeEventListener('app_change_tab', handleTabSwitch);
  }, []);

  // Lắng nghe cập nhật system config để đồng bộ tên lớp cho tài khoản khách (chưa đăng nhập)
  useEffect(() => {
    const handleConfigUpdated = (e: any) => {
      const nextCfg = e?.detail || getSystemConfig();
      if (user.isGuest && nextCfg?.className && user.className !== nextCfg.className) {
        const updatedGuest = { ...user, className: nextCfg.className };
        setUser(updatedGuest);
        localStorage.setItem('user_guest', JSON.stringify(updatedGuest));
      }
    };
    window.addEventListener('app_system_config_updated', handleConfigUpdated);
    return () => window.removeEventListener('app_system_config_updated', handleConfigUpdated);
  }, [user]);

  const handleGlobalSync = async (targetUser?: User) => {
    const currentUser = targetUser || user;
    // 1. Gửi sự kiện cập nhật dữ liệu tới các thẻ (Học Sinh, Thi Đua...)
    window.dispatchEvent(new CustomEvent('app_sync_google', { detail: { user: currentUser } }));

    // Đồng bộ danh mục hành vi thi đua, học sinh và thi đua từ Google Sheet
    fetchBehaviorRulesFromGoogleSheet(true).catch(() => {});
    fetchStudentsFromGoogleSheet(true).then((stus) => {
      if (Array.isArray(stus) && stus.length > 0 && stus[0].className) {
        const stuCls = String(stus[0].className).trim();
        const currentCfg = getSystemConfig();
        if (currentCfg.className !== stuCls) {
          saveSystemConfig({
            className: stuCls,
            gradeBadge: stuCls.match(/^\d+/)?.[0] || currentCfg.gradeBadge
          });
        }
      }
    }).catch(() => {});
    fetchCompetitionFromGoogleSheet(true).catch(() => {});

    // Đồng bộ thông tin chức vụ / lớp từ Sheet 01_QUAN_LI
    try {
      const managers = await fetchManagersFromGoogleSheet(true);
      if (Array.isArray(managers) && managers.length > 0) {
        // Tự động cập nhật thông tin lớp và giáo viên chủ nhiệm từ Google Sheet
        const gvcn = managers.find((m: any) => m.role === 'GVCN' || m.id === 'GV01') || managers[0];
        const resolvedClass = (gvcn && gvcn.className) ? String(gvcn.className).trim() : '';
        if (resolvedClass) {
          const cfg = getSystemConfig();
          saveSystemConfig({
            className: resolvedClass,
            teacherName: gvcn.name || cfg.teacherName,
            gradeBadge: resolvedClass.match(/^\d+/)?.[0] || cfg.gradeBadge
          });

          if (currentUser.isGuest && currentUser.className !== resolvedClass) {
            const updatedGuest = { ...currentUser, className: resolvedClass };
            setUser(updatedGuest);
            localStorage.setItem('user_guest', JSON.stringify(updatedGuest));
          }
        }

        if (!currentUser.isGuest && currentUser.phone) {
          const cleanPhone = currentUser.phone.replace(/[\s.-]/g, '');
          const found = managers.find(
            (m: any) => String(m.phone || '').replace(/^0+/, '') === cleanPhone.replace(/^0+/, '')
          );
          if (found) {
            const roleRaw = String(found.role || '').trim().toUpperCase();
            let resolvedScope = String(found.managedScope || currentUser.managedScope || '').trim();
            const combined = `${roleRaw} ${resolvedScope} ${found.note || ''}`.toLowerCase();
            const isAdminRole = roleRaw === 'GVCN' || roleRaw === 'ADMIN';
            if (!isAdminRole && !combined.includes('lớp trưởng') && !combined.includes('lop_truong')) {
              const matchTo = combined.match(/(?:to_truong_|tổ trưởng|to truong|tổ|tt|to)\s*_?(\d+)/i) || combined.match(/\b([1-9]|1[0-2])\b/);
              if (matchTo) {
                resolvedScope = `Tổ ${matchTo[1]}`;
              }
            }

            const updatedUser: User = {
              ...currentUser,
              name: found.name || currentUser.name,
              className: found.className || currentUser.className,
              role: isAdminRole ? UserRole.ADMIN : currentUser.role,
              managedScope: resolvedScope || currentUser.managedScope
            };
            setUser(updatedUser);
            localStorage.setItem(`user_${updatedUser.phone}`, JSON.stringify(updatedUser));
          }
        }
      }
    } catch (e) {
      console.warn('Lỗi làm mới hồ sơ cán sự:', e);
    }

    if (currentUser.isGuest) {
      prewarmGoogleScriptConnection();
    }
  };

  const handleLogin = (u: User) => {
    localStorage.setItem('current_user_phone', u.phone);
    localStorage.setItem(`user_${u.phone}`, JSON.stringify(u));
    setUser(u);
    setShowAuthModal(false);

    // Kích hoạt đồng bộ ngay lập tức (0ms delay) sau khi đăng nhập
    handleGlobalSync(u);
  };

  // Tự động đồng bộ 2 chiều ngay khi tải ứng dụng cho mọi phiên làm việc
  useEffect(() => {
    handleGlobalSync(user);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('current_user_phone');
    setUser(createDefaultGuestUser());
    if (activeTab === 'settings') {
      setActiveTab('home');
    }
  };

  const canAccessSystemTab = !user.isGuest && isUserTeacherOrAdmin(user);

  const visibleNavItems = canAccessSystemTab
    ? navItems
    : navItems.filter(item => item.id !== 'settings');

  useEffect(() => {
    if (!canAccessSystemTab && activeTab === 'settings') {
      setActiveTab('home');
    }
  }, [canAccessSystemTab, activeTab]);

  const handleTabChange = (tab: string) => {
    if (tab === 'settings' && !canAccessSystemTab) return;
    setActiveTab(tab);
  };

  return (
    <>
      <Layout 
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
        user={user} 
        onLogout={handleLogout}
        onOpenLogin={() => setShowAuthModal(true)}
        navItems={visibleNavItems}
        appTitle="Quản Lí Lớp Chủ Nhiệm"
        onSyncGoogle={handleGlobalSync}
        selectedWeek={selectedWeek}
        onWeekChange={handleWeekChange}
      >
        {/* Thẻ Trang Chủ hiển thị 5 thẻ tổng quan theo đúng mẫu yêu cầu */}
        <div className={activeTab === 'home' ? 'block' : 'hidden'}>
          <HomeView user={user} selectedWeek={selectedWeek} />
        </div>

        {/* Thẻ Học Sinh giữ nguyên trạng thái trong bộ nhớ, chuyển tab tức thì 0 giây */}
        <div className={activeTab === 'students' ? 'block' : 'hidden'}>
          <StudentsView user={user} />
        </div>

        {/* Thẻ Thi Đua giữ nguyên trạng thái trong bộ nhớ, đồng bộ số liệu thực từ Sheet 02, 03, 04 */}
        <div className={activeTab === 'competition' ? 'block' : 'hidden'}>
          <CompetitionView user={user} selectedWeek={selectedWeek} onWeekChange={handleWeekChange} />
        </div>

        {/* Thẻ Báo Cáo: Xem trước & Tải xuống Excel (.xlsx) theo Tuần, Tổ, Học kì 1, Học kì 2, Cả năm */}
        <div className={activeTab === 'reports' ? 'block' : 'hidden'}>
          <ReportsView user={user} selectedWeek={selectedWeek} onWeekChange={handleWeekChange} />
        </div>

        {/* Thẻ Hệ Thống: Chỉ hiện cho Admin cao cấp & GVCN */}
        {canAccessSystemTab && (
          <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
            <SystemSettingsView user={user} onSyncGoogle={handleGlobalSync} />
          </div>
        )}
      </Layout>

      {/* Login modal (tùy chọn khi bấm Đăng nhập) */}
      {showAuthModal && (
        <AuthView 
          onLoginSuccess={handleLogin} 
          onClose={() => setShowAuthModal(false)}
          isModal={true}
        />
      )}
    </>
  );
};

export default App;
