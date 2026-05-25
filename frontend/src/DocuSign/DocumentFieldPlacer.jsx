/**
 * DocumentFieldPlacer — Click-to-place: click anywhere on the document,
 * pick a field type from the popup, and it's placed at that exact spot.
 * Existing fields can still be dragged to reposition.
 */

import {
  CalendarOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  DownOutlined,
  DownSquareOutlined,
  EditOutlined,
  FieldNumberOutlined,
  FontSizeOutlined,
  LinkOutlined,
  MailOutlined,
  PhoneOutlined,
  PictureOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { Checkbox, Divider, Input, Spin, Tag } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PRIMARY,
  SIGNER_COLORS as COLORS,
  INITIAL_W,
  INITIAL_H,
  INITIAL_GAP,
  FIELD_MARGIN,
  ROW_GAP,
  PAGE_GAP,
  AUTO_INITIAL_ROW_GAP,
  INSTRUCTION_DISPLAY_MS,
  PAGE_NAV_HIDE_MS,
  PAGE_NAV_INITIAL_HIDE_MS,
} from './constants'
import FieldPropertyPanel from './FieldPropertyPanel'

// One row per toolbar-enabled field type from constants.FIELD_TYPES.
// Icons live here (constants is JS-only — no JSX), so each entry pairs
// the type's metadata with its picker icon.
const FIELDS = [
  { type: 'signHere',    label: 'Signature', icon: <EditOutlined />,         color: '#E8930C', w: 180, h: 36 },
  { type: 'initialHere', label: 'Initial',   icon: <FontSizeOutlined />,     color: '#3b82f6', w: 120, h: 40 },
  { type: 'checkbox',    label: 'Checkbox',  icon: <CheckSquareOutlined />,  color: '#10b981', w: 180, h: 36 },
  { type: 'radioGroup',  label: 'Radio',     icon: <CheckCircleOutlined />,  color: '#8b5cf6', w: 180, h: 64 },
  { type: 'dropdown',    label: 'Select',    icon: <DownSquareOutlined />,   color: '#06b6d4', w: 160, h: 32 },
  { type: 'text',        label: 'Text',      icon: <EditOutlined />,         color: '#f59e0b', w: 150, h: 32 },
  { type: 'date',        label: 'Date',      icon: <CalendarOutlined />,     color: '#d946ef', w: 130, h: 32 },
  { type: 'email',       label: 'Email',     icon: <MailOutlined />,         color: '#0ea5e9', w: 180, h: 32 },
  { type: 'phone',       label: 'Phone',     icon: <PhoneOutlined />,        color: '#14b8a6', w: 150, h: 32 },
  { type: 'number',      label: 'Number',    icon: <FieldNumberOutlined />,  color: '#ef4444', w: 100, h: 32 },
  { type: 'url',         label: 'URL',       icon: <LinkOutlined />,         color: '#7c3aed', w: 180, h: 32 },
  { type: 'image',       label: 'Image',     icon: <PictureOutlined />,      color: '#0891b2', w: 120, h: 120 },
]

// Stable per-recipient identifier so we can arm a signer in fast-place mode
// without keying by array index (safe against reorder / delete).
const signerKey = (r) => (r?.userId || r?.email || '')

const DocumentFieldPlacer = ({
  tabs,
  onChange,
  recipients,
  documentBase64,
  pageCount = 0,
  pageHeights = [],
  document: docInfo,
  onReplaceDoc,
  note = '',
  onNoteChange,
  initialsOnAllPagesEnabled = false,
  onInitialsOnAllPagesChange,
  sidebarTopContent,
  // ── Fast-place props (from DocuSignPanel) ─────────────────────────
  placementMode = null,           // 'manual' | 'fastPlace' | null
  placementIntent = null,         // { signerKey, tool } | null — which signer is armed
  onPlacementIntentChange,        // setter; called with new intent or null
}) => {
  const [selectedPopoverSigners, setSelectedPopoverSigners] = useState(new Set())
  const [editIdx, setEditIdx] = useState(null)
  const [docImage, setDocImage] = useState(null)
  const [docSize, setDocSize] = useState({ w: 612, h: 792 })
  const [loading, setLoading] = useState(true)

  // "Initials on all pages" feature — controlled by parent, fallback to local state
  const [localInitialsOnAllPages, setLocalInitialsOnAllPages] = useState(initialsOnAllPagesEnabled)
  const initialsOnAllPages = onInitialsOnAllPagesChange ? initialsOnAllPagesEnabled : localInitialsOnAllPages
  const [excludedPages, setExcludedPages] = useState(new Set()) // pages opted out
  const [selectedInitialSigners, setSelectedInitialSigners] = useState(new Set()) // signer indices selected for initials
  const [initialsSettingsOpen, setInitialsSettingsOpen] = useState(true) // collapsible initials settings

  // Click-to-place popover state
  const [popover, setPopover] = useState(null) // { x, y, docX, docY } in pixels + doc coords

  // Instruction tooltip visibility
  const [showInstruction, setShowInstruction] = useState(true)
  const instructionTimer = useRef(null)

  // Auto-hide after 2s, show again on scroll
  useEffect(() => {
    instructionTimer.current = setTimeout(() => setShowInstruction(false), INSTRUCTION_DISPLAY_MS)
    return () => clearTimeout(instructionTimer.current)
  }, [])

  const handleDocScroll = useCallback(() => {
    setShowInstruction(true)
    clearTimeout(instructionTimer.current)
    instructionTimer.current = setTimeout(() => setShowInstruction(false), INSTRUCTION_DISPLAY_MS)
  }, [])

  // Cursor follower
  const [cursorPos, setCursorPos] = useState(null) // { x, y } relative to preview

  const previewRef = useRef(null)
  const docScrollRef = useRef(null)
  const dragRef = useRef(null)

  const signers = useMemo(() => recipients.filter((r) => r.role === 'signer' || r.role === 'in_person_signer'), [recipients])

  // ── Fast-place side effects ──────────────────────────────────────
  // ESC disarms the current placement intent.
  useEffect(() => {
    if (!onPlacementIntentChange) return
    const onKey = (e) => {
      if (e.key === 'Escape' && placementIntent) {
        onPlacementIntentChange(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placementIntent, onPlacementIntentChange])

  // If the armed signer is removed (or renamed with new key), clear intent.
  useEffect(() => {
    if (!placementIntent || !onPlacementIntentChange) return
    const stillPresent = signers.some((s) => signerKey(s) === placementIntent.signerKey)
    if (!stillPresent) onPlacementIntentChange(null)
  }, [signers, placementIntent, onPlacementIntentChange])

  // When entering fast-place with exactly one signer, auto-arm them with the
  // Sign tool so the admin can start dropping fields immediately.
  useEffect(() => {
    if (placementMode !== 'fastPlace') return
    if (placementIntent) return
    if (signers.length !== 1) return
    if (!onPlacementIntentChange) return
    const only = signers[0]
    if (!signerKey(only)) return
    onPlacementIntentChange({ signerKey: signerKey(only), tool: 'signHere' })
  }, [placementMode, placementIntent, signers, onPlacementIntentChange])

  // Load document — expects a rendered image (dataUrl or base64) from the parent.
  // If nothing is provided yet, we stay in loading state rather than
  // rendering a dummy sample (which would silently mask real load failures
  // on the parent side, e.g. a CORS-blocked /uploads fetch).
  useEffect(() => {
    let cancelled = false
    if (!documentBase64) {
      setDocImage(null)
      setLoading(true)
      return () => { cancelled = true }
    }
    setLoading(true)
    if (!cancelled) {
      setDocImage(documentBase64.startsWith('data:') ? documentBase64 : `data:image/png;base64,${documentBase64}`)
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [documentBase64])

  const onImgLoad = useCallback((e) => setDocSize({ w: e.target.naturalWidth, h: e.target.naturalHeight }), [])

  // Core placer — given doc coordinates, a list of recipient indices, and a
  // field type, creates the tabs side-by-side and appends them. Shared between
  // the popover path (manual mode) and the direct-click path (fast-place).
  const placeFieldAt = useCallback(({ docX, docY, recipientIndices, type }) => {
    const f = FIELDS.find((x) => x.type === type)
    const fw = f?.w || 150
    const fh = f?.h || 30
    const gap = INITIAL_GAP
    const rowGap = ROW_GAP
    const indices = (recipientIndices || []).filter((ri) => ri >= 0)
    if (indices.length === 0) return

    // Calculate how many fit per row within the page width
    const maxPerRow = Math.max(1, Math.floor((docSize.w - FIELD_MARGIN * 2) / (fw + gap)))
    const cols = Math.min(indices.length, maxPerRow)
    const totalW = cols * fw + (cols - 1) * gap
    // Center on click but clamp within page margins
    const startX = Math.min(Math.max(FIELD_MARGIN, docX - totalW / 2), docSize.w - totalW - FIELD_MARGIN)
    const startY = Math.max(0, docY - fh / 2)

    const newTabs = indices.map((ri, posIdx) => {
      const col = posIdx % maxPerRow
      const row = Math.floor(posIdx / maxPerRow)
      return {
        type, recipientIndex: ri, label: f?.label || type, required: true, placementMode: 'coordinate',
        pageNumber: 1,
        xPosition: startX + col * (fw + gap),
        yPosition: startY + row * (fh + rowGap),
        width: fw, height: fh,
        anchorString: '', anchorXOffset: 0, anchorYOffset: 0, value: '', options: [],
      }
    })

    if (newTabs.length === 0) return
    onChange([...tabs, ...newTabs])
    setEditIdx(tabs.length) // select first new tab
  }, [tabs, onChange, docSize.w])

  // Place fields at the popover's document coordinates — one per selected signer, side by side
  const placeField = useCallback((type) => {
    if (!popover) return
    const selected = [...selectedPopoverSigners].sort((a, b) => a - b)
    if (selected.length === 0) return
    const recipientIndices = selected.map((si) => recipients.indexOf(signers[si]))
    placeFieldAt({ docX: popover.docX, docY: popover.docY, recipientIndices, type })
    setPopover(null)
  }, [popover, selectedPopoverSigners, recipients, signers, placeFieldAt])

  const removeField = (i) => { onChange(tabs.filter((_, idx) => idx !== i)); if (editIdx === i) setEditIdx(null); else if (editIdx > i) setEditIdx(editIdx - 1) }
  const updateField = useCallback((i, u) => { const t = [...tabs]; t[i] = { ...t[i], ...u }; onChange(t) }, [tabs, onChange])

  // ── "Initials on all pages" ──

  // Calculate Y offset for the bottom of each page in the combined image
  const getPageBottomY = useCallback((pageNum) => {
    
    if (!pageHeights.length) return 0
    let y = 0
    for (let i = 0; i < pageNum; i++) {
      y += (pageHeights[i] || 0)
      if (i < pageNum - 1) y += PAGE_GAP
    }
    // Bottom of page minus margin for initial box
    return y - 50
  }, [pageHeights])

  // Generate auto-initial tabs for all non-excluded pages for all signers

  const buildAutoInitialTabs = useCallback((excluded, selectedSigners) => {
    if (!pageHeights.length || signers.length === 0) return []
    const totalPages = pageHeights.length
    const activeSigners = signers.filter((_, i) => selectedSigners.has(i))
    if (activeSigners.length === 0) return []
    const rowGap = AUTO_INITIAL_ROW_GAP
    const maxPerRow = Math.max(1, Math.floor((docSize.w - FIELD_MARGIN * 2) / (INITIAL_W + INITIAL_GAP)))
    const cols = Math.min(activeSigners.length, maxPerRow)
    const totalWidth = cols * INITIAL_W + (cols - 1) * INITIAL_GAP
    const startX = docSize.w - totalWidth - FIELD_MARGIN
    const autoTabs = []
    for (let pg = 1; pg <= totalPages; pg++) {
      if (excluded.has(pg)) continue
      const totalRows = Math.ceil(activeSigners.length / maxPerRow)
      activeSigners.forEach((signer, posIdx) => {
        const ri = recipients.indexOf(signer)
        if (ri < 0) return
        const col = posIdx % maxPerRow
        const row = Math.floor(posIdx / maxPerRow)
        autoTabs.push({
          type: 'initialHere',
          recipientIndex: ri,
          label: 'Initial',
          required: true,
          placementMode: 'coordinate',
          pageNumber: pg,
          xPosition: startX + col * (INITIAL_W + INITIAL_GAP),
          yPosition: getPageBottomY(pg) - (totalRows - 1 - row) * (INITIAL_H + rowGap),
          width: INITIAL_W,
          height: INITIAL_H,
          anchorString: '', anchorXOffset: 0, anchorYOffset: 0, value: '', options: [],
          _autoInitial: true,
        })
      })
    }
    return autoTabs
  }, [pageHeights, signers, recipients, docSize.w, getPageBottomY])

  const setInitialsOnAllPages = useCallback((val) => {
    if (onInitialsOnAllPagesChange) onInitialsOnAllPagesChange(val)
    else setLocalInitialsOnAllPages(val)
  }, [onInitialsOnAllPagesChange])

  const toggleInitialsOnAllPages = useCallback((checked) => {
    setInitialsOnAllPages(checked)
    const manualTabs = tabs.filter((t) => !t._autoInitial)
    if (checked) {
      const excluded = new Set()
      setExcludedPages(excluded)
      // Default: select all signers
      const allSignerIdxs = new Set(signers.map((_, i) => i))
      setSelectedInitialSigners(allSignerIdxs)
      const autoTabs = buildAutoInitialTabs(excluded, allSignerIdxs)
      onChange([...manualTabs, ...autoTabs])
    } else {
      setExcludedPages(new Set())
      setSelectedInitialSigners(new Set())
      onChange(manualTabs)
    }
  }, [tabs, onChange, buildAutoInitialTabs, setInitialsOnAllPages, signers])

  const togglePageExclusion = useCallback((pageNum) => {
    setExcludedPages((prev) => {
      const next = new Set(prev)
      if (next.has(pageNum)) next.delete(pageNum)
      else next.add(pageNum)
      const manualTabs = tabs.filter((t) => !t._autoInitial)
      const autoTabs = buildAutoInitialTabs(next, selectedInitialSigners)
      onChange([...manualTabs, ...autoTabs])
      return next
    })
  }, [tabs, onChange, buildAutoInitialTabs, selectedInitialSigners])

  const toggleSignerForInitials = useCallback((signerIdx) => {
    setSelectedInitialSigners((prev) => {
      const next = new Set(prev)
      if (next.has(signerIdx)) next.delete(signerIdx)
      else next.add(signerIdx)
      const manualTabs = tabs.filter((t) => !t._autoInitial)
      const autoTabs = buildAutoInitialTabs(excludedPages, next)
      onChange([...manualTabs, ...autoTabs])
      return next
    })
  }, [tabs, onChange, buildAutoInitialTabs, excludedPages])

  // Count auto-initial pages
  const autoInitialPages = useMemo(() => {
    if (!initialsOnAllPages || !pageHeights.length) return []
    return Array.from({ length: pageHeights.length }, (_, i) => i + 1).filter((pg) => !excludedPages.has(pg))
  }, [initialsOnAllPages, pageHeights, excludedPages])

  // Click on document. In fast-place mode with an armed signer, drop a field
  // directly (no popover). Otherwise open the popover for manual selection.
  const onDocClick = useCallback((e) => {
    if (dragRef.current) return
    if (signers.length === 0) return // Block if no recipients
    const rect = previewRef.current?.getBoundingClientRect()
    if (!rect) return
    const scaleX = docSize.w / rect.width
    const scaleY = docSize.h / rect.height
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    const docX = Math.round(clickX * scaleX)
    const docY = Math.round(clickY * scaleY)

    // Fast-place path: drop the field for the armed signer immediately.
    if (placementMode === 'fastPlace' && placementIntent) {
      const ri = recipients.findIndex((r) => signerKey(r) === placementIntent.signerKey)
      if (ri >= 0) {
        placeFieldAt({ docX, docY, recipientIndices: [ri], type: placementIntent.tool })
        setEditIdx(null)
        // Keep intent armed so the admin can drop multiple fields for the
        // same signer without re-clicking the sidebar button.
      }
      return
    }

    // Manual path: open the popover so the admin picks signer + field type.
    setPopover({ x: clickX, y: clickY, docX, docY })
    setEditIdx(null)
    // Auto-select the only signer when there's just one
    if (signers.length === 1) setSelectedPopoverSigners(new Set([0]))
  }, [docSize, signers.length, placementMode, placementIntent, recipients, placeFieldAt])

  // Drag existing fields. Auto-initial fields drag as a group: every
  // _autoInitial tab (across all pages & signers) moves by the same dx/dy so
  // the admin can nudge the whole row to avoid overlapping doc content.
  const onFieldDown = useCallback((e, i) => {
    e.preventDefault(); e.stopPropagation()
    setPopover(null)
    const rect = previewRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = docSize.w / rect.width, sy = docSize.h / rect.height
    const tab = tabs[i]
    if (!tab) return

    if (tab._autoInitial) {
      // Group drag — snapshot current tabs so we can apply the cumulative
      // delta against their original positions without drift.
      dragRef.current = {
        mode: 'group',
        startDocX: (e.clientX - rect.left) * sx,
        startDocY: (e.clientY - rect.top) * sy,
        originTabs: tabs,
        sx, sy,
      }
      setEditIdx(i)
      return
    }

    // Single-field drag (manual tabs)
    const fx = tab.xPosition / sx, fy = tab.yPosition / sy
    dragRef.current = {
      mode: 'single',
      i,
      ox: (e.clientX - rect.left) - fx,
      oy: (e.clientY - rect.top) - fy,
      sx, sy,
    }
    setEditIdx(i)
  }, [tabs, docSize])

  // Resize existing fields from bottom-right corner
  const resizeRef = useRef(null)
  const MIN_W = 60
  const MIN_H = 24
  const onResizeDown = useCallback((e, i) => {
    e.preventDefault(); e.stopPropagation()
    const rect = previewRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = docSize.w / rect.width, sy = docSize.h / rect.height
    resizeRef.current = {
      i,
      startX: e.clientX,
      startY: e.clientY,
      startW: tabs[i].width,
      startH: tabs[i].height,
      sx, sy,
    }
    setEditIdx(i)
  }, [tabs, docSize])

  useEffect(() => {
    const move = (e) => {
      if (resizeRef.current) {
        const { i, startX, startY, startW, startH, sx, sy } = resizeRef.current
        const dx = (e.clientX - startX) * sx
        const dy = (e.clientY - startY) * sy
        updateField(i, {
          width: Math.max(MIN_W, Math.round(startW + dx)),
          height: Math.max(MIN_H, Math.round(startH + dy)),
        })
        return
      }
      if (!dragRef.current) return
      const rect = previewRef.current?.getBoundingClientRect()
      if (!rect) return

      // Group drag: nudge every auto-initial tab by the same delta.
      if (dragRef.current.mode === 'group') {
        const { startDocX, startDocY, originTabs, sx, sy } = dragRef.current
        const curDocX = (e.clientX - rect.left) * sx
        const curDocY = (e.clientY - rect.top) * sy
        const dx = curDocX - startDocX
        const dy = curDocY - startDocY
        onChange(originTabs.map((t) => {
          if (!t._autoInitial) return t
          return {
            ...t,
            xPosition: Math.max(0, Math.round(t.xPosition + dx)),
            yPosition: Math.max(0, Math.round(t.yPosition + dy)),
          }
        }))
        return
      }

      // Single-field drag (manual tabs).
      const { i, ox, oy, sx, sy } = dragRef.current
      updateField(i, {
        xPosition: Math.max(0, Math.round(((e.clientX - rect.left) - ox) * sx)),
        yPosition: Math.max(0, Math.round(((e.clientY - rect.top) - oy) * sy)),
      })
    }
    const up = () => { dragRef.current = null; resizeRef.current = null }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [updateField, onChange])

  const getStyle = (tab) => {
    const rect = previewRef.current?.getBoundingClientRect()
    if (!rect) return { display: 'none' }
    return {
      left: tab.xPosition * (rect.width / docSize.w),
      top: tab.yPosition * (rect.height / docSize.h),
      width: tab.width * (rect.width / docSize.w),
      height: tab.height * (rect.height / docSize.h),
    }
  }

  // Re-render on resize for correct overlay positions
  const [, tick] = useState(0)
  useEffect(() => { const fn = () => { tick((t) => t + 1); setPopover(null) }; window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn) }, [])

  // Track cursor on document for signer label
  const handleDocMouseMove = useCallback((e) => {
    if (signers.length === 0) return
    const rect = previewRef.current?.getBoundingClientRect()
    if (!rect) return
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [signers.length])

  const handleDocMouseLeave = useCallback(() => setCursorPos(null), [])

  // ── Page navigation ──
  const [pageNavMinimized, setPageNavMinimized] = useState(false)
  const [pageNavVisible, setPageNavVisible] = useState(true)
  const hideTimerRef = useRef(null)
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = pageHeights.length || 1

  // Get Y offset for start of a page in the combined image
  const getPageTopY = useCallback((pageNum) => {
    if (!pageHeights.length) return 0
    let y = 0
    for (let i = 0; i < pageNum - 1; i++) {
      y += (pageHeights[i] || 0) + PAGE_GAP
    }
    return y
  }, [pageHeights])

  const scrollToPage = useCallback((pageNum) => {
    if (!docScrollRef.current || !previewRef.current) return
    const rect = previewRef.current.getBoundingClientRect()
    if (!rect.width || !docSize.w) return
    const scale = rect.width / docSize.w
    const targetY = getPageTopY(pageNum) * scale
    docScrollRef.current.scrollTo({ top: targetY, behavior: 'smooth' })
    setCurrentPage(pageNum)
    // Keep nav visible after clicking
    setPageNavVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setPageNavVisible(false), PAGE_NAV_HIDE_MS)
  }, [docSize, getPageTopY])

  // Track current page on scroll + auto-hide nav
  useEffect(() => {
    const el = docScrollRef.current
    if (!el || !previewRef.current || !pageHeights.length) return
    const onScroll = () => {
      // Show nav immediately on scroll
      setPageNavVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setPageNavVisible(false), PAGE_NAV_HIDE_MS)

      const rect = previewRef.current?.getBoundingClientRect()
      if (!rect?.width || !docSize.w) return
      const scale = rect.width / docSize.w
      const scrollTop = el.scrollTop
      let accum = 0
      for (let i = 0; i < pageHeights.length; i++) {
        accum += (pageHeights[i] || 0) * scale
        if (i < pageHeights.length - 1) accum += PAGE_GAP * scale
        if (scrollTop < accum - (pageHeights[i] * scale * 0.5)) {
          setCurrentPage(i + 1)
          return
        }
      }
      setCurrentPage(pageHeights.length)
    }
    // Start hidden after initial delay
    hideTimerRef.current = setTimeout(() => setPageNavVisible(false), PAGE_NAV_INITIAL_HIDE_MS)
    el.addEventListener('scroll', onScroll)
    return () => { el.removeEventListener('scroll', onScroll); if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [pageHeights, docSize])

  return (
    <div className="flex" style={{ height: 'calc(100vh - 140px)' }}>
      {/* ── Sidebar ── */}
      <div className="flex-shrink-0 flex flex-col overflow-y-auto p-3" style={{ width: 400, background: 'var(--ds-bg, #fff)', borderRight: '1px solid var(--ds-borderLight)' }}>
        {/* Signer/CC cards injected from parent */}
        {sidebarTopContent}

        {/* Per-field property editor — shown when a placed field is selected */}
        {editIdx !== null && tabs[editIdx] && (
          <FieldPropertyPanel
            tab={tabs[editIdx]}
            tabIndex={editIdx}
            recipient={recipients?.[tabs[editIdx].recipientIndex]}
            onChange={(patch) => {
              onChange(tabs.map((t, i) => (i === editIdx ? { ...t, ...patch } : t)))
            }}
            onDelete={() => removeField(editIdx)}
            onClose={() => setEditIdx(null)}
          />
        )}

        {/* No recipients warning */}
        {signers.length === 0 && (
          <div className="mb-3 p-2 rounded-md" style={{ border: `1px solid ${PRIMARY}40`, background: `${PRIMARY}08` }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <UserAddOutlined style={{ color: PRIMARY, fontSize: 13 }} />
              <span className="text-xs font-semibold" style={{ color: PRIMARY }}>No Signers</span>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--ds-textSecondary)' }}>
              Click "+ Add Signer" above to add signers.
            </p>
          </div>
        )}

        {/* Initials on all pages */}
        {signers.length > 0 && pageHeights.length > 1 && (
          <>
            <Divider className="!my-0 !mb-2" />
            <div
              className="mb-2 rounded-lg p-3 cursor-pointer transition-all"
              style={{
                background: initialsOnAllPages ? `${PRIMARY}08` : 'var(--ds-bgSecondary, #f8fafc)',
                border: `1.5px ${initialsOnAllPages ? 'solid' : 'dashed'} ${initialsOnAllPages ? PRIMARY : 'var(--ds-border, #e2e8f0)'}`,
              }}
              onClick={() => toggleInitialsOnAllPages(!initialsOnAllPages)}
            >
              <div className="flex items-start gap-2.5">
                <Checkbox
                  checked={initialsOnAllPages}
                  onChange={(e) => { e.stopPropagation(); toggleInitialsOnAllPages(e.target.checked) }}
                  style={{ marginTop: 2 }}
                />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--ds-text)' }}>Initials on all pages</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--ds-text)' }}>
                    Click here to get signer initials on all the pages
                  </div>
                </div>
              </div>

              {initialsOnAllPages && (signers.length > 1 || pageHeights.length > 0) && (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  {/* Collapsible header */}
                  <button
                    className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg transition-all hover:opacity-80"
                    style={{ background: 'var(--ds-bgSecondary, #f1f5f9)', border: '1px solid var(--ds-border, #e2e8f0)' }}
                    onClick={() => setInitialsSettingsOpen(!initialsSettingsOpen)}
                  >
                    <span className="text-[11px] font-bold" style={{ color: 'var(--ds-text)' }}>
                      Settings · {selectedInitialSigners.size} signers · {autoInitialPages.length} pages
                    </span>
                    <DownOutlined style={{ fontSize: 10, color: 'var(--ds-textMuted)', transform: initialsSettingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>

                  {initialsSettingsOpen && (
                    <>
                      {/* Signer selector */}
                      {signers.length > 1 && (
                        <div className="rounded-lg p-2 mb-2" style={{ border: '1px solid var(--ds-borderLight)', background: 'var(--ds-bgSecondary)' }}>
                          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--ds-textMuted)' }}>
                            Select Signers ({selectedInitialSigners.size}/{signers.length})
                          </div>
                          <div className="text-[9px] mb-2" style={{ color: 'var(--ds-textMuted)' }}>
                            Choose who must initial every page. Only selected signers will be required to provide initials.
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {signers.map((s, i) => {
                              const selected = selectedInitialSigners.has(i)
                              const color = COLORS[i % COLORS.length]
                              return (
                                <div
                                  key={s.userId || s.email || i}
                                  className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer select-none transition-all"
                                  style={{
                                    background: selected ? `${color}15` : 'transparent',
                                    border: `1.5px solid ${selected ? color : 'var(--ds-border, #e2e8f0)'}`,
                                    opacity: selected ? 1 : 0.5,
                                  }}
                                  onClick={() => toggleSignerForInitials(i)}
                                >
                                  <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                                    style={{ background: selected ? color : 'var(--ds-textMuted, #94a3b8)' }}>
                                    {selected ? '✓' : i + 1}
                                  </div>
                                  <span className="text-[10px] font-medium truncate" style={{ color: 'var(--ds-text)' }}>{s.name?.split(' ')[0]}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Page selector */}
                      {pageHeights.length > 0 && (
                        <div className="overflow-y-auto rounded-lg p-2" style={{ maxHeight: 160, border: '1px solid var(--ds-borderLight)', background: 'var(--ds-bgSecondary)' }}>
                          <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5 sticky top-0 pb-1" style={{ color: 'var(--ds-textMuted)', background: 'var(--ds-bgSecondary)' }}>
                            Pages ({autoInitialPages.length}/{pageHeights.length})
                          </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: pageHeights.length }, (_, i) => i + 1).map((pg) => {
                      const included = !excludedPages.has(pg)
                      return (
                        <Tag
                          key={pg}
                          className="!cursor-pointer !select-none !text-[10px] !font-semibold !rounded-md !px-2 !py-0.5 !m-0"
                          style={{
                            background: included ? '#3b82f620' : '#f1f5f9',
                            color: included ? '#3b82f6' : '#94a3b8',
                            border: `1px solid ${included ? '#3b82f6' : '#e2e8f0'}`,
                          }}
                          onClick={() => togglePageExclusion(pg)}
                        >
                          {included ? '✓' : '✕'} Pg {pg}
                        </Tag>
                      )
                    })}
                  </div>
                          <div className="text-[9px] mt-1.5" style={{ color: 'var(--ds-textMuted)' }}>
                            Click a page to opt out / opt in
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Note for recipients */}
        {onNoteChange && (
          <>
            <Divider className="!my-0 !mt-2 !mb-2" />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ds-textMuted)' }}>
                Note <span className="font-normal normal-case" style={{ color: '#cbd5e1' }}>(optional)</span>
              </div>
              <Input.TextArea
                placeholder="This note will be visible to the receiver..."
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                rows={2}
                size="small"
                style={{ borderRadius: 6, fontSize: 12 }}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Document preview (scrolls independently) ── */}
      <div className="flex-1 min-w-0 overflow-y-auto relative" ref={docScrollRef} onScroll={handleDocScroll} style={{ background: 'var(--ds-bgSecondary, #e8eaed)' }}>
        {/* Instruction overlay */}
        {signers.length > 0 && (
          <div className="sticky top-2 z-10 flex justify-center pointer-events-none" style={{ marginBottom: -28, opacity: showInstruction ? 1 : 0, transition: 'opacity 0.3s ease' }}>
            <div className="text-[11px] font-medium px-3 py-1.5 rounded-full shadow-sm"
              style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', backdropFilter: 'blur(4px)' }}>
              Click on the document to place fields. Drag to reposition.
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-96 rounded-lg border border-slate-200 bg-slate-50">
            <Spin tip="Loading document..."><div /></Spin>
          </div>
        ) : (
          <div ref={previewRef}
            className={`relative rounded select-none mx-auto my-6 ${signers.length > 0 ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
            style={{ background: '#fff', maxWidth: '90%', boxShadow: '0 2px 8px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)' }}
            onClick={onDocClick}
            onMouseMove={handleDocMouseMove}
            onMouseLeave={handleDocMouseLeave}>

            {docImage ? (
              <img src={docImage} alt="Document" className="w-full h-auto block" onLoad={onImgLoad} draggable={false} />
            ) : (
              <div className="flex items-center justify-center h-96 text-slate-400">
                <div className="text-center">
                  <EditOutlined className="text-4xl text-slate-200" />
                  <div className="mt-3 text-sm">Upload a document</div>
                </div>
              </div>
            )}

            {/* Field overlays — draggable, with signer name + delete */}
            {docImage && tabs.filter((t) => t.placementMode === 'coordinate').map((tab) => {
              const ai = tabs.indexOf(tab)
              const c = tab._autoInitial ? '#3b82f6' : COLORS[tab.recipientIndex % COLORS.length]
              const f = FIELDS.find((x) => x.type === tab.type)
              const sel = editIdx === ai
              const isAuto = !!tab._autoInitial
              const signerName = recipients[tab.recipientIndex]?.name?.split(' ')[0] || ''
              const fieldLabel = isAuto
                ? 'Initial'
                : tab.type === 'signHere' ? 'Sign' : 'Init'
              return (
                <div key={ai}
                  className={`absolute flex flex-col items-center justify-center rounded group cursor-grab active:cursor-grabbing`}
                  style={{
                    ...getStyle(tab),
                    minHeight: isAuto ? undefined : 40,
                    background: '#fff',
                    border: `2px ${sel ? 'solid' : isAuto ? 'solid' : 'dashed'} ${c}`,
                    color: c,
                    zIndex: sel ? 10 : isAuto ? 2 : 1,
                    boxShadow: sel ? `0 0 0 3px ${c}25` : 'none',
                    transition: dragRef.current?.i === ai ? 'none' : 'box-shadow 0.15s',
                    // overflow is intentionally visible so the delete button,
                    // corner dots, and resize handle (all positioned outside
                    // the field bounds) aren't clipped. The inner label uses
                    // `truncate max-w-full` so its text still ellipsizes.
                    overflow: 'visible',
                    opacity: isAuto ? 0.9 : 1,
                    padding: 2,
                  }}
                  onMouseDown={(e) => onFieldDown(e, ai)}
                  onClick={(e) => e.stopPropagation()}>
                  {/* Corner dots (decorative) */}
                  {!isAuto && (
                    <>
                      <span className="absolute rounded-full" style={{ width: 6, height: 6, top: -3, left: -3, background: '#fff', border: `2px solid ${c}` }} />
                      <span className="absolute rounded-full" style={{ width: 6, height: 6, top: -3, right: -3, background: '#fff', border: `2px solid ${c}` }} />
                      <span className="absolute rounded-full" style={{ width: 6, height: 6, bottom: -3, left: -3, background: '#fff', border: `2px solid ${c}` }} />
                    </>
                  )}
                  {/* Label + icon stacked */}
                  <span className="text-[10px] font-bold leading-tight truncate max-w-full px-1" style={{ color: c }}>
                    {fieldLabel} · {signerName}{isAuto ? ` · Pg ${tab.pageNumber}` : ''}
                  </span>
                  {f?.icon && (
                    <span className="text-[14px] leading-none mt-0.5" style={{ color: c }}>
                      {f.icon}
                    </span>
                  )}
                  {/* Delete button */}
                  {!isAuto && (
                    <button
                      className="absolute -top-3 -right-3 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-20"
                      style={{ background: c, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); removeField(ai) }}>
                      ✕
                    </button>
                  )}
                  {/* Resize handle (bottom-right) */}
                  {!isAuto && (
                    <div
                      className="absolute opacity-0 group-hover:opacity-100 transition-opacity z-20"
                      style={{
                        right: -4,
                        bottom: -4,
                        width: 12,
                        height: 12,
                        background: '#fff',
                        border: `2px solid ${c}`,
                        borderRadius: 2,
                        cursor: 'nwse-resize',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                      }}
                      onMouseDown={(e) => onResizeDown(e, ai)}
                    />
                  )}
                </div>
              )
            })}

            {/* ── Click-to-place popover ── */}
            {popover && signers.length > 0 && (
              <>
                {/* Backdrop to close popover */}
                <div className="absolute inset-0 z-20" onClick={(e) => { e.stopPropagation(); setPopover(null) }} />

                {/* Crosshair marker */}
                <div className="absolute z-30 pointer-events-none" style={{ left: popover.x - 8, top: popover.y - 8 }}>
                  <div className="w-4 h-4 rounded-full border-2 border-orange-400 bg-orange-100/50" />
                </div>

                {/* Field type picker with signer selector */}
                <div
                  className="absolute z-30 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3"
                  style={{
                    left: Math.min(popover.x + 16, (previewRef.current?.clientWidth || 500) - 280),
                    top: popover.y - 24,
                    width: 260,
                  }}
                  onClick={(e) => e.stopPropagation()}>

                  {/* Signer selector — multi-select pills */}
                  {signers.length > 1 && (
                    <div className="pb-2 mb-2" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <div className="flex flex-wrap gap-1.5">
                        {signers.map((r, i) => {
                          const selected = selectedPopoverSigners.has(i)
                          return (
                            <button key={i} onClick={() => {
                              setSelectedPopoverSigners((prev) => {
                                const next = new Set(prev)
                                if (next.has(i)) next.delete(i)
                                else next.add(i)
                                return next
                              })
                            }}
                              className="text-[12px] font-semibold px-3 py-1 rounded-full transition-all"
                              style={{
                                background: selected ? COLORS[i % COLORS.length] : '#f1f5f9',
                                color: selected ? '#fff' : '#64748b',
                                opacity: selected ? 1 : 0.6,
                              }}>
                              {selected && '✓ '}{r.name?.split(' ')[0]}
                            </button>
                          )
                        })}
                      </div>
                      <div className="text-[10px] mt-1.5" style={{ color: '#94a3b8' }}>
                        {selectedPopoverSigners.size > 1
                          ? `Fields will be placed side by side for ${selectedPopoverSigners.size} signers`
                          : selectedPopoverSigners.size === 1
                          ? 'Click on signer names to select multiple users'
                          : 'Select at least one signer to place a field'}
                      </div>
                    </div>
                  )}


                  <div className="px-1 pt-0.5 pb-1">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      {selectedPopoverSigners.size === 0
                        ? 'Select signers above'
                        : selectedPopoverSigners.size === 1
                        ? `Place field for ${signers[[...selectedPopoverSigners][0]]?.name?.split(' ')[0]}`
                        : `Place field for ${selectedPopoverSigners.size} signers`}
                    </div>
                    {selectedPopoverSigners.size > 0 && (
                      <div className="text-[10px] mt-0.5 mb-1" style={{ color: '#64748b' }}>
                        Now choose a field type to place on the document
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {FIELDS.map((f) => (
                      <button key={f.type}
                        onClick={() => placeField(f.type)}
                        disabled={selectedPopoverSigners.size === 0}
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[14px] font-semibold transition-all hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        style={{ color: f.color }}>
                        <span className="text-base">{f.icon}</span>
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Initial on all pages — inside popover */}
                  {pageHeights.length > 1 && (
                    <button
                      onClick={() => {
                        // Select ALL signers for initials on all pages
                        const allSignerIdxs = new Set(signers.map((_, i) => i))
                        setSelectedInitialSigners(allSignerIdxs)
                        if (!initialsOnAllPages) {
                          // toggleInitialsOnAllPages selects all signers internally, but we override
                          toggleInitialsOnAllPages(true)
                        }
                        // Rebuild with all signers selected
                        const manualTabs = tabs.filter((t) => !t._autoInitial)
                        const autoTabs = buildAutoInitialTabs(excludedPages, allSignerIdxs)
                        onChange([...manualTabs, ...autoTabs])
                        setPopover(null)
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-medium transition-all hover:bg-blue-50"
                      style={{ color: '#3b82f6' }}>
                      <span className="text-lg"><FontSizeOutlined /></span>
                      Initial on all pages
                    </button>
                  )}

                  <div className="border-t border-slate-100 mt-1.5 pt-1.5">
                    <button onClick={() => setPopover(null)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-slate-400 hover:bg-slate-50 transition-all">
                      <CloseOutlined style={{ fontSize: 12 }} /> Cancel
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Hint banners */}
            {!popover && docImage && signers.length === 0 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-5 py-2 rounded-full pointer-events-none flex items-center gap-2">
                <UserAddOutlined /> Add signers from the left panel to place fields
              </div>
            )}
            {!popover && tabs.length === 0 && docImage && signers.length > 0 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-5 py-2 rounded-full pointer-events-none">
                Click anywhere on the document to place a field
              </div>
            )}

            {/* Cursor follower — shows armed signer (fast-place) or selected signers (manual) */}
            {cursorPos && signers.length > 0 && !popover && !dragRef.current && (() => {
              // In fast-place mode, read from placementIntent; otherwise from popover selection.
              const isFastPlace = placementMode === 'fastPlace'
              const armedSigner = isFastPlace && placementIntent
                ? recipients.find((r) => signerKey(r) === placementIntent.signerKey)
                : null
              const armedSignerIdx = armedSigner ? signers.indexOf(armedSigner) : -1

              let label
              let colorIdx = -1
              if (isFastPlace) {
                if (armedSigner) {
                  const firstName = armedSigner.name?.split(' ')[0] || 'signer'
                  const toolLabel = placementIntent.tool === 'signHere' ? 'Sign' : 'Initial'
                  label = `${toolLabel} · ${firstName}`
                  colorIdx = armedSignerIdx
                } else {
                  label = 'Pick a signer to arm'
                }
              } else if (selectedPopoverSigners.size === 0) {
                label = 'Click to place'
              } else if (selectedPopoverSigners.size === 1) {
                const idx = [...selectedPopoverSigners][0]
                label = signers[idx]?.name
                colorIdx = idx
              } else {
                label = `${selectedPopoverSigners.size} signers`
              }

              return (
                <div
                  className="absolute pointer-events-none z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-md whitespace-nowrap"
                  style={{
                    left: cursorPos.x + 16,
                    top: cursorPos.y - 12,
                    background: colorIdx >= 0 ? COLORS[colorIdx % COLORS.length] : '#64748b',
                    color: '#fff',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                  {label}
                </div>
              )
            })()}
          </div>
        )}

        {/* Page navigator — floating at bottom */}
        {totalPages > 1 && docImage && (
          <div
            className="sticky bottom-3 left-0 right-0 flex justify-center z-40"
            style={{ opacity: pageNavVisible ? 1 : 0, pointerEvents: pageNavVisible ? 'auto' : 'none', transition: 'opacity 0.3s ease' }}
            onMouseEnter={() => { setPageNavVisible(true); if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }}
            onMouseLeave={() => { hideTimerRef.current = setTimeout(() => setPageNavVisible(false), PAGE_NAV_HIDE_MS) }}
          >
            {pageNavMinimized ? (
              /* Minimized — just a small pill */
              <button
                onClick={() => setPageNavMinimized(false)}
                className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-slate-200 px-3 py-1.5 transition-all hover:shadow-xl"
                style={{ color: PRIMARY }}>
                <span className="text-[11px] font-bold">Page {currentPage}/{totalPages}</span>
                <span className="text-[9px] font-semibold" style={{ color: 'var(--ds-textMuted)' }}>Expand</span>
              </button>
            ) : (
              /* Expanded — full page navigator */
              <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-slate-200 px-3 py-2">
                <button
                  onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors disabled:opacity-30 hover:bg-slate-100"
                  style={{ color: 'var(--ds-textMuted)' }}>
                  ‹
                </button>

                <div className="flex items-center gap-0.5 px-1 overflow-x-auto" style={{ maxWidth: 420 }}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      onClick={() => scrollToPage(pg)}
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all hover:bg-slate-100"
                      style={{
                        background: currentPage === pg ? PRIMARY : 'transparent',
                        color: currentPage === pg ? '#fff' : 'var(--ds-textMuted)',
                      }}>
                      {pg}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => scrollToPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors disabled:opacity-30 hover:bg-slate-100"
                  style={{ color: 'var(--ds-textMuted)' }}>
                  ›
                </button>

                <div className="w-px h-5 mx-1" style={{ background: 'var(--ds-border)' }} />
                <span className="text-[10px] font-semibold px-1 whitespace-nowrap" style={{ color: PRIMARY }}>
                  {currentPage}/{totalPages}
                </span>

                {/* Minimize button */}
                <button
                  onClick={() => setPageNavMinimized(true)}
                  className="text-[9px] font-semibold px-2 py-1 rounded-full transition-colors hover:bg-slate-100 ml-0.5"
                  style={{ color: 'var(--ds-textMuted)' }}>
                  Wrap
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default DocumentFieldPlacer
