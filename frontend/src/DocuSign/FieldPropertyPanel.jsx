/**
 * FieldPropertyPanel — sidebar editor for a placed field's settings.
 *
 * Shown in DocumentFieldPlacer's left sidebar when a field is selected.
 * Surfaces a small set of per-field controls:
 *
 *   • Label
 *   • Required / Optional toggle
 *   • Options list                (radio / dropdown only)
 *   • Default Value               (only for types where FIELD_TYPES
 *                                   marks supportsDefault: true)
 *   • Locked toggle               (only when a default value is set —
 *                                   makes the field read-only at sign
 *                                   time)
 *   • Delete
 *
 * Forward-compatible — adding a new type to FIELD_TYPES with
 * supportsDefault: true makes the Default Value and Locked rows
 * appear automatically.
 */

import {
  CloseOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  LockOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Button, Input, Select, Switch, Tooltip } from 'antd'
import { useMemo } from 'react'
import { FIELD_TYPE_BY_TYPE, SIGNER_COLORS as COLORS } from './constants'

// Short random id for new option entries.
const makeOptionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `opt_${crypto.randomUUID().slice(0, 8)}`
  }
  return `opt_${Math.random().toString(36).slice(2, 10)}`
}

const RowLabel = ({ children, hint }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
      {children}
    </span>
    {hint && (
      <Tooltip title={<div className="p-1">{hint}</div>} placement="top">
        <InfoCircleOutlined style={{ fontSize: 11, color: '#94a3b8' }} />
      </Tooltip>
    )}
  </div>
)

const Row = ({ label, hint, children }) => (
  <div className="mb-3">
    <RowLabel hint={hint}>{label}</RowLabel>
    <div className="mt-1.5">{children}</div>
  </div>
)

const DefaultValueInput = ({ fieldType, value, onChange, options, disabled }) => {
  const shape = fieldType?.defaultShape || null

  if (shape === 'string') {
    return (
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Director of Photography"
        size="small"
        disabled={disabled}
        style={{ borderRadius: 6, fontSize: 12 }}
      />
    )
  }
  if (shape === 'bool') {
    return (
      <div className="flex items-center gap-2">
        <Switch
          size="small"
          checked={value === true || value === 'true'}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
        <span className="text-[12px]" style={{ color: '#475569' }}>
          {value === true || value === 'true' ? 'Checked by default' : 'Unchecked by default'}
        </span>
      </div>
    )
  }
  if (shape === 'optionId') {
    const opts = Array.isArray(options) ? options : []
    if (opts.length === 0) {
      return (
        <div className="text-[12px] italic" style={{ color: '#94a3b8' }}>
          Add at least one option below, then pick the default.
        </div>
      )
    }
    return (
      <Select
        size="small"
        value={value || undefined}
        onChange={(v) => onChange(v)}
        disabled={disabled}
        placeholder="No default — signer picks"
        style={{ width: '100%', fontSize: 12 }}
        allowClear
        options={opts.map((o) => ({ value: o.option_id, label: o.label || o.option_id }))}
      />
    )
  }
  return null
}

const OptionsListEditor = ({ options, onChange, disabled }) => {
  const list = Array.isArray(options) ? options : []

  const updateAt = (idx, patch) => {
    const next = list.map((o, i) => (i === idx ? { ...o, ...patch } : o))
    onChange(next)
  }
  const removeAt = (idx) => {
    onChange(list.filter((_, i) => i !== idx))
  }
  const addOne = () => {
    onChange([...list, { option_id: makeOptionId(), label: `Option ${list.length + 1}` }])
  }

  return (
    <div className="space-y-1.5">
      {list.length === 0 && (
        <div className="text-[12px] italic" style={{ color: '#94a3b8' }}>
          No options yet — the field needs at least one before signers can choose.
        </div>
      )}
      {list.map((opt, idx) => (
        <div key={opt.option_id || idx} className="flex items-center gap-1.5">
          <Input
            value={opt.label ?? ''}
            onChange={(e) => updateAt(idx, { label: e.target.value })}
            placeholder={`Option ${idx + 1}`}
            size="small"
            disabled={disabled}
            style={{ borderRadius: 6, fontSize: 12, flex: 1 }}
          />
          <button
            onClick={() => removeAt(idx)}
            disabled={disabled || list.length === 0}
            className="flex items-center justify-center w-6 h-6 rounded-md transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: '#e11d48' }}
            aria-label={`Remove option ${idx + 1}`}
            type="button"
          >
            <CloseOutlined style={{ fontSize: 10 }} />
          </button>
        </div>
      ))}
      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={addOne}
        disabled={disabled}
        className="!text-[12px]"
        block
        type="dashed"
      >
        Add option
      </Button>
    </div>
  )
}

const FieldPropertyPanel = ({
  tab,
  tabIndex,
  recipient,
  onChange,
  onDelete,
  onClose,
}) => {
  const fieldType = useMemo(() => FIELD_TYPE_BY_TYPE[tab?.type] || null, [tab?.type])

  if (!tab) return null

  const supportsDefault = !!fieldType?.supportsDefault
  const hasDefault = tab.defaultValue !== undefined && tab.defaultValue !== '' && tab.defaultValue !== null
  const isAutoInitial = !!tab._autoInitial
  const lockSwitchDisabled = !hasDefault

  const accentColor = recipient ? COLORS[(tabIndex >= 0 ? tabIndex : 0) % COLORS.length] : '#94a3b8'

  return (
    <div
      className="mb-3 rounded-lg p-3"
      style={{
        background: '#fff',
        border: `1.5px solid ${fieldType?.color || '#cbd5e1'}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0"
            style={{ background: `${fieldType?.color || '#94a3b8'}20`, color: fieldType?.color || '#64748b' }}
          >
            <span className="text-[10px] font-bold">{(fieldType?.label || tab.type || '?').slice(0, 1)}</span>
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold truncate" style={{ color: '#1e293b' }}>
              {fieldType?.label || tab.type}
            </div>
            {recipient?.name && (
              <div className="text-[10px] truncate" style={{ color: accentColor }}>
                Signed by {recipient.name.split(' ')[0]}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 rounded-md transition-colors hover:bg-slate-100"
          style={{ color: '#94a3b8' }}
          aria-label="Close field properties"
          type="button"
        >
          <CloseOutlined style={{ fontSize: 11 }} />
        </button>
      </div>

      {isAutoInitial && (
        <div
          className="mb-2.5 rounded-md p-2 text-[11px] leading-relaxed"
          style={{ background: 'rgba(59,130,246,0.08)', color: '#475569' }}
        >
          This field is part of <b>Initial on all pages</b>. Properties on auto-placed initials are managed
          from the sidebar toggle above — individual edits are limited.
        </div>
      )}

      <Row label="Label">
        <Input
          value={tab.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={fieldType?.label || 'Field label'}
          size="small"
          disabled={isAutoInitial}
          style={{ borderRadius: 6, fontSize: 12 }}
        />
      </Row>

      <Row
        label="Required"
        hint="Required fields must be completed before the signer can finish."
      >
        <div className="flex items-center gap-2">
          <Switch
            size="small"
            checked={tab.required !== false}
            onChange={(v) => onChange({ required: v })}
            disabled={isAutoInitial}
          />
          <span className="text-[12px]" style={{ color: '#475569' }}>
            {tab.required !== false ? 'Required' : 'Optional'}
          </span>
        </div>
      </Row>

      {fieldType?.hasOptions && (
        <Row
          label="Options"
          hint="The choices a signer can pick from. Each option's label is what the signer sees; the id is stable under the hood."
        >
          <OptionsListEditor
            options={tab.options}
            onChange={(opts) => {
              const stillExists = !tab.defaultValue
                || (opts || []).some((o) => o.option_id === tab.defaultValue)
              const patch = stillExists
                ? { options: opts }
                : { options: opts, defaultValue: '' }
              // Radio auto-grows so trailing options don't get clipped.
              if (tab.type === 'radioGroup') {
                const RADIO_BASE_H = 36
                const PER_OPTION = 14
                const needed = RADIO_BASE_H + (opts || []).length * PER_OPTION
                if (needed > (tab.height || 0)) patch.height = needed
              }
              onChange(patch)
            }}
            disabled={isAutoInitial}
          />
        </Row>
      )}

      {supportsDefault && (
        <Row
          label="Default Value"
          hint="If set, the signer opens the field already populated. They can edit it unless Locked is also on."
        >
          <DefaultValueInput
            fieldType={fieldType}
            value={tab.defaultValue}
            onChange={(v) => onChange({ defaultValue: v })}
            options={tab.options}
            disabled={isAutoInitial}
          />
        </Row>
      )}

      {supportsDefault && (
        <Row
          label="Locked"
          hint="Locked fields display the default value to the signer but cannot be edited."
        >
          <Tooltip
            title={lockSwitchDisabled ? <div className="p-1">Set a default value first, then you can lock it.</div> : ''}
            placement="top"
          >
            <div className="flex items-center gap-2">
              <Switch
                size="small"
                checked={!!tab.locked}
                onChange={(v) => onChange({ locked: v })}
                disabled={lockSwitchDisabled || isAutoInitial}
              />
              <span className="text-[12px]" style={{ color: '#475569' }}>
                {tab.locked ? (
                  <>
                    <LockOutlined style={{ fontSize: 11, marginRight: 4 }} />
                    Read-only at sign time
                  </>
                ) : (
                  'Signer can edit'
                )}
              </span>
            </div>
          </Tooltip>
        </Row>
      )}

      {!isAutoInitial && (
        <div className="pt-2 mt-1" style={{ borderTop: '1px solid #e2e8f0' }}>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={onDelete}
            className="!text-[12px]"
            block
          >
            Delete Field
          </Button>
        </div>
      )}
    </div>
  )
}

export default FieldPropertyPanel
