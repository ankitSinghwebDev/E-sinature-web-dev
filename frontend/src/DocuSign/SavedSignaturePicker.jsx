/**
 * SavedSignaturePicker — Choose a saved signature/initial or draw a new one.
 * Shown after "Start Signing" and before the field-by-field signing flow.
 * Supports tap-to-apply: pick your signature, then tap fields to stamp them.
 */

import {
  CheckCircleFilled,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Button, Checkbox, message, Modal, Spin } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as dsApi from './api'
import SignaturePad from '../SignaturePad'

const PRIMARY = '#E8930C'
const MAX_PER_TYPE = 3

const SavedSignaturePicker = ({
  onComplete, // ({ signature, initial, mode }) => void
  onCancel, // () => void
  hasSignatureFields,
  hasInitialFields,
}) => {
  const [loading, setLoading] = useState(true)
  const [savedSignatures, setSavedSignatures] = useState([])
  const [savedInitials, setSavedInitials] = useState([])
  const [selectedSignature, setSelectedSignature] = useState(null)
  const [selectedInitial, setSelectedInitial] = useState(null)
  const [drawingType, setDrawingType] = useState(null) // 'signature' | 'initial' | null
  const [saveForLater, setSaveForLater] = useState(true)
  const [saving, setSaving] = useState(false)
  const signPadRef = useRef(null)
  const initPadRef = useRef(null)

  // Fetch saved signatures on mount
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const { data } = await dsApi.getSavedSignatures()
        const all = data.data || []
        if (!cancelled) {
          setSavedSignatures(all.filter((s) => s.type === 'signature'))
          setSavedInitials(all.filter((s) => s.type === 'initial'))
        }
      } catch {
        // Silently fail — user can still draw fresh
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Auto-open draw pad when no saved signatures exist (first-time UX)
  useEffect(() => {
    if (loading) return
    if (hasSignatureFields && savedSignatures.length === 0 && !selectedSignature && !drawingType) {
      setDrawingType('signature')
    }
  }, [loading, savedSignatures.length, hasSignatureFields, selectedSignature, drawingType])

  // Handle "Done" after drawing
  const handleDrawDone = useCallback(async () => {
    const ref = drawingType === 'signature' ? signPadRef : initPadRef
    const dataUrl = ref.current?.getDataURL()
    if (!dataUrl) {
      message.warning('Please draw first')
      return
    }

    // Use drawn value immediately
    if (drawingType === 'signature') setSelectedSignature(dataUrl)
    else setSelectedInitial(dataUrl)

    // Save to backend if opted in
    if (saveForLater) {
      const list = drawingType === 'signature' ? savedSignatures : savedInitials
      if (list.length >= MAX_PER_TYPE) {
        message.info(`Max ${MAX_PER_TYPE} saved. You can still use this one now.`)
      } else {
        setSaving(true)
        try {
          const { data } = await dsApi.createSavedSignature({
            type: drawingType,
            dataUrl,
          })
          if (drawingType === 'signature') {
            setSavedSignatures((prev) => [data.data, ...prev])
          } else {
            setSavedInitials((prev) => [data.data, ...prev])
          }
          message.success('Saved for future use')
        } catch {
          message.warning('Could not save for later, but you can use it now')
        } finally {
          setSaving(false)
        }
      }
    }

    const justFinished = drawingType
    setDrawingType(null)

    // After drawing signature, auto-open initials drawing if needed
    if (
      justFinished === 'signature' &&
      hasInitialFields &&
      savedInitials.length === 0 &&
      !selectedInitial
    ) {
      setTimeout(() => setDrawingType('initial'), 300)
    }
  }, [drawingType, saveForLater, savedSignatures, savedInitials, hasInitialFields, selectedInitial])

  // Delete a saved signature/initial
  const handleDelete = useCallback(
    (id, type) => {
      Modal.confirm({
        title: `Delete this saved ${type}?`,
        content: 'This cannot be undone.',
        okText: 'Delete',
        okType: 'danger',
        onOk: async () => {
          try {
            await dsApi.deleteSavedSignature(id)
            if (type === 'signature') {
              const deleted = savedSignatures.find((s) => s._id === id)
              setSavedSignatures((prev) => prev.filter((s) => s._id !== id))
              if (selectedSignature === deleted?.dataUrl)
                setSelectedSignature(null)
            } else {
              const deleted = savedInitials.find((s) => s._id === id)
              setSavedInitials((prev) => prev.filter((s) => s._id !== id))
              if (selectedInitial === deleted?.dataUrl)
                setSelectedInitial(null)
            }
            message.success('Deleted')
          } catch {
            message.error('Failed to delete')
          }
        },
      })
    },
    [savedSignatures, savedInitials, selectedSignature, selectedInitial],
  )

  const canContinue = useMemo(() => {
    if (hasSignatureFields && !selectedSignature) return false
    if (hasInitialFields && !selectedInitial) return false
    return true
  }, [hasSignatureFields, hasInitialFields, selectedSignature, selectedInitial])

  const handleContinue = () => {
    onComplete({
      signature: selectedSignature,
      initial: selectedInitial,
      mode: 'saved',
    })
  }

  const handleDrawFresh = () => {
    onComplete({ signature: null, initial: null, mode: 'draw' })
  }

  // ── Loading state ──
  if (loading) {
    return (
      <Modal
        open
        footer={null}
        onCancel={onCancel}
        width={840}
        centered
        maskClosable={false}
        destroyOnClose
        closable={false}
      >
        <div className="flex items-center justify-center py-16">
          <Spin tip="Loading your signatures..." />
        </div>
      </Modal>
    )
  }

  // ── Section renderer (reused for signatures & initials) ──
  const renderSection = (type, saved, selected, setSelected) => {
    const label = type === 'signature' ? 'Signature' : 'Initials'
    const isDrawing = drawingType === type
    const padRef = type === 'signature' ? signPadRef : initPadRef

    return (
        <div className="mb-2">
        {/* Section header */}
        <div className="flex items-center justify-between mb-1.5">
          <div
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--ds-text, #1e293b)' }}
          >
            Your {label}
            {saved.length > 0 && (
              <span
                className="ml-1 text-[10px] font-medium normal-case"
                style={{ color: 'var(--ds-textMuted, #94a3b8)' }}
              >
                ({saved.length}/{MAX_PER_TYPE})
              </span>
            )}
          </div>
          {selected && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: '#f0fdf4',
                color: '#22c55e',
                border: '1px solid #bbf7d0',
              }}
            >
              ✓ Selected
            </span>
          )}
        </div>

        {/* Saved cards — horizontal scroll carousel */}
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {saved.map((sig) => {
            const isSelected = selected === sig.dataUrl
            return (
              <div
                key={sig._id}
                className="rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-md flex-shrink-0"
                style={{
                  border: isSelected
                    ? `2.5px solid ${PRIMARY}`
                    : '1.5px solid var(--ds-border, #e2e8f0)',
                  background: isSelected
                    ? `${PRIMARY}08`
                    : 'var(--ds-card, #fff)',
                  boxShadow: isSelected
                    ? `0 0 0 3px ${PRIMARY}20`
                    : 'none',
                  width: 150,
                  scrollSnapAlign: 'start',
                }}
                onClick={() =>
                  setSelected(isSelected ? null : sig.dataUrl)
                }
              >
                {/* Signature image */}
                <div
                  className="h-12 flex items-center justify-center p-1.5 relative"
                  style={{ background: isSelected ? '#fff' : '#fafafa' }}
                >
                  <img
                    src={sig.dataUrl}
                    alt={label}
                    style={{
                      maxWidth: '90%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                  {isSelected && (
                    <div
                      className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: PRIMARY }}
                    >
                      <CheckCircleFilled
                        style={{ color: '#fff', fontSize: 10 }}
                      />
                    </div>
                  )}
                </div>

                {/* Card footer */}
                <div
                  className="px-2 py-1 flex items-center justify-between"
                  style={{
                    borderTop:
                      '1px solid var(--ds-borderLight, #f1f5f9)',
                  }}
                >
                  <div>
                    <div
                      className="text-[10px] font-medium truncate"
                      style={{
                        color: 'var(--ds-text)',
                        maxWidth: 80,
                      }}
                    >
                      {sig.label || label}
                    </div>
                    <div
                      className="text-[8px]"
                      style={{
                        color: 'var(--ds-textMuted, #94a3b8)',
                      }}
                    >
                      {dayjs(sig.createdAt).format('MMM DD, YYYY')}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(sig._id, type)
                    }}
                    className="w-5 h-5 rounded-md flex items-center justify-center transition-colors hover:bg-red-50"
                    style={{ color: '#ef4444' }}
                  >
                    <DeleteOutlined style={{ fontSize: 10 }} />
                  </button>
                </div>
              </div>
            )
          })}

          {/* "+ Draw New" inline card */}
          {!isDrawing && (
            <div
              className="rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:shadow-sm flex-shrink-0"
              style={{
                border: `1.5px dashed ${PRIMARY}60`,
                background: `${PRIMARY}05`,
                width: 90,
              }}
              onClick={() => setDrawingType(type)}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center mb-1"
                style={{ background: `${PRIMARY}15` }}
              >
                <PlusOutlined style={{ color: PRIMARY, fontSize: 12 }} />
              </div>
              <span
                className="text-[10px] font-semibold"
                style={{ color: PRIMARY }}
              >
                Draw New
              </span>
            </div>
          )}
        </div>

        {/* Inline draw pad (expanded) */}
        {isDrawing && (
          <div
            className="mt-1.5 rounded-xl p-2.5"
            style={{
              background: 'var(--ds-bgSecondary, #f8fafc)',
              border: '1px solid var(--ds-border, #e2e8f0)',
            }}
          >
            <SignaturePad
              ref={padRef}
              height={type === 'signature' ? 130 : 100}
              title={`Draw your ${type === 'signature' ? 'signature' : 'initials'}`}
              placeholder={`Draw your ${type === 'signature' ? 'signature' : 'initials'} here`}
              showHeaderClear={false}
            />
            <div className="flex items-center justify-between mt-2.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={saveForLater}
                  onChange={(e) => setSaveForLater(e.target.checked)}
                />
                <span
                  className="text-[12px]"
                  style={{
                    color: 'var(--ds-textSecondary, #64748b)',
                  }}
                >
                  Save for future use
                </span>
              </label>
              <div className="flex gap-2">
                <Button
                  size="small"
                  onClick={() => setDrawingType(null)}
                  style={{ borderRadius: 8 }}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  onClick={() => padRef.current?.clear()}
                  style={{ borderRadius: 8 }}
                >
                  Clear
                </Button>
                <Button
                  type="primary"
                  size="small"
                  loading={saving}
                  onClick={handleDrawDone}
                  style={{
                    background: '#22c55e',
                    borderColor: '#22c55e',
                    borderRadius: 8,
                    fontWeight: 600,
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Main render ──
  return (
    <Modal
      open
      footer={null}
      onCancel={onCancel}
      width={840}
      centered
      maskClosable={false}
      destroyOnClose
      closable={false}
      styles={{ body: { padding: 0 } }}
    >
      <div className="flex max-h-[80vh] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Before Signing
            </div>
            <div className="mt-0.5 text-[18px] leading-tight font-bold text-slate-800">
              Choose or Draw Your Signature
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-slate-100"
            style={{ color: 'var(--ds-textMuted, #94a3b8)' }}
          >
            Back to review
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-2">
          {/* Header */}
          <div className="mb-2 text-center">
            <div
              className="text-[13px] font-semibold mb-0.5"
              style={{ color: 'var(--ds-text, #1e293b)' }}
            >
              Pick a saved signature or draw a new one
            </div>
            <div
              className="text-[11px] leading-4"
              style={{ color: 'var(--ds-textSecondary, #64748b)' }}
            >
              Then tap the highlighted fields on the document to sign.
            </div>
          </div>

          {/* Signature section */}
          {hasSignatureFields &&
            renderSection(
              'signature',
              savedSignatures,
              selectedSignature,
              setSelectedSignature,
            )}

          {/* Initials section */}
          {hasInitialFields &&
            renderSection(
              'initial',
              savedInitials,
              selectedInitial,
              setSelectedInitial,
            )}

          {/* Divider */}
          <div className="flex items-center gap-3 my-2">
            <div
              className="flex-1 h-px"
              style={{ background: 'var(--ds-border, #e2e8f0)' }}
            />
            <span
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--ds-textMuted, #94a3b8)' }}
            >
              or
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: 'var(--ds-border, #e2e8f0)' }}
            />
          </div>

          {/* "Draw fresh" fallback */}
          <button
            onClick={handleDrawFresh}
            className="w-full py-2 rounded-lg text-[12px] font-medium transition-all hover:shadow-sm"
            style={{
              color: 'var(--ds-textSecondary, #64748b)',
              background: 'var(--ds-bgSecondary, #f8fafc)',
              border: '1px solid var(--ds-border, #e2e8f0)',
            }}
          >
            Draw fresh for each field instead
          </button>
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-2">
          <Button
            type="primary"
            block
            disabled={!canContinue}
            onClick={handleContinue}
            style={{
              background: canContinue ? PRIMARY : undefined,
              borderColor: canContinue ? PRIMARY : undefined,
              borderRadius: 10,
              height: 40,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Continue to Signing <RightOutlined />
          </Button>
          {!canContinue && (
            <div
              className="text-center mt-1.5 text-[10px]"
              style={{ color: 'var(--ds-textMuted, #94a3b8)' }}
            >
              {!selectedSignature && hasSignatureFields && 'Select or draw a signature'}
              {!selectedSignature &&
                hasSignatureFields &&
                !selectedInitial &&
                hasInitialFields &&
                ' and '}
              {!selectedInitial && hasInitialFields && 'select or draw initials'}
              {' to continue'}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default SavedSignaturePicker
