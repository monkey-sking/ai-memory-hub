import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { AppLanguage } from '../lib/i18n'
import Sidebar from './Sidebar'
import './Layout.css'

export default function Layout() {
  const [language, setLanguage] = useState<AppLanguage>(() => localStorage.getItem('hub-language') === 'en' ? 'en' : 'zh')

  useEffect(() => {
    localStorage.setItem('hub-language', language)
    document.documentElement.lang = language
  }, [language])

  const toggleLanguage = () => setLanguage(value => value === 'zh' ? 'en' : 'zh')

  return (
    <div className="app-layout">
      <a className="skip-to-main" href="#main-content">Skip to main content</a>
      <Sidebar language={language} />
      <main id="main-content" className="main-content">
        <Outlet context={{ language, toggleLanguage }} />
      </main>
    </div>
  )
}
