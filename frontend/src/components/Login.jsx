import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, Divider, Form, Input, Typography, message } from 'antd'
import { LockOutlined, MailOutlined, ThunderboltFilled } from '@ant-design/icons'
import { loginUser } from '../store/store'

const { Title, Text } = Typography

const ADMIN_CREDS = { email: 'james@example.com', password: 'password123' }

export default function Login() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { isAuthenticated } = useSelector((s) => s.auth)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [quickLoading, setQuickLoading] = useState(false)

  if (isAuthenticated) return <Navigate to="/" replace />

  const doLogin = async (values, setBusy) => {
    setBusy(true)
    const result = await dispatch(loginUser(values))
    setBusy(false)
    if (result.meta.requestStatus === 'fulfilled') {
      message.success('Logged in')
      navigate('/')
    } else {
      message.error(result.payload || 'Login failed')
    }
  }

  const onSubmit = (values) => doLogin(values, setLoading)

  // Fill the form fields visibly, then submit — the user sees what
  // we're logging in with, not a black-box auto-action.
  const loginAsAdmin = () => {
    form.setFieldsValue(ADMIN_CREDS)
    doLogin(ADMIN_CREDS, setQuickLoading)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <div className="text-center mb-6">
          <Title level={3} style={{ color: '#E8930C', marginBottom: 4 }}>
            eSignature Module
          </Title>
          <Text type="secondary">Sign in to manage envelopes</Text>
        </div>

        <Button
          icon={<ThunderboltFilled />}
          onClick={loginAsAdmin}
          loading={quickLoading}
          block
          size="large"
          style={{ background: '#fef3c7', borderColor: '#fbbf24', color: '#92400e', fontWeight: 600 }}
        >
          Login as Admin
        </Button>

        <Divider plain style={{ fontSize: 11, color: '#94a3b8', margin: '16px 0' }}>or sign in manually</Divider>

        <Form
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          initialValues={ADMIN_CREDS}
        >
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input prefix={<MailOutlined />} placeholder="you@example.com" size="large" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="••••••••" size="large" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              style={{ background: '#E8930C', borderColor: '#E8930C' }}
            >
              Sign in
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center text-xs text-slate-400 mt-2">
          Seed credentials: {ADMIN_CREDS.email} / {ADMIN_CREDS.password}
        </div>
      </Card>
    </div>
  )
}
