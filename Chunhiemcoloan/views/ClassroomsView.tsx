import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { 
  SheetStudent, 
  ClassroomGroup, 
  fetchGoogleSheetStudents, 
  groupStudentsIntoClassrooms, 
  getGoogleSheetUrl 
} from '../services/dataService';

interface ClassroomsViewProps {
  user: User;
  onNavigateToTest?: () => void;
  onViewStudentPersonalized?: (student: SheetStudent) => void;
}

export const ClassroomsView: React.FC<ClassroomsViewProps> = ({ 
  user, 
  onNavigateToTest,
  onViewStudentPersonalized
}) => {
  const [students, setStudents] = useState<SheetStudent[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Modals state
  const [selectedClassroom, setSelectedClassroom] = useState<ClassroomGroup | null>(null);
  const [selectedAnalyticsClass, setSelectedAnalyticsClass] = useState<ClassroomGroup | null>(null);
  const [selectedStudentExamModal, setSelectedStudentExamModal] = useState<SheetStudent | null>(null);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const sheetUrl = getGoogleSheetUrl();

  const handleOpenStudentPersonalized = (st: SheetStudent) => {
    setSelectedClassroom(null);
    if (onViewStudentPersonalized) {
      onViewStudentPersonalized(st);
    }
  };

  const loadData = async (showNotification = false) => {
    setIsLoading(true);
    try {
      const fetchedStudents = await fetchGoogleSheetStudents();
      setStudents(fetchedStudents);
      const grouped = groupStudentsIntoClassrooms(fetchedStudents);
      setClassrooms(grouped);
      const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSyncTime(timeStr);
      if (showNotification) {
        showToast(`✅ Đã đồng bộ thành công ${fetchedStudents.length} học sinh từ Sheet 01_HOC_SINH!`);
      }
    } catch (e) {
      console.error("Lỗi tải danh sách lớp học:", e);
      if (showNotification) {
        showToast("⚠️ Chưa kết nối được Google Sheet trực tiếp, đang hiển thị bản lưu mới nhất.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const togglePassword = (studentId: string) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const handleCopyClassList = (cls: ClassroomGroup) => {
    const lines = [
      `DANH SÁCH LỚP: ${cls.className.toLowerCase().startsWith('lớp') ? cls.className : `Lớp ${cls.className}`} (${cls.grade} • 2026 – 2027)`,
      `Sĩ số: ${cls.totalStudents} học sinh`,
      `Thời điểm xuất: ${new Date().toLocaleString('vi-VN')}`,
      '--------------------------------------------------',
      'STT | Mã HS | Họ và Tên | SĐT | Trạng Thái',
      ...cls.students.map((st, idx) => 
        `${idx + 1}. [${st.id}] ${st.name} - ${st.phone} (${st.status || 'Mở'})`
      )
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    showToast(`📋 Đã sao chép danh sách lớp ${cls.className} vào bộ nhớ tạm!`);
  };

  const handleExportCSV = (cls: ClassroomGroup) => {
    const headers = ["STT", "ID_HocSinh", "Ho_Va_Ten", "Khoi_Lop", "So_Dien_Thoai", "Trang_Thai", "Tong_Diem", "Ngay_Dang_Ky"];
    const rows = cls.students.map((st, idx) => [
      idx + 1,
      `"${st.id}"`,
      `"${st.name}"`,
      `"${st.className}"`,
      `"${st.phone}"`,
      `"${st.status || 'Mở'}"`,
      st.totalScore || 0,
      `"${st.registeredDate || ''}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Danh_Sach_Lop_${cls.className}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`📥 Đã tải file danh sách lớp ${cls.className}.csv`);
  };

  // Format Display Title: "Lớp 12T7" or "Lớp 10T6"
  const formatClassDisplayTitle = (rawName: string) => {
    const trimmed = (rawName || '').trim();
    if (trimmed.toLowerCase().startsWith('lớp ')) {
      return trimmed;
    }
    return `Lớp ${trimmed}`;
  };

  // Filter classrooms & students
  const filteredClassrooms = classrooms.filter(cls => {
    const matchGrade = selectedGradeFilter === 'ALL' || cls.grade === selectedGradeFilter;
    if (!matchGrade) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();

    // Check class name
    if (cls.className.toLowerCase().includes(term)) return true;

    // Check any student in class
    return cls.students.some(s => 
      s.name.toLowerCase().includes(term) ||
      s.phone.includes(term) ||
      s.id.toLowerCase().includes(term)
    );
  });

  const totalAllStudents = students.length;
  const totalActive = students.filter(s => {
    const st = (s.status || '').toLowerCase();
    return st !== 'đóng' && st !== 'dong' && st !== 'khóa' && st !== 'khoa';
  }).length;

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl 2xl:max-w-[1600px] mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 bg-emerald-700 text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce border border-emerald-500">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white hover:opacity-80 text-sm font-bold">✕</button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-green-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="p-2.5 bg-white/20 rounded-2xl text-2xl backdrop-blur-sm">🏫</span>
            <span className="bg-emerald-400/30 text-emerald-200 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-300/30">
              Admin Giáo Viên
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Quản Lý Lớp Học</h2>
          <p className="text-emerald-100 text-sm mt-1 max-w-2xl">
            Tự động đồng bộ từ <span className="font-semibold text-white">Google Sheet (Sheet 01_HOC_SINH)</span>. Học sinh cùng Khối lớp được gom nhóm thành từng lớp học tương ứng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={() => loadData(true)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm rounded-xl shadow-lg transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Đồng bộ dữ liệu mới nhất từ Google Sheet"
          >
            <span className={isLoading ? "animate-spin text-lg" : "text-lg"}>🔄</span>
            <span>{isLoading ? "Đang đồng bộ..." : "Đồng bộ từ Sheet"}</span>
          </button>

          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm rounded-xl border border-white/25 transition no-underline cursor-pointer"
            title="Mở Google Sheet trên tab mới"
          >
            <span>📊 Mở Sheet 01</span>
            <span className="text-xs">↗️</span>
          </a>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Grade tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto p-1 bg-gray-100 rounded-xl">
          {['ALL', 'Khối 10', 'Khối 11', 'Khối 12'].map(grade => (
            <button
              key={grade}
              onClick={() => setSelectedGradeFilter(grade)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer uppercase ${
                selectedGradeFilter === grade 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
              }`}
            >
              {grade === 'ALL' ? 'TẤT CẢ KHỐI' : grade.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên học sinh, lớp, SĐT..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50"
          />
          <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Classrooms Grid (Mẫu thẻ chuẩn theo ảnh yêu cầu) */}
      {isLoading ? (
        <div className="bg-white p-16 rounded-3xl border border-gray-100 text-center shadow-sm">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600 font-semibold text-sm">Đang đồng bộ danh sách lớp và học sinh từ Google Sheet...</p>
        </div>
      ) : filteredClassrooms.length === 0 ? (
        <div className="bg-white p-16 rounded-3xl border border-gray-100 text-center shadow-sm">
          <span className="text-4xl mb-3 block">🔍</span>
          <h3 className="text-lg font-bold text-gray-800">Không tìm thấy lớp học nào</h3>
          <p className="text-gray-500 text-xs mt-1">Hãy thử xóa bộ lọc hoặc kiểm tra dữ liệu ở Sheet 01_HOC_SINH.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClassrooms.map((cls) => {
            const gradeText = cls.grade.toUpperCase();
            const classTitle = formatClassDisplayTitle(cls.className);

            return (
              <div 
                key={cls.className}
                className="bg-white rounded-2xl p-6 border border-indigo-100/80 shadow-sm hover:shadow-md hover:border-indigo-300 transition duration-200 flex flex-col justify-between"
              >
                {/* Top Row: KHỐI (Purple) & 2026 - 2027 (Gray) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase">
                      {gradeText}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      2026 – 2027
                    </span>
                  </div>

                  {/* Title Row: Lớp 12T7 / Lớp 10T6 */}
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 tracking-tight">
                    {classTitle}
                  </h3>

                  {/* Sĩ số Row with User Group Icon */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
                    <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>
                      Sĩ số: <strong className="font-bold text-gray-900">{cls.totalStudents}</strong> học sinh
                    </span>
                  </div>
                </div>

                {/* Bottom Row: 2 Buttons [Phân tích] and [Học sinh] (Chuẩn thiết kế ảnh mẫu) */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => setSelectedAnalyticsClass(cls)}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Phân tích</span>
                  </button>

                  <button 
                    onClick={() => setSelectedClassroom(cls)}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                    </svg>
                    <span>Học sinh</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Chi Tiết Học Sinh (Khi bấm nút "🎓 Học sinh") */}
      {selectedClassroom && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-indigo-800 via-indigo-900 to-purple-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="p-3 bg-white/20 rounded-2xl text-2xl">🎓</span>
                <div>
                  <h3 className="text-2xl font-black">
                    Danh Sách Học Sinh: {formatClassDisplayTitle(selectedClassroom.className)}
                  </h3>
                  <p className="text-indigo-200 text-xs">
                    {selectedClassroom.grade} • Niên khóa 2026 – 2027 • Sĩ số: {selectedClassroom.totalStudents} học sinh
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyClassList(selectedClassroom)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Sao chép danh sách"
                >
                  <span>📋 Sao chép</span>
                </button>
                <button
                  onClick={() => handleExportCSV(selectedClassroom)}
                  className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-sm cursor-pointer"
                  title="Tải file CSV"
                >
                  <span>📥 Xuất CSV</span>
                </button>
                <button
                  onClick={() => setSelectedClassroom(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm font-bold transition ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: Student Table */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100/90 text-gray-700 font-bold border-b border-gray-200">
                      <th className="py-3.5 px-4 rounded-l-xl w-14 text-center">STT</th>
                      <th className="py-3.5 px-4">Họ và Tên</th>
                      <th className="py-3.5 px-4">Số điện thoại</th>
                      <th className="py-3.5 px-4 text-center">Số bài thi (kiểm tra) đã làm</th>
                      <th className="py-3.5 px-4 rounded-r-xl text-center">Hồ Sơ Năng Lực Số</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedClassroom.students.map((st, idx) => {
                      const examsCount = st.examsCompleted || (st.examHistory?.length || 0);

                      return (
                        <tr key={st.id + idx} className="hover:bg-indigo-50/40 transition">
                          <td className="py-4 px-4 text-gray-400 font-mono text-center font-bold">{idx + 1}</td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-sm">
                                {st.name.charAt(0) || '👤'}
                              </div>
                              <div>
                                <span className="font-bold text-gray-900 block text-sm">{st.name}</span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  Mã HS: {st.id} • Lớp {st.className}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 font-mono font-medium text-gray-700">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-lg text-xs font-semibold">
                              <span>📞</span> {st.phone}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            {examsCount > 0 ? (
                              <button
                                onClick={() => setSelectedStudentExamModal(st)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full font-bold text-xs transition cursor-pointer active:scale-95"
                                title="Bấm để xem chi tiết các bài thi"
                              >
                                <span>📝</span> <b>{examsCount}</b> bài đã làm
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                                <span>⚪</span> 0 bài đã làm
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-center">
                            <button
                              onClick={() => handleOpenStudentPersonalized(st)}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 cursor-pointer hover:shadow-lg"
                              title={`Liên kết đến Tiến Trình Học Tập của ${st.name}`}
                            >
                              <span>🎯 Tiến Trình Học Tập</span>
                              <span>→</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span>💡 Dữ liệu học sinh và kết quả thi được liên kết tự động từ Google Sheet (Sheet 01 và Sheet 02).</span>
              <button
                onClick={() => setSelectedClassroom(null)}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1.1: Chi Tiết Lịch Sử Bài Thi Của Học Sinh */}
      {selectedStudentExamModal && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-scale-up">
            <div className="p-5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
              <div>
                <h4 className="font-black text-lg">Lịch Sử Bài Thi: {selectedStudentExamModal.name}</h4>
                <p className="text-emerald-100 text-xs">
                  Mã HS: {selectedStudentExamModal.id} • SĐT: {selectedStudentExamModal.phone}
                </p>
              </div>
              <button
                onClick={() => setSelectedStudentExamModal(null)}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-xs font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 max-h-80 overflow-y-auto space-y-2.5">
              {(!selectedStudentExamModal.examHistory || selectedStudentExamModal.examHistory.length === 0) ? (
                <div className="text-center py-6 text-gray-400 text-xs italic">
                  Chưa có lịch sử làm bài kiểm tra.
                </div>
              ) : (
                selectedStudentExamModal.examHistory.map((ex: any, idx: number) => (
                  <div key={ex.turnId || idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-gray-900 block">{ex.examTitle || 'Bài kiểm tra Sinh học'}</span>
                      <span className="text-[10px] text-gray-400">
                        {ex.submittedAt || ex.date ? new Date(ex.submittedAt || ex.date).toLocaleDateString('vi-VN') : 'Mới hoàn thành'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-emerald-600 block">{ex.score} điểm</span>
                      <span className="text-[10px] text-gray-500">
                        Đúng {ex.correctCount || Math.round(ex.score)}/{ex.totalQuestions || 10} câu
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedStudentExamModal(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Phân Tích Lớp Học (Khi bấm nút "📊 Phân tích") */}
      {selectedAnalyticsClass && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="p-3 bg-white/20 rounded-2xl text-2xl">📊</span>
                <div>
                  <h3 className="text-2xl font-black">
                    Báo Cáo Phân Tích: {formatClassDisplayTitle(selectedAnalyticsClass.className)}
                  </h3>
                  <p className="text-blue-100 text-xs">
                    {selectedAnalyticsClass.grade} • Niên khóa 2026 – 2027 • Tổng điểm tích lũy: {selectedAnalyticsClass.totalScore} điểm
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedAnalyticsClass(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Analytics Overview */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 text-center">
                  <span className="text-[11px] font-bold text-indigo-700 uppercase block mb-1">Sĩ Số Lớp</span>
                  <div className="text-2xl font-black text-indigo-950">{selectedAnalyticsClass.totalStudents} <span className="text-xs font-normal text-gray-500">học sinh</span></div>
                  <span className="text-[10px] text-indigo-600 mt-1 block">100% kết nối LMS</span>
                </div>

                <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100 text-center">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase block mb-1">Tài Khoản Mở</span>
                  <div className="text-2xl font-black text-emerald-950">{selectedAnalyticsClass.activeStudents} <span className="text-xs font-normal text-gray-500">em</span></div>
                  <span className="text-[10px] text-emerald-600 mt-1 block">Sẵn sàng làm bài</span>
                </div>

                <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-100 text-center">
                  <span className="text-[11px] font-bold text-amber-700 uppercase block mb-1">Điểm Tích Lũy</span>
                  <div className="text-2xl font-black text-amber-950">{selectedAnalyticsClass.totalScore} <span className="text-xs font-normal text-gray-500">điểm</span></div>
                  <span className="text-[10px] text-amber-600 mt-1 block">Xếp hạng toàn khối</span>
                </div>
              </div>

              {/* Members Performance Preview */}
              <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200/80">
                <h4 className="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2">
                  <span>📈</span> Thống kê tiến độ từng học sinh trong lớp:
                </h4>
                <div className="space-y-2">
                  {selectedAnalyticsClass.students.map((st, i) => (
                    <div key={st.id + i} className="bg-white p-3 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                          {i + 1}
                        </span>
                        <div>
                          <span className="font-bold text-gray-900 block">{st.name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">Mã: {st.id} • SĐT: {st.phone}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-black text-amber-600 text-sm block">{st.totalScore || 0} điểm</span>
                        <span className="text-[10px] text-emerald-600 font-medium">Đã sẵn sàng thi</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Teaching Suggestion */}
              <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-100 text-xs text-blue-900 leading-relaxed flex items-start gap-3">
                <span className="text-xl">💡</span>
                <div>
                  <strong className="font-bold block mb-0.5">Khuyến nghị sư phạm cho {formatClassDisplayTitle(selectedAnalyticsClass.className)}:</strong>
                  Thầy/Cô có thể tạo đề kiểm tra chuyên đề hoặc giao bài rèn luyện thích ứng theo chuẩn GDPT 2018 cho lớp tại mục <b>Kiểm Tra, Đánh Giá</b>. Kết quả thi sẽ tự động ghi nhận vào Sheet <b>02_KET_QUA_THI</b>.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              {onNavigateToTest ? (
                <button
                  onClick={() => {
                    setSelectedAnalyticsClass(null);
                    onNavigateToTest();
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>📝 Giao đề kiểm tra cho lớp</span>
                  <span>→</span>
                </button>
              ) : <div />}

              <button
                onClick={() => setSelectedAnalyticsClass(null)}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
