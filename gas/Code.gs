/**
 * ============================================================================
 * AI 萬用年曆 (ai-art-calendar) — Google Apps Script 雲端同步與 Gemini Skill 寫入後端
 * ============================================================================
 * 綁定試算表結構：
 * 1. 工作表「每日記事」(Days)：
 *    A: 日期 (YYYY-MM-DD)
 *    B: 行事安排摘要 (可讀文字)
 *    C: 待辦事項摘要 (可讀文字)
 *    D: 註記與隨筆備忘 (純文字 Memo)
 *    E: 休假標記 (holiday / workday / 空)
 *    F: 結構化 JSON (保存完整 id, color, done, updatedAt 供無損雙向同步)
 *    G: 最後更新時間
 *
 * 2. 工作表「本週重點備忘」(WeekMemos)：
 *    A: 週次代碼 (如 2026-11-W2)
 *    B: 本週重點內容
 *    C: 最後更新時間
 */

const SHEET_DAYS = '每日記事';
const SHEET_WEEKS = '本週重點備忘';
const VALID_COLORS = ['sky', 'emerald', 'amber', 'rose', 'violet'];

function ensureSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let daysSheet = ss.getSheetByName(SHEET_DAYS);
  if (!daysSheet) {
    // 若預設有「工作表1」或「Sheet1」且為空，直接改名使用
    const first = ss.getSheets()[0];
    if (first && first.getLastRow() === 0) {
      first.setName(SHEET_DAYS);
      daysSheet = first;
    } else {
      daysSheet = ss.insertSheet(SHEET_DAYS);
    }
    daysSheet.appendRow([
      '日期 (YYYY-MM-DD)',
      '🕒 行事安排',
      '☑️ 待辦事項',
      '📝 註記與隨筆備忘',
      '🏖️ 休假/補班',
      '結構化資料 (JSON)',
      '最後更新時間'
    ]);
    daysSheet.setFrozenRows(1);
    daysSheet.getRange('A1:G1').setFontWeight('bold').setBackground('#0f172a').setFontColor('#f8fafc');
    daysSheet.setColumnWidth(1, 120);
    daysSheet.setColumnWidth(2, 240);
    daysSheet.setColumnWidth(3, 220);
    daysSheet.setColumnWidth(4, 280);
    daysSheet.setColumnWidth(5, 100);
    daysSheet.setColumnWidth(6, 180);
    daysSheet.setColumnWidth(7, 160);
  }

  let weeksSheet = ss.getSheetByName(SHEET_WEEKS);
  if (!weeksSheet) {
    weeksSheet = ss.insertSheet(SHEET_WEEKS);
    weeksSheet.appendRow(['週次代碼 (YYYY-MM-W#)', '🎯 本週重點備忘', '最後更新時間']);
    weeksSheet.setFrozenRows(1);
    weeksSheet.getRange('A1:C1').setFontWeight('bold').setBackground('#0f172a').setFontColor('#f8fafc');
    weeksSheet.setColumnWidth(1, 150);
    weeksSheet.setColumnWidth(2, 400);
    weeksSheet.setColumnWidth(3, 160);
  }

  return { ss, daysSheet, weeksSheet };
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getTodayDateStr() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

function getNowTimestampStr() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * 解析 Gemini Skill 連結或使用者輸入的行程字串
 * 支援格式：
 * - "09:00~10:30|門診會議|sky;14:00|準備簡報|emerald"
 * - "09:00 門診會議; 14:00~16:00 演講"
 * - JSON 陣列字串
 */
function parseSchedulesParam(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const str = String(raw).trim();
  if (!str) return [];

  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }

  const items = str.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  const result = [];

  for (const item of items) {
    if (item.includes('|')) {
      const parts = item.split('|').map(p => p.trim());
      let timePart = parts[0] || '';
      let textPart = parts[1] || '';
      let colorPart = (parts[2] || 'sky').toLowerCase();

      // 若第一欄不是時間格式而是文字，自動對調
      if (timePart && !/^\d{1,2}:\d{2}/.test(timePart) && /^\d{1,2}:\d{2}/.test(textPart)) {
        const tmp = timePart;
        timePart = textPart;
        textPart = tmp;
      }
      if (!textPart && timePart && !/^\d{1,2}:\d{2}/.test(timePart)) {
        textPart = timePart;
        timePart = '';
      }
      if (!textPart) continue;

      let startTime = '';
      let endTime = '';
      if (timePart.includes('~') || timePart.includes('-')) {
        const [st, et] = timePart.split(/[~-]/).map(t => t.trim());
        startTime = normalizeTimeStr(st);
        endTime = normalizeTimeStr(et);
      } else {
        startTime = normalizeTimeStr(timePart);
      }

      if (!VALID_COLORS.includes(colorPart)) colorPart = 'sky';
      result.push({
        id: makeId(),
        time: startTime,
        endTime: endTime,
        text: textPart,
        color: colorPart
      });
    } else {
      // 支援 "09:00~10:30 門診會議" 或 "09:00 門診會議" 或純文字
      const m = item.match(/^(\d{1,2}:\d{2})(?:\s*[~-]\s*(\d{1,2}:\d{2}))?\s+(.+)$/);
      if (m) {
        result.push({
          id: makeId(),
          time: normalizeTimeStr(m[1]),
          endTime: m[2] ? normalizeTimeStr(m[2]) : '',
          text: m[3].trim(),
          color: 'sky'
        });
      } else {
        result.push({
          id: makeId(),
          time: '',
          endTime: '',
          text: item,
          color: 'sky'
        });
      }
    }
  }
  return result;
}

function normalizeTimeStr(t) {
  if (!t) return '';
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  return String(m[1]).padStart(2, '0') + ':' + m[2];
}

/**
 * 解析待辦事項參數
 * 支援格式：
 * - "準備簡報;買高鐵票;印講義"
 * - JSON 陣列字串
 */
function parseTodosParam(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const str = String(raw).trim();
  if (!str) return [];

  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }

  return str
    .split(/[;\n|]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(text => {
      let done = false;
      let cleanText = text;
      if (/^(\[x\]|\[v\]|✓|✔)/i.test(cleanText)) {
        done = true;
        cleanText = cleanText.replace(/^(\[x\]|\[v\]|✓|✔)\s*/i, '');
      } else if (/^(\[\s*\])/.test(cleanText)) {
        cleanText = cleanText.replace(/^(\[\s*\])\s*/, '');
      }
      return {
        id: makeId(),
        text: cleanText,
        done: done
      };
    });
}

function formatSchedulesReadable(schedules) {
  if (!Array.isArray(schedules) || schedules.length === 0) return '';
  return schedules
    .map(s => {
      const t = s.time && s.endTime ? `${s.time}~${s.endTime}` : (s.time || '全天');
      return `${t} ${s.text} [${s.color || 'sky'}]`;
    })
    .join('\n');
}

function formatTodosReadable(todos) {
  if (!Array.isArray(todos) || todos.length === 0) return '';
  return todos
    .map(t => `${t.done ? '[✓]' : '[ ]'} ${t.text}`)
    .join('\n');
}

/**
 * 讀取試算表中所有的 days 與 weekMemos
 */
function readAllCalendarData() {
  const { daysSheet, weeksSheet } = ensureSheets();
  const days = {};
  const weekMemos = {};

  const dLast = daysSheet.getLastRow();
  if (dLast >= 2) {
    const rows = daysSheet.getRange(2, 1, dLast - 1, 7).getValues();
    for (const row of rows) {
      let dateKey = row[0];
      if (dateKey instanceof Date) {
        dateKey = Utilities.formatDate(dateKey, 'Asia/Taipei', 'yyyy-MM-dd');
      } else {
        dateKey = String(dateKey || '').trim();
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;

      const memoCell = String(row[3] ?? '');
      const holidayCell = String(row[4] ?? '').trim() || null;
      const jsonCell = String(row[5] ?? '').trim();

      let rec = {
        schedules: [],
        todos: [],
        memo: memoCell,
        customHoliday: holidayCell,
        syncedGcalIds: [],
        updatedAt: 0
      };

      if (jsonCell) {
        try {
          const parsed = JSON.parse(jsonCell);
          rec = {
            schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
            todos: Array.isArray(parsed.todos) ? parsed.todos : [],
            memo: memoCell !== '' ? memoCell : String(parsed.memo ?? ''),
            customHoliday: holidayCell || parsed.customHoliday || null,
            syncedGcalIds: Array.isArray(parsed.syncedGcalIds) ? parsed.syncedGcalIds : [],
            updatedAt: Number(parsed.updatedAt) || 0
          };
        } catch (_) {}
      }
      days[dateKey] = rec;
    }
  }

  const wLast = weeksSheet.getLastRow();
  if (wLast >= 2) {
    const wRows = weeksSheet.getRange(2, 1, wLast - 1, 3).getValues();
    for (const row of wRows) {
      const wKey = String(row[0] || '').trim();
      if (!wKey) continue;
      weekMemos[wKey] = String(row[1] ?? '');
    }
  }

  return { days, weekMemos, serverTime: Date.now() };
}

/**
 * 將單日記錄寫回或更新至「每日記事」工作表
 */
function saveDayRecordToSheet(daysSheet, dateStr, dayRec) {
  const cleanRec = {
    schedules: Array.isArray(dayRec.schedules) ? dayRec.schedules : [],
    todos: Array.isArray(dayRec.todos) ? dayRec.todos : [],
    memo: String(dayRec.memo ?? ''),
    customHoliday: dayRec.customHoliday || null,
    syncedGcalIds: Array.isArray(dayRec.syncedGcalIds) ? [...new Set(dayRec.syncedGcalIds)] : [],
    updatedAt: Number(dayRec.updatedAt) || Date.now()
  };

  cleanRec.schedules.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

  const rowValues = [
    dateStr,
    formatSchedulesReadable(cleanRec.schedules),
    formatTodosReadable(cleanRec.todos),
    cleanRec.memo,
    cleanRec.customHoliday || '',
    JSON.stringify(cleanRec),
    getNowTimestampStr()
  ];

  const lastRow = daysSheet.getLastRow();
  if (lastRow >= 2) {
    const dateCol = daysSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < dateCol.length; i++) {
      let existingDate = dateCol[i][0];
      if (existingDate instanceof Date) {
        existingDate = Utilities.formatDate(existingDate, 'Asia/Taipei', 'yyyy-MM-dd');
      } else {
        existingDate = String(existingDate || '').trim();
      }
      if (existingDate === dateStr) {
        daysSheet.getRange(i + 2, 1, 1, 7).setValues([rowValues]);
        return cleanRec;
      }
    }
  }

  daysSheet.appendRow(rowValues);
  return cleanRec;
}

function saveWeekMemoToSheet(weeksSheet, weekKey, memoText) {
  const lastRow = weeksSheet.getLastRow();
  const rowValues = [weekKey, String(memoText ?? ''), getNowTimestampStr()];
  if (lastRow >= 2) {
    const keyCol = weeksSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keyCol.length; i++) {
      if (String(keyCol[i][0] || '').trim() === weekKey) {
        weeksSheet.getRange(i + 2, 1, 1, 3).setValues([rowValues]);
        return;
      }
    }
  }
  weeksSheet.appendRow(rowValues);
}

/**
 * ============================================================================
 * Google Calendar (Google 日曆) 智慧雙向橋接 (支援手機 Gemini 語音/文字免複製直寫)
 * ============================================================================
 */
function detectGcalColorAndCleanTitle(rawTitle) {
  let text = String(rawTitle || '').trim();
  let color = 'sky';

  const tagMatch = text.match(/\[(sky|rose|emerald|amber|violet)\]$/i);
  if (tagMatch) {
    color = tagMatch[1].toLowerCase();
    text = text.replace(/\s*\[(sky|rose|emerald|amber|violet)\]$/i, '').trim();
    return { text, color };
  }

  if (/重要|緊急|演講|截稿|發表|手術|急診|紅字/i.test(text)) {
    color = 'rose';
  } else if (/單車|騎車|環島|運動|跑步|登山|旅行|出遊|聚餐|家庭|休假/i.test(text)) {
    color = 'emerald';
  } else if (/AI|寫作|創作|靈感|閱讀|讀書|繪圖|研究/i.test(text)) {
    color = 'violet';
  } else if (/門診|看診|會議|開會|巡房|討論|教學/i.test(text)) {
    color = 'sky';
  }

  return { text, color };
}

/**
 * 從使用者的預設 Google 日曆拉取近期與未來活動 (-14 天 ~ +90 天) 並自動轉入萬用年曆
 * 支援標題或說明中包含 [待辦] / TODO: 與 [備忘] / MEMO: 自動分流至三欄
 */
function pullFromGoogleCalendar(daysSheet, currentDays, force = false) {
  try {
    const cache = CacheService.getScriptCache();
    if (!force && cache) {
      const lastPull = Number(cache.get('last_gcal_pull_ts') || 0);
      if (Date.now() - lastPull < 40000) {
        return false;
      }
    }

    const cal = CalendarApp.getDefaultCalendar();
    if (!cal) return false;

    const nowMs = Date.now();
    const startWin = new Date(nowMs - 14 * 86400000);
    const endWin = new Date(nowMs + 90 * 86400000);
    const events = cal.getEvents(startWin, endWin);
    const dirtyDates = new Set();

    for (const ev of events) {
      const gcalId = ev.getId();
      const rawTitle = String(ev.getTitle() || '').trim();
      if (!rawTitle) continue;

      const startDt = ev.getStartTime();
      const endDt = ev.getEndTime();
      const dateStr = Utilities.formatDate(startDt, 'Asia/Taipei', 'yyyy-MM-dd');

      if (!currentDays[dateStr]) {
        currentDays[dateStr] = {
          schedules: [],
          todos: [],
          memo: '',
          customHoliday: null,
          syncedGcalIds: [],
          updatedAt: 0
        };
      }
      const dayRec = currentDays[dateStr];
      if (!Array.isArray(dayRec.syncedGcalIds)) dayRec.syncedGcalIds = [];

      // 若此 Google Calendar Event ID 已經匯入過，不重複匯入（避免使用者在萬用年曆刪除後又復活）
      if (dayRec.syncedGcalIds.includes(gcalId) || dayRec.schedules.some(s => s.gcalId === gcalId)) {
        continue;
      }

      dayRec.syncedGcalIds.push(gcalId);
      let changed = true;

      // 1. 檢查標題是否為專門的 [待辦] / TODO: 或 [備忘] / MEMO:
      const todoTitleMatch = rawTitle.match(/^(?:\[待辦\]|\[TODO\]|TODO|待辦|待辦事項)\s*[:：]?\s*(.+)$/i);
      const memoTitleMatch = rawTitle.match(/^(?:\[備忘\]|\[註記\]|\[MEMO\]|MEMO|NOTE|備忘|註記)\s*[:：]?\s*(.+)$/i);

      if (todoTitleMatch) {
        const todoItems = parseTodosParam(todoTitleMatch[1]);
        for (const t of todoItems) {
          if (!dayRec.todos.some(ex => ex.text === t.text)) {
            dayRec.todos.push(t);
          }
        }
      } else if (memoTitleMatch) {
        const mText = memoTitleMatch[1].trim();
        if (mText && (!dayRec.memo || !dayRec.memo.includes(mText))) {
          dayRec.memo = dayRec.memo ? (dayRec.memo.trim() + '\n' + mText) : mText;
        }
      } else {
        // 一般日曆行程 -> 轉入「🕒 行事安排」
        let startTime = '';
        let endTime = '';
        if (!ev.isAllDayEvent()) {
          startTime = Utilities.formatDate(startDt, 'Asia/Taipei', 'HH:mm');
          endTime = Utilities.formatDate(endDt, 'Asia/Taipei', 'HH:mm');
          if (endTime === startTime) endTime = '';
        }
        const { text: cleanTitle, color } = detectGcalColorAndCleanTitle(rawTitle);
        const existingSched = dayRec.schedules.find(
          s => s.text === cleanTitle && (s.time === startTime || (!s.time && !startTime))
        );
        if (existingSched) {
          existingSched.gcalId = gcalId;
          if (!existingSched.endTime && endTime) existingSched.endTime = endTime;
        } else if (cleanTitle) {
          dayRec.schedules.push({
            id: makeId(),
            time: startTime,
            endTime: endTime,
            text: cleanTitle,
            color: color,
            gcalId: gcalId
          });
        }
      }

      // 2. 解析活動「說明 (Description)」：支援同時夾帶 TODO: 與 MEMO:
      const rawDesc = String(ev.getDescription() || '').trim();
      if (rawDesc && !rawDesc.includes('[AI萬用年曆自動同步]')) {
        const plainDesc = rawDesc
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();

        for (const line of plainDesc.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const tMatch = trimmed.match(/^(?:TODO|待辦|待辦事項)\s*[:：]\s*(.+)$/i);
          const mMatch = trimmed.match(/^(?:MEMO|NOTE|備忘|註記|註記備忘)\s*[:：]\s*(.+)$/i);
          if (tMatch) {
            for (const t of parseTodosParam(tMatch[1])) {
              if (!dayRec.todos.some(ex => ex.text === t.text)) {
                dayRec.todos.push(t);
              }
            }
          } else if (mMatch) {
            const mVal = mMatch[1].trim();
            if (mVal && (!dayRec.memo || !dayRec.memo.includes(mVal))) {
              dayRec.memo = dayRec.memo ? (dayRec.memo.trim() + '\n' + mVal) : mVal;
            }
          } else if (!dayRec.memo || !dayRec.memo.includes(trimmed)) {
            dayRec.memo = dayRec.memo ? (dayRec.memo.trim() + '\n' + trimmed) : trimmed;
          }
        }
      }

      if (changed) {
        dayRec.updatedAt = Date.now();
        dirtyDates.add(dateStr);
      }
    }

    for (const dStr of dirtyDates) {
      currentDays[dStr] = saveDayRecordToSheet(daysSheet, dStr, currentDays[dStr]);
    }

    if (cache) {
      cache.put('last_gcal_pull_ts', String(Date.now()), 120);
    }
    return dirtyDates.size > 0;
  } catch (err) {
    console.warn('Google Calendar pull skipped:', err);
    return false;
  }
}

/**
 * 將萬用年曆新增的行程同步寫回 Google 日曆 (避免重複建立)
 */
function pushDaySchedulesToGoogleCalendar(dateStr, dayRec) {
  try {
    if (!dayRec || !Array.isArray(dayRec.schedules) || dayRec.schedules.length === 0) return false;
    const unsynced = dayRec.schedules.filter(s => s && s.text && !s.gcalId);
    if (unsynced.length === 0) return false;

    const cal = CalendarApp.getDefaultCalendar();
    if (!cal) return false;

    const [y, m, d] = dateStr.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0);
    const dayEnd = new Date(y, m - 1, d, 23, 59, 59);
    const existingEvents = cal.getEvents(dayStart, dayEnd);
    if (!Array.isArray(dayRec.syncedGcalIds)) dayRec.syncedGcalIds = [];

    let modified = false;
    for (const s of unsynced) {
      const cleanText = String(s.text || '').trim();
      if (!cleanText) continue;

      const matchedEv = existingEvents.find(ev => String(ev.getTitle() || '').trim() === cleanText);
      if (matchedEv) {
        const evId = matchedEv.getId();
        s.gcalId = evId;
        if (!dayRec.syncedGcalIds.includes(evId)) dayRec.syncedGcalIds.push(evId);
        modified = true;
        continue;
      }

      let createdEv = null;
      const startMatch = String(s.time || '').trim().match(/^(\d{1,2}):(\d{2})$/);
      if (startMatch) {
        const sh = Number(startMatch[1]);
        const sm = Number(startMatch[2]);
        const startDt = new Date(y, m - 1, d, sh, sm, 0);
        let endDt = new Date(startDt.getTime() + 60 * 60 * 1000);
        const endMatch = String(s.endTime || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        if (endMatch) {
          const candidateEnd = new Date(y, m - 1, d, Number(endMatch[1]), Number(endMatch[2]), 0);
          if (candidateEnd > startDt) endDt = candidateEnd;
        }
        createdEv = cal.createEvent(cleanText, startDt, endDt, {
          description: '[AI萬用年曆自動同步]'
        });
      } else {
        createdEv = cal.createAllDayEvent(cleanText, new Date(y, m - 1, d, 12, 0, 0), {
          description: '[AI萬用年曆自動同步]'
        });
      }

      if (createdEv) {
        const newId = createdEv.getId();
        s.gcalId = newId;
        if (!dayRec.syncedGcalIds.includes(newId)) dayRec.syncedGcalIds.push(newId);
        modified = true;
      }
    }
    return modified;
  } catch (err) {
    console.warn('Google Calendar push skipped:', err);
    return false;
  }
}

/**
 * 核心：增量寫入 (Upsert) 單日行程、待辦事項、備忘錄與本週重點
 * 供 Gemini Skill 一鍵連結、網頁表單 (google.script.run) 與 API 呼叫
 */
function upsertCalendarEntry(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const { daysSheet, weeksSheet } = ensureSheets();
    const allData = readAllCalendarData();

    const dateStr = (payload.date && /^\d{4}-\d{2}-\d{2}$/.test(String(payload.date).trim()))
      ? String(payload.date).trim()
      : getTodayDateStr();

    const existing = allData.days[dateStr] || {
      schedules: [],
      todos: [],
      memo: '',
      customHoliday: null,
      updatedAt: 0
    };

    // 1. 合併行事安排 (Schedules)
    const incomingSchedules = parseSchedulesParam(payload.schedules || payload.sched);
    if (payload.replaceSchedules === true) {
      existing.schedules = incomingSchedules;
    } else {
      for (const s of incomingSchedules) {
        const dup = existing.schedules.find(
          ex => (s.id && ex.id === s.id) || (ex.time === s.time && ex.text === s.text)
        );
        if (dup) {
          dup.endTime = s.endTime || dup.endTime || '';
          dup.color = s.color || dup.color || 'sky';
        } else {
          existing.schedules.push({
            id: s.id || makeId(),
            time: s.time || '',
            endTime: s.endTime || '',
            text: s.text,
            color: VALID_COLORS.includes(s.color) ? s.color : 'sky'
          });
        }
      }
    }

    // 2. 合併待辦事項 (Todos)
    const incomingTodos = parseTodosParam(payload.todos || payload.todo);
    if (payload.replaceTodos === true) {
      existing.todos = incomingTodos;
    } else {
      for (const t of incomingTodos) {
        const dup = existing.todos.find(
          ex => (t.id && ex.id === t.id) || ex.text === t.text
        );
        if (dup) {
          if (typeof t.done === 'boolean') dup.done = t.done;
        } else {
          existing.todos.push({
            id: t.id || makeId(),
            text: t.text,
            done: Boolean(t.done)
          });
        }
      }
    }

    // 3. 合併註記備忘 (Memo)
    if (payload.memo !== undefined && payload.memo !== null && String(payload.memo).trim() !== '') {
      const newMemo = String(payload.memo).trim();
      const memoMode = payload.memoMode || 'append';
      if (memoMode === 'overwrite' || !existing.memo) {
        existing.memo = newMemo;
      } else if (!existing.memo.includes(newMemo)) {
        existing.memo = existing.memo.trim() + '\n' + newMemo;
      }
    }

    // 4. 休假標記
    if (payload.customHoliday !== undefined) {
      existing.customHoliday = payload.customHoliday === 'reset' ? null : payload.customHoliday;
    }

    existing.updatedAt = Date.now();
    pushDaySchedulesToGoogleCalendar(dateStr, existing);
    const savedRec = saveDayRecordToSheet(daysSheet, dateStr, existing);

    // 5. 若有傳入本週重點備忘 (weekKey + weekMemo)
    if (payload.weekKey && payload.weekMemo !== undefined) {
      saveWeekMemoToSheet(weeksSheet, String(payload.weekKey).trim(), String(payload.weekMemo));
    }

    return {
      ok: true,
      date: dateStr,
      record: savedRec,
      updatedAt: savedRec.updatedAt
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 批次同步 (供 AI 萬用年曆前端雙向同步呼叫)
 */
function syncCalendarBatch(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const { daysSheet, weeksSheet } = ensureSheets();
    const current = readAllCalendarData();

    const incomingDays = payload.days || {};
    const replaceDayKeys = new Set(Array.isArray(payload.replaceDates) ? payload.replaceDates : []);

    for (const [dateStr, inRec] of Object.entries(incomingDays)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !inRec) continue;
      const hasContent =
        (Array.isArray(inRec.schedules) && inRec.schedules.length > 0) ||
        (Array.isArray(inRec.todos) && inRec.todos.length > 0) ||
        Boolean(inRec.memo && String(inRec.memo).trim()) ||
        Boolean(inRec.customHoliday);

      const cloudRec = current.days[dateStr];
      if (!cloudRec && !hasContent) continue;

      const inUpdated = Number(inRec.updatedAt) || 0;
      const cloudUpdated = Number(cloudRec?.updatedAt) || 0;
      const combinedGcalIds = [
        ...new Set([...(cloudRec?.syncedGcalIds || []), ...(inRec.syncedGcalIds || [])])
      ];

      // 若是前端明確指定編輯覆蓋該日 (replaceDates) 或前端時間戳較新，以最新編輯為準；否則進行智慧聯集合併
      if (!cloudRec || replaceDayKeys.has(dateStr) || (inUpdated > 0 && inUpdated >= cloudUpdated)) {
        const merged = {
          schedules: Array.isArray(inRec.schedules) ? inRec.schedules : [],
          todos: Array.isArray(inRec.todos) ? inRec.todos : [],
          memo: String(inRec.memo ?? ''),
          customHoliday: inRec.customHoliday || null,
          syncedGcalIds: combinedGcalIds,
          updatedAt: inUpdated || Date.now()
        };
        if (replaceDayKeys.has(dateStr) || inUpdated > cloudUpdated) {
          pushDaySchedulesToGoogleCalendar(dateStr, merged);
        }
        current.days[dateStr] = saveDayRecordToSheet(daysSheet, dateStr, merged);
      } else if (hasContent && cloudRec) {
        // 聯集合併：保留雲端既有項目並補上本機獨有項目
        const mergedSchedules = [...(cloudRec.schedules || [])];
        for (const s of (inRec.schedules || [])) {
          if (!mergedSchedules.some(cs => cs.id === s.id || (cs.time === s.time && cs.text === s.text))) {
            mergedSchedules.push(s);
          }
        }
        const mergedTodos = [...(cloudRec.todos || [])];
        for (const t of (inRec.todos || [])) {
          if (!mergedTodos.some(ct => ct.id === t.id || ct.text === t.text)) {
            mergedTodos.push(t);
          }
        }
        let mergedMemo = cloudRec.memo || '';
        const inMemo = String(inRec.memo || '').trim();
        if (inMemo && !mergedMemo.includes(inMemo)) {
          mergedMemo = mergedMemo ? (mergedMemo + '\n' + inMemo) : inMemo;
        }
        const merged = {
          schedules: mergedSchedules,
          todos: mergedTodos,
          memo: mergedMemo,
          customHoliday: cloudRec.customHoliday || inRec.customHoliday || null,
          syncedGcalIds: combinedGcalIds,
          updatedAt: Math.max(cloudUpdated, inUpdated, Date.now())
        };
        current.days[dateStr] = saveDayRecordToSheet(daysSheet, dateStr, merged);
      }
    }

    // 從 Google Calendar 拉取最新活動（自動轉為萬用年曆的行程 / 待辦 / 備忘）
    pullFromGoogleCalendar(daysSheet, current.days, Boolean(payload.forceGcal));

    const incomingWeeks = payload.weekMemos || {};
    for (const [wKey, wVal] of Object.entries(incomingWeeks)) {
      if (!wKey) continue;
      const text = String(wVal ?? '').trim();
      if (!text && !current.weekMemos[wKey]) continue;
      saveWeekMemoToSheet(weeksSheet, wKey, text);
      current.weekMemos[wKey] = text;
    }

    return {
      ok: true,
      days: current.days,
      weekMemos: current.weekMemos,
      serverTime: Date.now()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 處理 HTTP GET：
 * 1. 若帶 action=sync -> 回傳 JSON 供萬用年曆前端拉取雲端資料
 * 2. 若帶 action=api_write -> 直接寫入並回傳 JSON
 * 3. 一般開啟或點擊 Gemini Skill 連結 -> 渲染質感確認與快寫頁面 (index.html)
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action || '';

  if (action === 'sync' || action === 'get') {
    const { daysSheet } = ensureSheets();
    const data = readAllCalendarData();
    pullFromGoogleCalendar(daysSheet, data.days, params.forceGcal === '1');
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, ...data }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'api_write') {
    const res = upsertCalendarEntry({
      date: params.date,
      schedules: params.sched || params.schedules,
      todos: params.todo || params.todos,
      memo: params.memo,
      memoMode: params.memoMode || 'append',
      customHoliday: params.holiday,
      weekKey: params.weekKey,
      weekMemo: params.weekMemo
    });
    return ContentService
      .createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const initialPayload = {
    date: params.date || getTodayDateStr(),
    schedules: parseSchedulesParam(params.sched || params.schedules || ''),
    todos: parseTodosParam(params.todo || params.todos || ''),
    memo: params.memo || '',
    memoMode: params.memoMode || 'append',
    weekKey: params.weekKey || '',
    weekMemo: params.weekMemo || '',
    autoWrite: params.auto !== '0' && Boolean(params.sched || params.schedules || params.todo || params.todos || params.memo || params.weekMemo)
  };

  const tpl = HtmlService.createTemplateFromFile('index');
  tpl.initialPayloadJson = JSON.stringify(initialPayload);
  return tpl
    .evaluate()
    .setTitle('AI 萬用年曆 — 雲端快寫與同步中心')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * 處理 HTTP POST：
 * 支援 text/plain JSON body 以避開瀏覽器 CORS OPTIONS 預檢請求
 */
function doPost(e) {
  try {
    const rawBody = e?.postData?.contents || '{}';
    const body = JSON.parse(rawBody);
    const action = body.action || 'upsert';

    if (action === 'sync_batch' || action === 'sync_push') {
      const res = syncCalendarBatch(body);
      return ContentService
        .createTextOutput(JSON.stringify(res))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const res = upsertCalendarEntry(body);
    return ContentService
      .createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
