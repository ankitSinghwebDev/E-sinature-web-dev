/**
 * EnvelopeStatusTracker — Compact full-width detail view.
 * Top: header + status. Below: 4-column grid with progress, recipients, actions, timeline.
 */

import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  EditOutlined,
  EyeFilled,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Button, message, Progress, Space, Tag, Timeline, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { fetchDocuSignEnvelope } from '../store/store'
import * as dsApi from './api'

dayjs.extend(relativeTime)

const { Text } = Typography
const PRIMARY = '#E8930C'

const ST = {
  draft: { color: 'default', label: 'Created' },
  sent: { color: 'processing', label: 'Sent' },
  delivered: { color: 'cyan', label: 'Delivered' },
  signed: { color: 'blue', label: 'Signed' },
  completed: { color: 'success', label: 'Completed' },
  declined: { color: 'error', label: 'Declined' },
  expired: { color: 'default', label: 'Expired' },
}

const RST = {
  created: { color: 'default', label: 'Created' },
  sent: { color: 'processing', label: 'Sent' },
  delivered: { color: 'cyan', label: 'Delivered' },
  signed: { color: 'success', label: 'Completed' },
  completed: { color: 'success', label: 'Completed' },
  declined: { color: 'error', label: 'Declined' },
}

const FIELDS_LIMIT = 12

const FieldsSummary = ({ tabs, recipients }) => {
  const [expanded, setExpanded] = useState(false)
  // Group fields by type + recipient for a compact summary
  const grouped = {}
  tabs.forEach((t) => {
    const label = t.type === 'signHere' ? 'Sign' : t.type === 'initialHere' ? 'Initial' : t.type === 'dateSigned' ? 'Date' : (t.label || t.type)
    const name = recipients?.[t.recipientIndex]?.name?.split(' ')[0] || '?'
    const key = `${label} → ${name}`
    grouped[key] = (grouped[key] || 0) + 1
  })
  const entries = Object.entries(grouped)
  const visible = expanded ? entries : entries.slice(0, FIELDS_LIMIT)
  const hasMore = entries.length > FIELDS_LIMIT

  return (
    <div className="p-3 rounded-lg" style={{ background: 'var(--ds-bgSecondary)', border: '1px solid var(--ds-borderLight)' }}>
      <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--ds-text)' }}>Fields ({tabs.length})</div>
      <div className="flex flex-wrap gap-1" style={{ maxHeight: expanded ? 'none' : 160, overflow: 'hidden' }}>
        {visible.map(([key, count]) => (
          <Tag key={key} className="!text-[9px] !m-0">
            {key}{count > 1 && <span style={{ color: 'var(--ds-textMuted)' }} className="ml-0.5">×{count}</span>}
          </Tag>
        ))}
      </div>
      {hasMore && (
        <button onClick={() => setExpanded(!expanded)}
          className="text-[10px] font-medium mt-1.5 hover:underline"
          style={{ color: PRIMARY }}>
          {expanded ? 'Show less' : `+${entries.length - FIELDS_LIMIT} more...`}
        </button>
      )}
    </div>
  )
}

const EnvelopeStatusTracker = ({ envelope: init, onBack, receiverMode = false }) => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [env, setEnv] = useState(init)
  const [showAudit, setShowAudit] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try { const r = await dispatch(fetchDocuSignEnvelope(env._id)).unwrap(); if (r.data) setEnv(r.data) } catch {} finally { setRefreshing(false) }
  }, [dispatch, env._id])

  const resend = async () => { try { await dsApi.resendEnvelope(env._id); message.success('Resent'); refresh() } catch { message.error('Failed') } }
  const download = async () => { try { const res = await dsApi.downloadSignedDocument(env._id); const url = URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = `${env.title}-signed.pdf`; a.click(); URL.revokeObjectURL(url) } catch { message.error('Download failed') } }

  const signers = env.recipients?.filter((r) => r.role === 'signer' || r.role === 'in_person_signer') || []
  const done = signers.filter((r) => r.status === 'signed' || r.status === 'completed').length
  const pct = signers.length > 0 ? Math.round((done / signers.length) * 100) : 0
  const st = ST[env.status] || ST.draft

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 mb-3" style={{ borderBottom: '1px solid var(--ds-border)' }}>
        <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ color: 'var(--ds-textMuted)' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold truncate" style={{ color: 'var(--ds-text)' }}>{env.title}</span>
            <Tag color={st.color} className="!text-[10px]">{st.label}</Tag>
          </div>
          <div className="text-[11px]" style={{ color: 'var(--ds-textMuted)' }}>
            Created {dayjs(env.createdAt).format('MMM DD, YYYY [at] h:mm A')}
            {env.sentAt && ` · Sent ${dayjs(env.sentAt).format('MMM DD, YYYY [at] h:mm A')}`}
            {env.completedAt && ` · Completed ${dayjs(env.completedAt).format('MMM DD, YYYY [at] h:mm A')}`}
          </div>
        </div>
        <Space size={4}>
          <Tooltip title="Refresh"><Button size="small" type="text" icon={<ReloadOutlined spin={refreshing} />} onClick={refresh} /></Tooltip>
          <Tooltip title="Certificate of Completion"><Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => setShowAudit(!showAudit)} /></Tooltip>
        </Space>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">

        {/* Col 1: Recipient Activity + Document */}
        <div className="lg:col-span-5 space-y-3">
          {/* Recipient Activity */}
          <div className="p-4 rounded-xl ds-panel-bg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold" style={{ color: 'var(--ds-text)' }}>Recipient Activity</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--ds-primary)' }}>{done}/{signers.length} signed</span>
            </div>

            {/* Overall progress */}
            <div className="mb-4">
              <Progress
                percent={pct}
                strokeColor={{ from: '#E8930C', to: '#22c55e' }}
                size="small"
                showInfo={false}
                className="!mb-0"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px]" style={{ color: 'var(--ds-textMuted)' }}>Progress</span>
                <span className="text-[10px] font-semibold" style={{ color: pct === 100 ? '#22c55e' : 'var(--ds-primary)' }}>{pct}%</span>
              </div>
            </div>

            {/* Recipient cards — scrollable */}
            <div className="space-y-2.5 overflow-y-auto" style={{ maxHeight: 400 }}>
              {(() => { let signerNum = 0; return [...(env.recipients || [])].sort((a, b) => (a.routingOrder || 1) - (b.routingOrder || 1)).map((r, i) => {
                if (r.role !== 'cc') signerNum++
                const rs = RST[r.status] || RST.created
                const isSigned = r.status === 'signed' || r.status === 'completed'
                const isDeclined = r.status === 'declined'
                const isDelivered = r.status === 'delivered'
                const isPending = r.status === 'created' || r.status === 'sent'

                const statusColor = isSigned ? '#22c55e' : isDeclined ? '#ef4444' : isDelivered ? '#06b6d4' : '#E8930C'
                const statusBg = isSigned ? '#f0fdf4' : isDeclined ? '#fef2f2' : isDelivered ? '#ecfeff' : '#FFF7ED'
                const statusIcon = isSigned ? <CheckCircleFilled /> : isDeclined ? <CloseCircleFilled /> : isDelivered ? <EyeFilled /> : <ClockCircleOutlined />

                return (
                  <div key={i} className="rounded-lg overflow-hidden transition-all" style={{ border: `1px solid var(--ds-borderLight)`, background: 'var(--ds-card)' }}>
                    {/* Recipient header */}
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      {/* Avatar */}
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: `linear-gradient(135deg, ${statusColor}, ${statusColor}cc)` }}>
                        {r.role === 'cc' ? (r.name?.charAt(0)?.toUpperCase() || '?') : signerNum}
                      </div>

                      {/* Name + email */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate" style={{ color: 'var(--ds-text)' }}>{r.name}</span>
                          {r.role === 'cc' && <Tag className="!text-[9px] !px-1.5 !py-0 !leading-4 !m-0">CC</Tag>}
                        </div>
                        <div className="text-[11px] truncate" style={{ color: 'var(--ds-textMuted)' }}>{r.email}</div>
                      </div>

                      {/* Status badge */}
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0"
                        style={{ background: statusBg, color: statusColor }}>
                        {statusIcon}
                        <span>{rs.label}</span>
                      </div>
                    </div>

                    {/* Timeline events */}
                    {(r.viewedAt || r.signedAt || r.declinedReason) && (
                      <div className="px-3 pb-2.5 pt-0">
                        <div className="ml-4 pl-7 border-l-2" style={{ borderColor: 'var(--ds-borderLight)' }}>
                          {r.viewedAt && (
                            <div className="flex items-center gap-2 py-1 relative">
                              <div className="absolute -left-[9px] w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: '#06b6d4' }} />
                              <EyeFilled style={{ color: '#06b6d4', fontSize: 11 }} />
                              <span className="text-[11px]" style={{ color: 'var(--ds-textSecondary)' }}>
                                Delivered · {dayjs(r.viewedAt).format('MMM DD, YYYY [at] h:mm A')}
                              </span>
                            </div>
                          )}
                          {r.signedAt && (
                            <div className="flex items-center gap-2 py-1 relative">
                              <div className="absolute -left-[9px] w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: '#22c55e' }} />
                              <CheckCircleFilled style={{ color: '#22c55e', fontSize: 11 }} />
                              <span className="text-[11px]" style={{ color: 'var(--ds-textSecondary)' }}>
                                Signed · {dayjs(r.signedAt).format('MMM DD, YYYY [at] h:mm A')}
                              </span>
                            </div>
                          )}
                          {r.declinedReason && (
                            <div className="flex items-center gap-2 py-1 relative">
                              <div className="absolute -left-[9px] w-2.5 h-2.5 rounded-full border-2 bg-white" style={{ borderColor: '#ef4444' }} />
                              <CloseCircleFilled style={{ color: '#ef4444', fontSize: 11 }} />
                              <span className="text-[11px] text-red-500">Declined: {r.declinedReason}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              }) })()}
            </div>
          </div>

          {/* Document */}
          <div className="p-3 rounded-xl" style={{ background: 'var(--ds-bgSecondary)', border: '1px solid var(--ds-borderLight)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--ds-primaryLight)' }}>
                <FileTextOutlined style={{ color: PRIMARY, fontSize: 18 }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--ds-text)' }}>{env.document?.fileName || 'Document'}</div>
                <div className="text-[11px]" style={{ color: 'var(--ds-textMuted)' }}>
                  {env.document?.fileSize ? `${(env.document.fileSize / 1024).toFixed(0)} KB` : ''}
                  {env.document?.pageCount ? ` · ${env.document.pageCount} pages` : ''}
                </div>
              </div>
            </div>
            <Button block size="small" icon={<EyeFilled />} className="!mt-3"
              style={{ borderRadius: 6, fontSize: 12 }}
              onClick={() => navigate(`/settings/dealmemo/docusign/sign/${env._id}?recipient=${encodeURIComponent(env.recipients?.[0]?.email || '')}`)}>
              View
            </Button>
          </div>
        </div>

        {/* Col 2: Actions + Details */}
        <div className="lg:col-span-3 space-y-3">
          <div className="p-3 rounded-lg" style={{ background: 'var(--ds-bgSecondary)', border: '1px solid var(--ds-borderLight)' }}>
            <div className="text-[11px] font-bold mb-2" style={{ color: 'var(--ds-text)' }}>Actions</div>
            <div className="space-y-1.5">
              {/* View signed document */}
              {env.tabs?.some((t) => t.value) && (
                <Button block size="small" type="primary" icon={<EyeFilled />}
                  style={{ background: PRIMARY, borderColor: PRIMARY, fontSize: 12, borderRadius: 6 }}
                  onClick={() => navigate(`/settings/dealmemo/docusign/sign/${env._id}?recipient=${encodeURIComponent(env.recipients?.[0]?.email || '')}`)}>
                  View Signed Document
                </Button>
              )}
              {/* Admin-only actions */}
              {!receiverMode && ['sent', 'delivered', 'draft'].includes(env.status) && signers.length > 0 && (
                <Button block size="small" icon={<EditOutlined />}
                  style={{ fontSize: 12, borderRadius: 6 }}
                  onClick={() => { const s = signers.find((x) => x.status !== 'signed' && x.status !== 'completed') || signers[0]; navigate(`/settings/dealmemo/docusign/sign/${env._id}?recipient=${encodeURIComponent(s.email)}`) }}>
                  Sign Now
                </Button>
              )}
              {!receiverMode && ['sent', 'delivered'].includes(env.status) && <Button block size="small" icon={<SendOutlined />} onClick={resend} style={{ fontSize: 12, borderRadius: 6 }}>Resend Envelope</Button>}
            </div>
          </div>

          {/* Details */}
          <div className="p-3 rounded-lg text-[12px]" style={{ background: 'var(--ds-bgSecondary)', border: '1px solid var(--ds-borderLight)' }}>
            <div className="text-[11px] font-bold mb-2" style={{ color: 'var(--ds-text)' }}>Details</div>
            {env.description && <div className="mb-2" style={{ color: 'var(--ds-textSecondary)' }}>{env.description}</div>}
            <div className="space-y-1.5">
              <div className="flex justify-between"><span style={{ color: 'var(--ds-textMuted)' }}>Created</span><span style={{ color: 'var(--ds-text)' }}>{dayjs(env.createdAt).format('MMM DD, YYYY [at] h:mm A')}</span></div>
              {env.sentAt && <div className="flex justify-between"><span style={{ color: 'var(--ds-textMuted)' }}>Sent</span><span style={{ color: 'var(--ds-text)' }}>{dayjs(env.sentAt).format('MMM DD, YYYY [at] h:mm A')}</span></div>}
              {env.completedAt && <div className="flex justify-between"><span style={{ color: 'var(--ds-textMuted)' }}>Completed</span><span style={{ color: 'var(--ds-text)' }}>{dayjs(env.completedAt).format('MMM DD, YYYY [at] h:mm A')}</span></div>}
              {env.settings?.expirationDays && env.sentAt && <div className="flex justify-between"><span style={{ color: 'var(--ds-textMuted)' }}>Expires</span><span style={{ color: 'var(--ds-text)' }}>{dayjs(env.sentAt).add(env.settings.expirationDays, 'day').format('MMM DD, YYYY [at] h:mm A')}</span></div>}
            </div>
          </div>

          {/* Fields */}
          {env.tabs?.length > 0 && (
            <FieldsSummary tabs={env.tabs} recipients={env.recipients} />
          )}
        </div>

        {/* Col 3: Audit trail */}
        <div className="lg:col-span-4">
          {(showAudit || env.auditTrail?.length > 0) && (
            <div className="p-3 rounded-lg" style={{ background: 'var(--ds-bgSecondary)', border: '1px solid var(--ds-borderLight)' }}>
              <div className="text-[11px] font-bold mb-2" style={{ color: 'var(--ds-text)' }}>Certificate of Completion</div>
              <Timeline
                items={[...(env.auditTrail || [])]
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                  .map((ev) => ({
                    color: ev.action.includes('void') ? 'red' : ev.action.includes('completed') ? 'green' : ev.action.includes('sent') ? 'blue' : 'gray',
                    children: (
                      <div>
                        <div className="text-[11px] font-medium" style={{ color: 'var(--ds-text)' }}>{ev.details || ev.action}</div>
                        <div className="text-[9px]" style={{ color: 'var(--ds-textMuted)' }}>{ev.actor && `${ev.actor} · `}{dayjs(ev.timestamp).format('MMM DD, h:mm A')}</div>
                      </div>
                    ),
                  }))}
              />
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

export default EnvelopeStatusTracker
