import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { AppLanguage } from '../lib/i18n'
import Sidebar from './Sidebar'

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
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} language={language} onToggle={() => setCollapsed(value => !value)} />
      <main className="flex-1 overflow-y-auto">
        <Outlet context={{ language, toggleLanguage }} />
      </main>
    </div>
  )
}
