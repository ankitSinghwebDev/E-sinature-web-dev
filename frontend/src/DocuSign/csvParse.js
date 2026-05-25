/**
 * Minimal CSV parser tuned for the bulk-send use case.
 *
 * Supports:
 *   • CRLF or LF line endings
 *   • Quoted values containing the delimiter
 *   • Escaped quotes inside quoted values ("Joe ""DOP"" Smith")
 *   • Empty cells
 *   • Trailing newline (ignored)
 *   • Leading BOM (stripped)
 *   • Auto-sniffed delimiter: comma / semicolon / tab
 *
 * NOT supported:
 *   • Embedded newlines inside quoted values
 *   • Multi-character quote chars
 *
 * Output: `{ headers: string[], rows: object[], delimiter: string }`.
 * Each row is keyed by the LOWERCASED header so matching against
 * template field labels is case-insensitive.
 */

const stripBom = (s) => (s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s)

const sniffDelimiter = (headerLine) => {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (let i = 0; i < headerLine.length; i++) {
    const c = headerLine[i]
    if (c === '"') {
      if (inQuotes && headerLine[i + 1] === '"') { i++; continue }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && counts[c] !== undefined) counts[c]++
  }
  let best = ','
  let bestCount = -1
  for (const d of [',', ';', '\t']) {
    if (counts[d] > bestCount) { best = d; bestCount = counts[d] }
  }
  return best
}

const tokenizeLine = (line, delimiter = ',') => {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += c
    } else if (c === delimiter) { out.push(cur); cur = '' }
    else if (c === '"' && cur.length === 0) inQuotes = true
    else cur += c
  }
  out.push(cur)
  return out
}

export const parseCsv = (text) => {
  if (!text || typeof text !== 'string') return { headers: [], rows: [], delimiter: ',' }
  const cleaned = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n').filter((l, i, arr) => {
    if (i === arr.length - 1 && l === '') return false
    return true
  })
  if (lines.length === 0) return { headers: [], rows: [], delimiter: ',' }

  const delimiter = sniffDelimiter(lines[0])
  const headers = tokenizeLine(lines[0], delimiter).map((h) => h.trim())

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line === '') { rows.push({}); continue }
    const cells = tokenizeLine(line, delimiter)
    const row = {}
    headers.forEach((h, j) => {
      row[h.toLowerCase()] = (cells[j] ?? '').trim()
    })
    rows.push(row)
  }
  return { headers, rows, delimiter }
}

export const validateRows = (parsed, requiredColumns = []) => {
  const headerSet = new Set((parsed.headers || []).map((h) => h.toLowerCase()))
  const missingHeaders = requiredColumns.filter((c) => !headerSet.has(c.toLowerCase()))

  const rowDiagnostics = (parsed.rows || []).map((row, idx) => {
    const issues = []
    if (Object.keys(row).length === 0) {
      issues.push('empty_row')
      return { row_index: idx, issues, valid: false }
    }
    requiredColumns.forEach((c) => {
      const v = row[c.toLowerCase()]
      if (!v || !v.trim()) issues.push(`missing_${c.toLowerCase()}`)
    })
    if (row.email !== undefined && row.email !== '') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) issues.push('invalid_email')
    }
    return { row_index: idx, issues, valid: issues.length === 0 }
  })

  return {
    headers: parsed.headers,
    missingHeaders,
    rowDiagnostics,
    validRows: rowDiagnostics.filter((r) => r.valid).length,
    invalidRows: rowDiagnostics.filter((r) => !r.valid).length,
  }
}
