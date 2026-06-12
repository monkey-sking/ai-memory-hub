import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { AppLanguage } from '../lib/i18n'
import Sidebar from './Sidebar'
import './Layout.css'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('hub-sidebar') === 'collapsed')
  const [language, setLanguage] = useState<AppLanguage>(() => localStorage.getItem('hub-language') === 'en' ? 'en' : 'zh')

  useEffect(() => {
    localStorage.setItem('hub-sidebar', collapsed ? 'collapsed' : 'expanded')
  }, [collapsed])

  useEffect(() => {
    localStorage.setItem('hub-language', language)
  }, [language])

  const toggleLanguage = () => setLanguage(value => value === 'zh' ? 'en' : 'zh')

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-is-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} language={language} onToggle={() => setCollapsed(value => !value)} />
      <main className="main-content">
        <Outlet context={{ language, toggleLanguage }} />
      </main>
    </div>
  )
}
