import React, { useState, useEffect } from 'react';
import { User } from '../types';
import {
  getSystemConfig,
  saveSystemConfig,
  DEFAULT_SYSTEM_CONFIG,
  getGoogleScriptUrl,
  setGoogleScriptUrl,
  GOOGLE_SCRIPT_URL,
  getGoogleSheetUrl
} from '../services/dataService';

interface SystemSettingsViewProps {
  user: User;
  onSyncGoogle?: () => Promise<void> | void;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({
  user,
  onSyncGoogle
}) => {
  const initialSysConfig = getSystemConfig();

  // State Thông tin Lớp, Năm học, Ký hiệu Khối, GVCN, Trường
  const [className, setClassName] = useState<string>(initialSysConfig.className);
  const [schoolYear, setSchoolYear] = useState<string>(initialSysConfig.schoolYear);
  const [gradeBadge, setGradeBadge] = useState<string>(initialSysConfig.gradeBadge);
  const [teacherName, setTeacherName] = useState<string>(initialSysConfig.teacherName);
  const [schoolName, setSchoolName] = useState<string>(initialSysConfig.schoolName);

  // State Cấu hình Google Apps Script Web App
  const [scriptUrl, setScriptUrl] = useState<string>(() => getGoogleScriptUrl());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  useEffect(() => {
    const handleUrlUpdate = (e: any) => {
      if (e?.detail?.url) setScriptUrl(e.detail.url);
    };
    window.addEventListener('app_google_script_url_updated', handleUrlUpdate);
    return () => window.removeEventListener('app_google_script_url_updated', handleUrlUpdate);
  }, []);

  const handleSaveScriptUrl = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = scriptUrl.trim();
    if (!clean.startsWith('https://script.google.com/')) {
      showToast('⚠️ URL Apps Script phải bắt đầu bằng https://script.google.com/');
      return;
    }
    const saved = setGoogleScriptUrl(clean);
    setScriptUrl(saved);
    showToast('💾 Đã lưu URL Apps Script mới và xóa bộ đệm cũ!');
    handleTriggerSync();
  };

  const handleResetScriptUrl = () => {
    const reset = setGoogleScriptUrl(GOOGLE_SCRIPT_URL);
    setScriptUrl(reset);
    showToast('🔄 Đã khôi phục URL Google Apps Script về mặc định!');
    handleTriggerSync();
  };

  const handleTriggerSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    showToast('🔄 Đang gửi yêu cầu đồng bộ dữ liệu tới Google Apps Script...');
    try {
      if (onSyncGoogle) {
        await onSyncGoogle();
      } else {
        window.dispatchEvent(new CustomEvent('app_sync_google'));
      }
      showToast('✅ Đã đồng bộ dữ liệu thành công với Google Apps Script!');
    } catch {
      showToast('Đã phát tín hiệu đồng bộ hoàn tất!');
    } finally {
      setIsSyncing(false);
    }
  };

  // Tự động gợi ý số Khối khi người dùng nhập tên Lớp (VD: 10T6 -> 10, 12T7 -> 12)
  const handleClassNameChange = (val: string) => {
    setClassName(val);
    const matchGrade = val.trim().match(/^\d+/);
    if (matchGrade && matchGrade[0]) {
      setGradeBadge(matchGrade[0]);
    }
  };

  // Lưu thông tin Lớp, Năm học, Ký hiệu Khối, GVCN, Trường
  const handleSaveClassAndYearInfo = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanClass = className.trim() || DEFAULT_SYSTEM_CONFIG.className;
    const cleanYear = schoolYear.trim() || DEFAULT_SYSTEM_CONFIG.schoolYear;
    const cleanBadge =
      gradeBadge.trim() || cleanClass.match(/^\d+/)?.[0] || DEFAULT_SYSTEM_CONFIG.gradeBadge;

    const updated = saveSystemConfig({
      className: cleanClass,
      schoolYear: cleanYear,
      gradeBadge: cleanBadge,
      teacherName: teacherName.trim(),
      schoolName: schoolName.trim()
    });

    setClassName(updated.className);
    setSchoolYear(updated.schoolYear);
    setGradeBadge(updated.gradeBadge);
    setTeacherName(updated.teacherName);
    setSchoolName(updated.schoolName);

    window.dispatchEvent(new CustomEvent('app_data_updated'));
    showToast(`✅ Đã cập nhật thông tin: Lớp ${updated.className} • Năm học: ${updated.schoolYear}`);
  };

  // Khôi phục thông tin Lớp & Năm học về mặc định
  const handleResetClassInfo = () => {
    const resetCfg = saveSystemConfig(DEFAULT_SYSTEM_CONFIG);
    setClassName(resetCfg.className);
    setSchoolYear(resetCfg.schoolYear);
    setGradeBadge(resetCfg.gradeBadge);
    setTeacherName(resetCfg.teacherName);
    setSchoolName(resetCfg.schoolName);
    showToast(`🔄 Đã khôi phục thông tin Lớp (${resetCfg.className}) và Năm học (${resetCfg.schoolYear}) mặc định.`);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Toast thông báo */}
      {toastMsg && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:bottom-6 sm:right-6 z-50 bg-[#14532d] text-white text-xs sm:text-sm font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-emerald-400">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* KHỐI 1: THÔNG TIN LỚP HỌC & NĂM HỌC (THAY ĐỔI TRỰC TIẾP TIÊU ĐỀ & HỆ THỐNG) */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200/90 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center text-2xl shrink-0">
              🏫
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Thông tin Lớp học & Năm học
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thay đổi Tên Lớp, Năm học, Ký hiệu Khối hiển thị trên thanh tiêu đề và trong các biểu mẫu báo cáo
              </p>
            </div>
          </div>

          {/* Xem trước trực tiếp (Live Preview) Khung Tiêu Đề */}
          <div className="flex items-center gap-3 bg-[#065f46] text-white px-4 py-2.5 rounded-2xl shadow-sm shrink-0 self-start md:self-auto">
            <div className="w-10 h-10 rounded-xl bg-white text-[#065f46] font-extrabold text-base flex items-center justify-center shadow-2xs shrink-0">
              {gradeBadge || className?.match(/^\d+/)?.[0] || '9'}
            </div>
            <div className="min-w-0 pr-1">
              <div className="text-base font-extrabold tracking-tight text-white leading-tight truncate">
                {className || '9A8'}
              </div>
              <div className="text-[11px] text-emerald-200 font-medium leading-tight mt-0.5 truncate">
                Năm học: {schoolYear || '2026_2027'}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveClassAndYearInfo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* 1. Tên Lớp */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Tên Lớp <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={className}
                onChange={e => handleClassNameChange(e.target.value)}
                placeholder="VD: 9A8, 10A6..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 focus:bg-white border border-slate-200/90 text-sm font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
              <span className="block text-[11px] text-slate-400 mt-1">
                Hiển thị chính trên tiêu đề & báo cáo
              </span>
            </div>

            {/* 2. Năm Học */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Năm Học <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={schoolYear}
                onChange={e => setSchoolYear(e.target.value)}
                placeholder="VD: 2026_2027"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 focus:bg-white border border-slate-200/90 text-sm font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
              <span className="block text-[11px] text-slate-400 mt-1">
                Hiển thị dòng &ldquo;Năm học: ...&rdquo;
              </span>
            </div>

            {/* 3. Ký hiệu Khối (Biểu tượng góc trái) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Ký hiệu Khối (Ô vuông)
              </label>
              <input
                type="text"
                maxLength={4}
                value={gradeBadge}
                onChange={e => setGradeBadge(e.target.value)}
                placeholder="VD: 12, 10, 11"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 focus:bg-white border border-slate-200/90 text-sm font-extrabold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
              <span className="block text-[11px] text-slate-400 mt-1">
                Biểu tượng ô trắng góc trái tiêu đề
              </span>
            </div>

            {/* 4. Giáo viên chủ nhiệm */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Giáo viên chủ nhiệm
              </label>
              <input
                type="text"
                value={teacherName}
                onChange={e => setTeacherName(e.target.value)}
                placeholder="Nhập tên GVCN..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 focus:bg-white border border-slate-200/90 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
              <span className="block text-[11px] text-slate-400 mt-1">
                Thông tin quản lý lớp chủ nhiệm
              </span>
            </div>

            {/* 5. Tên Trường */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Đơn vị / Trường học
              </label>
              <input
                type="text"
                value={schoolName}
                onChange={e => setSchoolName(e.target.value)}
                placeholder="Nhập tên trường..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 focus:bg-white border border-slate-200/90 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
              <span className="block text-[11px] text-slate-400 mt-1">
                Lưu trong hồ sơ hệ thống lớp
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
            <button
              type="button"
              onClick={handleResetClassInfo}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              Khôi phục mặc định ({DEFAULT_SYSTEM_CONFIG.className} • {DEFAULT_SYSTEM_CONFIG.schoolYear})
            </button>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#047857] hover:bg-[#065f46] active:scale-95 text-white text-xs sm:text-sm font-extrabold shadow-sm transition cursor-pointer flex items-center gap-2"
            >
              <span>💾</span>
              <span>Lưu thông tin Lớp & Năm học</span>
            </button>
          </div>
        </form>
      </div>

      {/* KHỐI 2: CẤU HÌNH MÁY CHỦ GOÔNG APPS SCRIPT (ĐỒNG BỘ 4 SHEETS) */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center text-2xl shrink-0">
              ☁️
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Máy chủ Google Apps Script (Web App)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Địa chỉ Web App xử lý đồng bộ 2 chiều dữ liệu 4 Sheet (01_QUAN_LI, 02_HOC_SINH, 03_THI_DUA_35_TUAN, 04_THI_DUA)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-extrabold shadow-sm transition cursor-pointer flex items-center gap-2 shrink-0 self-start sm:self-auto disabled:opacity-50"
          >
            <span className={isSyncing ? "animate-spin" : ""}>🔄</span>
            <span>{isSyncing ? "Đang đồng bộ..." : "Đồng bộ dữ liệu ngay"}</span>
          </button>
        </div>

        <form onSubmit={handleSaveScriptUrl} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              URL Web App Apps Script Mặc Định
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={scriptUrl}
                onChange={e => setScriptUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 focus:bg-white border border-slate-200/90 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition"
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-extrabold transition cursor-pointer shrink-0"
              >
                💾 Lưu & Đồng bộ
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 flex-wrap text-xs">
            <span className="text-slate-500 text-[11px]">
              {scriptUrl === GOOGLE_SCRIPT_URL ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <span>●</span> Đang sử dụng URL mặc định của hệ thống
                </span>
              ) : (
                <span className="text-amber-700 font-semibold flex items-center gap-1">
                  <span>●</span> Đang sử dụng URL tùy chỉnh của giáo viên
                </span>
              )}
            </span>

            {scriptUrl !== GOOGLE_SCRIPT_URL && (
              <button
                type="button"
                onClick={handleResetScriptUrl}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer text-xs"
              >
                Khôi phục URL gốc
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Thông tin tác giả ở cuối thẻ Hệ Thống */}
      <div className="text-center py-2">
        <p className="text-xs sm:text-sm text-slate-500 font-medium">
          Tác giả: <span className="font-bold text-slate-700">Nguyễn Hồng Hiển</span> | Zalo: <span className="font-bold text-emerald-700">0966000224</span>
        </p>
      </div>
    </div>
  );
};
