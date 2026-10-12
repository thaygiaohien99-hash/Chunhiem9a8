/**
 * ==============================================================================
 * HỆ THỐNG QUẢN LÝ LỚP CHỦ NHIỆM - GOOGLE APPS SCRIPT
 * BỘ 4 SHEETS CHUẨN:
 *  - SHEET 01: 01_QUAN_LI (Phân quyền GVCN & Ban cán sự lớp)
 *  - SHEET 02: 02_HOC_SINH (Hồ sơ học sinh theo Lớp & theo Tổ)
 *  - SHEET 03: 03_THI_DUA_35_TUAN (Bảng ghi điểm thi đua Tuần 1 -> Tuần 35)
 *  - SHEET 04: 04_THI_DUA (Danh mục hành vi thi đua: Điểm Cộng, Điểm Trừ, Cảnh báo)
 * ==============================================================================
 */

var SHEET_QUAN_LI = "01_QUAN_LI";
var SHEET_HOC_SINH = "02_HOC_SINH";
var SHEET_THI_DUA = "03_THI_DUA_35_TUAN";
var SHEET_DANH_MUC_THI_DUA = "04_THI_DUA";

/**
 * 1. HÀM XỬ LÝ YÊU CẦU GET (doGet)
 */
function doGet(e) {
  var params = e ? e.parameter : {};
  var action = (params.action || "").toLowerCase();

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Khởi tạo các sheet (Bảo toàn tuyệt đối dữ liệu các sheet 01, 02, 03 đang có)
    if (action === "init_all" || action === "setup_all") {
      khoiTaoTatCaSheet();
      return createJsonResponse({ success: true, message: "Đã kiểm tra và đồng bộ cấu trúc 4 sheet: 01_QUAN_LI, 02_HOC_SINH, 03_THI_DUA_35_TUAN, 04_THI_DUA!" });
    }

    // Khởi tạo riêng Sheet 04_THI_DUA (không chạm tới Sheet 01, 02, 03)
    if (action === "init_sheet_04" || action === "setup_sheet_04") {
      var sheet04Init = khoiTaoSheet04();
      return createJsonResponse({
        success: true,
        message: "Đã đồng bộ Sheet 04_THI_DUA thành công!",
        data: getBehaviorRulesList(sheet04Init)
      });
    }

    // Đăng nhập (Sheet 01)
    if (action === "login") {
      var sheetQL = getOrCreateSheet(ss, SHEET_QUAN_LI);
      return authenticateUser(sheetQL, params.phone, params.password);
    }

    // Lấy danh sách ban cán sự (Sheet 01)
    if (action === "get_managers") {
      var sheetQL = getOrCreateSheet(ss, SHEET_QUAN_LI);
      return createJsonResponse({ success: true, data: getManagersList(sheetQL, params.className) });
    }

    // Lấy danh sách học sinh từ Sheet 02
    if (action === "get_students") {
      var sheetHS = getOrCreateSheet(ss, SHEET_HOC_SINH);
      return createJsonResponse({ success: true, data: getStudentsList(sheetHS, params.className, params.to) });
    }

    // Lấy bảng thi đua 35 tuần từ Sheet 03
    if (action === "get_competition") {
      var sheetTD = getOrCreateSheet(ss, SHEET_THI_DUA);
      return createJsonResponse({ success: true, data: getCompetitionMatrix(sheetTD, params.className, params.to) });
    }

    // Tải toàn bộ dữ liệu 4 Sheet trong 1 lượt gọi duy nhất (Tăng tốc đồng bộ gấp 4 lần)
    if (action === "get_all") {
      var sQL = getOrCreateSheet(ss, SHEET_QUAN_LI);
      var sHS = getOrCreateSheet(ss, SHEET_HOC_SINH);
      var sTD = getOrCreateSheet(ss, SHEET_THI_DUA);
      var s04 = getSheet04(ss);
      return createJsonResponse({
        success: true,
        managers: getManagersList(sQL, params.className),
        students: getStudentsList(sHS, params.className, params.to),
        competition: getCompetitionMatrix(sTD, params.className, params.to),
        behaviors: getBehaviorRulesList(s04)
      });
    }

    // Đồng bộ học sinh từ Sheet 02 sang Sheet 03
    if (action === "sync_students_to_competition") {
      dongBoHocSinhSangThiDua();
      return createJsonResponse({ success: true, message: "Đã đồng bộ học sinh sang bảng thi đua 35 tuần!" });
    }

    // Lấy danh mục hành vi thi đua (Điểm cộng, Điểm trừ, Cảnh báo) từ Sheet 04_THI_DUA
    if (action === "get_behaviors" || action === "get_thi_dua_rules" || action === "get_04_thi_dua") {
      var sheet04 = getSheet04(ss);
      return createJsonResponse({
        success: true,
        data: getBehaviorRulesList(sheet04)
      });
    }

    // Hỗ trợ cập nhật / xóa điểm thi đua qua GET (fallback đồng bộ 2 chiều)
    if (action === "update_week_score") {
      var sheetTDGet = getOrCreateSheet(ss, SHEET_THI_DUA);
      var valGet = (params.detail !== undefined && params.detail !== null) ? params.detail : params.score;
      return updateStudentWeekScore(sheetTDGet, params.studentId, params.weekNumber, valGet);
    }

    return createJsonResponse({
      success: true,
      message: "Hệ thống Quản Lí Lớp Chủ Nhiệm đang hoạt động tốt (Đồng bộ 2 chiều)!",
      version: "2.3",
      sheets: [SHEET_QUAN_LI, SHEET_HOC_SINH, SHEET_THI_DUA, SHEET_DANH_MUC_THI_DUA]
    });

  } catch (error) {
    return createJsonResponse({ success: false, message: "Lỗi xử lý doGet: " + error.toString() });
  }
}

/**
 * 2. HÀM XỬ LÝ YÊU CẦU POST (doPost)
 */
function doPost(e) {
  try {
    var rawData = e.postData ? e.postData.contents : "";
    var body = rawData ? JSON.parse(rawData) : {};
    var action = (body.action || "").toLowerCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Đăng nhập qua POST (Sheet 01)
    if (action === "login") {
      var sheetQL = getOrCreateSheet(ss, SHEET_QUAN_LI);
      return authenticateUser(sheetQL, body.phone, body.password);
    }

    // Cập nhật điểm & chi tiết hành vi thi đua 1 tuần cho 1 học sinh trên Sheet 03
    if (action === "update_week_score") {
      var sheetTD = getOrCreateSheet(ss, SHEET_THI_DUA);
      var valPost = (body.detail !== undefined && body.detail !== null) ? body.detail : body.score;
      return updateStudentWeekScore(sheetTD, body.studentId, body.weekNumber, valPost);
    }

    // Thêm học sinh mới vào Sheet 02 (và tự động thêm sang Sheet 03)
    if (action === "add_student") {
      var sheetHS = getOrCreateSheet(ss, SHEET_HOC_SINH);
      return addStudent(sheetHS, body);
    }

    // Thêm hành vi thi đua mới vào Sheet 04_THI_DUA
    if (action === "add_behavior") {
      var sheet04Add = getSheet04(ss);
      return addBehaviorRule(sheet04Add, body);
    }

    // Cập nhật hành vi thi đua trên Sheet 04_THI_DUA
    if (action === "update_behavior") {
      var sheet04Update = getSheet04(ss);
      return updateBehaviorRule(sheet04Update, body);
    }

    // Xóa hành vi thi đua trên Sheet 04_THI_DUA
    if (action === "delete_behavior") {
      var sheet04Del = getSheet04(ss);
      return deleteBehaviorRule(sheet04Del, body);
    }

    return createJsonResponse({ success: false, message: "Hành động (action) không hợp lệ" });

  } catch (error) {
    return createJsonResponse({ success: false, message: "Lỗi xử lý doPost: " + error.toString() });
  }
}

/**
 * ==============================================================================
 * NGHIỆP VỤ SHEET 01: 01_QUAN_LI
 * ==============================================================================
 */

function normalizePhone(p) {
  if (!p) return "";
  return p.toString().trim().replace(/^0+/, "");
}

function authenticateUser(sheet, phone, password) {
  if (!phone || !password) {
    return createJsonResponse({ success: false, message: "Vui lòng nhập đầy đủ số điện thoại và mật khẩu" });
  }

  var data = sheet.getDataRange().getValues();
  var searchPhoneNorm = normalizePhone(phone);
  var inputPass = password.toString().trim();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowPhone = normalizePhone(row[2]);
    var rowPass = (row[3] || "").toString().trim();
    var rowStatus = (row[7] || "").toString().trim();

    if (rowPhone === searchPhoneNorm) {
      if (rowPass === inputPass) {
        if (rowStatus.toLowerCase() === "khóa" || rowStatus.toLowerCase() === "khoa") {
          return createJsonResponse({ success: false, message: "Tài khoản của bạn đã bị KHÓA. Vui lòng liên hệ GVCN." });
        }

        var formattedPhone = row[2].toString().trim();
        if (formattedPhone.length === 9 && !formattedPhone.startsWith("0")) {
          formattedPhone = "0" + formattedPhone;
        }

        return createJsonResponse({
          success: true,
          message: "Đăng nhập thành công!",
          user: {
            id: String(row[0] || "").trim(),
            name: String(row[1] || "").trim(),
            phone: formattedPhone,
            role: String(row[4] || "").trim().toUpperCase(),
            className: String(row[5] || "").trim().toUpperCase(),
            managedScope: String(row[6] || "").trim(),
            status: rowStatus || "Hoạt động",
            note: String(row[8] || "").trim()
          }
        });
      } else {
        return createJsonResponse({ success: false, message: "Mật khẩu không chính xác!" });
      }
    }
  }

  return createJsonResponse({ success: false, message: "Số điện thoại chưa được đăng ký trong hệ thống!" });
}

function getManagersList(sheet, className) {
  var data = sheet.getDataRange().getValues();
  var managers = [];
  var filterClass = (className || "").trim().toUpperCase();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowClass = String(row[5] || "").trim().toUpperCase();
    if (!filterClass || rowClass === filterClass) {
      managers.push({
        id: String(row[0] || "").trim(),
        name: String(row[1] || "").trim(),
        phone: String(row[2] || "").trim(),
        role: String(row[4] || "").trim().toUpperCase(),
        className: rowClass,
        managedScope: String(row[6] || "").trim(),
        status: String(row[7] || "Hoạt động").trim(),
        note: String(row[8] || "").trim()
      });
    }
  }
  return managers;
}

/**
 * ==============================================================================
 * NGHIỆP VỤ SHEET 02: 02_HOC_SINH
 * Cột: ID_HocSinh, Khoi_Lop, Ho_Va_Ten, Gioi_Tinh, Ngay_Sinh, To, So_Dien_Thoai, Trang_Thai, Ghi_Chu
 * ==============================================================================
 */

function getStudentsList(sheet, className, to) {
  var data = sheet.getDataRange().getValues();
  var students = [];
  var filterClass = (className || "").trim().toUpperCase();
  var filterTo = (to || "").trim().toLowerCase();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[2]) continue;

    var rowClass = String(row[1] || "").trim().toUpperCase(); // Cột B: Khoi_Lop
    var rowTo = String(row[5] || "").trim();                 // Cột F: To

    if (filterClass && rowClass !== filterClass) continue;
    if (filterTo && rowTo.toLowerCase() !== filterTo) continue;

    var birthStr = "";
    if (row[4] instanceof Date) {
      birthStr = Utilities.formatDate(row[4], Session.getScriptTimeZone(), "dd/MM/yyyy");
    } else {
      birthStr = String(row[4] || "").trim();
    }

    students.push({
      id: String(row[0] || "").trim(),          // A: ID_HocSinh
      className: rowClass,                      // B: Khoi_Lop
      name: String(row[2] || "").trim(),        // C: Ho_Va_Ten
      gender: String(row[3] || "").trim(),      // D: Gioi_Tinh
      birthDate: birthStr,                      // E: Ngay_Sinh
      group: rowTo,                             // F: To
      phone: String(row[6] || "").trim(),       // G: So_Dien_Thoai
      status: String(row[7] || "Đang học").trim(), // H: Trang_Thai
      note: String(row[8] || "").trim()         // I: Ghi_Chu
    });
  }
  return students;
}

function addStudent(sheet, data) {
  if (!data.id || !data.name || !data.className) {
    return createJsonResponse({ success: false, message: "Thiếu ID, Tên hoặc Lớp" });
  }

  sheet.appendRow([
    data.id,
    data.className.toUpperCase(),
    data.name,
    data.gender || "Nam",
    data.birthDate || "",
    data.group || "Tổ 1",
    data.phone || "",
    data.status || "Đang học",
    data.note || ""
  ]);

  // Đồng bộ sang Sheet 03
  dongBoHocSinhSangThiDua();

  return createJsonResponse({ success: true, message: "Thêm học sinh thành công!" });
}

/**
 * ==============================================================================
 * NGHIỆP VỤ SHEET 03: 03_THI_DUA_35_TUAN
 * Cột: ID_HocSinh, Ho_Va_Ten, Khoi_Lop, To, Tuan_1 .. Tuan_35, Tong_Cong
 * ==============================================================================
 */

var DEFAULT_WEEK_BASE_SCORE = 100;

// Hàm tách điểm số tổng từ ô dữ liệu tuần (Mỗi học sinh mặc định 100đ/tuần + điểm cộng - điểm trừ)
function extractScoreFromCellValue(cellVal) {
  if (cellVal === "" || cellVal === null || cellVal === undefined) return null;
  var str = String(cellVal).trim();
  if (str === "" || str === "#NUM!" || str === "NaN") return null;
  if (!isNaN(cellVal)) {
    var num = Number(cellVal);
    return num < 45 ? (DEFAULT_WEEK_BASE_SCORE + num) : num;
  }
  // Nếu giáo viên sửa phần Hành vi trên Sheet 03, ưu tiên tính tổng từ các điểm hành vi trong ngoặc (VD: (+3đ), (-5đ)) cộng với 100đ gốc
  var behaviorMatch = str.match(/Hành vi\s*:\s*([^|]+)/i);
  if (behaviorMatch && behaviorMatch[1]) {
    var bText = behaviorMatch[1].trim();
    var bPts = bText.match(/[+-]\d+(?:[.,]\d+)?(?=\s*đ|\))/gi);
    if (bPts && bPts.length > 0) {
      var bSum = 0;
      for (var b = 0; b < bPts.length; b++) {
        bSum += Number(bPts[b].replace(",", "."));
      }
      return DEFAULT_WEEK_BASE_SCORE + bSum;
    }
  }
  var matchTong = str.match(/(?:Điểm tổng|Tổng)\s*:\s*([+-]?\d+(?:[.,]\d+)?)/i);
  if (matchTong && matchTong[1]) {
    var parsedTong = Number(matchTong[1].replace(",", "."));
    return parsedTong < 45 ? (DEFAULT_WEEK_BASE_SCORE + parsedTong) : parsedTong;
  }
  // Nếu giáo viên sửa trực tiếp chuỗi trên Sheet mà không có chữ "Điểm tổng:", cộng các số có dấu +/- vào 100đ gốc
  var allNums = str.match(/[+-]\d+(?:[.,]\d+)?/g);
  if (allNums && allNums.length > 0) {
    var totalDelta = 0;
    for (var k = 0; k < allNums.length; k++) {
      totalDelta += Number(allNums[k].replace(",", "."));
    }
    return DEFAULT_WEEK_BASE_SCORE + totalDelta;
  }
  return DEFAULT_WEEK_BASE_SCORE;
}

// Chuyển đổi ô chỉ có số thuần túy (VD: 3 hoặc 103) thành chuỗi đầy đủ: "Hành vi: ... | Điểm mặc định: 100đ | Điểm cộng: ... | Điểm trừ: ... | Điểm tổng: ..."
function formatPlainNumberToDetailString(numScore, rules04) {
  var rawNum = Number(numScore);
  if (isNaN(rawNum)) return String(numScore);
  var delta = rawNum < 45 ? rawNum : (rawNum - DEFAULT_WEEK_BASE_SCORE);
  var totalScore = DEFAULT_WEEK_BASE_SCORE + delta;
  var matchedRule = null;
  if (rules04 && rules04.length > 0) {
    for (var r = 0; r < rules04.length; r++) {
      if (Number(rules04[r].points) === delta) {
        matchedRule = rules04[r];
        break;
      }
    }
  }
  var behaviorLabel = "";
  if (matchedRule) {
    var ptStr = delta > 0 ? ("+" + delta + "đ") : (delta + "đ");
    var warnTag = matchedRule.isWarning ? " [Cảnh báo]" : "";
    behaviorLabel = matchedRule.behavior + " (" + ptStr + ")" + warnTag;
  } else {
    behaviorLabel = delta > 0 ? ("Điểm cộng (+" + delta + "đ)") : (delta < 0 ? ("Điểm trừ (" + delta + "đ)") : "Mặc định tuần (100đ)");
  }
  var plusStr = "+" + (delta > 0 ? delta : 0) + "đ";
  var minusStr = delta < 0 ? (delta + "đ") : "0đ";
  var totalStr = totalScore + "đ";
  return "Hành vi: " + behaviorLabel + " | Điểm mặc định: 100đ | Điểm cộng: " + plusStr + " | Điểm trừ: " + minusStr + " | Điểm tổng: " + totalStr;
}

function getCompetitionMatrix(sheet, className, to) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rules04 = [];
  try {
    rules04 = getBehaviorRulesList(getSheet04(ss));
  } catch (e) {}

  var results = [];
  var filterClass = (className || "").trim().toUpperCase();
  var filterTo = (to || "").trim().toLowerCase();
  var hasSheetChanges = false;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var studentId = String(row[0] || "").trim();
    if (!studentId) continue;

    var rowName = String(row[1] || "").trim();
    var rowClass = String(row[2] || "").trim().toUpperCase();
    var rowTo = String(row[3] || "").trim();

    if (filterClass && rowClass !== filterClass) continue;
    if (filterTo && rowTo.toLowerCase() !== filterTo) continue;

    // Lấy điểm và chi tiết hành vi từ Tuần 1 đến Tuần 35 (Cột index 4 đến 38)
    var weeklyScores = {};
    var weeklyDetails = {};
    var sum = 0;
    var hasAnyWeek = false;
    for (var w = 1; w <= 35; w++) {
      var colIdx = 3 + w; // Tuần 1 nằm ở index 4
      var scoreVal = row[colIdx];
      var cleanDetail = (scoreVal !== "" && scoreVal !== null && scoreVal !== undefined) ? String(scoreVal).trim() : "";
      if (cleanDetail === "#NUM!" || cleanDetail === "NaN") {
        cleanDetail = "";
      }
      var numScore = cleanDetail !== "" ? extractScoreFromCellValue(scoreVal) : null;

      // Nếu ô trên Sheet 03 đang chỉ có con số (VD: 3), tự động nâng cấp thành chuỗi chi tiết đầy đủ
      if (cleanDetail !== "" && !isNaN(Number(cleanDetail)) && numScore !== null) {
        cleanDetail = formatPlainNumberToDetailString(numScore, rules04);
        data[i][colIdx] = cleanDetail;
        hasSheetChanges = true;
      }

      weeklyScores["Tuan_" + w] = numScore;
      weeklyDetails["Tuan_" + w] = cleanDetail;
      if (numScore !== null) {
        sum += numScore;
        hasAnyWeek = true;
      }
    }

    // Tự động đồng bộ lại cột Tong_Cong (Cột 40 - AN) nếu giáo viên vừa xóa/sửa trực tiếp trên Sheet 03
    if (row.length >= 40) {
      var currentTotalCell = (row[39] === null || row[39] === undefined) ? "" : String(row[39]).trim();
      var expectedTotalCell = hasAnyWeek ? String(sum) : "";
      if (currentTotalCell !== expectedTotalCell) {
        data[i][39] = hasAnyWeek ? sum : "";
        hasSheetChanges = true;
      }
    }

    results.push({
      id: studentId,
      name: rowName,
      className: rowClass,
      group: rowTo,
      weeklyScores: weeklyScores,
      weeklyDetails: weeklyDetails,
      totalScore: sum
    });
  }

  // Ghi hàng loạt 1 lần duy nhất nếu có ô cần chuẩn hóa (Tăng tốc gấp 10 lần so với setValue từng ô)
  if (hasSheetChanges && data.length > 1) {
    try {
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    } catch (err) {}
  }

  return results;
}

function updateStudentWeekScore(sheet, studentId, weekNumber, score) {
  var w = Number(weekNumber);
  if (w < 1 || w > 35) {
    return createJsonResponse({ success: false, message: "Tuần không hợp lệ (phải từ 1 đến 35)" });
  }

  var targetId = String(studentId || "").trim();
  var cleanValToSet = (score === null || score === undefined) ? "" : score;
  var data = sheet.getDataRange().getValues();
  var colIdx = 3 + w + 1; // 1-based index cho Google Sheet (Cột E là Tuần 1: index = 5)

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === targetId) {
      sheet.getRange(i + 1, colIdx).setValue(cleanValToSet);

      // Tự động cập nhật cột Tổng cộng (Cột 40 - AN) nếu có
      var sum = 0;
      var hasAnyWeek = false;
      for (var wk = 1; wk <= 35; wk++) {
        var val = (wk === w) ? cleanValToSet : data[i][3 + wk];
        var numVal = extractScoreFromCellValue(val);
        if (numVal !== null) {
          sum += numVal;
          hasAnyWeek = true;
        }
      }
      if (sheet.getMaxColumns() >= 40) {
        sheet.getRange(i + 1, 40).setValue(hasAnyWeek ? sum : "");
      }

      return createJsonResponse({
        success: true,
        message: cleanValToSet === "" ? "Đã xóa dữ liệu Tuần " + w + " trên Sheet 03!" : "Cập nhật điểm Tuần " + w + " thành công!",
        totalScore: sum
      });
    }
  }

  // Nếu chưa có học sinh trong Sheet 03, tự động đồng bộ từ Sheet 02 sang rồi cập nhật lại
  dongBoHocSinhSangThiDua();
  var refreshedData = sheet.getDataRange().getValues();
  for (var j = 1; j < refreshedData.length; j++) {
    if (String(refreshedData[j][0]).trim() === targetId) {
      sheet.getRange(j + 1, colIdx).setValue(cleanValToSet);
      return createJsonResponse({ success: true, message: "Cập nhật điểm Tuần " + w + " thành công!" });
    }
  }

  return createJsonResponse({ success: false, message: "Không tìm thấy học sinh với ID: " + studentId });
}

/**
 * TỰ ĐỘNG ĐỒNG BỘ 2 CHIỀU HỌC SINH TỪ SHEET 02 SANG SHEET 03
 * VÀ TRIGGER onEdit KHI GIÁO VIÊN XÓA/SỬA TRỰC TIẾP TRÊN GOOGLE SHEET
 */
function dongBoHocSinhSangThiDua() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetHS = getOrCreateSheet(ss, SHEET_HOC_SINH);
  var sheetTD = getOrCreateSheet(ss, SHEET_THI_DUA);

  var dataHS = sheetHS.getDataRange().getValues();
  if (dataHS.length <= 1) return;

  var dataTD = sheetTD.getDataRange().getValues();
  var existingRowMap = {};
  for (var t = 1; t < dataTD.length; t++) {
    var exId = String(dataTD[t][0]).trim();
    if (exId) existingRowMap[exId] = t + 1; // 1-based row index trên Sheet 03
  }

  // Quét các học sinh từ Sheet 02 để thêm mới hoặc cập nhật Tên/Lớp/Tổ sang Sheet 03
  for (var i = 1; i < dataHS.length; i++) {
    var hsId = String(dataHS[i][0]).trim();
    var hsClass = String(dataHS[i][1]).trim().toUpperCase();
    var hsName = String(dataHS[i][2]).trim();
    var hsTo = String(dataHS[i][5]).trim();
    if (!hsId) continue;

    if (!existingRowMap[hsId]) {
      var newRow = [hsId, hsName, hsClass, hsTo];
      for (var w = 1; w <= 35; w++) {
        newRow.push("");
      }
      newRow.push("");
      sheetTD.appendRow(newRow);
      existingRowMap[hsId] = sheetTD.getLastRow();
    } else {
      var tdRowIdx = existingRowMap[hsId];
      var tdRowData = dataTD[tdRowIdx - 1];
      if (tdRowData) {
        if (String(tdRowData[1] || "").trim() !== hsName) {
          sheetTD.getRange(tdRowIdx, 2).setValue(hsName);
        }
        if (String(tdRowData[2] || "").trim().toUpperCase() !== hsClass) {
          sheetTD.getRange(tdRowIdx, 3).setValue(hsClass);
        }
        if (String(tdRowData[3] || "").trim() !== hsTo) {
          sheetTD.getRange(tdRowIdx, 4).setValue(hsTo);
        }
      }
    }
  }
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();

    // Nếu giáo viên xóa hoặc sửa điểm/hành vi trên Sheet 03 -> tự động tính lại cột Tổng Cộng (Cột 40)
    if (sheetName === SHEET_THI_DUA) {
      var rowIdx = e.range.getRow();
      var colIdx = e.range.getColumn();
      if (rowIdx >= 2 && colIdx >= 5 && colIdx <= 39) {
        var rowValues = sheet.getRange(rowIdx, 1, 1, 39).getValues()[0];
        var sum = 0;
        var hasAny = false;
        for (var w = 1; w <= 35; w++) {
          var cellVal = rowValues[3 + w];
          var numVal = extractScoreFromCellValue(cellVal);
          if (numVal !== null) {
            sum += numVal;
            hasAny = true;
          }
        }
        if (sheet.getMaxColumns() >= 40) {
          sheet.getRange(rowIdx, 40).setValue(hasAny ? sum : "");
        }
      }
    }

    // Nếu giáo viên sửa danh sách học sinh trên Sheet 02 -> tự động đồng bộ sang Sheet 03
    if (sheetName === SHEET_HOC_SINH) {
      dongBoHocSinhSangThiDua();
    }
  } catch (err) {}
}

/**
 * ==============================================================================
 * NGHIỆP VỤ SHEET 04: 04_THI_DUA (HOẶC 04_Thi_Dua)
 * Cột A: Hanh_vi | Cột B: Phan_Loai | Cột C: Diem | Cột D: Ghi Chú
 * ==============================================================================
 */

function getSheet04(ss) {
  var spreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sheets = spreadsheet.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName().trim();
    if (sName.toUpperCase() === "04_THI_DUA") {
      return sheets[i];
    }
  }
  var newSheet = spreadsheet.insertSheet(SHEET_DANH_MUC_THI_DUA);
  setupInitialData04(newSheet);
  return newSheet;
}

function getBehaviorRulesList(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var rules = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var behaviorName = String(row[0] || "").trim(); // Cột A: Hanh_vi
    if (!behaviorName) continue;

    var category = String(row[1] || "").trim();     // Cột B: Phan_Loai (Điểm Trừ / Điểm Cộng)
    var rawPoints = row[2];                         // Cột C: Diem
    var points = (rawPoints !== "" && !isNaN(rawPoints)) ? Number(rawPoints) : 0;
    var note = String(row[3] || "").trim();         // Cột D: Ghi Chú (Cảnh báo...)

    var catLower = category.toLowerCase();
    var isMinus = catLower.indexOf("trừ") !== -1 || catLower.indexOf("tru") !== -1 || points < 0;
    if (isMinus && points > 0) {
      points = -points;
    } else if (!isMinus && points < 0) {
      points = Math.abs(points);
    }

    var noteLower = note.toLowerCase();
    var isWarning = noteLower.indexOf("cảnh báo") !== -1 || noteLower.indexOf("canh bao") !== -1 || points <= -50;

    rules.push({
      id: "HV_" + i,
      rowIndex: i + 1,
      behavior: behaviorName,
      category: category || (points < 0 ? "Điểm Trừ" : "Điểm Cộng"),
      type: isMinus ? "MINUS" : "PLUS",
      points: points,
      note: note,
      isWarning: isWarning
    });
  }
  return rules;
}

function addBehaviorRule(sheet, data) {
  var behavior = String(data.behavior || data.Hanh_vi || "").trim();
  if (!behavior) {
    return createJsonResponse({ success: false, message: "Vui lòng nhập tên hành vi (Hanh_vi)" });
  }

  var category = String(data.category || data.Phan_Loai || "Điểm Trừ").trim();
  var points = Number(data.points !== undefined ? data.points : (data.Diem || 0));
  var note = String(data.note !== undefined ? data.note : (data.Ghi_Chu || "")).trim();

  var catLower = category.toLowerCase();
  if ((catLower.indexOf("trừ") !== -1 || catLower.indexOf("tru") !== -1) && points > 0) {
    points = -points;
  }

  sheet.appendRow([behavior, category, points, note]);

  return createJsonResponse({
    success: true,
    message: "Đã thêm hành vi mới vào Sheet 04_THI_DUA!",
    data: getBehaviorRulesList(sheet)
  });
}

function updateBehaviorRule(sheet, data) {
  var rowIndex = Number(data.rowIndex || 0);
  var targetBehavior = String(data.oldBehavior || data.behavior || data.Hanh_vi || "").trim();
  var values = sheet.getDataRange().getValues();

  var foundRow = -1;
  if (rowIndex >= 2 && rowIndex <= values.length) {
    foundRow = rowIndex;
  } else {
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || "").trim().toLowerCase() === targetBehavior.toLowerCase()) {
        foundRow = i + 1;
        break;
      }
    }
  }

  if (foundRow === -1) {
    return createJsonResponse({ success: false, message: "Không tìm thấy hành vi cần cập nhật trên Sheet 04_THI_DUA" });
  }

  var newBehavior = String(data.behavior || data.Hanh_vi || values[foundRow - 1][0]).trim();
  var newCategory = String(data.category || data.Phan_Loai || values[foundRow - 1][1]).trim();
  var newPoints = data.points !== undefined ? Number(data.points) : Number(values[foundRow - 1][2]);
  var newNote = data.note !== undefined ? String(data.note).trim() : String(values[foundRow - 1][3] || "").trim();

  sheet.getRange(foundRow, 1, 1, 4).setValues([[newBehavior, newCategory, newPoints, newNote]]);

  return createJsonResponse({
    success: true,
    message: "Cập nhật hành vi trên Sheet 04_THI_DUA thành công!",
    data: getBehaviorRulesList(sheet)
  });
}

function deleteBehaviorRule(sheet, data) {
  var rowIndex = Number(data.rowIndex || 0);
  var targetBehavior = String(data.behavior || data.Hanh_vi || "").trim();
  var values = sheet.getDataRange().getValues();

  var foundRow = -1;
  if (rowIndex >= 2 && rowIndex <= values.length) {
    foundRow = rowIndex;
  } else if (targetBehavior) {
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || "").trim().toLowerCase() === targetBehavior.toLowerCase()) {
        foundRow = i + 1;
        break;
      }
    }
  }

  if (foundRow === -1) {
    return createJsonResponse({ success: false, message: "Không tìm thấy hành vi cần xóa trên Sheet 04_THI_DUA" });
  }

  sheet.deleteRow(foundRow);

  return createJsonResponse({
    success: true,
    message: "Đã xóa hành vi khỏi Sheet 04_THI_DUA!",
    data: getBehaviorRulesList(sheet)
  });
}

/**
 * HÀM ĐỒNG BỘ / KHỞI TẠO RIÊNG SHEET 04_THI_DUA
 * (Giữ nguyên 100% các Sheet 01, 02, 03 không thay đổi)
 */
function khoiTaoSheet04() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet04 = getSheet04(ss);
  setupInitialData04(sheet04);
  Logger.log("Đã đồng bộ Sheet 04_THI_DUA thành công! Các Sheet 01, 02, 03 được giữ nguyên.");
  return sheet04;
}

/**
 * ==============================================================================
 * HÀM KHỞI TẠO TẤT CẢ 4 SHEET (BẢO TOÀN DỮ LIỆU ĐANG CÓ Ở SHEET 01, 02, 03, 04)
 * ==============================================================================
 */

function khoiTaoTatCaSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Sheet 01: 01_QUAN_LI (Chỉ tạo mẫu nếu sheet đang trống hoàn toàn)
  var sheet01 = getOrCreateSheet(ss, SHEET_QUAN_LI);
  if (sheet01.getLastRow() <= 1) {
    setupInitialData01(sheet01);
  }

  // 2. Sheet 02: 02_HOC_SINH (Chỉ tạo mẫu nếu sheet đang trống hoàn toàn)
  var sheet02 = getOrCreateSheet(ss, SHEET_HOC_SINH);
  if (sheet02.getLastRow() <= 1) {
    setupInitialData02(sheet02);
  }

  // 3. Sheet 03: 03_THI_DUA_35_TUAN (Chỉ tạo mẫu nếu sheet đang trống hoàn toàn)
  var sheet03 = getOrCreateSheet(ss, SHEET_THI_DUA);
  if (sheet03.getLastRow() <= 1) {
    setupInitialData03(sheet03);
  }

  // 4. Đồng bộ danh sách học sinh từ Sheet 02 sang Sheet 03 (chỉ thêm học sinh mới chưa có)
  dongBoHocSinhSangThiDua();

  // 5. Sheet 04: 04_THI_DUA (Khởi tạo nếu trống, bảo toàn nếu đã có dữ liệu)
  var sheet04 = getSheet04(ss);
  setupInitialData04(sheet04);

  Logger.log("Đã hoàn tất kiểm tra và đồng bộ 4 Sheet thành công!");
}

function setupInitialData01(sheet) {
  if (sheet.getLastRow() > 1) return; // Bảo vệ dữ liệu Sheet 01 đang hoạt động tốt
  sheet.clear();
  var headers = [
    "ID_NguoiDung", "Ho_Va_Ten", "So_Dien_Thoai", "Mat_Khau", 
    "Vai_Tro", "Lop_Phan_Cong", "Pham_Vi_Quan_Ly", "Trang_Thai", "Ghi_Chu"
  ];
  sheet.appendRow(headers);

  var sampleRows = [
    ["GV01", "Quản Trị Cao Nhất", "0966000224", "$Hongphat2022", "GVCN", "10T6", "Toàn diện lớp", "Hoạt động", "GVCN lớp 10T6 (Toàn quyền)"],
    ["10T6_LT", "Nguyễn Hồng Phát", "0977126075", "123456", "LOP_TRUONG", "10T6", "Toàn diện lớp", "Hoạt động", "Lớp trưởng điều hành chung"],
    ["10T6_TT1", "An Duyên", "0977126077", "123456", "TO_TRUONG_1", "10T6", "Tổ 1", "Hoạt động", "Quản lý thành viên Tổ 1"],
    ["10T6_TT2", "Trần Minh Khang", "0977126078", "123456", "TO_TRUONG_2", "10T6", "Tổ 2", "Hoạt động", "Quản lý thành viên Tổ 2"],
    ["10T6_TT3", "Lê Bảo Ngọc", "0977126079", "123456", "TO_TRUONG_3", "10T6", "Tổ 3", "Hoạt động", "Quản lý thành viên Tổ 3"],
    ["10T6_TT4", "Phạm Quốc Huy", "0977126080", "123456", "TO_TRUONG_4", "10T6", "Tổ 4", "Hoạt động", "Quản lý thành viên Tổ 4"]
  ];
  for (var r = 0; r < sampleRows.length; r++) {
    sheet.appendRow(sampleRows[r]);
  }
  formatHeader(sheet, headers.length, "#15803d");
}

function setupInitialData02(sheet) {
  if (sheet.getLastRow() > 1) return; // Bảo vệ dữ liệu Sheet 02 đang hoạt động tốt
  sheet.clear();
  // Đúng chuẩn 9 cột của Thầy/Cô yêu cầu
  var headers = [
    "ID_HocSinh", "Khoi_Lop", "Ho_Va_Ten", "Gioi_Tinh", "Ngay_Sinh", "To", "So_Dien_Thoai", "Trang_Thai", "Ghi_Chu"
  ];
  sheet.appendRow(headers);

  var sampleStudents = [
    ["10T601", "10T6", "Nguyễn Hồng Phát", "Nam", "15/09/2010", "Tổ 1", "0977126075", "Đang học", "Lớp trưởng"],
    ["10T602", "10T6", "An Duyên", "Nữ", "20/11/2010", "Tổ 1", "0977126077", "Đang học", "Tổ trưởng 1"],
    ["10T603", "10T6", "Trần Minh Khang", "Nam", "05/03/2010", "Tổ 2", "0977126078", "Đang học", "Tổ trưởng 2"],
    ["10T604", "10T6", "Lê Bảo Ngọc", "Nữ", "12/08/2010", "Tổ 3", "0977126079", "Đang học", "Tổ trưởng 3"],
    ["10T605", "10T6", "Phạm Quốc Huy", "Nam", "25/04/2010", "Tổ 4", "0977126080", "Đang học", "Tổ trưởng 4"],
    ["10T606", "10T6", "Hoàng Thu Trang", "Nữ", "18/06/2010", "Tổ 1", "0977126081", "Đang học", "Thành viên"],
    ["10T607", "10T6", "Vũ Gia Bảo", "Nam", "09/12/2010", "Tổ 2", "0977126082", "Đang học", "Thành viên"],
    ["10T608", "10T6", "Đỗ Mai Anh", "Nữ", "14/02/2010", "Tổ 3", "0977126083", "Đang học", "Thành viên"],
    ["10T609", "10T6", "Bùi Đức Anh", "Nam", "30/07/2010", "Tổ 4", "0977126084", "Đang học", "Thành viên"]
  ];
  for (var s = 0; s < sampleStudents.length; s++) {
    sheet.appendRow(sampleStudents[s]);
  }
  formatHeader(sheet, headers.length, "#1d4ed8"); // Xanh dương
}

function setupInitialData03(sheet) {
  if (sheet.getLastRow() > 1) return; // Bảo vệ dữ liệu Sheet 03 đang hoạt động tốt
  sheet.clear();
  var headers = ["ID_HocSinh", "Ho_Va_Ten", "Khoi_Lop", "To"];
  // Tạo 35 cột từ Tuần 1 đến Tuần 35
  for (var w = 1; w <= 35; w++) {
    headers.push("Tuan_" + w);
  }
  headers.push("Tong_Cong");
  sheet.appendRow(headers);
  formatHeader(sheet, headers.length, "#b45309"); // Màu nâu cam sang trọng
}

function setupInitialData04(sheet) {
  // Nếu Sheet 04_THI_DUA đã có dữ liệu của Thầy/Cô thì giữ nguyên 100%, không xóa!
  if (sheet.getLastRow() > 1) {
    return;
  }

  sheet.clear();
  var headers = ["Hanh_vi", "Phan_Loai", "Diem", "Ghi Chú"];
  sheet.appendRow(headers);

  var sampleBehaviors = [
    ["Vắng không phép", "Điểm Trừ", -20, ""],
    ["Vắng có phép", "Điểm Trừ", -2, ""],
    ["Đi trễ", "Điểm Trừ", -5, ""],
    ["Không thuộc bài", "Điểm Trừ", -5, ""],
    ["Không đồng phục", "Điểm Trừ", -5, ""],
    ["Không dụng cụ, tài liệu", "Điểm Trừ", -5, ""],
    ["Không hoàn thành nhiệm vụ được giao", "Điểm Trừ", -15, ""],
    ["Mất trật tự", "Điểm Trừ", -10, ""],
    ["Sử dụng điện thoại khi chưa được GV cho phép", "Điểm Trừ", -50, "Cảnh báo"],
    ["Vô lễ GV, CNV", "Điểm Trừ", -50, "Cảnh báo"],
    ["Đánh nhau", "Điểm Trừ", -50, "Cảnh báo"],
    ["Gian lận kiểm tra, thi", "Điểm Trừ", -50, "Cảnh báo"],
    ["Vi phạm pháp luật", "Điểm Trừ", -100, "Cảnh báo"],
    ["GV nhắc nhở không thay đổi", "Điểm Trừ", -50, "Cảnh báo"],
    ["Phát biểu", "Điểm Cộng", 3, ""],
    ["Thuộc bài", "Điểm Cộng", 5, ""],
    ["Giúp đỡ bạn bè", "Điểm Cộng", 10, ""],
    ["Báo cáo vi phạm của bạn có minh chứng", "Điểm Cộng", 5, ""],
    ["Tham gia phong trào cấp Trường", "Điểm Cộng", 5, ""],
    ["Tham gia phong trào cấp Xã", "Điểm Cộng", 10, ""]
  ];

  for (var b = 0; b < sampleBehaviors.length; b++) {
    sheet.appendRow(sampleBehaviors[b]);
  }

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#0f766e");
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function formatHeader(sheet, colCount, hexColor) {
  var range = sheet.getRange(1, 1, 1, colCount);
  range.setBackground(hexColor);
  range.setFontColor("#ffffff");
  range.setFontWeight("bold");
  range.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4); // Cố định 4 cột đầu (ID, Tên, Lớp, Tổ) khi cuộn ngang
  sheet.autoResizeColumns(1, Math.min(colCount, 10));
}

function getOrCreateSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
