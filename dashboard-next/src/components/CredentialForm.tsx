import { useState } from 'react'
import { apiPost } from '../lib/api'
import { Button } from './ui/button'
import { dashboardLabels } from '../lib/dashboardCopy'

export function CredentialForm({ onSaved, language }: { onSaved: () => void; language: 'zh' | 'en' }) {
  const copy = dashboardLabels[language]
  const [id, setId] = useState('')
  const [value, setValue] = useState('')
  const [envVar, setEnvVar] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!id.trim() || (!value && !envVar)) return
    setBusy(true)
    try { await apiPost('/api/credentials', { id: id.trim(), value: value || undefined, envVar: envVar || undefined }); setValue(''); onSaved() } finally { setBusy(false) }
  }
  return <div className="skills-credential-form">
    <input aria-label={copy.credentialId} value={id} onChange={event => setId(event.target.value)} placeholder={copy.credentialId} />
    <input type="password" aria-label={copy.credentialSecret} value={value} onChange={event => setValue(event.target.value)} placeholder={copy.credentialSecret} />
    <input aria-label={copy.credentialEnv} value={envVar} onChange={event => setEnvVar(event.target.value)} placeholder={copy.credentialEnv} />
    <Button size="sm" onClick={() => void save()} disabled={busy}>{copy.save}</Button>
  </div>
}
