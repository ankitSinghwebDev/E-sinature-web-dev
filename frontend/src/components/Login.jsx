import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { loginUser } from '../store/store'

const { Title, Text } = Typography

export default function Login() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { isAuthenticated } = useSelector((s) => s.auth)
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) return <Navigate to="/" replace />

  const onSubmit = async (values) => {
    setLoading(true)
    const result = await dispatch(loginUser(values))
    setLoading(false)
    if (result.meta.requestStatus === 'fulfilled') {
      message.success('Logged in')
      navigate('/')
    } else {
      message.error(result.payload || 'Login failed')
    }
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

        <Form layout="vertical" onFinish={onSubmit} initialValues={{ email: 'admin@example.com', password: 'password123' }}>
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
          Seed credentials: admin@example.com / password123
        </div>
      </Card>
    </div>
  )
}
