/**
 * SaveAsTemplateModal — collects template metadata (name, description,
 * category) for saving an envelope as a reusable template.
 *
 * Category is freeform — an AutoComplete suggests categories already
 * in use on existing templates, but the user can type anything new.
 * The slug is normalised on submit so storage stays consistent.
 *
 * On submit, calls `onSubmit({ name, description, category })` — the
 * parent dispatches the createDocuSignTemplate thunk with the rest of
 * the envelope payload (document, recipients, tabs, settings).
 */

import { AutoComplete, Form, Input, Modal } from 'antd'
import { useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'

const EMPTY = []

const slugCategory = (s) => (s || '')
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

const SaveAsTemplateModal = ({
  open,
  onCancel,
  onSubmit,
  defaultName = '',
  defaultDescription = '',
  defaultCategory = '',
  saving = false,
}) => {
  const [form] = Form.useForm()

  const templates = useSelector((s) => s.docusign?.templates) ?? EMPTY
  const categorySuggestions = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const t of templates) {
      const c = t?.category
      if (!c || seen.has(c)) continue
      seen.add(c)
      out.push({ value: c, label: c })
    }
    return out.sort((a, b) => a.value.localeCompare(b.value))
  }, [templates])

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        name: defaultName || '',
        description: defaultDescription || '',
        category: defaultCategory || '',
      })
    }
  }, [open, defaultName, defaultDescription, defaultCategory, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      onSubmit?.({ ...values, category: slugCategory(values.category) || 'other' })
    } catch {
      // antd shows validation errors inline
    }
  }

  return (
    <Modal
      title="Save as Template"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Save Template"
      confirmLoading={saving}
      destroyOnClose
      width={460}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: defaultName,
          description: defaultDescription,
          category: defaultCategory,
        }}
        requiredMark={false}
      >
        <Form.Item
          label="Template name"
          name="name"
          rules={[
            { required: true, message: 'Give the template a name' },
            { max: 80, message: 'Max 80 characters' },
          ]}
        >
          <Input placeholder="e.g. Crew NDA, Standard Deal Memo" autoFocus />
        </Form.Item>

        <Form.Item
          label="Description"
          name="description"
          extra="Short note — helps your team find the right template later."
          rules={[{ max: 200, message: 'Max 200 characters' }]}
        >
          <Input.TextArea
            placeholder="e.g. Standard confidentiality agreement for all crew"
            rows={3}
            maxLength={200}
            showCount
          />
        </Form.Item>

        <Form.Item
          label="Category"
          name="category"
          extra="Type whatever fits — your existing categories autocomplete below."
          rules={[{ required: true, message: 'Add a category (or type a new one)' }]}
        >
          <AutoComplete
            options={categorySuggestions}
            placeholder="e.g. NDA, Deal Memo, Crew Onboarding, Location Release…"
            filterOption={(input, option) =>
              (option?.value || '').toLowerCase().includes(input.toLowerCase())
            }
            allowClear
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default SaveAsTemplateModal
