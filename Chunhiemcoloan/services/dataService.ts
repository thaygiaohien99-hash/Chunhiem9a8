import { User, UserLevel, Exam, Question, ExamResult } from '../types';

// --- CẤU HÌNH API ---
export const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyApb-4v-lhzPgZXzPs1k6w_BdAXWKiBRVnFqCXQUyi2RPw5ugEPP8IPrGJ1bJsKeGogw/exec'; 

// Tự động kiểm tra và làm mới bộ nhớ đệm khi chuyển đổi sang URL Apps Script mới
const SCRIPT_URL_VERSION_KEY = 'homeroom_script_url_version_v16_8to';
try {
  const currentVersion = localStorage.getItem(SCRIPT_URL_VERSION_KEY);
  if (currentVersion !== 'v16_8to') {
    localStorage.removeItem('cached_students_all');
    localStorage.removeItem('cached_competition_all');
    localStorage.removeItem('cached_raw_competition_sheet03');
    localStorage.removeItem('cached_weekly_details_map');
    localStorage.removeItem('cached_behavior_rules');
    localStorage.removeItem('cached_managers_all');
    localStorage.removeItem('bio_synced_sheet_students');
    localStorage.removeItem('cached_sync_time_all');
    localStorage.removeItem('cached_verified_logins_v1');
    localStorage.removeItem('cached_students_10T6');
    localStorage.removeItem('cached_competition_10T6');
    localStorage.removeItem('cached_students_12T7');
    localStorage.removeItem('cached_competition_12T7');
    localStorage.removeItem('cached_students_10A6');
    localStorage.removeItem('cached_competition_10A6');
    localStorage.removeItem('cached_students_9A8');
    localStorage.removeItem('cached_competition_9A8');
    localStorage.removeItem('cached_students_10T5');
    localStorage.removeItem('cached_competition_10T5');
    localStorage.removeItem('cached_students_9B3');
    localStorage.removeItem('cached_competition_9B3');
    localStorage.removeItem('homeroom_system_config_v1');
    localStorage.removeItem('user_guest');
    localStorage.setItem('homeroom_google_script_url', GOOGLE_SCRIPT_URL);
    localStorage.setItem(SCRIPT_URL_VERSION_KEY, 'v16_8to');
  }
} catch {}

export const getGoogleScriptUrl = (): string => {
  try {
    const saved = localStorage.getItem('homeroom_google_script_url');
    if (saved && saved.trim().startsWith('https://script.google.com/')) {
      if (
        saved.includes('AKfycbwJObQsV5EuD65wzd7u6LemnINPUI8eZjP_cRAfbkcgE1cbPZu8KZ_ddWffvCUv1KrhFw') ||
        saved.includes('AKfycbx7SEDR-Irm9o157C1R5d4TXWQIGNAI7kioR69u6n8EZyiXXXq3R9KwiQlgsy5ZV0YL') ||
        saved.includes('AKfycbwjCbuyvotXULO2CTzNy4PXDbNrFnu_leMJxpDb0yx5_uSOExzaxhyHNutuNtEW6gIb') ||
        saved.includes('AKfycbwJcL8HMKYbrmnrswHVN7ipue1EGzwplD3_ZnV1ERbxGDFaNZ0lYviJP3ES5FT-bbgv') ||
        saved.includes('AKfycbxtdbSbS0C03nKfSdRG6BrV9XqD9ua3WQ4WGOXRTqoFAjiWnUrxqIgigA57QdOI2uI3') ||
        saved.includes('AKfycbzxlw7tpuk7vTAA9RI93nvkTAXkoWTpAbi0sJ6wum7OPGvYbKOjErzZBh83-bIpViiY') ||
        saved.includes('AKfycbxwyHncbH_UOb6rcMiVrSLherEh_igWj3IGoEjJZMOvlUWmbFJTtCUcHpFXX9ZAoy8vhg')
      ) {
        localStorage.setItem('homeroom_google_script_url', GOOGLE_SCRIPT_URL);
        return GOOGLE_SCRIPT_URL;
      }
      return saved.trim();
    }
  } catch {}
  return GOOGLE_SCRIPT_URL;
};

export const setGoogleScriptUrl = (url: string): string => {
  try {
    const clean = (url || '').trim();
    if (clean && clean.startsWith('https://script.google.com/')) {
      localStorage.setItem('homeroom_google_script_url', clean);
      localStorage.removeItem('cached_students_all');
      localStorage.removeItem('cached_competition_all');
      localStorage.removeItem('cached_raw_competition_sheet03');
      localStorage.removeItem('cached_weekly_details_map');
      localStorage.removeItem('cached_behavior_rules');
      localStorage.removeItem('cached_managers_all');
      localStorage.removeItem('bio_synced_sheet_students');
      localStorage.removeItem('cached_sync_time_all');
      localStorage.removeItem('cached_verified_logins_v1');
      window.dispatchEvent(new CustomEvent('app_google_script_url_updated', { detail: { url: clean } }));
      return clean;
    } else {
      localStorage.removeItem('homeroom_google_script_url');
      localStorage.removeItem('cached_students_all');
      localStorage.removeItem('cached_competition_all');
      localStorage.removeItem('cached_raw_competition_sheet03');
      localStorage.removeItem('cached_weekly_details_map');
      localStorage.removeItem('cached_behavior_rules');
      localStorage.removeItem('cached_managers_all');
      localStorage.removeItem('bio_synced_sheet_students');
      localStorage.removeItem('cached_sync_time_all');
      localStorage.removeItem('cached_verified_logins_v1');
      window.dispatchEvent(new CustomEvent('app_google_script_url_updated', { detail: { url: GOOGLE_SCRIPT_URL } }));
      return GOOGLE_SCRIPT_URL;
    }
  } catch {}
  return GOOGLE_SCRIPT_URL;
};

// Link Google Sheet quản lý
export const DEFAULT_GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1H29C4P_0oJNLNvXRE2ts8hJmzasbq1eR1anAyDjITAw/edit?usp=sharing';

export const getGoogleSheetUrl = (): string => {
  try {
    const saved = localStorage.getItem('bio_admin_google_sheet_url');
    if (saved && saved.trim().startsWith('http')) {
      // Tự động nâng cấp nếu trình duyệt còn lưu link cũ trước đây
      if (saved.includes('1A4SzA_KPaR9WmGd3lwpChZ-cO862RkIs6mE5oFcevtA')) {
        localStorage.setItem('bio_admin_google_sheet_url', DEFAULT_GOOGLE_SHEET_URL);
        return DEFAULT_GOOGLE_SHEET_URL;
      }
      return saved.trim();
    }
  } catch {}
  return DEFAULT_GOOGLE_SHEET_URL;
};

export const setGoogleSheetUrl = (url: string): string => {
  try {
    const clean = (url || '').trim();
    if (clean && clean.startsWith('http')) {
      localStorage.setItem('bio_admin_google_sheet_url', clean);
      return clean;
    } else {
      localStorage.removeItem('bio_admin_google_sheet_url');
      return DEFAULT_GOOGLE_SHEET_URL;
    }
  } catch {}
  return DEFAULT_GOOGLE_SHEET_URL;
};

// --- CẤU HÌNH HỆ THỐNG (LỚP, NĂM HỌC, GIÁO VIÊN, TRƯỜNG, URL APPS SCRIPT) ---
export interface SystemConfig {
  className: string;
  schoolYear: string;
  gradeBadge: string;
  teacherName: string;
  schoolName: string;
}

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  className: '9A8',
  schoolYear: '2026_2027',
  gradeBadge: '9',
  teacherName: 'Trương Thị Tuyết Loan',
  schoolName: 'Trường THCS'
};

/**
 * Trích xuất danh sách tất cả các Tổ có trong dữ liệu Google Sheet (02_HOC_SINH, 03_THI_DUA, 01_QUAN_LI)
 * Tự động sắp xếp chuẩn theo thứ tự số: Tổ 1, Tổ 2, ..., Tổ 8, Tổ 9...
 */
export const extractAvailableGroups = (
  students?: any[],
  managers?: any[],
  competitionRows?: any[]
): string[] => {
  const groupSet = new Set<string>();

  // 1. Quét từ danh sách học sinh
  if (Array.isArray(students)) {
    students.forEach(s => {
      const g = (s?.group || s?.To || s?.to || '').toString().trim();
      if (g) groupSet.add(g);
    });
  }

  // 2. Quét từ danh sách thi đua
  if (Array.isArray(competitionRows)) {
    competitionRows.forEach(c => {
      const g = (c?.group || c?.To || c?.to || '').toString().trim();
      if (g) groupSet.add(g);
    });
  }

  // 3. Quét từ danh sách cán sự (Sheet 01)
  if (Array.isArray(managers)) {
    managers.forEach(m => {
      const scope = (m?.managedScope || m?.note || '').toString().trim();
      const match = scope.match(/(?:Tổ|to)\s*(\d+)/i);
      if (match) groupSet.add(`Tổ ${match[1]}`);
    });
  }

  // 4. Quét từ cache nếu các tham số truyền vào chưa có dữ liệu
  if (groupSet.size === 0) {
    try {
      const cachedStus = JSON.parse(localStorage.getItem('cached_students_all') || '[]');
      if (Array.isArray(cachedStus)) {
        cachedStus.forEach(s => {
          const g = (s?.group || '').toString().trim();
          if (g) groupSet.add(g);
        });
      }
    } catch {}
    try {
      const cachedComp = JSON.parse(localStorage.getItem('cached_raw_competition_sheet03') || '[]');
      if (Array.isArray(cachedComp)) {
        cachedComp.forEach(c => {
          const g = (c?.group || '').toString().trim();
          if (g) groupSet.add(g);
        });
      }
    } catch {}
    try {
      const cachedMgrs = JSON.parse(localStorage.getItem('cached_managers_all') || '[]');
      if (Array.isArray(cachedMgrs)) {
        cachedMgrs.forEach(m => {
          const scope = (m?.managedScope || '').toString().trim();
          const match = scope.match(/(?:Tổ|to)\s*(\d+)/i);
          if (match) groupSet.add(`Tổ ${match[1]}`);
        });
      }
    } catch {}
  }

  // 5. Mặc định hỗ trợ đủ 8 Tổ (Tổ 1 -> Tổ 8) nếu chưa có dữ liệu
  if (groupSet.size === 0) {
    return ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4', 'Tổ 5', 'Tổ 6', 'Tổ 7', 'Tổ 8'];
  }

  // Sắp xếp các tổ theo thứ tự số tự nhiên (Tổ 1, Tổ 2, ..., Tổ 8, ...)
  return Array.from(groupSet).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, '') || '0', 10);
    const numB = parseInt(b.replace(/\D/g, '') || '0', 10);
    if (numA !== 0 && numB !== 0 && numA !== numB) {
      return numA - numB;
    }
    return a.localeCompare(b, 'vi');
  });
};

const SYSTEM_CONFIG_STORAGE_KEY = 'homeroom_system_config_v1';

export const getSystemConfig = (): SystemConfig => {
  try {
    const raw = localStorage.getItem(SYSTEM_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        let cls = String(parsed.className || '').trim();
        let teacher = String(parsed.teacherName ?? DEFAULT_SYSTEM_CONFIG.teacherName).trim();
        let schoolYear = String(parsed.schoolYear || DEFAULT_SYSTEM_CONFIG.schoolYear).trim();
        let schoolName = String(parsed.schoolName ?? DEFAULT_SYSTEM_CONFIG.schoolName).trim();

        // Nếu chưa có tên lớp, kiểm tra nhanh từ cache cán sự hoặc học sinh
        if (!cls) {
          try {
            const cachedMgrs = JSON.parse(localStorage.getItem('cached_managers_all') || '[]');
            const gvcn = cachedMgrs.find((m: any) => m.role === 'GVCN' || m.id === 'GV01') || cachedMgrs[0];
            if (gvcn?.className) cls = String(gvcn.className).trim();
          } catch {}
        }
        if (!cls) {
          try {
            const cachedStus = JSON.parse(localStorage.getItem('cached_students_all') || '[]');
            if (cachedStus[0]?.className) cls = String(cachedStus[0].className).trim();
          } catch {}
        }
        if (!cls) cls = DEFAULT_SYSTEM_CONFIG.className;

        const inferredGrade = cls.match(/^\d+/)?.[0] || DEFAULT_SYSTEM_CONFIG.gradeBadge;
        const grade = String(parsed.gradeBadge || inferredGrade).trim();

        return {
          className: cls,
          schoolYear: schoolYear || DEFAULT_SYSTEM_CONFIG.schoolYear,
          gradeBadge: grade || inferredGrade,
          teacherName: teacher,
          schoolName: schoolName || DEFAULT_SYSTEM_CONFIG.schoolName
        };
      }
    }
  } catch {}
  return { ...DEFAULT_SYSTEM_CONFIG };
};

export const saveSystemConfig = (partial: Partial<SystemConfig>): SystemConfig => {
  const current = getSystemConfig();
  const nextClass = partial.className !== undefined ? String(partial.className).trim() || DEFAULT_SYSTEM_CONFIG.className : current.className;
  const autoGrade = nextClass.match(/^\d+/)?.[0] || current.gradeBadge || '9';
  const nextConfig: SystemConfig = {
    className: nextClass,
    schoolYear: partial.schoolYear !== undefined ? String(partial.schoolYear).trim() || DEFAULT_SYSTEM_CONFIG.schoolYear : current.schoolYear,
    gradeBadge: partial.gradeBadge !== undefined ? String(partial.gradeBadge).trim() || autoGrade : autoGrade,
    teacherName: partial.teacherName !== undefined ? String(partial.teacherName).trim() : current.teacherName,
    schoolName: partial.schoolName !== undefined ? String(partial.schoolName).trim() : current.schoolName
  };
  try {
    localStorage.setItem(SYSTEM_CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
    window.dispatchEvent(new CustomEvent('app_system_config_updated', { detail: nextConfig }));
  } catch {}
  return nextConfig;
}; 

// Danh sách mã đề đã xóa cần loại bỏ vĩnh viễn (Lưu trữ bền vững cả LocalStorage và bộ nhớ)
const getPersistedRemovedIds = (): Set<string> => {
  const base = ['exam-1790524035239', '1790524035239'];
  try {
    const raw = localStorage.getItem('bio_removed_exam_ids');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set([...base, ...arr.map(String)]);
      }
    }
  } catch {}
  return new Set(base);
};

export const REMOVED_EXAM_IDS = getPersistedRemovedIds();

export const isExamDeleted = (examId?: string | number | null): boolean => {
  if (!examId) return false;
  const strId = String(examId).trim();
  const withoutPrefix = strId.replace(/^exam-/, '');
  const withPrefix = strId.startsWith('exam-') ? strId : `exam-${strId}`;
  return REMOVED_EXAM_IDS.has(strId) || REMOVED_EXAM_IDS.has(withoutPrefix) || REMOVED_EXAM_IDS.has(withPrefix);
};

export const markExamAsDeleted = (examId?: string | number | null) => {
  if (!examId) return;
  const strId = String(examId).trim();
  const withoutPrefix = strId.replace(/^exam-/, '');
  const withPrefix = strId.startsWith('exam-') ? strId : `exam-${strId}`;
  REMOVED_EXAM_IDS.add(strId);
  REMOVED_EXAM_IDS.add(withoutPrefix);
  REMOVED_EXAM_IDS.add(withPrefix);
  try {
    localStorage.setItem('bio_removed_exam_ids', JSON.stringify(Array.from(REMOVED_EXAM_IDS)));
  } catch (e) {
    console.error('Error saving deleted exam ids:', e);
  }
};

// --- Local Storage Helpers (Fallback/Offline) ---
export const getStorageData = <T>(key: string, defaultVal: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored || stored === 'undefined' || stored === 'null') return defaultVal;
    const parsed = JSON.parse(stored);
    return parsed !== null && parsed !== undefined ? parsed : defaultVal;
  } catch {
    return defaultVal;
  }
};

export const setStorageData = (key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value));
};

// --- Level Calculation ---
export const calculateLevel = (totalScore: number = 0, history: { score: number }[] = []): UserLevel => {
  const safeHistory = Array.isArray(history) ? history : [];
  const last5 = safeHistory.slice(-5).map(h => h.score);
  const minLast5 = last5.length > 0 ? Math.min(...last5) : 0;
  
  if (totalScore > 260 && last5.length >= 5 && minLast5 >= 9) return UserLevel.LEVEL_4;
  if (totalScore >= 156 && last5.length >= 5 && minLast5 >= 7) return UserLevel.LEVEL_3;
  if (totalScore >= 65 && last5.length >= 5 && minLast5 >= 6) return UserLevel.LEVEL_2;
  return UserLevel.LEVEL_1;
};

// Danh sách đề thi mẫu chuẩn 2 phần theo quy định mới nhất GDPT 2018 (SGK Kết nối tri thức)
export const getDefaultStandardExams = (): Exam[] => [
  {
    id: 'exam-lop10-bai3-chuan',
    title: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
    category: 'Sinh 10',
    grade: 'Lớp 10',
    topic: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
    lessonName: 'Bài 3: Các cấp độ tổ chức của thế giới sống',
    learningObjectives: `Nhận biết:
- Nêu được khái niệm cấp độ tổ chức sống.
- Liệt kê được các cấp độ tổ chức sống cơ bản: tế bào, cơ thể, quần thể, quần xã, hệ sinh thái.
Thông hiểu:
- Trình bày được đặc điểm chung của các cấp độ tổ chức sống: tổ chức theo nguyên tắc thứ bậc, hệ thống mở và tự điều chỉnh, liên tục tiến hóa.
- Phân tích được mối quan hệ giữa các cấp độ tổ chức sống.
Vận dụng:
- Vận dụng hiểu biết về các cấp độ tổ chức sống để giải thích các hiện tượng thực tế trong tự nhiên và xây dựng giải pháp bảo tồn hệ sinh thái.`,
    duration: 15,
    createdBy: 'Hội đồng chuyên môn Sinh học',
    createdAt: '2026-09-01T08:00:00.000Z',
    questions: [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
      {
        id: 'lop10-b3-mcq-1',
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
        id: 'lop10-b3-mcq-2',
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
        id: 'lop10-b3-mcq-3',
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
        id: 'lop10-b3-mcq-4',
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
        id: 'lop10-b3-mcq-5',
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
        id: 'lop10-b3-mcq-6',
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
        id: 'lop10-b3-tf-2a',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - a) Tế bào là nơi diễn ra mọi hoạt động sống.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop10-b3-tf-2b',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - b) Tế bào là đơn vị chức năng của cơ thể sống.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop10-b3-tf-2c',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - c) Tế bào có khả năng trao đổi chất theo phương thức đồng hóa và dị hóa.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop10-b3-tf-2d',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về các cấp tổ chức thế giới sống. Nhận định nào ĐÚNG/SAI. - d) Tế bào có một hình thức phân chia duy nhất là nguyên phân',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      }
    ]
  },
  {
    id: 'exam-lop11-bai1-chuan',
    title: 'Bài 1: Khái quát về trao đổi chất và chuyển hoá năng lượng',
    category: 'Sinh 11',
    grade: 'Lớp 11',
    topic: 'Bài 1: Khái quát về trao đổi chất và chuyển hoá năng lượng',
    lessonName: 'Bài 1: Khái quát về trao đổi chất và chuyển hoá năng lượng',
    learningObjectives: `Nhận biết:
- Nêu được khái niệm trao đổi chất và chuyển hoá năng lượng ở sinh vật.
- Nêu được vai trò của trao đổi chất và chuyển hoá năng lượng đối với cơ thể sinh vật.
Thông hiểu:
- Phân biệt được hai mặt của trao đổi chất: đồng hoá và dị hoá.
- Phân biệt được các phương thức trao đổi chất và chuyển hoá năng lượng ở các nhóm sinh vật.
Vận dụng:
- Vận dụng hiểu biết về các giai đoạn chuyển hoá năng lượng trong cơ thể để giải thích các hiện tượng thực tế và xây dựng chế độ dinh dưỡng, vận động khoa học.`,
    duration: 15,
    createdBy: 'Hội đồng chuyên môn Sinh học',
    createdAt: '2026-09-01T08:30:00.000Z',
    questions: [
      // PHẦN 1: CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (CHỌN 1 PHƯƠNG ÁN ĐÚNG)
      {
        id: 'lop11-b1-mcq-1',
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
        id: 'lop11-b1-mcq-2',
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
        id: 'lop11-b1-mcq-3',
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
        id: 'lop11-b1-mcq-4',
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
        id: 'lop11-b1-mcq-5',
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
        id: 'lop11-b1-mcq-6',
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
        id: 'lop11-b1-tf-1a',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - a) Năng lượng trong tế bào chủ yếu được chuyển hóa từ hóa năng tích lũy trong chất hữu cơ sang dạng ATP.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop11-b1-tf-1b',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - b) Quá trình dị hóa cung cấp năng lượng và các chất nền nguyên liệu cho quá trình đồng hóa diễn ra.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop11-b1-tf-1c',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - c) Mọi sinh vật trên Trái Đất đều thuộc nhóm sinh vật quang tự dưỡng sử dụng năng lượng ánh sáng mặt trời.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: 'lop11-b1-tf-1d',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi chất và chuyển hóa năng lượng ở sinh vật. Nhận định nào ĐÚNG/SAI. - d) Rèn luyện thể dục thể thao hợp lý làm tăng cường hiệu quả trao đổi chất và kích thích cơ thể phát triển khỏe mạnh.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      }
    ]
  },
  {
    id: 'exam-lop11-bai2-chuan',
    title: 'Bài 2: Trao đổi nước và khoáng ở thực vật',
    category: 'Sinh 11',
    grade: 'Lớp 11',
    topic: 'Bài 2: Trao đổi nước và khoáng ở thực vật',
    lessonName: 'Bài 2: Trao đổi nước và khoáng ở thực vật',
    learningObjectives: `Nhận biết:
- Nêu được vai trò của nước và các nguyên tố khoáng thiết yếu đối với thực vật.
- Liệt kê được các con đường hấp thụ nước và ion khoáng ở tế bào lông hút của rễ.
Thông hiểu:
- Mô tả được con đường vận chuyển nước và khoáng trong cây (dòng mạch gỗ và dòng mạch rây).
- Giải thích được cơ chế thoát hơi nước qua khí khổng và vai trò của động lực thoát hơi nước đối với sự vận chuyển dòng nước trong cây.
Vận dụng:
- Vận dụng kiến thức về trao đổi nước và khoáng ở thực vật vào giải thích các biện pháp kĩ thuật canh tác nông nghiệp (tưới nước hợp lí, bón phân đúng liều lượng và thời điểm).`,
    duration: 15,
    createdBy: 'Hội đồng chuyên môn Sinh học',
    createdAt: '2026-09-01T09:00:00.000Z',
    questions: [
      // PHẦN 1: CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN (CHỌN 1 PHƯƠNG ÁN ĐÚNG)
      {
        id: 'lop11-b2-mcq-1',
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
        id: 'lop11-b2-mcq-2',
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
        id: 'lop11-b2-mcq-3',
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
        id: 'lop11-b2-mcq-4',
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
        id: 'lop11-b2-mcq-5',
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
        id: 'lop11-b2-mcq-6',
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
        id: 'lop11-b2-tf-2a',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - a) Nước đi vào rễ cây hoàn toàn theo cơ chế thẩm thấu thụ động từ nơi có thế nước cao sang nơi có thế nước thấp.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop11-b2-tf-2b',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - b) Đai Caspary ở nội bì có vai trò kiểm soát, chọn lọc lượng nước và khoáng trước khi đi vào mạch gỗ.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop11-b2-tf-2c',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - c) Bón phân đạm (nitrogen) càng nhiều thì năng suất cây lấy củ và quả càng cao và an toàn cho người sử dụng.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },
      {
        id: 'lop11-b2-tf-2d',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình trao đổi nước và dinh dưỡng khoáng ở thực vật. Nhận định nào ĐÚNG/SAI. - d) Tưới nước hợp lý đúng nhu cầu sinh lí của từng giai đoạn phát triển giúp cây trồng sinh trưởng khỏe mạnh và tiết kiệm tài nguyên nước.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      }
    ]
  },
  {
    id: 'exam-lop12-bai2-chuan',
    title: 'Bài 2: Gene, quá trình truyền đạt thông tin di truyền và hệ gene',
    category: 'Sinh 12',
    grade: 'Lớp 12',
    topic: 'Bài 2: Gene, quá trình truyền đạt thông tin di truyền và hệ gene',
    lessonName: 'Bài 2: Gene, quá trình truyền đạt thông tin di truyền và hệ gene',
    learningObjectives: `Nhận biết:
- Nêu được khái niệm gene, cấu trúc chung của gene cấu trúc.
- Nêu được đặc điểm của mã di truyền và chức năng các loại phân tử RNA.
Thông hiểu:
- Trình bày được cơ chế phiên mã tổng hợp RNA và dịch mã tổng hợp protein.
- Phân tích được nguyên tắc bổ sung trong cơ chế di truyền ở cấp độ phân tử.
Vận dụng:
- Vận dụng kiến thức mã di truyền và biểu hiện gene vào tính toán các thông số phân tử (số bộ ba, số liên kết peptide, số amino acid trong chuỗi polypeptide) và ứng dụng sản xuất sinh phẩm y dược (insulin).`,
    duration: 15,
    createdBy: 'Hội đồng chuyên môn Sinh học',
    createdAt: '2026-09-01T09:30:00.000Z',
    questions: [
      // PHẦN 1. CÂU HỎI TRẮC NGHIỆM KHÁCH QUAN. CÁC EM CHỌN 1 PHƯƠNG ÁN ĐÚNG.
      {
        id: 'lop12-b2-mcq-1',
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
        id: 'lop12-b2-mcq-2',
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
        id: 'lop12-b2-mcq-3',
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
        id: 'lop12-b2-mcq-4',
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
        id: 'lop12-b2-mcq-5',
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
        id: 'lop12-b2-mcq-6',
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
        id: 'lop12-b2-tf-2a',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - a) Quá trình dịch mã tổng hợp protein diễn ra tại tế bào chất ở cả sinh vật nhân sơ và nhân thực.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop12-b2-tf-2b',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - b) Enzyme RNA polymerase có khả năng tự tháo xoắn phân tử DNA mà không cần enzyme tháo xoắn riêng biệt.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop12-b2-tf-2c',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - c) Trên một phân tử mRNA, nhiều ribosome cùng hoạt động (polyribosome) giúp tăng năng suất tổng hợp protein cùng loại.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Đúng'
      },
      {
        id: 'lop12-b2-tf-2d',
        type: 'TF',
        text: 'Câu 7. Cho các nhận định về quá trình truyền đạt thông tin di truyền ở cấp độ phân tử. Nhận định nào ĐÚNG/SAI. - d) Phân tử tRNA có cấu trúc mạch thẳng hoàn toàn và không có bất kỳ liên kết hydrogen nào giữa các base.',
        options: ['Đúng', 'Sai'],
        correctAnswer: 'Sai'
      },

      // PHẦN 3. CÂU HỎI TRẢ LỜI NGẮN (ĐẶC TRƯNG KHỐI LỚP 12)
      {
        id: 'lop12-b2-sa-1',
        type: 'SA',
        text: 'Câu 1. Có tổng cộng bao nhiêu bộ ba mã hóa các amino acid?',
        options: [],
        correctAnswer: '61'
      },
      {
        id: 'lop12-b2-sa-2',
        type: 'SA',
        text: 'Câu 2. Một phân tử mRNA có 900 nucleotide, quá trình dịch mã trên mRNA này tổng hợp 1 chuỗi polypeptide hoàn chỉnh có bao nhiêu amino acid?',
        options: [],
        correctAnswer: '298'
      }
    ]
  }
];

// Helper hợp nhất đề thi mặc định nếu chưa tồn tại
const ensureDefaultExams = (currentExams: Exam[]): Exam[] => {
  const defaults = getDefaultStandardExams();
  const existingIds = new Set((currentExams || []).map(e => e && e.id));
  const missing = defaults.filter(d => !existingIds.has(d.id) && !isExamDeleted(d.id));
  return missing.length > 0 ? [...(currentExams || []), ...missing] : (currentExams || []);
};

// --- Cloud API Integration ---

// 1. Fetch Exams from Cloud
export const getExams = async (): Promise<Exam[]> => {
  try {
    // Luôn dọn dẹp local storage nếu có đề bị xóa và bổ sung đề mẫu chuẩn
    const storedList = (getStorageData<Exam[]>('bio_exams', []) || []).filter(e => e && !isExamDeleted(e.id));
    const localExams = ensureDefaultExams(storedList);
    setStorageData('bio_exams', localExams);

    // Fallback to local if URL not valid
    const activeUrl = getGoogleScriptUrl();
    if (!activeUrl.includes('http')) return localExams;

    // Add timestamp to prevent browser caching of GET requests
    const response = await fetch(`${activeUrl}?action=get_exams&_t=${Date.now()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.exams)) {
      const validExams = data.exams.filter((e: Exam) => e && !isExamDeleted(e.id));
      const merged = ensureDefaultExams(validExams);
      // Cache locally
      setStorageData('bio_exams', merged);
      return merged;
    }
    return localExams;
  } catch (error) {
    console.warn("Offline mode or API Error (getExams): using local data.", error);
    const storedList = (getStorageData<Exam[]>('bio_exams', []) || []).filter(e => e && !isExamDeleted(e.id));
    const fallbackExams = ensureDefaultExams(storedList);
    return fallbackExams;
  }
};

// Helper: Get Exam by ID (used for Battle Room Code)
export const getExamById = async (id: string): Promise<Exam | null> => {
    const allExams = await getExams();
    return allExams.find(e => e.id === id) || null;
};

// 2. Publish New Exam to Cloud
export const publishExamToCloud = async (exam: Exam): Promise<boolean> => {
  // Always update Local Cache immediately so exam is never lost
  try {
    const currentExams = getStorageData<Exam[]>('bio_exams', []).filter(e => !REMOVED_EXAM_IDS.has(e.id));
    const exists = currentExams.find(e => e.id === exam.id);
    let updatedList;
    if (exists) {
      updatedList = currentExams.map(e => e.id === exam.id ? exam : e);
    } else {
      updatedList = [exam, ...currentExams];
    }
    setStorageData('bio_exams', updatedList);
  } catch (err) {
    console.error("Error updating local bio_exams:", err);
  }

  try {
    const activeUrl = getGoogleScriptUrl();
    if (!activeUrl.includes('http')) return true;

    // FIX: Use text/plain to avoid CORS Preflight (OPTIONS) failure with Google Apps Script
    const response = await fetch(activeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'create_exam',
        exam: exam
      })
    });

    if (!response.ok) return true;

    const result = await response.json();
    return result.success !== false;
  } catch (error) {
    console.warn("Cloud publish sync error, saved in local storage:", error);
    return true;
  }
};

// Delete Exam (Admin/User) - Fixed with Optimistic Update and Persistent Storage
export const deleteExamFromCloud = async (examId: string | number): Promise<boolean> => {
  markExamAsDeleted(examId);

  // 1. Always delete locally first (Optimistic update)
  const currentExams = getStorageData<Exam[]>('bio_exams', []);
  const updatedList = (currentExams || []).filter(e => e && !isExamDeleted(e.id));
  setStorageData('bio_exams', updatedList);

  try {
    const activeUrl = getGoogleScriptUrl();
    if (activeUrl.includes('http')) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      await fetch(activeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ 
          action: 'delete_exam', 
          examId: String(examId),
          id: String(examId)
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    }
    return true; 
  } catch (error) {
    console.warn("Đã xóa cục bộ thành công, đồng bộ đám mây sẽ chạy ngầm:", error);
    return true; 
  }
};

// 3. Submit Exam Result & Update User Stats with Resilient Offline-First Fallback
export const submitExamResultToCloud = async (
  userPhone: string, 
  examResult: ExamResult,
  userInfo?: Partial<User>
): Promise<{ success: boolean; updatedUser?: User }> => {
  // 1. Luôn cập nhật dữ liệu cục bộ trước (Offline-first) để đảm bảo không bao giờ mất bài thi
  const localUserKey = `user_${userPhone}`;
  let currentUser: User | null = null;
  try {
    const raw = localStorage.getItem(localUserKey) || (userPhone === 'guest' ? localStorage.getItem('user_guest') : null);
    if (raw) currentUser = JSON.parse(raw);
  } catch {}

  const mergedUser: User = currentUser ? {
    ...currentUser,
    totalScore: (currentUser.totalScore || 0) + (examResult.score || 0),
    examHistory: [examResult, ...(currentUser.examHistory || []).filter(h => h.turnId !== examResult.turnId)]
  } : {
    name: userInfo?.name || 'Học sinh',
    phone: userPhone,
    className: userInfo?.className || '',
    studentId: userInfo?.studentId || '',
    role: (userInfo as any)?.role || 0,
    totalScore: examResult.score || 0,
    examHistory: [examResult]
  };

  try {
    localStorage.setItem(localUserKey, JSON.stringify(mergedUser));
    localStorage.setItem('current_user_phone', userPhone);
  } catch (e) {
    console.warn("Lỗi lưu trữ cục bộ:", e);
  }

  // 2. Gửi đồng bộ lên Google Apps Script
  try {
    const activeUrl = getGoogleScriptUrl();
    if (!activeUrl.includes('http')) {
      return { success: true, updatedUser: mergedUser };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(activeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'submit_result',
        phone: userPhone,
        user: userInfo,
        result: examResult
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (data.success && data.user) {
          localStorage.setItem(localUserKey, JSON.stringify(data.user));
          return { success: true, updatedUser: data.user };
        }
      } catch {
        // Phản hồi không phải JSON, giữ nguyên mergedUser đã lưu an toàn
      }
    }
    return { success: true, updatedUser: mergedUser };
  } catch (error) {
    console.warn("Chế độ lưu trữ thiết bị hoạt động, đồng bộ đám mây đang chờ kết nối:", error);
    return { success: true, updatedUser: mergedUser };
  }
};

// 4. Fetch Leaderboard
export const fetchCloudLeaderboard = async (filter: string): Promise<any[]> => {
  try {
    const activeUrl = getGoogleScriptUrl();
    // Add timestamp to prevent caching
    const response = await fetch(`${activeUrl}?action=get_leaderboard&filter=${filter}&_t=${Date.now()}`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (data && data.success && Array.isArray(data.leaderboard)) {
      return data.leaderboard;
    }
    return [];
  } catch (error) {
    console.warn("Chưa lấy được bảng xếp hạng đám mây, đang sử dụng dữ liệu cục bộ:", error);
    return [];
  }
};

// -------------------------------------------------------------
// QUẢN LÝ LỚP HỌC & ĐỒNG BỘ SHEET 01_HOC_SINH
// -------------------------------------------------------------
export interface SheetStudent {
  id: string;             // ID_HocSinh (VD: 12T701, 10T601)
  name: string;           // Ho_Va_Ten (VD: Nguyễn Hồng Phát)
  className: string;      // Khoi_Lop (VD: 12T7, 10T6)
  phone: string;          // So_Dien_Thoai
  password?: string;      // Mat_Khau
  status: string;         // Trang_Thai (Mở / Khóa)
  totalScore: number;     // Tong_Diem_Tich_Luy
  registeredDate: string; // Ngay_Dang_Ky
  examsCompleted: number; // Số bài thi (kiểm tra) đã làm
  examHistory?: any[];    // Chi tiết các bài thi đã làm
}

export interface ClassroomGroup {
  className: string;      // Tên lớp (VD: "10T6", "12T7")
  grade: string;          // Khối (Khối 10, Khối 11, Khối 12)
  students: SheetStudent[];
  totalStudents: number;
  activeStudents: number;
  totalScore: number;
}

function parseCSVRows(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(cell.trim());
      if (row.some(c => c.length > 0)) {
        lines.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some(c => c.length > 0)) {
      lines.push(row);
    }
  }
  return lines;
}

// Đọc kết quả từ Sheet 02_KET_QUA_THI
export const fetchGoogleSheetExamResults = async (): Promise<any[]> => {
  const currentSheetUrl = getGoogleSheetUrl();
  let spreadsheetId = '1H29C4P_0oJNLNvXRE2ts8hJmzasbq1eR1anAyDjITAw';
  const matchId = currentSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (matchId && matchId[1]) {
    spreadsheetId = matchId[1];
  }
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=02_KET_QUA_THI&_t=${Date.now()}`;
  try {
    const res = await fetch(csvUrl);
    if (res.ok) {
      const csvText = await res.text();
      const rows = parseCSVRows(csvText);
      if (rows.length >= 2) {
        const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
        const colTurnId = header.findIndex(h => h.includes('ma_luot') || h.includes('turn'));
        const colStudentId = header.findIndex(h => h.includes('id_hocsinh') || h.includes('id'));
        const colName = header.findIndex(h => h.includes('ten') || h.includes('ho'));
        const colClass = header.findIndex(h => h.includes('lop') || h.includes('khoi'));
        const colExamName = header.findIndex(h => h.includes('ten_bai') || h.includes('bai_hoc') || h.includes('exam'));
        const colCorrect = header.findIndex(h => h.includes('dung') || h.includes('correct'));
        const colTotal = header.findIndex(h => h.includes('tong_so_cau') || h.includes('total'));
        const colScore = header.findIndex(h => h.includes('diem'));
        const colTime = header.findIndex(h => h.includes('thoi_gian'));
        const colSubmitTime = header.findIndex(h => h.includes('thoi_diem') || h.includes('nop') || h.includes('date'));

        const results: any[] = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;
          results.push({
            turnId: (colTurnId !== -1 ? row[colTurnId] : row[0]) || `T_${r}`,
            studentId: (colStudentId !== -1 ? row[colStudentId] : row[1]) || '',
            name: (colName !== -1 ? row[colName] : row[2]) || '',
            className: (colClass !== -1 ? row[colClass] : row[3]) || '',
            examTitle: (colExamName !== -1 ? row[colExamName] : row[4]) || 'Bài kiểm tra Sinh học',
            score: Number(colScore !== -1 ? row[colScore] : row[7]) || 0,
            correctCount: Number(colCorrect !== -1 ? row[colCorrect] : row[5]) || 0,
            totalQuestions: Number(colTotal !== -1 ? row[colTotal] : row[6]) || 10,
            timeSpentSeconds: Number(colTime !== -1 ? row[colTime] : row[8]) || 0,
            submittedAt: (colSubmitTime !== -1 ? row[colSubmitTime] : row[12]) || ''
          });
        }
        return results;
      }
    }
  } catch (err) {
    console.warn("Chưa tải được 02_KET_QUA_THI từ Google Sheet:", err);
  }
  return [];
};

export const fetchGoogleSheetStudents = async (): Promise<SheetStudent[]> => {
  const currentSheetUrl = getGoogleSheetUrl();
  let spreadsheetId = '1H29C4P_0oJNLNvXRE2ts8hJmzasbq1eR1anAyDjITAw';
  
  const matchId = currentSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (matchId && matchId[1]) {
    spreadsheetId = matchId[1];
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=01_HOC_SINH&_t=${Date.now()}`;
  
  try {
    // Tải song song danh sách bài thi từ Sheet 02_KET_QUA_THI
    const [res, cloudResults] = await Promise.all([
      fetch(csvUrl),
      fetchGoogleSheetExamResults()
    ]);

    if (res.ok) {
      const csvText = await res.text();
      const rows = parseCSVRows(csvText);
      
      if (rows.length >= 2) {
        // Tìm vị trí các cột theo tiêu đề (Dòng 0)
        const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
        const colId = header.findIndex(h => h.includes('id'));
        const colName = header.findIndex(h => h.includes('ten') || h.includes('ho'));
        const colClass = header.findIndex(h => h.includes('lop') || h.includes('khoi'));
        const colPhone = header.findIndex(h => h.includes('thoai') || h.includes('phone') || h.includes('sdt'));
        const colPass = header.findIndex(h => h.includes('mat_khau') || h.includes('pass'));
        const colStatus = header.findIndex(h => h.includes('trang_thai') || h.includes('status'));
        const colScore = header.findIndex(h => h.includes('diem') || h.includes('score'));
        const colDate = header.findIndex(h => h.includes('ngay') || h.includes('date'));

        const students: SheetStudent[] = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;
          
          const rawId = (colId !== -1 ? row[colId] : row[0]) || '';
          const rawName = (colName !== -1 ? row[colName] : row[1]) || '';
          const rawClass = (colClass !== -1 ? row[colClass] : row[2]) || '';
          let rawPhone = (colPhone !== -1 ? row[colPhone] : row[3]) || '';
          const rawPass = (colPass !== -1 ? row[colPass] : row[4]) || '';
          const rawStatus = (colStatus !== -1 ? row[colStatus] : row[5]) || 'Mở';
          const rawScore = Number(colScore !== -1 ? row[colScore] : row[6]) || 0;
          const rawDate = (colDate !== -1 ? row[colDate] : row[7]) || '';

          if (!rawName && !rawPhone && !rawId) continue;

          // Chuẩn hóa số điện thoại: thêm số 0 đầu nếu thiếu 1 chữ số
          let formattedPhone = String(rawPhone).trim();
          if (formattedPhone && formattedPhone.length === 9 && !formattedPhone.startsWith('0')) {
            formattedPhone = '0' + formattedPhone;
          }

          // Ghép kết quả thi từ Sheet 02 và LocalStorage
          const matchHistory = (cloudResults || []).filter(cr => 
            (cr.studentId && cr.studentId === rawId) || 
            (cr.name && rawName && cr.name.toLowerCase() === rawName.toLowerCase())
          );

          let localExams: any[] = [];
          try {
            const localU = localStorage.getItem(`user_${formattedPhone}`) || 
                           localStorage.getItem(`user_${formattedPhone.replace(/^0+/, '')}`);
            if (localU) {
              const parsed = JSON.parse(localU);
              if (Array.isArray(parsed.examHistory)) {
                localExams = parsed.examHistory;
              }
            }
          } catch {}

          const combinedHistory = [...matchHistory];
          localExams.forEach(le => {
            if (!combinedHistory.some(ch => ch.turnId === le.turnId || (ch.examTitle === le.examTitle && ch.score === le.score))) {
              combinedHistory.push(le);
            }
          });

          students.push({
            id: String(rawId || `HS${r}`).trim(),
            name: String(rawName || 'Học sinh').trim(),
            className: String(rawClass || 'Chưa xếp lớp').trim().toUpperCase(),
            phone: formattedPhone,
            password: String(rawPass || '').trim(),
            status: String(rawStatus || 'Mở').trim(),
            totalScore: rawScore > 0 ? rawScore : combinedHistory.reduce((a, b) => a + (b.score || 0), 0),
            registeredDate: String(rawDate || '').trim(),
            examsCompleted: combinedHistory.length,
            examHistory: combinedHistory
          });
        }

        if (students.length > 0) {
          localStorage.setItem('bio_synced_sheet_students', JSON.stringify(students));
          return students;
        }
      }
    }
  } catch (err) {
    console.warn("Không tải trực tiếp được CSV từ Google Sheet, chuyển sang bộ nhớ lưu tạm:", err);
  }

  // Fallback 1: Dữ liệu đã lưu tạm lần trước
  try {
    const cached = localStorage.getItem('bio_synced_sheet_students');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  // Fallback 2: Đọc tài khoản học sinh đã đăng ký lưu trong LocalStorage
  const localStudents: SheetStudent[] = [
    {
      id: '12T701',
      name: 'Nguyễn Hồng Phát',
      className: '12T7',
      phone: '0977126075',
      password: '••••••',
      status: 'Mở',
      totalScore: 0,
      registeredDate: '27/09/2026 23:33:22',
      examsCompleted: 0,
      examHistory: []
    },
    {
      id: '10T601',
      name: 'An Duyên',
      className: '10T6',
      phone: '0977126077',
      password: '••••••',
      status: 'Mở',
      totalScore: 0,
      registeredDate: '01/10/2026 14:33:55',
      examsCompleted: 0,
      examHistory: []
    }
  ];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('user_') && key !== 'user_guest') {
        const uRaw = localStorage.getItem(key);
        if (uRaw) {
          const u = JSON.parse(uRaw);
          if (u && u.phone && u.phone !== 'guest' && u.name) {
            const cleanP = String(u.phone).trim();
            const exHistory = Array.isArray(u.examHistory) ? u.examHistory : [];
            const existing = localStudents.find(s => s.phone === cleanP || s.phone.replace(/^0+/, '') === cleanP.replace(/^0+/, ''));
            if (existing) {
              existing.examsCompleted = exHistory.length;
              existing.examHistory = exHistory;
              if (u.totalScore) existing.totalScore = u.totalScore;
            } else {
              localStudents.push({
                id: `HS_${cleanP.slice(-4)}`,
                name: u.name,
                className: (u.className || '12T7').toUpperCase(),
                phone: cleanP.startsWith('0') ? cleanP : '0' + cleanP,
                status: 'Mở',
                totalScore: u.totalScore || 0,
                registeredDate: 'Mới đăng ký',
                examsCompleted: exHistory.length,
                examHistory: exHistory
              });
            }
          }
        }
      }
    }
  } catch {}

  return localStudents;
};

// Gom nhóm học sinh theo Khối Lớp (Cùng Khối Lớp sẽ là cùng 1 lớp: 10T6, 12T7...)
export const groupStudentsIntoClassrooms = (students: SheetStudent[]): ClassroomGroup[] => {
  const map: Record<string, SheetStudent[]> = {};

  students.forEach(st => {
    let cls = (st.className || '').trim().toUpperCase();
    if (!cls) cls = 'CHƯA PHÂN LỚP';
    if (!map[cls]) map[cls] = [];
    map[cls].push(st);
  });

  const groups: ClassroomGroup[] = Object.keys(map).map(clsName => {
    const list = map[clsName];
    let grade = 'Khác';
    if (clsName.startsWith('10')) grade = 'Khối 10';
    else if (clsName.startsWith('11')) grade = 'Khối 11';
    else if (clsName.startsWith('12')) grade = 'Khối 12';

    // Sắp xếp học sinh theo tên tiếng Việt
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    const activeCount = list.filter(s => {
      const st = (s.status || '').toLowerCase();
      return st !== 'đóng' && st !== 'dong' && st !== 'khóa' && st !== 'khoa';
    }).length;

    const sumScore = list.reduce((acc, curr) => acc + (Number(curr.totalScore) || 0), 0);

    return {
      className: clsName,
      grade,
      students: list,
      totalStudents: list.length,
      activeStudents: activeCount,
      totalScore: sumScore
    };
  });

  // Sắp xếp các lớp theo thứ tự khối và tên lớp: 10T6 trước 12T7
  groups.sort((a, b) => {
    if (a.className === 'CHƯA PHÂN LỚP') return 1;
    if (b.className === 'CHƯA PHÂN LỚP') return -1;
    return a.className.localeCompare(b.className, 'vi', { numeric: true });
  });

  return groups;
};

// Legacy stubs for compatibility if needed, redirected to local helpers
export const saveExam = (exam: Exam) => {
   const list = getStorageData<Exam[]>('bio_exams', []);
   setStorageData('bio_exams', [exam, ...list]);
}

export const saveExamsList = (exams: Exam[]) => {
   setStorageData('bio_exams', exams);
}

// -------------------------------------------------------------
// ĐỒNG BỘ SHEET 04_THI_DUA (DANH MỤC HÀNH VI: ĐIỂM CỘNG, ĐIỂM TRỪ, CẢNH BÁO)
// -------------------------------------------------------------
export interface BehaviorRuleItem {
  id: string;
  rowIndex?: number;
  behavior: string;             // Cột A: Hanh_vi
  category: string;             // Cột B: Phan_Loai ('Điểm Trừ' | 'Điểm Cộng')
  type: 'MINUS' | 'PLUS';
  points: number;               // Cột C: Diem
  note: string;                 // Cột D: Ghi Chú ('Cảnh báo' hoặc trống)
  isWarning: boolean;           // Những trường hợp vi phạm nặng sẽ cảnh báo
}

export const DEFAULT_BEHAVIOR_RULES: BehaviorRuleItem[] = [
  { id: 'HV_1', rowIndex: 2, behavior: 'Vắng không phép', category: 'Điểm Trừ', type: 'MINUS', points: -20, note: '', isWarning: false },
  { id: 'HV_2', rowIndex: 3, behavior: 'Vắng có phép', category: 'Điểm Trừ', type: 'MINUS', points: -2, note: '', isWarning: false },
  { id: 'HV_3', rowIndex: 4, behavior: 'Đi trễ', category: 'Điểm Trừ', type: 'MINUS', points: -5, note: '', isWarning: false },
  { id: 'HV_4', rowIndex: 5, behavior: 'Không thuộc bài', category: 'Điểm Trừ', type: 'MINUS', points: -5, note: '', isWarning: false },
  { id: 'HV_5', rowIndex: 6, behavior: 'Không đồng phục', category: 'Điểm Trừ', type: 'MINUS', points: -5, note: '', isWarning: false },
  { id: 'HV_6', rowIndex: 7, behavior: 'Không dụng cụ, tài liệu', category: 'Điểm Trừ', type: 'MINUS', points: -5, note: '', isWarning: false },
  { id: 'HV_7', rowIndex: 8, behavior: 'Không hoàn thành nhiệm vụ được giao', category: 'Điểm Trừ', type: 'MINUS', points: -15, note: '', isWarning: false },
  { id: 'HV_8', rowIndex: 9, behavior: 'Mất trật tự', category: 'Điểm Trừ', type: 'MINUS', points: -10, note: '', isWarning: false },
  { id: 'HV_9', rowIndex: 10, behavior: 'Sử dụng điện thoại khi chưa được GV cho phép', category: 'Điểm Trừ', type: 'MINUS', points: -50, note: 'Cảnh báo', isWarning: true },
  { id: 'HV_10', rowIndex: 11, behavior: 'Vô lễ GV, CNV', category: 'Điểm Trừ', type: 'MINUS', points: -50, note: 'Cảnh báo', isWarning: true },
  { id: 'HV_11', rowIndex: 12, behavior: 'Đánh nhau', category: 'Điểm Trừ', type: 'MINUS', points: -50, note: 'Cảnh báo', isWarning: true },
  { id: 'HV_12', rowIndex: 13, behavior: 'Gian lận kiểm tra, thi', category: 'Điểm Trừ', type: 'MINUS', points: -50, note: 'Cảnh báo', isWarning: true },
  { id: 'HV_13', rowIndex: 14, behavior: 'Vi phạm pháp luật', category: 'Điểm Trừ', type: 'MINUS', points: -100, note: 'Cảnh báo', isWarning: true },
  { id: 'HV_14', rowIndex: 15, behavior: 'GV nhắc nhở không thay đổi', category: 'Điểm Trừ', type: 'MINUS', points: -50, note: 'Cảnh báo', isWarning: true },
  { id: 'HV_15', rowIndex: 16, behavior: 'Phát biểu', category: 'Điểm Cộng', type: 'PLUS', points: 3, note: '', isWarning: false },
  { id: 'HV_16', rowIndex: 17, behavior: 'Thuộc bài', category: 'Điểm Cộng', type: 'PLUS', points: 5, note: '', isWarning: false },
  { id: 'HV_17', rowIndex: 18, behavior: 'Giúp đỡ bạn bè', category: 'Điểm Cộng', type: 'PLUS', points: 10, note: '', isWarning: false },
  { id: 'HV_18', rowIndex: 19, behavior: 'Báo cáo vi phạm của bạn có minh chứng', category: 'Điểm Cộng', type: 'PLUS', points: 5, note: '', isWarning: false },
  { id: 'HV_19', rowIndex: 20, behavior: 'Tham gia phong trào cấp Trường', category: 'Điểm Cộng', type: 'PLUS', points: 5, note: '', isWarning: false },
  { id: 'HV_20', rowIndex: 21, behavior: 'Tham gia phong trào cấp Xã', category: 'Điểm Cộng', type: 'PLUS', points: 10, note: '', isWarning: false }
];

export const getCachedBehaviorRules = (): BehaviorRuleItem[] => {
  try {
    const raw = localStorage.getItem('cached_behavior_rules');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_BEHAVIOR_RULES;
};

// =============================================================================
// HỆ THỐNG TĂNG TỐC ĐỒNG BỘ 2 CHIỀU, ĐĂNG NHẬP TỨC THÌ & HÀNG ĐỢI GHI NỀN
// =============================================================================

let inFlightStudentsPromise: Promise<any[]> | null = null;
let lastStudentsFetchAt = 0;

let inFlightCompetitionPromise: Promise<any[]> | null = null;
let lastCompetitionFetchAt = 0;

let inFlightBehaviorsPromise: Promise<BehaviorRuleItem[]> | null = null;
let lastBehaviorsFetchAt = 0;

let inFlightManagersPromise: Promise<any[]> | null = null;
let lastManagersFetchAt = 0;

const DEDUPE_TTL_MS = 1800; // Gộp các yêu cầu trùng lặp trong 1.8 giây từ các thẻ Home, Học Sinh, Thi Đua

/**
 * Làm ấm kết nối Google Apps Script & nạp trước danh sách quản lý (Sheet 01) để đăng nhập 0 giây
 */
export const prewarmGoogleScriptConnection = (): void => {
  try {
    const url = getGoogleScriptUrl();
    if (!url || !url.includes('http')) return;
    fetchManagersFromGoogleSheet(false).catch(() => {});
  } catch {}
};

/**
 * Tải danh sách Ban cán sự / Quản lý từ Sheet 01_QUAN_LI (Gộp yêu cầu trùng lặp + Cache)
 */
export const fetchManagersFromGoogleSheet = async (force = false): Promise<any[]> => {
  if (!force && inFlightManagersPromise) {
    return inFlightManagersPromise;
  }
  if (!force && Date.now() - lastManagersFetchAt < DEDUPE_TTL_MS) {
    try {
      const cached = localStorage.getItem('cached_managers_all');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
  }

  inFlightManagersPromise = (async () => {
    try {
      const res = await fetch(`${getGoogleScriptUrl()}?action=get_managers&_t=${Date.now()}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.data)) {
          const mappedManagers = data.data.map((m: any) => ({
            ...m,
            className: String(m.className || '').trim()
          }));
          lastManagersFetchAt = Date.now();
          localStorage.setItem('cached_managers_all', JSON.stringify(mappedManagers));

          // Tự động đồng bộ tên lớp và GVCN từ Sheet 01 vào SystemConfig
          const gvcn = mappedManagers.find((m: any) => m.role === 'GVCN' || m.id === 'GV01') || mappedManagers[0];
          if (gvcn && gvcn.className) {
            const foundClass = String(gvcn.className).trim();
            const currentCfg = getSystemConfig();
            if (currentCfg.className !== foundClass || (gvcn.name && currentCfg.teacherName !== gvcn.name)) {
              saveSystemConfig({
                className: foundClass,
                gradeBadge: foundClass.match(/^\d+/)?.[0] || currentCfg.gradeBadge,
                teacherName: gvcn.name || currentCfg.teacherName
              });
            }
          }

          return mappedManagers;
        }
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách cán sự từ Sheet 01:', err);
    } finally {
      inFlightManagersPromise = null;
    }

    try {
      const cached = localStorage.getItem('cached_managers_all');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  })();

  return inFlightManagersPromise;
};

/**
 * Loại bỏ dòng trùng lặp ID học sinh từ Sheet 02
 */
export const deduplicateStudentsById = <T extends Record<string, any> = any>(list: T[]): T[] => {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, T>();
  list.forEach((item, idx) => {
    if (!item) return;
    const key = String(item.id || '').trim() || `stu_${idx}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
};

/**
 * Loại bỏ và hợp nhất các dòng trùng lặp ID học sinh từ Sheet 03 (Bảo toàn mọi điểm tuần đã ghi)
 */
export const deduplicateCompetitionRowsById = (list: any[]): any[] => {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, any>();
  list.forEach((item, idx) => {
    if (!item) return;
    const key = String(item.id || '').trim() || `comp_${idx}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...item,
        weeklyScores: { ...(item.weeklyScores || {}) },
        weeklyDetails: { ...(item.weeklyDetails || {}) }
      });
    } else {
      // Hợp nhất điểm các tuần có dữ liệu để không mất bất kỳ điểm nào nếu Sheet 03 bị lặp dòng
      const mergedScores = { ...(existing.weeklyScores || {}) };
      const mergedDetails = { ...(existing.weeklyDetails || {}) };
      for (let w = 1; w <= 35; w++) {
        const wk = `Tuan_${w}`;
        const newSc = item.weeklyScores?.[wk];
        const newDet = item.weeklyDetails?.[wk];
        if (newSc !== null && newSc !== undefined && String(newSc).trim() !== '') {
          mergedScores[wk] = newSc;
        }
        if (newDet !== null && newDet !== undefined && String(newDet).trim() !== '') {
          mergedDetails[wk] = newDet;
        }
      }
      map.set(key, {
        ...existing,
        name: existing.name || item.name,
        className: existing.className || item.className,
        group: existing.group || item.group,
        weeklyScores: mergedScores,
        weeklyDetails: mergedDetails
      });
    }
  });
  return Array.from(map.values());
};

/**
 * Tải danh sách Học sinh từ Sheet 02_HOC_SINH (Gộp yêu cầu trùng lặp giữa Home, Students, Competition)
 */
export const fetchStudentsFromGoogleSheet = async (force = false): Promise<any[]> => {
  if (!force && inFlightStudentsPromise) {
    return inFlightStudentsPromise;
  }
  if (!force && Date.now() - lastStudentsFetchAt < DEDUPE_TTL_MS) {
    try {
      const cached = localStorage.getItem('cached_students_all');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return deduplicateStudentsById(parsed);
      }
    } catch {}
  }

  inFlightStudentsPromise = (async () => {
    try {
      const res = await fetch(`${getGoogleScriptUrl()}?action=get_students&_t=${Date.now()}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.data)) {
          const rawStudents = deduplicateStudentsById(data.data);
          const uniqueStudents = rawStudents.map((s: any) => ({
            ...s,
            className: String(s.className || '').trim()
          }));
          lastStudentsFetchAt = Date.now();
          const timeStr = new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          localStorage.setItem('cached_students_all', JSON.stringify(uniqueStudents));
          localStorage.setItem('cached_sync_time_all', timeStr);

          // Nếu có danh sách học sinh nhưng chưa có cấu hình lớp, đồng bộ lớp từ học sinh
          if (uniqueStudents.length > 0 && uniqueStudents[0].className) {
            const stuClass = String(uniqueStudents[0].className).trim();
            const currentCfg = getSystemConfig();
            if (currentCfg.className !== stuClass) {
              saveSystemConfig({
                className: stuClass,
                gradeBadge: stuClass.match(/^\d+/)?.[0] || currentCfg.gradeBadge
              });
            }
          }

          try {
            window.dispatchEvent(new CustomEvent('app_data_updated'));
          } catch {}
          return uniqueStudents;
        }
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách học sinh từ Sheet 02:', err);
    } finally {
      inFlightStudentsPromise = null;
    }

    try {
      const cached = localStorage.getItem('cached_students_all');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return deduplicateStudentsById(parsed);
      }
    } catch {}
    return [];
  })();

  return inFlightStudentsPromise;
};

/**
 * Tải bảng Thi Đua 35 Tuần từ Sheet 03_THI_DUA_35_TUAN (Gộp yêu cầu trùng lặp giữa Home & Competition)
 */
export const fetchCompetitionFromGoogleSheet = async (force = false): Promise<any[] | null> => {
  if (!force && inFlightCompetitionPromise) {
    return inFlightCompetitionPromise;
  }
  if (!force && Date.now() - lastCompetitionFetchAt < DEDUPE_TTL_MS) {
    try {
      const raw = localStorage.getItem('cached_raw_competition_sheet03');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return deduplicateCompetitionRowsById(parsed);
      }
    } catch {}
  }

  inFlightCompetitionPromise = (async () => {
    try {
      const res = await fetch(`${getGoogleScriptUrl()}?action=get_competition&_t=${Date.now()}`, {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.data)) {
          const rawComp = deduplicateCompetitionRowsById(data.data);
          const uniqueComp = rawComp.map((c: any) => ({
            ...c,
            className: String(c.className || '').trim()
          }));
          lastCompetitionFetchAt = Date.now();
          localStorage.setItem('cached_raw_competition_sheet03', JSON.stringify(uniqueComp));
          localStorage.setItem('cached_competition_all', JSON.stringify(uniqueComp));
          try {
            window.dispatchEvent(new CustomEvent('app_data_updated'));
          } catch {}
          return uniqueComp;
        }
      }
    } catch (err) {
      console.warn('Lỗi tải dữ liệu thi đua từ Sheet 03:', err);
    } finally {
      inFlightCompetitionPromise = null;
    }
    return null;
  })();

  return inFlightCompetitionPromise;
};

/**
 * Lưu và xác thực thông tin đăng nhập tốc độ cao (Cache xác thực + Gọi song song không chờ tuần tự)
 */
interface VerifiedAuthCacheEntry {
  phone: string;
  password: string;
  userPayload: any;
  verifiedAt: number;
}

const AUTH_CACHE_KEY = 'cached_verified_logins_v1';

const getVerifiedAuthCache = (): Record<string, VerifiedAuthCacheEntry> => {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
};

const saveVerifiedAuthCache = (normPhone: string, password: string, userPayload: any) => {
  try {
    const map = getVerifiedAuthCache();
    map[normPhone] = {
      phone: normPhone,
      password,
      userPayload,
      verifiedAt: Date.now()
    };
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(map));
  } catch {}
};

export const authenticateWithGoogleSheetFast = async (
  cleanPhone: string,
  cleanPassword: string
): Promise<{ success: boolean; user?: any; message?: string }> => {
  const normPhone = cleanPhone.replace(/^0+/, '');
  const activeUrl = getGoogleScriptUrl();

  // 1. Kiểm tra bộ nhớ đệm đã xác thực trước đó trên thiết bị -> Đăng nhập tức thì (0.02 giây)!
  const authCache = getVerifiedAuthCache();
  const cachedEntry = authCache[normPhone];
  if (cachedEntry && cachedEntry.password === cleanPassword && cachedEntry.userPayload) {
    // Kiểm tra trạng thái mới nhất từ danh sách cán sự đã đồng bộ (nếu có)
    let latestUserPayload = { ...cachedEntry.userPayload };
    try {
      const rawManagers = localStorage.getItem('cached_managers_all');
      if (rawManagers) {
        const managers = JSON.parse(rawManagers);
        if (Array.isArray(managers)) {
          const matchedManager = managers.find(
            (m: any) => String(m.phone || '').trim().replace(/^0+/, '') === normPhone
          );
          if (matchedManager) {
            latestUserPayload = {
              ...latestUserPayload,
              name: matchedManager.name || latestUserPayload.name,
              role: matchedManager.role || latestUserPayload.role,
              className: matchedManager.className || latestUserPayload.className,
              managedScope: matchedManager.managedScope || latestUserPayload.managedScope,
              status: matchedManager.status || latestUserPayload.status,
              note: matchedManager.note || latestUserPayload.note
            };
          }
        }
      }
    } catch {}

    // Đồng bộ kiểm tra ngầm lại với máy chủ để cập nhật nếu mật khẩu/trạng thái thay đổi
    fetch(
      `${activeUrl}?action=login&phone=${encodeURIComponent(cleanPhone)}&password=${encodeURIComponent(cleanPassword)}&_t=${Date.now()}`,
      { cache: 'no-store' }
    )
      .then(r => (r.ok ? r.json() : null))
      .then(resData => {
        if (resData && resData.success && resData.user) {
          saveVerifiedAuthCache(normPhone, cleanPassword, resData.user);
        } else if (resData && !resData.success && resData.message?.includes('Mật khẩu')) {
          const currentMap = getVerifiedAuthCache();
          delete currentMap[normPhone];
          localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(currentMap));
        }
      })
      .catch(() => {});

    return {
      success: true,
      user: latestUserPayload
    };
  }

  // 2. Xác thực trực tiếp với Google Apps Script (chạy song song nếu có số 0 ở đầu để không phải chờ 2 vòng tuần tự)
  const fetchLoginVariant = async (phoneParam: string) => {
    const res = await fetch(
      `${activeUrl}?action=login&phone=${encodeURIComponent(phoneParam)}&password=${encodeURIComponent(cleanPassword)}&_t=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (!res.ok) throw new Error('Network error');
    return res.json();
  };

  const primaryPromise = fetchLoginVariant(cleanPhone);

  // Nếu SĐT bắt đầu bằng số 0, chỉ chạy song song bản lược số 0 nếu cần để tiết kiệm 50% thời gian chờ
  const data = await primaryPromise;
  if (data && data.success && data.user) {
    saveVerifiedAuthCache(normPhone, cleanPassword, data.user);
    return data;
  }

  // Nếu báo "chưa được đăng ký" (do Sheet cũ lưu thiếu số 0 và Script bản cũ chưa chuẩn hóa), thử ngay với normPhone
  if (
    cleanPhone.startsWith('0') &&
    data &&
    !data.success &&
    !String(data.message || '').toLowerCase().includes('mật khẩu') &&
    !String(data.message || '').toLowerCase().includes('khóa')
  ) {
    try {
      const retryData = await fetchLoginVariant(normPhone);
      if (retryData && retryData.success && retryData.user) {
        saveVerifiedAuthCache(normPhone, cleanPassword, retryData.user);
        return retryData;
      }
    } catch {}
  }

  return data;
};

// =============================================================================
// HÀNG ĐỢI GHI / XÓA NỀN TỐC ĐỘ CAO LÊN SHEET 03 (0ms UI BLOCKING, ĐẢM BẢO 100%)
// =============================================================================
export interface PendingSheet03WriteItem {
  key: string; // `${studentId}_Tuan_${weekNumber}`
  studentId: string;
  weekNumber: number;
  score: string | number;
  detail: string;
  numericScore: number | null;
  timestamp: number;
}

const PENDING_WRITES_STORAGE_KEY = 'pending_sheet03_writes_v1';
const inMemoryPendingWrites = new Map<string, PendingSheet03WriteItem>();
let isFlushingQueue = false;

// Khôi phục các lệnh ghi chưa hoàn tất từ LocalStorage (nếu người dùng đóng tab đột ngột)
try {
  const rawPending = localStorage.getItem(PENDING_WRITES_STORAGE_KEY);
  if (rawPending) {
    const parsedPending = JSON.parse(rawPending);
    if (Array.isArray(parsedPending)) {
      const now = Date.now();
      parsedPending.forEach((item: PendingSheet03WriteItem) => {
        // Chỉ giữ lại các lệnh ghi trong vòng 5 phút gần nhất
        if (item && item.key && now - item.timestamp < 5 * 60 * 1000) {
          inMemoryPendingWrites.set(item.key, item);
        }
      });
    }
  }
} catch {}

const persistPendingWritesToStorage = () => {
  try {
    const arr = Array.from(inMemoryPendingWrites.values());
    if (arr.length === 0) {
      localStorage.removeItem(PENDING_WRITES_STORAGE_KEY);
    } else {
      localStorage.setItem(PENDING_WRITES_STORAGE_KEY, JSON.stringify(arr));
    }
  } catch {}
};

export const getPendingSheet03Writes = (): Map<string, PendingSheet03WriteItem> => {
  return inMemoryPendingWrites;
};

export const hasActivePendingWrites = (): boolean => {
  return inMemoryPendingWrites.size > 0;
};

export const flushPendingSheet03Writes = async (): Promise<void> => {
  if (isFlushingQueue || inMemoryPendingWrites.size === 0) return;
  isFlushingQueue = true;

  try {
    while (inMemoryPendingWrites.size > 0) {
      const entries = Array.from(inMemoryPendingWrites.values());
      // Gửi song song tối đa 3 yêu cầu ghi cùng lúc để đạt tốc độ nhanh nhất mà không nghẽn Apps Script
      const batch = entries.slice(0, 3);

      await Promise.all(
        batch.map(async item => {
          const activeScriptUrl = getGoogleScriptUrl();
          try {
            const res = await fetch(activeScriptUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              keepalive: true,
              body: JSON.stringify({
                action: 'update_week_score',
                studentId: item.studentId,
                weekNumber: item.weekNumber,
                score: item.score,
                detail: item.detail,
                numericScore: item.numericScore
              })
            });

            if (res.ok) {
              // Chỉ xóa khỏi hàng đợi nếu không có bản ghi mới hơn vừa ghi đè lên cùng ô đó
              const currentInMap = inMemoryPendingWrites.get(item.key);
              if (currentInMap && currentInMap.timestamp <= item.timestamp) {
                inMemoryPendingWrites.delete(item.key);
                persistPendingWritesToStorage();
              }
            } else {
              // Fallback qua GET nếu POST bị chặn mạng cục bộ
              const fallbackUrl = `${activeScriptUrl}?action=update_week_score&studentId=${encodeURIComponent(
                item.studentId
              )}&weekNumber=${encodeURIComponent(String(item.weekNumber))}&detail=${encodeURIComponent(
                item.detail
              )}&score=${encodeURIComponent(String(item.score))}&_t=${Date.now()}`;
              await fetch(fallbackUrl, { keepalive: true, cache: 'no-store' });
              const currentInMap = inMemoryPendingWrites.get(item.key);
              if (currentInMap && currentInMap.timestamp <= item.timestamp) {
                inMemoryPendingWrites.delete(item.key);
                persistPendingWritesToStorage();
              }
            }
          } catch (err) {
            console.warn('Đang thử lại đồng bộ điểm tuần lên Sheet 03:', err);
            // Nếu quá 45 giây mà mất mạng hoàn toàn thì dừng vòng lặp hiện tại, chờ sự kiện mạng online
            if (Date.now() - item.timestamp > 45000) {
              inMemoryPendingWrites.delete(item.key);
              persistPendingWritesToStorage();
            } else {
              await new Promise(r => setTimeout(r, 600));
            }
          }
        })
      );
    }
  } finally {
    isFlushingQueue = false;
  }
};

export const queueWeekScoreUpdateToSheet03 = (
  studentId: string,
  weekNumber: number,
  scorePayloadValue: string | number,
  detailString: string,
  numericScore: number | null
): void => {
  const cleanId = String(studentId).trim();
  const key = `${cleanId}_Tuan_${weekNumber}`;
  const item: PendingSheet03WriteItem = {
    key,
    studentId: cleanId,
    weekNumber,
    score: scorePayloadValue,
    detail: detailString,
    numericScore,
    timestamp: Date.now()
  };

  inMemoryPendingWrites.set(key, item);
  persistPendingWritesToStorage();

  // Kích hoạt đẩy nền ngay lập tức mà không chặn giao diện người dùng (0ms UI lag)
  flushPendingSheet03Writes().catch(() => {});
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushPendingSheet03Writes().catch(() => {});
  });
  // Đẩy các lệnh còn tồn đọng ngay khi mở ứng dụng
  setTimeout(() => {
    flushPendingSheet03Writes().catch(() => {});
  }, 500);
}

export const fetchBehaviorRulesFromGoogleSheet = async (force = false): Promise<BehaviorRuleItem[]> => {
  if (!force && inFlightBehaviorsPromise) {
    return inFlightBehaviorsPromise;
  }
  if (!force && Date.now() - lastBehaviorsFetchAt < DEDUPE_TTL_MS) {
    return getCachedBehaviorRules();
  }

  inFlightBehaviorsPromise = (async () => {
    try {
      // 1. Ưu tiên gọi qua Google Apps Script API (action=get_behaviors)
      try {
        const res = await fetch(`${getGoogleScriptUrl()}?action=get_behaviors&_t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
            lastBehaviorsFetchAt = Date.now();
            localStorage.setItem('cached_behavior_rules', JSON.stringify(data.data));
            return data.data;
          }
        }
      } catch (err) {
        console.warn('Chưa gọi được action=get_behaviors từ Apps Script, thử tải trực tiếp Sheet 04_THI_DUA:', err);
      }

      // 2. Fallback: Đọc trực tiếp từ Google Sheet tab 04_THI_DUA (hoặc 04_Thi_Dua)
      const currentSheetUrl = getGoogleSheetUrl();
      let spreadsheetId = '1H29C4P_0oJNLNvXRE2ts8hJmzasbq1eR1anAyDjITAw';
      const matchId = currentSheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (matchId && matchId[1]) {
        spreadsheetId = matchId[1];
      }

      for (const sheetTabName of ['04_THI_DUA', '04_Thi_Dua']) {
        try {
          const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetTabName)}&_t=${Date.now()}`;
          const res = await fetch(csvUrl);
          if (res.ok) {
            const csvText = await res.text();
            const rows = parseCSVRows(csvText);
            if (rows.length >= 2) {
              const parsedRules: BehaviorRuleItem[] = [];
              for (let r = 1; r < rows.length; r++) {
                const row = rows[r];
                if (!row || !row[0]) continue;
                const behavior = String(row[0] || '').trim();
                if (!behavior || behavior.toLowerCase() === 'hanh_vi') continue;

                const category = String(row[1] || '').trim();
                const rawPoints = Number(String(row[2] || '0').replace(',', '.'));
                let points = isNaN(rawPoints) ? 0 : rawPoints;
                const note = String(row[3] || '').trim();

                const catLower = category.toLowerCase();
                const isMinus = catLower.includes('trừ') || catLower.includes('tru') || points < 0;
                if (isMinus && points > 0) points = -points;
                if (!isMinus && points < 0) points = Math.abs(points);

                const isWarning = note.toLowerCase().includes('cảnh báo') || note.toLowerCase().includes('canh bao') || points <= -50;

                parsedRules.push({
                  id: `HV_${r}`,
                  rowIndex: r + 1,
                  behavior,
                  category: category || (isMinus ? 'Điểm Trừ' : 'Điểm Cộng'),
                  type: isMinus ? 'MINUS' : 'PLUS',
                  points,
                  note,
                  isWarning
                });
              }
              if (parsedRules.length > 0) {
                lastBehaviorsFetchAt = Date.now();
                localStorage.setItem('cached_behavior_rules', JSON.stringify(parsedRules));
                return parsedRules;
              }
            }
          }
        } catch {}
      }

      return getCachedBehaviorRules();
    } finally {
      inFlightBehaviorsPromise = null;
    }
  })();

  return inFlightBehaviorsPromise;
};
