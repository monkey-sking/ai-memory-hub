import { useState } from 'react'
import { apiPost } from '../lib/api'
import { Button } from './ui/button'

export function CredentialForm({ onSaved, language }: { onSaved: () => void; language: 'zh' | 'en' }) {
  const [id, setId] = useState('')
  const [value, setValue] = useState('')
  const [envVar, setEnvVar] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!id.trim() || (!value && !envVar)) return
    setBusy(true)
    try { await apiPost('/api/credentials', { id: id.trim(), value: value || undefined, envVar: envVar || undefined }); setValue(''); onSaved() } finally { setBusy(false) }
  }
  return <div className="skills-credential-form"><input value={id} onChange={event => setId(event.target.value)} placeholder={language === 'zh' ? '凭据 ID' : 'Credential id'} /><input type="password" value={value} onChange={event => setValue(event.target.value)} placeholder={language === 'zh' ? '密钥（保存后隐藏）' : 'Secret (hidden after save)'} /><input value={envVar} onChange={event => setEnvVar(event.target.value)} placeholder={language === 'zh' ? '或环境变量名' : 'Or environment variable'} /><Button size="sm" onClick={() => void save()} disabled={busy}>{language === 'zh' ? '保存' : 'Save'}</Button></div>
}
