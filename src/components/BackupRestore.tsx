import { ChangeEvent, useEffect, useState } from 'react'
import { Icon } from '../lib/Icon'
import { useApp } from '../data/AppProvider'

type BackupRecord = { path: string; data: unknown; updatedAt?: string | null }
type BackupFile = {
  format: 'quorlyth-backup'
  version: 1
  createdAt: string
  account: { userId: string; name: string }
  recordCount: number
  records: BackupRecord[]
}

function downloadBackup(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'application/vnd.quorlyth.backup+json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function isSafePath(path: string, userId: string, platformAdmin: boolean, data: unknown): boolean {
  if (!path || path.length > 700 || path.startsWith('/') || /(^|\/)\.\.?($|\/)/.test(path)) return false
  const segments = path.split('/')
  if (segments.some(part => !part || part.startsWith('.'))) return false
  const forbidden = new Set(['auth', 'private', 'platform_roles', 'secrets', 'system', 'config'])
  if (forbidden.has(segments[0])) return false
  if (path === 'profiles/' + userId) return true
  if (path === 'data/users/' + userId || path.startsWith('data/users/' + userId + '/')) return true
  if (path === 'settings/space') return platformAdmin
  // Role and membership records must never be restored from a user-provided file.
  if (['members', 'standaloneProjectMembers', 'communityJoinRequests', 'decisions', 'requests', 'votes'].includes(segments[0])) return false
  const restorableCollections = new Set([
    'communities', 'ideas', 'reviews', 'ideaOutcomes', 'promotions', 'volunteers',
    'projects', 'milestones', 'workSubmissions', 'standaloneProjects', 'standaloneTasks',
    'standaloneArtifacts', 'standaloneComments', 'standaloneGithubRepos', 'ideas',
  ])
  if (!restorableCollections.has(segments[0])) return false
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const record = data as Record<string, unknown>
  return ['authorId', 'createdBy', 'ownerId', 'submittedBy', 'by', 'applicantId'].some(field => record[field] === userId)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function BackupRestore() {
  const a = useApp()
  const userId = a.me?.id || ''
  const cacheKey = 'quorlyth:backup:last:' + userId
  const [busy, setBusy] = useState<'backup' | 'restore' | ''>('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [lastBackup, setLastBackup] = useState('')
  const [status, setStatus] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    try { setLastBackup(userId ? localStorage.getItem(cacheKey) || '' : '') } catch { setLastBackup('') }
  }, [userId, cacheKey])

  async function createBackup() {
    if (!a.me || !a.backend || busy) return
    setBusy('backup')
    setStatus(null)
    try {
      const records = await a.backend.store.exportAll()
      const payload: BackupFile = {
        format: 'quorlyth-backup',
        version: 1,
        createdAt: new Date().toISOString(),
        account: { userId: a.me.id, name: a.me.name || 'Quorlyth member' },
        recordCount: records.length,
        records: records.map(record => ({ path: record.path, data: record.data, updatedAt: record.updatedAt })),
      }
      const serialized = JSON.stringify(payload)
      const day = new Date().toISOString().slice(0, 10)
      downloadBackup('Quorlyth-backup-' + day + '.qbackup', serialized)
      const savedAt = payload.createdAt
      setLastBackup(savedAt)
      try { localStorage.setItem(cacheKey, savedAt) } catch {}
      setStatus({ kind: 'success', text: 'Your backup is ready. ' + records.length.toLocaleString() + ' records were packed into a portable Quorlyth backup file (' + formatBytes(new Blob([serialized]).size) + ').' })
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Quorlyth could not prepare the backup. Check your connection and try again.' })
    } finally {
      setBusy('')
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.currentTarget.files?.[0] || null)
    setStatus(null)
  }

  async function restoreBackup() {
    if (!a.me || !a.backend || !selectedFile || busy) return
    if (selectedFile.size > 100 * 1024 * 1024) {
      setStatus({ kind: 'error', text: 'This backup is larger than the 100 MB restore limit. Select a smaller backup file.' })
      return
    }
    if (!window.confirm('Restore this Quorlyth backup into the account you are currently signed into? Matching records may be overwritten. Records not included in the backup will not be deleted.')) return

    setBusy('restore')
    setStatus(null)
    let restored = 0
    let skipped = 0
    let failed = 0
    try {
      const parsed = JSON.parse(await selectedFile.text()) as Partial<BackupFile>
      if (parsed.format !== 'quorlyth-backup' || parsed.version !== 1 || !parsed.account?.userId || parsed.account.userId !== a.me.id || !Array.isArray(parsed.records)) {
        throw new Error('This backup is not valid for the account currently signed in. Choose a Quorlyth backup made from this same account.')
      }
      if (parsed.records.length > 20000) throw new Error('This backup contains too many records to restore safely.')
      const seen = new Set<string>()
      for (const item of parsed.records) {
        if (!item || typeof item.path !== 'string' || !isSafePath(item.path, a.me.id, a.platformAdmin, item.data) || seen.has(item.path)) {
          skipped++
          continue
        }
        seen.add(item.path)
        try {
          await a.backend.store.set(item.path, item.data)
          restored++
        } catch {
          // Backend authorization remains the final gate. A backup cannot grant access.
          failed++
        }
      }
      setStatus({
        kind: restored ? 'success' : 'error',
        text: restored
          ? 'Restore finished: ' + restored.toLocaleString() + ' records restored, ' + skipped.toLocaleString() + ' protected or unsupported records skipped' + (failed ? ', ' + failed.toLocaleString() + ' records rejected by the backend.' : '. Records not in this backup were left untouched.')
          : 'Nothing was restored. ' + skipped.toLocaleString() + ' records were skipped' + (failed ? ' and ' + failed.toLocaleString() + ' were rejected by the backend.' : '. Make sure you selected a backup from this account.'),
      })
      setSelectedFile(null)
      const input = document.getElementById('quorlyth-backup-file') as HTMLInputElement | null
      if (input) input.value = ''
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'This backup could not be read. Choose a valid .qbackup file and try again.' })
    } finally {
      setBusy('')
    }
  }

  return <section className="q-backup-shell" aria-label="Backup and restore">
    <div className="q-backup-hero">
      <span className="q-backup-mark"><Icon name="shield-check" size={23} /></span>
      <div className="q-backup-hero__copy">
        <p className="ql-eyebrow">YOUR DATA · YOUR CONTROL</p>
        <h3>Backup & restore</h3>
        <p>Keep a portable copy of your Quorlyth records, then restore it to this same account when you need to move devices or recover from a change.</p>
      </div>
      <span className="q-backup-live"><i />Account scoped</span>
    </div>

    <div className="q-backup-grid">
      <article className="q-backup-card">
        <div className="q-backup-card__icon"><Icon name="download" size={19} /></div>
        <p className="ql-eyebrow">01 · CREATE A COPY</p>
        <h4>Back up your Quorlyth data</h4>
        <p>Creates a portable <strong>.qbackup</strong> file using records this account is allowed to export. The file is downloaded to your device.</p>
        <div className="q-backup-fact"><span>Last backup</span><strong>{lastBackup ? new Date(lastBackup).toLocaleString() : 'Not created on this device yet'}</strong></div>
        <button type="button" className="btn p q-backup-action" onClick={() => void createBackup()} disabled={!a.backend || !a.me || !!busy}>
          <Icon name="download" size={16} />{busy === 'backup' ? 'Preparing backup…' : 'Create backup'}
        </button>
      </article>

      <article className="q-backup-card">
        <div className="q-backup-card__icon"><Icon name="refresh-cw" size={19} /></div>
        <p className="ql-eyebrow">02 · RECOVER YOUR COPY</p>
        <h4>Restore from a backup</h4>
        <p>Select a Quorlyth backup made by this same account. Restore adds or updates permitted records and never deletes records that are not in the file.</p>
        <label className="q-backup-dropzone" htmlFor="quorlyth-backup-file">
          <Icon name="file-up" size={22} />
          <strong>{selectedFile ? selectedFile.name : 'Choose a backup file'}</strong>
          <small>{selectedFile ? formatBytes(selectedFile.size) + ' · Selected' : '.qbackup file · Maximum 100 MB'}</small>
          <input id="quorlyth-backup-file" type="file" accept=".qbackup,.json,application/json" onChange={handleFileChange} disabled={!!busy} />
        </label>
        <button type="button" className="btn q-backup-action" onClick={() => void restoreBackup()} disabled={!selectedFile || !a.backend || !a.me || !!busy}>
          <Icon name="refresh-cw" size={16} />{busy === 'restore' ? 'Restoring records…' : 'Restore backup'}
        </button>
      </article>
    </div>

    {status && <div className={'q-backup-status q-backup-status--' + status.kind} role={status.kind === 'error' ? 'alert' : 'status'}>{status.text}</div>}
    <div className="q-backup-privacy"><Icon name="lock" size={16} /><p><strong>Designed to respect account permissions.</strong> Backups contain records visible to your account, not passwords or sign-in tokens. Restoring never grants roles or memberships, and the server still checks permissions for every write. The backup file is <strong>not encrypted</strong>, so store it somewhere private. Uploaded media bytes and third-party content may remain in their original storage and may not be embedded in the backup file.</p></div>
  </section>
}
