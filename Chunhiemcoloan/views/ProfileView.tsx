import React, { useState } from 'react';
import { User, UserLevel, UserRole } from '../types';
import { calculateLevel, getGoogleScriptUrl, getGoogleSheetUrl, setGoogleSheetUrl, DEFAULT_GOOGLE_SHEET_URL } from '../services/dataService';
import { generateExportCode } from '../services/geminiService';

interface ProfileViewProps {
  user: User;
  onOpenLogin?: () => void;
  onNavigateToTest?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, onOpenLogin, onNavigateToTest }) => {
  // Admin Export Code State
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportType, setExportType] = useState<'THEME' | 'PAGE' | null>(null);

  // Admin Google Sheet Management State
  const [sheetUrl, setSheetUrl] = useState(() => getGoogleSheetUrl());
  const [isEditingSheetUrl, setIsEditingSheetUrl] = useState(false);
  const [tempSheetUrl, setTempSheetUrl] = useState('');
  const [sheetSaveToast, setSheetSaveToast] = useState<string | null>(null);

  // Student History States
  const [searchHistoryTerm, setSearchHistoryTerm] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'HIGH' | 'PASS' | 'LOW'>('ALL');
  const [expandedExamIndex, setExpandedExamIndex] = useState<number | null>(null);

  // --- ADMIN VIEW: System Configuration & Maintenance ---
  if (user.role === UserRole.ADMIN) {
    const handleClearCache = () => {
      if (confirm('Hành động này sẽ xóa toàn bộ dữ liệu lưu tạm trên trình duyệt (bao gồm phiên đăng nhập). Bạn có chắc chắn?')) {
        localStorage.clear();
        window.location.reload();
      }
    };

    const handleOpenEditSheetUrl = () => {
      setTempSheetUrl(sheetUrl);
      setIsEditingSheetUrl(true);
    };

    const handleSaveSheetUrl = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const trimmed = tempSheetUrl.trim();
      if (!trimmed.startsWith('http')) {
        alert('Vui lòng nhập đường link Google Sheet hợp lệ (bắt đầu bằng https://docs.google.com/...)');
        return;
      }
      const updated = setGoogleSheetUrl(trimmed);
      setSheetUrl(updated);
      setIsEditingSheetUrl(false);
      setSheetSaveToast('✅ Đã cập nhật thành công liên kết Quản lý Google Sheet!');
      setTimeout(() => setSheetSaveToast(null), 4000);
    };

    const handleResetDefaultSheetUrl = () => {
      const updated = setGoogleSheetUrl('');
      setSheetUrl(updated);
      setTempSheetUrl(updated);
      setIsEditingSheetUrl(false);
      setSheetSaveToast('🔄 Đã khôi phục liên kết Google Sheet về mặc định.');
      setTimeout(() => setSheetSaveToast(null), 4000);
    };

    const handleGenerateCode = async (type: 'THEME' | 'PAGE') => {
        setIsGenerating(true);
        setExportType(type);
        setGeneratedCode(''); // Clear old code
        try {
            const code = await generateExportCode(type);
            setGeneratedCode(code);
        } catch (e) {
            alert("Lỗi khi tạo mã");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopyCode = () => {
        if (!generatedCode) return;
        navigator.clipboard.writeText(generatedCode);
        alert("Đã sao chép mã vào bộ nhớ tạm!");
    };

    const handleDownloadCode = () => {
        if (!generatedCode) return;
        const blob = new Blob([generatedCode], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = exportType === 'THEME' ? "template_lms_blog.xml" : "widget_trac_nghiem.html";
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Admin Identity Card */}
        <div className="bg-white rounded-2xl shadow-sm p-8 flex flex-col md:flex-row items-center gap-6 border-l-4 border-red-600">
          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center text-4xl shadow-inner shrink-0">
            🛡️
          </div>
          <div className="text-center md:text-left flex-1">
            <h2 className="text-2xl font-bold text-gray-800">{user.name}</h2>
            <p className="text-gray-500 font-medium mb-2">Quản Trị Viên Hệ Thống</p>
            <span className="inline-block px-3 py-1 bg-red-600 text-white text-xs font-bold rounded uppercase tracking-wider">
              Super Admin
            </span>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-sm text-gray-400">Phiên bản hệ thống</p>
            <p className="font-mono font-bold text-gray-600">v1.3.0 (Flash 3.0 Optimized)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* System Status */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
              <span>📡</span> Trạng thái kết nối
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Máy chủ dữ liệu (Google Apps Script)</p>
                <div className="flex items-center gap-2 bg-green-50 p-3 rounded border border-green-200">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-green-700 font-mono text-xs truncate w-full">
                    {getGoogleScriptUrl().substring(0, 45)}...
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">Dịch vụ AI (Gemini)</p>
                <div className="flex items-center gap-2 bg-blue-50 p-3 rounded border border-blue-200">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                  <span className="text-blue-700 font-medium text-sm">Đang hoạt động (Flash 3.0)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Database & Maintenance Tools */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><span>🛠️</span> Quản trị & Cơ sở dữ liệu</span>
              <button 
                onClick={handleOpenEditSheetUrl}
                className="text-xs text-bio-600 hover:text-bio-700 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>✏️ Đổi Link Sheet</span>
              </button>
            </h3>

            {sheetSaveToast && (
              <div className="mb-3 p-2.5 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg animate-fade-in flex items-center gap-2">
                <span>{sheetSaveToast}</span>
              </div>
            )}

            {isEditingSheetUrl ? (
              <div className="mb-4 p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800">Cập nhật Link Quản lý Google Sheet:</span>
                  <button 
                    onClick={() => setIsEditingSheetUrl(false)} 
                    className="text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ✕ Đóng
                  </button>
                </div>
                <input 
                  type="text" 
                  value={tempSheetUrl}
                  onChange={(e) => setTempSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="w-full text-xs p-2.5 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-mono"
                />
                <p className="text-[11px] text-gray-500 leading-tight">
                  💡 Mẹo: Mở file Google Sheets chứa 5 Sheet (<span className="font-semibold text-emerald-700">01_HOC_SINH, 02_KET_QUA_THI, 03_LO_HONG, 04_CA_NHAN_HOA, 05_DASHBOARD</span>), sao chép toàn bộ thanh địa chỉ trình duyệt và dán vào đây.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button 
                    onClick={handleSaveSheetUrl}
                    className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
                  >
                    💾 Lưu liên kết
                  </button>
                  <button 
                    onClick={handleResetDefaultSheetUrl}
                    className="py-1.5 px-2.5 bg-white hover:bg-gray-100 text-gray-600 border border-gray-300 text-xs rounded-lg transition"
                    title="Khôi phục link ban đầu"
                  >
                    🔄 Mặc định
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {/* Google Sheet Link - User Configured */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    <div>
                      <span className="font-bold text-emerald-900 text-sm block">Quản lý Google Sheet</span>
                      <span className="text-[11px] text-emerald-700">Chứa 5 Sheet: Học sinh (Phát, Duyên...), Điểm thi, Dashboard</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleOpenEditSheetUrl}
                    className="p-1.5 text-xs text-emerald-700 hover:bg-emerald-100 rounded-md transition"
                    title="Chỉnh sửa liên kết Google Sheet"
                  >
                    ✏️
                  </button>
                </div>

                <a 
                  href={sheetUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition no-underline"
                >
                  <span>Mở Google Sheet Quản Lý (Tab mới)</span>
                  <span className="text-sm">↗️</span>
                </a>
              </div>

              <button 
                onClick={() => window.location.reload()}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 border border-gray-200 transition"
              >
                <span className="text-gray-700 font-medium text-sm">Làm mới ứng dụng (Reload)</span>
                <span className="text-lg">🔄</span>
              </button>
              
              <button 
                onClick={handleClearCache}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 transition"
              >
                <span className="font-bold text-sm">Xóa Cache & Đăng xuất</span>
                <span className="text-lg">🗑️</span>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              * Hệ thống đã được nâng cấp lên mô hình Flash 3.0 cho hiệu suất tối ưu.
            </p>
          </div>
        </div>

        {/* New Export Code Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
              <span>📤</span> Xuất Code (AI Generated)
            </h3>
            <p className="text-sm text-gray-500 mb-4">
                Sử dụng AI mô hình Flash 3.0 để tạo mã nguồn trang web hoặc widget tích hợp với tốc độ cực nhanh.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <button
                    onClick={() => handleGenerateCode('THEME')}
                    disabled={isGenerating}
                    className="p-4 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold flex flex-col items-center gap-2 transition disabled:opacity-50"
                >
                    <span className="text-2xl">🌐</span>
                    <span>Xuất HTML Blog (Theme)</span>
                    <span className="text-[10px] font-normal opacity-70 text-center">Tạo toàn bộ giao diện cho Blogspot</span>
                </button>
                <button
                    onClick={() => handleGenerateCode('PAGE')}
                    disabled={isGenerating}
                    className="p-4 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold flex flex-col items-center gap-2 transition disabled:opacity-50"
                >
                    <span className="text-2xl">🧩</span>
                    <span>Xuất HTML Trang Blog</span>
                    <span className="text-[10px] font-normal opacity-70 text-center">Tạo widget/đoạn mã nhúng cho bài viết</span>
                </button>
            </div>

            {isGenerating && (
                <div className="text-center py-8 text-gray-500 animate-pulse">
                    🤖 Flash 3.0 đang viết mã... vui lòng đợi...
                </div>
            )}

            {!isGenerating && generatedCode && (
                <div className="animate-fade-in space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-700">
                            Kết quả ({exportType === 'THEME' ? 'Blog Theme' : 'Page Snippet'}):
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleCopyCode}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-xs font-bold text-gray-700 border border-gray-300"
                            >
                                📋 Copy
                            </button>
                            <button 
                                onClick={handleDownloadCode}
                                className="px-3 py-1.5 bg-bio-600 hover:bg-bio-700 rounded text-xs font-bold text-white shadow"
                            >
                                ⬇️ Tải xuống (.txt)
                            </button>
                        </div>
                    </div>
                    <textarea 
                        className="w-full h-64 p-3 border border-gray-300 rounded-lg bg-gray-900 text-green-400 font-mono text-xs focus:ring-2 focus:ring-bio-500 outline-none"
                        value={generatedCode}
                        readOnly
                    />
                </div>
            )}
        </div>

        {/* Author Credit */}
        <div className="text-center py-8 opacity-70 hover:opacity-100 transition">
          <p className="text-sm text-gray-500">Hệ thống được phát triển và vận hành bởi</p>
          <p className="text-lg font-bold text-red-800 mt-1">Tác giả Nguyễn Hồng Hiển</p>
          <p className="text-xs text-gray-400 mt-2">© 2024 Sinh Học LMS. All rights reserved.</p>
        </div>
      </div>
    );
  }

  // --- STUDENT VIEW (Lịch Sử Kiểm Tra & Học Tập) ---
  const safeHistory = Array.isArray(user?.examHistory) ? user.examHistory : [];
  const currentLevel = calculateLevel(user?.totalScore || 0, safeHistory);

  const getExamStats = (h: any) => {
    const details = Array.isArray(h?.details) ? h.details : [];
    const totalQ = details.length > 0 ? details.length : 10;
    const scoreVal = typeof h?.score === 'number' ? h.score : 0;
    const scaled10 = details.length > 0 
      ? Math.round((scoreVal / details.length) * 100) / 10 
      : (scoreVal <= 10 ? scoreVal : Math.round((scoreVal / 15) * 100) / 10);
    const percent = details.length > 0 
      ? Math.round((scoreVal / details.length) * 100) 
      : Math.round((scaled10 / 10) * 100);
    
    let gradeLabel = 'Cần cố gắng';
    let gradeColor = 'text-red-700 bg-red-50 border-red-200';
    if (scaled10 >= 9.0) {
      gradeLabel = 'Xuất sắc';
      gradeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
    } else if (scaled10 >= 8.0) {
      gradeLabel = 'Giỏi';
      gradeColor = 'text-green-700 bg-green-50 border-green-200';
    } else if (scaled10 >= 6.5) {
      gradeLabel = 'Khá';
      gradeColor = 'text-blue-700 bg-blue-50 border-blue-200';
    } else if (scaled10 >= 5.0) {
      gradeLabel = 'Đạt chuẩn';
      gradeColor = 'text-amber-700 bg-amber-50 border-amber-200';
    }

    return { totalQ, scaled10, percent, gradeLabel, gradeColor };
  };

  const totalExams = safeHistory.length;
  const averageScore = totalExams > 0 
    ? (safeHistory.reduce((acc, h) => acc + getExamStats(h).scaled10, 0) / totalExams).toFixed(1)
    : '0.0';
  const goodExamsCount = safeHistory.filter(h => getExamStats(h).scaled10 >= 8.0).length;

  const filteredHistory = safeHistory.filter((h, idx) => {
    const stats = getExamStats(h);
    const matchSearch = !searchHistoryTerm || (h.examTitle && h.examTitle.toLowerCase().includes(searchHistoryTerm.toLowerCase()));
    if (!matchSearch) return false;

    if (historyFilter === 'HIGH') return stats.scaled10 >= 8.0;
    if (historyFilter === 'PASS') return stats.scaled10 >= 5.0 && stats.scaled10 < 8.0;
    if (historyFilter === 'LOW') return stats.scaled10 < 5.0;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">
      {user.isGuest && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div>
            <h4 className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
              <span>👤</span> Chế độ Khách (Chưa đăng nhập)
            </h4>
            <p className="text-xs text-amber-700 mt-1">
              Các bài kiểm tra của bạn đang được lưu tạm trên thiết bị này. Đăng nhập để đồng bộ lịch sử vĩnh viễn và vinh danh trên Bảng Xếp Hạng toàn quốc.
            </p>
          </div>
          <button
            onClick={() => {
              if (onOpenLogin) {
                onOpenLogin();
              } else {
                localStorage.removeItem('current_user_phone');
                window.location.reload();
              }
            }}
            className="px-4 py-2 bg-bio-600 hover:bg-bio-700 text-white rounded-xl text-xs font-bold transition shadow whitespace-nowrap cursor-pointer"
          >
            Đăng nhập ngay
          </button>
        </div>
      )}

      {/* Header Banner - Học sinh & Lịch sử */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-bio-600 via-teal-600 to-emerald-600 z-0"></div>
        <div className="relative z-10 pt-4 sm:pt-6 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 text-center sm:text-left">
            <div className="w-24 h-24 bg-white rounded-2xl p-1.5 shadow-lg shrink-0 border-2 border-white">
              <div className="w-full h-full bg-bio-50 text-bio-700 rounded-xl flex items-center justify-center text-4xl shadow-inner">
                🧬
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-bio-100 text-bio-800 text-[11px] font-black uppercase tracking-wider mb-1">
                <span>📜</span> Lịch Sử Bài Kiểm Tra
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-gray-800">{user.name}</h2>
              <div className="text-gray-500 font-medium text-xs sm:text-sm flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-1">
                <span>{user.className || 'Học viên'}</span>
                {user.studentId && (
                  <span className="bg-bio-50 text-bio-800 font-bold px-2 py-0.5 rounded-md border border-bio-200">
                    Mã HS: {user.studentId}
                  </span>
                )}
                <span className="text-gray-300">•</span>
                <span className="font-semibold text-gray-600">Đã lưu trữ {totalExams} bài kiểm tra</span>
              </div>
            </div>
          </div>
          
          <div className="shrink-0 text-center sm:text-right">
            <span className="text-[11px] font-bold text-gray-400 block mb-1 uppercase tracking-wider">Danh hiệu học tập</span>
            <div className="inline-block px-4 py-1.5 bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200 font-black text-sm shadow-sm">
              🏆 {currentLevel}
            </div>
          </div>
        </div>
      </div>

      {/* Thống kê nhanh tổng quan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
          <div className="text-2xl mb-1">📝</div>
          <div className="text-2xl sm:text-3xl font-black text-gray-800">{totalExams}</div>
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1">Bài đã kiểm tra</div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
          <div className="text-2xl mb-1">🎯</div>
          <div className="text-2xl sm:text-3xl font-black text-bio-700">{averageScore}</div>
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1">Điểm trung bình (10)</div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
          <div className="text-2xl mb-1">⭐</div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600">{goodExamsCount}</div>
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1">Đạt Khá - Giỏi (≥8.0)</div>
        </div>
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
          <div className="text-2xl mb-1">⚡</div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600">{user.totalScore || 0}</div>
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1">Điểm tích lũy EXP</div>
        </div>
      </div>

      {/* Thân danh sách lịch sử bài làm */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
          <div>
            <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
              <span>🕒</span> Nhật Ký & Lịch Sử Bài Làm Đã Lưu
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Hệ thống tự động ghi nhận toàn bộ bài kiểm tra, điểm số và chi tiết đáp án bạn đã hoàn thành.
            </p>
          </div>

          {onNavigateToTest && (
            <button
              onClick={onNavigateToTest}
              className="px-4 py-2 bg-bio-600 hover:bg-bio-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <span>➕</span>
              <span>Làm bài kiểm tra mới</span>
            </button>
          )}
        </div>

        {/* Thanh tìm kiếm và bộ lọc */}
        {totalExams > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 text-sm">
                🔍
              </span>
              <input
                type="text"
                value={searchHistoryTerm}
                onChange={(e) => setSearchHistoryTerm(e.target.value)}
                placeholder="Tìm kiếm bài kiểm tra đã làm theo tên..."
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-bio-500 focus:bg-white transition"
              />
              {searchHistoryTerm && (
                <button
                  onClick={() => setSearchHistoryTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setHistoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  historyFilter === 'ALL'
                    ? 'bg-bio-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Tất cả ({totalExams})
              </button>
              <button
                onClick={() => setHistoryFilter('HIGH')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  historyFilter === 'HIGH'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Giỏi (≥8.0)
              </button>
              <button
                onClick={() => setHistoryFilter('PASS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  historyFilter === 'PASS'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                Đạt (5 - 7.9)
              </button>
              <button
                onClick={() => setHistoryFilter('LOW')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  historyFilter === 'LOW'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                Cần ôn lại (&lt;5.0)
              </button>
            </div>
          </div>
        )}

        {/* Nội dung danh sách */}
        {totalExams === 0 ? (
          <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-2xl space-y-4">
            <div className="text-5xl opacity-40">📜</div>
            <div className="space-y-1">
              <h4 className="font-bold text-gray-700 text-base">Chưa có bài kiểm tra nào trong lịch sử</h4>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Khi bạn hoàn thành bất kỳ bài thi nào trong mục "Kiểm Tra, Đánh Giá", kết quả và chi tiết từng câu trả lời sẽ được tự động lưu lại tại đây để ôn tập.
              </p>
            </div>
            {onNavigateToTest && (
              <button
                onClick={onNavigateToTest}
                className="px-5 py-2.5 bg-bio-600 hover:bg-bio-700 text-white rounded-xl text-xs font-bold transition shadow cursor-pointer inline-flex items-center gap-2"
              >
                <span>Bắt đầu làm bài kiểm tra ngay</span>
                <span>→</span>
              </button>
            )}
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-xs">
            Không tìm thấy bài kiểm tra nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map((h, i) => {
              const stats = getExamStats(h);
              const isExpanded = expandedExamIndex === i;
              const formattedDate = h.date 
                ? new Date(h.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : 'Vừa xong';
              const formattedTime = h.date 
                ? new Date(h.date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div 
                  key={i} 
                  className="border border-gray-200 rounded-2xl p-4 sm:p-5 bg-white hover:border-bio-300 transition-all shadow-sm space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-bio-700 bg-bio-50 px-2.5 py-0.5 rounded-full border border-bio-200">
                          #{filteredHistory.length - i}
                        </span>
                        <h4 className="font-bold text-gray-800 text-sm sm:text-base">
                          {h.examTitle || 'Bài kiểm tra Sinh Học'}
                        </h4>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${stats.gradeColor}`}>
                          {stats.gradeLabel}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-2">
                        <span>📅 {formattedDate} {formattedTime && `• ${formattedTime}`}</span>
                        {h.examId && <span className="opacity-70">• Mã đề: {h.examId}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-center">
                      <div className="text-right">
                        <div className="text-2xl font-black text-gray-800 leading-none">
                          {stats.scaled10}<span className="text-xs text-gray-400 font-bold">/10</span>
                        </div>
                        <div className="text-[11px] font-bold text-gray-500 mt-1">
                          {h.score}/{stats.totalQ} câu đúng ({stats.percent}%)
                        </div>
                      </div>

                      {h.details && h.details.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedExamIndex(isExpanded ? null : i)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border ${
                            isExpanded 
                              ? 'bg-gray-100 text-gray-700 border-gray-300' 
                              : 'bg-bio-50 text-bio-700 border-bio-200 hover:bg-bio-100'
                          }`}
                        >
                          <span>{isExpanded ? 'Ẩn chi tiết' : 'Xem đáp án'}</span>
                          <span>{isExpanded ? '▲' : '▼'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chi tiết từng câu hỏi trong bài làm (nếu có lưu chi tiết) */}
                  {isExpanded && h.details && h.details.length > 0 && (
                    <div className="pt-3 border-t border-gray-100 space-y-3 animate-fade-in bg-gray-50 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 p-4 sm:p-5 rounded-b-2xl">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                        <span>Bảng đối chiếu đáp án ({h.details.length} câu)</span>
                        <span className="text-emerald-700">Đúng: {h.score} • Sai: {stats.totalQ - h.score}</span>
                      </div>

                      <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                        {h.details.map((q: any, qIdx: number) => {
                          const isCorrect = q.isCorrect;
                          return (
                            <div 
                              key={qIdx} 
                              className={`p-3 rounded-xl border text-xs bg-white ${
                                isCorrect 
                                  ? 'border-emerald-200 bg-emerald-50/20' 
                                  : 'border-red-200 bg-red-50/20'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <span className="font-bold text-gray-800">
                                  Câu {qIdx + 1}: {q.questionText || `Câu hỏi #${qIdx + 1}`}
                                </span>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  isCorrect 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                    : 'bg-red-100 text-red-800 border border-red-200'
                                }`}>
                                  {isCorrect ? '✅ Chính xác' : '❌ Sai'}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-100">
                                <div>
                                  <span className="text-[10px] text-gray-400 block font-semibold uppercase">Bạn đã chọn:</span>
                                  <span className={`font-bold ${isCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                                    {q.userAnswer || '(Bỏ trống)'}
                                  </span>
                                </div>
                                {!isCorrect && (
                                  <div>
                                    <span className="text-[10px] text-gray-400 block font-semibold uppercase">Đáp án đúng:</span>
                                    <span className="font-bold text-emerald-700">
                                      {q.correctAnswer}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};