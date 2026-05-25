/**
 * TemplateLibrary — card-grid of saved templates.
 *
 * Search + freeform category filter. Per-card actions: Use (instantiate
 * → switch to envelope editor), Bulk Send (open BulkSendModal), Delete.
 *
 * Parent supplies:
 *   • onUseTemplate(draftEnvelopePayload) — opens the new draft in the
 *                                            envelope editor.
 *   • onBulkSend(template)                — opens BulkSendModal for the
 *                                            chosen template.
 *   • canPost                             — gates create/use/delete.
 */

import {
  DeleteOutlined,
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Popconfirm, Select, Spin, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  deleteDocuSignTemplate,
  fetchDocuSignTemplates,
  instantiateDocuSignTemplate,
} from '../api/docusignApi'

const KNOWN_LABELS = {
  nda: 'NDA',
  deal_memo: 'Deal Memo',
  release: 'Release',
  tax: 'Tax',
  other: 'Other',
}

const fmtCategory = (c) => {
  if (!c) return 'Uncategorized'
  if (KNOWN_LABELS[c]) return KNOWN_LABELS[c]
  return c.split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const PALETTE = ['#8b5cf6', '#E8930C', '#10b981', '#06b6d4', '#ef4444', '#0ea5e9', '#f59e0b', '#d946ef', '#14b8a6', '#7c3aed']
const colorForCategory = (c) => {
  if (!c) return '#64748b'
  let h = 0
  for (let i = 0; i < c.length; i++) h = ((h * 31) + c.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const EMPTY_TEMPLATES = []

const TemplateLibrary = ({ onUseTemplate, onBulkSend, canPost = true }) => {
  const dispatch = useDispatch()
  const templates = useSelector((s) => s.docusign?.templates) ?? EMPTY_TEMPLATES
  const loading = useSelector((s) => s.docusign?.templatesLoading) || false
  const fetched = useSelector((s) => s.docusign?.templatesFetched) || false
  const error = useSelector((s) => s.docusign?.templatesError) || null

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!fetched && !loading) dispatch(fetchDocuSignTemplates())
  }, [dispatch, fetched, loading])

  const filtered = useMemo(() => {
    let list = templates
    if (category !== 'all') list = list.filter((t) => t.category === category)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((t) => (t.name || '').toLowerCase().includes(q)
        || (t.description || '').toLowerCase().includes(q))
    }
    return list
  }, [templates, search, category])

  const categoryFilterOptions = useMemo(() => {
    const seen = new Set()
    const opts = [{ value: 'all', label: 'All categories' }]
    for (const t of templates) {
      const c = t?.category
      if (!c || seen.has(c)) continue
      seen.add(c)
      opts.push({ value: c, label: fmtCategory(c) })
    }
    return opts
  }, [templates])

  const handleUse = async (tpl) => {
    if (!canPost) {
      message.warning('You need posting rights to use templates.')
      return
    }
    setBusyId(tpl._id)
    try {
      const res = await dispatch(instantiateDocuSignTemplate({
        id: tpl._id,
        recipients: (tpl.recipients || []).map(() => ({ name: '', email: '' })),
      }))
      if (res.error) {
        message.error(res.payload || 'Failed to instantiate template')
        return
      }
      if (onUseTemplate) onUseTemplate(res.payload)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (tpl) => {
    setBusyId(tpl._id)
    try {
      const res = await dispatch(deleteDocuSignTemplate({ id: tpl._id }))
      if (res.error) {
        message.error(res.payload || 'Failed to delete template')
        return
      }
      message.success(`Deleted "${tpl.name}"`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f7fafc' }}>
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}
      >
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder="Search templates by name or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="middle"
          style={{ maxWidth: 360, borderRadius: 8 }}
        />
        <Select
          value={category}
          onChange={setCategory}
          size="middle"
          style={{ width: 180, borderRadius: 8 }}
          options={categoryFilterOptions}
          showSearch
          optionFilterProp="label"
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px]" style={{ color: '#94a3b8' }}>
            {filtered.length} of {templates.length}
          </span>
          {canPost && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="middle"
              style={{ borderRadius: 8 }}
              onClick={() => message.info("Save an existing draft envelope as a template — open Drafts, set up recipients and fields, then choose 'Save as Template' from the overflow menu.")}
            >
              New Template
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && !fetched ? (
          <div className="flex items-center justify-center h-64">
            <Spin tip="Loading templates..."><div /></Spin>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <Empty description={<span style={{ color: '#94a3b8' }}>{error}</span>}>
              <Button onClick={() => dispatch(fetchDocuSignTemplates())}>Retry</Button>
            </Empty>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Empty description={(
              <span style={{ color: '#94a3b8' }}>
                {templates.length === 0
                  ? 'No templates yet — save an envelope as a template from Drafts.'
                  : 'No templates match your filters.'}
              </span>
            )} />
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {filtered.map((tpl) => {
              const docCount = (tpl.documents || []).length || (tpl.document ? 1 : 0)
              const recipientCount = (tpl.recipients || []).length
              const catColor = colorForCategory(tpl.category)
              const updated = tpl.updatedAt || tpl.updated || tpl.createdAt || tpl.created
              return (
                <div
                  key={tpl._id}
                  className="rounded-xl p-3 transition-shadow hover:shadow-md"
                  style={{ background: '#fff', border: '1px solid #e2e8f0' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Tag
                      style={{
                        background: `${catColor}15`,
                        color: catColor,
                        border: `1px solid ${catColor}40`,
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 600,
                        margin: 0,
                      }}
                    >
                      {fmtCategory(tpl.category)}
                    </Tag>
                    <span className="text-[10px]" style={{ color: '#94a3b8' }}>
                      {updated ? dayjs(updated).fromNow() : ''}
                    </span>
                  </div>

                  <div className="mb-3">
                    <div
                      className="text-[14px] font-semibold truncate"
                      style={{ color: '#1e293b' }}
                      title={tpl.name}
                    >
                      {tpl.name || 'Untitled Template'}
                    </div>
                    <div
                      className="text-[11px] mt-0.5 line-clamp-2"
                      style={{
                        color: '#475569',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {tpl.description || <span style={{ color: '#94a3b8' }}>No description</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-3 text-[11px]" style={{ color: '#475569' }}>
                    <span className="flex items-center gap-1">
                      <FileTextOutlined style={{ fontSize: 11 }} />
                      {docCount} {docCount === 1 ? 'doc' : 'docs'}
                    </span>
                    <span className="flex items-center gap-1">
                      <UserOutlined style={{ fontSize: 11 }} />
                      {recipientCount} {recipientCount === 1 ? 'signer' : 'signers'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="primary"
                      size="small"
                      loading={busyId === tpl._id}
                      disabled={!canPost}
                      onClick={() => handleUse(tpl)}
                      style={{ borderRadius: 6, flex: 1 }}
                    >
                      Use
                    </Button>
                    {canPost && onBulkSend && (
                      <Button
                        size="small"
                        icon={<ThunderboltOutlined />}
                        onClick={() => onBulkSend(tpl)}
                        disabled={busyId === tpl._id}
                        style={{ borderRadius: 6, flex: 1 }}
                        title="Send this template to many recipients from a CSV"
                      >
                        Bulk Send
                      </Button>
                    )}
                    {canPost && (
                      <Popconfirm
                        title="Delete template?"
                        description="Existing envelopes created from this template are not affected."
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        cancelText="Cancel"
                        onConfirm={() => handleDelete(tpl)}
                      >
                        <Button
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          disabled={busyId === tpl._id}
                          style={{ borderRadius: 6 }}
                          aria-label="Delete template"
                        />
                      </Popconfirm>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default TemplateLibrary
