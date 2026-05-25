import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Button, Layout, Typography } from 'antd'
import { LogoutOutlined } from '@ant-design/icons'
import { fetchUsers, logout } from '../store/store'
import { DocuSignPanel } from '../DocuSign'

const { Header, Content } = Layout
const { Title, Text } = Typography

export default function AppShell() {
  const dispatch = useDispatch()
  const { user } = useSelector((s) => s.auth)

  useEffect(() => {
    dispatch(fetchUsers())
  }, [dispatch])

  return (
    <Layout className="min-h-screen">
      <Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#E8930C',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            eS
          </div>
          <Title level={5} style={{ margin: 0 }}>
            eSignature Module
          </Title>
        </div>

        <div className="flex items-center gap-3">
          <Text type="secondary">
            {user?.full_name || user?.email}
            {user?.role === 'admin' ? '  ·  Admin' : ''}
          </Text>
          <Button icon={<LogoutOutlined />} onClick={() => dispatch(logout())}>
            Sign out
          </Button>
        </div>
      </Header>

      <Content style={{ background: '#f8fafc' }}>
        <DocuSignPanel />
      </Content>
    </Layout>
  )
}
