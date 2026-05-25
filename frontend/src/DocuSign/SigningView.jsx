/**
 * SigningView — Split-screen signing experience.
 * Left: document preview with live field overlays positioned exactly where admin placed them.
 * Right: field input form (one at a time with next/prev).
 */

import {
  CheckCircleFilled,
  CheckOutlined,
  FileTextOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Input,
  message,
  Progress,
  Result,
  Spin,
  Tag,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { fetchDocuSignEnvelopes, sendDocuSignEnvelope } from '../store/store'
import * as dsApi from './api'
import { loadPdfAsImage } from './dummyData'
import { getFileData } from '../_shims/uploadedFilesOnAWS'
import SignaturePad from '../SignaturePad'
import SavedSignaturePicker from './SavedSignaturePicker'

const { Title, Text } = Typography
const PRIMARY = '#E8930C'

const FIELD_LABELS = {
  signHere: 'Sign Here',
  initialHere: 'Initial Here',
  dateSigned: 'Date Signed',
  fullName: 'Full Name',
  email: 'Email Address',
  text: 'Text',
  checkbox: 'Checkbox',
}

const FIELD_COLORS = {
  signHere: '#E8930C',
  initialHere: '#3b82f6',
  email: '#06b6d4',
  dateSigned: '#10b981',
  fullName: '#8b5cf6',
  text: '#6b7280',
  checkbox: '#f59e0b',
}

/* ── Main SigningView ─────────────────────────────────────────────── */
const SigningView = () => {
  const { id: envelopeId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const recipientEmail = searchParams.get('recipient')
  const sendAfterSign = searchParams.get('sendAfterSign') === 'true'
  const { user } = useSelector((s) => s.auth)

  const [envelope, setEnvelope] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signingUrl, setSigningUrl] = useState(null)
  const [currentFieldIdx, setCurrentFieldIdx] = useState(0)
  const [fieldValues, setFieldValues] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [signingStarted, setSigningStarted] = useState(false) // false = review mode, true = signing mode
  const [useSignOnce, setUseSignOnce] = useState(false) // default: sign each page individually, user opts in to sign once

  // Saved signature mode
  const [signaturePickerOpen, setSignaturePickerOpen] = useState(false)
  const [selectedSavedSignature, setSelectedSavedSignature] = useState(null) // dataUrl
  const [selectedSavedInitial, setSelectedSavedInitial] = useState(null) // dataUrl
  const [useSavedMode, setUseSavedMode] = useState(false)
  const [justApplied, setJustApplied] = useState(null) // field._idx for pop animation

  // Document preview
  const [docImage, setDocImage] = useState(null)
  const [docLoadError, setDocLoadError] = useState(null)
  const [docNaturalSize, setDocNaturalSize] = useState({ w: 0, h: 0 })
  const [renderSize, setRenderSize] = useState({ w: 0, h: 0 })
  const previewRef = useRef(null)
  const imgRef = useRef(null)
  const scrollRef = useRef(null)
  const formScrollRef = useRef(null)
  const currentFieldCardRef = useRef(null)
  const signatureRef = useRef(null)
  const initialRef = useRef(null)
  const containerRef = useRef(null)
  const resizingRef = useRef(false)
  const [leftPanelPercent, setLeftPanelPercent] = useState(65)

  const currentEmail = recipientEmail || user?.email || ''

  // Load envelope from API
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await dsApi.getEnvelope(envelopeId)
        setEnvelope(data.data)
        if (data.data?.dsEnvelopeId && currentEmail) {
          try {
            const { data: u } = await dsApi.getSigningUrl(envelopeId, currentEmail)
            if (u.data?.signingUrl && u.data?.mode !== 'local') setSigningUrl(u.data.signingUrl)
          } catch {}
        }
      } catch { message.error('Failed to load document') }
      finally { setLoading(false) }
    }
    load()
  }, [envelopeId, currentEmail])

  // Load the uploaded PDF from the envelope. The envelope's document.fileUrl
  // may be an absolute backend URL (e.g. http://host/uploads/file-xxx.pdf) or
  // — in mock mode — a localStorage key. We rewrite backend URLs to
  // same-origin paths so the Vite dev proxy can bypass CORS on /uploads, then
  // resolve through getFileData for the localStorage case.
  useEffect(() => {
    if (!envelope) return
    let cancelled = false
    const load = async () => {
      setDocLoadError(null)
      const fileUrl = envelope.document?.fileUrl
      if (!fileUrl) {
        if (!cancelled) setDocLoadError('This envelope has no document attached.')
        return
      }

      // If fileUrl points at the backend origin, strip the origin so it
      // becomes a same-origin path (/uploads/...) routed through the Vite proxy.
      let rewritten = fileUrl
      try {
        const apiBase = import.meta.env.VITE_API_URL || ''
        const backendHost = apiBase ? new URL(apiBase).hostname : ''
        const parsed = new URL(fileUrl)
        if (backendHost && parsed.hostname === backendHost) {
          rewritten = parsed.pathname + parsed.search
        }
      } catch { /* not an absolute URL — leave as-is for getFileData */ }

      const resolved = await getFileData(rewritten)
      if (cancelled) return
      if (!resolved) {
        setDocLoadError('Unable to load the signed document.')
        return
      }
      try {
        const result = await loadPdfAsImage(resolved)
        if (cancelled) return
        if (result) {
          setDocImage(result.dataUrl)
          setDocNaturalSize({ w: result.width, h: result.height })
        } else {
          setDocLoadError('Failed to render the document.')
        }
      } catch (err) {
        console.error('[SigningView] PDF render failed:', err)
        if (!cancelled) setDocLoadError('Failed to render the document.')
      }
    }
    load()
    return () => { cancelled = true }
  }, [envelope])

  // Track rendered image size — this is what we use for positioning overlays
  const updateRenderSize = useCallback(() => {
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect()
      setRenderSize({ w: rect.width, h: rect.height })
    }
  }, [])

  const onImgLoad = useCallback(() => {
    if (imgRef.current) {
      setDocNaturalSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
      updateRenderSize()
    }
  }, [updateRenderSize])

  // Update render size on resize
  useEffect(() => {
    const fn = () => updateRenderSize()
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [updateRenderSize])

  // Recipient & fields
  const recipient = useMemo(() => {
    if (!envelope?.recipients) return null
    return envelope.recipients.find((r) => r.email === currentEmail) || envelope.recipients.find((r) => r.role === 'signer') || envelope.recipients[0]
  }, [envelope, currentEmail])

  const recipientIndex = useMemo(() => {
    if (!envelope?.recipients || !recipient) return -1
    return envelope.recipients.indexOf(recipient)
  }, [envelope, recipient])

  // Is this a read-only view? (envelope completed OR this recipient already signed)
  const isReadOnly = useMemo(() => {
    if (!envelope) return false
    if (envelope.status === 'completed') return true
    if (recipient?.status === 'signed' || recipient?.status === 'completed') return true
    return false
  }, [envelope, recipient])

  // ALL fields (for read-only view showing everyone's signatures)
  const allFields = useMemo(() => (envelope?.tabs || []).map((t, i) => ({ ...t, _idx: i })), [envelope])

  // "Initials on all pages" — sign once, apply to all
  // Detect from setting OR from _autoInitial flags on tabs
  const hasAutoInitialTabs = useMemo(() =>
    (envelope?.tabs || []).some((t) => t._autoInitial),
    [envelope],
  )
  const initialsOnAllPages = envelope?.settings?.initialsOnAllPages || hasAutoInitialTabs

  // My auto-initial field indices (all _autoInitial tabs for this recipient)
  // Fallback: if initialsOnAllPages is on but _autoInitial flags are missing (old data),
  // treat ALL initialHere fields for this recipient as auto-initials
  const myAutoInitialIdxs = useMemo(() => {
    if (!initialsOnAllPages) return []
    const mine = allFields.filter((t) => t.recipientIndex === recipientIndex)
    const flagged = mine.filter((t) => t._autoInitial)
    if (flagged.length > 0) return flagged.map((t) => t._idx)
    // Fallback: treat all initialHere fields as auto-initials when the setting is on
    const initials = mine.filter((t) => t.type === 'initialHere')
    return initials.length > 1 ? initials.map((t) => t._idx) : []
  }, [allFields, recipientIndex, initialsOnAllPages])

  // My fields only (for signing) — optionally collapse auto-initials into one representative field
  const myFields = useMemo(() => {
    const mine = allFields.filter((t) => t.recipientIndex === recipientIndex)
    if (!initialsOnAllPages || !useSignOnce || myAutoInitialIdxs.length === 0) return mine
    // Keep first auto-initial, skip the rest
    let keptFirst = false
    return mine.filter((f) => {
      if (!myAutoInitialIdxs.includes(f._idx)) return true
      if (!keptFirst) { keptFirst = true; return true }
      return false
    })
  }, [allFields, recipientIndex, initialsOnAllPages, useSignOnce, myAutoInitialIdxs])

  const requiredFields = useMemo(() => myFields.filter((f) => f.required), [myFields])
  const hasSignatureFields = useMemo(() => myFields.some((f) => f.type === 'signHere'), [myFields])
  const hasInitialFields = useMemo(() => myFields.some((f) => f.type === 'initialHere'), [myFields])
  const currentField = isReadOnly ? null : (myFields[currentFieldIdx] || null)
  const currentFieldTitle = useMemo(() => {
    if (!currentField) return ''
    return myAutoInitialIdxs.includes(currentField._idx) && initialsOnAllPages && useSignOnce
      ? 'Initial All Pages'
      : FIELD_LABELS[currentField.type]
  }, [currentField, myAutoInitialIdxs, initialsOnAllPages, useSignOnce])
  const currentFieldDescription = useMemo(() => {
    if (!currentField) return ''
    if (currentField.type === 'signHere') return 'Please sign by drawing your signature below.'
    if (currentField.type === 'initialHere') {
      return myAutoInitialIdxs.includes(currentField._idx) && initialsOnAllPages && useSignOnce
        ? `Draw your initials once. They will be applied to all ${myAutoInitialIdxs.length} pages.`
        : 'Please add your initials below.'
    }
    if (currentField.type === 'dateSigned') return 'Date will be applied automatically.'
    if (currentField.type === 'email') return 'Please confirm your email address.'
    if (currentField.type === 'fullName') return 'Type your full legal name.'
    if (currentField.type === 'text') return `Fill in: ${currentField.label || 'required field'}.`
    return ''
  }, [currentField, myAutoInitialIdxs, initialsOnAllPages, useSignOnce])

  // Pre-populate field values from saved tab.value (signatures saved by other signers)
  useEffect(() => {
    if (!envelope?.tabs) return
    const saved = {}
    envelope.tabs.forEach((tab, idx) => {
      if (tab.value) saved[idx] = tab.value
    })
    if (Object.keys(saved).length > 0) {
      setFieldValues((prev) => ({ ...saved, ...prev }))
    }
  }, [envelope])

  const isFieldDone = useCallback((f) => {
    const val = fieldValues[f._idx]
    if (f.type === 'signHere' || f.type === 'initialHere') return !!val
    if (f.type === 'dateSigned') return true
    return val && String(val).trim().length > 0
  }, [fieldValues])

  const getNextPendingFieldIdx = useCallback(() => {
    let nextIdx = myFields.findIndex((f) => f.required && !isFieldDone(f))
    if (nextIdx < 0) nextIdx = myFields.findIndex((f) => !isFieldDone(f))
    return nextIdx >= 0 ? nextIdx : 0
  }, [myFields, isFieldDone])

  const completedFieldCount = useMemo(() => myFields.filter(isFieldDone).length, [myFields, isFieldDone])
  const allRequiredComplete = useMemo(() => requiredFields.every(isFieldDone), [requiredFields, isFieldDone])
  const completionPercent = useMemo(() => {
    if (requiredFields.length === 0) return 100
    return Math.round((requiredFields.filter(isFieldDone).length / requiredFields.length) * 100)
  }, [requiredFields, isFieldDone])

  const handleFieldValue = useCallback((idx, val) => {
    setFieldValues((p) => {
      const updated = { ...p, [idx]: val }
      // If using sign-once mode, apply to all auto-initial fields
      if (initialsOnAllPages && useSignOnce && myAutoInitialIdxs.includes(idx)) {
        myAutoInitialIdxs.forEach((i) => { updated[i] = val })
      }
      return updated
    })
  }, [initialsOnAllPages, useSignOnce, myAutoInitialIdxs])

  const isLastField = currentFieldIdx >= myFields.length - 1
  const canFinish = isLastField && allRequiredComplete
  const goNext = () => {
    if (!isLastField) {
      setCurrentFieldIdx(currentFieldIdx + 1)
    } else {
      // Loop back to first incomplete field
      const firstIncomplete = myFields.findIndex((f) => f.required && !isFieldDone(f))
      if (firstIncomplete >= 0) setCurrentFieldIdx(firstIncomplete)
    }
  }
  const goPrev = () => { if (currentFieldIdx > 0) setCurrentFieldIdx(currentFieldIdx - 1) }

  const handleSubmit = async () => {
    if (!allRequiredComplete) {
      // Find first incomplete required field and navigate to it
      const firstIncomplete = myFields.findIndex((f) => f.required && !isFieldDone(f))
      if (firstIncomplete >= 0) {
        setCurrentFieldIdx(firstIncomplete)
        message.warning(`Please complete the "${FIELD_LABELS[myFields[firstIncomplete]?.type] || 'field'}" field`)
      } else {
        message.warning('Complete all required fields')
      }
      return
    }
    setSubmitting(true)
    try {
      // Build signed field values to save — include all auto-initial fields (not just the visible one)
      const visibleFields = myFields.map((f) => ({
        tabIndex: f._idx,
        type: f.type,
        value: fieldValues[f._idx] || (f.type === 'dateSigned' ? dayjs().format('MMMM DD, YYYY') : ''),
      }))
      // Add hidden auto-initial fields that were auto-filled (only in sign-once mode)
      const hiddenAutoInitials = (useSignOnce ? myAutoInitialIdxs : [])
        .filter((idx) => !myFields.some((f) => f._idx === idx))
        .map((idx) => ({
          tabIndex: idx,
          type: 'initialHere',
          value: fieldValues[idx] || '',
        }))
      const signedFields = [...visibleFields, ...hiddenAutoInitials]

      await dsApi.updateRecipientStatus(envelopeId, {
        recipientEmail: currentEmail,
        status: 'signed',
        signedFields,
      })

      // If admin signed before sending → now send the envelope
      if (sendAfterSign) {
        await dispatch(sendDocuSignEnvelope({ id: envelopeId, documentBase64: '' })).unwrap()
        setCompleted(true)
        message.success('Signed & sent to recipients!')
      } else {
        setCompleted(true)
        message.success('Document signed successfully!')
      }

      // Refresh envelope list so admin panel shows updated status (e.g. completed)
      dispatch(fetchDocuSignEnvelopes())
    } catch { message.error('Failed to submit') }
    finally { setSubmitting(false) }
  }

  // Resizable panel drag handler
  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    resizingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent) => {
      if (!resizingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = moveEvent.clientX - rect.left
      const percent = Math.min(Math.max((x / rect.width) * 100, 30), 80)
      setLeftPanelPercent(percent)
      // Update field overlay positions during drag
      requestAnimationFrame(updateRenderSize)
    }

    const onMouseUp = () => {
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      // Recalculate render size after resize
      setTimeout(updateRenderSize, 50)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [updateRenderSize])

  // Position a field overlay using the RENDERED image size
  const getFieldStyle = useCallback((tab) => {
    if (!renderSize.w || !docNaturalSize.w) return { display: 'none' }
    const scaleX = renderSize.w / docNaturalSize.w
    const scaleY = renderSize.h / docNaturalSize.h
    return {
      left: tab.xPosition * scaleX,
      top: tab.yPosition * scaleY,
      width: tab.width * scaleX,
      height: tab.height * scaleY,
    }
  }, [renderSize, docNaturalSize])

  // Scroll the document so a given field is roughly centered in the viewport.
  // Used by the START ribbon click and by the auto-scroll effect below.
  const scrollToField = useCallback((field) => {
    if (!field || !renderSize.w || !docNaturalSize.w || !scrollRef.current) return
    const scaleY = renderSize.h / docNaturalSize.h
    const fieldTop = field.yPosition * scaleY
    const container = scrollRef.current
    const containerHeight = container.clientHeight
    const scrollTarget = fieldTop - containerHeight / 3
    container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' })
  }, [renderSize, docNaturalSize])

  const beginSigningAtField = useCallback(() => {
    const nextIdx = getNextPendingFieldIdx()
    const nextField = myFields[nextIdx] || null
    setSigningStarted(true)
    setCurrentFieldIdx(nextIdx)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (nextField) scrollToField(nextField)
        currentFieldCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      })
    })
  }, [getNextPendingFieldIdx, myFields, scrollToField])

  // Callback from SavedSignaturePicker
  const handleSignatureChoice = useCallback(({ signature, initial, mode }) => {
    setSelectedSavedSignature(signature)
    setSelectedSavedInitial(initial)
    setUseSavedMode(mode === 'saved')
    setSignaturePickerOpen(false)
    beginSigningAtField()
  }, [beginSigningAtField])

  // Auto-scroll to current field when it changes — but only after signing has
  // started. In the pre-start (review) state we keep the document at the top
  // so the START ribbon is visible.
  useEffect(() => {
    if (!signingStarted) return
    scrollToField(currentField)
    currentFieldCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [currentFieldIdx, currentField, scrollToField, signingStarted])

  // ── States ──
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-gray-50"><Spin size="large" /></div>

  if (signingUrl) return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-2">
        <FileTextOutlined style={{ color: PRIMARY }} />
        <Text strong>{envelope?.title}</Text>
      </div>
      <iframe src={signingUrl} className="w-full border-none" style={{ height: 'calc(100vh - 56px)' }} title="DocuSign" />
    </div>
  )

  if (completed) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="!rounded-2xl max-w-md w-full text-center" styles={{ body: { padding: 40 } }}>
        <Result icon={<CheckCircleFilled style={{ color: '#22c55e', fontSize: 64 }} />}
          title="Signing Complete"
          subTitle={`You have completed signing "${envelope?.title}". All parties will receive a completed copy via email.`}
          extra={<Button type="primary" onClick={() => navigate('/settings/dealmemo/home')} style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 8 }}>Back to Home</Button>} />
      </Card>
    </div>
  )

  if (!recipient) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="!rounded-2xl max-w-md w-full text-center" styles={{ body: { padding: 40 } }}>
        <Result status="warning" title="Recipient Not Found" subTitle="You don't appear to be a signer on this document."
          extra={<Button onClick={() => navigate('/settings/dealmemo/home')}>Back to Home</Button>} />
      </Card>
    </div>
  )

  // ── Read-only view (completed or already signed) ──
  if (isReadOnly) {
    return (
      <div className="flex flex-col bg-gray-50" style={{ height: '100vh' }}>
        {/* Top bar */}
        <div className="bg-white border-b px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => navigate(-1)} />
            <div>
              <div className="text-sm font-bold text-slate-800">{envelope?.title}</div>
              <div className="text-[11px] text-green-600 flex items-center gap-1">
                <CheckCircleFilled /> {envelope?.status === 'completed' ? 'Completed — All parties have signed' : 'You have signed this document'}
              </div>
            </div>
          </div>
          <Button onClick={() => navigate('/settings/dealmemo/home')} style={{ borderRadius: 8 }}>Back to Home</Button>
        </div>

        {/* Full-width document with all signatures */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 bg-slate-100">
          <div ref={previewRef} className="relative mx-auto" style={{ maxWidth: 900 }}>
            {docImage ? (
              <>
                <img ref={imgRef} src={docImage} alt="Document" className="w-full h-auto block rounded-lg border border-slate-200 shadow-sm" onLoad={onImgLoad} draggable={false} />

                {/* Show ALL fields from ALL recipients with saved values */}
                {allFields.filter((t) => t.placementMode === 'coordinate').map((field) => {
                  const color = FIELD_COLORS[field.type] || '#E8930C'
                  const val = fieldValues[field._idx] || field.value
                  const recipientName = envelope?.recipients?.[field.recipientIndex]?.name || ''
                  const style = getFieldStyle(field)

                  // Expand signature/initial fields so they're clearly visible
                  const isSignField = (field.type === 'signHere' || field.type === 'initialHere') && val
                  const expandedStyle = isSignField ? {
                    ...style,
                    height: Math.max(style.height || 0, field.type === 'signHere' ? 60 : 40),
                    width: Math.max(style.width || 0, field.type === 'signHere' ? 180 : 100),
                  } : style

                  // Clean view: signed fields have no border/background, unsigned fields show placeholder
                  return (
                    <div key={field._idx}
                      className="absolute flex items-center justify-center"
                      style={{
                        ...expandedStyle,
                        background: val ? 'transparent' : `${color}08`,
                        border: val ? 'none' : `1.5px dashed ${color}40`,
                        borderRadius: val ? 0 : 4,
                        overflow: 'visible',
                        zIndex: val ? 5 : 1,
                      }}>
                      {(field.type === 'signHere' || field.type === 'initialHere') && val ? (
                        <img src={val} alt={`${recipientName}'s ${field.type === 'signHere' ? 'signature' : 'initials'}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      ) : field.type === 'email' && val ? (
                        <span className="text-[9px] font-medium truncate px-1" style={{ color: '#1a1a1a' }}>{val}</span>
                      ) : field.type === 'dateSigned' ? (
                        <span className="text-[9px] font-medium" style={{ color: '#1a1a1a' }}>{val || dayjs().format('MM/DD/YY')}</span>
                      ) : val ? (
                        <span className="text-[9px] font-medium truncate px-1" style={{ color: '#1a1a1a' }}>{val}</span>
                      ) : (
                        <span className="text-[8px] opacity-40" style={{ color }}>
                          {FIELD_LABELS[field.type]} ({recipientName})
                        </span>
                      )}
                    </div>
                  )
                })}
              </>
            ) : (
              <div className="h-96 flex items-center justify-center rounded-lg border border-slate-200 bg-white px-6 text-center">
                {docLoadError ? (
                  <div>
                    <FileTextOutlined style={{ fontSize: 40, color: '#cbd5e1' }} />
                    <div className="mt-3 text-sm font-semibold text-slate-600">{docLoadError}</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Try re-opening this envelope from the dashboard.
                    </div>
                  </div>
                ) : (
                  <Spin tip="Loading document..." />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Split-screen signing ──
  return (
    <div className="flex flex-col bg-gray-50" style={{ height: '100vh' }}>
      {/* Top bar */}
      <div className="bg-white border-b px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => navigate(-1)} />
          <div>
            <div className="text-sm font-bold text-slate-800">{envelope?.title}</div>
            <div className="text-[11px] text-slate-400">Signing as {recipient.name}</div>
          </div>
          {envelope?.description && (
            <div className="ml-4 px-3 py-1 rounded-md text-[11px] italic max-w-sm truncate" style={{ background: '#FFF7ED', color: '#92400e', border: `1px solid ${PRIMARY}20` }}>
              "{envelope.description}"
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Progress type="circle" percent={completionPercent} size={32} strokeColor={PRIMARY}
            format={(p) => <span className="text-[9px] font-bold">{p}%</span>} />
        </div>
      </div>

      {/* Scoped keyframes for the START / Next ribbons and Finish CTA */}
      <style>{`
        @keyframes ddsStartEntrance {
          0% { opacity: 0; transform: translateX(60px); }
          60% { opacity: 1; transform: translateX(-4px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes ddsStartPulse {
          0%, 100% { filter: drop-shadow(0 6px 14px rgba(234, 179, 8, 0.5)); }
          50% { filter: drop-shadow(0 12px 26px rgba(234, 179, 8, 0.78)); }
        }
        @keyframes ddsNextEntrance {
          0% { opacity: 0; transform: translateX(-18px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes ddsFinishEntrance {
          0%   { opacity: 0; transform: translateY(18px) scale(0.94); }
          60%  { opacity: 1; transform: translateY(-3px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dsApplyPop {
          0% { transform: scale(1); box-shadow: none; }
          30% { transform: scale(1.08); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.35); }
          100% { transform: scale(1); box-shadow: none; }
        }
        @keyframes dsTapPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes dsFadeOut {
          0% { opacity: 1; transform: translateX(-50%) translateY(0); }
          70% { opacity: 1; }
          100% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        }
        @keyframes ddsFinishPulse {
          0%, 100% {
            filter: drop-shadow(0 4px 14px rgba(232, 147, 12, 0.4));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 10px 26px rgba(232, 147, 12, 0.75));
            transform: scale(1.015);
          }
        }
      `}</style>

      {/* Split content — resizable panels */}
      <div ref={containerRef} className="flex flex-1 min-h-0">
        {/* Left: Document preview */}
        <div ref={scrollRef} className="overflow-auto p-4 bg-slate-100"
          style={{ width: `${leftPanelPercent}%`, transition: resizingRef.current ? 'none' : 'width 0.3s' }}>

          {/* ── Sticky START ribbon (pre-start only) ──
              Sits in a zero-height sticky wrapper so it pins to the top of the
              scroll container without taking layout space or blocking clicks
              on the document beneath. Compact so it doesn't cover doc content. */}
          {!signingStarted && !signaturePickerOpen && (() => {
            let nextIdx = myFields.findIndex((f) => f.required && !isFieldDone(f))
            if (nextIdx < 0) nextIdx = myFields.findIndex((f) => !isFieldDone(f))
            if (nextIdx < 0) return null
            const nextField = myFields[nextIdx]
            if (!nextField || nextField.placementMode !== 'coordinate') return null

            const BTN_H = 36
            const BTN_W = 132
            const POINT = 14
            const clipPath = `polygon(${POINT}px 0, ${BTN_W}px 0, ${BTN_W}px ${BTN_H}px, ${POINT}px ${BTN_H}px, 0 ${BTN_H / 2}px)`

            const handleStart = () => {
              if (hasSignatureFields || hasInitialFields) {
                setSignaturePickerOpen(true)
              } else {
                beginSigningAtField()
              }
            }

            return (
              <div className="pointer-events-none" style={{ position: 'sticky', top: 0, height: 0, zIndex: 30 }}>
                <div className="relative mx-auto" style={{ maxWidth: 800, height: 0 }}>
                  <button
                    onClick={handleStart}
                    className="flex items-center justify-center transition-transform hover:scale-[1.04]"
                    style={{
                      position: 'absolute',
                      top: 12,
                      // 70% of the ribbon overlaps the doc, 30% bleeds out right
                      left: `calc(100% - ${BTN_W * 0.7}px)`,
                      width: BTN_W,
                      height: BTN_H,
                      background: 'linear-gradient(180deg, #FDE047 0%, #FACC15 50%, #EAB308 100%)',
                      color: '#0f172a',
                      fontWeight: 900,
                      fontSize: 13,
                      letterSpacing: 1.4,
                      textTransform: 'uppercase',
                      border: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      gap: 6,
                      paddingLeft: POINT + 8,
                      paddingRight: 16,
                      flexDirection: 'row-reverse',
                      clipPath,
                      WebkitClipPath: clipPath,
                      pointerEvents: 'auto',
                      animation: 'ddsStartEntrance 0.55s cubic-bezier(0.2, 0.85, 0.2, 1) both, ddsStartPulse 2.4s ease-in-out 0.6s infinite',
                    }}
                    title="Click to start signing"
                  >
                    START
                    <LeftOutlined style={{ fontSize: 12 }} />
                  </button>
                </div>
              </div>
            )
          })()}

          {/* This wrapper is position:relative and sized exactly to the image */}
          <div ref={previewRef} className="relative mx-auto" style={{ maxWidth: 800 }}>
            {docImage ? (
              <>
                <img
                  ref={imgRef}
                  src={docImage}
                  alt="Document"
                  className="w-full h-auto block rounded-lg border border-slate-200 shadow-sm"
                  onLoad={onImgLoad}
                  draggable={false}
                />

                {/* Field overlays — positioned relative to the image (include hidden auto-initials in sign-once mode) */}
                {(() => {
                  const hiddenAutoFields = initialsOnAllPages && useSignOnce
                    ? allFields.filter((f) => f._autoInitial && f.recipientIndex === recipientIndex && !myFields.some((m) => m._idx === f._idx))
                    : []
                  return [...myFields, ...hiddenAutoFields]
                })().filter((t) => t.placementMode === 'coordinate').map((field) => {
                  const color = FIELD_COLORS[field.type] || '#E8930C'
                  const isCurrent = myFields[currentFieldIdx]?._idx === field._idx
                  const done = isFieldDone(field)
                  const val = fieldValues[field._idx]
                  const style = getFieldStyle(field)

                  if (style.display === 'none') return null

                  // Expand signature/initial fields when they have a value so the image is visible
                  const isSignField = (field.type === 'signHere' || field.type === 'initialHere') && val
                  const expandedStyle = isSignField ? {
                    ...style,
                    height: Math.max(style.height || 0, field.type === 'signHere' ? 50 : 35),
                    width: Math.max(style.width || 0, field.type === 'signHere' ? 160 : 80),
                  } : style

                  return (
                    <div key={field._idx}
                      className="absolute rounded cursor-pointer transition-all"
                      style={{
                        ...expandedStyle,
                        background: done ? `${color}10` : isCurrent ? `${color}25` : `${color}08`,
                        border: `2px ${isCurrent ? 'solid' : done ? 'solid' : 'dashed'} ${color}`,
                        boxShadow: isCurrent ? `0 0 0 4px ${color}30, 0 2px 8px ${color}20` : 'none',
                        overflow: 'visible',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: isCurrent ? 10 : done ? 5 : 1,
                        animation: justApplied === field._idx ? 'dsApplyPop 0.5s ease' : (useSavedMode && !done && (field.type === 'signHere' || field.type === 'initialHere') ? 'dsTapPulse 2s ease infinite' : 'none'),
                        cursor: useSavedMode && !done && (field.type === 'signHere' || field.type === 'initialHere') ? 'pointer' : undefined,
                      }}
                      onClick={() => {
                        const idx = myFields.findIndex((f) => f._idx === field._idx)
                        if (idx < 0) return
                        // Tap-to-apply in saved mode
                        if (useSavedMode && !fieldValues[field._idx]) {
                          const applyAndAdvance = (value) => {
                            handleFieldValue(field._idx, value)
                            setJustApplied(field._idx)
                            setTimeout(() => setJustApplied(null), 800)
                            setCurrentFieldIdx(idx)
                            // Auto-advance to next unsigned field after brief animation
                            const appliedIdx = field._idx
                            setTimeout(() => {
                              const nextUnsigned = myFields.findIndex((f, i) =>
                                i > idx && f._idx !== appliedIdx && !fieldValues[f._idx] && f.required
                              )
                              const nextAny = nextUnsigned >= 0 ? nextUnsigned : myFields.findIndex((f, i) =>
                                i > idx && f._idx !== appliedIdx && !fieldValues[f._idx]
                              )
                              if (nextAny >= 0) {
                                setCurrentFieldIdx(nextAny)
                                scrollToField(myFields[nextAny])
                              }
                            }, 600)
                          }
                          if (field.type === 'signHere' && selectedSavedSignature) {
                            applyAndAdvance(selectedSavedSignature)
                            return
                          }
                          if (field.type === 'initialHere' && selectedSavedInitial) {
                            applyAndAdvance(selectedSavedInitial)
                            return
                          }
                        }
                        setCurrentFieldIdx(idx)
                      }}>

                      {/* Show live value */}
                      {(field.type === 'signHere' || field.type === 'initialHere') && val ? (
                        <img src={val} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      ) : field.type === 'email' && val ? (
                        <span className="text-[8px] font-medium truncate px-1" style={{ color }}>{val}</span>
                      ) : field.type === 'dateSigned' ? (
                        <span className="text-[8px] font-medium" style={{ color }}>{dayjs().format('MM/DD/YY')}</span>
                      ) : done && val ? (
                        <span className="text-[8px] font-medium truncate px-1" style={{ color }}>{val}</span>
                      ) : useSavedMode && field.type === 'signHere' && selectedSavedSignature ? (
                        <>
                          <img src={selectedSavedSignature} alt="" className="absolute" style={{ maxWidth: '85%', maxHeight: '70%', objectFit: 'contain', opacity: 0.2 }} />
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full z-10" style={{ background: `${color}25`, color, border: `1px solid ${color}50` }}>SIGN HERE</span>
                        </>
                      ) : useSavedMode && field.type === 'initialHere' && selectedSavedInitial ? (
                        <>
                          <img src={selectedSavedInitial} alt="" className="absolute" style={{ maxWidth: '85%', maxHeight: '70%', objectFit: 'contain', opacity: 0.2 }} />
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full z-10" style={{ background: `${color}25`, color, border: `1px solid ${color}50` }}>INITIAL HERE</span>
                        </>
                      ) : (
                        <span className="text-[8px] font-semibold opacity-50" style={{ color }}>
                          {FIELD_LABELS[field.type]}
                        </span>
                      )}

                      {/* Applied! badge (tap-to-apply feedback) */}
                      {justApplied === field._idx && (
                        <div className="absolute -top-5 left-1/2 text-[9px] font-bold text-white px-2 py-0.5 rounded-full whitespace-nowrap pointer-events-none"
                          style={{ background: '#22c55e', animation: 'dsFadeOut 0.8s ease forwards', transform: 'translateX(-50%)' }}>
                          Applied!
                        </div>
                      )}

                      {/* Done checkmark */}
                      {done && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: color }}>
                          <CheckOutlined style={{ color: '#fff', fontSize: 8 }} />
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* ── Inline "Next" ribbon (post-start only) ──
                    Normally sits to the left of the next incomplete field, but
                    flips to the right side if the field is too close to the
                    doc's left edge (so it doesn't get clipped). Label reflects
                    the field type ("Sign Here", "Initial Here", ...). Scrolls
                    with the document so it always points at its field. */}
                {signingStarted && (() => {
                  let nextIdx = myFields.findIndex((f) => f.required && !isFieldDone(f))
                  if (nextIdx < 0) nextIdx = myFields.findIndex((f) => !isFieldDone(f))
                  if (nextIdx < 0) return null

                  const nextField = myFields[nextIdx]
                  if (nextField.placementMode !== 'coordinate') return null
                  const style = getFieldStyle(nextField)
                  if (style.display === 'none') return null

                  const isAutoInitialSignOnce =
                    myAutoInitialIdxs.includes(nextField._idx) && initialsOnAllPages && useSignOnce
                  const label = isAutoInitialSignOnce
                    ? 'Initial All Pages'
                    : useSavedMode && nextField.type === 'signHere' ? 'Sign Here'
                    : useSavedMode && nextField.type === 'initialHere' ? 'Initial Here'
                    : (FIELD_LABELS[nextField.type] || 'Next')

                  const BTN_H = 32
                  const BTN_W = Math.max(104, label.length * 8 + 42)
                  const POINT = 14
                  const top = (style.top || 0) + (style.height || 0) / 2 - BTN_H / 2

                  // Try the default left position. If it would clip past the
                  // doc's left edge, flip to the right side of the field and
                  // reverse the arrow direction so it still points at the field.
                  const GAP = 8
                  const leftIfLeftSide = (style.left || 0) - BTN_W - GAP
                  const flipToRight = leftIfLeftSide < 0
                  const left = flipToRight
                    ? (style.left || 0) + (style.width || 0) + GAP
                    : leftIfLeftSide

                  // Flag shape: point on the edge closest to the field.
                  // - Not flipped (left-of-field): point on the right edge, chevron on right.
                  // - Flipped (right-of-field):   point on the left edge,  chevron on left.
                  const clipPath = flipToRight
                    ? `polygon(${POINT}px 0, ${BTN_W}px 0, ${BTN_W}px ${BTN_H}px, ${POINT}px ${BTN_H}px, 0 ${BTN_H / 2}px)`
                    : `polygon(0 0, ${BTN_W - POINT}px 0, ${BTN_W}px ${BTN_H / 2}px, ${BTN_W - POINT}px ${BTN_H}px, 0 ${BTN_H}px)`

                  const handleClick = () => {
                    setCurrentFieldIdx(nextIdx)
                    requestAnimationFrame(() => scrollToField(nextField))
                  }

                  return (
                    <button
                      key={`next-${nextIdx}`}
                      onClick={handleClick}
                      className="absolute flex items-center justify-center transition-transform hover:scale-[1.04]"
                      style={{
                        top,
                        left,
                        width: BTN_W,
                        height: BTN_H,
                        background: 'linear-gradient(180deg, #FDE047 0%, #FACC15 50%, #EAB308 100%)',
                        color: '#0f172a',
                        fontWeight: 900,
                        fontSize: 12,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        border: 'none',
                        cursor: 'pointer',
                        zIndex: 20,
                        whiteSpace: 'nowrap',
                        gap: 6,
                        // Inset text away from whichever edge carries the arrow point
                        paddingLeft: flipToRight ? POINT + 6 : 14,
                        paddingRight: flipToRight ? 14 : POINT + 6,
                        flexDirection: flipToRight ? 'row-reverse' : 'row',
                        clipPath,
                        WebkitClipPath: clipPath,
                        filter: 'drop-shadow(0 4px 10px rgba(234, 179, 8, 0.45))',
                        animation: 'ddsNextEntrance 0.35s ease-out both',
                      }}
                      title={`Click to go to ${label}`}
                    >
                      {label}
                      {flipToRight ? (
                        <LeftOutlined style={{ fontSize: 11 }} />
                      ) : (
                        <RightOutlined style={{ fontSize: 11 }} />
                      )}
                    </button>
                  )
                })()}
              </>
            ) : (
              <div className="h-96 flex items-center justify-center rounded-lg border border-slate-200 bg-white px-6 text-center">
                {docLoadError ? (
                  <div>
                    <FileTextOutlined style={{ fontSize: 40, color: '#cbd5e1' }} />
                    <div className="mt-3 text-sm font-semibold text-slate-600">{docLoadError}</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Try re-opening this envelope from the dashboard.
                    </div>
                  </div>
                ) : (
                  <Spin tip="Loading document..." />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drag handle */}
        <div
          className="flex-shrink-0 flex items-center justify-center cursor-col-resize group hover:bg-orange-50 transition-colors"
          style={{ width: 8 }}
          onMouseDown={handleResizeStart}
        >
          <div className="w-1 h-8 rounded-full bg-slate-200 group-hover:bg-orange-400 transition-colors" />
        </div>

        {/* Right: Signing form */}
        <div className="bg-white flex flex-col min-w-0 overflow-hidden"
          style={{ width: `${100 - leftPanelPercent}%`, transition: resizingRef.current ? 'none' : 'width 0.3s' }}>

          {!signingStarted ? (
            /* ── Landing state: Review document first ── */
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: `${PRIMARY}15` }}>
                <FileTextOutlined style={{ fontSize: 28, color: PRIMARY }} />
              </div>
              <div className="text-lg font-bold mb-2" style={{ color: 'var(--ds-text, #1a1a1a)' }}>Review Document</div>
              <div className="text-sm mb-1" style={{ color: '#64748b' }}>
                Please review the document on the left before signing.
              </div>
              <div className="text-xs mb-6" style={{ color: '#94a3b8' }}>
                You have <strong style={{ color: PRIMARY }}>{myFields.length} field{myFields.length !== 1 ? 's' : ''}</strong> to complete
              </div>

              <div className="w-full max-w-xs rounded-lg p-3 mb-5" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>Required Fields</div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {myFields.map((f, i) => {
                    const color = FIELD_COLORS[f.type] || PRIMARY
                    return (
                      <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                        {myAutoInitialIdxs.includes(f._idx) && initialsOnAllPages && useSignOnce
                          ? `Initial All Pages (${myAutoInitialIdxs.length})`
                          : FIELD_LABELS[f.type]}
                      </span>
                    )
                  })}
                </div>
              </div>

              <Button
                type="primary"
                size="large"
                onClick={() => { if (hasSignatureFields || hasInitialFields) setSignaturePickerOpen(true); else beginSigningAtField() }}
                style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 10, height: 44, paddingInline: 32, fontWeight: 600, fontSize: 15 }}>
                Start Signing
              </Button>
              <div className="text-[10px] mt-2" style={{ color: '#cbd5e1' }}>
                After reviewing, click to begin the signing process
              </div>
            </div>
          ) : (
            /* ── Signing mode ── */
            <>
          {/* Field tabs */}
          <div className="border-b border-slate-200 bg-white px-4 pt-4 pb-3">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  Required Fields ({completedFieldCount}/{myFields.length})
                </div>
                <div className="text-[11px] font-medium text-slate-400">
                  Tap a chip to jump
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
              {myFields.map((f, i) => {
                const done = isFieldDone(f)
                const isCurrent = i === currentFieldIdx
                const color = FIELD_COLORS[f.type] || PRIMARY
                return (
                  <button key={i} onClick={() => setCurrentFieldIdx(i)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold leading-none transition-all"
                    style={{
                      background: isCurrent ? `${color}15` : done ? '#f0fdf4' : '#f9fafb',
                      border: `1.5px solid ${isCurrent ? color : done ? '#22c55e' : '#e5e7eb'}`,
                      color: isCurrent ? color : done ? '#22c55e' : '#6b7280',
                    }}>
                    {done ? <CheckCircleFilled style={{ fontSize: 10 }} /> : <span className="text-[10px]">{i + 1}</span>}
                    {myAutoInitialIdxs.includes(f._idx) && initialsOnAllPages && useSignOnce ? `Initial All Pages (${myAutoInitialIdxs.length})` : FIELD_LABELS[f.type]}
                  </button>
                )
              })}
              </div>
            </div>
          </div>

          {/* Current field form */}
          <div ref={formScrollRef} className="flex-1 overflow-auto bg-slate-50/60 px-4 py-4">
            {currentField ? (
              <div ref={currentFieldCardRef} className="mx-auto w-full max-w-[520px]">
                <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
                  <div className="border-b border-slate-100 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Tag color="orange" className="!mb-0 !rounded-full !px-3 !py-1 !text-[10px] !font-bold uppercase tracking-wide">
                            {currentField.required ? 'Required' : 'Optional'}
                          </Tag>
                          <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                            {currentFieldIdx + 1} of {myFields.length}
                          </div>
                        </div>
                        <Title level={4} className="!mb-1.5 !text-slate-800">
                          {currentFieldTitle}
                        </Title>
                        <Text className="block max-w-[420px] text-[15px] leading-6 text-slate-500">
                          {currentFieldDescription}
                        </Text>
                      </div>
                    </div>

                    {initialsOnAllPages && myAutoInitialIdxs.includes(currentField._idx) && (
                      <label className="mt-3 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useSignOnce}
                          onChange={(e) => setUseSignOnce(e.target.checked)}
                          className="mt-1 rounded"
                          style={{ accentColor: PRIMARY, width: 16, height: 16 }}
                        />
                        <span className="text-sm font-medium leading-6 text-slate-600">
                          Apply same initials to all pages
                        </span>
                      </label>
                    )}
                  </div>

                  <div className="px-4 py-4">
                    {currentField.type === 'signHere' && (
                      useSavedMode && selectedSavedSignature ? (
                        <div className="space-y-3">
                          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Your signature</div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-center" style={{ minHeight: 80 }}>
                              <img src={selectedSavedSignature} alt="Signature" style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain' }} />
                            </div>
                          </div>
                          {fieldValues[currentField._idx] ? (
                            <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <CheckCircleFilled style={{ color: '#22c55e', fontSize: 20 }} />
                                <div>
                                  <div className="text-sm font-semibold text-emerald-700">Signature Applied</div>
                                  <div className="text-[11px] text-emerald-600">This field has been signed</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-[18px] border px-4 py-3" style={{ borderColor: `${PRIMARY}40`, background: `${PRIMARY}08` }}>
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${PRIMARY}20` }}>
                                  <span className="text-base">👆</span>
                                </div>
                                <div>
                                  <div className="text-sm font-semibold" style={{ color: PRIMARY }}>Sign Here</div>
                                  <div className="text-[11px]" style={{ color: 'var(--ds-textSecondary, #64748b)' }}>Click the highlighted sign field on the document to apply your signature</div>
                                </div>
                              </div>
                            </div>
                          )}
                          {fieldValues[currentField._idx] && (
                            <div className="flex justify-end">
                              <Button size="small" onClick={() => handleFieldValue(currentField._idx, null)} style={{ borderRadius: 8, fontSize: 12 }}>
                                Clear & Re-apply
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : fieldValues[currentField._idx] ? (
                        <div className="space-y-3">
                          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Your signature</div>
                            <img src={fieldValues[currentField._idx]} alt="Signature" className="max-w-full rounded-xl border border-slate-200 bg-white p-3" />
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button size="middle" onClick={() => { handleFieldValue(currentField._idx, null); signatureRef.current?.clear() }} style={{ borderRadius: 10 }}>
                              Re-draw
                            </Button>
                            {!canFinish && (
                              <Button type="primary" size="middle"
                                onClick={goNext}
                                style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 10, fontWeight: 600 }}>
                                Accept & Next
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <SignaturePad
                            ref={signatureRef}
                            height={220}
                            title="Signature"
                            placeholder="Draw your signature here"
                            showHeaderClear={false}
                          />
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button size="middle" onClick={() => signatureRef.current?.clear()} style={{ borderRadius: 10 }}>
                              Clear
                            </Button>
                            <Button type="primary" size="middle"
                              onClick={() => {
                                const dataUrl = signatureRef.current?.getDataURL()
                                if (dataUrl) handleFieldValue(currentField._idx, dataUrl)
                                else message.warning('Please draw your signature first')
                              }}
                              style={{ background: '#22c55e', borderColor: '#22c55e', borderRadius: 10, fontWeight: 600 }}>
                              Done
                            </Button>
                          </div>
                        </div>
                      )
                    )}

                    {currentField.type === 'initialHere' && (
                      useSavedMode && selectedSavedInitial ? (
                        <div className="space-y-3">
                          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Your initials</div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-center" style={{ minHeight: 60 }}>
                              <img src={selectedSavedInitial} alt="Initials" style={{ maxWidth: '100%', maxHeight: 60, objectFit: 'contain' }} />
                            </div>
                          </div>
                          {fieldValues[currentField._idx] ? (
                            <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <CheckCircleFilled style={{ color: '#22c55e', fontSize: 20 }} />
                                <div>
                                  <div className="text-sm font-semibold text-emerald-700">Initials Applied</div>
                                  <div className="text-[11px] text-emerald-600">This field has been initialed</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-[18px] border px-4 py-3" style={{ borderColor: '#3b82f640', background: '#3b82f608' }}>
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#3b82f620' }}>
                                  <span className="text-base">👆</span>
                                </div>
                                <div>
                                  <div className="text-sm font-semibold" style={{ color: '#3b82f6' }}>Initial Here</div>
                                  <div className="text-[11px]" style={{ color: 'var(--ds-textSecondary, #64748b)' }}>Click the highlighted initial field on the document to apply your initials</div>
                                </div>
                              </div>
                            </div>
                          )}
                          {fieldValues[currentField._idx] && (
                            <div className="flex justify-end">
                              <Button size="small" onClick={() => handleFieldValue(currentField._idx, null)} style={{ borderRadius: 8, fontSize: 12 }}>
                                Clear & Re-apply
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : fieldValues[currentField._idx] ? (
                        <div className="space-y-3">
                          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Your initials</div>
                            <img src={fieldValues[currentField._idx]} alt="Initials" className="max-w-[220px] rounded-xl border border-slate-200 bg-white p-3" />
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button size="middle" onClick={() => { handleFieldValue(currentField._idx, null); initialRef.current?.clear() }} style={{ borderRadius: 10 }}>
                              Re-draw
                            </Button>
                            {!canFinish && (
                              <Button type="primary" size="middle"
                                onClick={goNext}
                                style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 10, fontWeight: 600 }}>
                                Accept & Next
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <SignaturePad
                            ref={initialRef}
                            height={180}
                            title={currentFieldTitle}
                            placeholder="Draw your initials here"
                            showHeaderClear={false}
                          />
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button size="middle" onClick={() => initialRef.current?.clear()} style={{ borderRadius: 10 }}>
                              Clear
                            </Button>
                            <Button type="primary" size="middle"
                              onClick={() => {
                                const dataUrl = initialRef.current?.getDataURL()
                                if (dataUrl) handleFieldValue(currentField._idx, dataUrl)
                                else message.warning('Please draw your initials first')
                              }}
                              style={{ background: '#22c55e', borderColor: '#22c55e', borderRadius: 10, fontWeight: 600 }}>
                              Done
                            </Button>
                          </div>
                        </div>
                      )
                    )}

                    {currentField.type === 'dateSigned' && (
                      <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-4">
                        <div className="flex items-center gap-3">
                          <CheckCircleFilled style={{ color: '#22c55e', fontSize: 22 }} />
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Date Signed</div>
                            <div className="mt-1 text-base font-semibold text-slate-800">{dayjs().format('MMMM DD, YYYY')}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {(currentField.type === 'email' || currentField.type === 'fullName' || currentField.type === 'text') && (
                      <div className="space-y-2.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Field Value</div>
                        <Input
                          value={fieldValues[currentField._idx] || ''}
                          onChange={(e) => handleFieldValue(currentField._idx, e.target.value)}
                          placeholder={currentField.type === 'email' ? 'your@email.com' : currentField.type === 'fullName' ? 'Full legal name' : 'Enter value'}
                          size="large"
                          style={{ borderRadius: 12, minHeight: 44 }}
                          autoFocus
                        />
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <Button
                        size="small"
                        disabled={currentFieldIdx === 0}
                        onClick={goPrev}
                        icon={<LeftOutlined />}
                        style={{ borderRadius: 8, fontWeight: 600 }}
                      >
                        Prev
                      </Button>
                      <span className="text-[11px] font-medium text-slate-400">
                        {currentFieldIdx + 1} / {myFields.length}
                      </span>
                      {currentFieldIdx < myFields.length - 1 ? (
                        <Button
                          type="primary"
                          size="small"
                          onClick={goNext}
                          style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 8, fontWeight: 600 }}
                        >
                          Next <RightOutlined />
                        </Button>
                      ) : (
                        // Keep layout balanced on the last field; Finish button
                        // appears below once all required fields are complete.
                        <span style={{ width: 64 }} aria-hidden />
                      )}
                    </div>

                    {/* ── Prominent Finish CTA — appears when every required field is done ── */}
                    {allRequiredComplete && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div
                          style={{
                            borderRadius: 14,
                            animation:
                              'ddsFinishEntrance 0.5s cubic-bezier(0.2, 0.85, 0.2, 1) both, ddsFinishPulse 2.1s ease-in-out 0.55s infinite',
                          }}
                        >
                          <Button
                            type="primary"
                            block
                            size="large"
                            loading={submitting}
                            onClick={handleSubmit}
                            style={{
                              background: PRIMARY,
                              borderColor: PRIMARY,
                              borderRadius: 14,
                              height: 52,
                              fontWeight: 800,
                              fontSize: 15,
                              letterSpacing: 0.3,
                            }}
                          >
                            <CheckOutlined /> Finish &amp; Submit
                          </Button>
                        </div>
                        <div className="mt-2 text-center text-[11px] font-semibold text-emerald-600">
                          All fields complete — click to submit your signatures
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-[560px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-slate-300">
                <div>
                  <FileTextOutlined style={{ fontSize: 36 }} />
                  <div className="mt-2 text-sm">No fields to complete</div>
                </div>
              </div>
            )}
          </div>

            </>
          )}
        </div>
      </div>

      {signaturePickerOpen && (
        <SavedSignaturePicker
          onComplete={handleSignatureChoice}
          onCancel={() => setSignaturePickerOpen(false)}
          hasSignatureFields={hasSignatureFields}
          hasInitialFields={hasInitialFields}
        />
      )}
    </div>
  )
}

export default SigningView
