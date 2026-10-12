import { Exam, Question, User, StudentCompetencyProfile, DiagnosticErrorItem, RemedialTopicLesson } from '../types';

/**
 * Phân tích câu hỏi và suy luận nguyên nhân sai dựa trên nội dung câu hỏi và dạng bài
 */
export const diagnoseErrorReason = (
  q: Question,
  userAnswer: string,
  cognitiveLevel: 'NHAN_BIET' | 'THONG_HIEU' | 'VAN_DUNG'
): { concept: string; reason: string; explanation: string } => {
  const text = q.text || '';
  const textLower = text.toLowerCase();
  let concept = 'Kiến thức cốt lõi Sinh học';
  let reason = 'Chưa nắm vững định nghĩa chuẩn trong SGK Kết nối tri thức';
  let explanation = q.explanation || 'Cần đọc lại nội dung bài học và ghi nhớ các từ khóa quan trọng.';

  // Trích xuất khái niệm từ câu hỏi
  if (textLower.includes('cấp độ tổ chức') || textLower.includes('thế giới sống')) {
    concept = 'Các cấp độ tổ chức của thế giới sống';
    if (q.type === 'TF') {
      reason = 'Mắc bẫy khẳng định tuyệt đối (ví dụ từ "duy nhất"). Tế bào có nhiều hình thức phân bào: nguyên phân, giảm phân, trực phân.';
    } else {
      reason = 'Nhầm lẫn giữa các cấp độ cơ bản (tế bào, cơ thể, quần thể, quần xã, hệ sinh thái) và các cấp độ dưới tế bào.';
    }
  } else if (textLower.includes('trao đổi nước') || textLower.includes('khoáng') || textLower.includes('khí khổng')) {
    concept = 'Trao đổi nước và khoáng ở thực vật';
    reason = 'Chưa hiểu rõ cơ chế thẩm thấu thụ động và động lực hút nước từ rễ lên lá do thoát hơi nước ở khí khổng.';
  } else if (textLower.includes('trao đổi chất') || textLower.includes('chuyển hoá năng lượng') || textLower.includes('atp')) {
    concept = 'Trao đổi chất và chuyển hóa năng lượng';
    reason = 'Nhầm lẫn giữa đồng hóa (tổng hợp chất, tích lũy năng lượng) và dị hóa (phân giải chất, giải phóng ATP).';
  } else if (textLower.includes('gene') || textLower.includes('phiên mã') || textLower.includes('dịch mã') || textLower.includes('dna')) {
    concept = 'Cơ chế truyền đạt thông tin di truyền ở cấp độ phân tử';
    reason = 'Nhầm lẫn nguyên tắc bổ sung (A-U, T-A, G-C, C-G trong phiên mã) hoặc tính chất của mã di truyền (tính thoái hóa, đặc hiệu).';
  } else if (textLower.includes('quang hợp') || textLower.includes('pha sáng') || textLower.includes('pha tối')) {
    concept = 'Quang hợp ở thực vật';
    reason = 'Chưa phân biệt được sản phẩm của pha sáng (ATP, NADPH, O2) cung cấp cho pha tối (chu trình Calvin).';
  } else if (textLower.includes('hô hấp') || textLower.includes('krebs') || textLower.includes('đường phân')) {
    concept = 'Hô hấp ở thực vật và động vật';
    reason = 'Chưa nhớ rõ vị trí xảy ra của 3 giai đoạn: Đường phân (bào tương), chu trình Krebs (chất nền ty thể), chuỗi chuyền electron (màng trong ty thể).';
  } else if (textLower.includes('di truyền') || textLower.includes('men-đen') || textLower.includes('nhiễm sắc thể')) {
    concept = 'Quy luật di truyền & Di truyền nhiễm sắc thể';
    reason = 'Sai sót trong suy luận logic tỷ lệ kiểu gen, kiểu hình hoặc nhầm lẫn giữa phân li độc lập và liên kết gen.';
  } else if (textLower.includes('sinh thái') || textLower.includes('quần thể') || textLower.includes('quần xã')) {
    concept = 'Sinh thái học cá thể, quần thể & quần xã';
    reason = 'Chưa phân biệt được mối quan hệ giữa các cá thể trong loài (hỗ trợ, cạnh tranh) hoặc mối quan hệ khác loài trong quần xã.';
  } else {
    // Trích lọc tên bài hoặc cụm từ đầu câu hỏi
    const match = text.match(/^(?:Câu\s*\d+[\.\:\-]\s*)?([^,\.\?\;\n]+)/i);
    if (match && match[1]) {
      concept = match[1].replace(/\[.*?\]/g, '').trim();
    }
  }

  if (cognitiveLevel === 'VAN_DUNG') {
    reason += ' • Khó khăn trong việc vận dụng kiến thức lý thuyết để giải thích hiện tượng thực tiễn hoặc tính toán thông số.';
  } else if (cognitiveLevel === 'THONG_HIEU') {
    reason += ' • Hiểu chưa thấu đáo bản chất sinh học, dễ bị phân vân giữa 2 phương án đối lập.';
  } else {
    reason += ' • Bỏ quên định nghĩa chuẩn trong sách giáo khoa, cần ôn lại định nghĩa nền tảng.';
  }

  return { concept, reason, explanation };
};

/**
 * Xây dựng nội dung bài học củng cố trọng tâm + ví dụ minh họa + cạm bẫy cần tránh
 */
export const buildRemedialLesson = (topic: string, weakConcepts: string[]): RemedialTopicLesson => {
  const tLower = topic.toLowerCase() + ' ' + weakConcepts.join(' ').toLowerCase();

  if (tLower.includes('cấp độ tổ chức') || tLower.includes('thế giới sống')) {
    return {
      topic: 'Các cấp độ tổ chức của thế giới sống',
      coreTheory: 'Thế giới sống được tổ chức theo nguyên tắc thứ bậc: cấp độ dưới làm nền tảng cho cấp độ trên. 5 CẤP ĐỘ CƠ BẢN: Tế bào → Cơ thể → Quần thể → Quần xã → Hệ sinh thái. Đặc điểm chung: Hệ thống mở & tự điều chỉnh, liên tục tiến hóa tạo nên sự đa dạng.',
      diagramOrKeyNote: '📌 Sơ đồ bậc thang: [Phân tử] → [Bào quan] → [TẾ BÀO] (đơn vị sống cơ bản nhỏ nhất) → [Mô] → [Cơ quan] → [Hệ cơ quan] → [CƠ THỂ] → [QUẦN THỂ] (cùng loài) → [QUẦN XÃ] (nhiều loài) → [HỆ SINH THÁI] (quần xã + sinh cảnh).',
      commonTrap: '⚠️ Bẫy đề thi: Coi "Phân tử" hoặc "Bào quan" là cấp độ sống cơ bản (Sai! Cấp độ sống cơ bản nhỏ nhất bắt buộc phải là TẾ BÀO). Khẳng định phân bào "duy nhất là nguyên phân" (Sai! Còn có giảm phân và trực phân).',
      practicalExample: '💡 Ví dụ thực tế: Một đàn cá rô phi sống trong hồ là Quần thể; toàn bộ cá, rong, vi khuẩn, phù du trong hồ là Quần xã; khi tính cả nước, bùn đáy, ánh sáng thì tạo thành Hệ sinh thái hồ nước ngọt.'
    };
  }

  if (tLower.includes('nước') || tLower.includes('khoáng') || tLower.includes('khí khổng')) {
    return {
      topic: 'Trao đổi nước và dinh dưỡng khoáng ở thực vật',
      coreTheory: 'Nước và ion khoáng từ đất vào mạch gỗ qua 2 con đường: Gian bào (nhanh, bị chặn lại bởi đai Caspary ở nội bì để kiểm soát) và Tế bào chất (chậm, chọn lọc). Động lực vận chuyển dòng mạch gỗ: 1) Thoát hơi nước ở lá (lực kéo chính đầu trên); 2) Áp suất rễ (lực đẩy đầu dưới); 3) Lực liên kết giữa các phân tử nước.',
      diagramOrKeyNote: '📌 Động lực kéo chính: Khí khổng mở khi tế bào hạt đậu trương nước (thành mỏng dãn nhiều hơn thành dày, mép trong cong lại mở lỗ khí).',
      commonTrap: '⚠️ Bẫy đề thi: Nhầm dòng mạch rây (chất hữu cơ sucrose từ lá xuống rễ) với dòng mạch gỗ (nước và khoáng từ rễ lên lá). Bón phân quá liều làm nồng độ dung dịch đất cao hơn dịch bào rễ → rễ không hút được nước gây héo rũ.',
      practicalExample: '💡 Ứng dụng thực hành: Trồng cây thủy canh cần sục khí định kỳ để cung cấp O2 cho rễ hô hấp lấy ATP hấp thụ khoáng chủ động.'
    };
  }

  if (tLower.includes('trao đổi chất') || tLower.includes('chuyển hoá năng lượng')) {
    return {
      topic: 'Khái quát về trao đổi chất và chuyển hóa năng lượng',
      coreTheory: 'Trao đổi chất và chuyển hóa năng lượng gồm 2 mặt gắn bó mật thiết: ĐỒNG HÓA (tổng hợp chất hữu cơ đặc trưng, tích lũy hóa năng trong liên kết hóa học) và DỊ HÓA (phân giải chất hữu cơ, giải phóng năng lượng dưới dạng ATP cung cấp cho mọi hoạt động sống).',
      diagramOrKeyNote: '📌 Chu trình năng lượng: Chất phức tạp ⇌ [Dị hóa giải phóng ATP] ⇌ [Đồng hóa tiêu tốn ATP] ⇌ Chất đơn giản.',
      commonTrap: '⚠️ Bẫy đề thi: Cho rằng đồng hóa và dị hóa tách rời nhau. Thực tế nếu không có dị hóa giải phóng ATP thì đồng hóa không thể diễn ra; ngược lại nếu không có đồng hóa tạo chất nền thì dị hóa không có nguyên liệu phân giải.',
      practicalExample: '💡 Ứng dụng: Vận động viên sau thi đấu cần bổ sung carbohydrate dễ hấp thụ và nghỉ ngơi đủ để phục hồi lượng ATP đã tiêu hao.'
    };
  }

  if (tLower.includes('gene') || tLower.includes('phiên mã') || tLower.includes('dịch mã')) {
    return {
      topic: 'Gene, phiên mã và dịch mã tổng hợp protein',
      coreTheory: 'Phiên mã diễn ra trong nhân (ở nhân thực), enzyme RNA polymerase đọc mạch khuôn 3\'→5\' để tổng hợp mRNA 5\'→3\' theo NTBS: A-U, T-A, G-C, C-G. Dịch mã diễn ra tại ribosome trong tế bào chất: ribosome trượt trên mRNA dịch mã từng bộ ba (codon) khớp với bộ ba đối mã (anticodon) trên tRNA.',
      diagramOrKeyNote: '📌 Luồng thông tin di truyền: DNA (mạch khuôn 3\'→5\') → Phiên mã → mRNA (5\'→3\') → Dịch mã tại Ribosome → Chuỗi Polypeptide → Protein.',
      commonTrap: '⚠️ Bẫy đề thi: Nhầm chiều đọc của RNA polymerase (luôn đọc mạch khuôn chiều 3\'→5\' và tổng hợp mạch mới chiều 5\'→3\'). Số amino acid trong protein hoàn chỉnh = (Tổng nucleotide mRNA / 3) - 2 (trừ codon kết thúc và amino acid mở đầu Met bị cắt bỏ).',
      practicalExample: '💡 Ứng dụng công nghệ sinh học: Chuyển gene insulin người vào vi khuẩn E. coli để vi khuẩn phiên mã và dịch mã sản xuất insulin điều trị đái tháo đường.'
    };
  }

  // Mặc định
  return {
    topic: topic || 'Trọng tâm bài học Sinh học',
    coreTheory: `Nắm vững toàn bộ các mục tiêu bài học: Nêu rõ khái niệm, phân biệt các cơ chế hoạt động sinh học, và giải thích được các ứng dụng thực tế theo Chương trình GDPT 2018.`,
    diagramOrKeyNote: '📌 Nguyên tắc ôn luyện: Học từ Khái niệm nền tảng (Nhận biết) → Bản chất cơ chế & Mối quan hệ (Thông hiểu) → Ứng dụng giải bài toán & hiện tượng thực tế (Vận dụng).',
    commonTrap: '⚠️ Chú ý đọc kỹ các từ khóa mang tính tuyệt đối trong câu hỏi Đúng/Sai (ví dụ: "chỉ", "tất cả", "luôn luôn", "duy nhất") vì thường là bẫy của đề thi.',
    practicalExample: '💡 Liên hệ thực tiễn giúp nhớ lâu: Luôn đặt câu hỏi "Hiện tượng này diễn ra trong đời sống/nông nghiệp/y học như thế nào?".'
  };
};

/**
 * Sinh ngân hàng 3-4 câu hỏi luyện tập bù đắp lỗ hổng bám sát các câu học sinh làm sai
 */
export const generateTargetedPracticeQuestions = (
  exam: Exam,
  errorItems: DiagnosticErrorItem[]
): Question[] => {
  const generated: Question[] = [];
  const baseQuestions = exam.questions || [];

  // 1. Tạo biến thể kiểm tra lại chính xác các câu sai
  errorItems.slice(0, 3).forEach((item, idx) => {
    const originalQ = baseQuestions.find(q => q.id === item.questionId);
    if (originalQ) {
      if (originalQ.type === 'MCQ') {
        generated.push({
          id: `retest-mcq-${idx + 1}-${Date.now()}`,
          type: 'MCQ',
          text: `[Luyện lại kiến thức hổng] ${originalQ.text.replace(/\[.*?\]/g, '').trim()}`,
          options: [...originalQ.options],
          correctAnswer: originalQ.correctAnswer,
          explanation: item.explanation || originalQ.explanation
        });
      } else if (originalQ.type === 'TF') {
        generated.push({
          id: `retest-tf-${idx + 1}-${Date.now()}`,
          type: 'TF',
          text: `[Kiểm tra lại mệnh đề] ${originalQ.text.replace(/\[.*?\]/g, '').trim()}`,
          options: ['Đúng', 'Sai'],
          correctAnswer: originalQ.correctAnswer,
          explanation: item.explanation || originalQ.explanation
        });
      } else {
        generated.push({
          id: `retest-sa-${idx + 1}-${Date.now()}`,
          type: 'SA',
          text: `[Luyện lại trả lời ngắn] ${originalQ.text.replace(/\[.*?\]/g, '').trim()}`,
          options: [],
          correctAnswer: originalQ.correctAnswer,
          explanation: item.explanation || originalQ.explanation
        });
      }
    }
  });

  // Nếu số câu luyện tập ít hơn 3, bổ sung từ các câu trong đề
  if (generated.length < 3 && baseQuestions.length >= 3) {
    baseQuestions.slice(0, 3 - generated.length).forEach((bq, i) => {
      generated.push({
        id: `retest-extra-${i + 1}-${Date.now()}`,
        type: bq.type,
        text: `[Củng cố nâng cao] ${bq.text}`,
        options: [...bq.options],
        correctAnswer: bq.correctAnswer,
        explanation: bq.explanation
      });
    });
  }

  return generated;
};

/**
 * Xây dựng Hồ sơ năng lực và Chuẩn đoán lỗi toàn diện cho học sinh sau khi nộp bài
 */
export const buildStudentCompetencyProfile = (
  exam: Exam,
  user: User,
  answers: Record<string, string>,
  correctCount: number
): StudentCompetencyProfile => {
  const totalQuestions = (exam.questions || []).length;
  const score10 = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 10 * 100) / 100 : 0;

  const errorItems: DiagnosticErrorItem[] = [];
  const cognitiveStats = {
    nhanBiet: { total: 0, correct: 0, wrong: 0 },
    thongHieu: { total: 0, correct: 0, wrong: 0 },
    vanDung: { total: 0, correct: 0, wrong: 0 }
  };

  (exam.questions || []).forEach((q, idx) => {
    if (!q) return;
    const userAns = (answers[q.id] || '').trim();
    const correctAns = (q.correctAnswer || '').trim();

    let isCorrect = false;
    if (q.type === 'SA') {
      if (userAns.toLowerCase() === correctAns.toLowerCase()) {
        isCorrect = true;
      } else if (!isNaN(Number(userAns)) && !isNaN(Number(correctAns)) && Number(userAns) === Number(correctAns)) {
        isCorrect = true;
      }
    } else {
      isCorrect = userAns.toUpperCase() === correctAns.toUpperCase();
    }

    // Xác định mức độ nhận thức
    const textLower = (q.text || '').toLowerCase();
    let cog: 'NHAN_BIET' | 'THONG_HIEU' | 'VAN_DUNG' = 'NHAN_BIET';
    if (textLower.includes('vận dụng') || textLower.includes('thực tế') || textLower.includes('ứng dụng') || q.type === 'SA') {
      cog = 'VAN_DUNG';
    } else if (textLower.includes('thông hiểu') || textLower.includes('phân biệt') || textLower.includes('giải thích')) {
      cog = 'THONG_HIEU';
    } else if (textLower.includes('nhận biết') || textLower.includes('khái niệm') || textLower.includes('liệt kê')) {
      cog = 'NHAN_BIET';
    } else {
      if (idx < Math.ceil(totalQuestions * 0.4)) cog = 'NHAN_BIET';
      else if (idx < Math.ceil(totalQuestions * 0.75)) cog = 'THONG_HIEU';
      else cog = 'VAN_DUNG';
    }

    if (cog === 'NHAN_BIET') {
      cognitiveStats.nhanBiet.total++;
      if (isCorrect) cognitiveStats.nhanBiet.correct++;
      else cognitiveStats.nhanBiet.wrong++;
    } else if (cog === 'THONG_HIEU') {
      cognitiveStats.thongHieu.total++;
      if (isCorrect) cognitiveStats.thongHieu.correct++;
      else cognitiveStats.thongHieu.wrong++;
    } else {
      cognitiveStats.vanDung.total++;
      if (isCorrect) cognitiveStats.vanDung.correct++;
      else cognitiveStats.vanDung.wrong++;
    }

    if (!isCorrect) {
      const diag = diagnoseErrorReason(q, userAns, cog);
      errorItems.push({
        questionId: q.id,
        questionText: q.text,
        userAnswer: userAns || 'Chưa trả lời',
        correctAnswer: q.correctAnswer,
        isCorrect: false,
        cognitiveLevel: cog,
        weakConcept: diag.concept,
        reasonWhyWrong: diag.reason,
        explanation: diag.explanation
      });
    }
  });

  // Xác định mức độ hổng nhiều nhất
  let weakLevel: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Không hổng' = 'Không hổng';
  const maxWrong = Math.max(cognitiveStats.nhanBiet.wrong, cognitiveStats.thongHieu.wrong, cognitiveStats.vanDung.wrong);
  if (maxWrong > 0) {
    if (cognitiveStats.nhanBiet.wrong === maxWrong) weakLevel = 'Nhận biết';
    else if (cognitiveStats.thongHieu.wrong === maxWrong) weakLevel = 'Thông hiểu';
    else weakLevel = 'Vận dụng';
  }

  // Danh sách chủ đề hổng
  const weakTopics = Array.from(new Set(errorItems.map(e => e.weakConcept)));
  if (weakTopics.length === 0) {
    weakTopics.push('Nắm vững kiến thức bài học');
  }

  // Xây dựng bài học củng cố
  const lessonTopic = exam.lessonName || exam.topic || exam.title;
  const remedialLessons = [buildRemedialLesson(lessonTopic, weakTopics)];

  // Sinh câu hỏi luyện tập bù đắp
  const practiceQuestions = generateTargetedPracticeQuestions(exam, errorItems);

  let status: 'CẦN_CỦNG_CỐ' | 'ĐANG_LUYỆN_TẬP' | 'ĐÃ_TIẾN_BỘ' | 'XUẤT_SẮC' = 'CẦN_CỦNG_CỐ';
  if (score10 >= 9.0) status = 'XUẤT_SẮC';
  else if (score10 >= 8.0) status = 'ĐÃ_TIẾN_BỘ';

  return {
    examId: exam.id,
    examTitle: exam.title,
    lessonName: lessonTopic,
    studentId: user.studentId,
    studentName: user.name,
    studentClass: user.className,
    date: new Date().toISOString(),
    initialScore: correctCount,
    totalQuestions,
    score10,
    weakLevel,
    weakTopics,
    cognitiveStats,
    errorItems,
    remedialLessons,
    practiceQuestions,
    status
  };
};

/**
 * Đánh giá tiến bộ sau khi học sinh làm xong bài kiểm tra lại / luyện tập bù đắp
 */
export const evaluateRemedialProgress = (
  profile: StudentCompetencyProfile,
  practiceAnswers: Record<string, string>
): StudentCompetencyProfile => {
  let correctInPractice = 0;
  const totalPractice = profile.practiceQuestions.length;

  profile.practiceQuestions.forEach(q => {
    const userA = (practiceAnswers[q.id] || '').trim();
    const correctA = (q.correctAnswer || '').trim();

    let ok = false;
    if (q.type === 'SA') {
      if (userA.toLowerCase() === correctA.toLowerCase()) ok = true;
      else if (!isNaN(Number(userA)) && !isNaN(Number(correctA)) && Number(userA) === Number(correctA)) ok = true;
    } else {
      ok = userA.toUpperCase() === correctA.toUpperCase();
    }

    if (ok) correctInPractice++;
  });

  const practiceScore10 = totalPractice > 0 ? Math.round((correctInPractice / totalPractice) * 10 * 100) / 100 : 10;
  const delta = Math.round((practiceScore10 - profile.score10) * 10) / 10;

  let newStatus: 'CẦN_CỦNG_CỐ' | 'ĐANG_LUYỆN_TẬP' | 'ĐÃ_TIẾN_BỘ' | 'XUẤT_SẮC' = 'ĐÃ_TIẾN_BỘ';
  if (practiceScore10 >= 9.0) newStatus = 'XUẤT_SẮC';
  else if (practiceScore10 < 6.0) newStatus = 'CẦN_CỦNG_CỐ';

  return {
    ...profile,
    practiceAnswers,
    practiceScore: correctInPractice,
    isRetestSubmitted: true,
    improvementDelta: delta,
    status: newStatus
  };
};

/**
 * Lưu hồ sơ năng lực vào bộ nhớ máy
 */
export const saveCompetencyProfile = (profile: StudentCompetencyProfile, userPhone: string) => {
  try {
    const key = `bio_profile_${userPhone || 'guest'}_${profile.examId}`;
    localStorage.setItem(key, JSON.stringify(profile));
    
    // Cập nhật danh sách tổng hợp
    const listKey = `bio_profile_list_${userPhone || 'guest'}`;
    const raw = localStorage.getItem(listKey);
    let list: StudentCompetencyProfile[] = raw ? JSON.parse(raw) : [];
    list = [profile, ...list.filter(p => p.examId !== profile.examId)];
    localStorage.setItem(listKey, JSON.stringify(list));
  } catch (e) {
    console.error("Lỗi lưu hồ sơ năng lực:", e);
  }
};

/**
 * Lấy hồ sơ năng lực đã lưu của một bài kiểm tra
 */
export const getSavedCompetencyProfile = (examId: string, userPhone: string): StudentCompetencyProfile | null => {
  try {
    const key = `bio_profile_${userPhone || 'guest'}_${examId}`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};
