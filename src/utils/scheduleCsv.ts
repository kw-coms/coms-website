const HEADER_ALIASES = {
  type: ['type', '종류', '유형'],
  title: ['title', '제목', '일정 제목'],
  startDate: ['startDate', 'start_date', '시작일', '날짜'],
  endDate: ['endDate', 'end_date', '종료일'],
  startTime: ['startTime', 'start_time', '시작시간', '시작 시간'],
  endTime: ['endTime', 'end_time', '종료시간', '종료 시간'],
  daysOfWeek: ['daysOfWeek', 'days_of_week', '요일', '반복요일', '반복 요일'],
  colorHex: ['colorHex', 'color', '색상', '컬러'],
}

const REQUIRED_HEADERS = ['type', 'title', 'startDate']

// Same limit the server enforces on a schedule title.
const MAX_TITLE_LENGTH = 120

// Every spelling of a weekday the importer takes, keyed by the MON..SUN token it sends. The
// numbers follow the server (1-7 = 월-일, 0 = 일). The Korean names are what people type under
// a 요일 header, and the server knows none of them.
const WEEKDAY_ALIASES = {
  MON: ['mon', 'monday', '1', '월', '월요일'],
  TUE: ['tue', 'tuesday', '2', '화', '화요일'],
  WED: ['wed', 'wednesday', '3', '수', '수요일'],
  THU: ['thu', 'thursday', '4', '목', '목요일'],
  FRI: ['fri', 'friday', '5', '금', '금요일'],
  SAT: ['sat', 'saturday', '6', '토', '토요일'],
  SUN: ['sun', 'sunday', '7', '0', '일', '일요일'],
}
// "월수금" written without separators.
const COMPACT_KOREAN_DAYS = /^[월화수목금토일]{2,}$/

function parseCsvLine(line) {
  const cells = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell.trim())
  return cells
}

function normalizeHeader(header) {
  const normalized = String(header || '').trim()
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return key
  }
  return normalized
}

function normalizeType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['date', 'single', 'one-off', '날짜', '날짜일정', '일정'].includes(normalized)) return 'date'
  if (['recurring', 'repeat', 'regular', '정기', '정기모임', '반복'].includes(normalized)) return 'recurring'
  return normalized
}

function splitDays(value) {
  return String(value || '')
    .split(/[|/;,·\s]+/)
    .map((day) => day.trim())
    .filter(Boolean)
    .flatMap((day) => (COMPACT_KOREAN_DAYS.test(day) ? day.split('') : [day]))
}

// MON..SUN for a recognised weekday, null for anything else.
function normalizeDay(value) {
  const normalized = value.toLowerCase()
  const match = Object.entries(WEEKDAY_ALIASES).find(([, aliases]) => aliases.includes(normalized))
  return match ? match[0] : null
}

// YYYY-MM-DD naming a real calendar day (2026-02-30 is not one).
function isIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// '' for an empty cell, null for something that is not a time of day. Spreadsheets write
// 09:00 back as "9:00" (or "9:00:00"); the server only parses zero-padded HH:mm[:ss].
function normalizeTime(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (!match) return null
  const [hour, minute, second = '00'] = match.slice(1)
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null
  const time = `${hour.padStart(2, '0')}:${minute}`
  return second === '00' ? time : `${time}:${second}`
}

// Everything the server would refuse is reported here, before a single request goes out: the
// importer creates schedules one at a time, so a row the server rejects halfway through leaves
// the rows above it already saved.
export function parseScheduleCsv(text) {
  // Numbered before the blank lines are dropped, so "N행" is the line the admin is looking at.
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line, index) => ({ number: index + 1, text: line.trim() }))
    .filter((line) => line.text)

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 1, message: 'CSV 내용이 비어 있습니다.' }] }
  }

  const headers = parseCsvLine(lines[0].text).map(normalizeHeader)
  if (REQUIRED_HEADERS.some((header) => !headers.includes(header))) {
    // Otherwise every data row fails with a complaint about its own cells, which hides the
    // actual problem: a missing or misspelled header row.
    return {
      rows: [],
      errors: [{ line: lines[0].number, message: '첫 줄에 종류(type), 제목(title), 시작일(startDate) 열 이름이 있어야 합니다.' }],
    }
  }

  const rows = []
  const errors = []

  lines.slice(1).forEach((line) => {
    const lineNumber = line.number
    const cells = parseCsvLine(line.text)
    const raw = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || '']))
    const givenEndDate = String(raw.endDate || '').trim()
    const givenDays = splitDays(raw.daysOfWeek)
    const colorHex = String(raw.colorHex || '').trim().toLowerCase()
    const row = {
      type: normalizeType(raw.type),
      title: String(raw.title || '').trim(),
      startDate: String(raw.startDate || '').trim(),
      endDate: givenEndDate || String(raw.startDate || '').trim(),
      startTime: normalizeTime(raw.startTime),
      endTime: normalizeTime(raw.endTime),
      daysOfWeek: [...new Set(givenDays.map(normalizeDay).filter(Boolean))],
      // null, not '', for an empty cell: the importer hands this straight to the
      // recurring-schedule API, whose #RRGGBB pattern refuses an empty string.
      colorHex: colorHex || null,
    }

    if (!['date', 'recurring'].includes(row.type)) {
      errors.push({ line: lineNumber, message: '종류는 date 또는 recurring이어야 합니다.' })
      return
    }
    if (!row.title || !row.startDate) {
      errors.push({ line: lineNumber, message: '제목과 시작일은 필수입니다.' })
      return
    }
    if (row.title.length > MAX_TITLE_LENGTH) {
      errors.push({ line: lineNumber, message: `제목은 ${MAX_TITLE_LENGTH}자 이하여야 합니다.` })
      return
    }
    if (!isIsoDate(row.startDate) || !isIsoDate(row.endDate)) {
      errors.push({ line: lineNumber, message: '시작일과 종료일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.' })
      return
    }
    if (row.endDate < row.startDate) {
      errors.push({ line: lineNumber, message: '종료일은 시작일과 같거나 이후여야 합니다.' })
      return
    }
    if (row.type === 'recurring') {
      const unknownDays = givenDays.filter((day) => !normalizeDay(day))
      if (unknownDays.length > 0) {
        errors.push({ line: lineNumber, message: `요일을 알 수 없습니다: ${unknownDays.join(', ')} (월~일 또는 MON~SUN으로 입력하세요.)` })
        return
      }
      // givenEndDate, not row.endDate: that one falls back to the start date, which let a 정기
      // row with no 종료일 through as a schedule lasting a single day.
      if (!givenEndDate || row.daysOfWeek.length === 0) {
        errors.push({ line: lineNumber, message: '정기 일정은 종료일과 반복 요일이 필요합니다.' })
        return
      }
    }
    if (row.startTime === null || row.endTime === null) {
      errors.push({ line: lineNumber, message: '시간은 HH:MM 형식이어야 합니다. (예: 09:00)' })
      return
    }
    if (row.startTime && row.endTime && row.endTime < row.startTime) {
      errors.push({ line: lineNumber, message: '종료 시간은 시작 시간 이후여야 합니다.' })
      return
    }
    if (colorHex && !/^#[0-9a-f]{6}$/.test(colorHex)) {
      errors.push({ line: lineNumber, message: '색상은 #RRGGBB 형식이어야 합니다.' })
      return
    }

    rows.push(row)
  })

  return { rows, errors }
}
