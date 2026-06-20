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
    .split(/[|/;\s]+/)
    .map((day) => day.trim())
    .filter(Boolean)
}

function normalizeColorHex(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  const normalized = trimmed.toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null
}

export function parseScheduleCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { rows: [], errors: [{ line: 1, message: 'CSV 내용이 비어 있습니다.' }] }
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)
  const rows = []
  const errors = []

  lines.slice(1).forEach((line, index) => {
    const lineNumber = index + 2
    const cells = parseCsvLine(line)
    const raw = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || '']))
    const row = {
      type: normalizeType(raw.type),
      title: String(raw.title || '').trim(),
      startDate: String(raw.startDate || '').trim(),
      endDate: String(raw.endDate || raw.startDate || '').trim(),
      startTime: String(raw.startTime || '').trim(),
      endTime: String(raw.endTime || '').trim(),
      daysOfWeek: splitDays(raw.daysOfWeek),
      colorHex: normalizeColorHex(raw.colorHex),
    }

    if (!['date', 'recurring'].includes(row.type)) {
      errors.push({ line: lineNumber, message: '종류는 date 또는 recurring이어야 합니다.' })
      return
    }
    if (!row.title || !row.startDate) {
      errors.push({ line: lineNumber, message: '제목과 시작일은 필수입니다.' })
      return
    }
    if (row.type === 'recurring' && (!row.endDate || row.daysOfWeek.length === 0)) {
      errors.push({ line: lineNumber, message: '정기 일정은 종료일과 반복 요일이 필요합니다.' })
      return
    }
    if (row.colorHex === null) {
      errors.push({ line: lineNumber, message: '색상은 #RRGGBB 형식이어야 합니다.' })
      return
    }

    rows.push(row)
  })

  return { rows, errors }
}
