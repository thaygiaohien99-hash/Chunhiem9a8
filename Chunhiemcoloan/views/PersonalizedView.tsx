import React, { useState, useMemo } from 'react';
import { User, BIO_TOPICS, ExamResult, Question } from '../types';
import { generateBiologyQuestions } from '../services/geminiService';
import { submitExamResultToCloud } from '../services/dataService';

interface PersonalizedViewProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
  onNavigateToTest: () => void;
  onOpenLogin?: () => void;
  targetStudentUser?: User | null;
  onClearTargetStudent?: () => void;
}

export const PersonalizedView: React.FC<PersonalizedViewProps> = ({
  user,
  onUpdateUser,
  onNavigateToTest,
  onOpenLogin,
  targetStudentUser,
  onClearTargetStudent
}) => {
  const activeUser = targetStudentUser || user;

  // Goal setting state
  const [targetScore, setTargetScore] = useState<number>(() => {
    return parseFloat(localStorage.getItem(`target_score_${activeUser.phone}`) || '8.5');
  });

  const handleSetTargetScore = (score: number) => {
    setTargetScore(score);
    localStorage.setItem(`target_score_${activeUser.phone}`, score.toString());
  };

  // Adaptive practice generator state
  const [selectedGrade, setSelectedGrade] = useState<'Lớp 10' | 'Lớp 11' | 'Lớp 12'>(() => {
    if (activeUser.className?.startsWith('10')) return 'Lớp 10';
    if (activeUser.className?.startsWith('11')) return 'Lớp 11';
    return 'Lớp 12';
  });
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [adaptiveMode, setAdaptiveMode] = useState<'REMEDIAL' | 'ADVANCED' | 'BALANCED'>('REMEDIAL');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [practiceActive, setPracticeActive] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [submittedResult, setSubmittedResult] = useState<{
    score: number;
    correctCount: number;
    total: number;
  } | null>(null);

  // Weekly checklist state
  const [weeklyTasks, setWeeklyTasks] = useState<{ id: string; text: string; done: boolean }[]>(() => {
    const saved = localStorage.getItem(`tasks_${activeUser.phone}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      { id: 't1', text: 'Ôn tập 10 câu trắc nghiệm Đúng/Sai cơ chế Di truyền & Biến dị', done: false },
      { id: 't2', text: 'Xem lại các câu hỏi đã làm sai trong bài kiểm tra gần nhất', done: false },
      { id: 't3', text: 'Hoàn thành 01 bài kiểm tra đánh giá theo chuẩn GDPT 2018', done: false },
      { id: 't4', text: 'Tự đánh giá năng lực đạt chuẩn theo Yêu Cầu Cần Đạt (YCCĐ)', done: false }
    ];
  });

  const toggleTask = (taskId: string) => {
    const updated = weeklyTasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    setWeeklyTasks(updated);
    localStorage.setItem(`tasks_${activeUser.phone}`, JSON.stringify(updated));
  };

  // Compute strengths and weaknesses based on exam history
  const performanceAnalysis = useMemo(() => {
    const history = activeUser.examHistory || [];
    if (history.length === 0) {
      return {
        hasData: false,
        avgScore: 0,
        completedExams: 0,
        strongTopics: [] as string[],
        weakTopics: [] as string[],
        remedialSuggestions: [
          'Bạn chưa có lịch sử làm bài. Hãy thực hiện ít nhất 1 bài kiểm tra để hệ thống phân tích năng lực cá nhân.',
          'Khuyến nghị bắt đầu từ đề ôn luyện nền tảng SGK Kết nối tri thức.'
        ]
      };
    }

    const totalScore = history.reduce((acc, curr) => acc + curr.score, 0);
    const avg = Math.round((totalScore / history.length) * 10) / 10;

    // Categorize by scores
    const strongExams = history.filter(h => h.score >= 8);
    const weakExams = history.filter(h => h.score < 7);

    const strongTopics = Array.from(new Set(strongExams.map(e => e.examTitle))).slice(0, 3);
    const weakTopics = Array.from(new Set(weakExams.map(e => e.examTitle))).slice(0, 3);

    const suggestions: string[] = [];
    if (avg < 5) {
      suggestions.push('Cần tập trung củng cố kiến thức nhận biết cốt lõi trong SGK Sinh học 10, 11, 12.');
      suggestions.push('Luyện các câu hỏi trắc nghiệm 4 phương án cơ bản trước khi làm các câu Đúng/Sai phức tạp.');
    } else if (avg < 8) {
      suggestions.push('Nền tảng khá tốt, cần chú trọng phân tích kỹ phần Đúng/Sai (dạng câu hỏi mới theo GDPT 2018).');
      suggestions.push('Ôn luyện lại các câu bạn đã chọn sai ở lịch sử làm bài.');
    } else {
      suggestions.push('Năng lực xuất sắc! Hãy thử sức với các bài tập vận dụng cao, phân tích bảng số liệu & sơ đồ thí nghiệm.');
    }

    return {
      hasData: true,
      avgScore: avg,
      completedExams: history.length,
      strongTopics,
      weakTopics,
      remedialSuggestions: suggestions
    };
  }, [activeUser.examHistory]);

  // Handle generating customized adaptive test
  const handleStartAdaptivePractice = async () => {
    if (activeUser.isGuest || activeUser.phone === 'guest') {
      if (onOpenLogin) onOpenLogin();
      return;
    }

    setIsGenerating(true);
    setPracticeActive(false);
    setSubmittedResult(null);
    setUserAnswers({});

    try {
      const topicToUse = selectedTopic || (BIO_TOPICS[selectedGrade] && BIO_TOPICS[selectedGrade][0]) || 'Di truyền học';
      let objectives = 'Nắm vững kiến thức trọng tâm SGK Kết nối tri thức';
      
      if (adaptiveMode === 'REMEDIAL') {
        objectives = 'Củng cố nền tảng kiến thức căn bản, khắc phục lỗi sai thường gặp, câu hỏi rõ ràng rành mạch';
      } else if (adaptiveMode === 'ADVANCED') {
        objectives = 'Phát triển năng lực vận dụng, câu hỏi thí nghiệm, giải thích hiện tượng sinh học chuyên sâu';
      } else {
        objectives = 'Đánh giá toàn diện các mức độ Biết, Hiểu, Vận dụng theo định dạng thi mới của Bộ Giáo dục';
      }

      const questions = await generateBiologyQuestions({
        grade: selectedGrade,
        topic: topicToUse,
        learningObjectives: objectives,
        count: 5
      }, 5);

      if (questions && questions.length > 0) {
        setGeneratedQuestions(questions);
        setPracticeActive(true);
      } else {
        alert('Không thể tạo câu hỏi lúc này. Vui lòng thử lại sau giây lát!');
      }
    } catch (err) {
      console.warn("Lỗi sinh bài luyện tập thích ứng:", err);
      alert('Có lỗi khi tạo bài luyện tập cá nhân hóa.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectAnswer = (qId: string, answer: string) => {
    setUserAnswers(prev => ({
      ...prev,
      [qId]: answer
    }));
  };

  const handleSubmitPractice = async () => {
    if (generatedQuestions.length === 0) return;
    
    let correct = 0;
    const details = generatedQuestions.map(q => {
      const uAns = userAnswers[q.id] || 'Chưa trả lời';
      const isCorrect = uAns === q.correctAnswer;
      if (isCorrect) correct++;
      return {
        questionId: q.id,
        questionText: q.text,
        userAnswer: uAns,
        correctAnswer: q.correctAnswer,
        isCorrect
      };
    });

    const finalScore = Math.round((correct / generatedQuestions.length) * 10 * 10) / 10;
    setSubmittedResult({
      score: finalScore,
      correctCount: correct,
      total: generatedQuestions.length
    });

    // Update user stats
    const newExamResult: ExamResult = {
      examId: `ADAPTIVE_${Date.now()}`,
      examTitle: `Cá nhân hóa: ${selectedTopic || selectedGrade}`,
      score: finalScore,
      date: new Date().toISOString(),
      details
    };

    const updatedUser: User = {
      ...user,
      totalScore: user.totalScore + Math.round(finalScore * 10),
      examHistory: [newExamResult, ...(user.examHistory || [])]
    };

    localStorage.setItem(`user_${user.phone}`, JSON.stringify(updatedUser));
    onUpdateUser(updatedUser);

    // Save to cloud if not guest
    if (!user.isGuest && user.phone !== 'guest') {
      try {
        await submitExamResultToCloud(user.phone, newExamResult, {
          studentId: user.studentId,
          name: user.name,
          className: user.className,
          phone: user.phone
        });
      } catch (e) {
        console.warn('Lưu trữ cục bộ an toàn, đồng bộ cloud sẽ chạy nền:', e);
      }
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-12">
      {/* Target Student Header (Khi Admin xem Hồ Sơ Năng Lực Số của một học sinh cụ thể) */}
      {targetStudentUser && (
        <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-indigo-950 text-white p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-indigo-700/60">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl backdrop-blur-sm shrink-0">
              🎓
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-amber-400 text-amber-950 font-black text-[11px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  HỒ SƠ NĂNG LỰC SỐ
                </span>
                <span className="text-xs text-indigo-200">
                  Lớp: <strong className="text-white font-bold">{targetStudentUser.className}</strong>
                </span>
                <span className="text-xs text-indigo-300">
                  • SĐT: <strong className="text-white font-mono">{targetStudentUser.phone}</strong>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                Học sinh: {targetStudentUser.name}
              </h2>
              <p className="text-xs text-indigo-200 mt-0.5">
                Thầy/Cô đang theo dõi chẩn đoán năng lực học tập, lỗ hổng kiến thức và lịch sử bài thi của học sinh này.
              </p>
            </div>
          </div>
          {onClearTargetStudent && (
            <button
              onClick={onClearTargetStudent}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-white/25 shrink-0 active:scale-95"
            >
              <span>← Quay lại Lớp Học</span>
            </button>
          )}
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-bio-700 to-teal-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold uppercase tracking-wider text-emerald-100">
            <span>🎯</span> Hệ Thống Cá Nhân Hóa Học Tập (Adaptive Learning)
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
            Lộ Trình Học Tập Cá Nhân Hóa Dành Riêng Cho {activeUser.name}
          </h2>
          <p className="text-emerald-100 text-sm leading-relaxed">
            Hệ thống tự động chẩn đoán năng lực, định vị lỗ hổng kiến thức và đề xuất bài luyện tập thông minh bám sát chuẩn SGK Kết nối tri thức với cuộc sống.
          </p>
        </div>
        <div className="absolute right-4 -bottom-6 text-emerald-200/10 text-9xl select-none font-black pointer-events-none hidden md:block">
          ADAPTIVE
        </div>
      </div>

      {/* Target Score & Quick Progress Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Mục tiêu điểm số */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Mục Tiêu Cá Nhân</span>
              <span className="text-lg">🎯</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-black text-bio-700">{targetScore.toFixed(1)}</span>
              <span className="text-xs font-bold text-gray-400">/ 10.0 điểm</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Điểm số mục tiêu bạn hướng tới trong kỳ thi TN THPT & kiểm tra học kỳ.
            </p>
          </div>
          <div className="flex gap-2">
            {[7.0, 8.0, 8.5, 9.0, 10.0].map(s => (
              <button
                key={s}
                onClick={() => handleSetTargetScore(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  targetScore === s 
                    ? 'bg-bio-600 text-white shadow-sm' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Card 2: Năng lực hiện tại */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Điểm Trung Bình Hiện Tại</span>
              <span className="text-lg">📊</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-black text-blue-600">
                {performanceAnalysis.hasData ? performanceAnalysis.avgScore : '--'}
              </span>
              <span className="text-xs font-bold text-gray-400">/ 10.0 điểm</span>
            </div>
            <p className="text-xs text-gray-500">
              {performanceAnalysis.hasData 
                ? `Được tính toán qua ${performanceAnalysis.completedExams} bài kiểm tra đã làm.`
                : 'Chưa có dữ liệu bài làm. Hãy hoàn thành 1 bài kiểm tra.'}
            </p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5 mt-4 overflow-hidden">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, (performanceAnalysis.avgScore / 10) * 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Card 3: Khoảng cách tới mục tiêu */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Khoảng Cách Mục Tiêu</span>
              <span className="text-lg">🚀</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-black text-purple-600">
                {performanceAnalysis.hasData 
                  ? `${Math.max(0, Math.round((targetScore - performanceAnalysis.avgScore) * 10) / 10)}`
                  : `${targetScore.toFixed(1)}`}
              </span>
              <span className="text-xs font-bold text-gray-400">điểm cần bứt phá</span>
            </div>
            <p className="text-xs text-gray-500">
              {performanceAnalysis.avgScore >= targetScore 
                ? '🎉 Xuất sắc! Bạn đã đạt hoặc vượt mục tiêu đề ra!' 
                : 'Luyện tập các chủ đề còn yếu để nâng cao điểm số nhanh chóng.'}
            </p>
          </div>
          <button
            onClick={onNavigateToTest}
            className="w-full mt-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            Đến Ngân Hàng Đề Thi →
          </button>
        </div>
      </div>

      {/* Diagnostic & Weakness Analysis */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
          <div>
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span>🧠</span> Chẩn Đoán Lỗ Hổng Kiến Thức & Khuyến Nghị AI
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Phân tích dựa trên kết quả các bài kiểm tra trắc nghiệm theo chuẩn GDPT 2018
            </p>
          </div>
          <span className="text-xs font-bold text-bio-700 bg-bio-50 px-3 py-1.5 rounded-full border border-bio-100 self-start sm:self-auto">
            ⚡ Chuẩn SGK Kết nối tri thức
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Điểm mạnh */}
          <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <span>🌟</span> Chủ Đề Nắm Chắc (Điểm mạnh)
            </div>
            {performanceAnalysis.strongTopics.length > 0 ? (
              <ul className="space-y-2">
                {performanceAnalysis.strongTopics.map((topic, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs font-medium text-emerald-900 bg-white/70 p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span className="flex-1">{topic}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-700 italic">
                Chưa đủ bài thi đạt điểm từ 8.0 trở lên để xác định điểm mạnh rõ ràng.
              </p>
            )}
          </div>

          {/* Lỗ hổng cần củng cố */}
          <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-3">
            <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
              <span>⚠️</span> Lỗ Hổng Kiến Thức (Cần củng cố)
            </div>
            {performanceAnalysis.weakTopics.length > 0 ? (
              <ul className="space-y-2">
                {performanceAnalysis.weakTopics.map((topic, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs font-medium text-amber-900 bg-white/70 p-2.5 rounded-xl border border-amber-200">
                    <span className="text-amber-600 font-bold">!</span>
                    <span className="flex-1">{topic}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-amber-700 italic">
                Tuyệt vời! Hiện không có bài kiểm tra nào dưới 7.0 điểm.
              </p>
            )}
          </div>
        </div>

        {/* Khuyến nghị thông minh */}
        <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-2">
          <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider flex items-center gap-2">
            <span>💡</span> Chỉ Dẫn Tối Ưu Hóa Quá Trình Học
          </h4>
          <div className="space-y-1.5">
            {performanceAnalysis.remedialSuggestions.map((sug, i) => (
              <p key={i} className="text-xs text-blue-800 flex items-start gap-2">
                <span className="text-blue-500 font-bold">•</span>
                <span>{sug}</span>
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Adaptive Practice Generator (Luyện tập thông minh) */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-5">
          <div>
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span>🪄</span> Phòng Luyện Tập Thích Ứng (Adaptive Practice)
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              AI tự động sinh bộ câu hỏi rèn luyện theo đúng mục tiêu bạn chọn
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-400">
            5 câu hỏi trắc nghiệm / đợt luyện
          </span>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">
              Khối Lớp
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Lớp 10', 'Lớp 11', 'Lớp 12'] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setSelectedGrade(g);
                    setSelectedTopic('');
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    selectedGrade === g 
                      ? 'bg-bio-600 text-white border-bio-600 shadow-sm' 
                      : 'bg-white text-gray-600 border-gray-200 hover:border-bio-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">
              Chủ Đề Trọng Tâm
            </label>
            <select
              value={selectedTopic}
              onChange={e => setSelectedTopic(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-bio-500 shadow-sm cursor-pointer"
            >
              <option value="">-- Tất cả chủ đề ({selectedGrade}) --</option>
              {(BIO_TOPICS[selectedGrade] || []).map((t, idx) => (
                <option key={idx} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-600 uppercase tracking-wider mb-2">
              Chế Độ Rèn Luyện
            </label>
            <select
              value={adaptiveMode}
              onChange={e => setAdaptiveMode(e.target.value as any)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-bio-500 shadow-sm cursor-pointer"
            >
              <option value="REMEDIAL">🛡️ Củng cố nền tảng (Bù lỗ hổng)</option>
              <option value="BALANCED">⚖️ Cân bằng Biết - Hiểu - Vận dụng</option>
              <option value="ADVANCED">🔥 Nâng cao bứt phá (Vận dụng cao)</option>
            </select>
          </div>
        </div>

        {/* Generate button */}
        <div className="flex justify-center pt-2">
          <button
            onClick={handleStartAdaptivePractice}
            disabled={isGenerating}
            className="px-8 py-4 bg-bio-600 hover:bg-bio-700 active:scale-95 disabled:opacity-50 text-white rounded-2xl text-sm font-bold shadow-lg shadow-bio-600/20 transition-all flex items-center gap-3 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>AI Đang Thiết Kế Bộ Đề Cá Nhân Hóa...</span>
              </>
            ) : (
              <>
                <span className="text-lg">✨</span>
                <span>Tạo Bài Luyện Tập Cá Nhân Hóa Bằng AI</span>
              </>
            )}
          </button>
        </div>

        {/* Interactive Practice Quiz */}
        {practiceActive && generatedQuestions.length > 0 && (
          <div className="mt-8 space-y-6 pt-6 border-t border-gray-100 animate-fade-in">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <span>📝</span> Bài Luyện Tập Thích Ứng ({generatedQuestions.length} câu)
              </h4>
              {submittedResult && (
                <div className="px-4 py-1.5 bg-bio-100 text-bio-800 rounded-full font-bold text-xs">
                  Kết quả: {submittedResult.score} điểm ({submittedResult.correctCount}/{submittedResult.total} câu đúng)
                </div>
              )}
            </div>

            <div className="space-y-5">
              {generatedQuestions.map((q, idx) => {
                const uAns = userAnswers[q.id];
                const isSubmitted = submittedResult !== null;
                const isCorrect = uAns === q.correctAnswer;

                return (
                  <div 
                    key={q.id || idx} 
                    className={`p-5 rounded-2xl border transition-all ${
                      isSubmitted 
                        ? isCorrect 
                          ? 'border-green-300 bg-green-50/40' 
                          : 'border-red-300 bg-red-50/40'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span className="w-7 h-7 rounded-xl bg-bio-100 text-bio-800 font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <p className="text-sm font-bold text-gray-800 leading-relaxed pt-0.5">
                        {q.text}
                      </p>
                    </div>

                    {/* Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3 pl-10">
                      {q.type === 'TF' ? (
                        ['Đúng', 'Sai'].map(opt => (
                          <button
                            key={opt}
                            disabled={isSubmitted}
                            onClick={() => handleSelectAnswer(q.id, opt)}
                            className={`p-3 rounded-xl border text-xs font-bold text-left transition flex items-center justify-between ${
                              uAns === opt 
                                ? 'bg-bio-600 border-bio-600 text-white shadow-sm' 
                                : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-bio-300'
                            }`}
                          >
                            <span>{opt}</span>
                            {isSubmitted && q.correctAnswer === opt && (
                              <span className="text-xs bg-white text-green-700 px-2 py-0.5 rounded font-black">Đáp án đúng</span>
                            )}
                          </button>
                        ))
                      ) : (
                        q.options.map((opt, i) => {
                          const optKey = ['A', 'B', 'C', 'D'][i] || opt.charAt(0);
                          const isChosen = uAns === optKey || uAns === opt;
                          const isCorrectKey = q.correctAnswer === optKey || q.correctAnswer === opt;

                          return (
                            <button
                              key={i}
                              disabled={isSubmitted}
                              onClick={() => handleSelectAnswer(q.id, optKey)}
                              className={`p-3 rounded-xl border text-xs text-left transition flex items-center justify-between ${
                                isChosen 
                                  ? 'bg-bio-600 border-bio-600 text-white font-bold shadow-sm' 
                                  : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-bio-300 font-medium'
                              }`}
                            >
                              <span className="truncate pr-2">{opt}</span>
                              {isSubmitted && isCorrectKey && (
                                <span className="text-[10px] bg-white text-green-700 px-2 py-0.5 rounded font-black shrink-0">Đúng</span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submission Actions */}
            {!submittedResult ? (
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSubmitPractice}
                  className="px-6 py-3 bg-bio-600 hover:bg-bio-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer"
                >
                  Nộp Bài & Lưu Kết Quả
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-bio-50 border border-bio-200">
                <div className="text-xs text-bio-800">
                  🎉 Kết quả luyện tập đã được lưu vào lịch sử học tập cá nhân của bạn!
                </div>
                <button
                  onClick={handleStartAdaptivePractice}
                  className="px-5 py-2.5 bg-bio-700 hover:bg-bio-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Luyện Tập Đợt Tiếp Theo ↻
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Weekly Study Checklist */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span>📋</span> Kế Hoạch Rèn Luyện Tuần Này
          </h3>
          <span className="text-xs font-bold text-bio-600 bg-bio-50 px-3 py-1 rounded-full">
            {weeklyTasks.filter(t => t.done).length}/{weeklyTasks.length} Hoàn thành
          </span>
        </div>

        <div className="space-y-2.5">
          {weeklyTasks.map(task => (
            <div
              key={task.id}
              onClick={() => toggleTask(task.id)}
              className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center gap-3 ${
                task.done ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-100 hover:border-bio-200 shadow-sm'
              }`}
            >
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => {}}
                className="w-4 h-4 text-bio-600 rounded border-gray-300 focus:ring-bio-500 cursor-pointer"
              />
              <span className={`text-xs font-medium ${task.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                {task.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
