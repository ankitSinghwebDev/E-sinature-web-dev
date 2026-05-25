import { Routes, Route, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import Login from './components/Login'
import AppShell from './components/AppShell'
import SigningView from './DocuSign/SigningView'
import { ThemeProvider } from './DocuSign/ThemeProvider'

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useSelector((s) => s.auth)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>} />

        {/* Standalone signing routes (no shell) */}
        <Route
          path="/docusign/sign/:id"
          element={<ProtectedRoute><SigningView /></ProtectedRoute>}
        />
        <Route
          path="/docusign/signing-complete"
          element={<ProtectedRoute><SigningView /></ProtectedRoute>}
        />

        {/* Legacy paths used by the original integration */}
        <Route
          path="/settings/dealmemo/docusign/sign/:id"
          element={<ProtectedRoute><SigningView /></ProtectedRoute>}
        />
        <Route
          path="/settings/dealmemo/docusign/signing-complete"
          element={<ProtectedRoute><SigningView /></ProtectedRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  )
}
