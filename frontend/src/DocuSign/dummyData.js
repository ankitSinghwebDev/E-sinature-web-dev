/**
 * Dummy data for DocuSign prototype.
 * Generates a realistic deal memo PDF using canvas, and provides
 * sample recipients, envelopes, and field placements.
 */

/* ── Dummy Recipients ─────────────────────────────────────────────────── */
export const DUMMY_RECIPIENTS = [
  {
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    role: 'signer',
    routingOrder: 1,
    userId: null,
    status: 'created',
  },
  {
    name: 'Michael Chen',
    email: 'michael.chen@example.com',
    role: 'signer',
    routingOrder: 2,
    userId: null,
    status: 'created',
  },
  {
    name: 'Jessica Lee',
    email: 'jessica.lee@example.com',
    role: 'cc',
    routingOrder: 3,
    userId: null,
    status: 'created',
  },
]

/* ── Dummy Envelope List ──────────────────────────────────────────────── */
export const DUMMY_ENVELOPES = [
  {
    _id: 'demo-env-001',
    title: 'Deal Memo - Sarah Johnson - Sunrise Productions',
    description: 'Standard crew deal memo for camera department',
    status: 'completed',
    createdAt: '2026-03-15T10:30:00Z',
    sentAt: '2026-03-15T11:00:00Z',
    completedAt: '2026-03-16T14:20:00Z',
    recipients: [
      { name: 'Sarah Johnson', email: 'sarah@example.com', role: 'signer', routingOrder: 1, status: 'completed', signedAt: '2026-03-16T14:20:00Z', viewedAt: '2026-03-15T12:00:00Z' },
    ],
    tabs: [
      { type: 'signHere', recipientIndex: 0, label: 'Sign Here', required: true, pageNumber: 1, xPosition: 100, yPosition: 680, width: 180, height: 40, placementMode: 'coordinate' },
      { type: 'dateSigned', recipientIndex: 0, label: 'Date', required: true, pageNumber: 1, xPosition: 400, yPosition: 690, width: 120, height: 30, placementMode: 'coordinate' },
    ],
    document: { fileName: 'DealMemo_SarahJohnson.pdf', source: 'generated', fileSize: 52400 },
    auditTrail: [
      { action: 'created', actor: 'Admin', actorEmail: 'admin@example.com', timestamp: '2026-03-15T10:30:00Z', details: 'Envelope has been created' },
      { action: 'sent', actor: 'Admin', actorEmail: 'admin@example.com', timestamp: '2026-03-15T11:00:00Z', details: 'Envelope has been sent to Sarah Johnson' },
      { action: 'recipient_delivered', actor: 'Sarah Johnson', actorEmail: 'sarah@example.com', timestamp: '2026-03-15T12:00:00Z', details: 'Envelope has been delivered' },
      { action: 'recipient_signed', actor: 'Sarah Johnson', actorEmail: 'sarah@example.com', timestamp: '2026-03-16T14:20:00Z', details: 'Signer has completed signing' },
      { action: 'completed', actor: 'system', timestamp: '2026-03-16T14:20:00Z', details: 'Envelope has been completed by all parties' },
    ],
    settings: { expirationDays: 30 },
  },
  {
    _id: 'demo-env-002',
    title: 'Deal Memo - Michael Chen - Horizon Films',
    description: 'Lighting department crew agreement',
    status: 'sent',
    createdAt: '2026-03-28T09:15:00Z',
    sentAt: '2026-03-28T09:30:00Z',
    recipients: [
      { name: 'Michael Chen', email: 'michael@example.com', role: 'signer', routingOrder: 1, status: 'delivered', viewedAt: '2026-03-28T10:45:00Z' },
      { name: 'Jessica Lee', email: 'jessica@example.com', role: 'cc', routingOrder: 2, status: 'sent' },
    ],
    tabs: [
      { type: 'signHere', recipientIndex: 0, label: 'Sign Here', required: true, pageNumber: 1, xPosition: 100, yPosition: 680, width: 180, height: 40, placementMode: 'coordinate' },
      { type: 'initialHere', recipientIndex: 0, label: 'Initials', required: true, pageNumber: 1, xPosition: 100, yPosition: 580, width: 80, height: 30, placementMode: 'coordinate' },
    ],
    document: { fileName: 'DealMemo_MichaelChen.pdf', source: 'generated', fileSize: 48200 },
    auditTrail: [
      { action: 'created', actor: 'Admin', timestamp: '2026-03-28T09:15:00Z', details: 'Envelope has been created' },
      { action: 'sent', actor: 'Admin', timestamp: '2026-03-28T09:30:00Z', details: 'Envelope has been sent to all recipients' },
      { action: 'recipient_delivered', actor: 'Michael Chen', timestamp: '2026-03-28T10:45:00Z', details: 'Envelope has been delivered by Michael Chen' },
    ],
    settings: { expirationDays: 30 },
  },
  {
    _id: 'demo-env-003',
    title: 'NDA - Production Crew - Project Atlas',
    description: 'Non-disclosure agreement for all crew members',
    status: 'draft',
    createdAt: '2026-03-30T16:00:00Z',
    recipients: [
      { name: 'David Park', email: 'david@example.com', role: 'signer', routingOrder: 1, status: 'created' },
      { name: 'Emma Wilson', email: 'emma@example.com', role: 'signer', routingOrder: 2, status: 'created' },
    ],
    tabs: [],
    document: { fileName: 'NDA_ProjectAtlas.pdf', source: 'upload', fileSize: 31000 },
    auditTrail: [
      { action: 'created', actor: 'Admin', timestamp: '2026-03-30T16:00:00Z', details: 'Envelope has been created as draft' },
    ],
    settings: { expirationDays: 14 },
  },
  {
    _id: 'demo-env-004',
    title: 'Deal Memo - Rachel Kim - Sunrise Productions',
    description: 'Art department deal memo',
    status: 'declined',
    createdAt: '2026-03-20T08:00:00Z',
    sentAt: '2026-03-20T08:30:00Z',
    recipients: [
      { name: 'Rachel Kim', email: 'rachel@example.com', role: 'signer', routingOrder: 1, status: 'declined', viewedAt: '2026-03-20T09:00:00Z', declinedReason: 'Incorrect pay rate listed' },
    ],
    tabs: [
      { type: 'signHere', recipientIndex: 0, label: 'Sign Here', required: true, pageNumber: 1, xPosition: 100, yPosition: 680, width: 180, height: 40, placementMode: 'coordinate' },
    ],
    document: { fileName: 'DealMemo_RachelKim.pdf', source: 'generated', fileSize: 50100 },
    auditTrail: [
      { action: 'created', actor: 'Admin', timestamp: '2026-03-20T08:00:00Z', details: 'Envelope has been created' },
      { action: 'sent', actor: 'Admin', timestamp: '2026-03-20T08:30:00Z', details: 'Sent to Rachel Kim' },
      { action: 'recipient_delivered', actor: 'Rachel Kim', timestamp: '2026-03-20T09:00:00Z', details: 'Envelope has been delivered' },
      { action: 'recipient_declined', actor: 'Rachel Kim', timestamp: '2026-03-20T10:15:00Z', details: 'Declined: Incorrect pay rate listed' },
    ],
    settings: { expirationDays: 30 },
  },
]

/* ── Dummy Received Envelopes (user side) ─────────────────────────── */
export const DUMMY_RECEIVED_ENVELOPES = [
  {
    _id: 'demo-recv-001',
    title: 'Deal Memo - Sunrise Productions',
    description: 'Crew deal memo for camera department',
    status: 'sent',
    createdAt: '2026-03-29T10:00:00Z',
    sentAt: '2026-03-29T10:30:00Z',
    sender: { name: 'Admin', email: 'admin@sunrise.example.com' },
    recipients: [
      { name: 'You', email: 'user@example.com', role: 'signer', routingOrder: 1, status: 'sent' },
    ],
    tabs: [
      { type: 'signHere', recipientIndex: 0, label: 'Sign Here', required: true, pageNumber: 1, xPosition: 24, yPosition: 668, width: 180, height: 36, placementMode: 'coordinate' },
      { type: 'initialHere', recipientIndex: 0, label: 'Initial Here', required: true, pageNumber: 1, xPosition: 540, yPosition: 584, width: 50, height: 26, placementMode: 'coordinate' },
      { type: 'email', recipientIndex: 0, label: 'Email', required: true, pageNumber: 1, xPosition: 200, yPosition: 672, width: 180, height: 26, placementMode: 'coordinate' },
    ],
    document: { fileName: 'Callsheet for ADs.pdf', source: 'upload', fileSize: 366592 },
    settings: { expirationDays: 30 },
  },
  {
    _id: 'demo-recv-002',
    title: 'NDA - Project Atlas',
    description: 'Non-disclosure agreement',
    status: 'delivered',
    createdAt: '2026-03-25T14:00:00Z',
    sentAt: '2026-03-25T14:15:00Z',
    sender: { name: 'Admin', email: 'admin@sunrise.example.com' },
    recipients: [
      { name: 'You', email: 'user@example.com', role: 'signer', routingOrder: 1, status: 'delivered', viewedAt: '2026-03-25T16:00:00Z' },
    ],
    tabs: [
      { type: 'signHere', recipientIndex: 0, label: 'Sign Here', required: true, pageNumber: 1, xPosition: 100, yPosition: 700, width: 180, height: 36, placementMode: 'coordinate' },
    ],
    document: { fileName: 'NDA_ProjectAtlas.pdf', source: 'upload', fileSize: 31000 },
    settings: { expirationDays: 14 },
  },
  {
    _id: 'demo-recv-003',
    title: 'Deal Memo - Horizon Films',
    description: 'Lighting department agreement',
    status: 'completed',
    createdAt: '2026-03-10T09:00:00Z',
    sentAt: '2026-03-10T09:30:00Z',
    sender: { name: 'Admin', email: 'admin@sunrise.example.com' },
    recipients: [
      { name: 'You', email: 'user@example.com', role: 'signer', routingOrder: 1, status: 'completed', signedAt: '2026-03-10T15:00:00Z' },
    ],
    tabs: [
      { type: 'signHere', recipientIndex: 0, label: 'Sign Here', required: true, pageNumber: 1, xPosition: 100, yPosition: 680, width: 180, height: 36, placementMode: 'coordinate' },
    ],
    document: { fileName: 'DealMemo_HorizonFilms.pdf', source: 'generated', fileSize: 48200 },
    settings: { expirationDays: 30 },
  },
]

/**
 * PDF document path.
 * Place your PDF in: public/docusign/deal-memo.pdf
 * Vite serves files from public/ at the root, so it becomes /docusign/deal-memo.pdf
 */
export const DOCUMENT_PDF_URL = '/docusign/Callsheet for ADs.pdf'

/**
 * Render ALL pages of the PDF into one tall image.
 * Each page is stacked vertically. Returns { dataUrl, width, height, pageCount, pageHeights }.
 */
// Bundle the pdfjs worker as a static asset so Vite copies it into the
// production build and returns a correct URL. The old
// `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` form
// works in dev but silently breaks in some production builds because
// node_modules paths aren't always rewritten by Vite's asset resolver.
// eslint-disable-next-line import/no-unresolved
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export async function loadPdfAsImage(url = DOCUMENT_PDF_URL, scale = 2) {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

    const pdf = await pdfjsLib.getDocument(url).promise
    const numPages = pdf.numPages

    // Render each page to its own canvas, collect dimensions
    const pages = []
    let maxWidth = 0
    let totalHeight = 0
    const pageHeights = []

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport }).promise
      pages.push({ canvas, width: viewport.width, height: viewport.height })
      if (viewport.width > maxWidth) maxWidth = viewport.width
      pageHeights.push(viewport.height)
      totalHeight += viewport.height
    }

    // Stitch all pages into one tall canvas
    const gap = 4 * scale // small gap between pages
    const finalHeight = totalHeight + gap * (numPages - 1)
    const combined = document.createElement('canvas')
    combined.width = maxWidth
    combined.height = finalHeight
    const ctx = combined.getContext('2d')

    // Light gray background (visible in gaps between pages)
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(0, 0, maxWidth, finalHeight)

    let yOffset = 0
    for (const pg of pages) {
      // Center page horizontally if narrower than max
      const xOffset = Math.round((maxWidth - pg.width) / 2)
      ctx.drawImage(pg.canvas, xOffset, yOffset)
      yOffset += pg.height + gap
    }

    return {
      dataUrl: combined.toDataURL('image/png'),
      base64: combined.toDataURL('image/png').split(',')[1],
      width: maxWidth,
      height: finalHeight,
      pageCount: numPages,
      pageHeights,
    }
  } catch (err) {
    // Log so production failures surface in the browser console instead of
    // silently returning null (which callers interpret as "load failed").
    console.error('[loadPdfAsImage] failed to render PDF:', err, { url })
    return null
  }
}

/**
 * Synchronous fallback: generates a deal memo image using canvas.
 * Used when no PDF is available at public/docusign/deal-memo.pdf.
 */
export function generateFallbackDocument() {
  const canvas = document.createElement('canvas')
  canvas.width = 612
  canvas.height = 792
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 612, 792)

  // Header
  ctx.fillStyle = '#E8930C'
  ctx.fillRect(0, 0, 612, 56)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 18px Arial, sans-serif'
  ctx.fillText('DEAL MEMO', 24, 36)
  ctx.font = '10px Arial, sans-serif'
  ctx.fillText('CONFIDENTIAL', 500, 36)

  // Company
  ctx.fillStyle = '#1e293b'
  ctx.font = 'bold 13px Arial, sans-serif'
  ctx.fillText('Sunrise Productions Inc.', 24, 84)
  ctx.fillStyle = '#64748b'
  ctx.font = '10px Arial, sans-serif'
  ctx.fillText('1234 Studio Boulevard, Los Angeles, CA 90028', 24, 100)
  ctx.fillText('Tel: (310) 555-0142  |  Email: production@sunrise.example.com', 24, 114)

  ctx.strokeStyle = '#e2e8f0'
  ctx.beginPath(); ctx.moveTo(24, 128); ctx.lineTo(588, 128); ctx.stroke()

  // Sections helper
  const drawSection = (title, startY) => {
    ctx.fillStyle = '#E8930C'; ctx.font = 'bold 12px Arial, sans-serif'
    ctx.fillText(title, 24, startY)
    ctx.strokeStyle = '#E8930C'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(24, startY + 6); ctx.lineTo(24 + title.length * 8, startY + 6); ctx.stroke()
    ctx.lineWidth = 1
    return startY + 26
  }

  const drawRow = (label, value, y) => {
    ctx.fillStyle = '#64748b'; ctx.font = '10px Arial, sans-serif'; ctx.fillText(label, 24, y)
    ctx.fillStyle = '#1e293b'; ctx.font = '11px Arial, sans-serif'; ctx.fillText(value, 160, y)
    ctx.strokeStyle = '#f1f5f9'; ctx.beginPath(); ctx.moveTo(24, y + 6); ctx.lineTo(588, y + 6); ctx.stroke()
    return y + 22
  }

  let y = drawSection('EMPLOYEE DETAILS', 150)
  y = drawRow('Full Name', 'Sarah Johnson', y)
  y = drawRow('Email', 'sarah.johnson@example.com', y)
  y = drawRow('Designation', 'Director of Photography', y)
  y = drawRow('Department', 'Camera', y)
  y = drawRow('Employee ID', 'EMP-2026-0847', y)

  y = drawSection('PROJECT DATES', y + 12)
  y = drawRow('Start Date', 'April 15, 2026', y)
  y = drawRow('End Date', 'July 30, 2026', y)
  y = drawRow('Prep Period', 'April 1 – April 14, 2026', y)
  y = drawRow('Shoot Period', 'April 15 – July 15, 2026', y)

  y = drawSection('COMPENSATION', y + 12)
  y = drawRow('Pay Frequency', 'Weekly', y)
  y = drawRow('Day Rate', '$1,850.00', y)
  y = drawRow('Weekly Rate', '$9,250.00', y)
  y = drawRow('Overtime Rate', '1.5x after 12 hours', y)

  // Signature area
  y += 20
  ctx.strokeStyle = '#cbd5e1'; ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.moveTo(24, y + 30); ctx.lineTo(250, y + 30); ctx.stroke()
  ctx.fillStyle = '#94a3b8'; ctx.font = '9px Arial, sans-serif'
  ctx.fillText('Signature', 24, y + 44); ctx.fillText('Date Signed', 190, y + 44)
  ctx.beginPath(); ctx.moveTo(330, y + 30); ctx.lineTo(588, y + 30); ctx.stroke()
  ctx.fillText('Authorized Signature', 330, y + 44); ctx.fillText('Date Signed', 520, y + 44)
  ctx.setLineDash([])

  // Footer
  ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, 760, 612, 32)
  ctx.fillStyle = '#94a3b8'; ctx.font = '8px Arial, sans-serif'
  ctx.fillText('Sunrise Productions Inc. — Confidential — Page 1 of 1', 24, 778)

  const dataUrl = canvas.toDataURL('image/png')
  return { base64: dataUrl.split(',')[1], dataUrl, width: canvas.width, height: canvas.height }
}

/**
 * Main entry: try to load the PDF, fall back to canvas.
 * Sync version returns canvas immediately; async version tries PDF first.
 */
export function generateDummyDealMemoPdf() {
  return generateFallbackDocument()
}

/* ── Default field placements for a dummy doc ─────────────────────────── */
export const DUMMY_DEFAULT_TABS = [
  {
    type: 'signHere',
    recipientIndex: 0,
    label: 'Employee Signature',
    required: true,
    placementMode: 'coordinate',
    pageNumber: 1,
    xPosition: 24,
    yPosition: 668,
    width: 180,
    height: 36,
    anchorString: '',
    anchorXOffset: 0,
    anchorYOffset: 0,
    value: '',
    options: [],
  },
  {
    type: 'dateSigned',
    recipientIndex: 0,
    label: 'Date',
    required: true,
    placementMode: 'coordinate',
    pageNumber: 1,
    xPosition: 200,
    yPosition: 672,
    width: 80,
    height: 26,
    anchorString: '',
    anchorXOffset: 0,
    anchorYOffset: 0,
    value: '',
    options: [],
  },
  {
    type: 'initialHere',
    recipientIndex: 0,
    label: 'Initials',
    required: true,
    placementMode: 'coordinate',
    pageNumber: 1,
    xPosition: 540,
    yPosition: 584,
    width: 50,
    height: 26,
    anchorString: '',
    anchorXOffset: 0,
    anchorYOffset: 0,
    value: '',
    options: [],
  },
]
