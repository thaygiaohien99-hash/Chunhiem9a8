
import { GoogleGenAI } from "@google/genai";
import { Question } from "../types";

export interface GenerateQuestionOptions {
  grade?: string; // 'Lớp 10' | 'Lớp 11' | 'Lớp 12'
  topic?: string; // Chủ đề
  lessonName?: string; // Tên Bài Học
  learningObjectives?: string; // Yêu Cầu Cần Đạt (YCCĐ)
  count?: number;
  tracNghiemCount?: number;
  dungSaiCount?: number;
  traLoiNganCount?: number;
  nhanBietCount?: number;
  thongHieuCount?: number;
  vanDungCount?: number;
}

export interface CognitiveLevelConfig {
  hasNhanBiet: boolean;
  hasThongHieu: boolean;
  hasVanDung: boolean;
  nhanBietCount: number;
  thongHieuCount: number;
  vanDungCount: number;
  mcqCount: number;          // Phần 1: Số câu trắc nghiệm khách quan 4 lựa chọn
  tfQuestionsCount: number;  // Phần 2: Số câu lớn trắc nghiệm Đúng/Sai
  tfItemsCount: number;      // Phần 2: Tổng số ý lệnh hỏi a, b, c, d (mỗi câu lớn x 4 ý)
  saCount: number;           // Phần 3: Số câu hỏi trả lời ngắn (chỉ bắt buộc ở Khối 12)
  isLop12: boolean;          // Đánh dấu khối Lớp 12 (3 phần) so với Lớp 10/11 (2 phần)
  totalCount: number;        // Tổng số mục câu hỏi chấm điểm
  tfCount: number;           // Tương thích: số câu Đúng/Sai lớn
}

// Phân tích văn bản YCCĐ để xác định phân bổ câu hỏi chuẩn theo GDPT 2018:
// - Khối Lớp 10 & 11: Bắt buộc gồm ĐÚNG 2 PHẦN (Phần 1: Trắc nghiệm khách quan + Phần 2: Đúng/Sai)
// - Khối Lớp 12: Bắt buộc gồm ĐẦY ĐỦ 3 PHẦN (Phần 1: Trắc nghiệm khách quan + Phần 2: Đúng/Sai + Phần 3: Trả lời ngắn)
export const analyzeLearningObjectives = (text: string, requestedTotal?: number, grade?: string): CognitiveLevelConfig => {
  const clean = text || '';
  const hasNB = /nhận\s*biết/i.test(clean);
  const hasTH = /thông\s*hiểu/i.test(clean);
  const hasVD = /vận\s*dụng/i.test(clean);

  const isLop12 = grade === 'Lớp 12' || grade === 'Sinh 12' || /lớp\s*12|sinh\s*12/i.test(clean);

  const targetTotal = requestedTotal && requestedTotal >= 6 ? requestedTotal : (isLop12 ? 12 : 10);
  let tfQuestionsCount = 1;
  let tfItemsCount = tfQuestionsCount * 4; // 4 ý lệnh hỏi a, b, c, d
  
  // Phần 3 (Trả lời ngắn): Chỉ áp dụng cho Lớp 12, KHÔNG áp dụng cho Lớp 10, 11
  const saCount = isLop12 ? 2 : 0;
  let mcqCount = Math.max(2, targetTotal - tfItemsCount - saCount);

  if (targetTotal >= 16) {
    tfQuestionsCount = 2;
    tfItemsCount = 8;
    mcqCount = targetTotal - tfItemsCount - saCount;
  }

  // Phân bổ câu hỏi Phần 1 (MCQ) theo các mức độ nhận thức của YCCĐ
  let nhanBietCount = Math.max(1, Math.round(mcqCount * 0.5));
  let thongHieuCount = Math.max(1, Math.round(mcqCount * 0.3));
  let vanDungCount = Math.max(1, mcqCount - nhanBietCount - thongHieuCount);

  if (hasNB && !hasTH && !hasVD) {
    nhanBietCount = mcqCount;
    thongHieuCount = 0;
    vanDungCount = 0;
  } else if (!hasNB && hasTH && !hasVD) {
    nhanBietCount = 0;
    thongHieuCount = mcqCount;
    vanDungCount = 0;
  } else if (!hasNB && !hasTH && hasVD) {
    nhanBietCount = 0;
    thongHieuCount = 0;
    vanDungCount = mcqCount;
  }

  return {
    hasNhanBiet: hasNB || (!hasNB && !hasTH && !hasVD),
    hasThongHieu: hasTH || (!hasNB && !hasTH && !hasVD),
    hasVanDung: hasVD || (!hasNB && !hasTH && !hasVD),
    nhanBietCount,
    thongHieuCount,
    vanDungCount,
    mcqCount,
    tfQuestionsCount,
    tfItemsCount,
    saCount,
    isLop12,
    totalCount: mcqCount + tfItemsCount + saCount,
    tfCount: tfQuestionsCount
  };
};

// Helper to generate questions strictly adhering to learning objectives and cognitive levels
export const generateBiologyQuestions = async (
  param: string | GenerateQuestionOptions, 
  count?: number
): Promise<Question[]> => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });

  let grade = 'Lớp 10';
  let topic = '';
  let lessonName = '';
  let learningObjectives = '';

  if (typeof param === 'string') {
    topic = param;
  } else {
    grade = param.grade || 'Lớp 10';
    topic = param.topic || '';
    lessonName = param.lessonName || '';
    learningObjectives = param.learningObjectives || '';
  }

  const requestedCount = (param as GenerateQuestionOptions)?.count || count;
  const config = analyzeLearningObjectives(learningObjectives, requestedCount, grade);

  // Áp dụng số lượng câu hỏi tùy chỉnh theo cấu hình của giáo viên
  if (typeof param !== 'string') {
    if (typeof param.tracNghiemCount === 'number') {
      config.mcqCount = Math.max(0, param.tracNghiemCount);
      // Phân bổ các mức độ nhận thức: ~50% Nhận biết, ~30% Thông hiểu, ~20% Vận dụng
      config.nhanBietCount = Math.max(1, Math.round(config.mcqCount * 0.5));
      config.thongHieuCount = Math.max(1, Math.round(config.mcqCount * 0.3));
      config.vanDungCount = Math.max(0, config.mcqCount - config.nhanBietCount - config.thongHieuCount);
    } else {
      if (typeof param.nhanBietCount === 'number') config.nhanBietCount = Math.max(0, param.nhanBietCount);
      if (typeof param.thongHieuCount === 'number') config.thongHieuCount = Math.max(0, param.thongHieuCount);
      if (typeof param.vanDungCount === 'number') config.vanDungCount = Math.max(0, param.vanDungCount);
      config.mcqCount = config.nhanBietCount + config.thongHieuCount + config.vanDungCount;
    }

    if (typeof param.dungSaiCount === 'number') {
      config.tfQuestionsCount = Math.max(0, param.dungSaiCount);
      config.tfItemsCount = config.tfQuestionsCount * 4;
      config.tfCount = config.tfQuestionsCount;
    }

    if (typeof param.traLoiNganCount === 'number' && config.isLop12) {
      config.saCount = Math.max(0, param.traLoiNganCount);
    } else if (!config.isLop12) {
      config.saCount = 0;
    }

    config.totalCount = config.mcqCount + config.tfItemsCount + (config.isLop12 ? config.saCount : 0);
  }

  const prompt = `
    Bạn là chuyên gia khảo thí và biên soạn đề kiểm tra môn Sinh Học THPT theo CHƯƠNG TRÌNH GIÁO DỤC PHỔ THÔNG 2018 (SGK "Kết nối tri thức với cuộc sống").

    THÔNG TIN ĐỀ THI:
    - Khối Lớp: ${grade}
    - Chương trình: GDPT 2018 - Sách Giáo Khoa Kết nối tri thức với cuộc sống
    ${topic ? `- Chủ Đề: ${topic}` : ''}
    ${lessonName ? `- Tên Bài Học: ${lessonName}` : ''}
    - NỘI DUNG YÊU CẦU CẦN ĐẠT (YCCĐ) BẮT BUỘC BÁM SÁT 100%:
    """
    ${learningObjectives}
    """

    ${config.isLop12 ? `
    QUY ĐỊNH BẮT BUỘC VỀ ĐỀ THI KIỂM TRA ĐÁNH GIÁ Ở KHỐI LỚP 12 (THEO ĐỊNH DẠNG MỚI TỐT NGHIỆP THPT):
    BẮT BUỘC GỒM ĐẦY ĐỦ 3 PHẦN NHƯ SAU:
    ` : `
    QUY ĐỊNH BẮT BUỘC VỀ ĐỀ THI KIỂM TRA ĐÁNH GIÁ Ở KHỐI ${grade.toUpperCase()} (LỚP 10 VÀ LỚP 11):
    BẮT BUỘC GỒM ĐÚNG 2 PHẦN NHƯ SAU:
    `}

    ===================================================================
    PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
    - Số lượng: Tạo đúng ${config.mcqCount} câu trắc nghiệm 4 lựa chọn (type: "MCQ") từ Câu 1 đến Câu ${config.mcqCount}.
    - Mỗi câu gồm 4 phương án A, B, C, D (chỉ có duy nhất 1 phương án đúng).
    - Căn cứ biên soạn: Dựa vào các nội dung kiến thức trong YCCĐ bài học:
      + Nhận biết (${config.nhanBietCount} câu): Hỏi về khái niệm, định nghĩa, đặc điểm, thành phần, cấu tạo cốt lõi.
      + Thông hiểu (${config.thongHieuCount} câu): Hỏi về bản chất hiện tượng, cơ chế sinh học, so sánh, phân tích mối quan hệ cấu trúc - chức năng.
      + Vận dụng (${config.vanDungCount} câu): Bắt buộc câu hỏi có tính thực tế (gắn với thực tiễn đời sống con người, hiện tượng tự nhiên, bảo vệ sức khỏe, ứng dụng y học, bảo vệ môi trường, hoặc xử lý thí nghiệm thực hành).
    - Định dạng mỗi câu:
      {
        "text": "Câu [Số]. [Nội dung câu hỏi]",
        "type": "MCQ",
        "options": ["A. [Nội dung A]", "B. [Nội dung B]", "C. [Nội dung C]", "D. [Nội dung D]"],
        "correctAnswer": "A" (hoặc "B", "C", "D")
      }

    ===================================================================
    PHẦN 2. CÂU HỎI ĐÚNG/SAI. Ở MỖI Ý CÁC EM SẼ TRẢ LỜI “ĐÚNG” HOẶC “SAI”.
    - Số lượng: Tạo đúng ${config.tfQuestionsCount} câu hỏi Đúng/Sai lớn (tương ứng ${config.tfItemsCount} ý mệnh đề a, b, c, d) bắt đầu từ Câu ${config.mcqCount + 1}.
    - Cấu trúc mỗi câu hỏi Đúng/Sai:
      Gồm 1 câu dẫn chung bám sát YCCĐ của bài học (ví dụ: "Câu ${config.mcqCount + 1}. Cho các nhận định về... Nhận định nào ĐÚNG/SAI:") và BẮT BUỘC ĐỦ 4 Ý LỆNH HỎI: a), b), c), d).
    - Định dạng trong mảng JSON trả về:
      Mỗi ý a, b, c, d được biểu diễn thành 1 phần tử riêng biệt (type: "TF") với cú pháp trường "text" chuẩn xác:
      {
        "text": "Câu ${config.mcqCount + 1}. [Nội dung dẫn chung bám sát YCCĐ] - a) [Nội dung mệnh đề phát biểu a]",
        "type": "TF",
        "options": ["Đúng", "Sai"],
        "correctAnswer": "Đúng"
      },
      {
        "text": "Câu ${config.mcqCount + 1}. [Nội dung dẫn chung bám sát YCCĐ] - b) [Nội dung mệnh đề phát biểu b]",
        "type": "TF",
        "options": ["Đúng", "Sai"],
        "correctAnswer": "Đúng"
      },
      {
        "text": "Câu ${config.mcqCount + 1}. [Nội dung dẫn chung bám sát YCCĐ] - c) [Nội dung mệnh đề phát biểu c]",
        "type": "TF",
        "options": ["Đúng", "Sai"],
        "correctAnswer": "Đúng"
      },
      {
        "text": "Câu ${config.mcqCount + 1}. [Nội dung dẫn chung bám sát YCCĐ] - d) [Nội dung mệnh đề phát biểu d]",
        "type": "TF",
        "options": ["Đúng", "Sai"],
        "correctAnswer": "Sai"
      }

    ${config.isLop12 ? `
    ===================================================================
    PHẦN 3. CÂU HỎI TRẢ LỜI NGẮN. (CHỈ BẮT BUỘC ÁP DỤNG CHO KHỐI LỚP 12)
    - Số lượng: Tạo đúng ${config.saCount} câu hỏi trả lời ngắn (type: "SA") từ Câu 1 đến Câu ${config.saCount}.
    - Yêu cầu câu hỏi: Đưa ra câu hỏi định lượng hoặc xác định chính xác một con số cụ thể / một thuật ngữ sinh học 12 chính xác bám sát YCCĐ của bài học (ví dụ: tính số bộ ba mã hóa amino acid, số liên kết hydrogen, số nucleotide, số phân tử DNA con, số amino acid, hiệu suất sinh thái...).
    - Định dạng:
      {
        "text": "Câu [Số]. [Nội dung câu hỏi yêu cầu điền đáp án]",
        "type": "SA",
        "options": [],
        "correctAnswer": "61" (hoặc kết quả số/từ khóa chính xác)
      }
    ` : ''}

    VÍ DỤ MẪU MINH HỌA (tham khảo theo mẫu giáo viên yêu cầu):
    Phần 1:
    Câu 1. Cấp độ tổ chức sống là
    A. Cấp độ tổ chức của vật chất có biểu hiện đầy đủ đặc tính của sự sống.
    B. Cấp độ tổ chức của tế bào có biểu hiện đầy đủ đặc tính của sự sống.
    C. Cấp độ tổ chức của cơ thể có biểu hiện đầy đủ đặc tính của sự sống.
    D. Cấp độ tổ chức của quần thể có biểu hiện đầy đủ đặc tính của sự sống.
    (Đáp án đúng: A)

    Phần 2:
    Câu 2. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI.
    a) Tế bào là nơi diễn ra mọi hoạt động sống. (Đúng)
    b) Tế bào là đơn vị chức năng của cơ thể sống. (Đúng)
    c) Tế bào có khả năng trao đổi chất theo phương thức đồng hóa và dị hóa. (Đúng)
    d) Tế bào có một hình thức phân chia duy nhất là nguyên phân (Sai)

    ${config.isLop12 ? `
    Phần 3. Câu Hỏi Trả Lời Ngắn.
    Câu 1. Có tổng cộng bao nhiêu bộ ba mã hóa các amino acid?
    Đáp án điền vào: ...........................................
    (Đáp án đúng: 61)
    ` : ''}

    LƯU Ý: Đây chỉ là mẫu cấu trúc. Bạn cần DỰA VÀO NỘI DUNG YÊU CẦU CẦN ĐẠT CỦA BÀI HỌC Ở TRÊN ĐỂ TẠO CÂU HỎI PHÙ HỢP VÀ CHÍNH XÁC NHẤT.

    TRẢ VỀ KẾT QUẢ ĐÚNG ĐỊNH DẠNG JSON ARRAY THUẦN TÚY (không kèm bất kỳ văn bản giải thích hay markdown code blocks):
    [
      ...
    ]
  `;

  const CANDIDATE_MODELS = [
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.1-pro-preview'
  ];

  let rawQuestions: any[] = [];
  let apiSuccess = false;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName, 
        contents: prompt,
        config: { 
          responseMimeType: 'application/json'
        }
      });

      const rawText = response.text || '[]';
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        rawQuestions = parsed;
        apiSuccess = true;
        break;
      }
    } catch (err: any) {
      console.warn(`[Gemini] Model ${modelName} encountered error:`, err?.message || err);
    }
  }

  // If Gemini API succeeded, format and return the parsed questions
  if (apiSuccess && rawQuestions.length > 0) {
    return rawQuestions.map((q: any, index: number) => {
      const isTF = q.type === 'TF' || (Array.isArray(q.options) && q.options.length === 2 && q.options.includes('Đúng') && q.options.includes('Sai'));
      
      let cleanOptions = ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'];
      if (isTF) {
        cleanOptions = ['Đúng', 'Sai'];
      } else if (q.type === 'SA') {
        cleanOptions = [];
      } else if (Array.isArray(q.options) && q.options.length > 0) {
        cleanOptions = q.options.map((opt: any) => typeof opt === 'string' ? opt.replace(/^[A-D][\.\:\)]\s*/, '').trim() : String(opt));
      }

      let cleanAnswer = q.correctAnswer;
      if (isTF) {
        cleanAnswer = (cleanAnswer === 'Sai' || String(cleanAnswer).toLowerCase() === 'sai') ? 'Sai' : 'Đúng';
      } else if (q.type === 'SA') {
        cleanAnswer = String(cleanAnswer || '').trim();
      } else {
        const matched = String(cleanAnswer).toUpperCase().match(/[ABCD]/);
        cleanAnswer = matched ? matched[0] : 'A';
      }

      return {
        id: `gen-${Date.now()}-${index}`,
        type: isTF ? 'TF' : (q.type === 'SA' ? 'SA' : 'MCQ'),
        text: q.text,
        options: cleanOptions,
        correctAnswer: cleanAnswer
      };
    });
  }

  // Robust Fallback Generator: Tạo bộ câu hỏi chuẩn bám sát YCCĐ khi API gặp sự cố mạng hoặc lỗi mô hình
  return generateCurriculumFallbackQuestions(grade, lessonName || topic, learningObjectives, config);
};

// Hàm tự động biên soạn câu hỏi dự phòng bám sát 100% YCCĐ của bài học:
// - Lớp 10, Lớp 11: Đúng cấu trúc 2 Phần chuẩn
// - Khối Lớp 12: Đúng cấu trúc 3 Phần chuẩn (Phần 1: Trắc nghiệm, Phần 2: Đúng/Sai, Phần 3: Trả lời ngắn)
function generateCurriculumFallbackQuestions(
  grade: string, 
  lessonTitle: string, 
  yccdText: string, 
  config: CognitiveLevelConfig
): Question[] {
  const normTitle = (lessonTitle || '').toLowerCase();
  const isLop12 = grade === 'Lớp 12' || grade === 'Sinh 12' || normTitle.includes('lớp 12') || config.isLop12;
  const isLop10Bai3 = normTitle.includes('bài 3') && normTitle.includes('cấp độ tổ chức');
  const isLop11Bai1 = normTitle.includes('bài 1') && (normTitle.includes('trao đổi chất') || normTitle.includes('chuyển hoá năng lượng'));
  const isLop11Bai2 = normTitle.includes('bài 2') && (normTitle.includes('nước') || normTitle.includes('khoáng'));
  const isLop12Bai2 = isLop12 && (normTitle.includes('bài 2') || normTitle.includes('gene') || normTitle.includes('amino acid') || normTitle.includes('mã di truyền'));

  // 1. MẪU CHUẨN ĐÚNG BÀI 2 LỚP 12 THEO ẢNH GIÁO VIÊN YÊU CẦU (BẮT BUỘC 3 PHẦN):
  if (isLop12Bai2) {
    return [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
      {
        id: `lop12-b2-mcq-1`,
        type: 'MCQ',
        text: 'Câu 1. [Nhận biết] Quá trình phiên mã ở tế bào sinh vật nhân thực diễn ra chủ yếu ở cấu trúc nào sau đây?',
        options: [
          'A. Nhân tế bào.',
          'B. Tế bào chất.',
          'C. Bào quan ribosome.',
          'D. Thể Golgi.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop12-b2-mcq-2`,
        type: 'MCQ',
        text: 'Câu 2. [Nhận biết] Loại phân tử RNA nào sau đây mang bộ ba đối mã (anticodon) làm nhiệm vụ vận chuyển amino acid đến ribosome trong quá trình dịch mã?',
        options: [
          'A. tRNA.',
          'B. mRNA.',
          'C. rRNA.',
          'D. snRNA.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop12-b2-mcq-3`,
        type: 'MCQ',
        text: 'Câu 3. [Thông hiểu] Đặc điểm nào sau đây thể hiện tính thoái hóa của mã di truyền?',
        options: [
          'A. Nhiều bộ ba khác nhau cùng mã hóa cho một loại amino acid (trừ AUG và UGG).',
          'B. Một bộ ba mã hóa cho nhiều loại amino acid khác nhau tùy theo loài sinh vật.',
          'C. Mã di truyền được đọc từ một điểm xác định theo từng cụm 3 nucleotide không gối lên nhau.',
          'D. Tất cả các loài sinh vật trên Trái Đất đều dùng chung một bộ mã di truyền.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop12-b2-mcq-4`,
        type: 'MCQ',
        text: 'Câu 4. [Thông hiểu] Trong quá trình dịch mã, liên kết peptide đầu tiên được hình thành giữa:',
        options: [
          'A. Amino acid mở đầu (Met) với amino acid thứ nhất.',
          'B. Hai amino acid mở đầu với nhau.',
          'C. Amino acid thứ nhất với amino acid thứ hai.',
          'D. Amino acid cuối cùng với codon kết thúc.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop12-b2-mcq-5`,
        type: 'MCQ',
        text: 'Câu 5. [Thông hiểu] Nguyên tắc bổ sung trong quá trình phiên mã tổng hợp phân tử mRNA từ mạch khuôn DNA (chiều 3\'→5\') là:',
        options: [
          'A. A mạch khuôn liên kết với U; T liên kết với A; G liên kết với C; C liên kết với G.',
          'B. A mạch khuôn liên kết với T; T liên kết với A; G liên kết với C; C liên kết với G.',
          'C. A mạch khuôn liên kết với A; T liên kết với U; G liên kết với G; C liên kết với C.',
          'D. A mạch khuôn liên kết với G; T liên kết với C; G liên kết với A; C liên kết với U.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop12-b2-mcq-6`,
        type: 'MCQ',
        text: 'Câu 6. [Vận dụng thực tế] Ứng dụng hiểu biết về mã di truyền và quá trình dịch mã, các nhà khoa học đã sản xuất thành công insulin người bằng kĩ thuật nào sau đây?',
        options: [
          'A. Chuyển gene mã hóa insulin của người vào vi khuẩn E. coli để vi khuẩn dịch mã tạo insulin sinh học.',
          'B. Chiết xuất trực tiếp insulin từ thực vật biến đổi gen không qua phiên mã và dịch mã.',
          'C. Tổng hợp nhân tạo chuỗi amino acid mà không cần thông tin di truyền từ phân tử DNA.',
          'D. Cho tế bào người tự phân chia vô hạn trong môi trường vô trùng để thu insulin tự do.'
        ],
        correctAnswer: 'A'
      },

      // PHẦN 2. CÂU HỎI ĐÚNG/SAI. Ở MỖI Ý CÁC EM SẼ TRẢ LỜI “ĐÚNG” HOẶC “SAI”
      {
        id: `lop12-b2-tf-2a`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - a) Quá trình dịch mã tổng hợp protein diễn ra tại tế bào chất ở cả sinh vật nhân sơ và nhân thực.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop12-b2-tf-2b`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - b) Enzyme RNA polymerase có khả năng tự tháo xoắn phân tử DNA mà không cần enzyme tháo xoắn riêng biệt.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop12-b2-tf-2c`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - c) Trên một phân tử mRNA, nhiều ribosome cùng hoạt động (polyribosome) giúp tăng năng suất tổng hợp protein cùng loại.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop12-b2-tf-2d`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - d) Phân tử tRNA có cấu trúc mạch thẳng hoàn toàn và không có bất kỳ liên kết hydrogen nào giữa các base.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },

      // PHẦN 3. CÂU HỎI TRẢ LỜI NGẮN (ĐẶC TRƯNG KHỐI LỚP 12)
      {
        id: `lop12-b2-sa-1`,
        type: 'SA',
        text: 'Câu 1. Có tổng cộng bao nhiêu bộ ba mã hóa các amino acid?',
        options: [],
        correctAnswer: '61'
      },
      {
        id: `lop12-b2-sa-2`,
        type: 'SA',
        text: 'Câu 2. Một phân tử mRNA có 900 nucleotide, quá trình dịch mã trên mRNA này tổng hợp 1 chuỗi polypeptide hoàn chỉnh có bao nhiêu amino acid?',
        options: [],
        correctAnswer: '298'
      }
    ];
  }

  // 1. MẪU CHUẨN ĐÚNG BÀI 3 LỚP 10 THEO ẢNH GIÁO VIÊN YÊU CẦU:
  if (isLop10Bai3) {
    return [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
      {
        id: `lop10-b3-mcq-1`,
        type: 'MCQ',
        text: 'Câu 1. Cấp độ tổ chức sống là',
        options: [
          'A. Cấp độ tổ chức của vật chất có biểu hiện đầy đủ đặc tính của sự sống.',
          'B. Cấp độ tổ chức của tế bào có biểu hiện đầy đủ đặc tính của sự sống.',
          'C. Cấp độ tổ chức của cơ thể có biểu hiện đầy đủ đặc tính của sự sống.',
          'D. Cấp độ tổ chức của quần thể có biểu hiện đầy đủ đặc tính của sự sống.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop10-b3-mcq-2`,
        type: 'MCQ',
        text: 'Câu 2. Các cấp độ tổ chức sống cơ bản bao gồm những cấp độ nào sau đây?',
        options: [
          'A. Tế bào, cơ thể, quần thể, quần xã, hệ sinh thái.',
          'B. Phân tử, bào quan, tế bào, mô, cơ quan.',
          'C. Mô, cơ quan, hệ cơ quan, cơ thể.',
          'D. Quần thể, quần xã, sinh quyển, vũ trụ.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop10-b3-mcq-3`,
        type: 'MCQ',
        text: 'Câu 3. Đặc điểm chung của các cấp tổ chức sống KHÔNG bao gồm đặc điểm nào sau đây?',
        options: [
          'A. Là hệ thống kín, cách biệt hoàn toàn và không trao đổi chất với môi trường.',
          'B. Là hệ thống mở, thường xuyên trao đổi vật chất và năng lượng với môi trường.',
          'C. Có khả năng tự điều chỉnh nhằm duy trì trạng thái cân bằng động.',
          'D. Liên tục tiến hóa tạo nên sự đa dạng phong phú của sinh giới.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop10-b3-mcq-4`,
        type: 'MCQ',
        text: 'Câu 4. Quần thể sinh vật là tập hợp các cá thể có đặc điểm nào sau đây?',
        options: [
          'A. Cùng loài, cùng sinh sống trong một sinh cảnh xác định, tại một thời điểm nhất định và có khả năng sinh sản.',
          'B. Khác loài nhưng có hình thái giống nhau và cùng sinh sống trong một khu rừng.',
          'C. Cùng loài nhưng sống cách biệt địa lí ở các thời điểm lịch sử khác nhau.',
          'D. Nhiều loài động vật và thực vật cùng tương tác qua lại trong hệ sinh thái.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop10-b3-mcq-5`,
        type: 'MCQ',
        text: 'Câu 5. Cấp độ tổ chức nào sau đây là đơn vị cấu trúc và chức năng cơ bản của mọi cơ thể sống?',
        options: [
          'A. Tế bào.',
          'B. Phân tử sinh học DNA.',
          'C. Bào quan ty thể.',
          'D. Cơ quan và hệ cơ quan.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop10-b3-mcq-6`,
        type: 'MCQ',
        text: 'Câu 6. [Vận dụng thực tế] Hiểu biết về mối quan hệ giữa các cấp độ tổ chức sống giúp con người giải quyết vấn đề thực tiễn nào sau đây?',
        options: [
          'A. Xây dựng mô hình bảo tồn đa dạng sinh học và phát triển nông nghiệp sinh thái tuần hoàn.',
          'B. Tiêu diệt triệt để mọi loài vi sinh vật để làm sạch môi trường sống tự nhiên.',
          'C. Khai thác kiệt quệ tài nguyên tự nhiên mà không cần bảo vệ quần xã sinh vật.',
          'D. Ngăn cản sự tiến hóa tự nhiên của các loài động thực vật quý hiếm.'
        ],
        correctAnswer: 'A'
      },

      // PHẦN 2. CÂU HỎI ĐÚNG/SAI. Ở MỖI Ý CÁC EM SẼ TRẢ LỜI “ĐÚNG” HOẶC “SAI”
      {
        id: `lop10-b3-tf-2a`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - a) Tế bào là nơi diễn ra mọi hoạt động sống.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop10-b3-tf-2b`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - b) Tế bào là đơn vị chức năng của cơ thể sống.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop10-b3-tf-2c`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - c) Tế bào có khả năng trao đổi chất theo phương thức đồng hóa và dị hóa.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop10-b3-tf-2d`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - d) Tế bào có một hình thức phân chia duy nhất là nguyên phân',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      }
    ];
  }

  // 2. MẪU CHUẨN BÀI 1 LỚP 11: KHÁI QUÁT VỀ TRAO ĐỔI CHẤT VÀ CHUYỂN HÓA NĂNG LƯỢNG
  if (isLop11Bai1) {
    return [
      // PHẦN 1: CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (CHỌN 1 PHƯƠNG ÁN ĐÚNG)
      {
        id: `lop11-b1-mcq-1`,
        type: 'MCQ',
        text: 'Câu 1. [Nhận biết] Trao đổi chất ở sinh vật là quá trình:',
        options: [
          'A. Cơ thể lấy các chất từ môi trường, biến đổi chúng và đào thải các chất thải ra môi trường.',
          'B. Chỉ hấp thụ năng lượng mặt trời mà không tiêu hao vật chất trong tế bào.',
          'C. Tổng hợp các chất hữu cơ mà không cần giải phóng bất kỳ sản phẩm phụ nào.',
          'D. Phân giải hoàn toàn chất hữu cơ thành nhiệt lượng tỏa ra ngoài không gian.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b1-mcq-2`,
        type: 'MCQ',
        text: 'Câu 2. [Nhận biết] Hai mặt đối lập nhưng gắn bó mật thiết của quá trình trao đổi chất trong tế bào là:',
        options: [
          'A. Đồng hóa và dị hóa.',
          'B. Hô hấp và bài tiết.',
          'C. Tiêu hóa và tuần hoàn.',
          'D. Hút nước và thoát hơi nước.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b1-mcq-3`,
        type: 'MCQ',
        text: 'Câu 3. [Thông hiểu] Quá trình đồng hóa có vai trò cốt lõi nào sau đây đối với cơ thể sinh vật?',
        options: [
          'A. Tổng hợp các chất hữu cơ đặc trưng cho cơ thể và tích lũy năng lượng trong các liên kết hóa học.',
          'B. Phân giải các hợp chất hữu cơ phức tạp thành chất đơn giản để giải phóng ATP tức thời.',
          'C. Đào thải các chất cặn bã nguy hại ra khỏi môi trường nội bào.',
          'D. Tiêu diệt các mầm bệnh vi khuẩn xâm nhập từ môi trường ngoại cảnh.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b1-mcq-4`,
        type: 'MCQ',
        text: 'Câu 4. [Thông hiểu] Sinh vật tự dưỡng khác với sinh vật dị dưỡng ở đặc điểm nào sau đây?',
        options: [
          'A. Tự dưỡng có khả năng tổng hợp chất hữu cơ từ các chất vô cơ nhờ năng lượng ánh sáng hoặc năng lượng hóa học.',
          'B. Tự dưỡng chỉ sử dụng nguồn chất hữu cơ có sẵn do các sinh vật khác cung cấp.',
          'C. Tự dưỡng không cần hấp thụ nước và ion khoáng từ môi trường sống.',
          'D. Tự dưỡng không có quá trình hô hấp tế bào để giải phóng năng lượng ATP.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b1-mcq-5`,
        type: 'MCQ',
        text: 'Câu 5. [Thông hiểu] Năng lượng được giải phóng từ quá trình phân giải dị hóa chủ yếu được tích lũy dưới dạng nào?',
        options: [
          'A. Phân tử cao năng ATP.',
          'B. Nhiệt lượng dự trữ trong nhân tế bào.',
          'C. Sắc tố quang hợp carotenoid.',
          'D. Ánh sáng sinh học phát quang.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b1-mcq-6`,
        type: 'MCQ',
        text: 'Câu 6. [Vận dụng thực tế] Vận dụng hiểu biết về chuyển hóa năng lượng trong cơ thể, một vận động viên thi đấu thể thao cần xây dựng chế độ dinh dưỡng và nghỉ ngơi như thế nào để phục hồi thể lực tối ưu?',
        options: [
          'A. Bổ sung carbohydrate phức hợp và protein dễ hấp thụ, kết hợp ngủ đủ giấc để phục hồi nồng độ ATP và sửa chữa tế bào cơ.',
          'B. Nhịn ăn tuyệt đối sau khi tập luyện cường độ cao để kích thích đốt mỡ nhanh chóng.',
          'C. Uống nước ngọt có ga và nhiều đường hóa học ngay lập tức để tăng đột ngột huyết áp.',
          'D. Tập luyện liên tục không nghỉ ngơi nhằm duy trì trạng thái dị hóa kéo dài.'
        ],
        correctAnswer: 'A'
      },

      // PHẦN 2: CÂU HỎI ĐÚNG/SAI (Ở MỖI Ý TRẢ LỜI ĐÚNG HOẶC SAI)
      {
        id: `lop11-b1-tf-1a`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - a) Năng lượng trong tế bào chủ yếu được chuyển hóa từ hóa năng tích lũy trong chất hữu cơ sang dạng ATP.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop11-b1-tf-1b`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - b) Quá trình dị hóa cung cấp năng lượng và các chất nền nguyên liệu cho quá trình đồng hóa diễn ra.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop11-b1-tf-1c`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - c) Mọi sinh vật trên Trái Đất đều thuộc nhóm sinh vật quang tự dưỡng sử dụng năng lượng ánh sáng mặt trời.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: `lop11-b1-tf-1d`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - d) Rèn luyện thể dục thể thao hợp lý làm tăng cường hiệu quả trao đổi chất và kích thích cơ thể phát triển khỏe mạnh.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      }
    ];
  }

  // 3. MẪU CHUẨN BÀI 2 LỚP 11: TRAO ĐỔI NƯỚC VÀ KHOÁNG Ở THỰC VẬT
  if (isLop11Bai2) {
    return [
      // PHẦN 1: CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (CHỌN 1 PHƯƠNG ÁN ĐÚNG)
      {
        id: `lop11-b2-mcq-1`,
        type: 'MCQ',
        text: 'Câu 1. [Nhận biết] Ở thực vật trên cạn, nước và ion khoáng được hấp thụ chủ yếu qua cơ quan nào sau đây?',
        options: [
          'A. Tế bào lông hút ở rễ.',
          'B. Khí khổng ở bề mặt lá.',
          'C. Tế bào biểu bì của thân non.',
          'D. Mạch rây ở vỏ cây.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b2-mcq-2`,
        type: 'MCQ',
        text: 'Câu 2. [Nhận biết] Dòng mạch gỗ trong thân cây có chức năng chủ yếu là:',
        options: [
          'A. Vận chuyển nước và ion khoáng từ rễ lên thân và lá.',
          'B. Vận chuyển sản phẩm quang hợp (đường sucrose) từ lá xuống rễ.',
          'C. Dẫn truyền xung thần kinh từ rễ lên các chồi non.',
          'D. Tích lũy tinh bột dự trữ trong các mùa rụng lá.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b2-mcq-3`,
        type: 'MCQ',
        text: 'Câu 3. [Thông hiểu] Động lực chính đóng vai trò đầu trên kéo dòng nước và ion khoáng di chuyển liên tục từ rễ lên lá là:',
        options: [
          'A. Quá trình thoát hơi nước qua khí khổng ở lá.',
          'B. Lực đẩy áp suất rễ (hiện tượng ứ giọt).',
          'C. Lực liên kết giữa các phân tử nước với thành mạch gỗ.',
          'D. Trọng lực hút tự nhiên của Trái Đất tác động lên nhựa luyện.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b2-mcq-4`,
        type: 'MCQ',
        text: 'Câu 4. [Thông hiểu] Cơ chế chủ yếu làm cho khí khổng mở ra khi cây được chiếu sáng là:',
        options: [
          'A. Tế bào hạt đậu trương nước làm thành mỏng dãn nở nhiều hơn thành dày, mép trong cong lại mở lỗ khí.',
          'B. Tế bào hạt đậu mất nước hoàn toàn khiến hai vách tế bào dính chặt vào nhau.',
          'C. Sự tích tụ ion Cl- trong gian bào hút hết nước ra ngoài lá cây.',
          'D. Sự co nguyên sinh đột ngột của toàn bộ biểu bì lá cây dưới ánh sáng mạnh.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b2-mcq-5`,
        type: 'MCQ',
        text: 'Câu 5. [Thông hiểu] Khi bón phân quá liều lượng cho cây trồng sẽ dẫn đến hậu quả nghiêm trọng nào sau đây?',
        options: [
          'A. Nồng độ dung dịch đất quá cao khiến rễ cây không hút được nước, làm cây bị héo và chết.',
          'B. Rễ cây tăng cường hút nước quá mức làm vỡ các mô mạch dẫn trong thân.',
          'C. Tốc độ thoát hơi nước ở lá tăng vọt làm rụng hết hoa quả non.',
          'D. Toàn bộ ion khoáng tự do chuyển hóa thành độc tố làm tắc nghẽn dòng mạch rây.'
        ],
        correctAnswer: 'A'
      },
      {
        id: `lop11-b2-mcq-6`,
        type: 'MCQ',
        text: 'Câu 6. [Vận dụng thực tế] Trong kĩ thuật trồng rau thủy canh và tưới tiêu nông nghiệp, biện pháp nào sau đây giúp nâng cao hiệu quả hấp thụ khoáng và giúp rễ hô hấp tốt?',
        options: [
          'A. Thường xuyên sục khí oxy vào dung dịch dinh dưỡng và điều chỉnh nồng độ pH dung dịch phù hợp.',
          'B. Bơm kín nước ngập hoàn toàn rễ và không cho không khí tiếp xúc với rễ cây.',
          'C. Tăng nồng độ muối khoáng lên gấp 10 lần nồng độ tiêu chuẩn để cây lớn nhanh.',
          'D. Sử dụng nước cất 100% không pha thêm bất kỳ nguyên tố khoáng vi lượng nào.'
        ],
        correctAnswer: 'A'
      },

      // PHẦN 2: CÂU HỎI ĐÚNG/SAI (Ở MỖI Ý TRẢ LỜI ĐÚNG HOẶC SAI)
      {
        id: `lop11-b2-tf-2a`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - a) Nước đi vào rễ cây hoàn toàn theo cơ chế thẩm thấu thụ động từ nơi có thế nước cao sang nơi có thế nước thấp.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop11-b2-tf-2b`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - b) Đai Caspary ở nội bì có vai trò kiểm soát, chọn lọc lượng nước và khoáng trước khi đi vào mạch gỗ.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: `lop11-b2-tf-2c`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - c) Bón phân đạm (nitrogen) càng nhiều thì năng suất cây lấy củ và quả càng cao và an toàn cho người sử dụng.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: `lop11-b2-tf-2d`,
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - d) Tưới nước hợp lý đúng nhu cầu sinh lí của từng giai đoạn phát triển giúp cây trồng sinh trưởng khỏe mạnh và tiết kiệm tài nguyên nước.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      }
    ];
  }

  // 4. MẪU DÀNH CHO CÁC BÀI HỌC KHÁC DỰA VÀO YÊU CẦU CẦN ĐẠT CỦA BÀI ĐÓ
  const result: Question[] = [];
  const lines = yccdText
    .split('\n')
    .map(l => l.replace(/^[-*•\d\.\)]+\s*/, '').trim())
    .filter(l => l.length > 5 && !l.endsWith(':'));

  const nbLine = lines.find(l => l.toLowerCase().includes('nêu') || l.toLowerCase().includes('trình bày') || l.toLowerCase().includes('khái niệm')) || lines[0] || `nội dung cốt lõi của ${lessonTitle}`;
  const thLine = lines.find(l => l.toLowerCase().includes('giải thích') || l.toLowerCase().includes('phân tích') || l.toLowerCase().includes('phân biệt')) || lines[1] || `cơ chế hoạt động trong ${lessonTitle}`;
  const vdLine = lines.find(l => l.toLowerCase().includes('vận dụng') || l.toLowerCase().includes('thực tế') || l.toLowerCase().includes('biện pháp')) || lines[2] || `ứng dụng thực tiễn của ${lessonTitle}`;

  // PHẦN 1: TẠO CÁC CÂU MCQ TỪ CÂU 1 ĐẾN CÂU mcqCount
  const mcqTotal = Math.max(2, config.mcqCount || 6);
  for (let idx = 1; idx <= mcqTotal; idx++) {
    let qLevel = idx <= 2 ? 'Nhận biết' : (idx <= 4 ? 'Thông hiểu' : 'Vận dụng thực tế');
    let focalTopic = idx <= 2 ? nbLine : (idx <= 4 ? thLine : vdLine);

    if (qLevel === 'Nhận biết') {
      result.push({
        id: `gen-fb-mcq-${Date.now()}-${idx}`,
        type: 'MCQ',
        text: `Câu ${idx}. [Nhận biết] Theo chương trình ${grade} (${lessonTitle}), phát biểu nào sau đây là ĐÚNG khi nói về: "${focalTopic}"?`,
        options: [
          `A. Là đặc điểm, nguyên lí trọng tâm thể hiện rõ qua "${focalTopic}".`,
          `B. Chỉ xảy ra trong điều kiện nhân tạo và hoàn toàn không có trong tự nhiên.`,
          `C. Không có vai trò gì đối với sự sống và sự thích nghi của cơ thể sinh vật.`,
          `D. Hoàn toàn mâu thuẫn với các quy luật sinh học cơ bản đã được xác nhận.`
        ],
        correctAnswer: 'A'
      });
    } else if (qLevel === 'Thông hiểu') {
      result.push({
        id: `gen-fb-mcq-${Date.now()}-${idx}`,
        type: 'MCQ',
        text: `Câu ${idx}. [Thông hiểu] Phân tích cơ chế sinh học trong bài '${lessonTitle}', nhận định nào sau đây phản ánh chính xác nhất về "${focalTopic}"?`,
        options: [
          `A. Thể hiện sự phù hợp chặt chẽ giữa cấu trúc và chức năng sinh lí nhằm thích nghi và bảo đảm cân bằng nội môi.`,
          `B. Các quá trình sinh lí diễn ra độc lập tuyệt đối và không hề chịu ảnh hưởng từ môi trường ngoài.`,
          `C. Năng lượng tự sinh ra mà không cần trải qua các phản ứng chuyển hóa vật chất trong cơ thể.`,
          `D. Mọi hoạt động trao đổi chất đều dừng lại khi cơ thể thay đổi điều kiện sống.`
        ],
        correctAnswer: 'A'
      });
    } else {
      result.push({
        id: `gen-fb-mcq-${Date.now()}-${idx}`,
        type: 'MCQ',
        text: `Câu ${idx}. [Vận dụng thực tế] Trong đời sống và sản xuất, ứng dụng nào sau đây thể hiện việc vận dụng đúng đắn kiến thức về "${focalTopic}"?`,
        options: [
          `A. Xây dựng giải pháp kỹ thuật, chăm sóc và bảo vệ sức khỏe hoặc canh tác nông nghiệp dựa trên quy luật sinh học của bài học.`,
          `B. Lạm dụng chất kích thích hóa học cực đoan mà không tuân theo các chỉ dẫn an toàn sinh học.`,
          `C. Bỏ qua các nhân tố nhiệt độ, độ ẩm và dinh dưỡng trong quá trình nuôi trồng sinh vật.`,
          `D. Tách rời sinh vật khỏi môi trường sống tự nhiên mà không đảm bảo điều kiện thích nghi.`
        ],
        correctAnswer: 'A'
      });
    }
  }

  // PHẦN 2: TẠO CÂU HỎI ĐÚNG/SAI GỒM 1 CÂU DẪN CHUNG BÁM SÁT YCCĐ VÀ ĐỦ 4 Ý a), b), c), d)
  const tfNum = mcqTotal + 1;
  const leadSentence = `Câu ${tfNum}. Cho các nhận định về kiến thức bài học '${lessonTitle}'. Nhận định nào ĐÚNG/SAI.`;

  result.push(
    {
      id: `gen-fb-tf-${Date.now()}-a`,
      type: 'TF',
      text: `${leadSentence} - a) ${nbLine.replace(/^Nêu|Trình bày|Kể tên/i, '').trim() || `Kiến thức của bài học thể hiện quy luật cơ bản của thế giới sống.`}`,
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Đúng'
    },
    {
      id: `gen-fb-tf-${Date.now()}-b`,
      type: 'TF',
      text: `${leadSentence} - b) ${thLine.replace(/^Giải thích|Phân tích|Phân biệt/i, '').trim() || `Cơ chế sinh học được điều hòa nhằm duy trì tính ổn định của cơ thể.`}`,
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Đúng'
    },
    {
      id: `gen-fb-tf-${Date.now()}-c`,
      type: 'TF',
      text: `${leadSentence} - c) Mọi sinh vật đều có thể tồn tại và phát triển hoàn toàn tách biệt, không chịu bất kỳ quy luật sinh học nào từ bài học.`,
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Sai'
    },
    {
      id: `gen-fb-tf-${Date.now()}-d`,
      type: 'TF',
      text: `${leadSentence} - d) ${vdLine.replace(/^Vận dụng|Giải thích/i, '').trim() || `Vận dụng đúng kiến thức bài học giúp nâng cao hiệu quả thực tiễn và bảo vệ môi trường sống.`}`,
      options: ['Đúng', 'Sai'],
      correctAnswer: 'Đúng'
    }
  );

  // PHẦN 3: CÂU HỎI TRẢ LỜI NGẮN (CHỈ ÁP DỤNG RIÊNG CHO KHỐI LỚP 12)
  if (isLop12) {
    result.push(
      {
        id: `gen-fb-sa-${Date.now()}-1`,
        type: 'SA',
        text: 'Câu 1. Có tổng cộng bao nhiêu bộ ba mã hóa các amino acid?',
        options: [],
        correctAnswer: '61'
      },
      {
        id: `gen-fb-sa-${Date.now()}-2`,
        type: 'SA',
        text: `Câu 2. Vận dụng kiến thức bài học '${lessonTitle}', một phân tử mRNA có 900 nucleotide, quá trình dịch mã trên mRNA này tổng hợp 1 chuỗi polypeptide hoàn chỉnh có bao nhiêu amino acid?`,
        options: [],
        correctAnswer: '298'
      }
    );
  }

  return result;
}

export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64String, mimeType: file.type } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const cropImageFromFile = async (file: File, box: number[]): Promise<string | undefined> => {
  if (!file || !file.type.startsWith('image/') || !box || box.length !== 4) return undefined;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const [ymin, xmin, ymax, xmax] = box;
      const realX = Math.floor((xmin / 1000) * img.width);
      const realY = Math.floor((ymin / 1000) * img.height);
      const realW = Math.ceil(((xmax - xmin) / 1000) * img.width);
      const realH = Math.ceil(((ymax - ymin) / 1000) * img.height);
      const canvas = document.createElement('canvas');
      canvas.width = realW; canvas.height = realH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, realX, realY, realW, realH, 0, 0, realW, realH);
        resolve(canvas.toDataURL('image/png'));
      } else resolve(undefined);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export const generateQuestionsFromDocument = async (file: File): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const filePart = await fileToGenerativePart(file);

  const prompt = `
    Bạn là chuyên gia số hóa đề thi Sinh học. Hãy trích xuất câu hỏi từ tài liệu theo cấu trúc 3 phần:

    1. PHẦN I (Trắc nghiệm MCQ):
       - Nhận diện: "Phần 1. Câu hỏi trắc nghiệm" hoặc tương tự.
       - Quy tắc đáp án: Ký tự A, B, C hoặc D nào được GẠCH CHÂN (underline) là đáp án đúng.
       - Type: 'MCQ'.

    2. PHẦN II (Trắc nghiệm Đúng/Sai):
       - Nhận diện: "Phần II. Trắc nghiệm đúng sai". Một câu hỏi lớn có các ý a, b, c, d.
       - Hãy tách mỗi ý a, b, c, d thành một câu hỏi riêng.
       - Nội dung text: "[Nội dung câu hỏi lớn] - Ý [a/b/c/d]: [Nội dung ý]".
       - Quy tắc đáp án: Nếu ký tự a, b, c, d hoặc nội dung ý đó được GẠCH CHÂN -> Đáp án là "Đúng", ngược lại là "Sai".
       - Type: 'TF'. Options: ["Đúng", "Sai"].

    3. PHẦN III (Trả lời ngắn):
       - Nhận diện: "Phần 3. Trả lời ngắn".
       - Quy tắc đáp án: Số được gạch chân hoặc số nằm ở cuối câu hỏi là đáp án đúng.
       - Type: 'SA'.

    4. HÌNH ẢNH:
       - Nếu câu hỏi có hình minh họa, hãy đặt "hasImage": true and "image_bbox": [ymin, xmin, ymax, xmax] (0-1000).

    TRẢ VỀ JSON ARRAY:
    [
      { "text": "...", "type": "MCQ", "options": ["...", "..."], "correctAnswer": "A", "hasImage": true, "image_bbox": [...] },
      ...
    ]
  `;

  try {
    let response: any = null;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash', 
        contents: { parts: [filePart, { text: prompt }] },
        config: { 
          responseMimeType: 'application/json'
        }
      });
    } catch {
      response = await ai.models.generateContent({
        model: 'gemini-flash-latest', 
        contents: { parts: [filePart, { text: prompt }] },
        config: { 
          responseMimeType: 'application/json'
        }
      });
    }

    const rawQuestions = JSON.parse(response.text);
    return await Promise.all(rawQuestions.map(async (q: any, index: number) => {
        let imageBase64 = undefined;
        if (q.hasImage && q.image_bbox && file.type.startsWith('image/')) {
            imageBase64 = await cropImageFromFile(file, q.image_bbox);
        }
        return {
            id: `doc-${Date.now()}-${index}`,
            type: q.type,
            text: q.text,
            options: q.options || [],
            correctAnswer: q.correctAnswer,
            hasImage: !!q.hasImage,
            image: imageBase64
        };
    }));
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return [];
  }
};

export const generateExportCode = async (type: 'THEME' | 'PAGE'): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = type === 'THEME' ? "Tạo mã HTML/CSS/JS cho Theme Blogspot giáo dục Sinh học." : "Tạo mã HTML/CSS/JS cho Widget trắc nghiệm Sinh học.";
  try {
    let response: any = null;
    try {
      response = await ai.models.generateContent({ 
        model: 'gemini-3.8-flash', 
        contents: prompt
      });
    } catch {
      response = await ai.models.generateContent({ 
        model: 'gemini-flash-latest', 
        contents: prompt
      });
    }
    return response.text.replace(/```html|```xml|```/g, '').trim();
  } catch (e) { return "Lỗi tạo mã."; }
}
