import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
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

interface ReportsViewProps {
  user: User;
  selectedWeek: number;
  onWeekChange?: (week: number) => void;
}

type ReportCategory =
  | 'students_list'
  | 'weekly_all'
  | 'weekly_groups'
  | 'semester_1'
  | 'semester_2'
  | 'full_year';

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

const formatAvg = (val: number): string => {
  if (isNaN(val)) return String(DEFAULT_WEEK_BASE_SCORE);
  const rounded = Math.round(val * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
};

const getConductClassification = (avgWeekScore: number, warningCount: number): string => {
  if (warningCount >= 2 || avgWeekScore < 70) return 'Chưa đạt';
  if (warningCount === 1 || avgWeekScore < 85) return 'Đạt';
  if (avgWeekScore < 98) return 'Khá';
  return 'Tốt';
};

export const ReportsView: React.FC<ReportsViewProps> = ({
  user,
  selectedWeek,
  onWeekChange
}) => {
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

  const [activeReport, setActiveReport] = useState<ReportCategory>('students_list');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('Tất cả');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showWeekColumnsInSemester, setShowWeekColumnsInSemester] = useState<boolean>(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const refreshFromCache = () => {
    const cachedStu = getCachedStudentsList(currentClass);
    if (cachedStu.length > 0) setStudentsList(cachedStu);

    const cachedComp = getCachedCompetitionList(currentClass);
    if (cachedComp.length > 0) setCompetitionRows(cachedComp);

    setWeeklyDetailsMap(getCachedWeeklyDetailsMap());
    setBehaviorRules(getCachedBehaviorRules());
  };

  const syncLatestData = async (force = false) => {
    try {
      const [stuData, compData, rulesData] = await Promise.all([
        fetchStudentsFromGoogleSheet(force).catch(() => []),
        fetchCompetitionFromGoogleSheet(force).catch(() => null),
        fetchBehaviorRulesFromGoogleSheet(force).catch(() => getCachedBehaviorRules())
      ]);
      if (Array.isArray(stuData) && stuData.length > 0) setStudentsList(stuData);
      if (Array.isArray(rulesData) && rulesData.length > 0) setBehaviorRules(rulesData);
      if (Array.isArray(compData)) refreshFromCache();
    } catch {}
  };

  useEffect(() => {
    refreshFromCache();
    syncLatestData(false);

    const handleUpdated = () => refreshFromCache();
    const handleGlobalSync = () => {
      refreshFromCache();
      syncLatestData(true);
    };

    window.addEventListener('app_data_updated', handleUpdated);
    window.addEventListener('app_sync_google', handleGlobalSync);
    return () => {
      window.removeEventListener('app_data_updated', handleUpdated);
      window.removeEventListener('app_sync_google', handleGlobalSync);
    };
  }, [currentClass]);

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

  // Hợp nhất dữ liệu Học Sinh (Sheet 02) & Bảng Thi Đua 35 Tuần (Sheet 03)
  const enrichedStudents = useMemo(() => {
    const compMap = new Map<string, CompetitionStudentRow>();
    competitionRows.forEach(r => {
      if (r && r.id) compMap.set(String(r.id).trim(), r);
    });

    const stuMap = new Map<string, StudentItem>();
    studentsList.forEach(s => {
      if (s && s.id) stuMap.set(String(s.id).trim(), s);
    });

    const baseList: Array<{
      id: string;
      name: string;
      className: string;
      gender: string;
      birthDate: string;
      group: string;
      phone: string;
      status: string;
      note: string;
      comp?: CompetitionStudentRow;
    }> = [];

    const seenIds = new Set<string>();
    const uniqueStudents = deduplicateStudentsById<StudentItem>(studentsList);
    const uniqueComps = deduplicateCompetitionRowsById(competitionRows);

    if (uniqueStudents.length > 0) {
      uniqueStudents.forEach(stu => {
        const sId = String(stu.id).trim();
        if (!sId || seenIds.has(sId)) return;
        seenIds.add(sId);
        const comp = compMap.get(sId);
        baseList.push({
          id: sId,
          name: stu.name || comp?.name || '',
          className: stu.className || comp?.className || currentClass,
          gender: stu.gender || 'Nam',
          birthDate: stu.birthDate || '',
          group: stu.group || comp?.group || 'Tổ 1',
          phone: stu.phone || '',
          status: stu.status || 'Đang học',
          note: stu.note || '',
          comp
        });
      });
      uniqueComps.forEach(comp => {
        const cId = String(comp.id).trim();
        if (cId && !seenIds.has(cId) && !stuMap.has(cId)) {
          seenIds.add(cId);
          baseList.push({
            id: cId,
            name: comp.name || '',
            className: comp.className || currentClass,
            gender: '—',
            birthDate: '',
            group: comp.group || 'Tổ 1',
            phone: '',
            status: 'Đang học',
            note: comp.note || '',
            comp
          });
        }
      });
    } else {
      uniqueComps.forEach(comp => {
        const cId = String(comp.id).trim();
        if (!cId || seenIds.has(cId)) return;
        seenIds.add(cId);
        baseList.push({
          id: cId,
          name: comp.name || '',
          className: comp.className || currentClass,
          gender: '—',
          birthDate: '',
          group: comp.group || 'Tổ 1',
          phone: '',
          status: 'Đang học',
          note: comp.note || '',
          comp
        });
      });
    }

    return baseList.map(item => {
      const weeklyParsed: Record<number, ParsedWeekDetail> = {};
      const weeklyEffectiveScore: Record<number, number> = {};
      const weeklyWarning: Record<number, boolean> = {};

      for (let w = 1; w <= 35; w++) {
        const key = `Tuan_${w}`;
        const rawScoreVal = item.comp?.weeklyScores ? item.comp.weeklyScores[key] : null;
        const hasWeeklyDetailsObj = Boolean(
          item.comp && item.comp.weeklyDetails && typeof item.comp.weeklyDetails === 'object'
        );
        const rawDetailFromComp = hasWeeklyDetailsObj
          ? String(item.comp?.weeklyDetails?.[key] ?? '').trim()
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
        } else if (item.comp && !isScoreEmpty) {
          const numVal = Number(rawScoreVal);
          const expectedTotal = numVal < 45 ? DEFAULT_WEEK_BASE_SCORE + numVal : numVal;
          const cached = weeklyDetailsMap[`${item.id}_${key}`] || '';
          const parsedCached = cached ? parseWeekCellDetail(cached, null) : null;
          effectiveDetail =
            parsedCached && parsedCached.hasRecord && parsedCached.totalPoints === expectedTotal
              ? cached
              : String(rawScoreVal);
        }

        const parsed = parseWeekCellDetail(
          effectiveDetail,
          isScoreEmpty ? null : Number(rawScoreVal)
        );
        weeklyParsed[w] = parsed;
        weeklyEffectiveScore[w] =
          parsed.hasRecord && parsed.totalPoints !== null
            ? Number(parsed.totalPoints)
            : DEFAULT_WEEK_BASE_SCORE;
        weeklyWarning[w] = isStudentWeekWarning(parsed, behaviorRules);
      }

      // Hàm tính thống kê cho dải tuần bất kỳ (VD: HK1 1..17, HK2 18..35, Cả năm 1..35)
      const computeRangeSummary = (startWeek: number, endWeek: number) => {
        let totalScore = 0;
        let totalPlus = 0;
        let totalMinus = 0;
        let warningCount = 0;
        let recordedWeeksCount = 0;
        const weekCount = endWeek - startWeek + 1;

        for (let w = startWeek; w <= endWeek; w++) {
          const p = weeklyParsed[w];
          const sc = weeklyEffectiveScore[w];
          totalScore += sc;
          totalPlus += p.plusPoints;
          totalMinus += p.minusPoints;
          if (p.hasRecord) recordedWeeksCount++;
          if (weeklyWarning[w]) warningCount++;
        }

        const avgScore = weekCount > 0 ? totalScore / weekCount : DEFAULT_WEEK_BASE_SCORE;
        const classification = getConductClassification(avgScore, warningCount);

        return {
          totalScore,
          avgScore,
          totalPlus,
          totalMinus,
          warningCount,
          recordedWeeksCount,
          classification
        };
      };

      const hk1 = computeRangeSummary(1, 17);
      const hk2 = computeRangeSummary(18, 35);
      const fullYear = computeRangeSummary(1, 35);

      return {
        ...item,
        weeklyParsed,
        weeklyEffectiveScore,
        weeklyWarning,
        hk1,
        hk2,
        fullYear
      };
    });
  }, [studentsList, competitionRows, weeklyDetailsMap, behaviorRules, currentClass]);

  const displayClassName = useMemo(() => {
    if (enrichedStudents.length > 0 && enrichedStudents[0].className) {
      return enrichedStudents[0].className;
    }
    return currentClass;
  }, [enrichedStudents, currentClass]);

  // Xếp hạng học sinh theo Tuần hiện tại, HK1, HK2, Cả năm
  const rankingsMap = useMemo(() => {
    const byWeek = [...enrichedStudents].sort((a, b) => {
      const diff = b.weeklyEffectiveScore[selectedWeek] - a.weeklyEffectiveScore[selectedWeek];
      if (diff !== 0) return diff;
      return b.fullYear.totalScore - a.fullYear.totalScore;
    });
    const byHK1 = [...enrichedStudents].sort((a, b) => b.hk1.totalScore - a.hk1.totalScore);
    const byHK2 = [...enrichedStudents].sort((a, b) => b.hk2.totalScore - a.hk2.totalScore);
    const byYear = [...enrichedStudents].sort((a, b) => b.fullYear.totalScore - a.fullYear.totalScore);

    const weekRank = new Map<string, number>();
    const hk1Rank = new Map<string, number>();
    const hk2Rank = new Map<string, number>();
    const yearRank = new Map<string, number>();

    byWeek.forEach((s, idx) => weekRank.set(s.id, idx + 1));
    byHK1.forEach((s, idx) => hk1Rank.set(s.id, idx + 1));
    byHK2.forEach((s, idx) => hk2Rank.set(s.id, idx + 1));
    byYear.forEach((s, idx) => yearRank.set(s.id, idx + 1));

    return { weekRank, hk1Rank, hk2Rank, yearRank };
  }, [enrichedStudents, selectedWeek]);

  // Thống kê chi tiết các Tổ từ Google Sheet (Hỗ trợ đủ 8 Tổ)
  const availableGroups = useMemo(() => {
    return extractAvailableGroups(enrichedStudents);
  }, [enrichedStudents]);

  const groupSummaryStats = useMemo(() => {
    const groups = availableGroups;
    const raw = groups.map(grpName => {
      const cleanGrp = grpName.trim().toLowerCase();
      const cleanGrpNoSpace = cleanGrp.replace(/\s+/g, '');
      const members = enrichedStudents.filter(s => {
        const sGrp = (s.group || '').trim().toLowerCase();
        const sGrpNoSpace = sGrp.replace(/\s+/g, '');
        return sGrp === cleanGrp || sGrpNoSpace === cleanGrpNoSpace || sGrp.includes(cleanGrp);
      });
      const count = members.length;

      let weekTotal = 0;
      let weekPlus = 0;
      let weekMinus = 0;
      let weekWarn = 0;

      let hk1Total = 0;
      let hk1Plus = 0;
      let hk1Minus = 0;
      let hk1Warn = 0;

      let hk2Total = 0;
      let hk2Plus = 0;
      let hk2Minus = 0;
      let hk2Warn = 0;

      let yearTotal = 0;

      members.forEach(m => {
        const wkP = m.weeklyParsed[selectedWeek];
        weekTotal += m.weeklyEffectiveScore[selectedWeek];
        weekPlus += wkP.plusPoints;
        weekMinus += wkP.minusPoints;
        if (m.weeklyWarning[selectedWeek]) weekWarn++;

        hk1Total += m.hk1.totalScore;
        hk1Plus += m.hk1.totalPlus;
        hk1Minus += m.hk1.totalMinus;
        hk1Warn += m.hk1.warningCount;

        hk2Total += m.hk2.totalScore;
        hk2Plus += m.hk2.totalPlus;
        hk2Minus += m.hk2.totalMinus;
        hk2Warn += m.hk2.warningCount;

        yearTotal += m.fullYear.totalScore;
      });

      const weekAvg = count > 0 ? weekTotal / count : DEFAULT_WEEK_BASE_SCORE;
      const hk1Avg = count > 0 ? hk1Total / count : DEFAULT_WEEK_BASE_SCORE * 17;
      const hk2Avg = count > 0 ? hk2Total / count : DEFAULT_WEEK_BASE_SCORE * 18;
      const yearAvg = count > 0 ? yearTotal / count : DEFAULT_WEEK_BASE_SCORE * 35;

      return {
        groupName: grpName,
        memberCount: count,
        weekTotal,
        weekAvg,
        weekPlus,
        weekMinus,
        weekWarn,
        hk1Total,
        hk1Avg,
        hk1Plus,
        hk1Minus,
        hk1Warn,
        hk2Total,
        hk2Avg,
        hk2Plus,
        hk2Minus,
        hk2Warn,
        yearTotal,
        yearAvg,
        members
      };
    });

    const sortedByWeek = [...raw].sort((a, b) => b.weekAvg - a.weekAvg);
    const sortedByHK1 = [...raw].sort((a, b) => b.hk1Avg - a.hk1Avg);
    const sortedByHK2 = [...raw].sort((a, b) => b.hk2Avg - a.hk2Avg);
    const sortedByYear = [...raw].sort((a, b) => b.yearAvg - a.yearAvg);

    return raw.map(g => ({
      ...g,
      weekRank: sortedByWeek.findIndex(x => x.groupName === g.groupName) + 1,
      hk1Rank: sortedByHK1.findIndex(x => x.groupName === g.groupName) + 1,
      hk2Rank: sortedByHK2.findIndex(x => x.groupName === g.groupName) + 1,
      yearRank: sortedByYear.findIndex(x => x.groupName === g.groupName) + 1
    }));
  }, [enrichedStudents, selectedWeek]);

  // Lọc học sinh theo Tổ & Ô tìm kiếm
  const filteredStudents = useMemo(() => {
    return enrichedStudents.filter(s => {
      if (selectedGroupFilter !== 'Tất cả') {
        const sGrp = (s.group || '').toLowerCase().trim();
        const target = selectedGroupFilter.toLowerCase().trim();
        if (!sGrp.includes(target) && sGrp !== target) return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = (s.name || '').toLowerCase().includes(q);
        const matchId = (s.id || '').toLowerCase().includes(q);
        const matchPhone = (s.phone || '').toLowerCase().includes(q);
        const matchGroup = (s.group || '').toLowerCase().includes(q);
        const matchNote = (s.note || '').toLowerCase().includes(q);
        return matchName || matchId || matchPhone || matchGroup || matchNote;
      }
      return true;
    });
  }, [enrichedStudents, selectedGroupFilter, searchTerm]);

  // ============================================================================
  // HÀM TẠO WORKSHEET EXCEL (.XLSX) VỚI ĐỘ RỘNG CỘT CHUẨN ĐẸP
  // ============================================================================
  const autoFitWorksheetColumns = (ws: XLSX.WorkSheet, rows: any[]) => {
    if (!rows || rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    ws['!cols'] = keys.map(key => {
      let maxLen = key.length + 4;
      rows.forEach(r => {
        const val = r[key] !== null && r[key] !== undefined ? String(r[key]) : '';
        if (val.length > maxLen) maxLen = Math.min(val.length + 3, 52);
      });
      return { wch: Math.max(maxLen, 10) };
    });
  };

  const buildStudentsSheetRows = (list = filteredStudents) =>
    list.map((st, idx) => ({
      STT: idx + 1,
      'Mã Học Sinh': st.id,
      Lớp: st.className || displayClassName,
      'Họ và Tên': st.name,
      'Giới tính': st.gender || '—',
      Tổ: st.group || '—',
      'Ngày sinh': st.birthDate || '—',
      'Số điện thoại': st.phone ? (st.phone.startsWith('0') ? st.phone : `0${st.phone}`) : '—',
      'Trạng thái': st.status || 'Đang học',
      'Ghi chú / Chức vụ': st.note || ''
    }));

  const buildWeeklyAllSheetRows = (weekNum = selectedWeek, list = filteredStudents) =>
    list.map((st, idx) => {
      const p = st.weeklyParsed[weekNum];
      const eff = st.weeklyEffectiveScore[weekNum];
      const isWarn = st.weeklyWarning[weekNum];
      return {
        STT: idx + 1,
        [`Hạng Tuần ${weekNum}`]: rankingsMap.weekRank.get(st.id) || idx + 1,
        'Mã Học Sinh': st.id,
        'Họ và Tên': st.name,
        Lớp: st.className || displayClassName,
        Tổ: st.group,
        [`Chi tiết hành vi (Tuần ${weekNum})`]: p.hasRecord ? p.behaviorsText : 'Chưa phát sinh (Mặc định 100đ)',
        'Điểm mặc định': DEFAULT_WEEK_BASE_SCORE,
        'Điểm Cộng (+)': p.plusPoints > 0 ? `+${p.plusPoints}` : 0,
        'Điểm Trừ (-)': p.minusPoints < 0 ? p.minusPoints : 0,
        [`Tổng Điểm Tuần ${weekNum}`]: eff,
        'Cảnh báo': isWarn ? 'CẢNH BÁO VI PHẠM' : 'Bình thường',
        'Ghi chú': st.note || ''
      };
    });

  const buildGroupsSummarySheetRows = () =>
    groupSummaryStats.map((g, idx) => ({
      STT: idx + 1,
      'Tên Tổ': g.groupName,
      'Sĩ số Tổ': g.memberCount,
      [`Tổng điểm Tuần ${selectedWeek}`]: g.weekTotal,
      [`Điểm TB Tuần ${selectedWeek}`]: Number(formatAvg(g.weekAvg)),
      [`Điểm Cộng Tuần ${selectedWeek}`]: g.weekPlus,
      [`Điểm Trừ Tuần ${selectedWeek}`]: g.weekMinus,
      [`Cảnh báo Tuần ${selectedWeek}`]: g.weekWarn,
      [`Hạng Tuần ${selectedWeek}`]: g.weekRank,
      'Điểm TB Học Kì 1 (T1-T17)': Number(formatAvg(g.hk1Avg)),
      'Hạng HK1': g.hk1Rank,
      'Điểm TB Học Kì 2 (T18-T35)': Number(formatAvg(g.hk2Avg)),
      'Hạng HK2': g.hk2Rank,
      'Điểm TB Cả Năm (35 Tuần)': Number(formatAvg(g.yearAvg)),
      'Hạng Cả Năm': g.yearRank
    }));

  const buildSemesterSheetRows = (
    startWeek: number,
    endWeek: number,
    semesterLabel: string,
    list = filteredStudents
  ) =>
    list.map((st, idx) => {
      const isHK1 = startWeek === 1 && endWeek === 17;
      const isHK2 = startWeek === 18 && endWeek === 35;
      const summary = isHK1 ? st.hk1 : isHK2 ? st.hk2 : st.fullYear;
      const rank = isHK1
        ? rankingsMap.hk1Rank.get(st.id)
        : isHK2
        ? rankingsMap.hk2Rank.get(st.id)
        : rankingsMap.yearRank.get(st.id);

      const rowObj: Record<string, any> = {
        STT: idx + 1,
        [`Hạng ${semesterLabel}`]: rank || idx + 1,
        'Mã Học Sinh': st.id,
        'Họ và Tên': st.name,
        Lớp: st.className || displayClassName,
        Tổ: st.group
      };

      for (let w = startWeek; w <= endWeek; w++) {
        rowObj[`T${w}`] = st.weeklyEffectiveScore[w];
      }

      rowObj[`Tổng Cộng (+) ${semesterLabel}`] = summary.totalPlus;
      rowObj[`Tổng Trừ (-) ${semesterLabel}`] = summary.totalMinus;
      rowObj[`Số tuần Cảnh báo`] = summary.warningCount;
      rowObj[`Tổng điểm ${semesterLabel}`] = summary.totalScore;
      rowObj[`Điểm TB/Tuần ${semesterLabel}`] = Number(formatAvg(summary.avgScore));
      rowObj[`Xếp loại Rèn luyện ${semesterLabel}`] = summary.classification;

      return rowObj;
    });

  // Xuất file Excel (.xlsx) cho loại báo cáo đang chọn
  const handleDownloadCurrentReportXlsx = () => {
    try {
      const wb = XLSX.utils.book_new();
      let fileName = `Bao_Cao_Lop_${displayClassName}.xlsx`;

      if (activeReport === 'students_list') {
        const rows = buildStudentsSheetRows(filteredStudents);
        const ws = XLSX.utils.json_to_sheet(rows);
        autoFitWorksheetColumns(ws, rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Danh_Sach_Hoc_Sinh');
        fileName = `Danh_Sach_Hoc_Sinh_Lop_${displayClassName}_${selectedGroupFilter === 'Tất cả' ? 'Toan_Lop' : selectedGroupFilter.replace(/\s+/g, '_')}.xlsx`;
      } else if (activeReport === 'weekly_all') {
        const rows = buildWeeklyAllSheetRows(selectedWeek, filteredStudents);
        const ws = XLSX.utils.json_to_sheet(rows);
        autoFitWorksheetColumns(ws, rows);
        XLSX.utils.book_append_sheet(wb, ws, `Thi_Dua_Tuan_${selectedWeek}`);
        fileName = `Bao_Cao_Thi_Dua_Tuan_${selectedWeek}_Lop_${displayClassName}.xlsx`;
      } else if (activeReport === 'weekly_groups') {
        // Sheet 1: Tổng hợp xếp hạng các Tổ
        const summaryRows = buildGroupsSummarySheetRows();
        const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
        autoFitWorksheetColumns(wsSummary, summaryRows);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Xep_Hang_Cac_To');

        // Sheet 2..N: Chi tiết từng Tổ (Tổ 1..Tổ 8...)
        availableGroups.forEach((grpName, idx) => {
          const cleanGrp = grpName.trim().toLowerCase();
          const cleanGrpNoSpace = cleanGrp.replace(/\s+/g, '');
          const grpMembers = enrichedStudents.filter(s => {
            const sGrp = (s.group || '').trim().toLowerCase();
            const sGrpNoSpace = sGrp.replace(/\s+/g, '');
            return sGrp === cleanGrp || sGrpNoSpace === cleanGrpNoSpace || sGrp.includes(cleanGrp);
          });
          const grpRows = buildWeeklyAllSheetRows(selectedWeek, grpMembers);
          const wsGrp = XLSX.utils.json_to_sheet(grpRows);
          autoFitWorksheetColumns(wsGrp, grpRows);
          const safeTabName = grpName.replace(/\s+/g, '_');
          XLSX.utils.book_append_sheet(wb, wsGrp, `${safeTabName}_Tuan_${selectedWeek}`);
        });
        fileName = `Bao_Cao_Thi_Dua_${availableGroups.length}_To_Tuan_${selectedWeek}_Lop_${displayClassName}.xlsx`;
      } else if (activeReport === 'semester_1') {
        const rows = buildSemesterSheetRows(1, 17, 'HK1', filteredStudents);
        const ws = XLSX.utils.json_to_sheet(rows);
        autoFitWorksheetColumns(ws, rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Thong_Ke_HK1_T1_T17');
        fileName = `Thong_Ke_Thi_Dua_Hoc_Ki_1_Tuan_1_17_Lop_${displayClassName}.xlsx`;
      } else if (activeReport === 'semester_2') {
        const rows = buildSemesterSheetRows(18, 35, 'HK2', filteredStudents);
        const ws = XLSX.utils.json_to_sheet(rows);
        autoFitWorksheetColumns(ws, rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Thong_Ke_HK2_T18_T35');
        fileName = `Thong_Ke_Thi_Dua_Hoc_Ki_2_Tuan_18_35_Lop_${displayClassName}.xlsx`;
      } else {
        const rows = buildSemesterSheetRows(1, 35, 'Ca_Nam', filteredStudents);
        const ws = XLSX.utils.json_to_sheet(rows);
        autoFitWorksheetColumns(ws, rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Tong_Hop_Ca_Nam_35_Tuan');
        fileName = `Tong_Hop_Thi_Dua_Ca_Nam_35_Tuan_Lop_${displayClassName}.xlsx`;
      }

      XLSX.writeFile(wb, fileName);
      showToast(`📥 Đã tải xuống tệp Excel: ${fileName}`);
    } catch (err) {
      console.error('Lỗi xuất file Excel:', err);
      showToast('⚠️ Có lỗi khi tạo tệp Excel (.xlsx). Vui lòng thử lại.');
    }
  };

  // Xuất trọn bộ Sổ Báo Cáo Lớp Chủ Nhiệm (Tất cả các báo cáo trong 1 file .xlsx đa Sheet)
  const handleDownloadFullWorkbookXlsx = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1. Danh sách học sinh
      const stuRows = buildStudentsSheetRows(enrichedStudents);
      const wsStu = XLSX.utils.json_to_sheet(stuRows);
      autoFitWorksheetColumns(wsStu, stuRows);
      XLSX.utils.book_append_sheet(wb, wsStu, '01_Danh_Sach_HS');

      // 2. Thi đua Tuần hiện tại
      const wkRows = buildWeeklyAllSheetRows(selectedWeek, enrichedStudents);
      const wsWk = XLSX.utils.json_to_sheet(wkRows);
      autoFitWorksheetColumns(wsWk, wkRows);
      XLSX.utils.book_append_sheet(wb, wsWk, `02_Thi_Dua_Tuan_${selectedWeek}`);

      // 3. Thi đua 4 Tổ
      const grpRows = buildGroupsSummarySheetRows();
      const wsGrp = XLSX.utils.json_to_sheet(grpRows);
      autoFitWorksheetColumns(wsGrp, grpRows);
      XLSX.utils.book_append_sheet(wb, wsGrp, '03_Thi_Dua_4_To');

      // 4. Học kì 1 (Tuần 1 -> Tuần 17)
      const hk1Rows = buildSemesterSheetRows(1, 17, 'HK1', enrichedStudents);
      const wsHK1 = XLSX.utils.json_to_sheet(hk1Rows);
      autoFitWorksheetColumns(wsHK1, hk1Rows);
      XLSX.utils.book_append_sheet(wb, wsHK1, '04_Hoc_Ki_1_T1_T17');

      // 5. Học kì 2 (Tuần 18 -> Tuần 35)
      const hk2Rows = buildSemesterSheetRows(18, 35, 'HK2', enrichedStudents);
      const wsHK2 = XLSX.utils.json_to_sheet(hk2Rows);
      autoFitWorksheetColumns(wsHK2, hk2Rows);
      XLSX.utils.book_append_sheet(wb, wsHK2, '05_Hoc_Ki_2_T18_T35');

      // 6. Cả năm (Tuần 1 -> Tuần 35)
      const yearRows = buildSemesterSheetRows(1, 35, 'Ca_Nam', enrichedStudents);
      const wsYear = XLSX.utils.json_to_sheet(yearRows);
      autoFitWorksheetColumns(wsYear, yearRows);
      XLSX.utils.book_append_sheet(wb, wsYear, '06_Ca_Nam_35_Tuan');

      const fileName = `So_Bao_Cao_Tong_Hop_Lop_${displayClassName}_Tuan_${selectedWeek}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast(`📦 Đã tải xuống Trọn Bộ Sổ Báo Cáo (6 Sheets): ${fileName}`);
    } catch (err) {
      console.error('Lỗi xuất trọn bộ Excel:', err);
      showToast('⚠️ Có lỗi khi tạo tệp Excel tổng hợp.');
    }
  };

  const reportTabs: Array<{
    id: ReportCategory;
    title: string;
    subtitle: string;
    icon: string;
    badge: string;
  }> = [
    {
      id: 'students_list',
      title: 'DS học sinh',
      subtitle: 'Hồ sơ thông tin, Tổ, SĐT, Chức vụ',
      icon: '👥',
      badge: `${enrichedStudents.length} HS`
    },
    {
      id: 'weekly_groups',
      title: 'Thi Đua Tổ',
      subtitle: 'Xếp hạng 4 Tổ & chi tiết từng Tổ',
      icon: '🏆',
      badge: '4 Tổ'
    },
    {
      id: 'semester_1',
      title: 'Thống kê HK1',
      subtitle: 'Từ Tuần 1 đến Tuần 17 (17 tuần)',
      icon: '📗',
      badge: 'Tuần 1 → 17'
    },
    {
      id: 'semester_2',
      title: 'Thống kê HK2',
      subtitle: 'Từ Tuần 18 đến Tuần 35 (18 tuần)',
      icon: '📘',
      badge: 'Tuần 18 → 35'
    },
    {
      id: 'full_year',
      title: 'Tổng hợp Cả Năm',
      subtitle: 'Toàn bộ 35 tuần & Xếp loại rèn luyện',
      icon: '🎓',
      badge: 'Tuần 1 → 35'
    }
  ];

  const groupFilters = useMemo(() => {
    return ['Tất cả', ...availableGroups];
  }, [availableGroups]);

  const currentReportMeta = reportTabs.find(t => t.id === activeReport) || reportTabs[0];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Toast thông báo tải file */}
      {toastMsg && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:bottom-6 sm:right-6 z-50 bg-[#14532d] text-white text-xs sm:text-sm font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-emerald-400">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. KHU VỰC CHỌN LOẠI BÁO CÁO (5 THẺ CHỨC NĂNG BÁO CÁO) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
        {reportTabs.map(tab => {
          const isActive = activeReport === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveReport(tab.id)}
              className={`p-3 sm:p-4 rounded-2xl sm:rounded-3xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                isActive
                  ? 'bg-emerald-900 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/30'
                  : 'bg-white hover:bg-emerald-50/50 text-slate-800 border-gray-200/90 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl shrink-0 ${
                    isActive ? 'bg-white/15 text-white' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {tab.icon}
                </span>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-400/25 text-emerald-100 border border-emerald-400/40'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.badge}
                </span>
              </div>
              <div>
                <div className={`font-extrabold text-xs sm:text-sm leading-snug ${isActive ? 'text-white' : 'text-slate-900'}`}>
                  {tab.title}
                </div>
                <div className={`text-[10px] sm:text-[11px] mt-0.5 line-clamp-2 ${isActive ? 'text-emerald-100/90' : 'text-slate-500'}`}>
                  {tab.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. THANH CÔNG CỤ LỌC, CHỌN TUẦN & NÚT TẢI XUỐNG EXCEL (.XLSX) */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border border-gray-200/80 shadow-xs space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-2xl shrink-0">
              {currentReportMeta.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  Xem trước: {currentReportMeta.title}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                  Lớp {displayClassName}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentReportMeta.subtitle} • Dữ liệu đồng bộ trực tiếp từ Google Sheet
              </p>
            </div>
          </div>

          {/* Cụm nút Tải xuống Excel (.xlsx) */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadCurrentReportXlsx}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-[#047857] hover:bg-[#065f46] active:scale-95 text-white font-extrabold text-xs sm:text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>📥</span>
              <span>Tải xuống Báo cáo này (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadFullWorkbookXlsx}
              className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs sm:text-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Tải xuống 1 file Excel chứa đủ 6 Sheet: Danh sách HS, Tuần hiện tại, 4 Tổ, Học kì 1, Học kì 2, Cả năm"
            >
              <span>📦</span>
              <span>Tải Trọn Bộ 6 Sheet (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Bộ lọc tìm kiếm, chọn Tổ và chọn Tuần */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
            {/* Tìm kiếm */}
            <div className="relative flex-1 sm:max-w-xs">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none text-xs">
                🔍
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Tìm tên học sinh, mã HS, SĐT..."
                className="w-full pl-8 pr-7 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-emerald-600"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Chọn Tuần báo cáo */}
            {(activeReport === 'weekly_all' || activeReport === 'weekly_groups') && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Tuần báo cáo:</span>
                <select
                  value={selectedWeek}
                  onChange={e => onWeekChange?.(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 font-extrabold text-xs sm:text-sm cursor-pointer focus:outline-none"
                >
                  {Array.from({ length: 35 }, (_, i) => i + 1).map(w => (
                    <option key={w} value={w}>
                      📅 Tuần {w} {w <= 17 ? '(HK1)' : '(HK2)'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Bật/tắt hiển thị từng cột tuần trong bảng Học kì 1 / Học kì 2 / Cả năm */}
            {(activeReport === 'semester_1' || activeReport === 'semester_2' || activeReport === 'full_year') && (
              <button
                type="button"
                onClick={() => setShowWeekColumnsInSemester(!showWeekColumnsInSemester)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  showWeekColumnsInSemester
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {showWeekColumnsInSemester ? '👁️ Đang hiện điểm từng tuần' : '📋 Thu gọn cột tuần'}
              </button>
            )}
          </div>

          {/* Bộ lọc Tổ */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 overflow-x-auto no-scrollbar">
            {groupFilters.map(grp => {
              const isSelected = selectedGroupFilter === grp;
              return (
                <button
                  key={grp}
                  type="button"
                  onClick={() => setSelectedGroupFilter(grp)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    isSelected
                      ? 'bg-white text-[#047857] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {grp}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================
          3. KHUNG XEM TRƯỚC BÁO CÁO (PREVIEW TABLE)
         ======================================================================== */}

      {/* TRƯỜNG HỢP 1: DANH SÁCH THÔNG TIN HỌC SINH */}
      {activeReport === 'students_list' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs sm:text-sm font-extrabold text-slate-800">
              📋 Bảng xem trước: Danh sách thông tin học sinh ({filteredStudents.length} học sinh)
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              Nguồn: Sheet 02_HOC_SINH
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100/80 border-b border-gray-200 text-[11px] font-extrabold text-slate-600 uppercase">
                  <th className="py-3 px-3 text-center w-12">STT</th>
                  <th className="py-3 px-3">Mã HS</th>
                  <th className="py-3 px-3">Lớp</th>
                  <th className="py-3 px-3">Họ và Tên</th>
                  <th className="py-3 px-3 text-center">Giới tính</th>
                  <th className="py-3 px-3 text-center">Tổ</th>
                  <th className="py-3 px-3">Ngày sinh</th>
                  <th className="py-3 px-3">Số điện thoại</th>
                  <th className="py-3 px-3 text-center">Trạng thái</th>
                  <th className="py-3 px-3">Ghi chú / Chức vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.map((st, idx) => (
                  <tr key={`${st.id || 'stu'}_list_${idx}`} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{st.id}</td>
                    <td className="py-2.5 px-3 font-bold text-emerald-700">{st.className}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{st.name}</td>
                    <td className="py-2.5 px-3 text-center">{st.gender}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700">{st.group}</td>
                    <td className="py-2.5 px-3 text-slate-600">{st.birthDate || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-700 font-semibold">
                      {st.phone ? (st.phone.startsWith('0') ? st.phone : `0${st.phone}`) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
                        {st.status || 'Đang học'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{st.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRƯỜNG HỢP 2: THI ĐUA CỦA TẤT CẢ HỌC SINH THEO TUẦN */}
      {activeReport === 'weekly_all' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs sm:text-sm font-extrabold text-slate-800">
              📋 Bảng xem trước: Báo cáo Thi Đua Toàn Lớp — Tuần {selectedWeek} ({filteredStudents.length} học sinh)
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              Điểm gốc: 100đ + Điểm cộng - Điểm trừ
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100/80 border-b border-gray-200 text-[11px] font-extrabold text-slate-600 uppercase">
                  <th className="py-3 px-3 text-center w-12">STT</th>
                  <th className="py-3 px-3 text-center w-16">Hạng</th>
                  <th className="py-3 px-3">Mã HS</th>
                  <th className="py-3 px-3">Họ và Tên</th>
                  <th className="py-3 px-3 text-center">Tổ</th>
                  <th className="py-3 px-3">Chi tiết hành vi ghi nhận (Tuần {selectedWeek})</th>
                  <th className="py-3 px-3 text-center">Điểm gốc</th>
                  <th className="py-3 px-3 text-center text-emerald-700">Điểm Cộng</th>
                  <th className="py-3 px-3 text-center text-red-600">Điểm Trừ</th>
                  <th className="py-3 px-3 text-center">Tổng Tuần {selectedWeek}</th>
                  <th className="py-3 px-3 text-center">Cảnh báo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.map((st, idx) => {
                  const p = st.weeklyParsed[selectedWeek];
                  const eff = st.weeklyEffectiveScore[selectedWeek];
                  const isWarn = st.weeklyWarning[selectedWeek];
                  const rank = rankingsMap.weekRank.get(st.id) || idx + 1;
                  return (
                    <tr key={`${st.id || 'stu'}_wk_${idx}`} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-extrabold text-xs">
                          {rank}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{st.id}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{st.name}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-700">{st.group}</td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-md">
                        {p.hasRecord ? (
                          <span className="font-medium">{p.behaviorsText}</span>
                        ) : (
                          <span className="text-slate-400 italic">Chưa phát sinh (100đ)</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-500">100</td>
                      <td className="py-2.5 px-3 text-center font-extrabold text-emerald-700">
                        {p.plusPoints > 0 ? `+${p.plusPoints}` : '0'}
                      </td>
                      <td className="py-2.5 px-3 text-center font-extrabold text-red-600">
                        {p.minusPoints < 0 ? p.minusPoints : '0'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-black text-xs ${
                            eff > 100
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : eff < 100
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {eff}đ
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isWarn ? (
                          <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-extrabold text-[10px]">
                            ⚠️ Cảnh Báo
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRƯỜNG HỢP 3: BÁO CÁO THI ĐUA TỔ (TỔ 1, TỔ 2, TỔ 3, TỔ 4) */}
      {activeReport === 'weekly_groups' && (
        <div className="space-y-5">
          {/* Bảng 1: Tổng hợp so sánh 4 Tổ */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
            <div className="px-4 py-3 bg-emerald-900 text-white flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs sm:text-sm font-extrabold">
                🏆 Bảng 1: Tổng hợp Xếp hạng Thi Đua 4 Tổ (Tuần {selectedWeek}, Học kì 1, Học kì 2 & Cả Năm)
              </span>
              <span className="text-[11px] text-emerald-100">
                Điểm Tổ = Tổng điểm các thành viên chia trung bình
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b border-gray-200 text-[11px] font-extrabold text-slate-600 uppercase">
                    <th className="py-3 px-3">Tổ</th>
                    <th className="py-3 px-3 text-center">Sĩ số</th>
                    <th className="py-3 px-3 text-center">Tổng Tuần {selectedWeek}</th>
                    <th className="py-3 px-3 text-center">TB Tuần {selectedWeek}</th>
                    <th className="py-3 px-3 text-center text-emerald-700">Cộng (+)</th>
                    <th className="py-3 px-3 text-center text-red-600">Trừ (-)</th>
                    <th className="py-3 px-3 text-center">Hạng Tuần {selectedWeek}</th>
                    <th className="py-3 px-3 text-center bg-emerald-50/60">TB HK1 (T1-17)</th>
                    <th className="py-3 px-3 text-center bg-emerald-50/60">Hạng HK1</th>
                    <th className="py-3 px-3 text-center bg-blue-50/60">TB HK2 (T18-35)</th>
                    <th className="py-3 px-3 text-center bg-blue-50/60">Hạng HK2</th>
                    <th className="py-3 px-3 text-center bg-amber-50/60">TB Cả Năm</th>
                    <th className="py-3 px-3 text-center bg-amber-50/60">Hạng Năm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {groupSummaryStats.map(g => (
                    <tr key={g.groupName} className="hover:bg-slate-50/80 font-medium">
                      <td className="py-3 px-3 font-black text-slate-900">{g.groupName}</td>
                      <td className="py-3 px-3 text-center font-bold text-slate-600">{g.memberCount} HS</td>
                      <td className="py-3 px-3 text-center font-bold text-slate-800">{g.weekTotal}đ</td>
                      <td className="py-3 px-3 text-center font-black text-emerald-700">{formatAvg(g.weekAvg)}đ</td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-600">+{g.weekPlus}đ</td>
                      <td className="py-3 px-3 text-center font-bold text-red-600">{g.weekMinus}đ</td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-black text-xs">
                          Hạng #{g.weekRank}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-bold bg-emerald-50/30">{formatAvg(g.hk1Avg)}đ</td>
                      <td className="py-3 px-3 text-center font-extrabold text-emerald-800 bg-emerald-50/30">#{g.hk1Rank}</td>
                      <td className="py-3 px-3 text-center font-bold bg-blue-50/30">{formatAvg(g.hk2Avg)}đ</td>
                      <td className="py-3 px-3 text-center font-extrabold text-blue-800 bg-blue-50/30">#{g.hk2Rank}</td>
                      <td className="py-3 px-3 text-center font-black text-amber-900 bg-amber-50/30">{formatAvg(g.yearAvg)}đ</td>
                      <td className="py-3 px-3 text-center font-black text-amber-900 bg-amber-50/30">#{g.yearRank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bảng chi tiết từng Tổ (Tổ 1, Tổ 2, Tổ 3, Tổ 4) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {groupSummaryStats
              .filter(g => selectedGroupFilter === 'Tất cả' || g.groupName === selectedGroupFilter)
              .map(g => (
                <div
                  key={g.groupName}
                  className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden"
                >
                  <div className="px-4 py-3 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 text-sm">{g.groupName}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-bold">
                        {g.memberCount} thành viên
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-extrabold">
                      <span className="text-emerald-700">TB Tuần {selectedWeek}: {formatAvg(g.weekAvg)}đ</span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900">
                        Hạng #{g.weekRank}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/60 border-b border-gray-100 text-[10px] font-extrabold text-slate-500 uppercase">
                          <th className="py-2 px-3 text-center w-10">STT</th>
                          <th className="py-2 px-3">Họ và Tên</th>
                          <th className="py-2 px-3">Hành vi Tuần {selectedWeek}</th>
                          <th className="py-2 px-3 text-center">Điểm Tuần</th>
                          <th className="py-2 px-3 text-center">TB HK1</th>
                          <th className="py-2 px-3 text-center">TB HK2</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {g.members.map((m, mIdx) => {
                          const p = m.weeklyParsed[selectedWeek];
                          const sc = m.weeklyEffectiveScore[selectedWeek];
                          return (
                            <tr key={`${m.id || 'mem'}_${mIdx}`} className="hover:bg-slate-50">
                              <td className="py-2 px-3 text-center text-slate-400 font-bold">{mIdx + 1}</td>
                              <td className="py-2 px-3 font-bold text-slate-900">{m.name}</td>
                              <td className="py-2 px-3 text-slate-600 max-w-[200px] truncate">
                                {p.hasRecord ? p.behaviorsText : 'Mặc định (100đ)'}
                              </td>
                              <td className="py-2 px-3 text-center font-black text-emerald-700">{sc}đ</td>
                              <td className="py-2 px-3 text-center font-semibold text-slate-600">
                                {formatAvg(m.hk1.avgScore)}
                              </td>
                              <td className="py-2 px-3 text-center font-semibold text-slate-600">
                                {formatAvg(m.hk2.avgScore)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TRƯỜNG HỢP 4, 5, 6: THỐNG KÊ HỌC KÌ 1 (T1-T17), HỌC KÌ 2 (T18-T35), HOẶC CẢ NĂM (T1-T35) */}
      {(activeReport === 'semester_1' ||
        activeReport === 'semester_2' ||
        activeReport === 'full_year') && (() => {
        const startW = activeReport === 'semester_2' ? 18 : 1;
        const endW = activeReport === 'semester_1' ? 17 : 35;
        const periodTitle =
          activeReport === 'semester_1'
            ? 'Học kì 1 (Tuần 1 → Tuần 17)'
            : activeReport === 'semester_2'
            ? 'Học kì 2 (Tuần 18 → Tuần 35)'
            : 'Cả Năm Học (Tuần 1 → Tuần 35)';
        const weeksArray = Array.from({ length: endW - startW + 1 }, (_, i) => startW + i);

        return (
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs sm:text-sm font-extrabold text-slate-800">
                📊 Bảng xem trước: Thống kê Thi Đua {periodTitle} ({filteredStudents.length} học sinh)
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                 Cuộn ngang để xem chi tiết từng tuần hoặc bấm &ldquo;Tải xuống Báo cáo này (.xlsx)&rdquo;
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-gray-200 text-[11px] font-extrabold text-slate-600 uppercase">
                    <th className="py-3 px-2.5 text-center sticky left-0 bg-slate-100 z-10 w-10">STT</th>
                    <th className="py-3 px-2.5 text-center w-14">Hạng</th>
                    <th className="py-3 px-3 sticky left-10 bg-slate-100 z-10 min-w-[155px]">Họ và Tên</th>
                    <th className="py-3 px-2.5 text-center min-w-[64px]">Tổ</th>
                    {showWeekColumnsInSemester &&
                      weeksArray.map(w => (
                        <th key={w} className="py-3 px-2 text-center min-w-[46px] font-bold text-slate-500">
                          T{w}
                        </th>
                      ))}
                    <th className="py-3 px-2.5 text-center text-emerald-700 min-w-[70px]">Tổng (+)</th>
                    <th className="py-3 px-2.5 text-center text-red-600 min-w-[70px]">Tổng (-)</th>
                    <th className="py-3 px-2.5 text-center min-w-[75px]">Cảnh báo</th>
                    <th className="py-3 px-3 text-center bg-emerald-50 text-emerald-900 min-w-[85px]">Tổng điểm</th>
                    <th className="py-3 px-3 text-center bg-amber-50 text-amber-900 min-w-[80px]">TB/Tuần</th>
                    <th className="py-3 px-3 text-center min-w-[90px]">Xếp loại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStudents.map((st, idx) => {
                    const summary =
                      activeReport === 'semester_1'
                        ? st.hk1
                        : activeReport === 'semester_2'
                        ? st.hk2
                        : st.fullYear;
                    const rank =
                      activeReport === 'semester_1'
                        ? rankingsMap.hk1Rank.get(st.id)
                        : activeReport === 'semester_2'
                        ? rankingsMap.hk2Rank.get(st.id)
                        : rankingsMap.yearRank.get(st.id);

                    const badgeColor =
                      summary.classification === 'Tốt'
                        ? 'bg-emerald-100 text-emerald-800'
                        : summary.classification === 'Khá'
                        ? 'bg-blue-100 text-blue-800'
                        : summary.classification === 'Đạt'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800';

                    return (
                      <tr key={`${st.id || 'stu'}_sem_${idx}`} className="hover:bg-slate-50/90">
                        <td className="py-2.5 px-2.5 text-center font-bold text-slate-400 sticky left-0 bg-white">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-800 font-black text-[11px]">
                            {rank || idx + 1}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 sticky left-10 bg-white whitespace-nowrap">
                          {st.name}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-bold text-slate-600 whitespace-nowrap">
                          {st.group}
                        </td>
                        {showWeekColumnsInSemester &&
                          weeksArray.map(w => {
                            const sc = st.weeklyEffectiveScore[w];
                            const hasRec = st.weeklyParsed[w].hasRecord;
                            return (
                              <td
                                key={w}
                                className={`py-2.5 px-1.5 text-center font-semibold ${
                                  !hasRec
                                    ? 'text-slate-300'
                                    : sc > 100
                                    ? 'text-emerald-700 font-bold bg-emerald-50/40'
                                    : sc < 100
                                    ? 'text-red-600 font-bold bg-red-50/40'
                                    : 'text-slate-700'
                                }`}
                              >
                                {sc}
                              </td>
                            );
                          })}
                        <td className="py-2.5 px-2.5 text-center font-bold text-emerald-700">
                          +{summary.totalPlus}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-bold text-red-600">
                          {summary.totalMinus}
                        </td>
                        <td className="py-2.5 px-2.5 text-center">
                          {summary.warningCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-black text-[11px]">
                              {summary.warningCount} lần
                            </span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-black text-emerald-900 bg-emerald-50/40">
                          {summary.totalScore}đ
                        </td>
                        <td className="py-2.5 px-3 text-center font-black text-amber-900 bg-amber-50/40">
                          {formatAvg(summary.avgScore)}đ
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full font-extrabold text-[11px] ${badgeColor}`}>
                            {summary.classification}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
