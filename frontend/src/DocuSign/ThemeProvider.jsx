/**
 * Theme Provider for eSignature module.
 * Provides dark/light mode toggle via CSS variables + React context.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import { ConfigProvider, theme as antdTheme } from 'antd'

const ThemeContext = createContext({ isDark: false, toggle: () => {} })

export const useTheme = () => useContext(ThemeContext)

const LIGHT = {
  bg: '#ffffff',
  bgSecondary: '#f8fafc',
  bgTertiary: '#f1f5f9',
  bgHover: 'rgba(232, 147, 12, 0.05)',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  card: '#ffffff',
  sidebar: '#ffffff',
  primary: '#E8930C',
  primaryLight: '#FFF7ED',
}

const DARK = {
  bg: '#0f172a',
  bgSecondary: '#1e293b',
  bgTertiary: '#334155',
  bgHover: 'rgba(232, 147, 12, 0.1)',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  border: '#334155',
  borderLight: '#1e293b',
  card: '#1e293b',
  sidebar: '#0f172a',
  primary: '#E8930C',
  primaryLight: '#422006',
}

const applyTheme = (vars) => {
  const root = document.documentElement
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(`--ds-${key}`, value)
  })
}

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('ds-theme') === 'dark'
  })

  useEffect(() => {
    applyTheme(isDark ? DARK : LIGHT)
    localStorage.setItem('ds-theme', isDark ? 'dark' : 'light')
    // Toggle a class on body for Tailwind-compatible dark styles
    document.documentElement.classList.toggle('ds-dark', isDark)
  }, [isDark])

  const toggle = () => setIsDark((p) => !p)

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      <ConfigProvider
        theme={{
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: '#E8930C',
            borderRadius: 8,
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

export default ThemeProvider
