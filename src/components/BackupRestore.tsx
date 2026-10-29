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
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
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
  const record = data as Record<string, unknown>
  return ['authorId', 'createdBy', 'ownerId', 'submittedBy', 'by', 'applicantId'].some(field => record[field] === userId)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function plainText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.replace(/\r/g, '').trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(item => plainText(item)).filter(Boolean).join(', ')
  return fallback
}

function recordSection(path: string) {
  const root = path.split('/')[0]
  if (root === 'profiles' || path.startsWith('data/users/')) return 'ACCOUNT, PREFERENCES & SAVED ACTIVITY'
  if (root === 'communities' || root === 'members' || root === 'communityJoinRequests') return 'COMMUNITIES & MEMBERSHIPS'
  if (root === 'ideas' || root === 'reviews' || root === 'ideaOutcomes' || root === 'votes') return 'IDEAS & COMMUNITY FEEDBACK'
  if (root === 'projects' || root === 'milestones' || root === 'workSubmissions' || root.startsWith('standalone')) return 'PROJECTS, TASKS & EVIDENCE'
  if (root === 'promotions') return 'PROMOTIONS & SHARE-READY POSTS'
  if (root === 'settings') return 'WORKSPACE SETTINGS'
  return 'OTHER SAVED RECORDS'
}

function readableBackup(records: BackupRecord[], accountName: string, createdAt: string) {
  const grouped = new Map<string, string[]>()
  const sorted = [...records].sort((first, second) => first.path.localeCompare(second.path))
  for (const item of sorted) {
    if (!item || typeof item.path !== 'string' || !item.data || typeof item.data !== 'object' || Array.isArray(item.data)) continue
    const data = item.data as Record<string, unknown>
    const section = recordSection(item.path)
    const title = plainText(data.title, plainText(data.name, plainText(data.summary, plainText(data.text, 'Saved item'))))
    const lines = [
      title,
      plainText(data.summary, plainText(data.description, plainText(data.body))),
      typeof data.status === 'string' ? 'Status: ' + plainText(data.status) : '',
      typeof data.dueAt === 'number' && data.dueAt > 0 ? 'Due: ' + new Date(data.dueAt).toLocaleDateString() : '',
      typeof data.at === 'number' && data.at > 0 ? 'Saved: ' + new Date(data.at).toLocaleString() : '',
      plainText(data.tags) ? 'Tags: ' + plainText(data.tags) : '',
      plainText(data.reviewNote) ? 'Review note: ' + plainText(data.reviewNote) : '',
      Array.isArray(data.attachments) && data.attachments.length ? 'Attachments: ' + data.attachments.map(att => plainText((att as Record<string, unknown>)?.name, 'File')).join(', ') : '',
    ].filter(Boolean).map(value => value.replace(/[ \t]+$/gm, ''))
    const entry = [...new Set(lines)].join('\n')
    if (!entry) continue
    const items = grouped.get(section) || []
    items.push(entry)
    grouped.set(section, items)
  }

  const output = [
    'QUORLYTH BACKUP SUMMARY',
    '========================================',
    'Account: ' + (accountName || 'Quorlyth member'),
    'Created: ' + new Date(createdAt).toLocaleString(),
    'Saved records: ' + records.length.toLocaleString(),
    '',
    'This is the readable summary of your backup. Keep the matching .qbackup file as well if you want to restore supported records later.',
    'The summary is for reading and does not replace the .qbackup restore file.',
    '',
  ]
  for (const [section, entries] of grouped) {
    output.push(section, '-'.repeat(Math.min(section.length, 60)), '')
    for (const entry of entries) output.push(entry, '', '----------------------------------------', '')
  }
  output.push('END OF QUORLYTH BACKUP SUMMARY')
  return output.join('\n')
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
      const readable = readableBackup(records, payload.account.name, payload.createdAt)
      const day = new Date().toISOString().slice(0, 10)
      downloadBackup('Quorlyth-backup-' + day + '.qbackup', serialized)
      // Pair the restore-capable file with a plain-language export that people
      // can actually read without opening developer tooling.
      downloadBackup('Quorlyth-backup-summary-' + day + '.txt', readable)
      const savedAt = payload.createdAt
      setLastBackup(savedAt)
      try { localStorage.setItem(cacheKey, savedAt) } catch {}
      setStatus({ kind: 'success', text: 'Your backup is ready. Quorlyth downloaded a readable summary (' + formatBytes(new Blob([readable]).size) + ') plus a portable restore file (' + formatBytes(new Blob([serialized]).size) + ') containing ' + records.length.toLocaleString() + ' records.' })
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
      <span className="q-backup-mark"><Icon name="private" size={23} /></span>
      <div className="q-backup-hero__copy">
        <p className="ql-eyebrow">YOUR DATA · YOUR CONTROL</p>
        <h3>Backup & restore</h3>
        <p>Keep a portable copy of your Quorlyth records, then restore it to this same account when you need to move devices or recover from a change.</p>
      </div>
      <span className="q-backup-live"><i />Account scoped</span>
    </div>

    <div className="q-backup-grid">
      <article className="q-backup-card">
        <div className="q-backup-card__icon"><Icon name="save" size={19} /></div>
        <p className="ql-eyebrow">01 · CREATE A COPY</p>
        <h4>Back up your Quorlyth data</h4>
        <p>Downloads two files: a readable <strong>.txt summary</strong> you can open like a WhatsApp export, and a portable <strong>.qbackup file</strong> Quorlyth can use to restore supported records later.</p>
        <div className="q-backup-fact"><span>Last backup</span><strong>{lastBackup ? new Date(lastBackup).toLocaleString() : 'Not created on this device yet'}</strong></div>
        <button type="button" className="btn p q-backup-action" onClick={() => void createBackup()} disabled={!a.backend || !a.me || !!busy}>
          <Icon name="download" size={16} />{busy === 'backup' ? 'Preparing backup…' : 'Create backup'}
        </button>
      </article>

      <article className="q-backup-card">
        <div className="q-backup-card__icon"><Icon name="rotate" size={19} /></div>
        <p className="ql-eyebrow">02 · RECOVER YOUR COPY</p>
        <h4>Restore from a backup</h4>
        <p>Select a Quorlyth backup made by this same account. Restore adds or updates permitted records and never deletes records that are not in the file.</p>
        <label className="q-backup-dropzone" htmlFor="quorlyth-backup-file">
          <Icon name="file" size={22} />
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
