import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import {
  BehaviorRuleItem,
  getCachedBehaviorRules,
  fetchBehaviorRulesFromGoogleSheet,
  fetchStudentsFromGoogleSheet,
  fetchCompetitionFromGoogleSheet,
  deduplicateStudentsById,
  deduplicateCompetitionRowsById,
  getSystemConfig,
  extractAvailableGroups
} from '../services/dataService';
import { StudentItem } from './StudentsView';
import {
  CompetitionStudentRow,
  DEFAULT_WEEK_BASE_SCORE,
  parseWeekCellDetail,
  ParsedWeekDetail
} from './CompetitionView';

export interface WarnedStudentInfo {
  id: string;
  name: string;
  className: string;
  group: string;
  gender: string;
  week: number;
  totalPoints: number;
  plusPoints: number;
  minusPoints: number;
  warningErrors: string[];
  allBehaviorsText: string;
  phone?: string;
  note?: string;
}

interface HomeViewProps {
  user: User;
  selectedWeek?: number;
}

const getCachedStudentsList = (cls: string): StudentItem[] => {
  try {
    const defaultCls = getSystemConfig().className || '10A6';
    const raw =
      localStorage.getItem('cached_students_all') ||
      localStorage.getItem(`cached_students_${cls || defaultCls}`) ||
      localStorage.getItem(`cached_students_${defaultCls}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return deduplicateStudentsById(parsed);
    }
  } catch {}
  return [];
};

const getCachedCompetitionList = (cls: string): CompetitionStudentRow[] => {
  try {
    const defaultCls = getSystemConfig().className || '10A6';
    const raw =
      localStorage.getItem('cached_competition_all') ||
      localStorage.getItem(`cached_competition_${cls || defaultCls}`) ||
      localStorage.getItem(`cached_competition_${defaultCls}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return deduplicateCompetitionRowsById(parsed);
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

const formatAvgScore = (val: number): string => {
  if (isNaN(val)) return String(DEFAULT_WEEK_BASE_SCORE);
  const rounded = Math.round(val * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
};

export const HomeView: React.FC<HomeViewProps> = ({ user, selectedWeek }) => {
  const currentClass = user.className || getSystemConfig().className || '10A6';

  const [studentsList, setStudentsList] = useState<StudentItem[]>(() =>
    getCachedStudentsList(currentClass)
  );
  const [competitionRows, setCompetitionRows] = useState<CompetitionStudentRow[]>(() =>
    getCachedCompetitionList(currentClass)
  );
  const [weeklyDetailsMap, setWeeklyDetailsMap] = useState<Record<string, string>>(() =>
    getCachedWeeklyDetailsMap()
  );
  const [behaviorRules, setBehaviorRules] = useState<BehaviorRuleItem[]>(() =>
    getCachedBehaviorRules()
  );
  const [syncedWeek, setSyncedWeek] = useState<number | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningModalFilter, setWarningModalFilter] = useState<'current' | 'all'>('current');
  const [warningSearchTerm, setWarningSearchTerm] = useState('');

  const refreshFromLocalStorage = () => {
    const cachedStu = getCachedStudentsList(currentClass);
    if (cachedStu.length > 0) setStudentsList(cachedStu);

    const cachedComp = getCachedCompetitionList(currentClass);
    if (cachedComp.length > 0) setCompetitionRows(cachedComp);

    setWeeklyDetailsMap(getCachedWeeklyDetailsMap());
    setBehaviorRules(getCachedBehaviorRules());
  };

  const fetchLatestHomeData = async () => {
    try {
      const [stuData, compData, rulesData] = await Promise.all([
        fetchStudentsFromGoogleSheet(false).catch(() => []),
        fetchCompetitionFromGoogleSheet(false).catch(() => null),
        fetchBehaviorRulesFromGoogleSheet(false).catch(() => getCachedBehaviorRules())
      ]);

      if (Array.isArray(rulesData) && rulesData.length > 0) {
        setBehaviorRules(rulesData);
      }

      if (Array.isArray(stuData) && stuData.length > 0) {
        setStudentsList(stuData);
      }

      if (Array.isArray(compData)) {
        refreshFromLocalStorage();
        if (getCachedCompetitionList(currentClass).length === 0) {
          setCompetitionRows(compData);
        }
      }
    } catch {
      // Giữ nguyên dữ liệu từ bộ nhớ đệm nếu ngoại tuyến
    }
  };

  useEffect(() => {
    refreshFromLocalStorage();
    fetchLatestHomeData();

    const handleDataUpdated = (e: any) => {
      if (e?.detail?.selectedWeek) {
        setSyncedWeek(Number(e.detail.selectedWeek));
      }
      refreshFromLocalStorage();
    };

    const handleGlobalSync = () => {
      refreshFromLocalStorage();
      fetchLatestHomeData();
    };

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshFromLocalStorage();
      }
    };

    window.addEventListener('app_data_updated', handleDataUpdated);
    window.addEventListener('app_sync_google', handleGlobalSync);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowFocus);

    return () => {
      window.removeEventListener('app_data_updated', handleDataUpdated);
      window.removeEventListener('app_sync_google', handleGlobalSync);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowFocus);
    };
  }, [currentClass]);

  // Kiểm tra học sinh có hành vi vi phạm nặng cần "Cảnh Báo" theo quy định trong Sheet 04_THI_DUA
  const isStudentWeekWarning = (parsedWk: ParsedWeekDetail, rules: BehaviorRuleItem[]): boolean => {
    if (!parsedWk.hasRecord) return false;

    const warningRules = rules.filter(
      r =>
        r.isWarning ||
        (r.note &&
          (r.note.toLowerCase().includes('cảnh báo') ||
            r.note.toLowerCase().includes('canh bao'))) ||
        Number(r.points) <= -50
    );

    const matchedChip = parsedWk.behaviorItems.some(chip => {
      if (chip.isWarning || chip.points <= -50) return true;
      const cleanChipName = chip.label
        .replace(/\(\s*(?:x\d+\s*:\s*)?[+-]?\d+(?:[.,]\d+)?\s*đ?\s*\)/gi, '')
        .replace(/\[cảnh báo\]/gi, '')
        .trim()
        .toLowerCase();
      return warningRules.some(r => {
        const ruleName = (r.behavior || '').trim().toLowerCase();
        return (
          ruleName &&
          (cleanChipName === ruleName ||
            cleanChipName.includes(ruleName) ||
            ruleName.includes(cleanChipName))
        );
      });
    });

    if (matchedChip) return true;

    const rawTextLower = (parsedWk.rawText || '').toLowerCase();
    if (
      rawTextLower.includes('cảnh báo') ||
      rawTextLower.includes('canh bao') ||
      parsedWk.minusPoints <= -50 ||
      (parsedWk.totalPoints !== null && Number(parsedWk.totalPoints) <= DEFAULT_WEEK_BASE_SCORE - 50)
    ) {
      return true;
    }

    return warningRules.some(r => {
      const ruleName = (r.behavior || '').trim().toLowerCase();
      return ruleName && rawTextLower.includes(ruleName);
    });
  };

  // Trích xuất chi tiết các lỗi vi phạm cụ thể của học sinh bị cảnh báo
  const getStudentWeekWarningDetails = (
    parsedWk: ParsedWeekDetail,
    rules: BehaviorRuleItem[]
  ): { isWarning: boolean; warningErrors: string[]; allChips: string[] } => {
    if (!parsedWk || !parsedWk.hasRecord) {
      return { isWarning: false, warningErrors: [], allChips: [] };
    }

    const warningRules = rules.filter(
      r =>
        r.isWarning ||
        (r.note &&
          (r.note.toLowerCase().includes('cảnh báo') ||
            r.note.toLowerCase().includes('canh bao'))) ||
        Number(r.points) <= -50
    );

    const warningErrors: string[] = [];
    const allChips: string[] = [];

    parsedWk.behaviorItems.forEach(chip => {
      allChips.push(chip.rawItem || chip.label);
      const cleanChipName = chip.label
        .replace(/\(\s*(?:x\d+\s*:\s*)?[+-]?\d+(?:[.,]\d+)?\s*đ?\s*\)/gi, '')
        .replace(/\[cảnh báo\]/gi, '')
        .trim()
        .toLowerCase();

      const matchedRule = warningRules.find(r => {
        const ruleName = (r.behavior || '').trim().toLowerCase();
        return (
          ruleName &&
          (cleanChipName === ruleName ||
            cleanChipName.includes(ruleName) ||
            ruleName.includes(cleanChipName))
        );
      });

      if (matchedRule) {
        const ptStr = matchedRule.points ? ` (${matchedRule.points}đ)` : '';
        const noteStr = matchedRule.note ? ` [${matchedRule.note}]` : ' [Cảnh báo]';
        warningErrors.push(`${matchedRule.behavior}${ptStr}${noteStr}`);
      } else if (chip.isWarning || chip.points <= -50) {
        warningErrors.push(chip.rawItem || chip.label);
      }
    });

    const rawTextLower = (parsedWk.rawText || '').toLowerCase();
    warningRules.forEach(r => {
      const ruleName = (r.behavior || '').trim().toLowerCase();
      if (ruleName && rawTextLower.includes(ruleName)) {
        const alreadyIn = warningErrors.some(e => e.toLowerCase().includes(ruleName));
        if (!alreadyIn) {
          warningErrors.push(`${r.behavior} (${r.points}đ)${r.note ? ` [${r.note}]` : ' [Cảnh báo]'}`);
        }
      }
    });

    const isHeavyMinus =
      parsedWk.minusPoints <= -50 ||
      (parsedWk.totalPoints !== null && Number(parsedWk.totalPoints) <= DEFAULT_WEEK_BASE_SCORE - 50);

    const isWarn =
      warningErrors.length > 0 ||
      rawTextLower.includes('cảnh báo') ||
      rawTextLower.includes('canh bao') ||
      isHeavyMinus;

    if (isWarn && warningErrors.length === 0) {
      if (isHeavyMinus) {
        warningErrors.push(`Điểm trừ tuần quá lớn (${parsedWk.minusPoints}đ, điểm tuần còn ${parsedWk.totalPoints}đ)`);
      } else {
        warningErrors.push(parsedWk.behaviorsText || 'Vi phạm nề nếp diện cảnh báo');
      }
    }

    return {
      isWarning: isWarn,
      warningErrors,
      allChips
    };
  };

  // Hợp nhất danh sách học sinh và dữ liệu thi đua thực tế
  const mergedRows = useMemo(() => {
    const compMap = new Map<string, CompetitionStudentRow>();
    competitionRows.forEach(r => {
      if (r && r.id) compMap.set(String(r.id).trim(), r);
    });

    const stuMap = new Map<string, StudentItem>();
    studentsList.forEach(s => {
      if (s && s.id) stuMap.set(String(s.id).trim(), s);
    });

    const buildRow = (
      id: string,
      name: string,
      clsName: string,
      grp: string,
      gender: string,
      comp?: CompetitionStudentRow,
      stu?: StudentItem
    ) => {
      const weeklyParsed: Record<string, ParsedWeekDetail> = {};
      for (let w = 1; w <= 35; w++) {
        const key = `Tuan_${w}`;
        const rawScoreVal = comp?.weeklyScores ? comp.weeklyScores[key] : null;
        const hasWeeklyDetailsObj = Boolean(
          comp && comp.weeklyDetails && typeof comp.weeklyDetails === 'object'
        );
        const rawDetailFromComp = hasWeeklyDetailsObj
          ? String(comp?.weeklyDetails?.[key] ?? '').trim()
          : '';

        const isScoreEmpty =
          rawScoreVal === null ||
          rawScoreVal === undefined ||
          String(rawScoreVal).trim() === '' ||
          isNaN(Number(rawScoreVal));

        let effectiveDetail = '';
        if (hasWeeklyDetailsObj) {
          if (rawDetailFromComp && rawDetailFromComp !== '#NUM!' && rawDetailFromComp !== 'NaN') {
            effectiveDetail = rawDetailFromComp;
          } else if (!isScoreEmpty) {
            effectiveDetail = String(rawScoreVal);
          }
        } else if (comp && !isScoreEmpty) {
          const numVal = Number(rawScoreVal);
          const expectedTotal = numVal < 45 ? DEFAULT_WEEK_BASE_SCORE + numVal : numVal;
          const cached = weeklyDetailsMap[`${id}_${key}`] || '';
          const parsedCached = cached ? parseWeekCellDetail(cached, null) : null;
          effectiveDetail =
            parsedCached && parsedCached.hasRecord && parsedCached.totalPoints === expectedTotal
              ? cached
              : String(rawScoreVal);
        }

        weeklyParsed[key] = parseWeekCellDetail(
          effectiveDetail,
          isScoreEmpty ? null : Number(rawScoreVal)
        );
      }

      return {
        id,
        name,
        className: clsName,
        group: grp,
        gender,
        phone: stu?.phone || (comp as any)?.phone || '',
        note: stu?.note || comp?.note || '',
        weeklyParsed
      };
    };

    if (studentsList.length > 0) {
      const uniqueStu = deduplicateStudentsById<StudentItem>(studentsList);
      return uniqueStu.map(stu => {
        const sId = String(stu.id).trim();
        const comp = compMap.get(sId);
        return buildRow(
          sId,
          stu.name || comp?.name || '',
          stu.className || comp?.className || currentClass,
          stu.group || comp?.group || 'Tổ 1',
          stu.gender || '',
          comp,
          stu
        );
      });
    }

    const uniqueComp = deduplicateCompetitionRowsById(competitionRows);
    return uniqueComp.map(comp => {
      const cId = String(comp.id).trim();
      const stu = stuMap.get(cId);
      return buildRow(
        cId,
        stu?.name || comp.name || '',
        stu?.className || comp.className || currentClass,
        stu?.group || comp.group || 'Tổ 1',
        stu?.gender || '',
        comp,
        stu
      );
    });
  }, [studentsList, competitionRows, weeklyDetailsMap, currentClass]);

  // Xác định tuần thi đua hiện tại (ưu tiên tuần đang chọn trên thanh ngang hoặc tuần mới nhất có dữ liệu trên Sheet 03)
  const activeWeek = useMemo(() => {
    if (selectedWeek && selectedWeek >= 1 && selectedWeek <= 35) return selectedWeek;
    if (syncedWeek && syncedWeek >= 1 && syncedWeek <= 35) return syncedWeek;
    for (let w = 35; w >= 1; w--) {
      const hasAny = mergedRows.some(r => r.weeklyParsed[`Tuan_${w}`]?.hasRecord);
      if (hasAny) return w;
    }
    return 1;
  }, [mergedRows, selectedWeek, syncedWeek]);

  // Tính toán 5 chỉ số thực tế cho 5 thẻ trên Trang Chủ
  const dashboardStats = useMemo(() => {
    const totalStudents = mergedRows.length;
    let maleCount = 0;
    let femaleCount = 0;

    mergedRows.forEach(r => {
      const g = (r.gender || '').trim().toLowerCase();
      if (g === 'nam' || g.includes('nam')) {
        maleCount++;
      } else if (g === 'nữ' || g === 'nu' || g.includes('nữ') || g.includes('nu')) {
        femaleCount++;
      }
    });

    // Thống kê theo tất cả các Tổ thi đua (Hỗ trợ đủ 8 Tổ từ Google Sheet)
    const groupNames = extractAvailableGroups(mergedRows);
    const wkKey = `Tuan_${activeWeek}`;
    const prevWkKey = activeWeek > 1 ? `Tuan_${activeWeek - 1}` : null;

    let classWeekTotal = 0;
    let classPrevWeekTotal = 0;
    let totalWarnings = 0;

    const groupDetails = groupNames.map(grpName => {
      const cleanGrp = grpName.trim().toLowerCase();
      const cleanGrpNoSpace = cleanGrp.replace(/\s+/g, '');
      const members = mergedRows.filter(r => {
        const sGrp = (r.group || '').trim().toLowerCase();
        const sGrpNoSpace = sGrp.replace(/\s+/g, '');
        return sGrp === cleanGrp || sGrpNoSpace === cleanGrpNoSpace || sGrp.includes(cleanGrp);
      });

      let grpWeekTotal = 0;
      let grpYearTotal = 0;
      let grpPlusTotal = 0;
      let grpMinusTotal = 0;
      let grpWarningCount = 0;

      members.forEach(m => {
        const parsedCurr = m.weeklyParsed[wkKey];
        const currScore =
          parsedCurr && parsedCurr.hasRecord && parsedCurr.totalPoints !== null
            ? Number(parsedCurr.totalPoints)
            : DEFAULT_WEEK_BASE_SCORE;

        grpWeekTotal += currScore;
        classWeekTotal += currScore;

        if (parsedCurr && parsedCurr.hasRecord) {
          grpPlusTotal += parsedCurr.plusPoints;
          grpMinusTotal += parsedCurr.minusPoints;
        }

        if (parsedCurr && isStudentWeekWarning(parsedCurr, behaviorRules)) {
          totalWarnings++;
          grpWarningCount++;
        }

        if (prevWkKey) {
          const parsedPrev = m.weeklyParsed[prevWkKey];
          const prevScore =
            parsedPrev && parsedPrev.hasRecord && parsedPrev.totalPoints !== null
              ? Number(parsedPrev.totalPoints)
              : DEFAULT_WEEK_BASE_SCORE;
          classPrevWeekTotal += prevScore;
        } else {
          classPrevWeekTotal += DEFAULT_WEEK_BASE_SCORE;
        }

        for (let w = 1; w <= activeWeek; w++) {
          const pw = m.weeklyParsed[`Tuan_${w}`];
          grpYearTotal +=
            pw && pw.hasRecord && pw.totalPoints !== null
              ? Number(pw.totalPoints)
              : DEFAULT_WEEK_BASE_SCORE;
        }
      });

      const weekAvg =
        members.length > 0 ? grpWeekTotal / members.length : DEFAULT_WEEK_BASE_SCORE;
      const yearAvg =
        members.length > 0 ? grpYearTotal / members.length : DEFAULT_WEEK_BASE_SCORE;
      const weekDelta = grpWeekTotal - members.length * DEFAULT_WEEK_BASE_SCORE;

      return {
        groupName: grpName,
        memberCount: members.length,
        weekTotal: grpWeekTotal,
        weekAvg,
        yearAvg,
        weekPlus: grpPlusTotal,
        weekMinus: grpMinusTotal,
        weekDelta,
        warningCount: grpWarningCount
      };
    });

    const nonEmptyGroupSizes = groupDetails
      .map(g => g.memberCount)
      .filter(count => count > 0);
    const minGroupSize =
      nonEmptyGroupSizes.length > 0 ? Math.min(...nonEmptyGroupSizes) : 0;
    const maxGroupSize =
      nonEmptyGroupSizes.length > 0 ? Math.max(...nonEmptyGroupSizes) : 0;

    const groupRangeText =
      minGroupSize === maxGroupSize
        ? `${minGroupSize} học sinh / tổ`
        : `${minGroupSize} - ${maxGroupSize} học sinh / tổ`;

    const classAvg =
      totalStudents > 0 ? classWeekTotal / totalStudents : DEFAULT_WEEK_BASE_SCORE;
    const prevClassAvg =
      totalStudents > 0 ? classPrevWeekTotal / totalStudents : DEFAULT_WEEK_BASE_SCORE;
    const avgDiff = Math.round((classAvg - prevClassAvg) * 100) / 100;

    const sortedGroups = [...groupDetails]
      .sort((a, b) => {
        if (b.weekAvg !== a.weekAvg) return b.weekAvg - a.weekAvg;
        if (b.weekDelta !== a.weekDelta) return b.weekDelta - a.weekDelta;
        return b.yearAvg - a.yearAvg;
      })
      .map((g, idx) => ({
        ...g,
        rank: idx + 1
      }));

    const leadingGroup = sortedGroups[0] || {
      groupName: 'Tổ 1',
      weekAvg: DEFAULT_WEEK_BASE_SCORE,
      rank: 1
    };

    // Tính Top 5 học sinh có điểm thi đua cao nhất tuần
    const studentRankList = mergedRows.map(m => {
      const parsedCurr = m.weeklyParsed[wkKey];
      const weekScore =
        parsedCurr && parsedCurr.hasRecord && parsedCurr.totalPoints !== null
          ? Number(parsedCurr.totalPoints)
          : DEFAULT_WEEK_BASE_SCORE;
      const plusPoints = parsedCurr && parsedCurr.hasRecord ? parsedCurr.plusPoints : 0;
      const minusPoints = parsedCurr && parsedCurr.hasRecord ? parsedCurr.minusPoints : 0;
      const behaviorsText =
        parsedCurr && parsedCurr.hasRecord && parsedCurr.behaviorsText
          ? parsedCurr.behaviorsText.replace(/\s*\[cảnh báo\]/gi, '').trim()
          : '';

      let yearTotal = 0;
      for (let w = 1; w <= activeWeek; w++) {
        const pw = m.weeklyParsed[`Tuan_${w}`];
        yearTotal +=
          pw && pw.hasRecord && pw.totalPoints !== null
            ? Number(pw.totalPoints)
            : DEFAULT_WEEK_BASE_SCORE;
      }

      return {
        id: m.id,
        name: m.name,
        group: m.group,
        weekScore,
        plusPoints,
        minusPoints,
        behaviorsText,
        yearTotal
      };
    });

    studentRankList.sort((a, b) => {
      if (b.weekScore !== a.weekScore) return b.weekScore - a.weekScore;
      if (b.plusPoints !== a.plusPoints) return b.plusPoints - a.plusPoints;
      if (b.minusPoints !== a.minusPoints) return b.minusPoints - a.minusPoints;
      if (b.yearTotal !== a.yearTotal) return b.yearTotal - a.yearTotal;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });

    const top5Students = studentRankList.slice(0, 5).map((stu, idx) => ({
      ...stu,
      rank: idx + 1
    }));

    return {
      totalStudents,
      maleCount,
      femaleCount,
      groupCount: groupNames.length,
      groupRangeText,
      classAvg,
      avgDiff,
      totalWarnings,
      leadingGroup,
      sortedGroups,
      top5Students
    };
  }, [mergedRows, activeWeek, behaviorRules]);

  // Danh sách các học sinh bị cảnh báo theo bộ lọc (Tuần hiện tại hoặc Tất cả các tuần)
  const warnedStudents = useMemo<WarnedStudentInfo[]>(() => {
    const list: WarnedStudentInfo[] = [];

    mergedRows.forEach(student => {
      const weeksToCheck =
        warningModalFilter === 'current'
          ? [activeWeek]
          : Array.from({ length: 35 }, (_, i) => i + 1);

      weeksToCheck.forEach(w => {
        const wkKey = `Tuan_${w}`;
        const parsedWk = student.weeklyParsed[wkKey];
        if (!parsedWk || !parsedWk.hasRecord) return;

        const warnDetail = getStudentWeekWarningDetails(parsedWk, behaviorRules);
        if (warnDetail.isWarning) {
          const totalPoints =
            parsedWk.totalPoints !== null && parsedWk.totalPoints !== undefined
              ? Number(parsedWk.totalPoints)
              : DEFAULT_WEEK_BASE_SCORE;

          list.push({
            id: student.id,
            name: student.name,
            className: student.className,
            group: student.group,
            gender: student.gender,
            week: w,
            totalPoints,
            plusPoints: parsedWk.plusPoints,
            minusPoints: parsedWk.minusPoints,
            warningErrors: warnDetail.warningErrors,
            allBehaviorsText: parsedWk.behaviorsText || '',
            phone: student.phone,
            note: student.note
          });
        }
      });
    });

    // Sắp xếp: tuần mới nhất trước, điểm thấp nhất lên đầu
    return list.sort((a, b) => {
      if (b.week !== a.week) return b.week - a.week;
      if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints;
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [mergedRows, activeWeek, warningModalFilter, behaviorRules]);

  const currentWeekWarningsCount = useMemo(() => {
    let count = 0;
    mergedRows.forEach(student => {
      const parsedWk = student.weeklyParsed[`Tuan_${activeWeek}`];
      if (parsedWk && parsedWk.hasRecord && isStudentWeekWarning(parsedWk, behaviorRules)) {
        count++;
      }
    });
    return count;
  }, [mergedRows, activeWeek, behaviorRules]);

  const allWeeksWarningsCount = useMemo(() => {
    let count = 0;
    mergedRows.forEach(student => {
      for (let w = 1; w <= 35; w++) {
        const parsedWk = student.weeklyParsed[`Tuan_${w}`];
        if (parsedWk && parsedWk.hasRecord && isStudentWeekWarning(parsedWk, behaviorRules)) {
          count++;
        }
      }
    });
    return count;
  }, [mergedRows, behaviorRules]);

  const filteredWarnedStudents = useMemo(() => {
    if (!warningSearchTerm.trim()) return warnedStudents;
    const term = warningSearchTerm.trim().toLowerCase();
    return warnedStudents.filter(
      s =>
        s.name.toLowerCase().includes(term) ||
        s.id.toLowerCase().includes(term) ||
        s.group.toLowerCase().includes(term) ||
        (s.phone && s.phone.includes(term)) ||
        s.warningErrors.some(err => err.toLowerCase().includes(term)) ||
        s.allBehaviorsText.toLowerCase().includes(term)
    );
  }, [warnedStudents, warningSearchTerm]);

  const handleNavigateToCompetition = (studentName: string, week: number) => {
    setShowWarningModal(false);
    window.dispatchEvent(
      new CustomEvent('app_change_tab', {
        detail: { tab: 'competition', week }
      })
    );
    window.dispatchEvent(
      new CustomEvent('app_filter_competition_student', {
        detail: { studentName, week }
      })
    );
  };

  const handleNavigateToStudents = (studentName: string) => {
    setShowWarningModal(false);
    window.dispatchEvent(
      new CustomEvent('app_change_tab', {
        detail: { tab: 'students' }
      })
    );
    window.dispatchEvent(
      new CustomEvent('app_filter_students', {
        detail: { studentName }
      })
    );
  };

  const compareLabel =
    activeWeek > 1 ? `so với Tuần ${activeWeek - 1}` : 'so với mốc 100đ';

  return (
    <div className="animate-fade-in max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {/* 1. TỔNG SỐ HỌC SINH */}
        <div className="bg-[#eded9d] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-gray-200/90 shadow-xs flex flex-col justify-between min-h-[116px] sm:min-h-[146px]">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm font-semibold text-slate-600 leading-tight">
              Tổng số học sinh
            </span>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>

          <div className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight my-1 sm:my-1.5">
            {dashboardStats.totalStudents}
          </div>

          <div className="text-[11px] sm:text-xs font-bold text-emerald-600 truncate">
            {dashboardStats.maleCount} Nam • {dashboardStats.femaleCount} Nữ
          </div>
        </div>

        {/* 2. SỐ TỔ THI ĐUA */}
        <div className="bg-[#93bce8] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-gray-200/90 shadow-xs flex flex-col justify-between min-h-[116px] sm:min-h-[146px]">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm font-semibold text-slate-600 leading-tight">
              Số tổ thi đua
            </span>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
          </div>

          <div className="flex items-baseline gap-1 sm:gap-1.5 my-1 sm:my-1.5">
            <span className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              {dashboardStats.groupCount}
            </span>
            <span className="text-sm sm:text-base font-medium text-slate-500">tổ</span>
          </div>

          <div className="text-[11px] sm:text-xs font-medium text-slate-500 truncate">
            {dashboardStats.groupRangeText}
          </div>
        </div>

        {/* 3. ĐIỂM TB LỚP */}
        <div className="bg-[#fab9fa] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-gray-200/90 shadow-xs flex flex-col justify-between min-h-[116px] sm:min-h-[146px]">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm font-semibold text-slate-600 leading-tight">
              Điểm TB lớp
            </span>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
          </div>

          <div className="text-2xl sm:text-4xl font-extrabold text-emerald-600 tracking-tight my-1 sm:my-1.5">
            {formatAvgScore(dashboardStats.classAvg)}
          </div>

          <div
            className={`text-[11px] sm:text-xs font-bold flex items-center gap-1 truncate ${
              dashboardStats.avgDiff >= 0 ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            <span>{dashboardStats.avgDiff >= 0 ? '↗' : '↘'}</span>
            <span className="truncate">
              {dashboardStats.avgDiff >= 0
                ? `+${formatAvgScore(dashboardStats.avgDiff)}`
                : formatAvgScore(dashboardStats.avgDiff)}{' '}
              {compareLabel}
            </span>
          </div>
        </div>

        {/* 4. ĐANG CẢNH BÁO */}
        <div
          onClick={() => {
            setWarningModalFilter('current');
            setShowWarningModal(true);
          }}
          className="bg-[#b6eeea] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-gray-200/90 shadow-xs flex flex-col justify-between min-h-[116px] sm:min-h-[146px] cursor-pointer hover:shadow-md hover:border-rose-300 transition-all active:scale-[0.98] group"
          title="Bấm để xem chi tiết học sinh & lỗi bị cảnh báo"
        >
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm font-semibold text-slate-700 leading-tight flex items-center gap-1.5">
              <span>Đang cảnh báo</span>
              {dashboardStats.totalWarnings > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              )}
            </span>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-2xs">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>

          <div className="text-2xl sm:text-4xl font-extrabold text-rose-600 tracking-tight my-1 sm:my-1.5 flex items-baseline justify-between">
            <span>{dashboardStats.totalWarnings}</span>
            <span className="text-[11px] sm:text-xs font-bold text-rose-600 group-hover:underline">
              Chi tiết →
            </span>
          </div>

          <div className="text-[11px] sm:text-xs font-bold text-rose-600 truncate">
            {dashboardStats.totalWarnings > 0
              ? 'Bấm xem học sinh & lỗi vi phạm'
              : 'Nề nếp lớp đảm bảo tốt'}
          </div>
        </div>

        {/* 5. TỔ DẪN ĐẦU TUẦN */}
        <div className="col-span-2 sm:col-span-2 lg:col-span-1 bg-[#fffbeb] rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-[#fde68a] shadow-xs flex flex-col justify-between min-h-[104px] sm:min-h-[146px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-extrabold text-amber-900">
              Tổ dẫn đầu Tuần {activeWeek}
            </span>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#f59e0b] text-white flex items-center justify-center shrink-0 shadow-2xs">
              <svg
                className="w-4 h-4 sm:w-5 sm:h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </div>
          </div>

          <div className="flex items-baseline justify-between lg:block my-1 sm:my-1.5">
            <div className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {dashboardStats.leadingGroup.groupName}
            </div>
            <div className="text-xs font-extrabold text-amber-800 lg:mt-1.5">
              {formatAvgScore(dashboardStats.leadingGroup.weekAvg)} đ • Xếp hạng 1
            </div>
          </div>
        </div>
      </div>

      {/* THÔNG BÁO CẢNH BÁO: LIÊN KẾT ĐẾN THÔNG TIN HỌC SINH VÀ LỖI BỊ CẢNH BÁO */}
      {dashboardStats.totalWarnings > 0 && (
        <div
          onClick={() => {
            setWarningModalFilter('current');
            setShowWarningModal(true);
          }}
          className="cursor-pointer bg-gradient-to-r from-rose-50 via-red-50 to-amber-50 border border-rose-300/80 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs hover:shadow-md hover:border-rose-400 transition-all active:scale-[0.99] group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center text-lg sm:text-xl shrink-0 shadow-xs animate-bounce">
              ⚠️
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-xs sm:text-sm text-rose-950">
                  Thông báo: Đang có {dashboardStats.totalWarnings} học sinh diện Cảnh Báo trong Tuần {activeWeek}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px] uppercase tracking-wider animate-pulse">
                  Đang cảnh báo
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-rose-700 font-medium mt-0.5 truncate">
                Bấm vào đây để xem chi tiết thông tin học sinh và các lỗi bị cảnh báo
              </p>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 px-3.5 py-2 rounded-xl bg-rose-600 group-hover:bg-rose-700 text-white font-extrabold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span>Chi tiết lỗi</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* HAI CHỨC NĂNG BỔ SUNG: 1. XẾP HẠNG THI ĐUA TUẦN Ở CÁC TỔ & 2. TOP 5 HỌC SINH ĐIỂM CAO NHẤT TUẦN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* CHỨC NĂNG 1: XẾP HẠNG THI ĐUA TUẦN Ở CÁC TỔ */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200/90 shadow-xs flex flex-col">
          <div className="flex items-start sm:items-center justify-between gap-2.5 sm:gap-3 mb-4 sm:mb-5">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-base sm:text-lg shrink-0 border border-amber-200/70">
                🏆
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-lg font-extrabold text-[#09a542] leading-snug">
                  Xếp hạng thi đua tuần ở các tổ
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                  Điểm trung bình của 4 tổ trong Tuần {activeWeek}
                </p>
              </div>
            </div>
            <span className="px-2.5 sm:px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px] sm:text-xs shrink-0">
              Tuần {activeWeek}
            </span>
          </div>

          <div className="space-y-3 sm:space-y-3.5 flex-1">
            {dashboardStats.sortedGroups.map(grp => {
              const isTop1 = grp.rank === 1;
              const isTop2 = grp.rank === 2;
              const isTop3 = grp.rank === 3;
              const barPercent = Math.min(100, Math.max(25, (grp.weekAvg / 115) * 100));

              return (
                <div
                  key={grp.groupName}
                  className={`p-3 sm:p-4 rounded-2xl border transition-all ${
                    isTop1
                      ? 'bg-amber-50/60 border-amber-200 shadow-2xs'
                      : 'bg-slate-50/70 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 sm:gap-3 mb-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <span
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                          isTop1
                            ? 'bg-amber-500 text-white shadow-2xs'
                            : isTop2
                            ? 'bg-slate-300 text-slate-800'
                            : isTop3
                            ? 'bg-amber-700/80 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isTop1 ? '🥇' : isTop2 ? '🥈' : isTop3 ? '🥉' : `#${grp.rank}`}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                            {grp.groupName}
                          </span>
                          <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                            Hạng {grp.rank}
                          </span>
                          {grp.warningCount > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setWarningModalFilter('current');
                                setWarningSearchTerm(grp.groupName);
                                setShowWarningModal(true);
                              }}
                              className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-700 transition cursor-pointer border border-rose-200/80 inline-flex items-center gap-1 active:scale-95"
                              title={`Bấm xem chi tiết cảnh báo của ${grp.groupName}`}
                            >
                              ⚠️ {grp.warningCount} cảnh báo
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span>{grp.memberCount} HS</span>
                          <span>•</span>
                          <span>Tổng: {grp.weekTotal}đ</span>
                          <span>•</span>
                          <span className="text-emerald-600 font-semibold">+{grp.weekPlus}đ</span>
                          <span>/</span>
                          <span className="text-rose-600 font-semibold">{grp.weekMinus}đ</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-base sm:text-xl font-black whitespace-nowrap ${
                          grp.weekAvg > DEFAULT_WEEK_BASE_SCORE
                            ? 'text-emerald-600'
                            : grp.weekAvg < DEFAULT_WEEK_BASE_SCORE
                            ? 'text-rose-600'
                            : 'text-slate-900'
                        }`}
                      >
                        {formatAvgScore(grp.weekAvg)} đ
                      </div>
                      <div className="text-[10px] sm:text-[11px] font-semibold text-slate-400">
                        Điểm TB tổ
                      </div>
                    </div>
                  </div>

                  {/* Thanh tiến độ trực quan */}
                  <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isTop1
                          ? 'bg-amber-500'
                          : grp.weekAvg >= DEFAULT_WEEK_BASE_SCORE
                          ? 'bg-emerald-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${barPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CHỨC NĂNG 2: TOP 5 HỌC SINH CÓ ĐIỂM THI ĐUA CAO NHẤT TUẦN */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200/90 shadow-xs flex flex-col">
          <div className="flex items-start sm:items-center justify-between gap-2.5 sm:gap-3 mb-4 sm:mb-5">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-base sm:text-lg shrink-0 border border-emerald-200/70">
                🌟
              </div>
              <div className="min-w-0">
                <h3 className="text-[15px] leading-[30px] font-extrabold text-[#034af2]">
                  Top 5 học sinh có điểm thi đua cao nhất tuần
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                  Vinh danh các cá nhân tiêu biểu trong Tuần {activeWeek}
                </p>
              </div>
            </div>
            <span className="px-2.5 sm:px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[11px] sm:text-xs shrink-0">
              Top 5 • Tuần {activeWeek}
            </span>
          </div>

          <div className="space-y-2.5 sm:space-y-3 flex-1">
            {dashboardStats.top5Students.map((stu, sIdx) => {
              const isRank1 = stu.rank === 1;
              const isRank2 = stu.rank === 2;
              const isRank3 = stu.rank === 3;

              return (
                <div
                  key={`${stu.id}_${sIdx}`}
                  className={`p-3 sm:p-3.5 rounded-2xl border flex items-center justify-between gap-2.5 sm:gap-3 transition-all ${
                    isRank1
                      ? 'bg-emerald-50/50 border-emerald-200 shadow-2xs'
                      : 'bg-slate-50/70 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <span
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                        isRank1
                          ? 'bg-amber-500 text-white shadow-2xs'
                          : isRank2
                          ? 'bg-slate-300 text-slate-800'
                          : isRank3
                          ? 'bg-amber-700/80 text-white'
                          : 'bg-white border border-slate-200 text-slate-700'
                      }`}
                    >
                      {isRank1 ? '🥇' : isRank2 ? '🥈' : isRank3 ? '🥉' : stu.rank}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span
                          className={`font-extrabold text-xs sm:text-base truncate ${
                            sIdx === 0
                              ? 'text-[#e73313]'
                              : sIdx === 1
                              ? 'text-[#044af1]'
                              : 'text-[#0a51f8]'
                          }`}
                        >
                          {stu.name}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70 shrink-0">
                          {stu.group}
                        </span>
                      </div>
                      <div className="text-[11px] sm:text-xs text-slate-500 font-medium line-clamp-2 sm:truncate mt-0.5">
                        {stu.behaviorsText
                          ? stu.behaviorsText
                          : 'Chấp hành tốt nội quy (Mặc định 100đ)'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm sm:text-lg font-black whitespace-nowrap ${
                        stu.weekScore > DEFAULT_WEEK_BASE_SCORE
                          ? 'text-emerald-600'
                          : stu.weekScore < DEFAULT_WEEK_BASE_SCORE
                          ? 'text-rose-600'
                          : 'text-slate-900'
                      }`}
                    >
                      {stu.weekScore} đ
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-bold flex items-center justify-end gap-1 whitespace-nowrap">
                      <span className="text-emerald-600">+{stu.plusPoints}đ</span>
                      <span className="text-slate-300">/</span>
                      <span className="text-rose-600">{stu.minusPoints}đ</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL CHI TIẾT HỌC SINH ĐANG CẢNH BÁO & LỖI VI PHẠM */}
      {showWarningModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
          onClick={() => {
            setShowWarningModal(false);
            setWarningSearchTerm('');
          }}
        >
          <div
            className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-500 via-rose-600 to-amber-600 text-white flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-xl shrink-0 shadow-2xs">
                  🚨
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-base sm:text-lg leading-tight truncate">
                    Danh Sách Học Sinh Đang Cảnh Báo
                  </h3>
                  <p className="text-xs text-rose-100 font-medium mt-0.5 truncate">
                    Lớp {currentClass} • Theo dõi hành vi vi phạm & nề nếp thi đua
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowWarningModal(false);
                  setWarningSearchTerm('');
                }}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-sm font-bold transition cursor-pointer shrink-0"
                title="Đóng"
              >
                ✕
              </button>
            </div>

            {/* Bộ lọc & Tìm kiếm */}
            <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-gray-200 shrink-0 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setWarningModalFilter('current')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                      warningModalFilter === 'current'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>Tuần hiện tại (Tuần {activeWeek})</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                        warningModalFilter === 'current'
                          ? 'bg-white/20 text-white'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {currentWeekWarningsCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWarningModalFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 ${
                      warningModalFilter === 'all'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>Tất cả các tuần (Tuần 1 - 35)</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                        warningModalFilter === 'all'
                          ? 'bg-white/20 text-white'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {allWeeksWarningsCount}
                    </span>
                  </button>
                </div>

                <span className="text-xs text-slate-500 font-semibold">
                  Hiển thị: <b>{filteredWarnedStudents.length}</b> kết quả
                </span>
              </div>

              {/* Ô tìm kiếm */}
              <div className="relative">
                <input
                  type="text"
                  value={warningSearchTerm}
                  onChange={e => setWarningSearchTerm(e.target.value)}
                  placeholder="Tìm kiếm theo tên học sinh, mã HS, tổ, lỗi bị cảnh báo..."
                  className="w-full pl-9 pr-9 py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                  🔍
                </span>
                {warningSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setWarningSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Danh sách học sinh bị cảnh báo */}
            <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
              {filteredWarnedStudents.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <div className="text-4xl sm:text-5xl">🎉</div>
                  <h4 className="font-extrabold text-sm sm:text-base text-slate-800">
                    Không có học sinh nào bị cảnh báo!
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {warningSearchTerm
                      ? 'Không tìm thấy kết quả phù hợp với từ khóa tìm kiếm.'
                      : warningModalFilter === 'current'
                      ? `Trong Tuần ${activeWeek}, toàn thể học sinh lớp đều chấp hành tốt nội quy.`
                      : 'Hệ thống chưa ghi nhận lỗi cảnh báo nào trong các tuần.'}
                  </p>
                </div>
              ) : (
                filteredWarnedStudents.map((item, idx) => {
                  const groupBadgeColor = item.group.includes('1')
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : item.group.includes('2')
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : item.group.includes('3')
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                  return (
                    <div
                      key={`${item.id}_w${item.week}_${idx}`}
                      className="bg-white rounded-2xl p-3.5 sm:p-4 border border-rose-200 shadow-2xs hover:shadow-xs transition space-y-3"
                    >
                      {/* Thông tin học sinh */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-rose-100 text-rose-700 font-extrabold flex items-center justify-center text-sm shrink-0 shadow-2xs">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <span className="font-black text-slate-900 text-sm sm:text-base">
                                {item.name}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${groupBadgeColor}`}
                              >
                                {item.group || 'Chưa chia tổ'}
                              </span>
                              <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-slate-100 text-slate-700">
                                {item.id}
                              </span>
                              <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                Tuần {item.week}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium flex-wrap">
                              <span>Lớp: {item.className}</span>
                              {item.gender && (
                                <>
                                  <span>•</span>
                                  <span>Giới tính: {item.gender}</span>
                                </>
                              )}
                              {item.phone && (
                                <>
                                  <span>•</span>
                                  <a
                                    href={`tel:${item.phone.startsWith('0') ? item.phone : '0' + item.phone}`}
                                    className="text-emerald-700 font-bold hover:underline inline-flex items-center gap-1"
                                    title="Bấm để gọi"
                                  >
                                    <span>📞</span>
                                    <span>{item.phone}</span>
                                  </a>
                                </>
                              )}
                              {item.note && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-600 font-bold">📝 {item.note}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Điểm số tuần */}
                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block font-mono font-extrabold text-sm sm:text-base px-2.5 sm:px-3 py-1 rounded-xl ${
                              item.totalPoints < DEFAULT_WEEK_BASE_SCORE
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {item.totalPoints} đ
                          </span>
                          <div className="text-[10px] sm:text-[11px] font-bold flex items-center justify-end gap-1 mt-0.5">
                            <span className="text-emerald-600">+{item.plusPoints}đ</span>
                            <span className="text-slate-300">/</span>
                            <span className="text-rose-600">{item.minusPoints}đ</span>
                          </div>
                        </div>
                      </div>

                      {/* KHỐI LỖI BỊ CẢNH BÁO */}
                      <div className="bg-rose-50/90 rounded-2xl p-3 border border-rose-200 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-black text-rose-800">
                          <span>⚠️</span>
                          <span>Lỗi vi phạm diện cảnh báo:</span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {item.warningErrors.map((err, errIdx) => (
                            <span
                              key={errIdx}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-rose-800 border border-rose-300 font-extrabold text-xs shadow-2xs"
                            >
                              <span className="text-rose-600">🔴</span>
                              <span>{err}</span>
                            </span>
                          ))}
                        </div>

                        {item.allBehaviorsText && (
                          <div className="text-[11px] sm:text-xs text-rose-900/80 font-medium pt-1 border-t border-rose-200/70">
                            <b>Chi tiết ghi nhận tuần:</b> {item.allBehaviorsText}
                          </div>
                        )}
                      </div>

                      {/* LIÊN KẾT ĐẾN THÔNG TIN HỌC SINH */}
                      <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleNavigateToStudents(item.name)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                          title="Chuyển sang xem hồ sơ học sinh"
                        >
                          <span>👤</span>
                          <span>Hồ sơ học sinh</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleNavigateToCompetition(item.name, item.week)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                          title="Chuyển sang xem trên Bảng Thi Đua"
                        >
                          <span>🏆</span>
                          <span>Xem trên Bảng Thi Đua (Tuần {item.week})</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-gray-200 flex items-center justify-between gap-2 shrink-0">
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                * Nhấn vào liên kết để chuyển trực tiếp đến Bảng Thi Đua hoặc Hồ Sơ Học Sinh
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowWarningModal(false);
                  setWarningSearchTerm('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-extrabold transition cursor-pointer ml-auto"
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
