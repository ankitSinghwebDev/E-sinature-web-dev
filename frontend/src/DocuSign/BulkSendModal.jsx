/**
 * BulkSendModal — 3-step stepper for bulk-sending an envelope from a
 * template against a CSV of recipients.
 *
 *   Step 1 — Upload CSV. Drag/drop or click-to-pick; we parse the file
 *           client-side immediately so step 2 can surface issues.
 *   Step 2 — Preview rows + flag invalid ones.
 *   Step 3 — Confirm + Submit. On submit, dispatches startDocuSignBulkSend;
 *           the bulk-jobs dashboard picks up the new job on next poll.
 *
 * Opens from a template card's "Bulk Send" action.
 */

import { CheckCircleFilled, InboxOutlined, WarningOutlined } from '@ant-design/icons'
import { Alert, Button, Modal, Steps, Table, Tag, Upload, message } from 'antd'
import { useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { startDocuSignBulkSend } from '../api/docusignApi'
import { parseCsv, validateRows } from './csvParse'

const REQUIRED_COLUMNS = ['name', 'email']
const ROW_CAP = 500

const BulkSendModal = ({ open, template, onCancel, onJobStarted }) => {
  const dispatch = useDispatch()
  const [step, setStep] = useState(0)
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [parseError, setParseError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const validation = useMemo(() => {
    if (!parsed) return null
    return validateRows(parsed, REQUIRED_COLUMNS)
  }, [parsed])

  const reset = () => {
    setStep(0)
    setFile(null)
    setParsed(null)
    setParseError(null)
    setSubmitting(false)
  }

  const handleCancel = () => {
    reset()
    onCancel?.()
  }

  const handleFile = async (f) => {
    setParseError(null)
    setFile(f)
    try {
      const text = await f.text()
      const result = parseCsv(text)
      if (!result.headers.length) {
        setParseError('CSV is empty or unreadable.')
        setParsed(null)
        return false
      }
      if (result.rows.length > ROW_CAP) {
        setParseError(`CSV has ${result.rows.length} rows — split into batches of ${ROW_CAP} or fewer.`)
        setParsed(null)
        return false
      }
      setParsed(result)
    } catch {
      setParseError('Could not read the CSV file.')
      setParsed(null)
    }
    return false
  }

  const handleNext = () => {
    if (step === 0) {
      if (!parsed) { message.error('Upload a CSV before continuing.'); return }
      if (validation?.missingHeaders?.length) {
        message.error(`CSV is missing required columns: ${validation.missingHeaders.join(', ')}`)
        return
      }
      setStep(1)
      return
    }
    if (step === 1) {
      if ((validation?.validRows ?? 0) === 0) {
        message.error('No valid rows to send. Fix the issues highlighted below.')
        return
      }
      setStep(2)
    }
  }

  const handleBack = () => { if (step > 0) setStep(step - 1) }

  const handleSubmit = async () => {
    if (!template?._id || !file) {
      message.error('Pick a template and CSV before submitting.')
      return
    }
    setSubmitting(true)
    try {
      const res = await dispatch(startDocuSignBulkSend({
        template_id: template._id,
        csv_file: file,
        send_immediately: true,
      }))
      if (res.error) {
        message.error(res.payload || 'Failed to start bulk send')
        return
      }
      const tot = res.payload?.total_rows
      message.success(`Bulk send started — ${tot} envelopes queued.`)
      onJobStarted?.(res.payload?.bulk_job_id)
      reset()
    } finally {
      setSubmitting(false)
    }
  }

  const renderStep1Upload = () => (
    <div>
      <Upload.Dragger
        accept=".csv,text/csv"
        beforeUpload={handleFile}
        maxCount={1}
        showUploadList={false}
        style={{ padding: 16 }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">Click or drag a CSV file</p>
        <p className="ant-upload-hint">
          First row should be a header. Required columns: <b>name</b>, <b>email</b>. Extra
          columns map to template field labels by name (case-insensitive).
        </p>
      </Upload.Dragger>

      {file && (
        <div
          className="mt-3 px-3 py-2 rounded-md flex items-center gap-2 text-[13px]"
          style={{ background: '#f1f5f9' }}
        >
          <CheckCircleFilled style={{ color: '#22c55e' }} />
          <span style={{ flex: 1 }}>
            <b>{file.name}</b>
            {parsed && (
              <span style={{ color: '#94a3b8' }}>
                &nbsp; · {parsed.rows.length} rows · {parsed.headers.length} columns
              </span>
            )}
          </span>
          <Button
            size="small"
            onClick={() => { setFile(null); setParsed(null); setParseError(null) }}
            type="link"
          >
            Replace
          </Button>
        </div>
      )}

      {parseError && <Alert type="error" message={parseError} className="mt-3" />}

      {validation?.missingHeaders?.length > 0 && (
        <Alert
          type="error"
          showIcon
          className="mt-3"
          message="Missing required columns"
          description={(
            <div className="space-y-1">
              <div>
                Your CSV is missing: <b>{validation.missingHeaders.join(', ')}</b>.
              </div>
              {parsed?.headers?.length > 0 && (
                <div className="text-[11px]" style={{ color: '#94a3b8' }}>
                  Detected headers: <code>{parsed.headers.join(' | ')}</code>
                  {parsed.delimiter && parsed.delimiter !== ',' && (
                    <> &middot; delimiter: <code>{parsed.delimiter === '\t' ? 'tab' : parsed.delimiter}</code></>
                  )}
                </div>
              )}
            </div>
          )}
        />
      )}
    </div>
  )

  const renderStep2Preview = () => {
    if (!parsed) return null
    const previewRows = parsed.rows.slice(0, 5)
    const previewCols = parsed.headers.map((h) => ({
      title: h,
      dataIndex: h.toLowerCase(),
      key: h,
      ellipsis: true,
      width: 160,
    }))

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Tag color="green">{validation.validRows} valid</Tag>
          {validation.invalidRows > 0 && (
            <Tag color="orange">{validation.invalidRows} with issues</Tag>
          )}
          <span className="text-[12px]" style={{ color: '#94a3b8' }}>
            Showing the first {previewRows.length} of {parsed.rows.length} rows.
          </span>
        </div>

        <Table
          size="small"
          columns={previewCols}
          dataSource={previewRows.map((r, i) => ({ key: i, ...r }))}
          pagination={false}
          scroll={{ x: 'max-content' }}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
        />

        {validation.invalidRows > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message={`${validation.invalidRows} row${validation.invalidRows === 1 ? '' : 's'} will fail validation`}
            description={(
              <div className="text-[12px]" style={{ color: '#475569' }}>
                Invalid rows still show in the bulk-job dashboard with their error reason — they
                won't block the rest of the batch. Retry after fixing the source.
              </div>
            )}
          />
        )}

        <div
          className="rounded-md p-3 text-[12px]"
          style={{ background: '#f1f5f9', color: '#475569' }}
        >
          <b>Column mapping:</b>{' '}
          <span>name</span> → recipient name,{' '}
          <span>email</span> → recipient email.{' '}
          {parsed.headers.filter((h) => !['name', 'email'].includes(h.toLowerCase())).length > 0 && (
            <>
              Other columns ({parsed.headers.filter((h) => !['name', 'email'].includes(h.toLowerCase())).join(', ')})
              {' '}attempt to match template field labels by name. Unmatched columns are ignored.
            </>
          )}
        </div>
      </div>
    )
  }

  const renderStep3Confirm = () => (
    <div className="space-y-3">
      <div className="rounded-md p-4" style={{ background: '#f1f5f9' }}>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
          Ready to send
        </div>
        <div className="grid grid-cols-2 gap-3 text-[13px]" style={{ color: '#1e293b' }}>
          <div>
            <div className="text-[10px] uppercase font-semibold" style={{ color: '#94a3b8' }}>Template</div>
            <div className="font-semibold">{template?.name}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold" style={{ color: '#94a3b8' }}>Source file</div>
            <div className="font-semibold truncate">{file?.name}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold" style={{ color: '#94a3b8' }}>Envelopes to create</div>
            <div className="font-semibold">{validation?.validRows ?? 0}</div>
          </div>
          {(validation?.invalidRows ?? 0) > 0 && (
            <div>
              <div className="text-[10px] uppercase font-semibold" style={{ color: '#94a3b8' }}>Skipped (invalid)</div>
              <div className="font-semibold" style={{ color: '#d97706' }}>{validation.invalidRows}</div>
            </div>
          )}
        </div>
      </div>
      <Alert
        type="info"
        showIcon
        message="Each row becomes its own envelope and gets emailed to the recipient immediately on submit. Per-row progress is tracked in the Bulk Jobs dashboard."
      />
    </div>
  )

  const footerButtons = (
    <div className="flex items-center gap-2 justify-end">
      <Button onClick={handleCancel} disabled={submitting}>Cancel</Button>
      {step > 0 && (
        <Button onClick={handleBack} disabled={submitting}>Back</Button>
      )}
      {step < 2 ? (
        <Button
          type="primary"
          onClick={handleNext}
          disabled={step === 0 ? !parsed : false}
        >
          Next
        </Button>
      ) : (
        <Button
          type="primary"
          onClick={handleSubmit}
          loading={submitting}
        >
          Send {validation?.validRows ?? 0} envelopes
        </Button>
      )}
    </div>
  )

  return (
    <Modal
      title={`Bulk Send · ${template?.name || 'Template'}`}
      open={open}
      onCancel={handleCancel}
      footer={footerButtons}
      destroyOnClose
      width={680}
    >
      <Steps
        size="small"
        current={step}
        items={[
          { title: 'Upload CSV' },
          { title: 'Preview' },
          { title: 'Confirm' },
        ]}
        style={{ marginBottom: 20 }}
      />

      {step === 0 && renderStep1Upload()}
      {step === 1 && renderStep2Preview()}
      {step === 2 && renderStep3Confirm()}
    </Modal>
  )
}

export default BulkSendModal
