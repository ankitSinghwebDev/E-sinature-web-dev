/**
 * DocuSign Panel — Manage envelopes with standard DocuSign terminology.
 */

import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EyeFilled,
  EyeOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  InboxOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  SendOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import {
  Button,
  Checkbox,
  Drawer,
  Input,
  message,
  Modal,
  Select,
  Space,
  Spin,
  Tabs,
} from 'antd'
import dayjs from 'dayjs'
import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  createDocuSignEnvelope,
  deleteDocuSignEnvelope,
  fetchDocuSignEnvelopes,
  sendDocuSignEnvelope,
  updateDocuSignEnvelope,
} from '../store/store'
import DocumentFieldPlacer from './DocumentFieldPlacer'
import EnvelopeStatusTracker from './EnvelopeStatusTracker'
import * as dsApi from './api'
import { uploadFile } from '../api/upload'
import { getFileData } from '../_shims/uploadedFilesOnAWS'
import {
  loadPdfAsImage,
} from './dummyData'
import { staggerContainer, staggerItem, pageTransition } from './animations'
import {
  PRIMARY,
  SIGNER_COLORS,
  DEFAULT_EXPIRATION_DAYS,
  AUTO_REFRESH_INTERVAL_MS,
  buildRecipientUpdate,
  buildCCUpdate,
  toggleSelfSignerHelper,
} from './constants'

const STATUS_TAG = {
  draft: { label: 'Draft', bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0', icon: '○' },
  sent: { label: 'Sent', bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe', icon: '↗' },
  delivered: { label: 'Delivered', bg: '#ecfdf5', text: '#059669', border: '#a7f3d0', icon: '✓' },
  signed: { label: 'Signed', bg: '#eff6ff', text: '#2563eb', border: '#93c5fd', icon: '✎' },
  completed: { label: 'Completed', bg: '#f0fdf4', text: '#16a34a', border: '#86efac', icon: '✓' },
  declined: { label: 'Declined', bg: '#fef2f2', text: '#dc2626', border: '#fecaca', icon: '✕' },
  expired: { label: 'Expired', bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0', icon: '◷' },
}

const ROLE_OPTIONS = [
  { value: 'signer', label: 'Needs to Sign' },
  { value: 'cc', label: 'Receives a Copy' },
]

/* ═══════════════════════════════════════════════════════════════════
 *  ENVELOPE LIST
 * ═══════════════════════════════════════════════════════════════════ */
/* ── Shared envelope table ─────────────────────────────────────── */
const EnvelopeTable = ({ rows, isLoading, onSelect, emptyText }) => {
  const dispatch = useDispatch()
  const del = (id) => Modal.confirm({ title: 'Delete this envelope?', content: 'This draft will be permanently removed.', okType: 'danger', okText: 'Delete', onOk: () => dispatch(deleteDocuSignEnvelope(id)) })

  return (
    <table className="w-full">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--ds-border)', background: 'var(--ds-bgSecondary)' }}>
          <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: 'var(--ds-textMuted)' }}>Subject</th>
          <th className="text-center text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5 w-28" style={{ color: 'var(--ds-textMuted)' }}>Status</th>
          <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5 w-32" style={{ color: 'var(--ds-textMuted)' }}>Last Change</th>
          <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5 w-32" style={{ color: 'var(--ds-textMuted)' }}>Expiration</th>
          <th className="text-right text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5 w-52" style={{ color: 'var(--ds-textMuted)' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {isLoading ? (
          <tr><td colSpan={5} className="text-center py-16"><Spin /></td></tr>
        ) : rows.length === 0 ? (
          <tr><td colSpan={5} className="text-center py-16" style={{ color: 'var(--ds-textMuted)' }}>{emptyText}</td></tr>
        ) : (
          rows.map((env, rowIdx) => {
            const st = STATUS_TAG[env.status] || STATUS_TAG.draft
            const lastChange = env.completedAt || env.sentAt || env.createdAt
            const expDays = env.settings?.expirationDays || DEFAULT_EXPIRATION_DAYS
            const expDate = env.sentAt ? dayjs(env.sentAt).add(expDays, 'day') : null
            return (
              <motion.tr key={env._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: rowIdx * 0.04 }}
                className="cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid var(--ds-borderLight)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ds-bgHover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                onClick={() => onSelect(env)}>
                <td className="px-4 py-3">
                  <div className="text-sm font-semibold truncate max-w-md" style={{ color: 'var(--ds-text)' }}>{env.title}</div>
                  <div className="text-xs mt-0.5 truncate max-w-md" style={{ color: 'var(--ds-textSecondary)' }}>{env.recipients?.map((r) => r.name).join(', ')}</div>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                    style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}>
                    {st.icon} {st.label}
                  </span>
                </td>
                <td className="px-3 py-3 text-[13px] whitespace-nowrap" style={{ color: 'var(--ds-textSecondary)' }}>{dayjs(lastChange).format('MMM DD, YYYY')}</td>
                <td className="px-3 py-3 text-[13px] whitespace-nowrap" style={{ color: 'var(--ds-textSecondary)' }}>{expDate ? expDate.format('MMM DD, YYYY') : '—'}</td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1.5">
                    {env.status === 'draft' && <>
                      <Button size="small" icon={<EditOutlined />} onClick={() => onSelect(env)} style={{ borderRadius: 6, fontSize: 12 }}>Edit</Button>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => del(env._id)} style={{ borderRadius: 6, fontSize: 12 }}>Delete</Button>
                    </>}
                    <Button size="small" icon={<EyeOutlined />} onClick={() => onSelect(env)} style={{ borderRadius: 6, fontSize: 12 }}>View</Button>
                  </div>
                </td>
              </motion.tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}

const EnvelopeList = ({ onSelect, onCreate, user }) => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { envelopes: apiEnvelopes, isLoading } = useSelector((s) => s.docusign)
  const [q, setQ] = useState('')

  const envelopes = apiEnvelopes

  useEffect(() => { dispatch(fetchDocuSignEnvelopes()) }, [dispatch])

  // Auto-refresh every 30s so admin sees status changes (e.g. party signed → completed)
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch(fetchDocuSignEnvelopes())
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [dispatch])

  // ── Categorize envelopes ──
  // Draft: status === 'draft'
  const draftEnvelopes = useMemo(() => envelopes.filter((e) => e.status === 'draft'), [envelopes])

  // Received: envelopes where current user is a signer and hasn't signed yet (counter-sign)
  const receivedEnvelopes = useMemo(() => {
    return envelopes.filter((env) => {
      const myRecipient = env.recipients?.find((r) =>
        (r.userId === user?._id || r.email === user?.email) && r.role === 'signer'
      )
      if (!myRecipient) return false
      if (myRecipient.status === 'signed' || myRecipient.status === 'completed') return false
      // Must be sent/delivered (not draft created by me)
      return ['sent', 'delivered'].includes(env.status)
    })
  }, [envelopes, user])

  // True when I'm a pending signer AND every OTHER signer has already signed,
  // i.e. the envelope is waiting on my counter-signature to finalize.
  const isAwaitingCounterSign = useCallback((env) => {
    const me = env.recipients?.find((r) =>
      (r.userId === user?._id || r.email === user?.email) && r.role === 'signer',
    )
    if (!me) return false
    if (me.status === 'signed' || me.status === 'completed') return false
    const others = (env.recipients || []).filter((r) =>
      r.role === 'signer' && !(r.userId === user?._id || r.email === user?.email),
    )
    if (others.length === 0) return false // solo signer — not "counter" signing
    return others.every((r) => r.status === 'signed' || r.status === 'completed')
  }, [user])

  // Received envelopes sorted with counter-sign-ready items first so the
  // admin can't miss them — they're blocking completion.
  const sortedReceivedEnvelopes = useMemo(() => {
    return [...receivedEnvelopes].sort((a, b) => {
      const aCS = isAwaitingCounterSign(a) ? 1 : 0
      const bCS = isAwaitingCounterSign(b) ? 1 : 0
      return bCS - aCS
    })
  }, [receivedEnvelopes, isAwaitingCounterSign])

  // Sent: envelopes I created and sent (excluding drafts)
  const sentEnvelopes = useMemo(() => {
    return envelopes.filter((e) => {
      if (e.status === 'draft' || e.status === 'completed' || e.status === 'declined') return false
      const isCreator = e.createdBy?._id === user?._id || e.createdBy === user?._id
      return isCreator && ['sent', 'delivered'].includes(e.status)
    })
  }, [envelopes, user])

  // Completed
  const completedEnvelopes = useMemo(() => envelopes.filter((e) => e.status === 'completed'), [envelopes])

  // Rejected (declined)
  const rejectedEnvelopes = useMemo(() => envelopes.filter((e) => e.status === 'declined'), [envelopes])

  // Search filter helper
  const searchFilter = useCallback((list) => {
    if (!q.trim()) return list
    const s = q.toLowerCase()
    return list.filter((e) => e.title?.toLowerCase().includes(s) || e.recipients?.some((r) => r.name?.toLowerCase().includes(s)))
  }, [q])

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = async () => {
    setRefreshing(true)
    await dispatch(fetchDocuSignEnvelopes())
    setRefreshing(false)
  }

  return (
    <div className="relative">
      {/* Search + Refresh */}
      <div className="flex items-center gap-3 mb-4">
        <Input placeholder="Search envelopes..." prefix={<SearchOutlined className="text-slate-300" />} value={q} onChange={(e) => setQ(e.target.value)} allowClear style={{ width: 260, borderRadius: 8 }} />
        <Button icon={<ReloadOutlined spin={refreshing} />} onClick={handleRefresh} loading={refreshing} style={{ borderRadius: 8 }}>Refresh</Button>
      </div>

      {/* Floating action button */}
      <Button
        type="primary"
        icon={<CloudUploadOutlined />}
        onClick={onCreate}
        className="!fixed !z-50 !shadow-lg hover:!shadow-xl !transition-shadow"
        style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 12, fontWeight: 600, fontSize: 14, height: 44, paddingInline: 24, bottom: 40, right: 40 }}
      >
        Upload Doc for eSignature
      </Button>

      {/* Parent tabs: E-Signature | Complete | Rejected */}
      <Tabs
        type="card"
        defaultActiveKey="esignature"
        items={[
          {
            key: 'esignature',
            label: <span className="font-semibold">E-Signature</span>,
            children: (
              <Tabs
                defaultActiveKey="draft"
                size="small"
                items={[
                  {
                    key: 'draft',
                    label: <span>Draft ({draftEnvelopes.length})</span>,
                    children: <EnvelopeTable rows={searchFilter(draftEnvelopes)} isLoading={isLoading} onSelect={onSelect} emptyText="No draft envelopes" />,
                  },
                  {
                    key: 'received',
                    label: (
                      <span>
                        Received
                        {receivedEnvelopes.length > 0 && (
                          <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white" style={{ background: PRIMARY }}>{receivedEnvelopes.length}</span>
                        )}
                      </span>
                    ),
                    children: (
                      <div>
                        {receivedEnvelopes.length === 0 ? (
                          <div className="text-center py-16" style={{ color: 'var(--ds-textMuted)' }}>No documents awaiting your signature</div>
                        ) : (
                          <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
                            {searchFilter(sortedReceivedEnvelopes).map((env) => {
                              const signedBy = env.recipients?.filter((r) => r.role === 'signer' && (r.status === 'signed' || r.status === 'completed')) || []
                              const myRecipient = env.recipients?.find((r) => (r.userId === user?._id || r.email === user?.email) && r.role === 'signer')
                              const counterSign = isAwaitingCounterSign(env)
                              const otherSignerCount = (env.recipients || []).filter((r) =>
                                r.role === 'signer' && !(r.userId === user?._id || r.email === user?.email),
                              ).length
                              const accent = counterSign ? '#F59E0B' : PRIMARY
                              return (
                                <motion.div key={env._id} variants={staggerItem}
                                  whileHover={{ scale: 1.005, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                                  className="rounded-xl cursor-pointer transition-all overflow-hidden"
                                  style={{
                                    border: `${counterSign ? 2 : 1}px solid ${counterSign ? accent : `${PRIMARY}40`}`,
                                    background: counterSign ? '#FFFBEB' : 'var(--ds-primaryLight)',
                                    boxShadow: counterSign ? '0 6px 20px rgba(245, 158, 11, 0.18)' : 'none',
                                  }}
                                  onClick={() => onSelect(env)}>

                                  {/* Counter-sign banner — only when waiting on me */}
                                  {counterSign && (
                                    <div
                                      className="flex items-center gap-2 px-4 py-2 border-b"
                                      style={{
                                        borderColor: `${accent}33`,
                                        background: 'linear-gradient(90deg, #FEF3C7 0%, #FDE68A 100%)',
                                      }}
                                    >
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider"
                                        style={{ background: accent, color: '#fff' }}>
                                        ⚡ Ready to counter-sign
                                      </span>
                                      <span className="text-[11px] font-semibold truncate" style={{ color: '#92400E' }}>
                                        {`All ${otherSignerCount} signer${otherSignerCount === 1 ? ' has' : 's have'} signed — counter-sign to finalize this document`}
                                      </span>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-4 p-4">
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${accent}20` }}>
                                      {counterSign
                                        ? <CheckCircleFilled style={{ fontSize: 22, color: accent }} />
                                        : <EditOutlined style={{ fontSize: 22, color: accent }} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-semibold" style={{ color: 'var(--ds-text)' }}>{env.title}</div>
                                      <div className="text-xs mt-0.5" style={{ color: 'var(--ds-textSecondary)' }}>
                                        {counterSign
                                          ? `Signed by ${signedBy.map((r) => r.name).join(', ')}`
                                          : (signedBy.length > 0
                                            ? `Signed by ${signedBy.map((r) => r.name).join(', ')} · Waiting for your signature`
                                            : 'Waiting for your signature')}
                                      </div>
                                      <div className="text-xs mt-1 flex items-center gap-1" style={{ color: accent }}>
                                        {counterSign
                                          ? <><CheckCircleFilled /> Your counter-sign is the final step</>
                                          : <><ClockCircleFilled /> Action required</>}
                                      </div>
                                    </div>
                                    <Button type="primary" icon={counterSign ? <CheckCircleFilled /> : <EditOutlined />}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        navigate(`/settings/dealmemo/docusign/sign/${env._id}?recipient=${encodeURIComponent(myRecipient?.email || user?.email || '')}`)
                                      }}
                                      style={{ background: accent, borderColor: accent, borderRadius: 8, fontWeight: 700 }}>
                                      {counterSign ? 'Counter-Sign' : 'Sign'}
                                    </Button>
                                  </div>
                                </motion.div>
                              )
                            })}
                          </motion.div>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'sent',
                    label: <span>Sent ({sentEnvelopes.length})</span>,
                    children: (
                      <div>
                        {sentEnvelopes.length === 0 ? (
                          <div className="text-center py-16" style={{ color: 'var(--ds-textMuted)' }}>No sent envelopes</div>
                        ) : (
                          <table className="w-full">
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--ds-border)', background: 'var(--ds-bgSecondary)' }}>
                                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5" style={{ color: 'var(--ds-textMuted)' }}>Subject</th>
                                <th className="text-center text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5 w-32" style={{ color: 'var(--ds-textMuted)' }}>Delivery</th>
                                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5 w-32" style={{ color: 'var(--ds-textMuted)' }}>Sent</th>
                                <th className="text-right text-[11px] font-semibold uppercase tracking-wider px-4 py-2.5 w-32" style={{ color: 'var(--ds-textMuted)' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {searchFilter(sentEnvelopes).map((env, rowIdx) => {
                                const allDelivered = env.recipients?.filter((r) => r.role === 'signer').every((r) => r.status === 'delivered' || r.status === 'signed' || r.status === 'completed')
                                return (
                                  <motion.tr key={env._id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.25, delay: rowIdx * 0.04 }}
                                    className="cursor-pointer transition-colors"
                                    style={{ borderBottom: '1px solid var(--ds-borderLight)' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ds-bgHover)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => onSelect(env)}>
                                    <td className="px-4 py-3">
                                      <div className="text-sm font-semibold truncate max-w-md" style={{ color: 'var(--ds-text)' }}>{env.title}</div>
                                      <div className="text-xs mt-0.5 truncate max-w-md" style={{ color: 'var(--ds-textSecondary)' }}>{env.recipients?.map((r) => r.name).join(', ')}</div>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                                        style={allDelivered
                                          ? { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }
                                          : { background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }
                                        }>
                                        {allDelivered ? '✓ Delivered' : '◷ Not Delivered'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 text-[13px] whitespace-nowrap" style={{ color: 'var(--ds-textSecondary)' }}>{dayjs(env.sentAt).format('MMM DD, YYYY')}</td>
                                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                      <Button size="small" icon={<EyeOutlined />} onClick={() => onSelect(env)} style={{ borderRadius: 6, fontSize: 12 }}>View</Button>
                                    </td>
                                  </motion.tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'completed',
            label: <span className="font-semibold">Complete ({completedEnvelopes.length})</span>,
            children: (
              <EnvelopeTable rows={searchFilter(completedEnvelopes)} isLoading={isLoading} onSelect={onSelect} emptyText="No completed envelopes yet" />
            ),
          },
          {
            key: 'rejected',
            label: (
              <span className="font-semibold">
                Rejected
                {rejectedEnvelopes.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white bg-red-500">{rejectedEnvelopes.length}</span>
                )}
              </span>
            ),
            children: (
              <EnvelopeTable rows={searchFilter(rejectedEnvelopes)} isLoading={isLoading} onSelect={onSelect} emptyText="No rejected envelopes" />
            ),
          },
        ]}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 *  RECIPIENTS SECTION — Self / Other users toggle + CC option
 * ═══════════════════════════════════════════════════════════════════ */
const RecipientsSection = ({ recipients, onChange, users = [], currentUser }) => {
  const chunkItems = (items, size) => {
    const chunks = []
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
    return chunks
  }

  const [needCC, setNeedCC] = useState(() => recipients.some((r) => r.role === 'cc'))
  const [selectedCCIds, setSelectedCCIds] = useState(() =>
    recipients.filter((r) => r.role === 'cc').map((r) => r.userId).filter(Boolean)
  )

  // Is self (current user) added as signer?
  const isSelfSigner = useMemo(() =>
    recipients.some((r) => r.role === 'signer' && (r.userId === currentUser?._id || r.email === currentUser?.email)),
    [recipients, currentUser],
  )

  // All users except current user (for "Other Signers" multi-select)
  const availableSigners = useMemo(() =>
    (users || []).filter((u) => u.email && u._id !== currentUser?._id),
    [users, currentUser],
  )

  // Users available for CC (all users — labels must always resolve)
  const availableForCC = useMemo(() =>
    (users || []).filter((u) => u.email),
    [users],
  )

  // Toggle self as signer
  const toggleSelf = (checked) => {
    if (checked) {
      if (!currentUser) return
      const maxOrd = recipients.reduce((m, r) => Math.max(m, r.routingOrder || 0), 0)
      onChange([...recipients.filter((r) => !(r.role === 'signer' && (r.userId === currentUser._id || r.email === currentUser.email))), {
        name: currentUser.full_name || `${currentUser.first_name} ${currentUser.last_name}`,
        email: currentUser.email,
        role: 'signer',
        routingOrder: maxOrd + 1,
        userId: currentUser._id,
        status: 'created',
      }])
    } else {
      onChange(recipients.filter((r) => !(r.role === 'signer' && (r.userId === currentUser?._id || r.email === currentUser?.email))))
    }
  }

  // IDs of other signers (for multi-select value)
  const otherSignerIds = useMemo(() =>
    recipients.filter((r) => r.role === 'signer' && r.userId !== currentUser?._id && r.email !== currentUser?.email).map((r) => r.userId).filter(Boolean),
    [recipients, currentUser],
  )

  // Handle multi-select change for other signers
  const handleOtherSignersChange = (selectedIds) => {
    // Keep self-signer and CC recipients untouched
    const selfSigner = recipients.filter((r) => r.role === 'signer' && (r.userId === currentUser?._id || r.email === currentUser?.email))
    const ccList = recipients.filter((r) => r.role === 'cc')

    let ord = selfSigner.length > 0 ? Math.max(...selfSigner.map((r) => r.routingOrder || 0)) : 0
    const otherSigners = selectedIds.map((uid) => {
      const user = (users || []).find((u) => u._id === uid)
      if (!user) return null
      // Preserve existing recipient data if already added
      const existing = recipients.find((r) => r.userId === uid && r.role === 'signer')
      if (existing) return existing
      ord += 1
      return {
        name: user.full_name || `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: 'signer',
        routingOrder: ord,
        userId: user._id,
        status: 'created',
      }
    }).filter(Boolean)

    onChange([...selfSigner, ...otherSigners, ...ccList])
  }

  // Handle CC selection change
  const handleCCChange = (ccUserIds) => {
    setSelectedCCIds(ccUserIds)
    // Remove old CC recipients, keep signers
    const signers = recipients.filter((r) => r.role === 'signer')
    const ccRecipients = ccUserIds.map((uid) => {
      const user = (users || []).find((u) => u._id === uid)
      if (!user) return null
      return {
        name: user.full_name || `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: 'cc',
        routingOrder: 99,
        userId: user._id,
        status: 'created',
      }
    }).filter(Boolean)
    onChange([...signers, ...ccRecipients])
  }

  // Toggle CC on/off
  const toggleCC = (checked) => {
    setNeedCC(checked)
    if (!checked) {
      setSelectedCCIds([])
      onChange(recipients.filter((r) => r.role !== 'cc'))
    }
  }

  // Signers only (for display) — self always first
  const signers = recipients.filter((r) => r.role === 'signer').sort((a, b) => {
    const aIsSelf = a.userId === currentUser?._id || a.email === currentUser?.email
    const bIsSelf = b.userId === currentUser?._id || b.email === currentUser?.email
    if (aIsSelf && !bIsSelf) return -1
    if (!aIsSelf && bIsSelf) return 1
    return 0
  })
  const ccRecipients = recipients.filter((r) => r.role === 'cc')
  const signersPages = useMemo(() => chunkItems(signers, 9), [signers])
  const ccPages = useMemo(() => chunkItems(ccRecipients, 9), [ccRecipients])

  // Uses SIGNER_COLORS from constants

  // Collapse state for sections
  const [signersOpen, setSignersOpen] = useState(true)
  const [ccOpen, setCcOpen] = useState(true)
  const [addingSigners, setAddingSigners] = useState(false)
  const [addingCC, setAddingCC] = useState(false)
  const signersRowRef = useRef(null)
  const ccRowRef = useRef(null)

  const scrollRecipientRow = useCallback((ref, direction) => {
    if (!ref.current) return
    ref.current.scrollBy({
      left: direction === 'left' ? -ref.current.clientWidth : ref.current.clientWidth,
      behavior: 'smooth',
    })
  }, [])

  // Signers panel
  const signersPanel = (
    <div className="rounded-2xl p-4" style={{ background: 'var(--ds-card, #fff)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)', border: '1px solid var(--ds-border, #f0f0f0)' }}>
      {/* You (Admin) */}
      <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--ds-bgSecondary, #f8fafc)', border: '1px solid var(--ds-border, #e2e8f0)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: 'var(--ds-bgSecondary, #e2e8f0)', border: '2px solid var(--ds-border, #e2e8f0)' }}>
            <UserAddOutlined style={{ fontSize: 18, color: '#64748b' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: 'var(--ds-text)' }}>
              You <span className="font-normal" style={{ color: '#94a3b8' }}>(Admin)</span>
            </div>
          </div>
          <DownOutlined style={{ fontSize: 10, color: '#cbd5e1' }} />
        </div>
        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none whitespace-nowrap" style={{ paddingLeft: 52 }}>
          <input type="checkbox" checked={isSelfSigner} onChange={(e) => toggleSelf(e.target.checked)}
            className="rounded flex-shrink-0" style={{ accentColor: PRIMARY, width: 16, height: 16 }} />
          <span className="text-[12px]" style={{ color: '#94a3b8' }}>I need to sign this document</span>
        </label>
      </div>

      {/* ── Signers ── */}
      <button onClick={() => setSignersOpen(!signersOpen)}
        className="flex items-center justify-between w-full mt-2 mb-2">
        <span className="text-sm font-bold" style={{ color: 'var(--ds-text)' }}>Signers</span>
        <div className="flex items-center gap-2">
          {signers.length > 0 && (
            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold"
              style={{ background: 'var(--ds-bgSecondary, #f1f5f9)', color: 'var(--ds-textMuted, #64748b)', border: '1px solid var(--ds-border, #e2e8f0)' }}>{signers.length}</span>
          )}
          <DownOutlined style={{ fontSize: 9, color: 'var(--ds-textMuted, #cbd5e1)', transform: signersOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </button>

      {signersOpen && (
        <div>
          {/* + Add person — at the top */}
          {addingSigners ? (
            <div className="mb-2">
              <Select
                mode="multiple"
                showSearch
                autoFocus
                open
                placeholder="Search users..."
                value={otherSignerIds}
                onChange={handleOtherSignersChange}
                optionFilterProp="label"
                size="small"
                style={{ width: '100%', borderRadius: 8 }}
                options={availableSigners.map((u) => ({
                  value: u._id,
                  label: u.full_name || `${u.first_name} ${u.last_name}`,
                }))}
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <div className="px-2 py-1.5 border-t" style={{ borderColor: '#f0f0f0' }}>
                      <button onClick={() => setAddingSigners(false)}
                        className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80"
                        style={{ color: '#fff', background: PRIMARY, borderRadius: 8 }}>
                        Done
                      </button>
                    </div>
                  </>
                )}
              />
            </div>
          ) : (
            <button onClick={() => setAddingSigners(true)}
              className="mb-2 flex items-center justify-center gap-2 w-full py-2 rounded-lg text-[12px] font-semibold transition-all hover:shadow-sm active:scale-[0.98]"
              style={{ color: PRIMARY, background: 'var(--ds-primaryLight, #FFF7ED)', border: `1px dashed ${PRIMARY}` }}>
              <PlusOutlined style={{ fontSize: 11 }} />
              <span>Add Person</span>
            </button>
          )}

          {/* Signer cards */}
          {signers.length > 0 && (
            <div className="mb-2 flex items-center justify-end">
              <span />
              {signersPages.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    size="small"
                    type="text"
                    icon={<LeftOutlined />}
                    onClick={() => scrollRecipientRow(signersRowRef, 'left')}
                    style={{ color: 'var(--ds-textMuted, #94a3b8)' }}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<RightOutlined />}
                    onClick={() => scrollRecipientRow(signersRowRef, 'right')}
                    style={{ color: 'var(--ds-textMuted, #94a3b8)' }}
                  />
                </div>
              )}
            </div>
          )}

          <div
            ref={signersRowRef}
            className="flex gap-3 overflow-x-auto pb-1"
            style={{ scrollBehavior: 'smooth', scrollbarWidth: 'none', msOverflowStyle: 'none', scrollSnapType: 'x mandatory' }}
          >
          {signersPages.map((page, pageIdx) => (
            <div
              key={`signers-page-${pageIdx}`}
              className="grid flex-shrink-0 grid-cols-3 gap-2"
              style={{ minWidth: '100%', scrollSnapAlign: 'start' }}
            >
              {page.map((r, i) => {
                const globalIdx = pageIdx * 9 + i
                const isSelf = r.userId === currentUser?._id || r.email === currentUser?.email
                const color = SIGNER_COLORS[globalIdx % SIGNER_COLORS.length]
                return (
                  <div key={r.userId || r.email || globalIdx}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-2 group transition-all hover:shadow-sm"
                    style={{ background: 'var(--ds-bgSecondary, #f8fafc)', borderColor: 'var(--ds-border, #f0f0f0)', minHeight: 52 }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                      style={{ background: color }}>
                      {globalIdx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--ds-text)' }}>
                        {isSelf ? 'You (Admin)' : r.name}
                      </div>
                    </div>
                    {!isSelf && (
                      <button onClick={() => handleOtherSignersChange(otherSignerIds.filter((id) => id !== r.userId))}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 bg-red-50 border border-red-100 opacity-100 group-hover:bg-red-100 hover:text-red-700 transition-all flex-shrink-0 shadow-sm">
                        <DeleteOutlined style={{ fontSize: 15 }} />
                      </button>
                    )}
                  </div>
                )
              })}
              {page.length < 9 && Array.from({ length: 9 - page.length }, (_, fillerIdx) => (
                <div key={`signer-filler-${pageIdx}-${fillerIdx}`} className="rounded-lg" style={{ minHeight: 52 }} />
              ))}
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  )

  // CC Recipients panel
  const ccPanel = (
    <div className="rounded-2xl p-4" style={{ background: 'var(--ds-card, #fff)', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)', border: '1px solid var(--ds-border, #f0f0f0)' }}>
      <label className="flex items-center justify-between w-full mb-2 cursor-pointer select-none">
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={needCC} onChange={(e) => toggleCC(e.target.checked)}
            className="rounded flex-shrink-0" style={{ accentColor: PRIMARY, width: 16, height: 16 }} />
          <span className="text-sm font-bold" style={{ color: 'var(--ds-text)' }}>Click here to send completed document to the CC users</span>
        </div>
        <div className="flex items-center gap-2">
          {needCC && ccRecipients.length > 0 && (
            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold"
              style={{ background: 'var(--ds-bgSecondary, #f1f5f9)', color: 'var(--ds-textMuted, #64748b)', border: '1px solid var(--ds-border, #e2e8f0)' }}>{ccRecipients.length}</span>
          )}
          {needCC && (
            <button onClick={(e) => { e.preventDefault(); setCcOpen(!ccOpen) }}>
              <DownOutlined style={{ fontSize: 9, color: 'var(--ds-textMuted, #cbd5e1)', transform: ccOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
          )}
        </div>
      </label>

      {needCC && ccOpen && (
        <div>
          {ccRecipients.length > 0 && (
            <div className="mb-2 flex items-center justify-end">
              <span />
              {ccPages.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    size="small"
                    type="text"
                    icon={<LeftOutlined />}
                    onClick={() => scrollRecipientRow(ccRowRef, 'left')}
                    style={{ color: 'var(--ds-textMuted, #94a3b8)' }}
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<RightOutlined />}
                    onClick={() => scrollRecipientRow(ccRowRef, 'right')}
                    style={{ color: 'var(--ds-textMuted, #94a3b8)' }}
                  />
                </div>
              )}
            </div>
          )}

          <div
            ref={ccRowRef}
            className="flex gap-3 overflow-x-auto pb-1"
            style={{ scrollBehavior: 'smooth', scrollbarWidth: 'none', msOverflowStyle: 'none', scrollSnapType: 'x mandatory' }}
          >
          {ccPages.map((page, pageIdx) => (
            <div
              key={`cc-page-${pageIdx}`}
              className="grid flex-shrink-0 grid-cols-3 gap-2"
              style={{ minWidth: '100%', scrollSnapAlign: 'start' }}
            >
              {page.map((r, i) => (
                <div key={r.userId || r.email || `${pageIdx}-${i}`}
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-2 group transition-all hover:shadow-sm"
                  style={{ background: 'var(--ds-bgSecondary, #f8fafc)', borderColor: 'var(--ds-border, #f0f0f0)', minHeight: 52 }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: 'var(--ds-textMuted, #94a3b8)' }}>
                    {r.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--ds-text)' }}>{r.name}</div>
                  </div>
                  <button onClick={() => {
                      const updated = selectedCCIds.filter((id) => id !== r.userId)
                      setSelectedCCIds(updated)
                      handleCCChange(updated)
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 bg-red-50 border border-red-100 opacity-100 group-hover:bg-red-100 hover:text-red-700 transition-all flex-shrink-0 shadow-sm">
                    <DeleteOutlined style={{ fontSize: 15 }} />
                  </button>
                </div>
              ))}
              {page.length < 9 && Array.from({ length: 9 - page.length }, (_, fillerIdx) => (
                <div key={`cc-filler-${pageIdx}-${fillerIdx}`} className="rounded-lg" style={{ minHeight: 52 }} />
              ))}
            </div>
          ))}
          </div>

          {/* + Add person */}
          {addingCC ? (
            <div className="mt-2">
              <Select
                mode="multiple"
                showSearch
                autoFocus
                open
                placeholder="Search users..."
                value={selectedCCIds}
                onChange={handleCCChange}
                optionFilterProp="label"
                size="small"
                style={{ width: '100%', borderRadius: 8 }}
                options={availableForCC.map((u) => ({
                  value: u._id,
                  label: u.full_name || `${u.first_name} ${u.last_name}`,
                }))}
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <div className="px-2 py-1.5 border-t" style={{ borderColor: '#f0f0f0' }}>
                      <button onClick={() => setAddingCC(false)}
                        className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80"
                        style={{ color: '#fff', background: PRIMARY, borderRadius: 8 }}>
                        Done
                      </button>
                    </div>
                  </>
                )}
              />
            </div>
          ) : (
            <button onClick={() => setAddingCC(true)}
              className="mt-2 flex items-center justify-center gap-2 w-full py-2 rounded-lg text-[12px] font-semibold transition-all hover:shadow-sm active:scale-[0.98]"
              style={{ color: PRIMARY, background: 'var(--ds-primaryLight, #FFF7ED)', border: `1px dashed ${PRIMARY}` }}>
              <PlusOutlined style={{ fontSize: 11 }} />
              <span>Add Person</span>
            </button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <>
      {signersPanel}
      <div className="mt-3">{ccPanel}</div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 *  UPLOAD DROPZONE — initial PDF picker
 * ═══════════════════════════════════════════════════════════════════ */
const UploadDropzone = ({ onFileSelected, uploading, loadingDoc }) => {
  const inputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)

  const pickFile = () => inputRef.current?.click()

  const onChange = (e) => {
    const file = e.target.files?.[0]
    if (file) onFileSelected(file)
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  if (loadingDoc) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin tip="Loading document..." />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={pickFile}
        className="cursor-pointer rounded-2xl flex flex-col items-center justify-center px-10 py-14 transition-all"
        style={{
          width: '100%',
          maxWidth: 560,
          border: `2px dashed ${dragActive ? PRIMARY : 'var(--ds-border, #e2e8f0)'}`,
          background: dragActive ? 'var(--ds-primaryLight, #FFF7ED)' : 'var(--ds-bgSecondary, #f8fafc)',
        }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'var(--ds-primaryLight, #FFF7ED)', border: `1px solid ${PRIMARY}` }}
        >
          <CloudUploadOutlined style={{ fontSize: 30, color: PRIMARY }} />
        </div>
        <div className="text-base font-semibold mb-1" style={{ color: 'var(--ds-text)' }}>
          {uploading ? 'Uploading…' : 'Upload a PDF to get started'}
        </div>
        <div className="text-xs mb-5" style={{ color: 'var(--ds-textMuted)' }}>
          Click to browse or drag and drop · PDF only · Max 10 MB
        </div>
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          loading={uploading}
          onClick={(e) => { e.stopPropagation(); pickFile() }}
          style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 8, height: 38, paddingInline: 20, fontWeight: 600 }}
        >
          Choose File
        </Button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onChange} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 *  ENVELOPE EDITOR — Two-step wizard
 *  Step 1: Setup (doc, recipients, CC, note)
 *  Step 2: Place fields on document
 * ═══════════════════════════════════════════════════════════════════ */
const EnvelopeEditor = ({ existingEnvelope, onBack, onComplete }) => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { user: currentUser } = useSelector((s) => s.auth)
  const { usersList: users } = useSelector((s) => s.accountData || { usersList: [] })
  const [saving, setSaving] = useState(false)
  const previewScrollRef = useRef(null)
  const previewImgRef = useRef(null)
  const fileRef = useRef(null)

  const [title, setTitle] = useState(existingEnvelope?.title || '')
  const [description, setDescription] = useState(existingEnvelope?.description || '')
  // Only hydrate doc from an existing envelope if we have a fileUrl to re-render from.
  // Legacy drafts without fileUrl will show the upload dropzone so the user can re-attach.
  const [doc, setDoc] = useState(existingEnvelope?.document?.fileUrl ? existingEnvelope.document : null)
  const [docBase64, setDocBase64] = useState('')
  const [docDataUrl, setDocDataUrl] = useState('')
  const [recipients, setRecipients] = useState(existingEnvelope?.recipients || [])
  const [tabs, setTabs] = useState(existingEnvelope?.tabs || [])
  const [emailSubject, setEmailSubject] = useState(existingEnvelope?.settings?.emailSubject || '')
  const [emailBody, setEmailBody] = useState(existingEnvelope?.settings?.emailBody || '')
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pageCount, setPageCount] = useState(existingEnvelope?.document?.pageCount || 0)
  const [pageHeights, setPageHeights] = useState([])
  const [initialsOnAllPages, setInitialsOnAllPages] = useState(existingEnvelope?.settings?.initialsOnAllPages || false)
  const [signerDrawerOpen, setSignerDrawerOpen] = useState(false)
  const [ccDrawerOpen, setCcDrawerOpen] = useState(false)

  // ── Placement mode (fast-place vs manual) ────────────────────────
  // Seeded from the envelope settings so draft reloads restore the choice.
  const [placementMode, setPlacementMode] = useState(existingEnvelope?.settings?.placementMode || null)
  // Show the "How is your document set up?" modal on first entry if no mode
  // has been picked yet (new envelope, or a legacy draft without the setting).
  const [showModeModal, setShowModeModal] = useState(!existingEnvelope?.settings?.placementMode)
  // Armed signer + tool in fast-place mode. Keyed by stable signerKey
  // (userId || email), NOT by array index — safe against reorder/delete.
  const [placementIntent, setPlacementIntent] = useState(null)
  const getSignerKey = useCallback((r) => (r?.userId || r?.email || ''), [])

  // Re-render a draft's saved PDF (stored as fileUrl on the envelope.document).
  // fileUrl may be an absolute backend URL (e.g. http://host/uploads/foo.pdf)
  // or — in mock mode — a localStorage key. We rewrite backend URLs to same-
  // origin paths so the Vite dev proxy can bypass CORS on /uploads, then
  // resolve via getFileData for the localStorage key case.
  useEffect(() => {
    const savedUrl = existingEnvelope?.document?.fileUrl
    if (!savedUrl || docDataUrl) return
    let cancelled = false
    setLoadingDoc(true)

    const load = async () => {
      try {
        // If savedUrl points at the backend host, strip the origin so it
        // becomes a relative path routed through the dev proxy.
        let rewritten = savedUrl
        try {
          const apiBase = import.meta.env.VITE_API_URL || ''
          const backendHost = apiBase ? new URL(apiBase).hostname : ''
          const parsed = new URL(savedUrl)
          if (backendHost && parsed.hostname === backendHost) {
            rewritten = parsed.pathname + parsed.search
          }
        } catch { /* not an absolute URL — leave as-is for getFileData */ }

        const resolved = await getFileData(rewritten)
        if (cancelled) return
        if (!resolved) {
          message.error('Failed to load saved document')
          setLoadingDoc(false)
          return
        }

        const result = await loadPdfAsImage(resolved)
        if (cancelled) return
        if (result) {
          setDocDataUrl(result.dataUrl)
          setPageCount(result.pageCount)
          setPageHeights(result.pageHeights || [])
        } else {
          message.error('Failed to load saved document')
        }
      } catch (err) {
        console.error('[DocuSignPanel] Draft PDF load failed:', err)
        if (!cancelled) message.error('Failed to load saved document')
      } finally {
        if (!cancelled) setLoadingDoc(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFile = useCallback(async (e) => {
    // Accept either an event (from <input>) or a File directly (from the dropzone)
    const file = e?.target?.files?.[0] || e
    if (!file || file.type !== 'application/pdf') return message.error('Please upload a PDF document')
    if (file.size > 10e6) return message.error('File size must be under 10 MB')

    setUploading(true)
    try {
      // 1. Count pages + render preview locally from the File (fast, no network)
      let numPages = 0
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        numPages = pdf.numPages
      } catch {
        message.error('Could not read PDF')
        setUploading(false)
        return
      }

      // Render stitched preview image from the file itself via an object URL
      const objectUrl = URL.createObjectURL(file)
      const rendered = await loadPdfAsImage(objectUrl)
      URL.revokeObjectURL(objectUrl)
      if (!rendered) {
        message.error('Failed to render PDF preview')
        setUploading(false)
        return
      }

      // 2. Read raw PDF base64 (needed by DocuSign API on send)
      const readerPromise = new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const base64 = await readerPromise

      // 3. Upload to backend so the draft persists across reloads
      let fileUrl = ''
      try {
        const uploadResult = await uploadFile(file)
        fileUrl = uploadResult?.media || ''
      } catch (err) {
        console.error('[DocuSign] Upload failed:', err)
        message.error('Failed to upload document to server')
        setUploading(false)
        return
      }

      // 4. Commit state — all local variables, no stale closure reads
      setDocDataUrl(rendered.dataUrl)
      setDocBase64(base64)
      setPageCount(numPages)
      setPageHeights(rendered.pageHeights || [])
      setDoc({
        source: 'upload',
        fileName: file.name,
        fileSize: file.size,
        pageCount: numPages,
        mimeType: 'application/pdf',
        fileUrl,
      })
      setTitle((prev) => prev || file.name.replace(/\.pdf$/i, ''))
      message.success('Document uploaded')
    } finally {
      setUploading(false)
    }
  }, [])

  const settings = useMemo(() => ({ enableReminders: true, reminderDelayDays: 1, reminderFrequencyDays: 2, expirationDays: 30, emailSubject, emailBody, initialsOnAllPages, placementMode }), [emailSubject, emailBody, initialsOnAllPages, placementMode])

  const saveDraft = async () => {
    if (!title.trim()) return message.warning('Please add an email subject')
    setSaving(true)
    try {
      if (existingEnvelope?._id) {
        await dispatch(updateDocuSignEnvelope({ id: existingEnvelope._id, title, description, document: doc, recipients, tabs, settings })).unwrap()
      } else {
        await dispatch(createDocuSignEnvelope({ title, description, document: doc, recipients, tabs, settings, sendNow: false })).unwrap()
      }
      message.success('Envelope saved as draft')
      onComplete()
    } catch (err) { message.error(err || 'Failed to save envelope') } finally { setSaving(false) }
  }

  // Check if admin has fields assigned to them
  const adminRecipientIndex = useMemo(() => {
    return recipients.findIndex((r) =>
      (r.userId === currentUser?._id || r.email === currentUser?.email) && r.role === 'signer'
    )
  }, [recipients, currentUser])

  const adminHasFields = useMemo(() => {
    if (adminRecipientIndex < 0) return false
    return tabs.some((t) => t.recipientIndex === adminRecipientIndex)
  }, [tabs, adminRecipientIndex])

  const send = async () => {
    if (!doc) return message.warning('Please add a document to the envelope')
    if (!recipients.some((r) => r.role === 'signer')) return message.warning('Please add at least one signer')
    const hasSignOrInitial = tabs.some((t) => t.type === 'signHere' || t.type === 'initialHere')
    if (!hasSignOrInitial) return message.warning('Please place at least one signature or initial field on the document before sending')
    setSaving(true)
    try {
      let envelopeId = existingEnvelope?._id

      if (envelopeId) {
        await dispatch(updateDocuSignEnvelope({ id: envelopeId, title, description, document: doc, recipients, tabs, settings })).unwrap()
      } else {
        const result = await dispatch(createDocuSignEnvelope({ title, description, document: doc, recipients, tabs, settings, sendNow: false })).unwrap()
        envelopeId = result.data?._id
      }

      // Always send directly — no more "Sign & Send" detour.
      // If the admin self-added via "I need to sign this document", they
      // already sit at the highest routingOrder (see toggleSelfSignerHelper),
      // so the envelope will surface in their Received tab as a counter-sign
      // task once all other signers have signed.
      await dispatch(sendDocuSignEnvelope({ id: envelopeId, documentBase64: docBase64 })).unwrap()
      message.success(
        adminHasFields
          ? 'Envelope sent — you\'ll counter-sign from the Received tab once all signers have signed'
          : 'Envelope sent for signing',
      )
      onComplete()
    } catch (err) { message.error(err || 'Failed to send envelope') } finally { setSaving(false) }
  }

  const signerCount = recipients.filter((r) => r.role === 'signer').length
  const manualFieldCount = tabs.filter((t) => !t._autoInitial).length

  // Step 2 signer/CC helpers
  const step2Signers = useMemo(() => recipients.filter((r) => r.role === 'signer'), [recipients])
  const step2CC = useMemo(() => recipients.filter((r) => r.role === 'cc'), [recipients])
  const isSelfSigner = useMemo(() => step2Signers.some((r) => r.userId === currentUser?._id || r.email === currentUser?.email), [step2Signers, currentUser])
  const availableUsers = useMemo(() => (users || []).filter((u) => u.email && u._id !== currentUser?._id), [users, currentUser])

  const toggleSelfSigner = (checked) => setRecipients(toggleSelfSignerHelper(recipients, currentUser, checked))

  const handleStep2SignerChange = (selectedIds) => {
    const ccList = recipients.filter((r) => r.role === 'cc')
    setRecipients(buildRecipientUpdate(recipients, currentUser, selectedIds, users, ccList))
  }

  const handleStep2CCChange = (selectedIds) => setRecipients(buildCCUpdate(recipients, selectedIds, users))

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 100px)' }}>
      {/* ── "How is your document set up?" mode picker ──
          Shown on first entry (and re-openable via the sidebar). The choice
          drives whether clicks open the popover (manual) or drop a field for
          the currently-armed signer (fastPlace). Suppressed until the admin
          actually has a document attached. */}
      {doc && (
        <Modal
          open={showModeModal}
          onCancel={() => { if (placementMode) setShowModeModal(false) }}
          footer={null}
          width={520}
          centered
          maskClosable={!!placementMode}
          closable={!!placementMode}
          title={
            <div>
              <div className="text-base font-bold" style={{ color: 'var(--ds-text)' }}>How is your document set up?</div>
              <div className="text-[12px] font-normal mt-1" style={{ color: 'var(--ds-textMuted)' }}>
                This changes how field placement works.
              </div>
            </div>
          }
        >
          <div className="space-y-2 mt-2">
            {[
              {
                key: 'manual',
                title: 'Nothing pre-printed',
                description: "I'll pick a signer on each click. A popover asks who signs where.",
                accent: '#3b82f6',
              },
              {
                key: 'fastPlace',
                title: 'Names already printed next to sign/initial spots',
                description: "I'll arm a signer from the sidebar, then click on the doc to drop their signature or initial — no popover.",
                accent: PRIMARY,
              },
            ].map((opt) => {
              const selected = placementMode === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => {
                    setPlacementMode(opt.key)
                    setShowModeModal(false)
                    // Switching modes should not accidentally carry an armed
                    // intent across — clear it so each mode entry starts clean
                    // (auto-arm single-signer effect will rearm if appropriate).
                    setPlacementIntent(null)
                  }}
                  className="w-full text-left flex items-start gap-3 p-3 rounded-lg transition-all hover:shadow-sm"
                  style={{
                    background: selected ? `${opt.accent}10` : 'var(--ds-bgSecondary, #f8fafc)',
                    border: `1.5px ${selected ? 'solid' : 'dashed'} ${selected ? opt.accent : 'var(--ds-border, #e2e8f0)'}`,
                  }}
                >
                  <div
                    className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ background: opt.accent }}
                  >
                    {opt.key === 'manual' ? '◉' : '⚡'}
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold" style={{ color: 'var(--ds-text)' }}>{opt.title}</div>
                    <div className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--ds-textMuted)' }}>{opt.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
          {!placementMode && (
            <div className="mt-3 text-[11px]" style={{ color: 'var(--ds-textMuted)' }}>
              Pick an option to continue. You can change this later from the sidebar.
            </div>
          )}
        </Modal>
      )}

      {/* ── Header — sticky with inline step indicator ── */}
      <div className="flex items-center gap-2 px-3 py-1 flex-shrink-0 sticky top-0 z-20" style={{ borderBottom: '1px solid var(--ds-border)', background: 'var(--ds-bg, #fff)' }}>
        <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ color: 'var(--ds-textMuted)' }} />

        {/* Doc info inline */}
        {doc && (
          <div className="flex items-center gap-2 rounded-md px-2 py-1" style={{ background: 'var(--ds-bgSecondary, #f8fafc)', border: '1px solid var(--ds-border, #e2e8f0)' }}>
            <FileTextOutlined style={{ color: PRIMARY, fontSize: 13 }} />
            <span className="text-[12px] font-medium truncate" style={{ color: 'var(--ds-text)', maxWidth: 180 }}>{doc.fileName}</span>
            {pageCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--ds-textMuted, #64748b)', background: 'var(--ds-border, #e2e8f0)' }}>
                {pageCount}pg
              </span>
            )}
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded transition-colors hover:opacity-80"
              style={{ color: PRIMARY, background: 'var(--ds-primaryLight, #FFF7ED)', border: `1px solid ${PRIMARY}` }}>
              <ReloadOutlined style={{ fontSize: 10 }} />
              Replace
            </button>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Button size="small" onClick={saveDraft} loading={saving}
            style={{ borderRadius: 6, height: 30, paddingInline: 14, fontWeight: 500, fontSize: 12 }}>
            Save Draft
          </Button>
          <Button type="primary" size="small" icon={<SendOutlined />} onClick={send} loading={saving}
            style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 6, height: 30, paddingInline: 16, fontWeight: 600, fontSize: 12 }}>
            Send
          </Button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />

      {/* ── Field Placement View (requires a document) ── */}
      <div className="flex-1 min-h-0">
        {!doc ? (
          <UploadDropzone
            onFileSelected={(file) => handleFile(file)}
            uploading={uploading}
            loadingDoc={loadingDoc}
          />
        ) : (
          <DocumentFieldPlacer
            tabs={tabs}
            onChange={setTabs}
            recipients={recipients}
            documentBase64={docDataUrl || docBase64}
            document={doc}
            pageCount={pageCount}
            pageHeights={pageHeights}
            onReplaceDoc={() => fileRef.current?.click()}
            note={description}
            onNoteChange={(val) => setDescription(val)}
            initialsOnAllPagesEnabled={initialsOnAllPages}
            onInitialsOnAllPagesChange={setInitialsOnAllPages}
            placementMode={placementMode}
            placementIntent={placementIntent}
            onPlacementIntentChange={setPlacementIntent}

            sidebarTopContent={
              <>
                {/* ── Mode indicator / switch ── */}
                {placementMode && (
                  <div
                    className="mb-2 flex items-center justify-between px-2.5 py-1.5 rounded-md"
                    style={{ background: 'var(--ds-bgSecondary, #f1f5f9)', border: '1px solid var(--ds-border, #e2e8f0)' }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9px] font-bold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--ds-textMuted)' }}>Mode:</span>
                      <span className="text-[11px] font-semibold truncate" style={{ color: PRIMARY }}>
                        {placementMode === 'fastPlace' ? 'Fast-place (pre-printed)' : 'Manual (click to choose)'}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowModeModal(true)}
                      className="text-[10px] font-semibold flex-shrink-0 ml-2"
                      style={{ color: PRIMARY }}
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* ── Fast-place hint banner ── */}
                {placementMode === 'fastPlace' && step2Signers.length > 0 && (
                  <div
                    className="mb-2 px-2.5 py-1.5 rounded-md text-[10px] leading-snug"
                    style={{ background: `${PRIMARY}10`, border: `1px dashed ${PRIMARY}50`, color: 'var(--ds-textSecondary)' }}
                  >
                    {placementIntent ? (
                      <>
                        <b style={{ color: PRIMARY }}>Armed:</b>{' '}
                        {(() => {
                          const armed = step2Signers.find((r) => getSignerKey(r) === placementIntent.signerKey)
                          const name = armed?.name?.split(' ')[0] || 'signer'
                          const tool = placementIntent.tool === 'signHere' ? 'Signature' : 'Initial'
                          return <>{tool} · {name} — click on doc to drop, ESC to cancel.</>
                        })()}
                      </>
                    ) : (
                      <>Pick a signer's <b>Sign</b> or <b>Initial</b> below, then click on the doc to drop a field.</>
                    )}
                  </div>
                )}

                {/* Signer card */}
                <div className="mb-2 rounded-lg px-3 py-2.5" style={{ background: 'var(--ds-bgSecondary, #f8fafc)', border: '1px solid var(--ds-border, #e2e8f0)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ds-textMuted)' }}>Signers ({step2Signers.length})</span>
                    <button onClick={() => setSignerDrawerOpen(true)} className="text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all hover:opacity-80" style={{ color: '#fff', background: PRIMARY }}>+ Add Signer</button>
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <Checkbox checked={isSelfSigner} onChange={(e) => toggleSelfSigner(e.target.checked)} />
                    <span className="text-[13px] font-medium" style={{ color: 'var(--ds-text)' }}>I need to sign this document</span>
                  </label>
                  {step2Signers.length > 0 && placementMode !== 'fastPlace' && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {step2Signers.map((r, i) => (
                        <span key={r.userId || r.email || i} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: `${PRIMARY}15`, color: PRIMARY, border: `1px solid ${PRIMARY}30` }}>
                          {(r.userId === currentUser?._id || r.email === currentUser?.email) ? 'You' : r.name?.split(' ')[0]}
                        </span>
                      ))}
                    </div>
                  )}
                  {step2Signers.length > 0 && placementMode === 'fastPlace' && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      {step2Signers.map((r, i) => {
                        const key = getSignerKey(r)
                        const color = SIGNER_COLORS[i % SIGNER_COLORS.length]
                        const isArmedSign = placementIntent?.signerKey === key && placementIntent?.tool === 'signHere'
                        const isArmedInitial = placementIntent?.signerKey === key && placementIntent?.tool === 'initialHere'
                        const firstName = (r.userId === currentUser?._id || r.email === currentUser?.email) ? 'You' : (r.name?.split(' ')[0] || 'Signer')
                        return (
                          <div
                            key={key || i}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                            style={{
                              background: (isArmedSign || isArmedInitial) ? `${color}12` : '#fff',
                              border: `1px solid ${(isArmedSign || isArmedInitial) ? color : 'var(--ds-border, #e2e8f0)'}`,
                            }}
                          >
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                              style={{ background: color }}
                              title={r.name}
                            >
                              {i + 1}
                            </div>
                            <span className="text-[11px] font-semibold truncate flex-1" style={{ color: 'var(--ds-text)' }}>
                              {firstName}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPlacementIntent(isArmedSign ? null : { signerKey: key, tool: 'signHere' })}
                              className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-all"
                              style={{
                                background: isArmedSign ? color : `${color}15`,
                                color: isArmedSign ? '#fff' : color,
                                border: `1px solid ${color}${isArmedSign ? '' : '40'}`,
                              }}
                              title="Arm this signer to place signature fields"
                            >
                              Sign
                            </button>
                            <button
                              type="button"
                              onClick={() => setPlacementIntent(isArmedInitial ? null : { signerKey: key, tool: 'initialHere' })}
                              className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-all"
                              style={{
                                background: isArmedInitial ? color : `${color}15`,
                                color: isArmedInitial ? '#fff' : color,
                                border: `1px solid ${color}${isArmedInitial ? '' : '40'}`,
                              }}
                              title="Arm this signer to place initial fields"
                            >
                              Initial
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* CC card */}
                <div className="mb-2 rounded-lg px-3 py-2.5" style={{ background: 'var(--ds-bgSecondary, #f8fafc)', border: '1px solid var(--ds-border, #e2e8f0)' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ds-textMuted)' }}>CC ({step2CC.length})</span>
                    <button onClick={() => setCcDrawerOpen(true)} className="text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all hover:opacity-80" style={{ color: '#fff', background: '#3b82f6' }}>+ Add CC Users</button>
                  </div>
                  <span className="text-[11px]" style={{ color: 'var(--ds-textMuted)' }}>
                    {step2CC.length > 0 ? 'Completed document will be sent to CC users' : 'Click + Add CC Users to send completed document'}
                  </span>
                  {step2CC.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {step2CC.map((r, i) => (
                        <span key={r.userId || r.email || i} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#3b82f615', color: '#3b82f6', border: '1px solid #3b82f630' }}>
                          {r.name?.split(' ')[0]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Signer Drawer */}
                <Drawer title="Add Signers" placement="right" width={360} open={signerDrawerOpen} onClose={() => setSignerDrawerOpen(false)}
                  footer={<Button type="primary" block onClick={() => setSignerDrawerOpen(false)} style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 8, height: 42, fontWeight: 600 }}>Done</Button>}>
                  <div className="text-xs mb-3" style={{ color: '#64748b' }}>Select users who need to sign this document</div>
                  <Select
                    mode="multiple" showSearch placeholder="Search users..."
                    value={step2Signers.filter((r) => r.userId !== currentUser?._id && r.email !== currentUser?.email).map((r) => r.userId).filter(Boolean)}
                    onChange={handleStep2SignerChange} optionFilterProp="label"
                    style={{ width: '100%', borderRadius: 8 }}
                    options={availableUsers.map((u) => ({ value: u._id, label: u.full_name || `${u.first_name} ${u.last_name}` }))}
                  />
                  {step2Signers.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Selected Signers ({step2Signers.length})</div>
                      {step2Signers.map((r, i) => {
                        const isSelf = r.userId === currentUser?._id || r.email === currentUser?.email
                        return (
                          <div key={r.userId || r.email || i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#f8fafc', border: '1px solid #f0f0f0' }}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: PRIMARY }}>{i + 1}</div>
                              <span className="text-[13px] font-medium">{isSelf ? 'You (Admin)' : r.name}</span>
                            </div>
                            {!isSelf && (
                              <button onClick={() => handleStep2SignerChange(step2Signers.filter((s) => s.userId !== r.userId).filter((s) => s.userId !== currentUser?._id && s.email !== currentUser?.email).map((s) => s.userId).filter(Boolean))}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-all" style={{ border: '1px solid #fecaca' }}>
                                <DeleteOutlined style={{ fontSize: 12 }} />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Drawer>

                {/* CC Drawer */}
                <Drawer title="Add CC Recipients" placement="right" width={360} open={ccDrawerOpen} onClose={() => setCcDrawerOpen(false)}
                  footer={<Button type="primary" block onClick={() => setCcDrawerOpen(false)} style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 8, height: 42, fontWeight: 600 }}>Done</Button>}>
                  <div className="text-xs mb-3" style={{ color: '#64748b' }}>Select users to receive the completed document</div>
                  <Select
                    mode="multiple" showSearch placeholder="Search users..."
                    value={step2CC.map((r) => r.userId).filter(Boolean)}
                    onChange={handleStep2CCChange} optionFilterProp="label"
                    style={{ width: '100%', borderRadius: 8 }}
                    options={(users || []).filter((u) => u.email).map((u) => ({ value: u._id, label: u.full_name || `${u.first_name} ${u.last_name}` }))}
                  />
                  {step2CC.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>CC Recipients ({step2CC.length})</div>
                      {step2CC.map((r, i) => (
                        <div key={r.userId || r.email || i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#f8fafc', border: '1px solid #f0f0f0' }}>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: '#3b82f6' }}>{r.name?.charAt(0)?.toUpperCase()}</div>
                            <span className="text-[13px] font-medium">{r.name}</span>
                          </div>
                          <button onClick={() => handleStep2CCChange(step2CC.filter((c) => c.userId !== r.userId).map((c) => c.userId).filter(Boolean))}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-all" style={{ border: '1px solid #fecaca' }}>
                            <DeleteOutlined style={{ fontSize: 12 }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Drawer>
              </>
            }
          />
        )}
        </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 *  USER SIDE — Shows only envelopes sent TO this user by admin.
 *  Fetches from API. No dummy data. Shows with correct field coordinates.
 * ═══════════════════════════════════════════════════════════════════ */

const RECEIVED_STATUS = {
  draft: { color: '#E8930C', bg: '#FFF7ED', label: 'Action Required', icon: <ClockCircleFilled /> },
  sent: { color: '#E8930C', bg: '#FFF7ED', label: 'Action Required', icon: <ClockCircleFilled /> },
  delivered: { color: '#E8930C', bg: '#FFF7ED', label: 'Action Required', icon: <ClockCircleFilled /> },
  completed: { color: '#22c55e', bg: '#f0fdf4', label: 'Completed', icon: <CheckCircleFilled /> },
  declined: { color: '#ef4444', bg: '#fef2f2', label: 'Declined', icon: <CloseOutlined /> },
}

const ReceivedEnvelopes = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useSelector((s) => s.auth)
  const { envelopes: apiEnvelopes, isLoading } = useSelector((s) => s.docusign)
  const [refreshing, setRefreshing] = useState(false)
  const [viewingEnvelope, setViewingEnvelope] = useState(null)
  // Track which envelopes user has accepted digital signature for
  const [acceptedIds, setAcceptedIds] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('ds-accepted-ids') || '[]')) }
    catch { return new Set() }
  })

  const acceptEnvelope = (id) => {
    const updated = new Set([...acceptedIds, id])
    setAcceptedIds(updated)
    sessionStorage.setItem('ds-accepted-ids', JSON.stringify([...updated]))
  }

  const revokeAcceptance = (id) => {
    const updated = new Set([...acceptedIds])
    updated.delete(id)
    setAcceptedIds(updated)
    sessionStorage.setItem('ds-accepted-ids', JSON.stringify([...updated]))
  }

  // Fetch envelopes on mount
  useEffect(() => {
    dispatch(fetchDocuSignEnvelopes())
  }, [dispatch])

  const handleRefresh = async () => {
    setRefreshing(true)
    await dispatch(fetchDocuSignEnvelopes())
    setRefreshing(false)
  }

  // Only show envelopes where this user is a signer (not CC)
  const myEnvelopes = useMemo(() => {
    return apiEnvelopes.filter((env) => {
      return env.recipients?.some((r) =>
        (r.userId === user?._id || r.email === user?.email) && r.role === 'signer'
      )
    })
  }, [apiEnvelopes, user])

  // Check if current user's recipient status is signed/completed
  const myRecipientSigned = useCallback((env) => {
    const myRecipient = env.recipients?.find((r) =>
      (r.userId === user?._id || r.email === user?.email) && r.role === 'signer'
    )
    return myRecipient?.status === 'signed' || myRecipient?.status === 'completed'
  }, [user])

  const actionEnvelopes = useMemo(() => myEnvelopes.filter((e) =>
    ['draft', 'sent', 'delivered'].includes(e.status) && !myRecipientSigned(e)
  ), [myEnvelopes, myRecipientSigned])

  const completedEnvelopes = useMemo(() => myEnvelopes.filter((e) =>
    e.status === 'completed' || myRecipientSigned(e)
  ), [myEnvelopes, myRecipientSigned])

  // Render a list of envelope cards
  const renderEnvelopeCards = (list, emptyText) => {
    if (isLoading) return <div className="flex justify-center py-16"><Spin /></div>
    if (list.length === 0) return (
      <div className="text-center py-16">
        <InboxOutlined style={{ fontSize: 48, color: 'var(--ds-textMuted)' }} />
        <div className="text-sm mt-3" style={{ color: 'var(--ds-textMuted)' }}>{emptyText}</div>
      </div>
    )
    return (
      <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
        {list.map((env) => {
          const myRecipient = env.recipients?.find((r) => r.userId === user?._id || r.email === user?.email) || env.recipients?.[0]
          const iMySigned = myRecipient?.status === 'signed' || myRecipient?.status === 'completed'
          const st = iMySigned && env.status !== 'completed'
            ? { color: '#22c55e', bg: '#f0fdf4', label: 'You Signed', icon: <CheckCircleFilled /> }
            : (RECEIVED_STATUS[env.status] || RECEIVED_STATUS.sent)
          const needsAction = ['draft', 'sent', 'delivered'].includes(env.status) && !iMySigned
          const isCompleted = env.status === 'completed' || iMySigned
          const senderName = env.createdBy?.first_name
            ? `${env.createdBy.first_name} ${env.createdBy.last_name || ''}`
            : 'Admin'

          const hasAccepted = acceptedIds.has(env._id)

          return (
            <motion.div key={env._id} variants={staggerItem}
              className="rounded-xl border overflow-hidden transition-colors"
              style={{ borderColor: needsAction ? '#FDBA74' : 'var(--ds-border)', background: needsAction ? 'var(--ds-primaryLight)' : 'var(--ds-card)' }}>

              {/* Main row */}
              <div className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: st.bg }}>
                  <FileProtectOutlined style={{ fontSize: 22, color: st.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--ds-text)' }}>{env.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--ds-textSecondary)' }}>
                    From {senderName} · {env.sentAt ? dayjs(env.sentAt).format('MMM DD, YYYY') : dayjs(env.createdAt).format('MMM DD, YYYY')}
                  </div>
                  <div className="text-xs mt-1 flex items-center gap-1" style={{ color: st.color }}>
                    {st.icon} {st.label}
                    {myRecipient?.signedAt && (
                      <span style={{ color: 'var(--ds-textMuted)' }} className="ml-2">Signed {dayjs(myRecipient.signedAt).format('MMM DD, YYYY')}</span>
                    )}
                  </div>
                  {env.description && (
                    <div className="text-[11px] mt-1.5 px-2 py-1.5 rounded-md italic" style={{ color: 'var(--ds-textSecondary)', background: 'var(--ds-bgSecondary, #f9fafb)', border: '1px solid var(--ds-borderLight, #f0f0f0)' }}>
                      "{env.description}"
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <Button icon={<EyeFilled />} onClick={() => setViewingEnvelope(env)} style={{ borderRadius: 8 }}>View Signed</Button>
                  ) : null}
                </div>
              </div>

              {/* Acceptance prompt + field info (only for action-required envelopes) */}
              {needsAction && (
                <div className="px-4 pb-4">
                  {!hasAccepted ? (
                    /* Step 1: Ask for digital signature acceptance */
                    <div className="p-3 rounded-lg" style={{ background: 'var(--ds-bgSecondary)', border: '1px solid var(--ds-border)' }}>
                      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--ds-text)' }}>Do you accept digital signature?</div>
                      <div className="text-xs mb-3" style={{ color: 'var(--ds-textMuted)' }}>
                        By accepting, you agree to sign this document electronically. Your digital signature will be legally binding.
                      </div>
                      <div className="flex gap-2">
                        <Button type="primary" size="small" onClick={() => acceptEnvelope(env._id)}
                          style={{ background: '#22c55e', borderColor: '#22c55e', borderRadius: 6, fontWeight: 600 }}>Yes, I Accept</Button>
                        <Button size="small" danger style={{ borderRadius: 6 }}
                          onClick={() => {
                            Modal.confirm({
                              title: 'Reject this document?',
                              content: 'This document will be marked as rejected. The sender will be notified. This action cannot be undone.',
                              okText: 'Yes, Reject',
                              okType: 'danger',
                              cancelText: 'Cancel',
                              onOk: async () => {
                                try {
                                  await dsApi.updateRecipientStatus(env._id, {
                                    recipientEmail: myRecipient?.email || user?.email,
                                    status: 'declined',
                                    declinedReason: 'Recipient declined digital signature',
                                  })
                                  message.success('Document rejected')
                                  dispatch(fetchDocuSignEnvelopes())
                                } catch {
                                  message.error('Failed to reject document')
                                }
                              },
                            })
                          }}>No</Button>
                      </div>
                    </div>
                  ) : (
                    /* Step 2: Accepted — show fields summary + Review & Sign */
                    <div>
                      <div className="flex items-center gap-2">
                        <Button type="primary" icon={<EditOutlined />}
                          onClick={() => navigate(`/settings/dealmemo/docusign/sign/${env._id}?recipient=${encodeURIComponent(myRecipient?.email || user?.email || '')}`)}
                          style={{ background: PRIMARY, borderColor: PRIMARY, borderRadius: 8, fontWeight: 600 }}>
                          Review & Sign
                        </Button>
                        <Button size="small" onClick={() => revokeAcceptance(env._id)} style={{ borderRadius: 6, fontSize: 11, color: 'var(--ds-textMuted)' }}>
                          Step Back
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )
        })}
      </motion.div>
    )
  }

  // If viewing a completed envelope → show status tracker in receiver mode
  if (viewingEnvelope) {
    return <EnvelopeStatusTracker envelope={viewingEnvelope} onBack={() => setViewingEnvelope(null)} receiverMode />
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-lg font-bold" style={{ color: 'var(--ds-text)' }}>Documents to Sign</div>
          <div className="text-sm" style={{ color: 'var(--ds-textMuted)' }}>Review and sign documents sent to you</div>
        </div>
        <Button
          icon={<ReloadOutlined spin={refreshing} />}
          onClick={handleRefresh}
          loading={refreshing}
          style={{ borderRadius: 8 }}
        >
          Refresh
        </Button>
      </div>

      {/* Card tabs: Action Required | Completed */}
      <Tabs
        type="card"
        defaultActiveKey="action"
        items={[
          {
            key: 'action',
            label: (
              <span className="font-semibold">
                Action Required
                {actionEnvelopes.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white" style={{ background: PRIMARY }}>{actionEnvelopes.length}</span>
                )}
              </span>
            ),
            children: renderEnvelopeCards(actionEnvelopes, 'No documents waiting for your signature'),
          },
          {
            key: 'completed',
            label: <span className="font-semibold">Complete ({completedEnvelopes.length})</span>,
            children: renderEnvelopeCards(completedEnvelopes, 'No completed documents yet'),
          },
          {
            key: 'rejected',
            label: <span className="font-semibold">Rejected ({myEnvelopes.filter((e) => e.status === 'declined').length})</span>,
            children: renderEnvelopeCards(myEnvelopes.filter((e) => e.status === 'declined'), 'No rejected documents'),
          },
        ]}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 *  MAIN PANEL — role-aware: admin sees manager, user sees received
 * ═══════════════════════════════════════════════════════════════════ */
const DocuSignPanel = () => {
  const { user } = useSelector((s) => s.auth)
  const isAdmin = user?.role === 'admin'

  const [view, setView] = useState('list')
  const [selected, setSelected] = useState(null)

  const handleSelect = (env) => {
    setSelected(env)
    setView(env.status === 'draft' ? 'edit' : 'detail')
  }
  const back = () => { setView('list'); setSelected(null) }

  // User side — show only documents sent to them
  if (!isAdmin) {
    return <ReceivedEnvelopes />
  }

  // Admin side — full envelope manager with page transitions
  return (
    <AnimatePresence mode="wait">
      {view === 'list' && (
        <motion.div key="list" {...pageTransition}>
          <EnvelopeList onSelect={handleSelect} onCreate={() => { setSelected(null); setView('edit') }} user={user} />
        </motion.div>
      )}
      {view === 'edit' && (
        <motion.div key="edit" {...pageTransition}>
          <EnvelopeEditor existingEnvelope={selected} onBack={back} onComplete={back} />
        </motion.div>
      )}
      {view === 'detail' && selected && (
        <motion.div key="detail" {...pageTransition}>
          <EnvelopeStatusTracker envelope={selected} onBack={back} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default DocuSignPanel
