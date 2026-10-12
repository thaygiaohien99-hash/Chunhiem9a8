import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, UserRole } from '../types';
import {
  getGoogleScriptUrl,
  setGoogleScriptUrl,
  BehaviorRuleItem,
  getCachedBehaviorRules,
  fetchBehaviorRulesFromGoogleSheet,
  fetchStudentsFromGoogleSheet,
  fetchCompetitionFromGoogleSheet,
  queueWeekScoreUpdateToSheet03,
  getPendingSheet03Writes,
  hasActivePendingWrites,
  deduplicateStudentsById,
  deduplicateCompetitionRowsById,
  getSystemConfig,
  extractAvailableGroups
} from '../services/dataService';
import appsScriptRawCode from '../google-apps-script/Code.gs?raw';
import { StudentItem } from './StudentsView';

export const DEFAULT_WEEK_BASE_SCORE = 100;

export interface ParsedBehaviorChip {
  rawItem: string;
  label: string;
  points: number;
  isWarning: boolean;
}

export interface ParsedWeekDetail {
  hasRecord: boolean;
  behaviorsText: string;
  behaviorItems: ParsedBehaviorChip[];
  plusPoints: number;
  minusPoints: number;
  totalPoints: number | null;
  rawText: string;
}

export interface CompetitionStudentRow {
  id: string;
  name: string;
  className: string;
  group: string;
  note?: string;
  weeklyScores: Record<string, number | null>;
  weeklyDetails?: Record<string, string>;
  totalScore: number;
}

/**
 * Tách danh sách chuỗi hành vi ("Phát biểu (+3đ), Đi trễ (-5đ)") thành từng thẻ hành vi riêng lẻ
 */
export const splitBehaviorsIntoChips = (behaviorsText: string): ParsedBehaviorChip[] => {
  if (!behaviorsText || !behaviorsText.trim()) return [];
  const parts = behaviorsText
    .split(/,(?![^(]*\))/)
    .map(p => p.trim())
    .filter(Boolean);

  return parts.map(rawItem => {
    const ptMatch = rawItem.match(/([+-]?\d+(?:[.,]\d+)?)\s*đ(?=\)|\s|$)/i) ||
                    rawItem.match(/\((?:x\d+\s*:\s*)?([+-]?\d+(?:[.,]\d+)?)\s*đ?\)/i) ||
                    rawItem.match(/([+-]\d+(?:[.,]\d+)?)/);
    const pts = ptMatch ? Number(ptMatch[1].replace(',', '.')) : 0;
    const isWarn =
      rawItem.toLowerCase().includes('cảnh báo') ||
      rawItem.toLowerCase().includes('canh bao') ||
      pts <= -50;
    const cleanLabel = rawItem.replace(/\s*\[cảnh báo\]/gi, '').trim();
    return {
      rawItem,
      label: cleanLabel || rawItem,
      points: isNaN(pts) ? 0 : pts,
      isWarning: isWarn
    };
  });
};

/**
 * Hàm phân tích nội dung ô tuần trên Sheet 03_THI_DUA_35_TUAN (Đồng bộ 2 chiều):
 * - Mỗi học sinh có mặc định 100 điểm thi đua ở mỗi tuần (DEFAULT_WEEK_BASE_SCORE = 100).
 * - Điểm tổng tuần = 100 + Điểm cộng + Điểm trừ (trong đó Điểm trừ <= 0).
 * - Nếu ô trên Sheet 03 trống ("" hoặc null hoặc #NUM!): trả về hasRecord = false, plusPoints = 0, minusPoints = 0, totalPoints = 100.
 */
export const parseWeekCellDetail = (
  rawDetail?: string | number | null,
  fallbackNumeric?: number | null
): ParsedWeekDetail => {
  const rawStr = rawDetail !== null && rawDetail !== undefined ? String(rawDetail).trim() : '';
  const str = rawStr === '#NUM!' || rawStr === 'NaN' || rawStr === 'null' || rawStr === 'undefined' ? '' : rawStr;

  const validFallback =
    fallbackNumeric !== null &&
    fallbackNumeric !== undefined &&
    !isNaN(Number(fallbackNumeric))
      ? Number(fallbackNumeric)
      : null;

  if (!str && validFallback === null) {
    return {
      hasRecord: false,
      behaviorsText: '',
      behaviorItems: [],
      plusPoints: 0,
      minusPoints: 0,
      totalPoints: DEFAULT_WEEK_BASE_SCORE,
      rawText: ''
    };
  }

  // Trường hợp ô chứa chuỗi chi tiết có "Hành vi:" hoặc "Điểm cộng:" hoặc "Điểm tổng:" hoặc "|"
  if (
    str.includes('Hành vi:') ||
    str.includes('Điểm cộng:') ||
    str.includes('Điểm trừ:') ||
    str.includes('Điểm tổng:') ||
    str.includes('|')
  ) {
    const behaviorMatch = str.match(/Hành vi\s*:\s*([^|]*)/i);
    const plusMatch = str.match(/Điểm cộng\s*:\s*([+-]?\d+(?:[.,]\d+)?)/i);
    const minusMatch = str.match(/Điểm trừ\s*:\s*([+-]?\d+(?:[.,]\d+)?)/i);
    const totalMatch = str.match(/(?:Điểm tổng|Tổng)\s*:\s*([+-]?\d+(?:[.,]\d+)?)/i);

    const behaviorsText = behaviorMatch ? behaviorMatch[1].trim() : str.split('|')[0].trim();
    const chips = splitBehaviorsIntoChips(behaviorsText);

    let plusPoints = plusMatch ? Math.abs(Number(plusMatch[1].replace(',', '.'))) : 0;
    const rawMinus = minusMatch ? Number(minusMatch[1].replace(',', '.')) : 0;
    let minusPoints = rawMinus > 0 ? -rawMinus : rawMinus;

    // Nếu trong phần Hành vi có các thẻ điểm cụ thể (VD: (+3đ), (-5đ)), tính Điểm cộng & Điểm trừ theo đúng các hành vi
    const chipsWithExplicitPts = chips.filter(c => c.points !== 0);
    if (chipsWithExplicitPts.length > 0) {
      const chipPlus = chipsWithExplicitPts
        .filter(c => c.points > 0)
        .reduce((acc, c) => acc + c.points, 0);
      const chipMinus = chipsWithExplicitPts
        .filter(c => c.points < 0)
        .reduce((acc, c) => acc + c.points, 0);

      if (chipPlus !== plusPoints || chipMinus !== minusPoints) {
        plusPoints = chipPlus;
        minusPoints = chipMinus;
      }
    } else if (!behaviorsText || behaviorsText.toLowerCase() === 'chưa chọn hành vi') {
      if (!plusMatch && !minusMatch && !totalMatch) {
        return {
          hasRecord: false,
          behaviorsText: '',
          behaviorItems: [],
          plusPoints: 0,
          minusPoints: 0,
          totalPoints: DEFAULT_WEEK_BASE_SCORE,
          rawText: ''
        };
      }
    }

    // Điểm tổng tuần luôn được tính dựa trên 100 điểm mặc định + Điểm cộng + Điểm trừ
    const totalPoints = DEFAULT_WEEK_BASE_SCORE + plusPoints + minusPoints;
    const netDelta = plusPoints + minusPoints;

    return {
      hasRecord: true,
      behaviorsText: behaviorsText || 'Ghi nhận điểm tuần',
      behaviorItems:
        chips.length > 0
          ? chips
          : [
              {
                rawItem: behaviorsText || `Điểm tuần (${totalPoints}đ)`,
                label: behaviorsText || `Điểm tuần (${totalPoints}đ)`,
                points: netDelta,
                isWarning: minusPoints <= -50
              }
            ],
      plusPoints,
      minusPoints,
      totalPoints,
      rawText: str
    };
  }

  // Trường hợp ô chỉ chứa số thuần túy (VD: 3, -5 hoặc 103, 95)
  const numVal =
    str !== '' && !isNaN(Number(str))
      ? Number(str)
      : validFallback;

  if (numVal !== null) {
    // Nếu số < 45 (VD: -39, -5, 3, 18) là điểm cộng/trừ chênh lệch; nếu >= 45 (VD: 50, 95, 100, 103) là điểm tổng đã tính trên nền 100đ
    const delta = numVal < 45 ? numVal : numVal - DEFAULT_WEEK_BASE_SCORE;
    const totalPoints = DEFAULT_WEEK_BASE_SCORE + delta;
    const plusPoints = delta > 0 ? delta : 0;
    const minusPoints = delta < 0 ? delta : 0;
    const label =
      delta > 0
        ? `Điểm cộng (+${delta}đ)`
        : delta < 0
        ? `Điểm trừ (${delta}đ)`
        : 'Mặc định tuần (100đ)';
    return {
      hasRecord: true,
      behaviorsText: label,
      behaviorItems: [
        {
          rawItem: label,
          label,
          points: delta,
          isWarning: minusPoints <= -50
        }
      ],
      plusPoints,
      minusPoints,
      totalPoints,
      rawText: str || String(numVal)
    };
  }

  // Trường hợp giáo viên gõ tự do trên Sheet 03 (VD: "Đi trễ -5đ, Phát biểu +3đ")
  const freeChips = splitBehaviorsIntoChips(str);
  const freePlus = freeChips.filter(c => c.points > 0).reduce((a, c) => a + c.points, 0);
  const freeMinus = freeChips.filter(c => c.points < 0).reduce((a, c) => a + c.points, 0);
  const freeDelta = freePlus + freeMinus;
  const freeTotal = DEFAULT_WEEK_BASE_SCORE + freeDelta;

  return {
    hasRecord: true,
    behaviorsText: str,
    behaviorItems:
      freeChips.length > 0
        ? freeChips
        : [{ rawItem: str, label: str, points: freeDelta, isWarning: freeMinus <= -50 }],
    plusPoints: freePlus,
    minusPoints: freeMinus,
    totalPoints: freeTotal,
    rawText: str
  };
};

/**
 * Tạo chuỗi chuẩn để lưu vào ô tuần của Sheet 03_THI_DUA_35_TUAN
 * (Mặc định 100đ + Điểm cộng - Điểm trừ = Điểm tổng)
 */
export const formatWeekCellDetail = (
  behaviorsText: string,
  plusPoints: number,
  minusPoints: number,
  totalPoints?: number
): string => {
  const cleanBehaviors = behaviorsText.trim() || 'Ghi nhận điểm tuần';
  const plusVal = Math.abs(plusPoints);
  const minusVal = Math.abs(minusPoints);
  const computedTotal =
    totalPoints !== undefined && totalPoints !== null
      ? totalPoints
      : DEFAULT_WEEK_BASE_SCORE + plusVal - minusVal;
  const plusStr = `+${plusVal}đ`;
  const minusStr = minusVal === 0 ? '0đ' : `-${minusVal}đ`;
  return `Hành vi: ${cleanBehaviors} | Điểm mặc định: ${DEFAULT_WEEK_BASE_SCORE}đ | Điểm cộng: ${plusStr} | Điểm trừ: ${minusStr} | Điểm tổng: ${computedTotal}đ`;
};

const getCachedCompetition = (cls: string): CompetitionStudentRow[] => {
  try {
    const defaultCls = getSystemConfig().className || '10A6';
    const raw =
      localStorage.getItem('cached_competition_all') ||
      localStorage.getItem(`cached_competition_${cls || defaultCls}`) ||
      localStorage.getItem(`cached_competition_${defaultCls}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return deduplicateCompetitionRowsById(parsed);
      }
    }
  } catch {}
  return [];
};

const getCachedWeeklyDetailsMap = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem('cached_weekly_details_map');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
};

const getCachedStudentsList = (cls: string): StudentItem[] => {
  try {
    const defaultCls = getSystemConfig().className || '10A6';
    const raw =
      localStorage.getItem('cached_students_all') ||
      localStorage.getItem(`cached_students_${cls || defaultCls}`) ||
      localStorage.getItem(`cached_students_${defaultCls}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return deduplicateStudentsById(parsed);
      }
    }
  } catch {}
  return [];
};

interface CompetitionViewProps {
  user: User;
  selectedWeek?: number;
  onWeekChange?: (week: number) => void;
}

export const CompetitionView: React.FC<CompetitionViewProps> = ({
  user,
  selectedWeek: externalSelectedWeek,
  onWeekChange
}) => {
  const currentClass = user.className || getSystemConfig().className || '10A6';

  // Khởi tạo từ cache nhưng đồng bộ 2 chiều ngay lập tức với Sheet 03
  const [competitionRows, setCompetitionRows] = useState<CompetitionStudentRow[]>(() =>
    getCachedCompetition(currentClass)
  );
  const [weeklyDetailsMap, setWeeklyDetailsMap] = useState<Record<string, string>>(() =>
    getCachedWeeklyDetailsMap()
  );
  const [studentsList, setStudentsList] = useState<StudentItem[]>(() =>
    getCachedStudentsList(currentClass)
  );
  const [behaviorRules, setBehaviorRules] = useState<BehaviorRuleItem[]>(() =>
    getCachedBehaviorRules()
  );

  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWeekState, setSelectedWeekState] = useState<number>(externalSelectedWeek || 1);
  const selectedWeek = externalSelectedWeek || selectedWeekState;
  const setSelectedWeek = (week: number) => {
    setSelectedWeekState(week);
    onWeekChange?.(week);
  };
  const [viewMode, setViewMode] = useState<'week' | 'matrix' | 'rules'>('week');

  // Lắng nghe sự kiện chuyển từ Cảnh báo sang tìm kiếm học sinh trên bảng thi đua
  useEffect(() => {
    const handleFilterStu = (e: any) => {
      if (e?.detail?.studentName) {
        setSearchTerm(e.detail.studentName);
        setViewMode('week');
        setSelectedGroup('Tất cả');
        if (e?.detail?.week) {
          setSelectedWeek(Number(e.detail.week));
        }
      }
    };
    window.addEventListener('app_filter_competition_student', handleFilterStu);
    return () => window.removeEventListener('app_filter_competition_student', handleFilterStu);
  }, []);

  // Chống xung đột khi đang lưu/xóa từ App lên Google Sheet
  const pendingWritesRef = useRef<number>(0);
  const lastWriteTimestampRef = useRef<number>(0);

  // Kiểm tra tài khoản có phải là Admin cao cấp hoặc GVCN không (Quản lý toàn lớp, có quyền nhập điểm tất cả các tổ)
  const isSuperAdminOrTeacher = (u?: User | null): boolean => {
    if (!u || u.isGuest) return false;
    if (u.role === UserRole.ADMIN) return true;
    const phone = (u.phone || '').toString().trim().replace(/^0+/, '');
    if (phone === '966000224' || phone === '792428799' || u.phone === '0966000224' || u.phone === '0792428799') return true;
    const name = (u.name || '').toString().toLowerCase();
    if (
      name.includes('admin') ||
      name.includes('quản trị') ||
      name.includes('quan tri') ||
      name.includes('giáo viên') ||
      name.includes('giao vien') ||
      name.includes('gvcn') ||
      name.includes('thầy') ||
      name.includes('hiển') ||
      name.includes('phi')
    ) {
      return true;
    }
    const id = (u.studentId || '').toString().toUpperCase();
    if (id === 'GV01' || id.startsWith('GV') || id === 'ADMIN') return true;
    const cls = (u.className || '').toString().toLowerCase();
    if (cls.includes('admin') || cls.includes('giáo viên') || cls.includes('giao vien')) return true;
    return false;
  };

  // Xác định Tổ mà Tổ trưởng quản lý theo tài khoản đăng nhập (Chỉ trả về tổ nếu là Tổ trưởng thật sự)
  const detectLeaderManagedGroup = (targetUser: User, stuList: StudentItem[]): string | null => {
    if (!targetUser || targetUser.isGuest) return null;
    if (isSuperAdminOrTeacher(targetUser)) return null; // GVCN / Admin quản lý toàn lớp

    const scopeRaw = (targetUser.managedScope || '').toString().trim();
    const scopeLower = scopeRaw.toLowerCase();

    // 1. Kiểm tra từ targetUser.managedScope (cán sự đã gán tổ quản lý: "Tổ 1", "Tổ 5", "Tổ 8"...)
    const matchScope = scopeRaw.match(/(?:Tổ|To_truong_|To|TT)\s*_?(\d+)/i) || (scopeLower.includes('tổ') ? scopeRaw.match(/\d+/) : null);
    if (matchScope) return `Tổ ${matchScope[1] || matchScope[0]}`;

    const userPhoneNorm = (targetUser.phone || '').toString().replace(/^0+/, '').trim();
    const userNameLower = (targetUser.name || '').toString().toLowerCase().trim();
    const userIdUpper = (targetUser.studentId || '').toString().toUpperCase().trim();

    // 2. Kiểm tra mã định danh cán sự (VD: 9A8_TT5, TT5, TO_5...)
    const matchId = userIdUpper.match(/(?:TT|TO_|TO_TRUONG_)(\d+)/);
    if (matchId) return `Tổ ${matchId[1]}`;

    // 3. Kiểm tra đối chiếu với danh sách Cán sự quản lý từ Sheet 01_QUAN_LI
    try {
      const rawManagers = localStorage.getItem('cached_managers_all');
      if (rawManagers) {
        const managers = JSON.parse(rawManagers);
        if (Array.isArray(managers)) {
          const matched = managers.find((m: any) => {
            const mPhone = String(m.phone || '').replace(/^0+/, '').trim();
            const mName = String(m.name || '').toLowerCase().trim();
            return (userPhoneNorm && mPhone === userPhoneNorm) || (userNameLower && mName === userNameLower);
          });
          if (matched) {
            const mRole = String(matched.role || '').toUpperCase();
            const mScope = String(matched.managedScope || '').toLowerCase();
            const mNote = String(matched.note || '').toLowerCase();
            const mId = String(matched.id || '').toUpperCase();
            const combined = `${mRole} ${mScope} ${mNote} ${mId}`;
            if (!combined.includes('lớp trưởng') && !combined.includes('lop_truong')) {
              const matchMgr = combined.match(/(?:to_truong_|tổ trưởng|to truong|tổ|tt|to)\s*_?(\d+)/i) || combined.match(/\b([1-9]|1[0-2])\b/);
              if (matchMgr) return `Tổ ${matchMgr[1]}`;
            }
          }
        }
      }
    } catch {}

    // 4. Kiểm tra đối chiếu với danh sách Học sinh (Sheet 02_HOC_SINH) xem có ghi chú "Tổ trưởng" không
    if (stuList && stuList.length > 0) {
      const matchedStudent = stuList.find(s => {
        const sPhoneNorm = String(s.phone || '').replace(/^0+/, '').trim();
        const sNameLower = String(s.name || '').toLowerCase().trim();
        return (userPhoneNorm && sPhoneNorm === userPhoneNorm) || (userNameLower && sNameLower === userNameLower);
      });
      if (matchedStudent) {
        const sNoteLower = String(matchedStudent.note || '').toLowerCase();
        if (sNoteLower.includes('tổ trưởng') || sNoteLower.includes('to truong') || sNoteLower.includes('tt')) {
          const matchStu = (sNoteLower + ' ' + (matchedStudent.group || '')).match(/(?:tổ trưởng|to truong|tổ|tt|to)\s*_?(\d+)/i) || (matchedStudent.group || '').match(/\d+/);
          if (matchStu) return `Tổ ${matchStu[1] || matchStu[0]}`;
        }
      }
    }

    return null;
  };

  const isSuperAdminOrTeacherUser = useMemo(() => isSuperAdminOrTeacher(user), [user]);
  const leaderManagedGroup = useMemo(
    () => detectLeaderManagedGroup(user, studentsList),
    [user, studentsList]
  );

  // Quyền nhập điểm thi đua: Chỉ có tài khoản Admin cao cấp, Tài khoản GVCN, tài khoản tổ trưởng
  const canEnterCompetition = Boolean(isSuperAdminOrTeacherUser || leaderManagedGroup);

  const [selectedGroup, setSelectedGroup] = useState<string>(() => {
    const detected = detectLeaderManagedGroup(user, getCachedStudentsList(currentClass));
    return detected || 'Tất cả';
  });

  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    return (
      localStorage.getItem('cached_comp_sync_time_all') ||
      localStorage.getItem(`cached_comp_sync_time_${currentClass}`) ||
      ''
    );
  });

  // ============================================================================
  // STATE CHO CỬA SỔ "NHẬP THI ĐUA"
  // ============================================================================
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryGroup, setEntryGroup] = useState<string>('Tổ 1');
  const [entryStudentId, setEntryStudentId] = useState<string>('');
  const [behaviorCounts, setBehaviorCounts] = useState<Record<string, number>>({});
  const [customPlusPoints, setCustomPlusPoints] = useState<string>('');
  const [customMinusPoints, setCustomMinusPoints] = useState<string>('');
  const [scoreSaveMode, setScoreSaveMode] = useState<'add_to_current' | 'replace'>('add_to_current');
  const [isSavingScore, setIsSavingScore] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isScriptUpdatedForDetails, setIsScriptUpdatedForDetails] = useState<boolean>(true);
  const [showScriptUpgradeGuide, setShowScriptUpgradeGuide] = useState<boolean>(false);
  const [customScriptUrlInput, setCustomScriptUrlInput] = useState<string>(() => getGoogleScriptUrl());

  useEffect(() => {
    const handleUrlUpdate = (e: any) => {
      if (e?.detail?.url) {
        setCustomScriptUrlInput(e.detail.url);
      }
    };
    window.addEventListener('app_google_script_url_updated', handleUrlUpdate);
    return () => window.removeEventListener('app_google_script_url_updated', handleUrlUpdate);
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleCopyAppsScriptCode = async () => {
    try {
      await navigator.clipboard.writeText(appsScriptRawCode);
      showToast('📋 Đã sao chép toàn bộ mã Code.gs mới (v2.3)! Thầy/Cô hãy dán vào Google Apps Script và bấm Triển khai.');
    } catch {
      showToast('Không thể tự động copy, vui lòng copy mã trong khung hiển thị.');
    }
  };

  // Chuyển điểm số đơn lẻ (VD: 3 hoặc 103) thành chuỗi chi tiết đầy đủ dựa trên 100 điểm gốc + Sheet 04_THI_DUA
  const buildDetailStringFromPlainScore = (numScore: number, rulesList: BehaviorRuleItem[]): string => {
    const delta = numScore < 45 ? numScore : numScore - DEFAULT_WEEK_BASE_SCORE;
    const totalScore = DEFAULT_WEEK_BASE_SCORE + delta;
    const matched = rulesList.find(r => Number(r.points) === delta);
    const ptStr = delta > 0 ? `+${delta}đ` : `${delta}đ`;
    const behaviorLabel = matched
      ? `${matched.behavior} (${ptStr})${matched.isWarning ? ' [Cảnh báo]' : ''}`
      : delta > 0
      ? `Điểm cộng (${ptStr})`
      : delta < 0
      ? `Điểm trừ (${ptStr})`
      : 'Mặc định tuần (100đ)';
    return formatWeekCellDetail(
      behaviorLabel,
      delta > 0 ? delta : 0,
      delta < 0 ? delta : 0,
      totalScore
    );
  };

  // ============================================================================
  // ĐỒNG BỘ 2 CHIỀU THỰC TẾ GIỮA APP VÀ GOOGLE SHEET (SHEET 02, SHEET 03, SHEET 04)
  // Nếu bên Sheet 03 xóa hành vi / điểm -> bên App lập tức xóa khỏi bộ nhớ & giao diện!
  // ============================================================================
  const fetchAllCompetitionData = async (forceShowLoading = false, isSilentBackground = false) => {
    // Nếu đang có thao tác ghi lên Sheet 03 chưa xong thì không ghi đè bằng bản đọc nền cũ
    if (
      isSilentBackground &&
      (pendingWritesRef.current > 0 ||
        hasActivePendingWrites() ||
        Date.now() - lastWriteTimestampRef.current < 3000)
    ) {
      return;
    }

    if (forceShowLoading || (competitionRows.length === 0 && studentsList.length === 0)) {
      setIsLoading(true);
    }

    const activeScriptUrl = getGoogleScriptUrl();

    try {
      const [compData, stuData, rulesData] = await Promise.all([
        fetchCompetitionFromGoogleSheet(forceShowLoading).catch(() => null),
        fetchStudentsFromGoogleSheet(forceShowLoading).catch(() => []),
        fetchBehaviorRulesFromGoogleSheet(forceShowLoading).catch(() => getCachedBehaviorRules())
      ]);

      // Nếu trong lúc chờ mạng mà người dùng vừa bấm Lưu/Xóa thì bỏ qua kết quả đọc nền cũ
      if (
        isSilentBackground &&
        (pendingWritesRef.current > 0 ||
          hasActivePendingWrites() ||
          Date.now() - lastWriteTimestampRef.current < 3000)
      ) {
        return;
      }

      const activeRules = Array.isArray(rulesData) && rulesData.length > 0 ? rulesData : behaviorRules;
      if (Array.isArray(rulesData) && rulesData.length > 0) {
        setBehaviorRules(rulesData);
      }

      let latestStudents = studentsList;
      if (Array.isArray(stuData) && stuData.length > 0) {
        latestStudents = stuData;
        setStudentsList(latestStudents);
      }

      if (Array.isArray(compData)) {
        const prevCachedDetailsMap = getCachedWeeklyDetailsMap();
        const freshDetailsMap: Record<string, string> = {};
        const pendingMap = getPendingSheet03Writes();
        const serverHasWeeklyDetails =
          compData.length === 0 || Boolean(compData[0] && 'weeklyDetails' in compData[0]);
        setIsScriptUpdatedForDetails(serverHasWeeklyDetails);

        const normalizedCompRows: CompetitionStudentRow[] = compData.map((row: any) => {
          const rowId = String(row?.id || '').trim();
          const hasWeeklyDetailsObj = Boolean(row && row.weeklyDetails && typeof row.weeklyDetails === 'object');
          const cleanWeeklyScores: Record<string, number | null> = {};
          const cleanWeeklyDetails: Record<string, string> = {};
          let rowSum = 0;

          for (let w = 1; w <= 35; w++) {
            const wkKey = `Tuan_${w}`;
            const cellPendingKey = `${rowId}_${wkKey}`;
            const pendingWrite = pendingMap.get(cellPendingKey);

            // Nếu ô này đang trong hàng đợi ghi nền lên Sheet 03, ưu tiên giữ giá trị vừa lưu
            if (pendingWrite) {
              if (pendingWrite.numericScore === null || !pendingWrite.detail) {
                cleanWeeklyDetails[wkKey] = '';
                cleanWeeklyScores[wkKey] = null;
              } else {
                freshDetailsMap[cellPendingKey] = pendingWrite.detail;
                cleanWeeklyDetails[wkKey] = pendingWrite.detail;
                cleanWeeklyScores[wkKey] = pendingWrite.numericScore;
                rowSum += Number(pendingWrite.numericScore);
              }
              continue;
            }

            const rawScore = row?.weeklyScores ? row.weeklyScores[wkKey] : null;
            const rawDetailFromSheet = hasWeeklyDetailsObj
              ? String(row.weeklyDetails[wkKey] ?? '').trim()
              : '';

            const isSheetScoreEmpty =
              rawScore === null ||
              rawScore === undefined ||
              String(rawScore).trim() === '' ||
              isNaN(Number(rawScore));

            const isSheetDetailEmpty =
              !rawDetailFromSheet ||
              rawDetailFromSheet === '#NUM!' ||
              rawDetailFromSheet === 'NaN';

            if (hasWeeklyDetailsObj) {
              // Apps Script đã lên bản v2.3 (trả về weeklyDetails trực tiếp từ Sheet 03)
              if (!isSheetDetailEmpty) {
                if (!isNaN(Number(rawDetailFromSheet))) {
                  const numVal = Number(rawDetailFromSheet);
                  const expectedTotal = numVal < 45 ? DEFAULT_WEEK_BASE_SCORE + numVal : numVal;
                  const prevDetail = prevCachedDetailsMap[cellPendingKey] || '';
                  const parsedPrev = prevDetail ? parseWeekCellDetail(prevDetail, null) : null;
                  const upgradedStr =
                    parsedPrev && parsedPrev.hasRecord && parsedPrev.totalPoints === expectedTotal && prevDetail.includes('Hành vi:')
                      ? formatWeekCellDetail(parsedPrev.behaviorsText, parsedPrev.plusPoints, parsedPrev.minusPoints, expectedTotal)
                      : buildDetailStringFromPlainScore(numVal, activeRules);
                  freshDetailsMap[cellPendingKey] = upgradedStr;
                  cleanWeeklyDetails[wkKey] = upgradedStr;
                  cleanWeeklyScores[wkKey] = expectedTotal;
                } else {
                  freshDetailsMap[cellPendingKey] = rawDetailFromSheet;
                  cleanWeeklyDetails[wkKey] = rawDetailFromSheet;
                  const parsed = parseWeekCellDetail(rawDetailFromSheet, isSheetScoreEmpty ? null : Number(rawScore));
                  cleanWeeklyScores[wkKey] = parsed.hasRecord ? parsed.totalPoints : null;
                }
              } else if (!isSheetScoreEmpty) {
                const numVal = Number(rawScore);
                const expectedTotal = numVal < 45 ? DEFAULT_WEEK_BASE_SCORE + numVal : numVal;
                const prevDetail = prevCachedDetailsMap[cellPendingKey] || '';
                const parsedPrev = prevDetail ? parseWeekCellDetail(prevDetail, null) : null;
                const upgradedStr =
                  parsedPrev && parsedPrev.hasRecord && parsedPrev.totalPoints === expectedTotal && prevDetail.includes('Hành vi:')
                    ? formatWeekCellDetail(parsedPrev.behaviorsText, parsedPrev.plusPoints, parsedPrev.minusPoints, expectedTotal)
                    : buildDetailStringFromPlainScore(numVal, activeRules);
                freshDetailsMap[cellPendingKey] = upgradedStr;
                cleanWeeklyDetails[wkKey] = upgradedStr;
                cleanWeeklyScores[wkKey] = expectedTotal;
              } else {
                // Ô trên Sheet 03 đã bị xóa / đang trống -> Xóa sạch trên App!
                cleanWeeklyDetails[wkKey] = '';
                cleanWeeklyScores[wkKey] = null;
              }
            } else {
              // Apps Script đang chạy bản v2.1 (chỉ trả về weeklyScores):
              if (isSheetScoreEmpty) {
                cleanWeeklyDetails[wkKey] = '';
                cleanWeeklyScores[wkKey] = null;
              } else {
                const sheetNum = Number(rawScore);
                const expectedTotal = sheetNum < 45 ? DEFAULT_WEEK_BASE_SCORE + sheetNum : sheetNum;
                const prevDetail = prevCachedDetailsMap[cellPendingKey] || '';
                const parsedPrev = prevDetail ? parseWeekCellDetail(prevDetail, null) : null;

                if (parsedPrev && parsedPrev.hasRecord && parsedPrev.totalPoints === expectedTotal && prevDetail.includes('Hành vi:')) {
                  const updatedPrev = formatWeekCellDetail(parsedPrev.behaviorsText, parsedPrev.plusPoints, parsedPrev.minusPoints, expectedTotal);
                  freshDetailsMap[cellPendingKey] = updatedPrev;
                  cleanWeeklyDetails[wkKey] = updatedPrev;
                } else {
                  const inferredDetail = buildDetailStringFromPlainScore(sheetNum, activeRules);
                  freshDetailsMap[cellPendingKey] = inferredDetail;
                  cleanWeeklyDetails[wkKey] = inferredDetail;
                }
                cleanWeeklyScores[wkKey] = expectedTotal;
              }
            }

            if (cleanWeeklyScores[wkKey] !== null && cleanWeeklyScores[wkKey] !== undefined) {
              rowSum += Number(cleanWeeklyScores[wkKey]);
            }
          }

          return {
            id: rowId,
            name: String(row?.name || '').trim(),
            className: String(row?.className || currentClass).trim(),
            group: String(row?.group || 'Tổ 1').trim(),
            weeklyScores: cleanWeeklyScores,
            weeklyDetails: cleanWeeklyDetails,
            totalScore: rowSum
          };
        });

        setWeeklyDetailsMap(freshDetailsMap);
        localStorage.setItem('cached_weekly_details_map', JSON.stringify(freshDetailsMap));

        const uniqueNormalizedRows = deduplicateCompetitionRowsById(normalizedCompRows);
        setCompetitionRows(uniqueNormalizedRows);
        localStorage.setItem('cached_competition_all', JSON.stringify(uniqueNormalizedRows));
        window.dispatchEvent(new CustomEvent('app_data_updated', { detail: { selectedWeek } }));

        if (latestStudents.length > normalizedCompRows.length) {
          fetch(`${activeScriptUrl}?action=sync_students_to_competition&_t=${Date.now()}`).catch(() => {});
        }
      }

      const timeStr = new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      setLastSyncTime(timeStr);
      localStorage.setItem('cached_comp_sync_time_all', timeStr);
    } catch (err) {
      console.warn('Lỗi đồng bộ dữ liệu thi đua từ Google Sheet:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Tự động đồng bộ 2 chiều khi mở App, khi quay lại tab trình duyệt (sau khi sửa/xóa trên Google Sheet), và định kỳ
  useEffect(() => {
    // Luôn đồng bộ ngầm ngay khi tải để cập nhật mọi thay đổi/xóa từ Sheet 03
    fetchAllCompetitionData(false, false);

    const handleGlobalSync = (e: any) => {
      const targetUser = e?.detail?.user || user;
      const detected = detectLeaderManagedGroup(targetUser, studentsList);
      if (detected) {
        setSelectedGroup(detected);
      }
      fetchAllCompetitionData(true, false);
    };

    const handleWindowFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchAllCompetitionData(false, true);
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !isEntryModalOpen) {
        fetchAllCompetitionData(false, true);
      }
    }, 15000);

    const handleDataUpdated = () => {
      setCompetitionRows(getCachedCompetition(currentClass));
      setStudentsList(getCachedStudentsList(currentClass));
      setWeeklyDetailsMap(getCachedWeeklyDetailsMap());
    };

    window.addEventListener('app_sync_google', handleGlobalSync);
    window.addEventListener('app_data_updated', handleDataUpdated);
    window.addEventListener('focus', handleWindowFocusOrVisible);
    document.addEventListener('visibilitychange', handleWindowFocusOrVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('app_sync_google', handleGlobalSync);
      window.removeEventListener('app_data_updated', handleDataUpdated);
      window.removeEventListener('focus', handleWindowFocusOrVisible);
      document.removeEventListener('visibilitychange', handleWindowFocusOrVisible);
    };
  }, [user.className, user.managedScope, user.phone, isEntryModalOpen]);

  useEffect(() => {
    if (leaderManagedGroup) {
      setSelectedGroup(leaderManagedGroup);
    }
  }, [leaderManagedGroup]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('app_data_updated', { detail: { selectedWeek } }));
  }, [selectedWeek]);

  // Hỗ trợ liên kết nhảy trực tiếp đến học sinh từ thông báo Cảnh Báo
  useEffect(() => {
    const handleJump = (e: any) => {
      if (e?.detail?.searchTerm) {
        setSearchTerm(e.detail.searchTerm);
      }
      if (e?.detail?.group && !leaderManagedGroup) {
        setSelectedGroup(e.detail.group);
      }
      if (viewMode !== 'week') {
        setViewMode('week');
      }
    };
    window.addEventListener('app_jump_competition', handleJump);
    return () => window.removeEventListener('app_jump_competition', handleJump);
  }, [leaderManagedGroup, viewMode]);

  // Hợp nhất dữ liệu thực giữa Sheet 03 và Sheet 02 (Không bao giờ phục hồi dữ liệu đã xóa trên Sheet 03)
  const mergedRows: CompetitionStudentRow[] = useMemo(() => {
    const compMap = new Map<string, CompetitionStudentRow>();
    competitionRows.forEach(r => {
      if (r && r.id) compMap.set(String(r.id).trim(), r);
    });

    const stuMap = new Map<string, StudentItem>();
    studentsList.forEach(s => {
      if (s && s.id) stuMap.set(String(s.id).trim(), s);
    });

    // Xác định tuần cao nhất đang xét (tối thiểu là selectedWeek) để tính điểm tích lũy trên nền 100đ/tuần
    let maxActiveWeek = selectedWeek;
    competitionRows.forEach(r => {
      for (let w = 1; w <= 35; w++) {
        const val = r?.weeklyScores?.[`Tuan_${w}`];
        const det = r?.weeklyDetails?.[`Tuan_${w}`];
        if ((val !== null && val !== undefined && String(val).trim() !== '') || (det && String(det).trim() !== '')) {
          if (w > maxActiveWeek) maxActiveWeek = w;
        }
      }
    });

    const buildStudentRow = (
      id: string,
      name: string,
      clsName: string,
      grp: string,
      note: string,
      comp?: CompetitionStudentRow
    ): CompetitionStudentRow => {
      const weeklyScores: Record<string, number | null> = {};
      const weeklyDetails: Record<string, string> = {};
      let sum = 0;

      for (let w = 1; w <= 35; w++) {
        const key = `Tuan_${w}`;
        const rawScoreVal = comp?.weeklyScores ? comp.weeklyScores[key] : null;
        const hasWeeklyDetailsObj = Boolean(comp && comp.weeklyDetails && typeof comp.weeklyDetails === 'object');
        const rawDetailFromComp = hasWeeklyDetailsObj ? String(comp?.weeklyDetails?.[key] ?? '').trim() : '';

        const isScoreEmpty =
          rawScoreVal === null ||
          rawScoreVal === undefined ||
          String(rawScoreVal).trim() === '' ||
          isNaN(Number(rawScoreVal));

        let effectiveDetail = '';
        if (hasWeeklyDetailsObj) {
          // Nếu ô trên Sheet 03 có chuỗi chi tiết thì hiển thị, nếu trống thì để trống hoàn toàn
          if (rawDetailFromComp && rawDetailFromComp !== '#NUM!' && rawDetailFromComp !== 'NaN') {
            effectiveDetail = rawDetailFromComp;
          } else if (!isScoreEmpty) {
            effectiveDetail = String(rawScoreVal);
          } else {
            effectiveDetail = '';
          }
        } else if (comp) {
          // Nếu ô trên Sheet 03 là null -> Đã bị xóa trên Sheet 03 -> Tuyệt đối không lấy từ weeklyDetailsMap!
          if (isScoreEmpty) {
            effectiveDetail = '';
          } else {
            const numVal = Number(rawScoreVal);
            const expectedTotal = numVal < 45 ? DEFAULT_WEEK_BASE_SCORE + numVal : numVal;
            const cached = weeklyDetailsMap[`${id}_${key}`] || '';
            const parsedCached = cached ? parseWeekCellDetail(cached, null) : null;
            effectiveDetail =
              parsedCached && parsedCached.hasRecord && parsedCached.totalPoints === expectedTotal
                ? cached
                : String(rawScoreVal);
          }
        } else {
          effectiveDetail = '';
        }

        const parsed = parseWeekCellDetail(effectiveDetail, isScoreEmpty ? null : Number(rawScoreVal));
        weeklyScores[key] = parsed.hasRecord ? parsed.totalPoints : null;
        weeklyDetails[key] = effectiveDetail;

        // Mỗi tuần đã học (1 -> maxActiveWeek) hoặc tuần có ghi nhận đều có mặc định 100đ + điểm cộng - điểm trừ
        if (parsed.hasRecord && parsed.totalPoints !== null) {
          sum += parsed.totalPoints;
        } else if (w <= maxActiveWeek) {
          sum += DEFAULT_WEEK_BASE_SCORE;
        }
      }

      return {
        id,
        name,
        className: clsName,
        group: grp,
        note,
        weeklyScores,
        weeklyDetails,
        totalScore: sum
      };
    };

    const seenIds = new Set<string>();
    const uniqueCompRows = deduplicateCompetitionRowsById(competitionRows);
    const uniqueStudents = deduplicateStudentsById<StudentItem>(studentsList);

    if (uniqueCompRows.length > 0) {
      const combined: CompetitionStudentRow[] = [];
      uniqueCompRows.forEach(comp => {
        const cId = String(comp.id).trim();
        if (!cId || seenIds.has(cId)) return;
        seenIds.add(cId);
        const stu = stuMap.get(cId);
        combined.push(
          buildStudentRow(
            cId,
            stu?.name || comp.name || '',
            stu?.className || comp.className || currentClass,
            stu?.group || comp.group || 'Tổ 1',
            stu?.note || '',
            comp
          )
        );
      });

      uniqueStudents.forEach(stu => {
        const sId = String(stu.id).trim();
        if (sId && !seenIds.has(sId) && !compMap.has(sId)) {
          seenIds.add(sId);
          combined.push(
            buildStudentRow(
              sId,
              stu.name || '',
              stu.className || currentClass,
              stu.group || 'Tổ 1',
              stu.note || ''
            )
          );
        }
      });

      return combined;
    }

    return uniqueStudents.map(stu => {
      const sId = String(stu.id).trim();
      return buildStudentRow(
        sId,
        stu.name || '',
        stu.className || currentClass,
        stu.group || 'Tổ 1',
        stu.note || ''
      );
    });
  }, [competitionRows, studentsList, weeklyDetailsMap, currentClass, selectedWeek]);

  // Tự động phát hiện tuần hiện tại có dữ liệu lần đầu
  const hasAutoSelectedWeekRef = useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedWeekRef.current && mergedRows.length > 0) {
      let latestActiveWeek = 1;
      for (let w = 35; w >= 1; w--) {
        const hasScore = mergedRows.some(
          r => r.weeklyScores[`Tuan_${w}`] !== null && r.weeklyScores[`Tuan_${w}`] !== undefined
        );
        if (hasScore) {
          latestActiveWeek = w;
          break;
        }
      }
      setSelectedWeek(latestActiveWeek);
      hasAutoSelectedWeekRef.current = true;
    }
  }, [mergedRows]);

  const displayClassName = useMemo(() => {
    if (mergedRows.length > 0 && mergedRows[0].className) {
      return mergedRows[0].className;
    }
    return currentClass;
  }, [mergedRows, currentClass]);

  // Trích xuất danh sách tất cả các Tổ có trong Google Sheet (hỗ trợ đầy đủ 8 Tổ)
  const availableGroups = useMemo(() => {
    return extractAvailableGroups(mergedRows, undefined, competitionRows);
  }, [mergedRows, competitionRows]);

  const groupFilters = useMemo(() => {
    return [...availableGroups, 'Tất cả'];
  }, [availableGroups]);

  // Kiểm tra học sinh có hành vi vi phạm nặng cần "Cảnh Báo" theo quy định trong Sheet 04_THI_DUA hay không
  const getStudentWeekWarningInfo = (
    parsedWk: ParsedWeekDetail,
    rules: BehaviorRuleItem[] = behaviorRules
  ): { isWarning: boolean; warningText: string; matchedBehaviors: string[] } => {
    if (!parsedWk.hasRecord) {
      return { isWarning: false, warningText: '', matchedBehaviors: [] };
    }

    const warningRulesFromSheet04 = rules.filter(
      r =>
        r.isWarning ||
        (r.note &&
          (r.note.toLowerCase().includes('cảnh báo') ||
            r.note.toLowerCase().includes('canh bao'))) ||
        Number(r.points) <= -50
    );

    const matchedBehaviors: string[] = [];

    parsedWk.behaviorItems.forEach(chip => {
      const cleanChipName = chip.label
        .replace(/\(\s*(?:x\d+\s*:\s*)?[+-]?\d+(?:[.,]\d+)?\s*đ?\s*\)/gi, '')
        .replace(/\[cảnh báo\]/gi, '')
        .trim()
        .toLowerCase();

      const matchedRule = warningRulesFromSheet04.find(r => {
        const ruleName = (r.behavior || '').trim().toLowerCase();
        return (
          ruleName &&
          (cleanChipName === ruleName ||
            cleanChipName.includes(ruleName) ||
            ruleName.includes(cleanChipName))
        );
      });

      if (matchedRule) {
        matchedBehaviors.push(matchedRule.behavior);
      } else if (chip.isWarning || chip.points <= -50) {
        matchedBehaviors.push(chip.label);
      }
    });

    const rawTextLower = (parsedWk.rawText || '').toLowerCase();
    const matchedByRawText = warningRulesFromSheet04.find(r => {
      const ruleName = (r.behavior || '').trim().toLowerCase();
      return ruleName && rawTextLower.includes(ruleName);
    });
    if (matchedByRawText && !matchedBehaviors.includes(matchedByRawText.behavior)) {
      matchedBehaviors.push(matchedByRawText.behavior);
    }

    const hasHeavyViolation =
      matchedBehaviors.length > 0 ||
      rawTextLower.includes('cảnh báo') ||
      rawTextLower.includes('canh bao') ||
      parsedWk.minusPoints <= -50 ||
      (parsedWk.totalPoints !== null && Number(parsedWk.totalPoints) <= DEFAULT_WEEK_BASE_SCORE - 50);

    return {
      isWarning: hasHeavyViolation,
      warningText: hasHeavyViolation ? 'Cảnh Báo' : '',
      matchedBehaviors
    };
  };

  // Lọc danh sách theo Tổ và ô tìm kiếm (Hỗ trợ đủ 8 Tổ và Tất cả)
  const filteredRows = useMemo(() => {
    return mergedRows.filter(r => {
      if (selectedGroup !== 'Tất cả' && selectedGroup !== 'Tất cả tổ') {
        const rGroup = (r.group || '').toLowerCase().trim();
        const target = selectedGroup.toLowerCase().trim();
        const rGroupClean = rGroup.replace(/\s+/g, '');
        const targetClean = target.replace(/\s+/g, '');
        if (rGroup !== target && rGroupClean !== targetClean && !rGroup.includes(target)) return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const wkKey = `Tuan_${selectedWeek}`;
        const wkDetail = (r.weeklyDetails?.[wkKey] || '').toLowerCase();
        const parsedWk = parseWeekCellDetail(r.weeklyDetails?.[wkKey], r.weeklyScores[wkKey]);
        const warnInfo = getStudentWeekWarningInfo(parsedWk, behaviorRules);
        const matchName = (r.name || '').toLowerCase().includes(term);
        const matchId = (r.id || '').toLowerCase().includes(term);
        const matchGroup = (r.group || '').toLowerCase().includes(term);
        const matchNote = (r.note || '').toLowerCase().includes(term);
        const matchBehavior = wkDetail.includes(term);
        const matchWarning =
          warnInfo.isWarning &&
          ('cảnh báo'.includes(term) || 'canh bao'.includes(term));
        return matchName || matchId || matchGroup || matchNote || matchBehavior || matchWarning;
      }

      return true;
    });
  }, [mergedRows, selectedGroup, searchTerm, selectedWeek, behaviorRules]);

  const countByGroup = (grp: string) => {
    if (grp === 'Tất cả' || grp === 'Tất cả tổ') return mergedRows.length;
    const cleanGrp = grp.trim().toLowerCase();
    const cleanGrpNoSpace = cleanGrp.replace(/\s+/g, '');
    return mergedRows.filter(s => {
      const sGrp = (s.group || '').trim().toLowerCase();
      const sGrpNoSpace = sGrp.replace(/\s+/g, '');
      return sGrp === cleanGrp || sGrpNoSpace === cleanGrpNoSpace || sGrp.includes(cleanGrp);
    }).length;
  };

  const formatAvgScore = (val: number): string => {
    if (isNaN(val)) return String(DEFAULT_WEEK_BASE_SCORE);
    const rounded = Math.round(val * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
  };

  // Thống kê số liệu thực của tất cả các Tổ từ Google Sheet: lấy Tổng số điểm chia cho Tổng số thành viên trong tổ
  const groupStats = useMemo(() => {
    const groups = availableGroups;
    const rawStats = groups.map(grpName => {
      const cleanTarget = grpName.trim().toLowerCase();
      const cleanTargetNoSpace = cleanTarget.replace(/\s+/g, '');
      const members = mergedRows.filter(r => {
        const sGrp = (r.group || '').trim().toLowerCase();
        const sGrpNoSpace = sGrp.replace(/\s+/g, '');
        return sGrp === cleanTarget || sGrpNoSpace === cleanTargetNoSpace || sGrp.includes(cleanTarget);
      });
      const weekKey = `Tuan_${selectedWeek}`;
      let weekTotal = 0;
      let weekDelta = 0;
      let yearTotal = 0;
      let warningCount = 0;
      let gradedCount = 0;

      members.forEach(m => {
        const wScore = m.weeklyScores[weekKey];
        const wDetail = m.weeklyDetails?.[weekKey] || '';
        const parsedWk = parseWeekCellDetail(wDetail, wScore);
        const memberWeekScore =
          parsedWk.hasRecord && parsedWk.totalPoints !== null
            ? Number(parsedWk.totalPoints)
            : DEFAULT_WEEK_BASE_SCORE;
        const memberDelta = parsedWk.plusPoints + parsedWk.minusPoints;

        weekTotal += memberWeekScore;
        weekDelta += memberDelta;
        if (parsedWk.hasRecord) {
          gradedCount++;
          if (getStudentWeekWarningInfo(parsedWk, behaviorRules).isWarning) {
            warningCount++;
          }
        }
        yearTotal += Number(m.totalScore || DEFAULT_WEEK_BASE_SCORE);
      });

      const weekAvg = members.length > 0 ? weekTotal / members.length : DEFAULT_WEEK_BASE_SCORE;
      const yearAvg = members.length > 0 ? yearTotal / members.length : DEFAULT_WEEK_BASE_SCORE;

      return {
        groupName: grpName,
        memberCount: members.length,
        gradedCount,
        weekTotal,
        weekDelta,
        weekAvg,
        yearTotal,
        yearAvg,
        warningCount
      };
    });

    const sorted = [...rawStats].sort((a, b) => {
      if (b.weekAvg !== a.weekAvg) return b.weekAvg - a.weekAvg;
      return b.yearAvg - a.yearAvg;
    });

    return rawStats.map(st => ({
      ...st,
      rank: sorted.findIndex(s => s.groupName === st.groupName) + 1
    }));
  }, [mergedRows, selectedWeek, behaviorRules, availableGroups]);

  // ============================================================================
  // HÀM GHI / XÓA DỮ LIỆU TUẦN ĐỒNG BỘ 2 CHIỀU LÊN SHEET 03_THI_DUA_35_TUAN (0ms UI)
  // ============================================================================
  const applyStudentWeekUpdateLocallyAndSyncSheet03 = async (
    targetStudent: CompetitionStudentRow,
    weekNum: number,
    newCellDetailString: string,
    newNumericScore: number | null,
    successToastMessage: string
  ) => {
    const wkKey = `Tuan_${weekNum}`;
    const studentIdClean = String(targetStudent.id).trim();
    const isClearing = newNumericScore === null || newCellDetailString.trim() === '';

    lastWriteTimestampRef.current = Date.now();

    // 1. Cập nhật ngay lập tức (0ms) bộ nhớ đệm & giao diện trên App bằng functional update
    setWeeklyDetailsMap(prev => {
      const nextDetailsMap = { ...prev };
      if (isClearing) {
        delete nextDetailsMap[`${studentIdClean}_${wkKey}`];
      } else {
        nextDetailsMap[`${studentIdClean}_${wkKey}`] = newCellDetailString;
      }
      localStorage.setItem('cached_weekly_details_map', JSON.stringify(nextDetailsMap));
      return nextDetailsMap;
    });

    const updateRowList = (list: CompetitionStudentRow[]) => {
      const exists = list.some(r => String(r.id).trim() === studentIdClean);
      const baseList = exists
        ? list
        : [
            ...list,
            {
              id: targetStudent.id,
              name: targetStudent.name,
              className: targetStudent.className,
              group: targetStudent.group,
              note: targetStudent.note,
              weeklyScores: {},
              weeklyDetails: {},
              totalScore: 0
            }
          ];

      return baseList.map(r => {
        if (String(r.id).trim() !== studentIdClean) return r;
        const updatedWeekly = {
          ...r.weeklyScores,
          [wkKey]: isClearing ? null : newNumericScore
        };
        const updatedDetails = {
          ...(r.weeklyDetails || {}),
          [wkKey]: isClearing ? '' : newCellDetailString
        };
        let newTotal = 0;
        for (let w = 1; w <= 35; w++) {
          const val = updatedWeekly[`Tuan_${w}`];
          if (val !== null && val !== undefined && !isNaN(Number(val))) {
            newTotal += Number(val);
          }
        }
        return {
          ...r,
          weeklyScores: updatedWeekly,
          weeklyDetails: updatedDetails,
          totalScore: newTotal
        };
      });
    };

    const nextRows = updateRowList(mergedRows);
    setCompetitionRows(nextRows);
    localStorage.setItem('cached_competition_all', JSON.stringify(nextRows));
    window.dispatchEvent(new CustomEvent('app_data_updated', { detail: { selectedWeek: weekNum } }));

    // Hiển thị thông báo thành công tức thì (không bắt người dùng chờ mạng)
    showToast(successToastMessage);

    // 2. Đưa lệnh ghi/xóa vào hàng đợi đồng bộ 2 chiều tốc độ cao lên Sheet 03_THI_DUA_35_TUAN
    const scorePayloadValue = isClearing
      ? ''
      : isScriptUpdatedForDetails
      ? newCellDetailString
      : (newNumericScore ?? '');

    queueWeekScoreUpdateToSheet03(
      targetStudent.id,
      weekNum,
      scorePayloadValue,
      isClearing ? '' : newCellDetailString,
      isClearing ? null : newNumericScore
    );
  };

  // Xóa toàn bộ hành vi & điểm của học sinh trong tuần hiện tại (Đồng bộ 2 chiều lên Sheet 03)
  const handleClearStudentWeekOnSheet03 = async (
    targetStudent: CompetitionStudentRow,
    weekNum: number = selectedWeek
  ) => {
    if (!canEnterCompetition) {
      showToast('⚠️ Chỉ tài khoản Admin cao cấp, GVCN và Tổ trưởng mới có quyền xóa điểm thi đua!');
      return;
    }
    if (!isSuperAdminOrTeacherUser && leaderManagedGroup) {
      const sGroup = (targetStudent.group || '').toLowerCase();
      const lGroup = leaderManagedGroup.toLowerCase();
      if (!sGroup.includes(lGroup) && sGroup !== lGroup) {
        showToast(`⚠️ Bạn là Tổ trưởng ${leaderManagedGroup}, chỉ có quyền thao tác trên thành viên ${leaderManagedGroup}!`);
        return;
      }
    }

    await applyStudentWeekUpdateLocallyAndSyncSheet03(
      targetStudent,
      weekNum,
      '',
      null,
      `🗑️ Đã xóa hành vi & điểm Tuần ${weekNum} của ${targetStudent.name} trên App và Sheet 03!`
    );
  };

  // Xóa 1 hành vi cụ thể (điểm cộng hoặc điểm trừ) trong tuần của học sinh và cập nhật lại Sheet 03
  const handleRemoveSingleBehaviorChip = async (
    targetStudent: CompetitionStudentRow,
    weekNum: number,
    chipIndexToRemove: number
  ) => {
    if (!canEnterCompetition) {
      showToast('⚠️ Chỉ tài khoản Admin cao cấp, GVCN và Tổ trưởng mới có quyền chỉnh sửa điểm thi đua!');
      return;
    }
    if (!isSuperAdminOrTeacherUser && leaderManagedGroup) {
      const sGroup = (targetStudent.group || '').toLowerCase();
      const lGroup = leaderManagedGroup.toLowerCase();
      if (!sGroup.includes(lGroup) && sGroup !== lGroup) {
        showToast(`⚠️ Bạn là Tổ trưởng ${leaderManagedGroup}, chỉ có quyền thao tác trên thành viên ${leaderManagedGroup}!`);
        return;
      }
    }

    const wkKey = `Tuan_${weekNum}`;
    const parsed = parseWeekCellDetail(
      targetStudent.weeklyDetails?.[wkKey],
      targetStudent.weeklyScores[wkKey]
    );
    if (!parsed.hasRecord || parsed.behaviorItems.length <= 1) {
      await handleClearStudentWeekOnSheet03(targetStudent, weekNum);
      return;
    }

    const removedChip = parsed.behaviorItems[chipIndexToRemove];
    const remainingChips = parsed.behaviorItems.filter((_, idx) => idx !== chipIndexToRemove);
    const newPlus = remainingChips
      .filter(c => c.points > 0)
      .reduce((acc, c) => acc + c.points, 0);
    const newMinus = remainingChips
      .filter(c => c.points < 0)
      .reduce((acc, c) => acc + c.points, 0);
    const newTotal = DEFAULT_WEEK_BASE_SCORE + newPlus + newMinus;
    const newBehaviorsText = remainingChips.map(c => c.rawItem).join(', ');
    const newFormatted = formatWeekCellDetail(newBehaviorsText, newPlus, newMinus, newTotal);

    await applyStudentWeekUpdateLocallyAndSyncSheet03(
      targetStudent,
      weekNum,
      newFormatted,
      newTotal,
      `Đã xóa hành vi "${removedChip?.label || ''}" và cập nhật Sheet 03 (Tuần ${weekNum} - ${targetStudent.name})!`
    );
  };

  // ============================================================================
  // XỬ LÝ NÚT "NHẬP THI ĐUA"
  // ============================================================================
  const handleOpenEntryModal = (preselectedStudent?: CompetitionStudentRow) => {
    if (!canEnterCompetition) {
      showToast('⚠️ Chỉ tài khoản Admin cao cấp, GVCN và Tổ trưởng mới có quyền nhập điểm thi đua!');
      return;
    }

    if (leaderManagedGroup) {
      // Tổ trưởng chỉ được nhập điểm cho tổ của mình
      if (preselectedStudent) {
        const stuGroup = (preselectedStudent.group || '').toLowerCase();
        const lGroup = leaderManagedGroup.toLowerCase();
        if (!stuGroup.includes(lGroup) && stuGroup !== lGroup) {
          showToast(`⚠️ Bạn là Tổ trưởng ${leaderManagedGroup}, chỉ có quyền nhập điểm cho thành viên ${leaderManagedGroup}!`);
          return;
        }
      }

      setSelectedGroup(leaderManagedGroup);
      setEntryGroup(leaderManagedGroup);
      if (preselectedStudent) {
        setEntryStudentId(preselectedStudent.id);
      } else {
        const members = mergedRows.filter(r =>
          (r.group || '').toLowerCase().includes(leaderManagedGroup.toLowerCase())
        );
        setEntryStudentId(members[0]?.id || '');
      }
    } else {
      // Admin cao cấp hoặc GVCN: Được quyền chọn bất kỳ tổ nào
      if (preselectedStudent) {
        const stuGroup = preselectedStudent.group || 'Tổ 1';
        setSelectedGroup(stuGroup);
        setEntryGroup(stuGroup);
        setEntryStudentId(preselectedStudent.id);
      } else {
        const targetGroup =
          selectedGroup !== 'Tất cả' ? selectedGroup : 'Tổ 1';

        setSelectedGroup(targetGroup);
        setEntryGroup(targetGroup);

        const membersInTargetGroup = mergedRows.filter(r =>
          (r.group || '').toLowerCase().includes(targetGroup.toLowerCase())
        );
        setEntryStudentId(membersInTargetGroup[0]?.id || '');
      }
    }

    setBehaviorCounts({});
    setCustomPlusPoints('');
    setCustomMinusPoints('');
    setScoreSaveMode('add_to_current');
    setIsEntryModalOpen(true);
  };

  const entryGroupMembers = useMemo(() => {
    return mergedRows.filter(r =>
      (r.group || '').toLowerCase().includes(entryGroup.toLowerCase())
    );
  }, [mergedRows, entryGroup]);

  const handleEntryGroupChange = (newGrp: string) => {
    if (!isSuperAdminOrTeacherUser && leaderManagedGroup) {
      showToast(`⚠️ Bạn là Tổ trưởng ${leaderManagedGroup}, không thể chuyển sang tổ khác!`);
      return;
    }
    setEntryGroup(newGrp);
    setSelectedGroup(newGrp);
    const members = mergedRows.filter(r =>
      (r.group || '').toLowerCase().includes(newGrp.toLowerCase())
    );
    setEntryStudentId(members[0]?.id || '');
    setBehaviorCounts({});
    setCustomPlusPoints('');
    setCustomMinusPoints('');
  };

  const currentEntryStudent = useMemo(() => {
    return (
      entryGroupMembers.find(m => String(m.id).trim() === String(entryStudentId).trim()) ||
      entryGroupMembers[0] ||
      null
    );
  }, [entryGroupMembers, entryStudentId]);

  const plusBehaviorRules = useMemo(
    () => behaviorRules.filter(b => b.type === 'PLUS' || b.points > 0),
    [behaviorRules]
  );
  const minusBehaviorRules = useMemo(
    () => behaviorRules.filter(b => b.type === 'MINUS' || b.points < 0),
    [behaviorRules]
  );

  const adjustBehaviorCount = (ruleId: string, delta: number) => {
    setBehaviorCounts(prev => {
      const current = prev[ruleId] || 0;
      const next = Math.max(0, current + delta);
      const copy = { ...prev };
      if (next === 0) {
        delete copy[ruleId];
      } else {
        copy[ruleId] = next;
      }
      return copy;
    });
  };

  // Phân tích dữ liệu cũ đã có trong tuần của học sinh đang chọn
  const existingParsedWeek = useMemo((): ParsedWeekDetail => {
    if (!currentEntryStudent) {
      return {
        hasRecord: false,
        behaviorsText: '',
        behaviorItems: [],
        plusPoints: 0,
        minusPoints: 0,
        totalPoints: null,
        rawText: ''
      };
    }
    const wkKey = `Tuan_${selectedWeek}`;
    const rawDetail = currentEntryStudent.weeklyDetails?.[wkKey] || '';
    const rawNum = currentEntryStudent.weeklyScores[wkKey];
    return parseWeekCellDetail(rawDetail, rawNum);
  }, [currentEntryStudent, selectedWeek]);

  // Tính chi tiết Hành vi, Điểm Cộng, Điểm Trừ, Điểm Tổng vừa chọn
  const {
    newBehaviorsListText,
    totalPlusSelected,
    totalMinusSelected,
    activeWarnings
  } = useMemo(() => {
    let plusSum = 0;
    let minusSum = 0;
    const behaviorParts: string[] = [];
    const warnings: BehaviorRuleItem[] = [];

    Object.entries(behaviorCounts).forEach(([ruleId, rawCount]) => {
      const count = Number(rawCount) || 0;
      if (count <= 0) return;
      const rule = behaviorRules.find(b => b.id === ruleId);
      if (!rule) return;
      const pts = Number(rule.points) * count;
      if (pts > 0) plusSum += pts;
      else minusSum += pts;

      const ptsLabel = pts > 0 ? `+${pts}đ` : `${pts}đ`;
      const warnTag = rule.isWarning ? ' [Cảnh báo]' : '';
      if (count > 1) {
        behaviorParts.push(`${rule.behavior} (x${count}: ${ptsLabel})${warnTag}`);
      } else {
        behaviorParts.push(`${rule.behavior} (${ptsLabel})${warnTag}`);
      }

      if (rule.isWarning) warnings.push(rule);
    });

    const extraPlus = Number(customPlusPoints);
    if (!isNaN(extraPlus) && extraPlus > 0) {
      const p = Math.abs(extraPlus);
      plusSum += p;
      behaviorParts.push(`Điểm cộng khác (+${p}đ)`);
    }

    const extraMinus = Number(customMinusPoints);
    if (!isNaN(extraMinus) && extraMinus !== 0) {
      const m = Math.abs(extraMinus);
      minusSum -= m;
      behaviorParts.push(`Điểm trừ khác (-${m}đ)`);
    }

    return {
      newBehaviorsListText: behaviorParts.join(', '),
      totalPlusSelected: plusSum,
      totalMinusSelected: minusSum,
      activeWarnings: warnings
    };
  }, [behaviorCounts, behaviorRules, customPlusPoints, customMinusPoints]);

  // Kết hợp thành chuỗi đầy đủ để ghi vào Sheet 03_THI_DUA_35_TUAN
  const finalSheet03CellPayload = useMemo(() => {
    const isAddMode = scoreSaveMode === 'add_to_current' && existingParsedWeek.hasRecord;

    const finalPlus = isAddMode
      ? existingParsedWeek.plusPoints + totalPlusSelected
      : totalPlusSelected;

    const finalMinus = isAddMode
      ? existingParsedWeek.minusPoints + totalMinusSelected
      : totalMinusSelected;

    // Điểm tổng tuần = 100 điểm mặc định + Điểm cộng + Điểm trừ
    const finalTotal = DEFAULT_WEEK_BASE_SCORE + finalPlus + finalMinus;

    let combinedBehaviors = newBehaviorsListText;
    if (isAddMode && existingParsedWeek.behaviorsText) {
      if (newBehaviorsListText) {
        combinedBehaviors = `${existingParsedWeek.behaviorsText}, ${newBehaviorsListText}`;
      } else {
        combinedBehaviors = existingParsedWeek.behaviorsText;
      }
    }

    const formattedString = formatWeekCellDetail(
      combinedBehaviors,
      finalPlus,
      finalMinus,
      finalTotal
    );

    return {
      behaviorsText: combinedBehaviors || 'Chưa chọn hành vi',
      finalPlus,
      finalMinus,
      finalTotal,
      formattedString
    };
  }, [
    scoreSaveMode,
    existingParsedWeek,
    totalPlusSelected,
    totalMinusSelected,
    newBehaviorsListText
  ]);

  // Lưu chi tiết (Hành vi + Điểm cộng + Điểm trừ + Điểm tổng) vào Sheet 03 theo đúng tuần hiện tại
  const handleSaveEntryToSheet03 = async (keepModalOpenForNext = false) => {
    if (!canEnterCompetition) {
      showToast('⚠️ Chỉ tài khoản Admin cao cấp, GVCN và Tổ trưởng mới có quyền nhập điểm thi đua!');
      return;
    }

    if (!currentEntryStudent) {
      showToast('Vui lòng chọn Tên thành viên trong tổ!');
      return;
    }

    // Tổ trưởng chỉ được nhập điểm cho thành viên thuộc tổ của mình
    if (!isSuperAdminOrTeacherUser && leaderManagedGroup) {
      const sGroup = (currentEntryStudent.group || '').toLowerCase();
      const lGroup = leaderManagedGroup.toLowerCase();
      if (!sGroup.includes(lGroup) && sGroup !== lGroup) {
        showToast(`⚠️ Bạn là Tổ trưởng ${leaderManagedGroup}, chỉ có quyền nhập điểm cho thành viên ${leaderManagedGroup}!`);
        return;
      }
    }

    if (
      !newBehaviorsListText &&
      totalPlusSelected === 0 &&
      totalMinusSelected === 0 &&
      scoreSaveMode === 'add_to_current'
    ) {
      showToast('Vui lòng tích chọn ít nhất 1 hành vi Điểm Cộng hoặc Điểm Trừ!');
      return;
    }

    const targetStudent = currentEntryStudent;
    const weekNum = selectedWeek;
    const cellStringToSave = finalSheet03CellPayload.formattedString;
    const numericTotal = finalSheet03CellPayload.finalTotal;

    await applyStudentWeekUpdateLocallyAndSyncSheet03(
      targetStudent,
      weekNum,
      cellStringToSave,
      numericTotal,
      `✅ Đã lưu vào Sheet 03 (Tuần ${weekNum} - ${targetStudent.name}): ${cellStringToSave}`
    );

    if (keepModalOpenForNext) {
      setBehaviorCounts({});
      setCustomPlusPoints('');
      setCustomMinusPoints('');
    } else {
      setIsEntryModalOpen(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in max-w-7xl mx-auto">
      {/* Toast thông báo đồng bộ 2 chiều */}
      {toastMsg && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:bottom-6 sm:right-6 z-50 bg-[#14532d] text-white text-xs sm:text-sm font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-emerald-400 sm:max-w-lg">
          <span className="line-clamp-2">{toastMsg}</span>
        </div>
      )}

      {/* HỘP CẢNH BÁO & HƯỚNG DẪN NẾU GOOGLE APPS SCRIPT TRÊN SHEET CHƯA ĐƯỢC CẬP NHẬT LÊN BẢN 2.3 */}
      {!isScriptUpdatedForDetails && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-950 font-extrabold text-sm sm:text-base">
                <span>⚡</span>
                <span>
                  Cập nhật mã Google Apps Script (Bản 2.3) để Sheet 03 lưu chi tiết: Hành vi, Điểm cộng, Điểm trừ, Điểm tổng
                </span>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed">
                Hiện tại Google Sheet của Thầy/Cô đang chạy mã Apps Script bản đầu (<b>v2.1</b> có lệnh <code>Number(score)</code> nên chỉ cho phép ghi con số như <code>3</code> vào ô tuần). Để ô tuần trên <b>Sheet 03</b> ghi đầy đủ dòng chữ <code>Hành vi: Phát biểu (+3đ) | Điểm cộng: +3đ | Điểm trừ: 0đ | Điểm tổng: +3đ</code>, Thầy/Cô bấm nút <b>Copy mã Code.gs mới</b> bên phải và cập nhật vào Apps Script nhé!
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={handleCopyAppsScriptCode}
                className="px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs sm:text-sm shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>📋</span>
                <span>Copy mã Code.gs mới (v2.3)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowScriptUpgradeGuide(!showScriptUpgradeGuide)}
                className="px-3.5 py-2.5 rounded-2xl bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold text-xs cursor-pointer"
              >
                {showScriptUpgradeGuide ? 'Ẩn hướng dẫn' : 'Xem 2 bước cập nhật'}
              </button>
            </div>
          </div>

          {showScriptUpgradeGuide && (
            <div className="pt-3 border-t border-amber-200/80 space-y-3 text-xs text-amber-950">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-white border border-amber-200 space-y-1">
                  <div className="font-extrabold text-emerald-800">
                    Cách 1: Cập nhật trên link hiện tại (Khuyên dùng - 30 giây)
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700">
                    <li>Mở Google Sheet &rarr; <b>Tiện ích mở rộng</b> &rarr; <b>Apps Script</b>.</li>
                    <li>Xóa mã cũ trong <code>Code.gs</code>, dán mã vừa Copy vào và bấm <b>Lưu (💾)</b>.</li>
                    <li>
                      Bấm <b>Triển khai (Deploy)</b> &rarr; <b>Quản lý nội dung triển khai (Manage deployments)</b> &rarr; Bấm biểu tượng cây bút <b>✏️ (Chỉnh sửa)</b> &rarr; Ở mục <i>Phiên bản</i> chọn <b>Phiên bản mới (New version)</b> &rarr; Bấm <b>Triển khai</b>.
                    </li>
                  </ol>
                </div>

                <div className="p-3 rounded-2xl bg-white border border-amber-200 space-y-2">
                  <div className="font-extrabold text-emerald-800">
                    Cách 2: Nếu Thầy/Cô bấm "Nội dung triển khai mới" (Tạo link Web App mới)
                  </div>
                  <p className="text-slate-600">
                    Nếu Thầy/Cô chọn <i>Nội dung triển khai mới</i> và nhận được một URL Web App mới (<code>https://script.google.com/macros/s/.../exec</code>), hãy dán vào đây:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customScriptUrlInput}
                      onChange={e => setCustomScriptUrlInput(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-mono text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setGoogleScriptUrl(customScriptUrlInput);
                        showToast('Đã lưu URL Web App mới và đang đồng bộ chi tiết lên Sheet 03...');
                        fetchAllCompetitionData(true, false);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer shrink-0"
                    >
                      Lưu & Đồng bộ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 1. THẺ THỐNG KÊ THI ĐUA THỰC TẾ THEO CÁC TỔ & TOÀN LỚP */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
        {/* Thẻ Tất Cả (Toàn lớp) */}
        <button
          type="button"
          onClick={() => setSelectedGroup('Tất cả')}
          className={`col-span-2 sm:col-span-1 text-left p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border transition-all cursor-pointer ${
            selectedGroup === 'Tất cả'
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-md'
              : 'bg-white text-slate-800 border-gray-200/90 hover:border-emerald-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-1 sm:mb-1.5">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                selectedGroup === 'Tất cả' ? 'text-emerald-100' : 'text-slate-500'
              }`}
            >
              Toàn Lớp {displayClassName}
            </span>
            <span
              className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
                selectedGroup === 'Tất cả'
                  ? 'bg-emerald-800 text-emerald-100'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {mergedRows.length} HS
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 flex-wrap">
            <span className="text-xl sm:text-2xl font-black tracking-tight">
              {formatAvgScore(
                mergedRows.length > 0
                  ? groupStats.reduce((acc, g) => acc + g.weekTotal, 0) / mergedRows.length
                  : DEFAULT_WEEK_BASE_SCORE
              )}{' '}
              đ
            </span>
            <span
              className={`text-[11px] font-semibold ${
                selectedGroup === 'Tất cả' ? 'text-emerald-100' : 'text-slate-500'
              }`}
            >
              ({groupStats.reduce((acc, g) => acc + g.weekTotal, 0)}đ / {mergedRows.length} HS)
            </span>
          </div>
          <div
            className={`text-[11px] mt-1 font-medium ${
              selectedGroup === 'Tất cả' ? 'text-emerald-100' : 'text-slate-400'
            }`}
          >
            TB tích lũy:{' '}
            <b>
              {formatAvgScore(
                mergedRows.length > 0
                  ? groupStats.reduce((acc, g) => acc + g.yearTotal, 0) / mergedRows.length
                  : DEFAULT_WEEK_BASE_SCORE
              )}
              đ
            </b>{' '}
            ({groupStats.reduce((acc, g) => acc + g.weekDelta, 0) >= 0
              ? `+${groupStats.reduce((acc, g) => acc + g.weekDelta, 0)}`
              : groupStats.reduce((acc, g) => acc + g.weekDelta, 0)}
            đ)
          </div>
        </button>

        {/* Thẻ các Tổ thi đua (Hiển thị đầy đủ số tổ từ Google Sheet) */}
        {groupStats.map(g => {
          const isSelected = selectedGroup === g.groupName;
          const isMyManagedGroup = leaderManagedGroup === g.groupName;
          const rankBadge =
            g.rank === 1
              ? '🥇 Hạng 1'
              : g.rank === 2
              ? '🥈 Hạng 2'
              : g.rank === 3
              ? '🥉 Hạng 3'
              : `Hạng ${g.rank}`;

          return (
            <button
              key={g.groupName}
              type="button"
              onClick={() => setSelectedGroup(g.groupName)}
              className={`text-left p-3 sm:p-4 rounded-2xl sm:rounded-3xl border transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-[#047857] text-white border-[#047857] shadow-md'
                  : 'bg-white text-slate-800 border-gray-200/90 hover:border-emerald-300 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1 sm:mb-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="font-extrabold text-xs sm:text-sm truncate">{g.groupName}</span>
                  {isMyManagedGroup && (
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        isSelected ? 'bg-amber-400 text-slate-900' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      Tổ bạn
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : g.rank === 1
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {rankBadge}
                </span>
              </div>
              <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap">
                <span
                  className={`text-lg sm:text-2xl font-black ${
                    isSelected
                      ? 'text-white'
                      : g.weekAvg > DEFAULT_WEEK_BASE_SCORE
                      ? 'text-emerald-600'
                      : g.weekAvg < DEFAULT_WEEK_BASE_SCORE
                      ? 'text-red-600'
                      : 'text-slate-800'
                  }`}
                >
                  {formatAvgScore(g.weekAvg)} đ
                </span>
                <span className={`text-[10px] sm:text-[11px] font-semibold ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                  ({g.weekTotal}đ/{g.memberCount}HS)
                </span>
              </div>
              <div
                className={`text-[10px] sm:text-[11px] mt-1 flex items-center justify-between gap-1 ${
                  isSelected ? 'text-emerald-100' : 'text-slate-500'
                }`}
              >
                <span className="truncate">
                  TB năm: <b>{formatAvgScore(g.yearAvg)}đ</b> ({g.weekDelta >= 0 ? `+${g.weekDelta}` : g.weekDelta}đ)
                </span>
                {g.warningCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-red-500 text-white text-[10px] font-bold shrink-0">
                    ⚠️ {g.warningCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. THANH CÔNG CỤ TÌM KIẾM, NÚT "NHẬP THI ĐUA", CHỌN TUẦN & LỌC TỔ */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-gray-200/80 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          {/* Hàng đầu trên điện thoại: Nút Nhập Thi Đua + Chọn Tuần */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!canEnterCompetition) {
                  showToast('⚠️ Chỉ tài khoản Admin cao cấp, GVCN và Tổ trưởng mới có quyền nhập điểm thi đua!');
                  return;
                }
                handleOpenEntryModal();
              }}
              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition-all shrink-0 ${
                canEnterCompetition
                  ? 'bg-[#f6f6ec] hover:bg-[#ebebdf] active:scale-95 text-slate-800 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
              title={
                canEnterCompetition
                  ? (leaderManagedGroup ? `Nhập thi đua cho ${leaderManagedGroup}` : 'Nhập Thi Đua')
                  : 'Chỉ tài khoản Admin cao cấp, GVCN và Tổ trưởng mới có quyền nhập điểm thi đua'
              }
            >
              <span className="text-base leading-none">{canEnterCompetition ? '✍️' : '🔒'}</span>
              <span className={canEnterCompetition ? 'text-[#f80a2a]' : 'text-slate-400'}>Nhập Thi Đua</span>
              {leaderManagedGroup && (
                <span className="bg-emerald-100 text-emerald-800 text-[11px] px-2 py-0.5 rounded-lg font-bold">
                  {leaderManagedGroup}
                </span>
              )}
              {!canEnterCompetition && (
                <span className="bg-slate-200 text-slate-500 text-[10px] px-1.5 py-0.5 rounded-md font-bold">
                  Chỉ GVCN / Tổ trưởng
                </span>
              )}
            </button>

            <select
              value={selectedWeek}
              onChange={e => {
                setSelectedWeek(Number(e.target.value));
                if (viewMode === 'rules') setViewMode('week');
              }}
              className="sm:hidden px-3 py-2.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer shrink-0"
            >
              {Array.from({ length: 35 }, (_, idx) => idx + 1).map(w => (
                <option key={w} value={w}>
                  📅 Tuần {w}
                </option>
              ))}
            </select>
          </div>

          {/* Ô tìm kiếm */}
          <div className="relative flex-1 w-full sm:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Tìm tên HS, mã HS, hành vi..."
              className="w-full pl-10 pr-8 py-2 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200/90 rounded-2xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Chọn Tuần hiện tại (Tuần 1 -> Tuần 35) & Chế độ xem */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedWeek}
              onChange={e => {
                setSelectedWeek(Number(e.target.value));
                if (viewMode === 'rules') setViewMode('week');
              }}
              className="hidden sm:block px-3.5 py-2 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-xs sm:text-sm font-bold text-[#f30915] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
            >
              {Array.from({ length: 35 }, (_, idx) => idx + 1).map(w => (
                <option key={w} value={w}>
                  📅 Tuần {w}
                </option>
              ))}
            </select>

            <div className="bg-slate-100 p-1 rounded-2xl grid grid-cols-3 sm:flex items-center gap-1 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer text-center ${
                  viewMode === 'week'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo tuần
              </button>
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                className={`px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer text-center text-[#a006a0] ${
                  viewMode === 'matrix'
                    ? 'bg-white shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                Bảng 35 tuần
              </button>
              <button
                type="button"
                onClick={() => setViewMode('rules')}
                className={`px-2 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold transition cursor-pointer text-center ${
                  viewMode === 'rules'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Quy định (Sheet 04)
              </button>
            </div>
          </div>
        </div>

        {/* Bên phải: Nút lọc đầy đủ các Tổ từ Google Sheet (Tổ 1..Tổ 8, Tất cả) + Nút Đồng bộ 2 chiều */}
        <div className="flex items-center gap-2 w-full xl:w-auto overflow-hidden">
          <div className="bg-[#44586c] p-1 rounded-2xl flex items-center gap-1 shadow-inner overflow-x-auto no-scrollbar flex-1 xl:flex-initial max-w-full">
            {groupFilters.map((filter, fIdx) => {
              const isAll = filter === 'Tất cả' || filter === 'Tất cả tổ';
              const isSelected =
                selectedGroup === filter ||
                (isAll && (selectedGroup === 'Tất cả' || selectedGroup === 'Tất cả tổ'));

              // Bảng màu rực rỡ riêng cho từng Tổ (Tổ 1 đến Tổ 8)
              const groupBgs = [
                'bg-[#d2f007]', // Tổ 1: Vàng chanh
                'bg-[#a4f119]', // Tổ 2: Xanh chuối
                'bg-[#56e8da]', // Tổ 3: Xanh lơ
                'bg-[#d8a6e1]', // Tổ 4: Tím phấn
                'bg-[#fed7aa]', // Tổ 5: Cam nhạt
                'bg-[#a7f3d0]', // Tổ 6: Xanh ngọc
                'bg-[#c7d2fe]', // Tổ 7: Lam nhạt
                'bg-[#fbcfe8]', // Tổ 8: Hồng phấn
              ];

              const btnBgStyle = isAll
                ? 'bg-[#04edc7]'
                : (groupBgs[fIdx % groupBgs.length] || 'bg-slate-200');

              const labelStyle = isAll
                ? 'text-[#f0091c] bg-[#fbf3f3]'
                : (fIdx === 1 ? 'bg-[#f9f1f1] text-[#f6030b]' : 'text-[#f6030b]');

              const countStyle = fIdx === 0
                ? 'text-[#0a6bf2] bg-[#f7f7f9]'
                : isSelected
                ? 'bg-emerald-50 text-[#047857]'
                : 'text-slate-600 font-bold';

              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setSelectedGroup(filter)}
                  className={`shrink-0 px-2.5 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer whitespace-nowrap text-center ${btnBgStyle} ${
                    isSelected ? 'ring-2 ring-emerald-600 shadow-xs' : 'hover:opacity-90'
                  }`}
                >
                  <span className={`px-1.5 py-0.5 rounded-lg ${labelStyle}`}>{filter}</span>
                  <span
                    className={`ml-1 text-[10px] sm:text-[11px] px-1.5 py-0.2 rounded-full font-bold ${countStyle}`}
                  >
                    {countByGroup(filter)}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => fetchAllCompetitionData(true, false)}
            disabled={isLoading}
            className="p-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0"
            title="Đồng bộ 2 chiều ngay lập tức với Google Sheet (Sheet 02, 03, 04)"
          >
            <span className={isLoading ? 'animate-spin inline-block' : ''}>🔄</span>
            <span className="hidden lg:inline">
              {isLoading ? 'Đang đồng bộ...' : 'Đồng bộ 2 chiều'}
            </span>
          </button>
        </div>
      </div>

      {/* Thông tin trạng thái hiển thị */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1.5 sm:px-2 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <span>Đang xem:</span>
          <b className="text-[#f30b2b] font-bold">
            {selectedGroup === 'Tất cả'
              ? `Tất cả (${filteredRows.length} HS)`
              : `${selectedGroup} (${filteredRows.length} HS)`}
          </b>
          <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 sm:px-2.5 py-0.5 rounded-md border border-emerald-200/60 text-[11px] sm:text-xs">
            Tuần {selectedWeek} • Mặc định 100đ/tuần (+ Cộng / − Trừ)
          </span>
        </div>
        {lastSyncTime && (
          <div className="text-[11px] text-slate-400">
            Đồng bộ: {lastSyncTime}
          </div>
        )}
      </div>

      {/* 3. NỘI DUNG BẢNG THI ĐUA */}
      {viewMode === 'rules' ? (
        /* CHẾ ĐỘ XEM DANH MỤC HÀNH VI TỪ SHEET 04_THI_DUA */
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                📋 Danh Mục Hành Vi Thi Đua (Đồng bộ 2 chiều từ Sheet 04_THI_DUA)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tổng cộng {behaviorRules.length} quy định hành vi ({plusBehaviorRules.length} điểm cộng, {minusBehaviorRules.length} điểm trừ)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer self-start sm:self-auto"
            >
              ← Quay lại bảng thi đua
            </button>
          </div>

          {/* Giao diện thẻ trên điện thoại cho Sheet 04 */}
          <div className="md:hidden divide-y divide-gray-100">
            {behaviorRules.map((rule, idx) => (
              <div
                key={rule.id || idx}
                className={`p-3.5 flex items-center justify-between gap-3 ${
                  rule.isWarning ? 'bg-red-50/30' : ''
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-xs sm:text-sm leading-snug">
                      {rule.behavior}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          rule.type === 'PLUS'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {rule.category}
                      </span>
                      {rule.isWarning && (
                        <span className="text-red-600 font-extrabold text-[11px] bg-red-100 px-2 py-0.5 rounded-full">
                          ⚠️ {rule.note || 'Cảnh Báo'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <span
                  className={`font-mono font-extrabold text-xs px-2.5 py-1 rounded-xl shrink-0 ${
                    rule.points > 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : rule.isWarning
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {rule.points > 0 ? `+${rule.points}` : rule.points}đ
                </span>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 text-center w-14">STT</th>
                  <th className="py-3.5 px-4">Hành vi (Hanh_vi)</th>
                  <th className="py-3.5 px-4">Phân loại (Phan_Loai)</th>
                  <th className="py-3.5 px-4 text-center">Điểm (Diem)</th>
                  <th className="py-3.5 px-4">Ghi Chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {behaviorRules.map((rule, idx) => (
                  <tr
                    key={rule.id || idx}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      rule.isWarning ? 'bg-red-50/30' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-center text-xs text-slate-400 font-semibold">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{rule.behavior}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          rule.type === 'PLUS'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {rule.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`font-mono font-extrabold text-sm px-2.5 py-1 rounded-xl ${
                          rule.points > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : rule.isWarning
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {rule.points > 0 ? `+${rule.points}` : rule.points}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {rule.isWarning ? (
                        <span className="text-red-600 font-extrabold text-xs sm:text-sm">
                          {rule.note || 'Cảnh Báo'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">{rule.note || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'matrix' ? (
        /* CHẾ ĐỘ XEM BẢNG MA TRẬN 35 TUẦN (SHEET 03_THI_DUA_35_TUAN) */
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-[11px] font-bold text-slate-600 uppercase">
                  <th className="py-3 px-2.5 sm:px-3 sticky left-0 bg-slate-50 z-10 border-r border-gray-200 max-w-[135px] sm:max-w-none">
                    Họ và Tên
                  </th>
                  <th className="py-3 px-2 sm:px-2.5 text-center border-r border-gray-200">Tổ</th>
                  <th className="py-3 px-2.5 sm:px-3 text-center bg-emerald-50 text-emerald-800 border-r border-gray-200">
                    Tổng
                  </th>
                  {Array.from({ length: 35 }, (_, i) => i + 1).map(w => (
                    <th
                      key={w}
                      onClick={() => {
                        setSelectedWeek(w);
                        setViewMode('week');
                      }}
                      className={`py-3 px-2 text-center min-w-[54px] sm:min-w-[64px] border-r border-gray-100 cursor-pointer hover:bg-emerald-50 transition ${
                        selectedWeek === w ? 'bg-amber-100 text-amber-900' : ''
                      }`}
                      title={`Bấm để chuyển sang Tuần ${w}`}
                    >
                      T{w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row, rIdx) => (
                  <tr key={`${row.id || 'row'}_mat_${rIdx}`} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-2.5 sm:px-3 font-semibold text-slate-900 sticky left-0 bg-white z-10 border-r border-gray-200 max-w-[135px] sm:max-w-none">
                      <div className="truncate">{row.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{row.id}</div>
                    </td>
                    <td className="py-2.5 px-2 sm:px-2.5 text-center border-r border-gray-200 whitespace-nowrap font-bold text-slate-600">
                      {row.group}
                    </td>
                    <td className="py-2.5 px-2.5 sm:px-3 text-center font-extrabold border-r border-gray-200 bg-emerald-50/40">
                      <span
                        className={
                          row.totalScore > 0
                            ? 'text-emerald-700'
                            : row.totalScore < 0
                            ? 'text-red-600'
                            : 'text-slate-600'
                        }
                      >
                        {row.totalScore > 0 ? `+${row.totalScore}` : row.totalScore}
                      </span>
                    </td>
                    {Array.from({ length: 35 }, (_, i) => i + 1).map(w => {
                      const wkKey = `Tuan_${w}`;
                      const val = row.weeklyScores[wkKey];
                      const detailStr = row.weeklyDetails?.[wkKey] || '';
                      const hasVal = val !== null && val !== undefined;
                      const num = hasVal ? Number(val) : DEFAULT_WEEK_BASE_SCORE;
                      return (
                        <td
                          key={w}
                          title={detailStr || `Tuần ${w}: Mặc định 100đ (Chưa phát sinh cộng/trừ)`}
                          onClick={() => {
                            setSelectedWeek(w);
                            setViewMode('week');
                          }}
                          className={`py-2.5 px-2 text-center font-mono border-r border-gray-100 cursor-pointer hover:bg-emerald-50/60 ${
                            hasVal && num <= DEFAULT_WEEK_BASE_SCORE - 50
                              ? 'bg-red-50 text-red-700 font-extrabold'
                              : hasVal && num < DEFAULT_WEEK_BASE_SCORE
                              ? 'text-amber-700 font-bold'
                              : hasVal && num > DEFAULT_WEEK_BASE_SCORE
                              ? 'text-emerald-700 font-bold'
                              : w <= selectedWeek
                              ? 'text-slate-600 font-semibold'
                              : 'text-slate-300'
                          }`}
                        >
                          {hasVal || w <= selectedWeek ? num : '100'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CHẾ ĐỘ XEM THEO TUẦN HIỆN TẠI: BẢNG CHỈ ĐỂ XEM (HÀNH VI, ĐIỂM CỘNG, ĐIỂM TRỪ, ĐIỂM TỔNG) */
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
          {isLoading && filteredRows.length === 0 ? (
            <div className="p-12 sm:p-16 text-center text-slate-500">
              <div className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-sm font-semibold">
                Đang đồng bộ dữ liệu thi đua từ Google Sheet...
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 sm:p-16 text-center text-slate-400">
              <div className="text-4xl mb-2">🏆</div>
              <p className="text-base font-bold text-slate-700 mb-1">
                Không tìm thấy học sinh phù hợp
              </p>
              <p className="text-xs text-slate-400">
                Hãy thử đổi từ khóa tìm kiếm hoặc chọn Tổ khác
              </p>
            </div>
          ) : (
            <>
              {/* GIAO DIỆN THẺ THI ĐUA TRÊN ĐIỆN THOẠI (Hiển thị trực quan đầy đủ thông tin, không cần cuộn ngang) */}
              <div className="md:hidden divide-y divide-gray-100">
                {filteredRows.map((row, index) => {
                  const wkKey = `Tuan_${selectedWeek}`;
                  const parsedWk = parseWeekCellDetail(
                    row.weeklyDetails?.[wkKey],
                    row.weeklyScores[wkKey]
                  );
                  const hasWeekScore = parsedWk.hasRecord;
                  const numWeekScore =
                    parsedWk.totalPoints !== null && parsedWk.totalPoints !== undefined
                      ? Number(parsedWk.totalPoints)
                      : DEFAULT_WEEK_BASE_SCORE;
                  const warningInfo = getStudentWeekWarningInfo(parsedWk, behaviorRules);
                  const isHeavyWarning = hasWeekScore && warningInfo.isWarning;

                  const isLeader =
                    row.note &&
                    (row.note.includes('trưởng') ||
                      row.note.includes('Trưởng') ||
                      row.note.includes('Cán sự'));

                  const groupBadgeColor = row.group.includes('1')
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : row.group.includes('2')
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : row.group.includes('3')
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                  return (
                    <div
                      key={`${row.id || 'row'}_mob_${index}`}
                      className={`p-3.5 transition-colors space-y-2.5 ${
                        isHeavyWarning ? 'bg-red-50/40' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Hàng 1: STT, Họ tên, Tổ, Điểm tổng Tuần */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 font-bold text-xs flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">
                                {row.name}
                              </span>
                              {isLeader && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                  {row.note}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] flex-wrap">
                              <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                                {row.id}
                              </span>
                              <span
                                className={`px-2 py-0.2 rounded-md text-[11px] font-bold border ${groupBadgeColor}`}
                              >
                                {row.group || 'Chưa chia tổ'}
                              </span>
                              {isHeavyWarning && (
                                <span className="px-2 py-0.2 rounded-full bg-red-100 text-red-700 font-extrabold text-[10px]">
                                  ⚠️ Cảnh Báo
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block font-mono font-extrabold text-sm px-2.5 py-1 rounded-xl ${
                              numWeekScore > DEFAULT_WEEK_BASE_SCORE
                                ? 'bg-emerald-100 text-emerald-800'
                                : isHeavyWarning
                                ? 'bg-red-100 text-red-700 border border-red-300'
                                : numWeekScore < DEFAULT_WEEK_BASE_SCORE
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {numWeekScore} đ
                          </span>
                          <div className="text-[10px] text-slate-400 font-semibold mt-0.5">
                            Tuần {selectedWeek}
                          </div>
                        </div>
                      </div>

                      {/* Hàng 2: Danh sách Hành vi trong tuần */}
                      <div className="pl-8">
                        {hasWeekScore ? (
                          <div className="flex flex-wrap gap-1.5">
                            {parsedWk.behaviorItems.map((chip, chipIdx) => (
                              <span
                                key={chipIdx}
                                className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-semibold border ${
                                  chip.points > 0
                                    ? 'bg-emerald-50/90 text-emerald-900 border-emerald-200'
                                    : chip.isWarning
                                    ? 'bg-red-100 text-red-800 border-red-300 font-bold'
                                    : 'bg-amber-50/90 text-amber-900 border-amber-200'
                                }`}
                              >
                                <span>{chip.label}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            Chưa ghi nhận hành vi (Mặc định 100đ)
                          </span>
                        )}
                      </div>

                      {/* Hàng 3: Điểm cộng / Điểm trừ & Tích lũy cả năm */}
                      <div className="pl-8 flex items-center justify-between gap-2 pt-0.5 text-xs">
                        <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-lg border ${
                              parsedWk.plusPoints > 0
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                          >
                            +{parsedWk.plusPoints}đ
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-lg border ${
                              parsedWk.minusPoints < 0
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                          >
                            {parsedWk.minusPoints === 0 ? '0đ' : `${parsedWk.minusPoints}đ`}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500">
                          Tích lũy năm:{' '}
                          <b
                            className={`font-mono font-bold ${
                              row.totalScore > DEFAULT_WEEK_BASE_SCORE
                                ? 'text-emerald-700'
                                : row.totalScore < DEFAULT_WEEK_BASE_SCORE
                                ? 'text-red-600'
                                : 'text-slate-700'
                            }`}
                          >
                            {row.totalScore} đ
                          </b>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* GIAO DIỆN BẢNG TRÊN MÁY TÍNH / TABLET */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-gray-200/90 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-3.5 text-center w-12 text-[#0611f3]">STT</th>
                      <th className="py-3.5 px-3.5 text-[#0611f3]">Mã HS</th>
                      <th className="py-3.5 px-4 text-[#0611f3]">Họ và Tên</th>
                      <th className="py-3.5 px-3 text-[#0611f3]">Tổ</th>
                      <th className="py-3.5 px-4 text-[#0611f3]">Hành vi (Tuần {selectedWeek})</th>
                      <th className="py-3.5 px-3 text-center text-[#0611f3]">Điểm cộng / trừ</th>
                      <th className="py-3.5 px-3.5 text-center text-[#f3061f]">Điểm tổng Tuần {selectedWeek}</th>
                      <th className="py-3.5 px-3.5 text-center text-[#f80933]">Tích lũy cả năm</th>
                      <th className="py-3.5 px-4 text-center text-[#f10114]">Ghi Chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map((row, index) => {
                      const wkKey = `Tuan_${selectedWeek}`;
                      const parsedWk = parseWeekCellDetail(
                        row.weeklyDetails?.[wkKey],
                        row.weeklyScores[wkKey]
                      );
                      const hasWeekScore = parsedWk.hasRecord;
                      const numWeekScore =
                        parsedWk.totalPoints !== null && parsedWk.totalPoints !== undefined
                          ? Number(parsedWk.totalPoints)
                          : DEFAULT_WEEK_BASE_SCORE;
                      const warningInfo = getStudentWeekWarningInfo(parsedWk, behaviorRules);
                      const isHeavyWarning = hasWeekScore && warningInfo.isWarning;

                      const isLeader =
                        row.note &&
                        (row.note.includes('trưởng') ||
                          row.note.includes('Trưởng') ||
                          row.note.includes('Cán sự'));

                      const groupBadgeColor = row.group.includes('1')
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : row.group.includes('2')
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : row.group.includes('3')
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                      return (
                        <tr
                          key={`${row.id || 'row'}_desk_${index}`}
                          className={`hover:bg-slate-50/80 transition-colors duration-100 ${
                            isHeavyWarning ? 'bg-red-50/40' : ''
                          }`}
                        >
                          <td className="py-3.5 px-3.5 text-center text-slate-400 font-medium text-xs">
                            {index + 1}
                          </td>

                          <td className="py-3.5 px-3.5 font-mono font-bold text-slate-700 text-xs whitespace-nowrap">
                            <span className="bg-slate-100 px-2 py-1 rounded-lg">{row.id}</span>
                          </td>

                          <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span>{row.name}</span>
                              {isLeader && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                  {row.note}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold border ${groupBadgeColor}`}
                            >
                              {row.group || 'Chưa chia tổ'}
                            </span>
                          </td>

                          {/* Cột Hành vi cụ thể của Tuần (Chỉ hiển thị để xem) */}
                          <td className="py-3.5 px-4 text-xs max-w-sm">
                            {hasWeekScore ? (
                              <div className="flex flex-wrap gap-1.5">
                                {parsedWk.behaviorItems.map((chip, chipIdx) => (
                                  <span
                                    key={chipIdx}
                                    className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-semibold border ${
                                      chip.points > 0
                                        ? 'bg-emerald-50/90 text-emerald-900 border-emerald-200'
                                        : chip.isWarning
                                        ? 'bg-red-100 text-red-800 border-red-300 font-bold'
                                        : 'bg-amber-50/90 text-amber-900 border-amber-200'
                                    }`}
                                  >
                                    <span>{chip.label}</span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Chưa ghi nhận hành vi</span>
                            )}
                          </td>

                          {/* Cột Điểm cộng / Điểm trừ cụ thể */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 font-mono text-xs font-bold">
                              <span
                                className={`px-2 py-0.5 rounded-lg border ${
                                  parsedWk.plusPoints > 0
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-50 text-slate-400 border-slate-200'
                                }`}
                              >
                                +{parsedWk.plusPoints}đ
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-lg border ${
                                  parsedWk.minusPoints < 0
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-slate-50 text-slate-400 border-slate-200'
                                }`}
                              >
                                {parsedWk.minusPoints === 0 ? '0đ' : `${parsedWk.minusPoints}đ`}
                              </span>
                            </div>
                          </td>

                          {/* Cột Điểm tổng Tuần (Mặc định 100đ + Điểm cộng - Điểm trừ) */}
                          <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                            <span
                              className={`inline-block font-mono font-extrabold text-sm px-3 py-1 rounded-xl ${
                                numWeekScore > DEFAULT_WEEK_BASE_SCORE
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isHeavyWarning
                                  ? 'bg-red-100 text-red-700 border border-red-300'
                                  : numWeekScore < DEFAULT_WEEK_BASE_SCORE
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {numWeekScore} đ
                            </span>
                          </td>

                          {/* Tổng điểm tích lũy cả năm */}
                          <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                            <span
                              className={`font-mono font-bold text-sm ${
                                row.totalScore > DEFAULT_WEEK_BASE_SCORE
                                  ? 'text-emerald-700'
                                  : row.totalScore < DEFAULT_WEEK_BASE_SCORE
                                  ? 'text-red-600'
                                  : 'text-slate-700'
                              }`}
                            >
                              {row.totalScore} đ
                            </span>
                          </td>

                          {/* Cột Ghi Chú cuối bảng: Hiển thị "Cảnh Báo" (text màu đỏ) đối với hành vi vi phạm nặng theo Sheet 04_THI_DUA */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {isHeavyWarning ? (
                              <span
                                className="text-red-600 font-extrabold text-xs sm:text-sm"
                                title={
                                  warningInfo.matchedBehaviors.length > 0
                                    ? `Vi phạm nặng: ${warningInfo.matchedBehaviors.join(', ')}`
                                    : 'Vi phạm nặng theo quy định Sheet 04_THI_DUA'
                                }
                              >
                                Cảnh Báo
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================
          4. CỬA SỔ "NHẬP THI ĐUA" (GHI & XÓA ĐỒNG BỘ 2 CHIỀU VỚI SHEET 03)
         ======================================================================== */}
      {isEntryModalOpen && canEnterCompetition && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-4xl w-full max-h-[94dvh] sm:max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden animate-fade-in">
            {/* Header Modal Nhập Thi Đua */}
            <div className="px-4 py-3 sm:px-6 sm:py-4 bg-bio-700 text-white flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-lg font-extrabold truncate">
                    ✍️ Nhập Thi Đua — {entryGroup}
                  </h3>
                  <span className="bg-white/20 text-white text-[11px] sm:text-xs font-extrabold px-2 sm:px-2.5 py-0.5 rounded-full shrink-0">
                    Tuần {selectedWeek}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-emerald-100 mt-0.5 hidden sm:block">
                  Đồng bộ 2 chiều Hành vi, Điểm cộng, Điểm trừ cụ thể và Điểm tổng vào cột{' '}
                  <b>Tuan_{selectedWeek}</b> trên Sheet 03_THI_DUA_35_TUAN
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEntryModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white font-bold cursor-pointer shrink-0 ml-2"
              >
                ✕
              </button>
            </div>

            {/* Khu vực chọn Tổ, Tuần hiện tại & Tên thành viên trong tổ */}
            <div className="p-3 sm:p-5 bg-slate-50 border-b border-gray-200 space-y-2.5 shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5 sm:gap-3 items-end">
                {/* 1. Tổ quản lý */}
                <div className="col-span-1 md:col-span-3">
                  <label className="block text-[11px] sm:text-xs font-bold text-slate-700 mb-1">
                    Tổ quản lý
                  </label>
                  {leaderManagedGroup ? (
                    <div className="px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl sm:rounded-2xl bg-emerald-100/80 border border-emerald-300 text-emerald-900 font-extrabold text-xs sm:text-sm flex items-center justify-between">
                      <span>{leaderManagedGroup}</span>
                      <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.5 rounded-md">
                        Tổ trưởng
                      </span>
                    </div>
                  ) : (
                    <select
                      value={entryGroup}
                      onChange={e => handleEntryGroupChange(e.target.value)}
                      className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl sm:rounded-2xl bg-white border border-slate-300 text-xs sm:text-sm font-extrabold text-slate-800 focus:outline-none focus:border-emerald-600 cursor-pointer"
                    >
                      {availableGroups.map(grp => (
                        <option key={grp} value={grp}>
                          {grp} ({countByGroup(grp)} HS)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 3. Tuần hiện tại lưu vào Sheet 03 (Đặt cạnh Tổ trên điện thoại để tiết kiệm chiều cao) */}
                <div className="col-span-1 md:col-span-3 md:order-3">
                  <label className="block text-[11px] sm:text-xs font-bold text-slate-700 mb-1">
                    Lưu vào Tuần (Sheet 03)
                  </label>
                  <select
                    value={selectedWeek}
                    onChange={e => setSelectedWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl sm:rounded-2xl bg-amber-50 border border-amber-300 text-xs sm:text-sm font-extrabold text-amber-900 focus:outline-none cursor-pointer"
                  >
                    {Array.from({ length: 35 }, (_, i) => i + 1).map(w => (
                      <option key={w} value={w}>
                        Tuần {w} (Tuan_{w})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Lựa chọn Tên thành viên trong tổ */}
                <div className="col-span-2 md:col-span-6 md:order-2">
                  <label className="block text-[11px] sm:text-xs font-bold text-slate-700 mb-1">
                    Chọn Tên thành viên trong {entryGroup} ({entryGroupMembers.length} học sinh)
                  </label>
                  <select
                    value={currentEntryStudent?.id || ''}
                    onChange={e => {
                      setEntryStudentId(e.target.value);
                      setBehaviorCounts({});
                      setCustomPlusPoints('');
                      setCustomMinusPoints('');
                    }}
                    className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl sm:rounded-2xl bg-white border-2 border-emerald-500 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                  >
                    {entryGroupMembers.length === 0 ? (
                      <option value="">-- Chưa có thành viên trong {entryGroup} --</option>
                    ) : (
                      entryGroupMembers.map((stu, idx) => {
                        const wkVal = stu.weeklyScores[`Tuan_${selectedWeek}`];
                        const wkText =
                          wkVal !== null && wkVal !== undefined
                            ? ` [Tuần ${selectedWeek}: ${wkVal}đ]`
                            : ` [Tuần ${selectedWeek}: ${DEFAULT_WEEK_BASE_SCORE}đ (Mặc định)]`;
                        return (
                          <option key={`${stu.id}_${idx}`} value={stu.id}>
                            {idx + 1}. {stu.name} ({stu.id}){wkText}
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>
              </div>

              {/* Thanh chọn nhanh Tên thành viên trong tổ */}
              {entryGroupMembers.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 pt-0.5">
                  <span className="text-[11px] font-bold text-slate-400 shrink-0 mr-1 hidden sm:inline">
                    Thành viên {entryGroup}:
                  </span>
                  {entryGroupMembers.map((stu, mIdx) => {
                    const isSelectedStu = currentEntryStudent?.id === stu.id;
                    const wkScore = stu.weeklyScores[`Tuan_${selectedWeek}`];
                    const hasSc = wkScore !== null && wkScore !== undefined;
                    const displaySc = hasSc ? Number(wkScore) : DEFAULT_WEEK_BASE_SCORE;
                    return (
                      <button
                        key={`${stu.id}_chip_${mIdx}`}
                        type="button"
                        onClick={() => {
                          setEntryStudentId(stu.id);
                          setBehaviorCounts({});
                          setCustomPlusPoints('');
                          setCustomMinusPoints('');
                        }}
                        className={`px-2.5 sm:px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                          isSelectedStu
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-emerald-50'
                        }`}
                      >
                        <span>{stu.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                            isSelectedStu
                              ? 'bg-white/20 text-white'
                              : displaySc > DEFAULT_WEEK_BASE_SCORE
                              ? 'bg-emerald-100 text-emerald-800'
                              : displaySc < DEFAULT_WEEK_BASE_SCORE
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {displaySc}đ
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* KHU VỰC CUỘN CHÍNH: HÀNH VI HIỆN CÓ + CHỌN ĐIỂM CỘNG & ĐIỂM TRỪ */}
            <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 space-y-3.5 sm:space-y-4">
              {/* HỘP HIỂN THỊ HÀNH VI HIỆN CÓ TRONG TUẦN CỦA HỌC SINH (CHO PHÉP XÓA TỪNG HÀNH VI HOẶC XÓA SẠCH TUẦN) */}
              {currentEntryStudent && existingParsedWeek.hasRecord && (
                <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="space-y-1.5 flex-1">
                    <div className="text-xs font-extrabold text-amber-950 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span>📌 Hành vi hiện có trong Tuần {selectedWeek} của {currentEntryStudent.name}:</span>
                      <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded-lg border border-amber-200 text-slate-700">
                        Mặc định: {DEFAULT_WEEK_BASE_SCORE}đ
                      </span>
                      <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded-lg border border-amber-200 text-emerald-700">
                        +{existingParsedWeek.plusPoints}đ
                      </span>
                      <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded-lg border border-amber-200 text-red-700">
                        {existingParsedWeek.minusPoints === 0 ? '0đ' : `${existingParsedWeek.minusPoints}đ`}
                      </span>
                      <span className="font-mono text-[11px] bg-amber-200/80 px-2 py-0.5 rounded-lg text-amber-950">
                        Tổng: {existingParsedWeek.totalPoints}đ
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {existingParsedWeek.behaviorItems.map((chip, cIdx) => (
                        <span
                          key={cIdx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-800"
                        >
                          <span>{chip.label}</span>
                          <button
                            type="button"
                            disabled={isSavingScore}
                            onClick={() =>
                              handleRemoveSingleBehaviorChip(currentEntryStudent, selectedWeek, cIdx)
                            }
                            title="Xóa hành vi này khỏi Sheet 03"
                            className="w-5 h-5 sm:w-4 sm:h-4 rounded-full bg-red-100 hover:bg-red-600 text-red-700 hover:text-white flex items-center justify-center text-[10px] font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingScore}
                    onClick={() => handleClearStudentWeekOnSheet03(currentEntryStudent, selectedWeek)}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold cursor-pointer shrink-0 flex items-center gap-1 self-start sm:self-center shadow-2xs"
                  >
                    <span>🗑️</span>
                    <span>Xóa sạch Tuần {selectedWeek}</span>
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                {/* CỘT 1: ĐIỂM CỘNG */}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-3 sm:p-3.5 flex flex-col">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-emerald-200/80">
                    <div className="flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-black">
                        +
                      </span>
                      <h4 className="text-xs sm:text-sm font-extrabold text-emerald-950">
                        Điểm Cộng ({plusBehaviorRules.length} hành vi)
                      </h4>
                    </div>
                    <span className="text-xs font-mono font-extrabold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      +{totalPlusSelected} đ
                    </span>
                  </div>

                  <div className="space-y-2 flex-1 md:max-h-60 md:overflow-y-auto md:pr-1">
                    {plusBehaviorRules.map(rule => {
                      const count = behaviorCounts[rule.id] || 0;
                      return (
                        <div
                          key={rule.id}
                          onClick={() => adjustBehaviorCount(rule.id, 1)}
                          className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                            count > 0
                              ? 'bg-emerald-100/90 border-emerald-500 shadow-2xs'
                              : 'bg-white border-gray-200 hover:border-emerald-300'
                          }`}
                        >
                          <div className="text-xs flex-1 min-w-0">
                            <div className="font-bold text-slate-900 leading-snug">{rule.behavior}</div>
                            <span className="text-[11px] font-mono font-bold text-emerald-700">
                              +{rule.points} điểm / lần
                            </span>
                          </div>

                          {count > 0 ? (
                            <div
                              className="flex items-center gap-1.5 shrink-0"
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => adjustBehaviorCount(rule.id, -1)}
                                className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg bg-white border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center justify-center cursor-pointer active:scale-95"
                              >
                                -
                              </button>
                              <span className="text-xs font-mono font-extrabold text-emerald-900 px-1">
                                x{count} (+{rule.points * count}đ)
                              </span>
                              <button
                                type="button"
                                onClick={() => adjustBehaviorCount(rule.id, 1)}
                                className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center cursor-pointer active:scale-95"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-mono font-extrabold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                              +{rule.points}đ
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-emerald-200/70 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-900">
                      Điểm cộng khác (tùy chọn):
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={customPlusPoints}
                      onChange={e => setCustomPlusPoints(e.target.value)}
                      placeholder="+0"
                      className="w-24 px-2.5 py-1.5 sm:py-1 bg-white border border-emerald-300 rounded-xl text-xs font-mono font-bold text-emerald-800 text-center focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                {/* CỘT 2: ĐIỂM TRỪ & CẢNH BÁO */}
                <div className="rounded-2xl border border-red-200 bg-red-50/20 p-3 sm:p-3.5 flex flex-col">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-red-200/80">
                    <div className="flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded-lg bg-red-600 text-white flex items-center justify-center text-xs font-black">
                        −
                      </span>
                      <h4 className="text-xs sm:text-sm font-extrabold text-red-950">
                        Điểm Trừ ({minusBehaviorRules.length} hành vi)
                      </h4>
                    </div>
                    <span className="text-xs font-mono font-extrabold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full">
                      {totalMinusSelected} đ
                    </span>
                  </div>

                  <div className="space-y-2 flex-1 md:max-h-60 md:overflow-y-auto md:pr-1">
                    {minusBehaviorRules.map(rule => {
                      const count = behaviorCounts[rule.id] || 0;
                      return (
                        <div
                          key={rule.id}
                          onClick={() => adjustBehaviorCount(rule.id, 1)}
                          className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                            count > 0
                              ? 'bg-red-100/90 border-red-500 shadow-2xs'
                              : 'bg-white border-gray-200 hover:border-red-300'
                          }`}
                        >
                          <div className="text-xs flex-1 min-w-0">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap leading-snug">
                              <span>{rule.behavior}</span>
                              {rule.isWarning && (
                                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-red-600 text-white">
                                  ⚠️ {rule.note || 'Cảnh báo'}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono font-bold text-red-600">
                              {rule.points} điểm / lần
                            </span>
                          </div>

                          {count > 0 ? (
                            <div
                              className="flex items-center gap-1.5 shrink-0"
                              onClick={e => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => adjustBehaviorCount(rule.id, -1)}
                                className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg bg-white border border-red-300 text-red-800 font-bold text-xs flex items-center justify-center cursor-pointer active:scale-95"
                              >
                                -
                              </button>
                              <span className="text-xs font-mono font-extrabold text-red-900 px-1">
                                x{count} ({rule.points * count}đ)
                              </span>
                              <button
                                type="button"
                                onClick={() => adjustBehaviorCount(rule.id, 1)}
                                className="w-7 h-7 sm:w-6 sm:h-6 rounded-lg bg-red-600 text-white font-bold text-xs flex items-center justify-center cursor-pointer active:scale-95"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-mono font-extrabold px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 shrink-0">
                              {rule.points}đ
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-red-200/70 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-red-900">
                      Điểm trừ khác (tùy chọn):
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={customMinusPoints}
                      onChange={e => setCustomMinusPoints(e.target.value)}
                      placeholder="-0"
                      className="w-24 px-2.5 py-1.5 sm:py-1 bg-white border border-red-300 rounded-xl text-xs font-mono font-bold text-red-700 text-center focus:outline-none focus:border-red-600"
                    />
                  </div>
                </div>
              </div>

              {/* Hộp xem trước nội dung chi tiết sẽ được ghi vào ô Tuan_X trên Sheet 03 */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-slate-900 text-white text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-emerald-300 font-extrabold uppercase tracking-wider text-[10px] sm:text-[11px]">
                    📌 Nội dung lưu vào ô Tuan_{selectedWeek} (Sheet 03):
                  </span>
                  <div className="flex items-center gap-3 text-[11px]">
                    <label className="inline-flex items-center gap-1 cursor-pointer font-semibold text-slate-200">
                      <input
                        type="radio"
                        name="entrySaveMode"
                        checked={scoreSaveMode === 'add_to_current'}
                        onChange={() => setScoreSaveMode('add_to_current')}
                      />
                      <span>Cộng dồn vào tuần</span>
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer font-semibold text-slate-200">
                      <input
                        type="radio"
                        name="entrySaveMode"
                        checked={scoreSaveMode === 'replace'}
                        onChange={() => setScoreSaveMode('replace')}
                      />
                      <span>Ghi mới / Ghi đè</span>
                    </label>
                  </div>
                </div>
                <div className="font-mono text-[11px] sm:text-sm bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 text-amber-200 break-words">
                  {finalSheet03CellPayload.formattedString}
                </div>
              </div>

              {activeWarnings.length > 0 && currentEntryStudent && (
                <div className="p-3 rounded-2xl bg-red-50 border border-red-300 text-red-800 text-xs flex items-start gap-2">
                  <span className="text-base leading-none">🚨</span>
                  <div>
                    <b className="font-extrabold">CẢNH BÁO VI PHẠM NẶNG:</b> Thành viên{' '}
                    <b>{currentEntryStudent.name}</b> có hành vi{' '}
                    <b>{activeWarnings.map(w => w.behavior).join(', ')}</b>.
                  </div>
                </div>
              )}
            </div>

            {/* Footer Tổng kết Điểm & Nút Lưu vào Sheet 03 */}
            <div className="px-3.5 py-3 sm:px-5 sm:py-3.5 bg-slate-100 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
                <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-white border border-slate-300 text-slate-800 font-bold">
                  Gốc: <b className="font-mono">{DEFAULT_WEEK_BASE_SCORE}đ</b>
                </span>
                <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                  Cộng: <b className="font-mono">+{finalSheet03CellPayload.finalPlus}đ</b>
                </span>
                <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-bold">
                  Trừ:{' '}
                  <b className="font-mono">
                    {finalSheet03CellPayload.finalMinus === 0
                      ? '0đ'
                      : `${finalSheet03CellPayload.finalMinus}đ`}
                  </b>
                </span>
                <span className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl bg-emerald-900 text-white font-bold ml-auto sm:ml-0">
                  Tổng T{selectedWeek}:{' '}
                  <b className="font-mono text-amber-300 text-xs sm:text-sm">
                    {finalSheet03CellPayload.finalTotal}đ
                  </b>
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEntryModalOpen(false)}
                  className="px-3 sm:px-4 py-2.5 rounded-xl bg-white hover:bg-gray-200 text-slate-700 border border-gray-300 text-xs font-bold cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={isSavingScore || !currentEntryStudent}
                  onClick={() => handleSaveEntryToSheet03(true)}
                  className="flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 text-xs font-extrabold cursor-pointer disabled:opacity-50 text-center"
                >
                  Lưu & Nhập người tiếp
                </button>
                <button
                  type="button"
                  disabled={isSavingScore || !currentEntryStudent}
                  onClick={() => handleSaveEntryToSheet03(false)}
                  className="px-5 sm:px-6 py-2.5 rounded-xl bg-[#047857] hover:bg-[#065f46] text-white text-xs sm:text-sm font-extrabold shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span>💾</span>
                  <span>{isSavingScore ? 'Đang lưu...' : 'Lưu'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
