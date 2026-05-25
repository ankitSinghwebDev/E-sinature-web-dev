/**
 * RecipientManager — Add/edit/remove recipients for an envelope.
 * Supports: signer, CC, in_person_signer roles & signing order.
 */

import {
  DeleteOutlined,
  PlusOutlined,
  SwapOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  AutoComplete,
  Button,
  Card,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useMemo, useState } from 'react'

const { Text, Title } = Typography

const PRIMARY = '#E8930C'

const ROLE_OPTIONS = [
  { value: 'signer', label: 'Signer' },
  { value: 'cc', label: 'CC (Copy)' },
  { value: 'in_person_signer', label: 'In-Person Signer' },
]

const ROLE_COLORS = {
  signer: '#E8930C',
  cc: '#6b7280',
  in_person_signer: '#3b82f6',
  editor: '#8b5cf6',
  agent: '#10b981',
}

const RecipientManager = ({ recipients, onChange, users = [] }) => {
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('signer')

  // Build autocomplete options from existing users
  const userOptions = useMemo(() => {
    return (users || [])
      .filter((u) => u.email && !recipients.some((r) => r.email === u.email))
      .map((u) => ({
        value: u.email,
        label: (
          <div className="flex items-center gap-2">
            <UserOutlined className="text-slate-400" />
            <div>
              <div className="text-sm font-medium">{u.full_name || `${u.first_name} ${u.last_name}`}</div>
              <div className="text-xs text-slate-400">{u.email}</div>
            </div>
          </div>
        ),
        name: u.full_name || `${u.first_name} ${u.last_name}`,
        userId: u._id,
      }))
  }, [users, recipients])

  const handleSelectUser = (email, option) => {
    setNewEmail(email)
    setNewName(option.name || '')
  }

  const handleAdd = () => {
    if (!newName.trim() || !newEmail.trim()) return

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) return

    // Check duplicate
    if (recipients.some((r) => r.email.toLowerCase() === newEmail.toLowerCase())) return

    const matchedUser = users?.find((u) => u.email === newEmail)
    const maxOrder = recipients.reduce((max, r) => Math.max(max, r.routingOrder || 0), 0)

    onChange([
      ...recipients,
      {
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        routingOrder: maxOrder + 1,
        userId: matchedUser?._id || null,
        status: 'created',
      },
    ])

    setNewName('')
    setNewEmail('')
    setNewRole('signer')
    setShowAdd(false)
  }

  const handleRemove = (index) => {
    onChange(recipients.filter((_, i) => i !== index))
  }

  const handleUpdateRole = (index, role) => {
    const updated = [...recipients]
    updated[index] = { ...updated[index], role }
    onChange(updated)
  }

  const handleUpdateOrder = (index, order) => {
    const updated = [...recipients]
    updated[index] = { ...updated[index], routingOrder: order }
    onChange(updated)
  }

  const sorted = useMemo(
    () => recipients.map((r, i) => ({ ...r, _idx: i })).sort((a, b) => (a.routingOrder || 1) - (b.routingOrder || 1)),
    [recipients],
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <Title level={5} className="!mb-0">Recipients</Title>
          <Text className="text-slate-400 text-xs">
            Add signers and CC recipients. Adjust the signing order if needed.
          </Text>
        </div>
        <Button
          icon={<UserAddOutlined />}
          onClick={() => setShowAdd(true)}
          style={{ borderRadius: 20, fontWeight: 600 }}
        >
          Add Recipient
        </Button>
      </div>

      {/* Add recipient form */}
      {showAdd && (
        <Card size="small" className="!rounded-xl mb-4 !border-orange-200" style={{ background: '#FFFBF5' }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Text className="text-xs font-medium block mb-1">Name</Text>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name"
                prefix={<UserOutlined className="text-slate-300" />}
              />
            </div>
            <div>
              <Text className="text-xs font-medium block mb-1">Email</Text>
              <AutoComplete
                value={newEmail}
                onChange={setNewEmail}
                onSelect={handleSelectUser}
                options={userOptions}
                placeholder="Email address"
                filterOption={(input, option) =>
                  option.value?.toLowerCase().includes(input.toLowerCase()) ||
                  option.name?.toLowerCase().includes(input.toLowerCase())
                }
                className="w-full"
              />
            </div>
            <div>
              <Text className="text-xs font-medium block mb-1">Role</Text>
              <Select
                value={newRole}
                onChange={setNewRole}
                options={ROLE_OPTIONS}
                className="w-full"
              />
            </div>
            <Space>
              <Button
                type="primary"
                onClick={handleAdd}
                disabled={!newName.trim() || !newEmail.trim()}
                style={{ background: PRIMARY, borderColor: PRIMARY }}
              >
                Add
              </Button>
              <Button onClick={() => { setShowAdd(false); setNewName(''); setNewEmail('') }}>
                Cancel
              </Button>
            </Space>
          </div>
        </Card>
      )}

      {/* Recipient list */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <UserAddOutlined style={{ fontSize: 32, color: '#d1d5db' }} />
          <div className="mt-2 text-sm">No recipients added yet</div>
          <div className="text-xs">Click "Add Recipient" to get started</div>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => (
            <Card key={r._idx} size="small" className="!rounded-xl">
              <div className="flex items-center gap-3">
                {/* Order badge */}
                <div className="flex flex-col items-center gap-1">
                  <InputNumber
                    min={1}
                    max={recipients.length}
                    value={r.routingOrder}
                    onChange={(val) => handleUpdateOrder(r._idx, val)}
                    size="small"
                    style={{ width: 50 }}
                    controls={false}
                  />
                  <Text className="text-[9px] text-slate-400 uppercase">Order</Text>
                </div>

                {/* Recipient info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Text strong className="text-sm truncate">{r.name}</Text>
                    <Tag
                      style={{
                        color: ROLE_COLORS[r.role],
                        borderColor: ROLE_COLORS[r.role],
                        background: `${ROLE_COLORS[r.role]}10`,
                        fontSize: 10,
                      }}
                    >
                      {r.role === 'cc' ? 'CC' : r.role === 'in_person_signer' ? 'In-Person' : 'Signer'}
                    </Tag>
                  </div>
                  <Text className="text-xs text-slate-400">{r.email}</Text>
                </div>

                {/* Role selector */}
                <Select
                  value={r.role}
                  onChange={(val) => handleUpdateRole(r._idx, val)}
                  options={ROLE_OPTIONS}
                  size="small"
                  style={{ width: 130 }}
                />

                {/* Remove */}
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(r._idx)}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      {recipients.length > 0 && (
        <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
          <span>{recipients.filter((r) => r.role === 'signer').length} Signer(s)</span>
          <span>{recipients.filter((r) => r.role === 'cc').length} CC</span>
          <span>{recipients.filter((r) => r.role === 'in_person_signer').length} In-Person</span>
        </div>
      )}
    </div>
  )
}

export default RecipientManager
