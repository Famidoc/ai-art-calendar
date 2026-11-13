// ============================================================================
// AI 繪圖橫式萬年桌面月曆 (萬用年曆 + 每年獨立 12 月份畫作 + IndexedDB + PWA 支援)
// ============================================================================

const MONTH_THEMES = {
  1:  { en: 'JANUARY',   poetic: '端月', defaultTitle: '晨光破曉 · 迎向嶄新的一年',   theme: ['#0f172a', '#1e3a8a', '#38bdf8'] },
  2:  { en: 'FEBRUARY',  poetic: '花月', defaultTitle: '春櫻漫舞 · 溫暖團圓時節',     theme: ['#2e1065', '#831843', '#fb7185'] },
  3:  { en: 'MARCH',     poetic: '桐月', defaultTitle: '春風拂翠 · 萬物甦醒之詩',     theme: ['#064e3b', '#0f766e', '#34d399'] },
  4:  { en: 'APRIL',     poetic: '梅月', defaultTitle: '煙雨微醺 · 山林間的呼吸',     theme: ['#1e1b4b', '#312e81', '#818cf8'] },
  5:  { en: 'MAY',       poetic: '蒲月', defaultTitle: '初夏光影 · 迎風馳騁的公路',   theme: ['#14532d', '#15803d', '#86efac'] },
  6:  { en: 'JUNE',      poetic: '荔月', defaultTitle: '仲夏蔚藍 · 海岸線的微風',     theme: ['#0c4a6e', '#0284c7', '#7dd3fc'] },
  7:  { en: 'JULY',      poetic: '瓜月', defaultTitle: '盛夏璀璨 · 星空下的奇想',     theme: ['#3b0764', '#6d28d9', '#c084fc'] },
  8:  { en: 'AUGUST',    poetic: '桂月', defaultTitle: '流金歲月 · 午後的山城雲海',   theme: ['#451a03', '#b45309', '#fbbf24'] },
  9:  { en: 'SEPTEMBER', poetic: '菊月', defaultTitle: '秋高氣爽 · 銀白月光與桂花香', theme: ['#1e293b', '#334155', '#f8fafc'] },
  10: { en: 'OCTOBER',   poetic: '陽月', defaultTitle: '楓紅層林 · 雙輪踏過的秋色',   theme: ['#431407', '#9a3412', '#fb923c'] },
  11: { en: 'NOVEMBER',  poetic: '葭月', defaultTitle: '薄霧山嵐 · 靜謐深秋的思索',   theme: ['#111827', '#374151', '#9ca3af'] },
  12: { en: 'DECEMBER',  poetic: '臘月', defaultTitle: '冬日暖陽 · 歲末星河的祝福',   theme: ['#090d16', '#1e3a8a', '#f43f5e'] }
};

// 天干、地支、生肖萬年推算
const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZODIAC_ANIMALS = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'];

function getYearGanZhiZodiac(year) {
  const idx10 = ((year - 4) % 10 + 10) % 10;
  const idx12 = ((year - 4) % 12 + 12) % 12;
  return `${HEAVENLY_STEMS[idx10]}${EARTHLY_BRANCHES[idx12]}${ZODIAC_ANIMALS[idx12]}年`;
}

function getMonthMeta(year, month) {
  const base = MONTH_THEMES[month] || MONTH_THEMES[1];
  return {
    en: `${base.en} ${year}`,
    lunar: `${getYearGanZhiZodiac(year)} · ${base.poetic}`,
    defaultTitle: month === 1 ? `晨光破曉 · 迎向嶄新的 ${year}` : base.defaultTitle,
    theme: base.theme
  };
}

function getYearMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// ============================================================================
// 萬年曆核心演算法：農曆換算、二十四節氣、台灣國定假日與自動補假推算
// ============================================================================
const lunarFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { month: 'numeric', day: 'numeric' });
  } catch (_) {
    return null;
  }
})();

const CN_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'];
const CN_DAY_NAMES = [
  '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];

function getLunarParts(dateObj) {
  if (!lunarFormatter) return null;
  try {
    const parts = lunarFormatter.formatToParts(dateObj);
    const mPart = parts.find(p => p.type === 'month')?.value || '';
    const dPart = parts.find(p => p.type === 'day')?.value || '';
    const isLeap = mPart.includes('閏') || mPart.includes('bis');
    const mNum = parseInt(mPart.replace(/[^\d]/g, ''), 10);
    const dNum = parseInt(dPart.replace(/[^\d]/g, ''), 10);
    if (!mNum || !dNum) return null;
    const mLabel = `${isLeap ? '閏' : ''}${CN_MONTH_NAMES[mNum - 1] || mNum}月`;
    const dLabel = CN_DAY_NAMES[dNum] || `${dNum}日`;
    return { month: mNum, day: dNum, isLeap, label: `農曆${mLabel}${dLabel}`, shortDay: dNum === 1 ? mLabel : dLabel };
  } catch (_) {
    return null;
  }
}

// 21世紀與20世紀二十四節氣 C 值常數表 (壽星萬年曆天文公式)
const SOLAR_TERMS_DEF = [
  { name: '小寒', month: 1,  c21: 5.4055,  c20: 6.11 },
  { name: '大寒', month: 1,  c21: 20.12,   c20: 20.84 },
  { name: '立春', month: 2,  c21: 3.87,    c20: 4.6295 },
  { name: '雨水', month: 2,  c21: 18.73,   c20: 19.4599 },
  { name: '驚蟄', month: 3,  c21: 5.63,    c20: 6.3826 },
  { name: '春分', month: 3,  c21: 20.646,  c20: 21.4155 },
  { name: '清明', month: 4,  c21: 4.81,    c20: 5.59 },
  { name: '穀雨', month: 4,  c21: 20.1,    c20: 20.888 },
  { name: '立夏', month: 5,  c21: 5.52,    c20: 6.318 },
  { name: '小滿', month: 5,  c21: 21.04,   c20: 21.86 },
  { name: '芒種', month: 6,  c21: 5.678,   c20: 6.5 },
  { name: '夏至', month: 6,  c21: 21.37,   c20: 22.2 },
  { name: '小暑', month: 7,  c21: 7.108,   c20: 7.928 },
  { name: '大暑', month: 7,  c21: 22.83,   c20: 23.65 },
  { name: '立秋', month: 8,  c21: 7.5,     c20: 8.35 },
  { name: '處暑', month: 8,  c21: 23.13,   c20: 23.95 },
  { name: '白露', month: 9,  c21: 7.646,   c20: 8.44 },
  { name: '秋分', month: 9,  c21: 23.042,  c20: 23.822 },
  { name: '寒露', month: 10, c21: 8.318,   c20: 9.098 },
  { name: '霜降', month: 10, c21: 23.438,  c20: 24.218 },
  { name: '立冬', month: 11, c21: 7.438,   c20: 8.218 },
  { name: '小雪', month: 11, c21: 22.36,   c20: 23.08 },
  { name: '大雪', month: 12, c21: 7.18,    c20: 7.9 },
  { name: '冬至', month: 12, c21: 21.94,   c20: 22.6 }
];

// 固定國曆紀念日與節日 (不放假之傳統/現代節日)
const FIXED_SOLAR_FESTIVALS = {
  '01-15': '藥師節',
  '02-14': '情人節',
  '03-08': '婦女節',
  '03-12': '植樹節',
  '04-22': '世界地球日',
  '05-12': '護師節',
  '08-08': '父親節',
  '09-28': '教師節',
  '10-31': '萬聖節',
  '11-12': '醫師節',
  '12-24': '平安夜',
  '12-31': '跨年夜'
};

// 每年快取：避免重複計算同一年的 365 天農曆與假日
const yearCalendarCache = new Map();

function buildYearCalendarCache(year) {
  if (yearCalendarCache.has(year)) return yearCalendarCache.get(year);

  const holidays = {};  // 'YYYY-MM-DD' -> { name, isHoliday: true }
  const festivals = {}; // 'YYYY-MM-DD' -> string
  const lunarMap = {};  // 'YYYY-MM-DD' -> { month, day, isLeap, label, shortDay }

  const addFestival = (dateStr, name) => {
    if (!festivals[dateStr]) festivals[dateStr] = name;
    else if (!festivals[dateStr].includes(name)) festivals[dateStr] += `·${name}`;
  };

  // 1. 計算 24 節氣
  const yMod = year % 100;
  const is20th = year < 2000;
  let qingmingDateStr = `${year}-04-05`;

  for (const st of SOLAR_TERMS_DEF) {
    const c = is20th ? st.c20 : st.c21;
    let leapCount = Math.floor((yMod - 1) / 4);
    if (st.month <= 2) leapCount = Math.floor(yMod / 4);
    let day = Math.floor(yMod * 0.2422 + c) - leapCount;
    // 個別年份微調
    if (year === 2026 && st.name === '春分') day = 20;
    const dStr = formatDateStr(year, st.month, day);
    if (st.name === '清明') {
      qingmingDateStr = dStr;
    } else {
      addFestival(dStr, st.name);
    }
  }

  // 2. 固定國曆節日與母親節 (5月第2個週日)
  for (const [mmdd, fName] of Object.entries(FIXED_SOLAR_FESTIVALS)) {
    addFestival(`${year}-${mmdd}`, fName);
  }
  // 計算 5 月第 2 個週日 (母親節)
  const may1Dow = new Date(year, 4, 1).getDay();
  const firstSun = may1Dow === 0 ? 1 : (8 - may1Dow);
  const mothersDay = firstSun + 7;
  addFestival(formatDateStr(year, 5, mothersDay), '母親節');

  // 3. 逐日掃描全年農曆日期與傳統農曆節慶
  const startDay = new Date(year, 0, 1, 12, 0, 0);
  const endDay = new Date(year, 11, 31, 12, 0, 0);
  const lunarNewYearDates = [];

  for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
    const dStr = formatDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const lp = getLunarParts(d);
    if (!lp) continue;
    lunarMap[dStr] = lp;

    if (!lp.isLeap) {
      if (lp.month === 1 && lp.day === 1) {
        holidays[dStr] = { name: '春節初一', isHoliday: true };
        lunarNewYearDates.push(new Date(d));
      } else if (lp.month === 1 && lp.day === 2) {
        holidays[dStr] = { name: '春節初二', isHoliday: true };
      } else if (lp.month === 1 && lp.day === 3) {
        holidays[dStr] = { name: '春節初三', isHoliday: true };
      } else if (lp.month === 1 && lp.day === 15) {
        addFestival(dStr, '元宵節');
      } else if (lp.month === 5 && lp.day === 5) {
        holidays[dStr] = { name: '端午節', isHoliday: true };
      } else if (lp.month === 7 && lp.day === 7) {
        addFestival(dStr, '七夕情人節');
      } else if (lp.month === 7 && lp.day === 15) {
        addFestival(dStr, '中元節');
      } else if (lp.month === 8 && lp.day === 15) {
        holidays[dStr] = { name: '中秋節', isHoliday: true };
      } else if (lp.month === 9 && lp.day === 9) {
        addFestival(dStr, '重陽節');
      } else if (lp.month === 12 && lp.day === 8) {
        addFestival(dStr, '臘八節');
      }
    }
  }

  // 根據大年初一反推「除夕」與「小年夜」，以及春節遇週末自動補假
  for (const cnyDate of lunarNewYearDates) {
    const chuxi = new Date(cnyDate);
    chuxi.setDate(chuxi.getDate() - 1);
    if (chuxi.getFullYear() === year) {
      holidays[formatDateStr(year, chuxi.getMonth() + 1, chuxi.getDate())] = { name: '除夕', isHoliday: true };
    }
    const xiaonian = new Date(cnyDate);
    xiaonian.setDate(xiaonian.getDate() - 2);
    if (xiaonian.getFullYear() === year) {
      holidays[formatDateStr(year, xiaonian.getMonth() + 1, xiaonian.getDate())] = { name: '小年夜', isHoliday: true };
    }

    // 計算除夕 ~ 初三 (4天核心春節假期) 中有幾天落在週六或週日，於初四起依序補假
    let weekendOverlap = 0;
    for (let offset = -1; offset <= 2; offset++) {
      const checkD = new Date(cnyDate);
      checkD.setDate(checkD.getDate() + offset);
      const dow = checkD.getDay();
      if (dow === 0 || dow === 6) weekendOverlap++;
    }
    let compCursor = new Date(cnyDate);
    compCursor.setDate(compCursor.getDate() + 3); // 從初四開始補假
    while (weekendOverlap > 0) {
      const dow = compCursor.getDay();
      if (dow !== 0 && dow !== 6) {
        const compStr = formatDateStr(compCursor.getFullYear(), compCursor.getMonth() + 1, compCursor.getDate());
        if (compCursor.getFullYear() === year && !holidays[compStr]) {
          holidays[compStr] = { name: '春節補假', isHoliday: true };
        }
        weekendOverlap--;
      }
      compCursor.setDate(compCursor.getDate() + 1);
    }
  }

  // 4. 固定國曆國定假日 + 逢週末補假規則 (週六補週五、週日補週一)
  const addNationalHolidayWithComp = (month, day, name, compName) => {
    const dObj = new Date(year, month - 1, day, 12, 0, 0);
    const dStr = formatDateStr(year, month, day);
    holidays[dStr] = { name, isHoliday: true };
    const dow = dObj.getDay();
    if (dow === 6) {
      const fri = new Date(dObj);
      fri.setDate(fri.getDate() - 1);
      if (fri.getFullYear() === year) {
        const fStr = formatDateStr(year, fri.getMonth() + 1, fri.getDate());
        if (!holidays[fStr]) holidays[fStr] = { name: compName || `${name}補假`, isHoliday: true };
      }
    } else if (dow === 0) {
      const mon = new Date(dObj);
      mon.setDate(mon.getDate() + 1);
      if (mon.getFullYear() === year) {
        const mStr = formatDateStr(year, mon.getMonth() + 1, mon.getDate());
        if (!holidays[mStr]) holidays[mStr] = { name: compName || `${name}補假`, isHoliday: true };
      }
    }
  };

  addNationalHolidayWithComp(1, 1, '元旦', '元旦補假');
  addNationalHolidayWithComp(2, 28, '和平紀念日', '228補假');
  addNationalHolidayWithComp(5, 1, '勞動節', '勞動節補假');
  addNationalHolidayWithComp(10, 10, '國慶日', '國慶補假');
  addNationalHolidayWithComp(12, 25, '行憲紀念日', '行憲補假');

  // 兒童節 (4/4) 與 清明節 (4/4 或 4/5) 連假補假處理
  const qmDay = Number(qingmingDateStr.slice(-2));
  if (qmDay === 4) {
    // 兒童節與清明節同一天 (4/4)
    holidays[`${year}-04-04`] = { name: '兒童·清明節', isHoliday: true };
    const dow4 = new Date(year, 3, 4).getDay();
    if (dow4 === 0) {
      holidays[`${year}-04-05`] = { name: '清明補假', isHoliday: true };
      holidays[`${year}-04-03`] = { name: '兒童節補假', isHoliday: true };
    } else if (dow4 === 6) {
      holidays[`${year}-04-03`] = { name: '兒童節補假', isHoliday: true };
      holidays[`${year}-04-06`] = { name: '清明補假', isHoliday: true };
    } else {
      holidays[`${year}-04-05`] = { name: '兒童節補假', isHoliday: true };
    }
  } else {
    addNationalHolidayWithComp(4, 4, '兒童節', '兒童節補假');
    const qmDow = new Date(year, 3, qmDay).getDay();
    holidays[qingmingDateStr] = { name: '清明節', isHoliday: true };
    if (qmDow === 6) {
      const prevStr = formatDateStr(year, 4, qmDay - 1);
      if (!holidays[prevStr]) holidays[prevStr] = { name: '清明補假', isHoliday: true };
      else holidays[formatDateStr(year, 4, qmDay - 2)] = { name: '兒童節補假', isHoliday: true };
    } else if (qmDow === 0) {
      const nextStr = formatDateStr(year, 4, qmDay + 1);
      if (!holidays[nextStr]) holidays[nextStr] = { name: '清明補假', isHoliday: true };
    }
  }

  // 端午節與中秋節逢週末補假
  for (const [hDateStr, hInfo] of Object.entries({ ...holidays })) {
    if (hInfo.name === '端午節' || hInfo.name === '中秋節') {
      const dObj = parseDateStr(hDateStr);
      const dow = dObj.getDay();
      if (dow === 6) {
        const fri = new Date(dObj);
        fri.setDate(fri.getDate() - 1);
        const fStr = formatDateStr(fri.getFullYear(), fri.getMonth() + 1, fri.getDate());
        if (!holidays[fStr]) holidays[fStr] = { name: `${hInfo.name}補假`, isHoliday: true };
      } else if (dow === 0) {
        const mon = new Date(dObj);
        mon.setDate(mon.getDate() + 1);
        const mStr = formatDateStr(mon.getFullYear(), mon.getMonth() + 1, mon.getDate());
        if (!holidays[mStr]) holidays[mStr] = { name: `${hInfo.name}補假`, isHoliday: true };
      }
    }
  }

  const result = { holidays, festivals, lunarMap };
  yearCalendarCache.set(year, result);
  return result;
}

// ============================================================================
// 預設狀態結構 (萬年曆 + 每年獨立 12 個月自訂畫作)
// ============================================================================
const nowInit = new Date();
const INIT_YEAR = nowInit.getFullYear();
const INIT_MONTH = nowInit.getMonth() + 1;

const state = {
  currentView: 'month', // 'month' | 'week' | 'day'
  currentYear: INIT_YEAR,
  currentMonth: INIT_MONTH, // 1 ~ 12
  currentWeekIndex: 0,      // 0 ~ weeks.length-1 within currentMonth
  currentDateStr: formatDateStr(INIT_YEAR, INIT_MONTH, nowInit.getDate()),
  selectedColor: 'sky',
  editingScheduleId: null,  // 正在編輯中的行程 ID (null 代表新增模式)
  folderImages: {},         // 從 /api/images 掃描到的 { "2027-01": "/images/2027-01.png", ... }
  data: {
    settings: {
      startOnMonday: false, // false = 週日始, true = 週一始
      opacity: 98,
      lastViewedYear: INIT_YEAR,
      lastViewedMonth: INIT_MONTH
    },
    monthArt: {
      // 以 "YYYY-MM" 為 key 分年獨立儲存：
      // "2027-01": { customDataUrl, caption, posY: 50, fitMode: 'cover' }
    },
    weekMemos: {
      // '2027-01-W1': '本週重點目標...'
    },
    days: {
      // '2027-01-01': { schedules: [{id, time, text, color}], todos: [{id, text, done}], memo: '', customHoliday: null | 'holiday' | 'workday' }
    }
  }
};

function ensureMonthArtConfig(year, month) {
  const ymKey = getYearMonthKey(year, month);
  if (!state.data.monthArt[ymKey]) {
    const meta = getMonthMeta(year, month);
    state.data.monthArt[ymKey] = {
      customDataUrl: null,
      caption: meta.defaultTitle,
      posY: 50,
      fitMode: 'cover'
    };
  }
  return state.data.monthArt[ymKey];
}

// ============================================================================
// 工具函式：日期處理與預設藝術畫布生成
// ============================================================================
function formatDateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

const WEEKDAY_NAMES_SUN = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const WEEKDAY_NAMES_MON = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

function getDayMeta(dateObj) {
  const y = dateObj.getFullYear();
  const m = dateObj.getMonth() + 1;
  const d = dateObj.getDate();
  const dateStr = formatDateStr(y, m, d);
  const dow = dateObj.getDay(); // 0(Sun) .. 6(Sat)
  const isWeekend = dow === 0 || dow === 6;

  const yearCal = buildYearCalendarCache(y);
  const autoHoliday = yearCal.holidays[dateStr] || null;
  const solarOrFest = yearCal.festivals[dateStr] || null;
  const lunarInfo = yearCal.lunarMap[dateStr] || null;

  // 檢查使用者是否對此日設定了手動「休假紅字 / 補班日」覆蓋
  const dayRec = state.data.days[dateStr];
  const customOverride = dayRec?.customHoliday || null; // 'holiday' | 'workday' | null

  let isHoliday = Boolean(autoHoliday?.isHoliday);
  let holidayName = autoHoliday?.name || null;

  if (customOverride === 'holiday') {
    isHoliday = true;
    if (!holidayName) holidayName = '自訂休假';
  } else if (customOverride === 'workday') {
    isHoliday = false;
    holidayName = '補班日';
  }

  // 決定是否顯示為紅字 (國定假日、自訂休假、或未被設為補班日的週末)
  const isRedDay = customOverride === 'workday' ? false : (isHoliday || isWeekend);

  return {
    year: y,
    month: m,
    day: d,
    dateStr,
    dow,
    weekdayName: WEEKDAY_NAMES_SUN[dow],
    isWeekend,
    isHoliday,
    isRedDay,
    customOverride,
    holidayName,
    solarName: solarOrFest,
    lunarLabel: lunarInfo?.label || '',
    lunarShort: lunarInfo?.shortDay || ''
  };
}

/**
 * 計算指定年份、月份 (1~12) 的所有週次陣列
 * 每一週包含 7 個 Date 物件
 */
function getMonthWeeks(year, month, startOnMonday = false) {
  const firstDay = new Date(year, month - 1, 1, 12, 0, 0);
  const lastDay = new Date(year, month, 0, 12, 0, 0);

  let firstDow = firstDay.getDay(); // 0..6
  let offset = startOnMonday ? (firstDow === 0 ? 6 : firstDow - 1) : firstDow;

  const startDate = new Date(year, month - 1, 1 - offset, 12, 0, 0);
  const weeks = [];
  let cursor = new Date(startDate);

  while (true) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor > lastDay && weeks.length >= 5) break;
    if (weeks.length >= 6) break;
  }
  return weeks;
}

/**
 * 當使用者尚未放入該年該月 AI 繪圖時，自動生成極具藝術感的 SVG 漸層星雲風景預設圖
 */
function generateDefaultArtworkSVG(year, month) {
  const meta = getMonthMeta(year, month);
  const [c1, c2, c3] = meta.theme;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="55%" stop-color="${c2}" />
        <stop offset="100%" stop-color="${c3}" />
      </linearGradient>
      <radialGradient id="glow" cx="72%" cy="32%" r="45%">
        <stop offset="0%" stop-color="${c3}" stop-opacity="0.55" />
        <stop offset="100%" stop-color="${c1}" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)" />
    <rect width="1600" height="900" fill="url(#glow)" />
    <circle cx="1180" cy="260" r="130" fill="#ffffff" fill-opacity="0.12" />
    <circle cx="1180" cy="260" r="85" fill="#ffffff" fill-opacity="0.22" />
    <path d="M0,680 Q360,510 760,640 T1600,560 L1600,900 L0,900 Z" fill="${c1}" fill-opacity="0.45" />
    <path d="M0,740 Q520,600 980,720 T1600,670 L1600,900 L0,900 Z" fill="#090d16" fill-opacity="0.68" />
    <text x="800" y="390" text-anchor="middle" fill="#ffffff" fill-opacity="0.24" font-family="sans-serif" font-size="25" letter-spacing="5">
      ${year} / ${String(month).padStart(2, '0')} · 將您的 AI 繪圖拖曳至此處或點右上角「換圖」（各年份獨立保存）
    </text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function ensureDayRecord(dateStr) {
  if (!state.data.days[dateStr]) {
    state.data.days[dateStr] = {
      schedules: [],
      todos: [],
      memo: '',
      memoImages: [],
      customHoliday: null
    };
  }
  if (!Array.isArray(state.data.days[dateStr].memoImages)) {
    state.data.days[dateStr].memoImages = [];
  }
  return state.data.days[dateStr];
}

function openMemoLightbox(imgSrc) {
  if (!imgSrc) return;
  const lb = document.getElementById('memo-img-lightbox');
  const lbImg = document.getElementById('memo-lightbox-img');
  if (lb && lbImg) {
    lbImg.src = imgSrc;
    lb.classList.remove('hidden');
  }
}

function closeMemoLightbox() {
  const lb = document.getElementById('memo-img-lightbox');
  const lbImg = document.getElementById('memo-lightbox-img');
  if (lb) lb.classList.add('hidden');
  if (lbImg) lbImg.src = '';
}

function compressImageBlobToDataUrl(blob, maxDim = 1600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const rawDataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w <= maxDim && h <= maxDim && blob.size <= 380 * 1024) {
          resolve(rawDataUrl);
          return;
        }
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const compressed = canvas.toDataURL('image/webp', 0.88);
        resolve(compressed.startsWith('data:image/webp') ? compressed : canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(blob);
  });
}

async function addMemoImageFromBlob(blob, targetDateStr = state.currentDateStr) {
  if (!blob || !blob.type?.startsWith('image/')) return false;
  setSaveStatus('⏳ 正在處理貼上的圖片...');
  try {
    const dataUrl = await compressImageBlobToDataUrl(blob);
    const dayRec = ensureDayRecord(targetDateStr);
    dayRec.memoImages.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      dataUrl,
      createdAt: new Date().toISOString()
    });
    triggerAutoSave();
    if (state.currentView === 'day') renderDayView();
    else if (state.currentView === 'week') renderWeekView();
    else if (state.currentView === 'month') renderMonthView();
    setSaveStatus('✓ 已貼上圖片至備忘錄');
    return true;
  } catch (err) {
    console.warn('Add memo image failed:', err);
    setSaveStatus('⚠️ 圖片處理失敗');
    return false;
  }
}

function formatScheduleTimeLabel(item, fallback = '') {
  const start = (item?.time || '').trim();
  const end = (item?.endTime || '').trim();
  if (start && end) return `${start}~${end}`;
  if (start) return start;
  if (end) return `~${end}`;
  return fallback;
}

function setColorPickerSelection(colorName) {
  const targetColor = colorName || 'sky';
  state.selectedColor = targetColor;
  document.querySelectorAll('#sched-color-picker .color-dot').forEach(b => {
    b.classList.toggle('active', b.dataset.color === targetColor);
  });
}

function startEditSchedule(item) {
  if (!item) return;
  state.editingScheduleId = item.id;
  const startInput = document.getElementById('sched-time-input');
  const endInput = document.getElementById('sched-end-time-input');
  const textInput = document.getElementById('sched-text-input');
  const submitBtn = document.getElementById('btn-submit-schedule');
  const cancelBtn = document.getElementById('btn-cancel-edit-schedule');

  if (startInput) startInput.value = item.time || '';
  if (endInput) endInput.value = item.endTime || '';
  if (textInput) textInput.value = item.text || '';
  setColorPickerSelection(item.color || 'sky');

  if (submitBtn) submitBtn.textContent = '✓ 儲存';
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  renderDayView();
  if (endInput && !item.endTime) {
    endInput.focus();
  } else if (textInput) {
    textInput.focus();
  }
}

function cancelEditSchedule(skipRender = false) {
  state.editingScheduleId = null;
  const startInput = document.getElementById('sched-time-input');
  const endInput = document.getElementById('sched-end-time-input');
  const textInput = document.getElementById('sched-text-input');
  const submitBtn = document.getElementById('btn-submit-schedule');
  const cancelBtn = document.getElementById('btn-cancel-edit-schedule');

  if (startInput && !startInput.value) startInput.value = '09:00';
  if (endInput) endInput.value = '';
  if (textInput) textInput.value = '';
  if (submitBtn) submitBtn.textContent = '＋ 新增';
  if (cancelBtn) cancelBtn.classList.add('hidden');
  if (!skipRender && state.currentView === 'day') {
    renderDayView();
  }
}

// ============================================================================
// 資料讀取與自動儲存 (IndexedDB 大容量資料庫 + 本機 Node API + localStorage 三重保障)
// ============================================================================
const STORAGE_KEY = 'antigravity_calendar_universal_v2';
const LEGACY_STORAGE_KEY = 'antigravity_calendar_2027_v1';
const IDB_NAME = 'ArtCalendarUniversalDB';
const IDB_STORE = 'appStateStore';
const IDB_KEY = 'universal_calendar_data';
const CLOUD_SYNC_URL = 'https://script.google.com/macros/s/AKfycbw52alTyL-zPAYH6GKJHb3vED2smOanSX7W2BdiRdRQWJgvv0nrvIe9MLKdyHsJueqD/exec';
let saveTimer = null;
let cloudSyncInFlight = false;
let lastCloudPullTime = 0;
const pendingCloudReplaceDates = new Set();

function markDayUpdated(dateStr = state.currentDateStr) {
  if (!dateStr) return;
  const rec = ensureDayRecord(dateStr);
  rec.updatedAt = Date.now();
  pendingCloudReplaceDates.add(dateStr);
}

function openCalendarDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetData() {
  try {
    const db = await openCalendarDB();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB read warning:', e);
    return null;
  }
}

async function idbSetData(dataObj) {
  try {
    const db = await openCalendarDB();
    if (!db) return false;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(dataObj, IDB_KEY);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
    return true;
  } catch (e) {
    console.warn('IndexedDB write warning:', e);
    return false;
  }
}

function setSaveStatus(text) {
  const el = document.getElementById('save-status');
  if (el) el.textContent = text;
}

async function loadAllData() {
  // 1. 先從舊版或新版 localStorage 讀取輕量快取
  try {
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      mergeLoadedData(JSON.parse(legacyRaw));
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      mergeLoadedData(JSON.parse(raw));
    }
  } catch (e) {
    console.warn('localStorage load failed:', e);
  }

  // 2. 從大容量 IndexedDB 載入完整資料 (包含親友在 PWA 中上傳的高畫質跨年份圖片)
  const idbData = await idbGetData();
  if (idbData) {
    mergeLoadedData(idbData);
  }

  // 3. 嘗試向本機伺服器 /api/data 取得最新 JSON 與 images 資料夾圖片
  try {
    const res = await fetch('/api/data');
    if (res.ok) {
      const payload = await res.json();
      if (payload.folderImages) {
        state.folderImages = payload.folderImages;
      }
      if (payload.data) {
        mergeLoadedData(payload.data);
      }
      return;
    }
  } catch (_) {}

  // 4. 若在純靜態網頁 / PWA 託管模式執行（如 GitHub Pages，無 server.mjs），自動讀取靜態 images/manifest.json 與預設畫作設定
  try {
    const res = await fetch('./images/manifest.json');
    if (res.ok) {
      const staticImages = await res.json();
      if (staticImages && typeof staticImages === 'object') {
        state.folderImages = staticImages;
      }
    }
  } catch (_) {}

  if (!idbData) {
    try {
      const resData = await fetch('./data/calendar-data.json');
      if (resData.ok) {
        const defaultData = await resData.json();
        if (defaultData?.monthArt) {
          mergeLoadedData({ monthArt: defaultData.monthArt });
        }
      }
    } catch (_) {}
  }
}

function mergeLoadedData(incoming) {
  if (!incoming || typeof incoming !== 'object') return;
  if (incoming.settings) {
    state.data.settings = { ...state.data.settings, ...incoming.settings };
  }
  if (incoming.monthArt && typeof incoming.monthArt === 'object') {
    for (const [k, val] of Object.entries(incoming.monthArt)) {
      if (!val || typeof val !== 'object') continue;
      // 自動相容舊版 1~12 key -> 轉換為 "2027-01" ~ "2027-12"
      if (/^\d{1,2}$/.test(k)) {
        const ymKey = getYearMonthKey(2027, Number(k));
        state.data.monthArt[ymKey] = {
          ...ensureMonthArtConfig(2027, Number(k)),
          ...state.data.monthArt[ymKey],
          ...val
        };
      } else if (/^\d{4}-\d{2}$/.test(k)) {
        const [y, m] = k.split('-').map(Number);
        state.data.monthArt[k] = {
          ...ensureMonthArtConfig(y, m),
          ...state.data.monthArt[k],
          ...val
        };
      }
    }
  }
  if (incoming.weekMemos) {
    state.data.weekMemos = { ...state.data.weekMemos, ...incoming.weekMemos };
  }
  if (incoming.days && typeof incoming.days === 'object') {
    for (const [dateStr, inDay] of Object.entries(incoming.days)) {
      if (!inDay || typeof inDay !== 'object') continue;
      const curDay = state.data.days[dateStr];
      if (!curDay) {
        state.data.days[dateStr] = {
          schedules: Array.isArray(inDay.schedules) ? inDay.schedules : [],
          todos: Array.isArray(inDay.todos) ? inDay.todos : [],
          memo: String(inDay.memo ?? ''),
          memoImages: Array.isArray(inDay.memoImages) ? inDay.memoImages : [],
          customHoliday: inDay.customHoliday || null,
          updatedAt: Number(inDay.updatedAt) || 0
        };
      } else {
        const curTime = Number(curDay.updatedAt) || 0;
        const inTime = Number(inDay.updatedAt) || 0;
        const preservedImages = (Array.isArray(inDay.memoImages) && inDay.memoImages.length > 0)
          ? inDay.memoImages
          : (Array.isArray(curDay.memoImages) ? curDay.memoImages : []);

        if (inTime > curTime) {
          state.data.days[dateStr] = {
            schedules: Array.isArray(inDay.schedules) ? inDay.schedules : [],
            todos: Array.isArray(inDay.todos) ? inDay.todos : [],
            memo: String(inDay.memo ?? ''),
            memoImages: preservedImages,
            customHoliday: inDay.customHoliday ?? curDay.customHoliday ?? null,
            updatedAt: inTime
          };
        } else if (curTime === 0 && inTime === 0) {
          state.data.days[dateStr] = {
            ...curDay,
            ...inDay,
            memoImages: preservedImages
          };
        } else {
          curDay.memoImages = preservedImages;
        }
      }
    }
  }
}

async function persistLocalStateOnly() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  } catch (_) {
    try {
      const lightCopy = {
        ...state.data,
        monthArt: Object.fromEntries(
          Object.entries(state.data.monthArt).map(([k, v]) => [k, { ...v, customDataUrl: null }])
        ),
        days: Object.fromEntries(
          Object.entries(state.data.days).map(([k, v]) => [k, { ...v, memoImages: [] }])
        )
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightCopy));
    } catch (_) {}
  }
  await idbSetData(state.data);
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.data)
    });
  } catch (_) {}
}

/**
 * 與 Google Apps Script 雲端試算表雙向同步 (支援手機 Gemini Skill 寫入與跨裝置同步)
 */
async function syncWithCloud({ pushLocal = true, quiet = false } = {}) {
  if (!CLOUD_SYNC_URL || cloudSyncInFlight) return false;
  cloudSyncInFlight = true;
  if (!quiet) setSaveStatus('☁️ 雲端同步中...');

  try {
    let cloudPayload = null;
    if (pushLocal) {
      // 準備不含大型 Base64 圖片的輕量 days 結構上傳同步
      const lightDays = {};
      for (const [dKey, dVal] of Object.entries(state.data.days || {})) {
        if (!dVal) continue;
        const hasData =
          (Array.isArray(dVal.schedules) && dVal.schedules.length > 0) ||
          (Array.isArray(dVal.todos) && dVal.todos.length > 0) ||
          Boolean(dVal.memo && String(dVal.memo).trim()) ||
          Boolean(dVal.customHoliday) ||
          pendingCloudReplaceDates.has(dKey);
        if (!hasData) continue;
        lightDays[dKey] = {
          schedules: dVal.schedules || [],
          todos: dVal.todos || [],
          memo: dVal.memo || '',
          customHoliday: dVal.customHoliday || null,
          updatedAt: Number(dVal.updatedAt) || 0
        };
      }

      const replaceDates = [...pendingCloudReplaceDates];
      pendingCloudReplaceDates.clear();

      const res = await fetch(CLOUD_SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sync_batch',
          days: lightDays,
          weekMemos: state.data.weekMemos || {},
          replaceDates
        })
      });
      if (res.ok) {
        cloudPayload = await res.json();
      }
    } else {
      const res = await fetch(`${CLOUD_SYNC_URL}?action=sync&t=${Date.now()}`);
      if (res.ok) {
        cloudPayload = await res.json();
      }
    }

    if (cloudPayload && cloudPayload.ok) {
      lastCloudPullTime = Date.now();
      mergeLoadedData({
        days: cloudPayload.days || {},
        weekMemos: cloudPayload.weekMemos || {}
      });
      await persistLocalStateOnly();
      if (state.currentView === 'month') renderMonthView();
      else if (state.currentView === 'week') renderWeekView();
      else if (state.currentView === 'day') renderDayView();
      if (!quiet) setSaveStatus('☁️ 已雲端同步');
      return true;
    }
  } catch (err) {
    console.warn('Cloud sync skipped:', err);
  } finally {
    cloudSyncInFlight = false;
  }
  return false;
}

function triggerAutoSave(changedDateStr = null) {
  if (changedDateStr && typeof changedDateStr === 'string') {
    markDayUpdated(changedDateStr);
  }
  setSaveStatus('⏳ 儲存中...');
  state.data.settings.lastViewedYear = state.currentYear;
  state.data.settings.lastViewedMonth = state.currentMonth;

  // 1. 嘗試寫入輕量設定至 localStorage (若含大型 base64 圖檔超過 5MB 則只存非圖檔結構，完整圖檔交給 IndexedDB)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  } catch (_) {
    try {
      const lightCopy = {
        ...state.data,
        monthArt: Object.fromEntries(
          Object.entries(state.data.monthArt).map(([k, v]) => [k, { ...v, customDataUrl: null }])
        ),
        days: Object.fromEntries(
          Object.entries(state.data.days).map(([k, v]) => [k, { ...v, memoImages: [] }])
        )
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightCopy));
    } catch (_) {}
  }

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    // 2. 寫入大容量 IndexedDB (PWA 與跨年份高畫質圖片主力儲存)
    await idbSetData(state.data);

    // 3. 若有啟動本機 server.mjs，同步寫入硬碟 data/calendar-data.json
    let savedToServer = false;
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.data)
      });
      if (res.ok) {
        savedToServer = true;
      }
    } catch (_) {}

    // 4. 同步推送至 Google 雲端試算表 (GAS)
    const syncedCloud = await syncWithCloud({ pushLocal: true, quiet: true });
    if (syncedCloud) {
      setSaveStatus('☁️ 已雲端同步');
    } else if (savedToServer) {
      setSaveStatus('✓ 已自動存檔');
    } else {
      setSaveStatus('✓ 已存於裝置');
    }
  }, 350);
}

// ============================================================================
// 年份選擇器動態生成
// ============================================================================
function populateYearSelector(centerYear) {
  const yearSelect = document.getElementById('year-select');
  if (!yearSelect) return;
  const minYear = Math.min(2020, centerYear - 10);
  const maxYear = Math.max(2038, centerYear + 10);

  yearSelect.innerHTML = '';
  for (let y = minYear; y <= maxYear; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = `${y} 年`;
    if (y === state.currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }
}

// ============================================================================
// 畫面渲染：上半部 AI 繪圖展示區 (每年 12 個月各自獨立)
// ============================================================================
function renderArtworkSection() {
  const y = state.currentYear;
  const m = state.currentMonth;
  const ymKey = getYearMonthKey(y, m);
  const meta = getMonthMeta(y, m);
  const artCfg = ensureMonthArtConfig(y, m);

  // 決定圖片順序：
  // 1. 使用者在裝置上自訂上傳的 customDataUrl 或本機對應年月的實體圖檔
  // 2. 預設藝術漸層星雲圖
  const folderImg = state.folderImages[ymKey] || null;
  const hasCustomArt = Boolean(artCfg.customDataUrl || folderImg);
  const imgUrl = artCfg.customDataUrl || folderImg || generateDefaultArtworkSVG(y, m);

  const imgEl = document.getElementById('artwork-img');
  const blurBgEl = document.getElementById('artwork-ZeroBg');
  imgEl.src = imgUrl;
  imgEl.style.objectPosition = `50% ${artCfg.posY ?? 50}%`;
  imgEl.classList.toggle('fit-contain', artCfg.fitMode === 'contain');
  blurBgEl.style.backgroundImage = `url("${imgUrl}")`;

  // 更新頂部年份徽章與選擇器
  const badgeEl = document.getElementById('app-badge-year');
  if (badgeEl) badgeEl.textContent = `${y} ART CALENDAR`;

  populateYearSelector(y);
  document.getElementById('month-select').value = String(m);
  document.getElementById('art-pos-slider').value = String(artCfg.posY ?? 50);
  document.getElementById('btn-fit-mode').textContent = artCfg.fitMode === 'contain' ? '🖼️ 完整' : '📐 滿版';
  document.getElementById('drop-month-label').textContent = `${y}年 ${m}月`;

  // 顯示或隱藏「還原預設圖」按鈕
  const resetBtn = document.getElementById('btn-reset-art');
  if (resetBtn) {
    resetBtn.classList.toggle('hidden', !hasCustomArt);
  }

  // 更新左下角月份英雄字與畫作題詞
  document.getElementById('hero-month-num').textContent = String(m).padStart(2, '0');
  document.getElementById('hero-month-en').textContent = meta.en;
  document.getElementById('hero-month-lunar').textContent = meta.lunar;

  const captionInput = document.getElementById('artwork-caption-input');
  if (document.activeElement !== captionInput) {
    captionInput.value = artCfg.caption ?? meta.defaultTitle;
  }

  // 更新起始星期按鈕文字
  const startBtn = document.getElementById('btn-toggle-startday');
  startBtn.textContent = state.data.settings.startOnMonday ? '📅 週一始' : '📅 週日始';
}

// ============================================================================
// 畫面渲染：1. 月曆視圖 (Month View)
// ============================================================================
function renderMonthView() {
  const y = state.currentYear;
  const m = state.currentMonth;
  const startMon = state.data.settings.startOnMonday;
  const weeks = getMonthWeeks(y, m, startMon);

  // 1. 渲染星期標題列 (最左側固定為「週曆選單」)
  const headerEl = document.getElementById('month-weekday-header');
  const names = startMon ? WEEKDAY_NAMES_MON : WEEKDAY_NAMES_SUN;
  headerEl.innerHTML = `<div class="week-menu-col-header" title="點擊下方 W1~W6 按鈕進入該週的週曆">週曆選單</div>` +
    names.map((name, idx) => {
      const isWeekendCol = startMon ? (idx === 5 || idx === 6) : (idx === 0 || idx === 6);
      return `<div class="weekday-header-cell ${isWeekendCol ? 'weekend' : ''}">${name}</div>`;
    }).join('');

  // 2. 渲染每一週列：[左側週選單按鈕] + [7個日期格]
  const bodyEl = document.getElementById('month-grid-body');
  bodyEl.innerHTML = '';

  const now = new Date();
  const todayStr = formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());

  weeks.forEach((weekDays, wIdx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'month-week-row';

    const firstMeta = getDayMeta(weekDays[0]);
    const lastMeta = getDayMeta(weekDays[6]);

    // 左側週選單按鈕
    const weekBtn = document.createElement('button');
    weekBtn.type = 'button';
    weekBtn.className = 'week-menu-btn';
    weekBtn.title = `點擊進入 ${y}年 ${m}月 第 ${wIdx + 1} 週 (${firstMeta.month}/${firstMeta.day} ~ ${lastMeta.month}/${lastMeta.day}) 的週曆`;
    weekBtn.innerHTML = `
      <span class="week-code">W${wIdx + 1} ▸</span>
      <span class="week-sub">${firstMeta.month}/${firstMeta.day}~${lastMeta.day}</span>
    `;
    weekBtn.addEventListener('mouseenter', () => rowEl.classList.add('row-hover'));
    weekBtn.addEventListener('mouseleave', () => rowEl.classList.remove('row-hover'));
    weekBtn.addEventListener('click', () => {
      openWeekView(y, m, wIdx);
    });
    rowEl.appendChild(weekBtn);

    // 7 個日期格
    weekDays.forEach((dObj) => {
      const meta = getDayMeta(dObj);
      const isOtherMonth = meta.month !== m || meta.year !== y;
      const dayRec = state.data.days[meta.dateStr];

      const cell = document.createElement('div');
      cell.className = [
        'day-cell',
        isOtherMonth ? 'other-month' : '',
        meta.isRedDay ? 'is-holiday' : '',
        meta.dateStr === todayStr ? 'is-today' : ''
      ].filter(Boolean).join(' ');

      // 右上角標籤優先顯示：國定/自訂假日 > 節氣/節日 > 農曆初一/十五或日期
      let tagHtml = '';
      if (meta.holidayName) {
        const cls = meta.customOverride === 'workday' ? 'workday-tag' : 'holiday-tag';
        tagHtml = `<span class="day-tag ${cls}">${escapeHtml(meta.holidayName)}</span>`;
      } else if (meta.solarName) {
        tagHtml = `<span class="day-tag solar-tag">${escapeHtml(meta.solarName)}</span>`;
      } else if (meta.lunarShort) {
        tagHtml = `<span class="day-tag lunar-tag">${escapeHtml(meta.lunarShort)}</span>`;
      }

      // 下方行程膠囊預覽
      let previewHtml = '';
      const schedules = dayRec?.schedules || [];
      const todos = dayRec?.todos || [];
      const memoImgsCount = dayRec?.memoImages?.length || 0;
      const hasMemo = Boolean((dayRec?.memo && dayRec.memo.trim().length > 0) || memoImgsCount > 0);

      if (schedules.length > 0) {
        const first = schedules[0];
        const tLabel = formatScheduleTimeLabel(first);
        const label = tLabel ? `${tLabel} ${first.text}` : first.text;
        previewHtml += `<span class="mini-event-pill pill-${first.color || 'sky'}">${escapeHtml(label)}</span>`;
      }

      const indicators = [];
      if (schedules.length > 1) {
        indicators.push(`<span class="ind-dot" title="共 ${schedules.length} 筆行程">+${schedules.length - 1}</span>`);
      }
      if (todos.length > 0) {
        const doneCount = todos.filter(t => t.done).length;
        indicators.push(`<span class="ind-dot" title="待辦事項 ${doneCount}/${todos.length}">☑${doneCount}/${todos.length}</span>`);
      }
      if (hasMemo) {
        const memoTitle = memoImgsCount > 0 ? `有隨筆備忘（含 ${memoImgsCount} 張圖片）` : '有填寫隨筆備忘';
        indicators.push(`<span class="ind-dot" title="${memoTitle}">${memoImgsCount > 0 ? '🖼️' : '📝'}</span>`);
      }

      cell.innerHTML = `
        <div class="day-cell-top">
          <span class="day-num">${meta.day}</span>
          ${tagHtml}
        </div>
        <div class="day-cell-Previews">
          ${previewHtml}
          <div class="day-indicators">${indicators.join('')}</div>
        </div>
      `;

      cell.addEventListener('click', () => {
        openDayView(meta.dateStr);
      });

      rowEl.appendChild(cell);
    });

    bodyEl.appendChild(rowEl);
  });
}

// ============================================================================
// 畫面渲染：2. 週曆視圖 (Week View)
// ============================================================================
function renderWeekView() {
  const y = state.currentYear;
  const m = state.currentMonth;
  const startMon = state.data.settings.startOnMonday;
  const weeks = getMonthWeeks(y, m, startMon);
  if (state.currentWeekIndex >= weeks.length) state.currentWeekIndex = 0;

  const weekDays = weeks[state.currentWeekIndex];
  const firstMeta = getDayMeta(weekDays[0]);
  const lastMeta = getDayMeta(weekDays[6]);

  document.getElementById('week-view-title').textContent =
    `${y}年 ${m}月 · 第 ${state.currentWeekIndex + 1} 週 (${firstMeta.month}/${firstMeta.day} ~ ${lastMeta.month}/${lastMeta.day})`;

  const weekKey = `${y}-${String(m).padStart(2, '0')}-W${state.currentWeekIndex + 1}`;
  const weekMemoInput = document.getElementById('week-memo-input');
  if (document.activeElement !== weekMemoInput) {
    weekMemoInput.value = state.data.weekMemos[weekKey] || '';
  }
  weekMemoInput.dataset.weekKey = weekKey;

  const container = document.getElementById('week-days-container');
  container.innerHTML = '';

  weekDays.forEach((dObj) => {
    const meta = getDayMeta(dObj);
    const dayRec = ensureDayRecord(meta.dateStr);
    const isOtherMonth = meta.month !== m || meta.year !== y;

    const col = document.createElement('div');
    col.className = [
      'week-day-col',
      isOtherMonth ? 'other-month' : '',
      meta.isRedDay ? 'is-holiday' : ''
    ].filter(Boolean).join(' ');

    const subTag = [meta.holidayName, meta.solarName, meta.lunarShort].filter(Boolean).slice(0, 2).join(' · ');

    // 頂部標題 (點擊進入該日日曆)
    const header = document.createElement('div');
    header.className = 'week-day-col-header';
    header.title = '點擊進入當日日曆詳細編輯';
    header.innerHTML = `
      <div class="week-day-title-row">
        <span class="week-day-name">${meta.weekdayName}</span>
        <span class="week-day-date">${meta.month}/${meta.day}</span>
      </div>
      <div class="week-day-subtag">${escapeHtml(subTag)}</div>
    `;
    header.addEventListener('click', () => openDayView(meta.dateStr));
    col.appendChild(header);

    // 內容區：行程、待辦、備忘預覽
    const body = document.createElement('div');
    body.className = 'week-day-body';

    const hasMemoText = Boolean(dayRec.memo && dayRec.memo.trim());
    const hasMemoImgs = Boolean(dayRec.memoImages && dayRec.memoImages.length > 0);

    if (dayRec.schedules.length === 0 && dayRec.todos.length === 0 && !hasMemoText && !hasMemoImgs) {
      body.innerHTML = `<div class="empty-hint">尚無記事<br/>點擊下方按鈕新增</div>`;
    } else {
      if (dayRec.schedules.length > 0) {
        const sLabel = document.createElement('div');
        sLabel.className = 'week-section-label';
        sLabel.textContent = '🕒 行程';
        body.appendChild(sLabel);

        dayRec.schedules.forEach(s => {
          const item = document.createElement('div');
          item.className = `week-sched-item pill-${s.color || 'sky'}`;
          const tLabel = formatScheduleTimeLabel(s);
          item.textContent = tLabel ? `${tLabel} ${s.text}` : s.text;
          body.appendChild(item);
        });
      }

      if (dayRec.todos.length > 0) {
        const tLabel = document.createElement('div');
        tLabel.className = 'week-section-label';
        tLabel.textContent = '☑️ 待辦';
        body.appendChild(tLabel);

        dayRec.todos.forEach(t => {
          const item = document.createElement('label');
          item.className = `week-todo-item ${t.done ? 'done' : ''}`;
          item.innerHTML = `
            <input type="checkbox" ${t.done ? 'checked' : ''} />
            <span>${escapeHtml(t.text)}</span>
          `;
          item.querySelector('input').addEventListener('change', (e) => {
            t.done = e.target.checked;
            triggerAutoSave();
            renderWeekView();
          });
          body.appendChild(item);
        });
      }

      if (hasMemoText || hasMemoImgs) {
        const mLabel = document.createElement('div');
        mLabel.className = 'week-section-label';
        mLabel.textContent = '📝 備忘';
        body.appendChild(mLabel);

        const memoDiv = document.createElement('div');
        memoDiv.className = 'week-memo-preview';
        if (hasMemoText) {
          const txtEl = document.createElement('div');
          txtEl.textContent = dayRec.memo.trim();
          memoDiv.appendChild(txtEl);
        }
        if (hasMemoImgs) {
          const imgWrap = document.createElement('div');
          imgWrap.className = 'week-memo-imgs';
          dayRec.memoImages.forEach((imgObj) => {
            const thumb = document.createElement('img');
            thumb.className = 'week-memo-img-thumb';
            thumb.src = imgObj.dataUrl;
            thumb.alt = '備忘圖片';
            thumb.title = '點擊放大檢視備忘圖片';
            thumb.addEventListener('click', (e) => {
              e.stopPropagation();
              openMemoLightbox(imgObj.dataUrl);
            });
            imgWrap.appendChild(thumb);
          });
          memoDiv.appendChild(imgWrap);
        }
        body.appendChild(memoDiv);
      }
    }
    col.appendChild(body);

    // 底部進入日曆按鈕
    const footer = document.createElement('div');
    footer.className = 'week-day-footer';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'open-day-btn';
    openBtn.textContent = '✎ 編輯當日日曆';
    openBtn.addEventListener('click', () => openDayView(meta.dateStr));
    footer.appendChild(openBtn);
    col.appendChild(footer);

    container.appendChild(col);
  });
}

// ============================================================================
// 畫面渲染：3. 日曆視圖 (Day View)
// ============================================================================
function renderDayView() {
  const dateObj = parseDateStr(state.currentDateStr);
  const meta = getDayMeta(dateObj);
  const dayRec = ensureDayRecord(meta.dateStr);

  // 標題與農曆/假日徽章
  document.getElementById('day-view-title').textContent =
    `${meta.year}年 ${meta.month}月 ${meta.day}日 (${meta.weekdayName})`;

  const badgesEl = document.getElementById('day-holiday-badges');
  badgesEl.innerHTML = '';
  if (meta.lunarLabel) {
    badgesEl.innerHTML += `<span class="lunar-badge">🌙 ${escapeHtml(meta.lunarLabel)}</span>`;
  }
  if (meta.holidayName) {
    badgesEl.innerHTML += `<span class="holiday-badge">🎉 ${escapeHtml(meta.holidayName)}</span>`;
  }
  if (meta.solarName) {
    badgesEl.innerHTML += `<span class="solar-badge">🌿 ${escapeHtml(meta.solarName)}</span>`;
  }

  // 更新「自訂休假紅字 / 補班日」切換按鈕狀態
  const toggleHolBtn = document.getElementById('btn-toggle-day-holiday');
  if (toggleHolBtn) {
    if (dayRec.customHoliday === 'holiday') {
      toggleHolBtn.textContent = '🏖️ 已設休假 (點此改補班)';
      toggleHolBtn.classList.add('active');
    } else if (dayRec.customHoliday === 'workday') {
      toggleHolBtn.textContent = '💼 已設補班 (點此還原)';
      toggleHolBtn.classList.add('active');
    } else {
      toggleHolBtn.textContent = '🏖️ 調整休假/補班';
      toggleHolBtn.classList.remove('active');
    }
  }

  // 該週 7 天快速切換列
  const weeks = getMonthWeeks(state.currentYear, state.currentMonth, state.data.settings.startOnMonday);
  let foundWeekIdx = weeks.findIndex(w => w.some(d => formatDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate()) === meta.dateStr));
  if (foundWeekIdx === -1) foundWeekIdx = 0;
  state.currentWeekIndex = foundWeekIdx;

  const quickBar = document.getElementById('day-quick-weekbar');
  quickBar.innerHTML = '';
  if (weeks[foundWeekIdx]) {
    weeks[foundWeekIdx].forEach(d => {
      const dm = getDayMeta(d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `quick-day-pill ${dm.dateStr === meta.dateStr ? 'active' : ''}`;
      btn.textContent = `${dm.month}/${dm.day} ${dm.weekdayName.replace('週', '')}`;
      btn.addEventListener('click', () => openDayView(dm.dateStr));
      quickBar.appendChild(btn);
    });
  }

  // 1. 渲染當日行程 (Schedules)
  document.getElementById('schedule-count').textContent = String(dayRec.schedules.length);
  const schedList = document.getElementById('day-schedule-list');
  schedList.innerHTML = '';
  if (dayRec.schedules.length === 0) {
    schedList.innerHTML = `<li class="empty-hint">今日尚無排定行程，可於上方輸入開始與結束時間、內容後新增。</li>`;
  } else {
    dayRec.schedules.forEach((item) => {
      const li = document.createElement('li');
      const isEditing = state.editingScheduleId === item.id;
      li.className = `list-item pill-${item.color || 'sky'} ${isEditing ? 'is-editing' : ''}`;
      const timeBadgeText = formatScheduleTimeLabel(item, '全天');
      li.innerHTML = `
        <div class="list-item-left sched-editable" title="點擊可修改此行程的開始/結束時間或內容">
          <span class="sched-time-badge">${escapeHtml(timeBadgeText)}</span>
          <span class="item-text">${escapeHtml(item.text)}</span>
        </div>
        <div class="item-actions">
          <button type="button" class="edit-item-btn" title="編輯此行程（設定結束時間或修改內容）">✎</button>
          <button type="button" class="delete-item-btn" title="刪除此行程">✕</button>
        </div>
      `;
      li.querySelector('.sched-editable').addEventListener('click', () => {
        startEditSchedule(item);
      });
      li.querySelector('.edit-item-btn').addEventListener('click', () => {
        startEditSchedule(item);
      });
      li.querySelector('.delete-item-btn').addEventListener('click', () => {
        if (state.editingScheduleId === item.id) {
          cancelEditSchedule(true);
        }
        dayRec.schedules = dayRec.schedules.filter(s => s.id !== item.id);
        triggerAutoSave(state.currentDateStr);
        renderDayView();
      });
      schedList.appendChild(li);
    });
  }

  // 2. 渲染待辦事項 (To-Dos - 支援拖曳排序)
  const doneCount = dayRec.todos.filter(t => t.done).length;
  document.getElementById('todo-count').textContent = `${doneCount}/${dayRec.todos.length}`;
  const todoList = document.getElementById('day-todo-list');
  todoList.innerHTML = '';
  if (dayRec.todos.length === 0) {
    todoList.innerHTML = `<li class="empty-hint">今日尚無待辦事項。</li>`;
  } else {
    dayRec.todos.forEach((item) => {
      const li = document.createElement('li');
      li.className = `list-item todo-sortable-item ${item.done ? 'done' : ''}`;
      li.draggable = true;
      li.dataset.todoId = item.id;
      li.innerHTML = `
        <div class="list-item-left">
          <span class="todo-drag-handle" title="按住上下拖曳可調整順序">⠿</span>
          <label class="list-item-left" style="cursor:pointer;">
            <input type="checkbox" class="todo-checkbox" ${item.done ? 'checked' : ''} />
            <span class="item-text">${escapeHtml(item.text)}</span>
          </label>
        </div>
        <button type="button" class="delete-item-btn" title="刪除此待辦">✕</button>
      `;
      li.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        requestAnimationFrame(() => li.classList.add('is-dragging'));
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('is-dragging');
        syncTodoOrderFromDOM(dayRec, todoList);
      });
      li.querySelector('.todo-checkbox').addEventListener('change', (e) => {
        item.done = e.target.checked;
        triggerAutoSave(state.currentDateStr);
        renderDayView();
      });
      li.querySelector('.delete-item-btn').addEventListener('click', () => {
        dayRec.todos = dayRec.todos.filter(t => t.id !== item.id);
        triggerAutoSave(state.currentDateStr);
        renderDayView();
      });
      todoList.appendChild(li);
    });
  }

  // 3. 渲染自由備忘錄與貼圖 (Memo & Pasted Images)
  const memoEl = document.getElementById('day-memo-textarea');
  if (document.activeElement !== memoEl) {
    memoEl.value = dayRec.memo || '';
  }

  const memoImgs = dayRec.memoImages || [];
  const memoImgCountBadge = document.getElementById('memo-img-count');
  if (memoImgCountBadge) {
    memoImgCountBadge.textContent = `${memoImgs.length} 圖`;
    memoImgCountBadge.classList.toggle('hidden', memoImgs.length === 0);
  }

  const memoImgsGrid = document.getElementById('day-memo-images');
  if (memoImgsGrid) {
    memoImgsGrid.innerHTML = '';
    memoImgsGrid.classList.toggle('hidden', memoImgs.length === 0);
    memoImgs.forEach((imgObj) => {
      const card = document.createElement('div');
      card.className = 'memo-img-item';
      card.title = '點擊放大檢視圖片';
      card.innerHTML = `
        <img class="memo-img-thumb" src="${imgObj.dataUrl}" alt="備忘錄貼圖" />
        <button type="button" class="memo-img-del-btn" title="移除此張圖片">✕</button>
      `;
      card.querySelector('.memo-img-thumb').addEventListener('click', () => {
        openMemoLightbox(imgObj.dataUrl);
      });
      card.querySelector('.memo-img-del-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        dayRec.memoImages = dayRec.memoImages.filter(img => img.id !== imgObj.id);
        triggerAutoSave();
        renderDayView();
        setSaveStatus('✓ 已移除備忘錄圖片');
      });
      memoImgsGrid.appendChild(card);
    });
  }
}

function getTodoDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.todo-sortable-item:not(.is-dragging)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function syncTodoOrderFromDOM(dayRec, todoList) {
  if (!dayRec || !todoList) return;
  const domIds = [...todoList.querySelectorAll('.todo-sortable-item')].map(el => el.dataset.todoId);
  if (domIds.length !== dayRec.todos.length) return;
  const prevOrder = dayRec.todos.map(t => t.id).join(',');
  const nextOrder = domIds.join(',');
  if (prevOrder === nextOrder) return;

  const mapById = new Map(dayRec.todos.map(t => [t.id, t]));
  const reordered = domIds.map(id => mapById.get(id)).filter(Boolean);
  if (reordered.length === dayRec.todos.length) {
    dayRec.todos = reordered;
    triggerAutoSave(state.currentDateStr);
    setSaveStatus('✓ 已更新待辦事項順序');
  }
}

// ============================================================================
// 視圖切換控制 (Month <-> Week <-> Day)
// ============================================================================
function switchViewMode(mode) {
  state.currentView = mode;
  const container = document.getElementById('widget-container');
  container.classList.remove('view-month', 'view-week', 'view-day');
  container.classList.add(`view-${mode}`);

  document.getElementById('month-view').classList.toggle('active', mode === 'month');
  document.getElementById('week-view').classList.toggle('active', mode === 'week');
  document.getElementById('day-view').classList.toggle('active', mode === 'day');

  renderArtworkSection();
  if (mode === 'month') renderMonthView();
  else if (mode === 'week') renderWeekView();
  else if (mode === 'day') renderDayView();
}

function openMonthView(year = state.currentYear, month = state.currentMonth) {
  state.currentYear = year;
  state.currentMonth = Math.max(1, Math.min(12, month));
  switchViewMode('month');
}

function openWeekView(year, month, weekIndex) {
  state.currentYear = year;
  state.currentMonth = Math.max(1, Math.min(12, month));
  state.currentWeekIndex = weekIndex;
  switchViewMode('week');
}

function openDayView(dateStr) {
  if (state.currentDateStr !== dateStr && state.editingScheduleId) {
    cancelEditSchedule(true);
  }
  state.currentDateStr = dateStr;
  const d = parseDateStr(dateStr);
  state.currentYear = d.getFullYear();
  state.currentMonth = d.getMonth() + 1;
  switchViewMode('day');
}

function stepMonth(delta) {
  let y = state.currentYear;
  let m = state.currentMonth + delta;
  if (m < 1) {
    m = 12;
    y--;
  } else if (m > 12) {
    m = 1;
    y++;
  }
  state.currentYear = y;
  state.currentMonth = m;
  state.currentWeekIndex = 0;
  state.currentDateStr = formatDateStr(y, m, 1);
  triggerAutoSave();
  switchViewMode(state.currentView);
}

// ============================================================================
// 圖片上傳與拖曳換圖處理 (每年 12 個月各自獨立儲存)
// ============================================================================
async function handleArtworkFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const y = state.currentYear;
  const m = state.currentMonth;
  const ymKey = getYearMonthKey(y, m);
  const artCfg = ensureMonthArtConfig(y, m);
  setSaveStatus('⏳ 正在儲存本月圖片...');

  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    // 1. 同時保存在 IndexedDB 狀態中 (讓匯出備份與 PWA 離線皆能完整保留)
    artCfg.customDataUrl = dataUrl;

    // 2. 若本機有啟動 server.mjs，同步存成實體圖檔 images/YYYY-MM.png
    try {
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: y,
          month: m,
          filename: file.name,
          dataUrl
        })
      });
      if (res.ok) {
        const out = await res.json();
        if (out.ok && out.imageUrl) {
          state.folderImages[ymKey] = out.imageUrl;
          artCfg.customDataUrl = null;
          renderArtworkSection();
          triggerAutoSave();
          setSaveStatus(`✓ 已存入 images/${ymKey}`);
          return;
        }
      }
    } catch (_) {}

    // 3. 純 PWA / 瀏覽器模式：直接儲存於 IndexedDB
    renderArtworkSection();
    triggerAutoSave();
  };
  reader.readAsDataURL(file);
}

async function resetCurrentMonthArtwork() {
  const y = state.currentYear;
  const m = state.currentMonth;
  const ymKey = getYearMonthKey(y, m);
  const artCfg = ensureMonthArtConfig(y, m);

  artCfg.customDataUrl = null;
  delete state.folderImages[ymKey];

  try {
    await fetch('/api/delete-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: y, month: m })
    });
  } catch (_) {}

  renderArtworkSection();
  triggerAutoSave();
  setSaveStatus(`✓ 已還原 ${ymKey} 預設畫布`);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// PWA Service Worker 註冊與安裝提示整合
// ============================================================================
let deferredInstallPrompt = null;

function setupPWA() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('ServiceWorker registration skipped:', err);
    });
  }

  const installBtn = document.getElementById('btn-install-pwa');
  if (!installBtn) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // 在一般瀏覽器分頁開啟時顯示「📲 安裝 App」按鈕
    if (!window.desktopWidget?.isElectron) {
      installBtn.classList.remove('hidden');
    }
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      installBtn.classList.add('hidden');
    }
    deferredInstallPrompt = null;
  });

  window.addEventListener('appinstalled', () => {
    installBtn.classList.add('hidden');
    deferredInstallPrompt = null;
    setSaveStatus('✓ 已成功安裝為桌面/手機 App');
  });
}

// ============================================================================
// 事件綁定與初始化
// ============================================================================
async function initApp() {
  setupPWA();
  await loadAllData();

  // 預設進入上次瀏覽的年份/月份；若首次開啟且已有 2027 月曆圖，預設開啟 2027 年 1 月（亦可隨時點「📍 今日」跳回當天）
  const now = new Date();
  if (state.data.settings.lastViewedYear && state.data.settings.lastViewedMonth) {
    state.currentYear = Number(state.data.settings.lastViewedYear) || 2027;
    state.currentMonth = Number(state.data.settings.lastViewedMonth) || 1;
  } else {
    state.currentYear = 2027;
    state.currentMonth = 1;
  }

  if (state.currentYear === now.getFullYear() && state.currentMonth === now.getMonth() + 1) {
    state.currentDateStr = formatDateStr(state.currentYear, state.currentMonth, now.getDate());
  } else {
    state.currentDateStr = formatDateStr(state.currentYear, state.currentMonth, 1);
  }

  // 上個月 / 下個月 (自動跨年)
  document.getElementById('btn-prev-month').addEventListener('click', () => stepMonth(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => stepMonth(1));

  // 年份切換
  document.getElementById('year-select').addEventListener('change', (e) => {
    state.currentYear = Number(e.target.value);
    state.currentWeekIndex = 0;
    state.currentDateStr = formatDateStr(state.currentYear, state.currentMonth, 1);
    triggerAutoSave();
    switchViewMode(state.currentView);
  });

  // 月份切換
  document.getElementById('month-select').addEventListener('change', (e) => {
    state.currentMonth = Number(e.target.value);
    state.currentWeekIndex = 0;
    state.currentDateStr = formatDateStr(state.currentYear, state.currentMonth, 1);
    triggerAutoSave();
    switchViewMode(state.currentView);
  });

  // 「📍 今日」快速跳轉按鈕
  document.getElementById('btn-go-today').addEventListener('click', () => {
    const today = new Date();
    state.currentYear = today.getFullYear();
    state.currentMonth = today.getMonth() + 1;
    state.currentDateStr = formatDateStr(state.currentYear, state.currentMonth, today.getDate());
    state.currentWeekIndex = 0;
    triggerAutoSave();
    if (state.currentView === 'day') {
      openDayView(state.currentDateStr);
    } else {
      switchViewMode(state.currentView);
    }
  });

  // 換圖按鈕、還原預設圖與拖曳上傳
  const fileUploadArt = document.getElementById('file-upload-art');
  document.getElementById('btn-change-art').addEventListener('click', () => {
    fileUploadArt.value = '';
    fileUploadArt.click();
  });
  fileUploadArt.addEventListener('change', (e) => {
    if (e.target.files?.[0]) handleArtworkFile(e.target.files[0]);
  });

  document.getElementById('btn-reset-art')?.addEventListener('click', () => {
    if (confirm(`確定要移除 ${state.currentYear}年 ${state.currentMonth}月 的自訂圖片，還原為預設星雲背景嗎？`)) {
      resetCurrentMonthArtwork();
    }
  });

  const artSection = document.getElementById('artwork-section');
  const dropOverlay = document.getElementById('drop-overlay');

  artSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('hidden');
  });
  artSection.addEventListener('dragleave', (e) => {
    if (!artSection.contains(e.relatedTarget)) {
      dropOverlay.classList.add('hidden');
    }
  });
  artSection.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay.classList.add('hidden');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleArtworkFile(file);
  });

  // 圖片滿版/完整顯示與焦點位置調整
  document.getElementById('btn-fit-mode').addEventListener('click', () => {
    const cfg = ensureMonthArtConfig(state.currentYear, state.currentMonth);
    cfg.fitMode = cfg.fitMode === 'contain' ? 'cover' : 'contain';
    renderArtworkSection();
    triggerAutoSave();
  });

  document.getElementById('art-pos-slider').addEventListener('input', (e) => {
    const val = Number(e.target.value);
    const cfg = ensureMonthArtConfig(state.currentYear, state.currentMonth);
    cfg.posY = val;
    document.getElementById('artwork-img').style.objectPosition = `50% ${val}%`;
    triggerAutoSave();
  });

  // 畫作題詞編輯 (依年份-月份獨立保存)
  document.getElementById('artwork-caption-input').addEventListener('input', (e) => {
    const cfg = ensureMonthArtConfig(state.currentYear, state.currentMonth);
    cfg.caption = e.target.value;
    triggerAutoSave();
  });

  // 起始星期切換 (週日始 / 週一始)
  document.getElementById('btn-toggle-startday').addEventListener('click', () => {
    state.data.settings.startOnMonday = !state.data.settings.startOnMonday;
    triggerAutoSave();
    switchViewMode(state.currentView);
  });

  // 匯出與匯入備份 JSON
  document.getElementById('btn-export-data').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `art-calendar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const fileImportJson = document.getElementById('file-import-json');
  document.getElementById('btn-import-data').addEventListener('click', () => {
    fileImportJson.value = '';
    fileImportJson.click();
  });
  fileImportJson.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        mergeLoadedData(parsed);
        triggerAutoSave();
        switchViewMode(state.currentView);
        setSaveStatus('✓ 備份已成功還原');
      } catch (err) {
        alert('JSON 檔案格式不正確：' + err.message);
      }
    };
    reader.readAsText(file);
  });

  // 週曆視圖導覽 (支援自動跨月與跨年)
  document.getElementById('btn-week-back-month').addEventListener('click', () => openMonthView());
  document.getElementById('btn-prev-week').addEventListener('click', () => {
    if (state.currentWeekIndex > 0) {
      state.currentWeekIndex--;
    } else {
      if (state.currentMonth > 1) {
        state.currentMonth--;
      } else {
        state.currentMonth = 12;
        state.currentYear--;
      }
      const prevWeeks = getMonthWeeks(state.currentYear, state.currentMonth, state.data.settings.startOnMonday);
      state.currentWeekIndex = prevWeeks.length - 1;
    }
    renderArtworkSection();
    renderWeekView();
  });
  document.getElementById('btn-next-week').addEventListener('click', () => {
    const weeks = getMonthWeeks(state.currentYear, state.currentMonth, state.data.settings.startOnMonday);
    if (state.currentWeekIndex < weeks.length - 1) {
      state.currentWeekIndex++;
    } else {
      if (state.currentMonth < 12) {
        state.currentMonth++;
      } else {
        state.currentMonth = 1;
        state.currentYear++;
      }
      state.currentWeekIndex = 0;
    }
    renderArtworkSection();
    renderWeekView();
  });
  document.getElementById('week-memo-input').addEventListener('input', (e) => {
    const key = e.target.dataset.weekKey;
    if (key) {
      state.data.weekMemos[key] = e.target.value;
      triggerAutoSave();
    }
  });

  // 日曆視圖導覽與互動 (支援自動跨月與跨年)
  document.getElementById('btn-day-back-month').addEventListener('click', () => openMonthView());
  document.getElementById('btn-day-to-week').addEventListener('click', () => switchViewMode('week'));

  document.getElementById('btn-prev-day').addEventListener('click', () => {
    const d = parseDateStr(state.currentDateStr);
    d.setDate(d.getDate() - 1);
    openDayView(formatDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  });

  document.getElementById('btn-next-day').addEventListener('click', () => {
    const d = parseDateStr(state.currentDateStr);
    d.setDate(d.getDate() + 1);
    openDayView(formatDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  });

  // 手動切換當日「休假紅字 / 補班日 / 依預設曆法」
  document.getElementById('btn-toggle-day-holiday')?.addEventListener('click', () => {
    const dayRec = ensureDayRecord(state.currentDateStr);
    if (!dayRec.customHoliday) {
      dayRec.customHoliday = 'holiday';
    } else if (dayRec.customHoliday === 'holiday') {
      dayRec.customHoliday = 'workday';
    } else {
      dayRec.customHoliday = null;
    }
    triggerAutoSave(state.currentDateStr);
    renderDayView();
  });

  // 顏色選擇器
  document.querySelectorAll('#sched-color-picker .color-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sched-color-picker .color-dot').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedColor = btn.dataset.color;
    });
  });

  // 新增或更新當日行程
  document.getElementById('form-add-schedule').addEventListener('submit', (e) => {
    e.preventDefault();
    const timeVal = document.getElementById('sched-time-input').value;
    const endTimeInput = document.getElementById('sched-end-time-input');
    const endTimeVal = endTimeInput ? endTimeInput.value : '';
    const textInput = document.getElementById('sched-text-input');
    const textVal = textInput.value.trim();
    if (!textVal) return;

    const dayRec = ensureDayRecord(state.currentDateStr);
    if (state.editingScheduleId) {
      const target = dayRec.schedules.find(s => s.id === state.editingScheduleId);
      if (target) {
        target.time = timeVal || '';
        target.endTime = endTimeVal || '';
        target.text = textVal;
        target.color = state.selectedColor;
      } else {
        dayRec.schedules.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          time: timeVal || '',
          endTime: endTimeVal || '',
          text: textVal,
          color: state.selectedColor
        });
      }
      cancelEditSchedule(true);
    } else {
      dayRec.schedules.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        time: timeVal || '',
        endTime: endTimeVal || '',
        text: textVal,
        color: state.selectedColor
      });
      textInput.value = '';
      if (endTimeInput) endTimeInput.value = '';
    }
    dayRec.schedules.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    triggerAutoSave(state.currentDateStr);
    renderDayView();
  });

  document.getElementById('btn-cancel-edit-schedule')?.addEventListener('click', () => {
    cancelEditSchedule();
  });

  // 新增待辦事項
  document.getElementById('form-add-todo').addEventListener('submit', (e) => {
    e.preventDefault();
    const textInput = document.getElementById('todo-text-input');
    const textVal = textInput.value.trim();
    if (!textVal) return;

    const dayRec = ensureDayRecord(state.currentDateStr);
    dayRec.todos.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: textVal,
      done: false
    });
    textInput.value = '';
    triggerAutoSave(state.currentDateStr);
    renderDayView();
  });

  // 待辦事項清單拖曳排序 (Drag & Drop Sorting)
  const dayTodoList = document.getElementById('day-todo-list');
  if (dayTodoList) {
    dayTodoList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const draggingEl = dayTodoList.querySelector('.todo-sortable-item.is-dragging');
      if (!draggingEl) return;
      const afterElement = getTodoDragAfterElement(dayTodoList, e.clientY);
      if (!afterElement) {
        dayTodoList.appendChild(draggingEl);
      } else if (afterElement !== draggingEl) {
        dayTodoList.insertBefore(draggingEl, afterElement);
      }
    });

    dayTodoList.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dayRec = ensureDayRecord(state.currentDateStr);
      syncTodoOrderFromDOM(dayRec, dayTodoList);
    });
  }

  // 備忘錄即時自動存檔與貼上截圖/圖片支援
  const dayMemoTextarea = document.getElementById('day-memo-textarea');
  dayMemoTextarea.addEventListener('input', (e) => {
    const dayRec = ensureDayRecord(state.currentDateStr);
    dayRec.memo = e.target.value;
    triggerAutoSave(state.currentDateStr);
  });

  // 在日曆視圖中支援直接按 Ctrl+V 貼上截圖或複製的圖片
  document.addEventListener('paste', async (e) => {
    if (state.currentView !== 'day') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageBlobs = [];
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) imageBlobs.push(blob);
      }
    }
    if (imageBlobs.length > 0) {
      e.preventDefault();
      for (const blob of imageBlobs) {
        await addMemoImageFromBlob(blob, state.currentDateStr);
      }
    }
  });

  // 點擊「📋 貼圖」按鈕從系統剪貼簿讀取圖片
  document.getElementById('btn-paste-memo-img')?.addEventListener('click', async () => {
    if (navigator.clipboard?.read) {
      try {
        const clipItems = await navigator.clipboard.read();
        let foundImage = false;
        for (const clipItem of clipItems) {
          const imgType = clipItem.types.find(t => t.startsWith('image/'));
          if (imgType) {
            const blob = await clipItem.getType(imgType);
            if (blob) {
              await addMemoImageFromBlob(blob, state.currentDateStr);
              foundImage = true;
            }
          }
        }
        if (foundImage) return;
        alert('目前剪貼簿中沒有圖片或截圖。\n您可以先按 Win + Shift + S 截圖，再點此按鈕或直接按 Ctrl + V 貼上！');
        return;
      } catch (_) {}
    }
    dayMemoTextarea.focus();
    setSaveStatus('💡 請直接按 Ctrl+V 貼上剪貼簿截圖');
  });

  // 點擊「🖼️ 加圖」按鈕選擇圖檔加入備忘錄
  const fileUploadMemoImg = document.getElementById('file-upload-memo-img');
  document.getElementById('btn-upload-memo-img')?.addEventListener('click', () => {
    if (!fileUploadMemoImg) return;
    fileUploadMemoImg.value = '';
    fileUploadMemoImg.click();
  });
  fileUploadMemoImg?.addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    for (const f of files) {
      await addMemoImageFromBlob(f, state.currentDateStr);
    }
  });

  // 支援將圖片直接拖曳至「註記與隨筆備忘」卡片中
  const dayMemoCard = document.getElementById('day-memo-card');
  const dayMemoBox = document.getElementById('day-memo-box');
  if (dayMemoCard && dayMemoBox) {
    dayMemoCard.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
        dayMemoBox.classList.add('drag-over');
      }
    });
    dayMemoCard.addEventListener('dragleave', (e) => {
      if (!dayMemoCard.contains(e.relatedTarget)) {
        dayMemoBox.classList.remove('drag-over');
      }
    });
    dayMemoCard.addEventListener('drop', async (e) => {
      dayMemoBox.classList.remove('drag-over');
      const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
      if (files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        for (const f of files) {
          await addMemoImageFromBlob(f, state.currentDateStr);
        }
      }
    });
  }

  // 備忘錄圖片放大檢視燈箱 (Lightbox) 關閉控制
  document.getElementById('btn-close-lightbox')?.addEventListener('click', closeMemoLightbox);
  document.querySelector('#memo-img-lightbox .memo-lightbox-backdrop')?.addEventListener('click', closeMemoLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMemoLightbox();
  });

  // 字級縮放控制 (A- / A+，自動記憶並針對網頁/PWA版最佳化預設大小)
  const isElectronEnv = Boolean(window.desktopWidget?.isElectron);
  const defaultFontScale = isElectronEnv ? 1.0 : 1.08;
  const applyFontScale = (scale) => {
    const clamped = Math.max(0.8, Math.min(1.45, Math.round(scale * 100) / 100));
    state.data.settings.fontScale = clamped;
    document.documentElement.style.setProperty('--ui-font-scale', String(clamped));
    try { localStorage.setItem('art_calendar_font_scale', String(clamped)); } catch (_) {}
    return clamped;
  };

  const savedFontScale = Number(localStorage.getItem('art_calendar_font_scale')) || state.data.settings.fontScale || defaultFontScale;
  applyFontScale(savedFontScale);

  document.getElementById('btn-font-dec')?.addEventListener('click', () => {
    const next = applyFontScale((state.data.settings.fontScale || defaultFontScale) - 0.06);
    setSaveStatus(`✓ 字體比例 ${Math.round(next * 100)}%`);
    triggerAutoSave();
  });

  document.getElementById('btn-font-inc')?.addEventListener('click', () => {
    const next = applyFontScale((state.data.settings.fontScale || defaultFontScale) + 0.06);
    setSaveStatus(`✓ 字體比例 ${Math.round(next * 100)}%`);
    triggerAutoSave();
  });

  // Electron 桌面視窗控制整合 (透明度、置頂、最小化、關閉)
  const opacitySlider = document.getElementById('window-opacity-slider');
  const pinBtn = document.getElementById('btn-pin-top');

  if (window.desktopWidget?.isElectron) {
    const winState = await window.desktopWidget.getState();
    pinBtn.classList.toggle('active', Boolean(winState.alwaysOnTop));
    opacitySlider.value = String(Math.round((winState.opacity || 0.98) * 100));

    pinBtn.addEventListener('click', async () => {
      const pinned = await window.desktopWidget.togglePin();
      pinBtn.classList.toggle('active', pinned);
    });
    opacitySlider.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100;
      window.desktopWidget.setOpacity(val);
    });
    document.getElementById('btn-win-min').addEventListener('click', () => window.desktopWidget.minimize());
    document.getElementById('btn-win-close').addEventListener('click', () => window.desktopWidget.close());
  } else {
    // 瀏覽器或 Edge App / PWA 獨立視窗模式時，隱藏純 Electron 專屬關閉鈕，並用 CSS 透明度模擬滑桿
    document.querySelectorAll('.electron-only').forEach(el => el.classList.add('hidden'));
    pinBtn.classList.add('hidden');
    opacitySlider.addEventListener('input', (e) => {
      const val = Number(e.target.value) / 100;
      document.getElementById('widget-container').style.opacity = String(val);
    });
  }

  // 雲端同步按鈕與自動焦點同步
  document.getElementById('btn-cloud-sync')?.addEventListener('click', () => {
    syncWithCloud({ pushLocal: true, quiet: false });
  });

  // 全螢幕無網址列切換按鈕 (支援手機與電腦瀏覽器)
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  window.addEventListener('focus', () => {
    if (Date.now() - lastCloudPullTime > 5000) {
      syncWithCloud({ pushLocal: false, quiet: true });
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCloudPullTime > 5000) {
      syncWithCloud({ pushLocal: false, quiet: true });
    }
  });

  function applyExternalPayload({ date, sched = '', todo = '', memo = '', weekKey = '', weekMemo = '' }) {
    const targetDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
      ? date.trim()
      : formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const dayRec = ensureDayRecord(targetDate);
    const validColors = ['sky', 'emerald', 'amber', 'rose', 'violet'];
    let addedCount = 0;

    if (sched) {
      const items = String(sched).split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
      for (const item of items) {
        let time = '';
        let endTime = '';
        let text = '';
        let color = 'sky';
        if (item.includes('|')) {
          const parts = item.split('|').map(p => p.trim());
          const tPart = parts[0] || '';
          text = parts[1] || '';
          color = (parts[2] || 'sky').toLowerCase();
          if (tPart.includes('~') || tPart.includes('-')) {
            const [st, et] = tPart.split(/[~-]/).map(x => x.trim());
            time = st;
            endTime = et;
          } else {
            time = tPart;
          }
        } else {
          const m = item.match(/^(\d{1,2}:\d{2})(?:\s*[~-]\s*(\d{1,2}:\d{2}))?\s+(.+)$/);
          if (m) {
            time = m[1];
            endTime = m[2] || '';
            text = m[3].trim();
          } else {
            text = item;
          }
        }
        if (!validColors.includes(color)) color = 'sky';
        if (text && !dayRec.schedules.some(s => s.time === time && s.text === text)) {
          dayRec.schedules.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            time,
            endTime,
            text,
            color
          });
          addedCount++;
        }
      }
      dayRec.schedules.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    }

    if (todo) {
      const todos = String(todo).split(/[;\n|]+/).map(s => s.trim()).filter(Boolean);
      for (const tText of todos) {
        if (!dayRec.todos.some(t => t.text === tText)) {
          dayRec.todos.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            text: tText,
            done: false
          });
          addedCount++;
        }
      }
    }

    if (memo) {
      const cleanMemo = String(memo).trim();
      if (cleanMemo) {
        if (!dayRec.memo) {
          dayRec.memo = cleanMemo;
        } else if (!dayRec.memo.includes(cleanMemo)) {
          dayRec.memo = dayRec.memo.trim() + '\n' + cleanMemo;
        }
        addedCount++;
      }
    }

    if (weekKey && weekMemo) {
      state.data.weekMemos[weekKey.trim()] = String(weekMemo).trim();
      addedCount++;
    }

    openDayView(targetDate);
    triggerAutoSave(targetDate);
    setSaveStatus(`✅ 已寫入 ${targetDate} 並同步雲端`);
    return { ok: addedCount > 0, targetDate };
  }

  function parseAndApplyAiText(rawText) {
    if (!rawText || !String(rawText).trim()) return false;
    const text = String(rawText).trim();

    // 1. 若貼上的是包含 ?date=... 的網址
    if (text.includes('date=') || text.includes('sched=') || text.includes('todo=') || text.includes('memo=')) {
      const qIdx = text.indexOf('?');
      const qs = qIdx >= 0 ? text.slice(qIdx + 1).split(/\s/)[0] : text;
      const p = new URLSearchParams(qs);
      if (p.get('date') || p.get('sched') || p.get('todo') || p.get('memo')) {
        applyExternalPayload({
          date: p.get('date') || '',
          sched: p.get('sched') || p.get('schedules') || '',
          todo: p.get('todo') || p.get('todos') || '',
          memo: p.get('memo') || '',
          weekKey: p.get('weekKey') || '',
          weekMemo: p.get('weekMemo') || ''
        });
        return true;
      }
    }

    // 2. 若貼上的是 DATE: / SCHED: / TODO: / MEMO: 結構化文字區塊
    let date = '';
    const schedList = [];
    const todoList = [];
    const memoList = [];
    let weekKey = '';
    let weekMemo = '';

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('```')) continue;
      const m = trimmed.match(/^(DATE|日期|SCHED|SCHEDULE|行程|行事安排|TODO|待辦|待辦事項|MEMO|NOTE|備忘|註記備忘|WEEK|本週重點)\s*[:：]\s*(.+)$/i);
      if (m) {
        const key = m[1].toUpperCase();
        const val = m[2].trim();
        if (!val || val === '無' || val === 'None' || val === '-') continue;
        if (key === 'DATE' || key === '日期') {
          const dm = val.match(/\d{4}-\d{2}-\d{2}/);
          if (dm) date = dm[0];
        } else if (['SCHED', 'SCHEDULE', '行程', '行事安排'].includes(key)) {
          schedList.push(val);
        } else if (['TODO', '待辦', '待辦事項'].includes(key)) {
          todoList.push(val);
        } else if (['MEMO', 'NOTE', '備忘', '註記備忘'].includes(key)) {
          memoList.push(val);
        } else if (['WEEK', '本週重點'].includes(key)) {
          const parts = val.split('|');
          if (parts.length >= 2) {
            weekKey = parts[0].trim();
            weekMemo = parts.slice(1).join('|').trim();
          }
        }
      }
    }

    if (date || schedList.length > 0 || todoList.length > 0 || memoList.length > 0) {
      applyExternalPayload({
        date: date || state.currentDateStr,
        sched: schedList.join('; '),
        todo: todoList.join('; '),
        memo: memoList.join('\n'),
        weekKey,
        weekMemo
      });
      return true;
    }

    return false;
  }

  // 「✨ AI貼上」按鈕：一鍵讀取從 Gemini Skill 複製的行程/待辦/備忘代碼區塊或網址
  document.getElementById('btn-ai-paste')?.addEventListener('click', async () => {
    let clipText = '';
    if (navigator.clipboard?.readText) {
      try {
        clipText = await navigator.clipboard.readText();
      } catch (_) {}
    }
    if (!clipText || !parseAndApplyAiText(clipText)) {
      const manual = prompt(
        '請長按貼上從 Gemini 複製的「萬用年曆快寫區塊」或連結：',
        clipText || 'DATE: 2026-11-14\nSCHED: 10:00~11:30|門診會議|sky\nTODO: 確認簡報\nMEMO: 隨筆備忘'
      );
      if (manual && !parseAndApplyAiText(manual)) {
        alert('未偵測到標準格式（請包含 DATE: / SCHED: / TODO: / MEMO: 或萬用年曆連結）。');
      }
    }
  });

  // 檢查網址是否帶有 ?date=YYYY-MM-DD 與快速寫入參數 (sched / todo / memo / weekMemo)
  const urlParams = new URLSearchParams(window.location.search);
  const jumpDate = urlParams.get('date');
  const urlSched = urlParams.get('sched') || urlParams.get('schedules') || '';
  const urlTodo = urlParams.get('todo') || urlParams.get('todos') || '';
  const urlMemo = urlParams.get('memo') || '';
  const urlWeekKey = urlParams.get('weekKey') || '';
  const urlWeekMemo = urlParams.get('weekMemo') || '';

  const targetWriteDate = (jumpDate && /^\d{4}-\d{2}-\d{2}$/.test(jumpDate))
    ? jumpDate
    : formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const hasUrlWrite = Boolean(urlSched || urlTodo || urlMemo || (urlWeekKey && urlWeekMemo));
  if (hasUrlWrite) {
    applyExternalPayload({
      date: targetWriteDate,
      sched: urlSched,
      todo: urlTodo,
      memo: urlMemo,
      weekKey: urlWeekKey,
      weekMemo: urlWeekMemo
    });
    // 清除網址列上的單次寫入參數，避免重新整理頁面時重複觸發
    try {
      const cleanUrl = `${window.location.pathname}?date=${encodeURIComponent(targetWriteDate)}`;
      window.history.replaceState({}, '', cleanUrl);
    } catch (_) {}
  } else if (jumpDate && /^\d{4}-\d{2}-\d{2}$/.test(jumpDate)) {
    openDayView(jumpDate);
    syncWithCloud({ pushLocal: true, quiet: false });
  } else {
    // 初始渲染月曆視圖
    switchViewMode('month');
    // 啟動後自動與 Google 雲端試算表進行雙向同步
    syncWithCloud({ pushLocal: true, quiet: false });
  }
}

initApp();
