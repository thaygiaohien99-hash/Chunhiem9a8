import React, { useState } from 'react';
import { StudentCompetencyProfile, User } from '../types';
import { evaluateRemedialProgress, saveCompetencyProfile } from '../services/diagnosticService';
import { submitExamResultToCloud } from '../services/dataService';

interface DiagnosticLearningCenterProps {
  profile: StudentCompetencyProfile;
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  onClose: () => void;
  onRetakeExam?: () => void;
}

export const DiagnosticLearningCenter: React.FC<DiagnosticLearningCenterProps> = ({
  profile: initialProfile,
  user,
  onUpdateUser,
  onClose,
  onRetakeExam
}) => {
  const [profile, setProfile] = useState<StudentCompetencyProfile>(initialProfile);
  const [activeTab, setActiveTab] = useState<'ANALYSIS' | 'COMPETENCY' | 'REMEDIAL' | 'PRACTICE' | 'PROGRESS'>('ANALYSIS');
  
  // Practice state
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>(profile.practiceAnswers || {});
  const [isSubmittingPractice, setIsSubmittingPractice] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleSelectPracticeAnswer = (qId: string, val: string) => {
    setPracticeAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const handleSubmitPractice = async () => {
    setIsSubmittingPractice(true);
    try {
      const updated = evaluateRemedialProgress(profile, practiceAnswers);
      setProfile(updated);
      saveCompetencyProfile(updated, user.phone);

      // Cập nhật vào User state
      const updatedUser: User = {
        ...user,
        examHistory: (user.examHistory || []).map(h => {
          if (h.examId === updated.examId) {
            return {
              ...h,
              competencyProfile: updated
            };
          }
          return h;
        })
      };
      onUpdateUser(updatedUser);

      // Đồng bộ lên Cloud nếu đã đăng nhập
      if (!user.isGuest && user.phone !== 'guest') {
        const fakeResult = {
          examId: updated.examId,
          examTitle: updated.examTitle,
          score: updated.practiceScore || updated.initialScore,
          date: new Date().toISOString(),
          details: updated.practiceQuestions.map(q => ({
            questionId: q.id,
            questionText: q.text,
            userAnswer: practiceAnswers[q.id] || '',
            correctAnswer: q.correctAnswer,
            isCorrect: practiceAnswers[q.id] === q.correctAnswer
          }))
        };
        await submitExamResultToCloud(user.phone, fakeResult as any, {
          studentId: user.studentId,
          name: user.name,
          className: user.className,
          phone: user.phone
        });
      }

      showToast('🎉 Đã đánh giá tiến bộ và cập nhật hồ sơ năng lực thành công!');
      setActiveTab('PROGRESS');
    } catch (e) {
      console.warn("Lỗi đồng bộ kết quả luyện tập:", e);
      showToast('Đã lưu kết quả luyện tập vào bộ nhớ máy!');
    } finally {
      setIsSubmittingPractice(false);
    }
  };

  const nbPercent = profile.cognitiveStats.nhanBiet.total > 0
    ? Math.round((profile.cognitiveStats.nhanBiet.correct / profile.cognitiveStats.nhanBiet.total) * 100)
    : 100;
  const thPercent = profile.cognitiveStats.thongHieu.total > 0
    ? Math.round((profile.cognitiveStats.thongHieu.correct / profile.cognitiveStats.thongHieu.total) * 100)
    : 100;
  const vdPercent = profile.cognitiveStats.vanDung.total > 0
    ? Math.round((profile.cognitiveStats.vanDung.correct / profile.cognitiveStats.vanDung.total) * 100)
    : 100;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[94vh] animate-scale-up">
        {/* HEADER MODAL */}
        <div className="bg-gradient-to-r from-emerald-800 via-bio-700 to-teal-800 text-white p-6 sm:p-7 relative shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="bg-white/20 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-sm border border-white/20">
                  🧬 HỆ THỐNG PHÂN TÍCH NĂNG LỰC & BÙ ĐẮP LỖ HỔNG
                </span>
                <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                  profile.status === 'XUẤT_SẮC' ? 'bg-amber-400 text-amber-950 font-black' :
                  profile.status === 'ĐÃ_TIẾN_BỘ' ? 'bg-emerald-300 text-emerald-950 font-black' :
                  'bg-rose-400 text-rose-950 font-black'
                }`}>
                  {profile.status === 'XUẤT_SẮC' ? '⭐ Nắm vững kiến thức' :
                   profile.status === 'ĐÃ_TIẾN_BỘ' ? '📈 Đã tiến bộ vượt bậc' :
                   '⚠️ Cần củng cố lỗ hổng'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                {profile.lessonName || profile.examTitle}
              </h2>
              <p className="text-xs sm:text-sm text-emerald-100 font-medium mt-1">
                Học sinh: <span className="font-bold text-white">{profile.studentName || user.name}</span> ({profile.studentClass || user.className || 'Lớp 12'}) • Điểm thi: <span className="font-black text-amber-300 text-base">{profile.score10}/10 đ</span> ({profile.initialScore}/{profile.totalQuestions} câu)
              </p>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {onRetakeExam && (
                <button
                  onClick={onRetakeExam}
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border border-white/30"
                  title="Làm lại đề thi gốc"
                >
                  <span>🚀</span> Làm Lại Đề
                </button>
              )}
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-black text-lg transition-all cursor-pointer border border-white/20"
                title="Đóng bảng phân tích"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 5 TAB ĐIỀU HƯỚNG SƯ PHẠM */}
          <div className="flex gap-2 overflow-x-auto pt-5 border-t border-white/20 mt-4 no-scrollbar">
            {[
              { id: 'ANALYSIS', label: '1. Phân Tích Câu Trả Lời & Lỗi Sai', icon: '🔍' },
              { id: 'COMPETENCY', label: '2. Hồ Sơ Năng Lực & Cảnh Báo', icon: '📋' },
              { id: 'REMEDIAL', label: '3. Bài Học Củng Cố & Ví Dụ', icon: '💡' },
              { id: 'PRACTICE', label: '4. Luyện Tập Bù Đắp Lỗ Hổng', icon: '🎯' },
              { id: 'PROGRESS', label: '5. Đánh Giá Tiến Bộ', icon: '📈' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-bio-800 shadow-lg scale-102 ring-2 ring-white/50'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* TOAST THÔNG BÁO */}
        {toast && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold text-center shadow-md animate-fade-in shrink-0">
            {toast}
          </div>
        )}

        {/* NỘI DUNG CUỘN CHÍNH */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/60">
          
          {/* ==================== TAB 1: PHÂN TÍCH CÂU TRẢ LỜI & PHÂN LOẠI LỖI ==================== */}
          {activeTab === 'ANALYSIS' && (
            <div className="space-y-6 animate-fade-in">
              {/* Tóm tắt nhanh */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-2xl font-black shrink-0">
                    ❌
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Số câu làm sai</span>
                    <div className="text-2xl font-black text-rose-600">{profile.errorItems.length} câu</div>
                    <span className="text-xs text-slate-500 font-medium">trên tổng số {profile.totalQuestions} câu hỏi</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl font-black shrink-0">
                    🎯
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mức độ yếu nhất</span>
                    <div className="text-xl font-black text-amber-600">{profile.weakLevel}</div>
                    <span className="text-xs text-slate-500 font-medium">Cần tập trung củng cố</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl font-black shrink-0">
                    💡
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Lỗ hổng kiến thức</span>
                    <div className="text-sm font-black text-slate-800 truncate max-w-[200px]" title={profile.weakTopics.join(', ')}>
                      {profile.weakTopics[0] || 'Nắm vững'}
                    </div>
                    <span className="text-xs text-slate-500 font-medium">{profile.weakTopics.length} chủ đề cần lưu ý</span>
                  </div>
                </div>
              </div>

              {/* Danh sách phân tích chi tiết từng câu hỏi bị sai */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <span>⚠️</span> Chi Tiết Phân Tích Lỗi Sai & Vì Sao Em Làm Sai?
                  </h3>
                  <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200">
                    {profile.errorItems.length === 0 ? 'Xuất sắc (Đúng 100%)' : `Ghi nhận ${profile.errorItems.length} lỗi cần sửa`}
                  </span>
                </div>

                {profile.errorItems.length === 0 ? (
                  <div className="bg-white p-12 rounded-3xl border border-emerald-200 text-center space-y-3">
                    <span className="text-5xl">🎉</span>
                    <h4 className="text-lg font-black text-emerald-800">Chúc mừng! Bạn đã làm đúng toàn bộ câu hỏi!</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Bạn đã nắm vững toàn bộ kiến thức và kỹ năng của bài học. Hãy chuyển sang Tab Luyện Tập để thử sức thêm các câu hỏi vận dụng nâng cao.
                    </p>
                  </div>
                ) : (
                  profile.errorItems.map((err, idx) => (
                    <div key={err.questionId || idx} className="bg-white p-6 rounded-3xl border-2 border-rose-100 hover:border-rose-300 transition-all shadow-xs space-y-4">
                      {/* Tiêu đề câu hỏi */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <span className="bg-rose-600 text-white px-3 py-1 rounded-xl text-xs font-black shrink-0 mt-0.5">
                            Câu {idx + 1}
                          </span>
                          <p className="font-black text-slate-900 text-sm sm:text-base leading-relaxed">
                            {err.questionText}
                          </p>
                        </div>
                        <span className={`text-[11px] font-black px-3 py-1 rounded-full border shrink-0 ${
                          err.cognitiveLevel === 'NHAN_BIET' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                          err.cognitiveLevel === 'THONG_HIEU' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                          'bg-purple-50 text-purple-800 border-purple-200'
                        }`}>
                          Mức độ: {err.cognitiveLevel === 'NHAN_BIET' ? 'Nhận biết' : err.cognitiveLevel === 'THONG_HIEU' ? 'Thông hiểu' : 'Vận dụng'}
                        </span>
                      </div>

                      {/* So sánh phương án */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
                          <span className="text-[10px] font-black uppercase text-rose-700 block mb-1">
                            ❌ Phương án em đã chọn:
                          </span>
                          <span className="font-bold text-rose-950 text-sm">
                            {err.userAnswer || 'Chưa trả lời'}
                          </span>
                        </div>

                        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                          <span className="text-[10px] font-black uppercase text-emerald-700 block mb-1">
                            ✓ Đáp án đúng của đề:
                          </span>
                          <span className="font-black text-emerald-950 text-sm">
                            {err.correctAnswer}
                          </span>
                        </div>
                      </div>

                      {/* Phân loại vì sao sai */}
                      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-xs font-black text-amber-900 uppercase tracking-wide">
                          <span>🔍</span>
                          <span>Vì sao em làm sai?</span>
                        </div>
                        <p className="text-xs text-amber-950 font-semibold leading-relaxed">
                          {err.reasonWhyWrong}
                        </p>
                        <div className="pt-2 border-t border-amber-200/80 flex items-start gap-2 text-xs text-slate-700 font-medium">
                          <span className="font-black text-slate-900 shrink-0">💡 Lời giải chi tiết:</span>
                          <span>{err.explanation}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 2: HỒ SƠ NĂNG LỰC & CẢNH BÁO SƯ PHẠM ==================== */}
          {activeTab === 'COMPETENCY' && (
            <div className="space-y-6 animate-fade-in">
              {/* Thẻ đánh giá tổng quan */}
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <span>📊</span> Hồ Sơ Năng Lực Học Sinh Theo Chuẩn GDPT 2018
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Đo lường năng lực nhận thức qua 3 cấp độ: Nhận biết, Thông hiểu và Vận dụng.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-right">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Trạng thái năng lực</span>
                    <span className="text-sm font-black text-bio-700 uppercase">{profile.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                {/* Thanh tiến trình 3 cấp độ nhận thức */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Nhận biết */}
                  <div className="p-5 rounded-3xl bg-blue-50/70 border border-blue-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-blue-900">1. Nhận biết</span>
                      <span className="text-xs font-black text-blue-700">{nbPercent}%</span>
                    </div>
                    <div className="w-full bg-blue-200/60 rounded-full h-3 overflow-hidden">
                      <div className="bg-blue-600 h-3 rounded-full transition-all duration-700" style={{ width: `${nbPercent}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>Đúng: {profile.cognitiveStats.nhanBiet.correct}/{profile.cognitiveStats.nhanBiet.total} câu</span>
                      <span className="text-rose-600">Sai: {profile.cognitiveStats.nhanBiet.wrong}</span>
                    </div>
                    <p className="text-[11px] text-blue-950 font-medium">
                      {nbPercent >= 80 ? '✓ Đạt chuẩn nhận biết định nghĩa và thuật ngữ SGK.' : '⚠️ Cần đọc lại định nghĩa cơ bản SGK.'}
                    </p>
                  </div>

                  {/* Thông hiểu */}
                  <div className="p-5 rounded-3xl bg-emerald-50/70 border border-emerald-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-emerald-900">2. Thông hiểu</span>
                      <span className="text-xs font-black text-emerald-700">{thPercent}%</span>
                    </div>
                    <div className="w-full bg-emerald-200/60 rounded-full h-3 overflow-hidden">
                      <div className="bg-emerald-600 h-3 rounded-full transition-all duration-700" style={{ width: `${thPercent}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>Đúng: {profile.cognitiveStats.thongHieu.correct}/{profile.cognitiveStats.thongHieu.total} câu</span>
                      <span className="text-rose-600">Sai: {profile.cognitiveStats.thongHieu.wrong}</span>
                    </div>
                    <p className="text-[11px] text-emerald-950 font-medium">
                      {thPercent >= 80 ? '✓ Hiểu rõ bản chất cơ chế và các mối quan hệ.' : '⚠️ Dễ nhầm lẫn bản chất giữa các quá trình.'}
                    </p>
                  </div>

                  {/* Vận dụng */}
                  <div className="p-5 rounded-3xl bg-purple-50/70 border border-purple-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-purple-900">3. Vận dụng</span>
                      <span className="text-xs font-black text-purple-700">{vdPercent}%</span>
                    </div>
                    <div className="w-full bg-purple-200/60 rounded-full h-3 overflow-hidden">
                      <div className="bg-purple-600 h-3 rounded-full transition-all duration-700" style={{ width: `${vdPercent}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>Đúng: {profile.cognitiveStats.vanDung.correct}/{profile.cognitiveStats.vanDung.total} câu</span>
                      <span className="text-rose-600">Sai: {profile.cognitiveStats.vanDung.wrong}</span>
                    </div>
                    <p className="text-[11px] text-purple-950 font-medium">
                      {vdPercent >= 80 ? '✓ Vận dụng tốt vào thực tiễn đời sống và nông nghiệp.' : '⚠️ Cần rèn luyện thêm kỹ năng phân tích thực tế.'}
                    </p>
                  </div>
                </div>

                {/* Hộp cảnh báo giáo viên */}
                <div className="p-6 bg-slate-900 text-white rounded-3xl space-y-3 shadow-md">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-400">
                    <span>🛡️</span> Cảnh Báo Sư Phạm Dành Cho Thầy/Cô & Học Sinh:
                  </div>
                  <p className="text-sm font-bold text-slate-200 leading-relaxed">
                    {profile.score10 < 5.0
                      ? '🔴 BÁO ĐỘNG HỔNG KIẾN THỨC NẶNG: Học sinh đang gặp khó khăn ở các khái niệm nền tảng. Khuyến nghị thầy/cô kèm riêng hoặc yêu cầu học sinh hoàn thành lộ trình học củng cố bên dưới.'
                      : profile.score10 < 7.0
                      ? '🟡 CẢNH BÁO CẦN ÔN TẬP: Học sinh hiểu sơ bộ nhưng dễ mắc bẫy ở câu hỏi Đúng/Sai và Thông hiểu. Cần làm bài tập bù đắp lỗ hổng.'
                      : '🟢 NĂNG LỰC TỐT: Học sinh đạt chuẩn kiến thức bài học. Cần phát triển thêm các câu hỏi vận dụng cao và sơ đồ thực nghiệm.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 3: BÀI HỌC CỦNG CỐ + VÍ DỤ MINH HỌA ==================== */}
          {activeTab === 'REMEDIAL' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>📖</span> Cần Học Lại Nội Dung Gì? — Bài Học Bù Đắp Trọng Tâm
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hệ thống trích lọc lý thuyết cốt lõi, sơ đồ tư duy và cạm bẫy câu hỏi thường gặp bám sát SGK Kết nối tri thức.
                  </p>
                </div>
              </div>

              {profile.remedialLessons.map((lesson, idx) => (
                <div key={idx} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs space-y-6 p-6 sm:p-8">
                  <div className="border-b border-slate-100 pb-4">
                    <span className="text-[10px] font-black uppercase text-bio-600 bg-bio-50 px-3 py-1 rounded-full border border-bio-200">
                      Chuyên Đề Trọng Tâm Cần Ôn Lại
                    </span>
                    <h4 className="text-xl font-black text-slate-900 mt-2">{lesson.topic}</h4>
                  </div>

                  {/* 1. Lý thuyết cốt lõi */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-bio-600"></span>
                      1. Kiến Thức Cốt Lõi Phải Nắm Vững (SGK Kết nối tri thức)
                    </h5>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs sm:text-sm text-slate-800 leading-relaxed font-medium">
                      {lesson.coreTheory}
                    </div>
                  </div>

                  {/* 2. Sơ đồ tư duy / Điểm nhấn */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                      2. Sơ Đồ Tư Duy & Trực Quan Hóa Khái Niệm
                    </h5>
                    <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200 text-xs sm:text-sm text-blue-950 font-bold leading-relaxed">
                      {lesson.diagramOrKeyNote}
                    </div>
                  </div>

                  {/* 3. Cạm bẫy thường gặp */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                      3. Cạm Bẫy Đề Thi Cần Tránh
                    </h5>
                    <div className="p-4 bg-rose-50/80 rounded-2xl border border-rose-200 text-xs sm:text-sm text-rose-950 font-semibold leading-relaxed">
                      {lesson.commonTrap}
                    </div>
                  </div>

                  {/* 4. Ví dụ thực tế */}
                  <div className="space-y-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                      4. Ví Dụ Thực Tiễn & Ứng Dụng Đời Sống
                    </h5>
                    <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200 text-xs sm:text-sm text-amber-950 font-medium leading-relaxed">
                      {lesson.practicalExample}
                    </div>
                  </div>

                  {/* Nút chuyển nhanh sang Luyện tập */}
                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => setActiveTab('PRACTICE')}
                      className="bg-bio-700 hover:bg-bio-800 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <span>Sang Bài Luyện Tập Bù Đắp Lỗ Hổng</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ==================== TAB 4: LUYỆN TẬP BÙ ĐẮP LỖ HỔNG ==================== */}
          {activeTab === 'PRACTICE' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-emerald-900 text-white p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black flex items-center gap-2">
                    <span>🎯</span> Bài Luyện Tập Khắc Phục Lỗ Hổng Kiến Thức
                  </h3>
                  <p className="text-xs text-emerald-200 mt-1">
                    Gồm {profile.practiceQuestions.length} câu hỏi trúng đích vào các khái niệm em vừa làm sai để kiểm tra lại khả năng tiếp thu.
                  </p>
                </div>
                {profile.isRetestSubmitted && (
                  <span className="bg-emerald-500 text-white px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider shrink-0">
                    ✓ Đã hoàn thành luyện tập
                  </span>
                )}
              </div>

              {/* Danh sách câu hỏi luyện tập */}
              <div className="space-y-5">
                {profile.practiceQuestions.map((q, idx) => {
                  const userAns = practiceAnswers[q.id] || '';
                  const isSubmitted = profile.isRetestSubmitted;
                  const isCorrect = userAns.toUpperCase() === (q.correctAnswer || '').toUpperCase();

                  return (
                    <div key={q.id} className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-xs space-y-4">
                      <div className="flex items-start gap-3">
                        <span className="bg-emerald-700 text-white px-3 py-1 rounded-xl text-xs font-black shrink-0 mt-0.5">
                          Câu {idx + 1}
                        </span>
                        <p className="font-black text-slate-900 text-sm sm:text-base leading-relaxed flex-1">
                          {q.text}
                        </p>
                      </div>

                      {/* Lựa chọn MCQ */}
                      {q.type === 'MCQ' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {q.options.map((opt, oIdx) => {
                            const optKey = ['A', 'B', 'C', 'D'][oIdx];
                            const isSelected = userAns === optKey;
                            const isAnswerKey = q.correctAnswer === optKey;

                            let btnStyle = 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300';
                            if (isSubmitted) {
                              if (isAnswerKey) btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black ring-2 ring-emerald-200';
                              else if (isSelected && !isCorrect) btnStyle = 'border-rose-400 bg-rose-50 text-rose-950 font-bold';
                            } else if (isSelected) {
                              btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black shadow-sm ring-2 ring-emerald-200';
                            }

                            return (
                              <button
                                key={oIdx}
                                type="button"
                                disabled={isSubmitted}
                                onClick={() => handleSelectPracticeAnswer(q.id, optKey)}
                                className={`p-4 rounded-2xl border-2 text-left font-medium text-sm transition-all flex items-start gap-3 cursor-pointer ${btnStyle}`}
                              >
                                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                                  isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {optKey}
                                </span>
                                <span className="pt-0.5 leading-snug">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Lựa chọn TF */}
                      {q.type === 'TF' && (
                        <div className="flex gap-4 pt-2">
                          {['Đúng', 'Sai'].map(opt => {
                            const isSelected = userAns === opt;
                            const isAnswerKey = q.correctAnswer === opt;
                            let btnStyle = 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300';
                            if (isSubmitted) {
                              if (isAnswerKey) btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black ring-2 ring-emerald-200';
                              else if (isSelected && !isCorrect) btnStyle = 'border-rose-400 bg-rose-50 text-rose-950 font-bold';
                            } else if (isSelected) {
                              btnStyle = 'border-emerald-600 bg-emerald-50 text-emerald-950 font-black shadow-sm ring-2 ring-emerald-200';
                            }

                            return (
                              <button
                                key={opt}
                                type="button"
                                disabled={isSubmitted}
                                onClick={() => handleSelectPracticeAnswer(q.id, opt)}
                                className={`flex-1 py-3.5 rounded-2xl border-2 font-black transition-all cursor-pointer ${btnStyle}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Giải thích sau khi nộp */}
                      {isSubmitted && q.explanation && (
                        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-semibold text-emerald-950">
                          💡 <b>Hướng dẫn giải:</b> {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Nút nộp bài luyện tập */}
              {!profile.isRetestSubmitted ? (
                <div className="pt-4 flex justify-end">
                  <button
                    disabled={isSubmittingPractice || Object.keys(practiceAnswers).length === 0}
                    onClick={handleSubmitPractice}
                    className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSubmittingPractice ? 'Đang chấm điểm...' : 'Hoàn Thành & Đánh Giá Tiến Bộ 🚀'}
                  </button>
                </div>
              ) : (
                <div className="pt-4 flex justify-end">
                  <button
                    onClick={() => setActiveTab('PROGRESS')}
                    className="bg-bio-700 hover:bg-bio-800 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-md transition-all cursor-pointer"
                  >
                    Xem Biểu Đồ Tiến Bộ →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 5: ĐÁNH GIÁ TIẾN BỘ & CẬP NHẬT HỒ SƠ ==================== */}
          {activeTab === 'PROGRESS' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center space-y-6">
                <span className="text-6xl block">
                  {profile.improvementDelta !== undefined && profile.improvementDelta >= 0 ? '🚀' : '📈'}
                </span>
                <div>
                  <span className="text-xs font-black uppercase text-bio-600 bg-bio-50 px-3 py-1 rounded-full border border-bio-200">
                    KẾT QUẢ ĐÁNH GIÁ TIẾN BỘ
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3">
                    Sau khi học lại, em đã tiến bộ chưa?
                  </h3>
                </div>

                {/* So sánh điểm trước và sau */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto pt-2">
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl text-center space-y-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">Lần thi ban đầu</span>
                    <div className="text-4xl font-black text-slate-700">{profile.score10} đ</div>
                    <span className="text-xs text-rose-600 font-bold">
                      Sai {profile.errorItems.length} câu • {profile.weakLevel}
                    </span>
                  </div>

                  <div className="p-6 bg-emerald-50 border-2 border-emerald-300 rounded-3xl text-center space-y-2 shadow-sm">
                    <span className="text-xs font-bold text-emerald-800 uppercase">Sau khi luyện bù đắp</span>
                    <div className="text-4xl font-black text-emerald-700">
                      {profile.isRetestSubmitted && profile.practiceScore !== undefined
                        ? `${Math.round((profile.practiceScore / profile.practiceQuestions.length) * 10 * 10) / 10} đ`
                        : '--'}
                    </div>
                    <span className="text-xs text-emerald-800 font-bold">
                      {profile.isRetestSubmitted && profile.practiceScore !== undefined
                        ? `Đúng ${profile.practiceScore}/${profile.practiceQuestions.length} câu luyện tập`
                        : 'Chưa làm bài luyện tập'}
                    </span>
                  </div>
                </div>

                {/* Đánh giá sự thay đổi */}
                {profile.isRetestSubmitted && profile.improvementDelta !== undefined && (
                  <div className="p-5 bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-300 rounded-2xl max-w-xl mx-auto text-emerald-950 font-bold text-sm leading-relaxed">
                    {profile.improvementDelta >= 0 ? (
                      <>
                        🎉 <b>Tiến bộ vượt trội!</b> Em đã nâng điểm thêm <span className="text-emerald-800 font-black text-lg">+{profile.improvementDelta} điểm</span>. Các lỗ hổng về "{profile.weakTopics.slice(0, 2).join(', ')}" đã được khắc phục thành công!
                      </>
                    ) : (
                      <>
                        ⚠️ Em đã làm bài củng cố, hãy tiếp tục đọc kỹ lại lý thuyết để nắm chắc 100% dạng bài này nhé!
                      </>
                    )}
                  </div>
                )}

                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={onClose}
                    className="w-full sm:w-auto bg-slate-900 hover:bg-black text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Đóng Bảng Phân Tích
                  </button>
                  {onRetakeExam && (
                    <button
                      onClick={onRetakeExam}
                      className="w-full sm:w-auto bg-bio-700 hover:bg-bio-800 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
                    >
                      🚀 Tự Tin Làm Lại Bài Thi Gốc Ngay
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
