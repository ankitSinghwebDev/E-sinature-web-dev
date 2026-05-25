const multer = require('multer')
const DocuSignBulkJob = require('../models/DocuSignBulkJob')
const DocuSignTemplate = require('../models/DocuSignTemplate')
const DocuSignEnvelope = require('../models/DocuSignEnvelope')

// CSV is parsed in memory; no disk persistence.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
})
exports.csvUpload = upload.single('csv_file')

const ROW_CAP = 500

// ── CSV parsing (mirrors frontend csvParse.js shape) ──
const stripBom = (s) => (s && s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s)

const sniffDelimiter = (line) => {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { i++; continue }
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

const tokenizeLine = (line, delim = ',') => {
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
    } else if (c === delim) { out.push(cur); cur = '' }
    else if (c === '"' && cur.length === 0) inQuotes = true
    else cur += c
  }
  out.push(cur)
  return out
}

const parseCsv = (text) => {
  if (!text) return { headers: [], rows: [] }
  const cleaned = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = cleaned.split('\n')
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (lines.length === 0) return { headers: [], rows: [] }
  const delim = sniffDelimiter(lines[0])
  const headers = tokenizeLine(lines[0], delim).map((h) => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '') { rows.push({}); continue }
    const cells = tokenizeLine(lines[i], delim)
    const row = {}
    headers.forEach((h, j) => {
      row[h.toLowerCase()] = (cells[j] ?? '').trim()
    })
    rows.push(row)
  }
  return { headers, rows }
}

const isValidEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

// ── Build a single envelope from a template + CSV row ──
const buildEnvelopeFromTemplate = (tpl, row, createdBy) => {
  const recipients = (tpl.recipients || []).map((r, i) => {
    // First recipient placeholder gets the row's name/email; subsequent
    // template-recipients keep their template defaults (e.g. internal
    // counter-signer).
    if (i === 0) {
      return {
        name: row.name || r.name || '',
        email: row.email || r.email || '',
        role: r.role || 'signer',
        routingOrder: r.routingOrder || 1,
        userId: r.userId || null,
        status: 'created',
      }
    }
    return { ...r, status: 'created' }
  })

  // Match extra CSV columns to template field labels (case-insensitive).
  const labelToValue = {}
  Object.entries(row).forEach(([k, v]) => {
    if (k === 'name' || k === 'email') return
    if (!v) return
    labelToValue[k.toLowerCase()] = v
  })

  const tabs = (tpl.tabs || []).map((t) => {
    const matched = t.label ? labelToValue[t.label.toLowerCase()] : undefined
    if (matched !== undefined) return { ...t, defaultValue: matched }
    return t
  })

  return {
    createdBy,
    title: `${tpl.name} — ${row.name || row.email || 'recipient'}`,
    description: tpl.description || '',
    document: tpl.document || {},
    recipients,
    tabs,
    settings: tpl.settings || {},
    templateId: tpl._id,
    templateName: tpl.name,
    status: 'draft',
  }
}

// POST /api/docusign/bulk-send  (multipart: csv_file + template_id + send_immediately?)
exports.startBulkSend = async (req, res, next) => {
  try {
    const { template_id, send_immediately } = req.body
    if (!template_id) return res.status(400).json({ message: 'template_id is required' })
    if (!req.file) return res.status(400).json({ message: 'csv_file is required' })

    const tpl = await DocuSignTemplate.findOne({
      _id: template_id, createdBy: req.user._id,
    }).lean()
    if (!tpl) return res.status(404).json({ message: 'Template not found' })

    const text = req.file.buffer.toString('utf-8')
    const { headers, rows } = parseCsv(text)
    if (!headers.includes('name') || !headers.includes('email')) {
      return res.status(400).json({ message: 'CSV must have name and email columns' })
    }
    if (rows.length > ROW_CAP) {
      return res.status(400).json({ message: `CSV has ${rows.length} rows — cap is ${ROW_CAP}` })
    }
    if (rows.length === 0) return res.status(400).json({ message: 'CSV has no data rows' })

    const sendNow = send_immediately === undefined ? true : String(send_immediately) === 'true'
    const job = await DocuSignBulkJob.create({
      createdBy: req.user._id,
      template_id: tpl._id,
      template_name: tpl.name,
      status: 'running',
      total_rows: rows.length,
      send_immediately: sendNow,
      envelopes: rows.map((row, idx) => ({ row_index: idx, row, status: 'pending' })),
    })

    // Process synchronously inline. Bounded by ROW_CAP so request time
    // stays reasonable. Real production would punt to a queue.
    let succeeded = 0
    let failed = 0
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        if (!row.name || !row.email) throw new Error('missing_name_or_email')
        if (!isValidEmail(row.email)) throw new Error('invalid_email')
        const envDoc = buildEnvelopeFromTemplate(tpl, row, req.user._id)
        if (sendNow) {
          envDoc.status = 'sent'
          envDoc.sentAt = new Date()
        }
        const envelope = await DocuSignEnvelope.create(envDoc)
        job.envelopes[i].status = 'sent'
        job.envelopes[i].envelope_id = envelope._id
        succeeded += 1
      } catch (err) {
        job.envelopes[i].status = 'failed'
        job.envelopes[i].error = err.message || 'create_failed'
        failed += 1
      }
      job.processed = i + 1
    }
    job.succeeded = succeeded
    job.failed = failed
    job.status = failed === rows.length ? 'failed' : 'completed'
    await job.save()

    res.status(201).json({
      data: {
        bulk_job_id: job._id,
        status: job.status,
        total_rows: job.total_rows,
        succeeded: job.succeeded,
        failed: job.failed,
      },
    })
  } catch (err) { next(err) }
}

// GET /api/docusign/bulk-jobs
exports.list = async (req, res, next) => {
  try {
    const jobs = await DocuSignBulkJob.find({ createdBy: req.user._id })
      .select('-envelopes')
      .sort({ createdAt: -1 })
      .lean()
    // Surface `created` for the frontend dashboard which reads dayjs(j.created).
    const items = jobs.map((j) => ({ ...j, created: j.createdAt }))
    res.json({ data: { items, total: items.length } })
  } catch (err) { next(err) }
}

// GET /api/docusign/bulk-jobs/:id
exports.get = async (req, res, next) => {
  try {
    const job = await DocuSignBulkJob.findOne({
      _id: req.params.id, createdBy: req.user._id,
    }).lean()
    if (!job) return res.status(404).json({ message: 'Bulk job not found' })
    res.json({ data: { ...job, created: job.createdAt } })
  } catch (err) { next(err) }
}

// POST /api/docusign/bulk-jobs/:id/retry-failed
exports.retryFailed = async (req, res, next) => {
  try {
    const job = await DocuSignBulkJob.findOne({
      _id: req.params.id, createdBy: req.user._id,
    })
    if (!job) return res.status(404).json({ message: 'Bulk job not found' })
    const tpl = await DocuSignTemplate.findOne({
      _id: job.template_id, createdBy: req.user._id,
    }).lean()
    if (!tpl) return res.status(404).json({ message: 'Source template no longer exists' })

    let retried = 0
    let succeededNow = 0
    let failedNow = 0
    job.status = 'running'
    for (let i = 0; i < job.envelopes.length; i++) {
      const entry = job.envelopes[i]
      if (entry.status !== 'failed') continue
      retried += 1
      try {
        const row = entry.row || {}
        if (!row.name || !row.email) throw new Error('missing_name_or_email')
        if (!isValidEmail(row.email)) throw new Error('invalid_email')
        const envDoc = buildEnvelopeFromTemplate(tpl, row, req.user._id)
        if (job.send_immediately) {
          envDoc.status = 'sent'
          envDoc.sentAt = new Date()
        }
        const envelope = await DocuSignEnvelope.create(envDoc)
        entry.status = 'sent'
        entry.envelope_id = envelope._id
        entry.error = ''
        succeededNow += 1
      } catch (err) {
        entry.error = err.message || 'create_failed'
        failedNow += 1
      }
    }
    job.succeeded = (job.succeeded || 0) + succeededNow
    job.failed = (job.failed || 0) - succeededNow
    job.status = job.failed > 0 ? 'completed' : 'completed' // terminal either way after retry pass
    await job.save()

    res.json({ data: { retried, succeeded: succeededNow, still_failed: failedNow } })
  } catch (err) { next(err) }
}
