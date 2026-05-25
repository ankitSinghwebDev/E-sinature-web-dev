/**
 * BulkJobsView — dashboard segment for bulk-send jobs.
 *
 * Two modes:
 *   • List   — card per job with progress bar.
 *   • Detail — per-row outcomes (sent / pending / failed) + Retry-Failed.
 *
 * Polls every 2s while any job is `running`/`pending` so progress
 * ticks visibly without a manual refresh.
 */

import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  ReloadOutlined,
} from '@ant-design/icons'
import { Button, Empty, Progress, Spin, Table, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  clearCurrentBulkJob,
  fetchDocuSignBulkJob,
  fetchDocuSignBulkJobs,
  retryDocuSignBulkFailed,
} from '../api/docusignApi'

const POLL_INTERVAL_MS = 2000

const statusColor = (s) => {
  if (s === 'completed') return 'green'
  if (s === 'failed') return 'red'
  if (s === 'running') return 'blue'
  return 'default'
}

const fmtPercent = (job) => {
  if (!job?.total_rows) return 0
  return Math.round(((job.processed || 0) / job.total_rows) * 100)
}

const EMPTY_JOBS = []

const BulkJobsView = () => {
  const dispatch = useDispatch()
  const jobs = useSelector((s) => s.docusign?.bulkJobs) ?? EMPTY_JOBS
  const loading = useSelector((s) => s.docusign?.bulkJobsLoading) || false
  const fetched = useSelector((s) => s.docusign?.bulkJobsFetched) || false
  const error = useSelector((s) => s.docusign?.bulkJobsError) || null
  const currentJob = useSelector((s) => s.docusign?.currentBulkJob) || null

  const [selectedJobId, setSelectedJobId] = useState(null)
  const pollTimerRef = useRef(null)

  useEffect(() => {
    if (!fetched && !loading) dispatch(fetchDocuSignBulkJobs())
  }, [dispatch, fetched, loading])

  useEffect(() => {
    const anyInFlight = jobs.some((j) => j.status === 'running' || j.status === 'pending')
    if (!anyInFlight) return undefined
    const t = setInterval(() => dispatch(fetchDocuSignBulkJobs()), POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [jobs, dispatch])

  useEffect(() => {
    if (!selectedJobId) {
      dispatch(clearCurrentBulkJob())
      return undefined
    }
    dispatch(fetchDocuSignBulkJob(selectedJobId))
    pollTimerRef.current = setInterval(() => {
      dispatch(fetchDocuSignBulkJob(selectedJobId))
    }, POLL_INTERVAL_MS)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [selectedJobId, dispatch])

  useEffect(() => {
    if (!currentJob || !pollTimerRef.current) return
    if (currentJob.status === 'completed' || currentJob.status === 'failed') {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [currentJob])

  const handleRetry = async (id) => {
    const res = await dispatch(retryDocuSignBulkFailed({ id }))
    if (res.error) { message.error(res.payload || 'Failed to retry'); return }
    message.success(`Retried ${res.payload?.retried ?? 0} failed row(s)`)
  }

  const renderList = () => {
    if (loading && !fetched) {
      return <div className="flex items-center justify-center h-64"><Spin tip="Loading bulk jobs..."><div /></Spin></div>
    }
    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <Empty description={<span style={{ color: '#94a3b8' }}>{error}</span>}>
            <Button onClick={() => dispatch(fetchDocuSignBulkJobs())}>Retry</Button>
          </Empty>
        </div>
      )
    }
    if (jobs.length === 0) {
      return (
        <div className="flex items-center justify-center h-64">
          <Empty description={<span style={{ color: '#94a3b8' }}>{"No bulk jobs yet — start one from a template's Bulk Send action."}</span>} />
        </div>
      )
    }
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {jobs.map((j) => {
          const pct = fmtPercent(j)
          return (
            <div
              key={j._id}
              className="rounded-xl p-3 transition-shadow hover:shadow-md cursor-pointer"
              style={{ background: '#fff', border: '1px solid #e2e8f0' }}
              onClick={() => setSelectedJobId(j._id)}
            >
              <div className="flex items-center justify-between mb-2">
                <Tag color={statusColor(j.status)} style={{ margin: 0 }}>{j.status?.toUpperCase()}</Tag>
                <span className="text-[10px]" style={{ color: '#94a3b8' }}>
                  {j.created ? dayjs(j.created).fromNow() : ''}
                </span>
              </div>
              <div className="text-[13px] font-semibold truncate" style={{ color: '#1e293b' }}>
                {j.template_name || 'Template'}
              </div>
              <div className="text-[11px] mb-2 mt-0.5" style={{ color: '#475569' }}>
                {j.total_rows} envelopes &middot; {j.succeeded || 0} sent &middot; {j.failed || 0} failed
              </div>
              <Progress
                percent={pct}
                size="small"
                status={j.status === 'failed' ? 'exception' : j.status === 'completed' ? 'success' : 'active'}
                strokeColor={j.status === 'completed' ? '#22c55e' : undefined}
                showInfo
              />
            </div>
          )
        })}
      </div>
    )
  }

  const detailColumns = useMemo(() => [
    { title: '#', dataIndex: 'row_index', width: 60, render: (i) => i + 1 },
    {
      title: 'Name',
      dataIndex: ['row', 'name'],
      ellipsis: true,
      render: (_, rec) => rec.row?.name || '—',
    },
    {
      title: 'Email',
      dataIndex: ['row', 'email'],
      ellipsis: true,
      render: (_, rec) => rec.row?.email || '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 130,
      render: (s, rec) => {
        if (s === 'sent') return <Tag color="green" icon={<CheckCircleFilled />} style={{ margin: 0 }}>Sent</Tag>
        if (s === 'failed') return (
          <Tag color="red" icon={<CloseCircleFilled />} style={{ margin: 0 }}>
            {rec.error ? rec.error.replace(/_/g, ' ') : 'Failed'}
          </Tag>
        )
        return <Tag color="default" icon={<ClockCircleFilled />} style={{ margin: 0 }}>Pending</Tag>
      },
    },
  ], [])

  const renderDetail = () => {
    if (!currentJob) return <div className="flex items-center justify-center h-64"><Spin tip="Loading job..."><div /></Spin></div>
    const pct = fmtPercent(currentJob)
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button icon={<ArrowLeftOutlined />} onClick={() => setSelectedJobId(null)} type="text">
            Back to jobs
          </Button>
          <div className="text-[14px] font-semibold" style={{ color: '#1e293b' }}>
            {currentJob.template_name || 'Template'}
          </div>
          <Tag color={statusColor(currentJob.status)} style={{ margin: 0 }}>{currentJob.status?.toUpperCase()}</Tag>
          <span className="text-[11px]" style={{ color: '#94a3b8' }}>
            {currentJob.created ? dayjs(currentJob.created).format('MMM D, YYYY HH:mm') : ''}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {(currentJob.failed || 0) > 0 && (
              <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(currentJob._id)}>
                Retry {currentJob.failed} failed
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-md p-3" style={{ background: '#f1f5f9' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px]" style={{ color: '#475569' }}>
              {currentJob.processed || 0} of {currentJob.total_rows} processed &middot;{' '}
              <span style={{ color: '#22c55e' }}>{currentJob.succeeded || 0} sent</span>
              {(currentJob.failed || 0) > 0 && (
                <> &middot; <span style={{ color: '#ef4444' }}>{currentJob.failed} failed</span></>
              )}
            </div>
            <div className="text-[12px] font-semibold" style={{ color: '#1e293b' }}>{pct}%</div>
          </div>
          <Progress
            percent={pct}
            size="small"
            status={currentJob.status === 'failed' ? 'exception' : currentJob.status === 'completed' ? 'success' : 'active'}
            showInfo={false}
          />
        </div>

        <Table
          size="small"
          columns={detailColumns}
          dataSource={(currentJob.envelopes || []).map((e) => ({ key: e.row_index, ...e }))}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          scroll={{ y: 400 }}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f7fafc' }}>
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: '#fff', borderBottom: '1px solid #e2e8f0' }}
      >
        <div className="flex items-center gap-2">
          <div className="text-[14px] font-semibold" style={{ color: '#1e293b' }}>Bulk Jobs</div>
          <span className="text-[11px]" style={{ color: '#94a3b8' }}>
            {selectedJobId ? 'Job detail' : `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`}
          </span>
        </div>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={() => {
            if (selectedJobId) dispatch(fetchDocuSignBulkJob(selectedJobId))
            else dispatch(fetchDocuSignBulkJobs())
          }}
        >
          Refresh
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {selectedJobId ? renderDetail() : renderList()}
      </div>
    </div>
  )
}

export default BulkJobsView
