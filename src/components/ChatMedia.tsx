import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { Icon } from '../lib/Icon'
import { useApp } from '../data/AppProvider'

export type ChatAttachment = {
  path: string
  name: string
  mimeType: string
  size: number
  uploadedAt: number
  kind?: 'file' | 'voice'
  durationMs?: number
}
export type VoiceNoteDraft = { file: File; durationMs: number }

const MAX_FILES = 8
const MAX_FILE_BYTES = 25 * 1024 * 1024
const ACCEPTED = 'image/*,video/*,audio/*,application/pdf,text/plain,text/markdown,text/csv,application/json,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'

function formatBytes(size: number) {
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB'
  return (size / (1024 * 1024)).toFixed(1) + ' MB'
}
function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

export function ChatMediaComposer({ files, onFilesChange, voiceNote, onVoiceNoteChange, disabled = false }: {
  files: File[]
  onFilesChange: (files: File[]) => void
  voiceNote: VoiceNoteDraft | null
  onVoiceNoteChange: (note: VoiceNoteDraft | null) => void
  disabled?: boolean
}) {
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [issue, setIssue] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250)
    return () => window.clearInterval(timer)
  }, [recording])
  useEffect(() => () => {
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    } catch {}
    streamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    setIssue('')
    const selected = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    if (!selected.length) return
    if (selected.some(file => file.size > MAX_FILE_BYTES)) {
      setIssue('Each file must be 25 MB or smaller.')
      return
    }
    if (files.length + selected.length + (voiceNote ? 1 : 0) > MAX_FILES) {
      setIssue('Send up to 8 files or voice notes in one message.')
      return
    }
    onFilesChange([...files, ...selected])
  }

  async function startRecording() {
    setIssue('')
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setIssue('Voice recording is not supported in this browser. You can attach an audio file instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => {
        try { return MediaRecorder.isTypeSupported(type) } catch { return false }
      })
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined)
      streamRef.current = stream
      recorderRef.current = recorder
      chunksRef.current = []
      startedAtRef.current = Date.now()
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data) }
      recorder.onerror = () => setIssue('The voice note could not be recorded. Check microphone access and try again.')
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm'
        const durationMs = Math.max(500, Date.now() - startedAtRef.current)
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
        recorderRef.current = null
        chunksRef.current = []
        setRecording(false)
        setElapsedMs(durationMs)
        if (blob.size > MAX_FILE_BYTES) {
          setIssue('This voice note is larger than 25 MB. Record a shorter note and try again.')
          return
        }
        if (files.length + 1 > MAX_FILES) {
          setIssue('Remove a file before adding a voice note. The limit is 8 items per message.')
          return
        }
        onVoiceNoteChange({ file: new File([blob], 'voice-note.' + extension, { type: mimeType }), durationMs })
      }
      recorder.start(250)
      setRecording(true)
      setElapsedMs(0)
    } catch (error) {
      setIssue(error instanceof Error && /denied|permission/i.test(error.message)
        ? 'Microphone permission was denied. Allow microphone access in your browser settings.'
        : 'Could not access the microphone. Check your browser permissions and try again.')
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  function stopRecording() {
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    } catch {
      setIssue('The recording could not be stopped cleanly. Please try again.')
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
      setRecording(false)
    }
  }

  return <div className="chat-media-composer">
    <div className="chat-media-actions">
      <button type="button" className="chat-media-action" disabled={disabled || recording || files.length + (voiceNote ? 1 : 0) >= MAX_FILES} onClick={() => fileInput.current?.click()}>
        <Icon name="paperclip" size={15} /> Attach files
      </button>
      <input ref={fileInput} className="chat-media-file-input" type="file" multiple accept={ACCEPTED} onChange={selectFiles} aria-label="Attach files" />
      {recording
        ? <button type="button" className="chat-media-action is-recording" disabled={disabled} onClick={stopRecording}><span className="chat-recording-dot" /> Stop recording · {formatDuration(elapsedMs)}</button>
        : <button type="button" className="chat-media-action" disabled={disabled || files.length + (voiceNote ? 1 : 0) >= MAX_FILES} onClick={() => void startRecording()}><Icon name="mic" size={15} /> Record voice note</button>}
      <span className="chat-media-limit">{files.length + (voiceNote ? 1 : 0)}/{MAX_FILES} · 25 MB each</span>
    </div>
    {(files.length > 0 || voiceNote) && <div className="chat-media-pending" aria-label="Attachments to send">
      {files.map((file, index) => <div className="chat-media-pending-item" key={file.name + '-' + file.size + '-' + index}>
        <span className="chat-media-file-icon"><Icon name="file" size={14} /></span><span className="chat-media-file-copy"><b>{file.name}</b><small>{formatBytes(file.size)}</small></span>
        <button type="button" disabled={disabled || recording} aria-label={'Remove ' + file.name} title={'Remove ' + file.name} onClick={() => onFilesChange(files.filter((_, i) => i !== index))}><Icon name="x" size={14} /></button>
      </div>)}
      {voiceNote && <VoicePreview note={voiceNote} disabled={disabled || recording} onRemove={() => onVoiceNoteChange(null)} />}
    </div>}
    {issue && <p className="chat-media-issue" role="alert">{issue}</p>}
  </div>
}

function VoicePreview({ note, disabled, onRemove }: { note: VoiceNoteDraft; disabled: boolean; onRemove: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(note.file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [note.file])
  return <div className="chat-media-pending-item is-voice">
    <span className="chat-media-file-icon"><Icon name="mic" size={14} /></span><span className="chat-media-file-copy"><b>Voice note</b><small>{formatDuration(note.durationMs)} · {formatBytes(note.file.size)}</small></span>
    {url && <audio controls preload="metadata" src={url} aria-label="Preview voice note" />}
    <button type="button" disabled={disabled} aria-label="Remove voice note" onClick={onRemove}><Icon name="x" size={14} /></button>
  </div>
}

function ChatAttachmentItem({ attachment }: { attachment: ChatAttachment }) {
  const app = useApp()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true
    setUrl('')
    setUnavailable(false)
    setLoading(true)
    const getUrl = app.backend?.getChatFileUrl
    if (!getUrl) {
      setUnavailable(true)
      setLoading(false)
      return () => { active = false }
    }
    void getUrl(attachment.path).then(value => {
      if (active) setUrl(value)
    }).catch(() => {
      if (active) setUnavailable(true)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [app.backend, attachment.path])

  if (attachment.kind === 'voice' || attachment.mimeType.startsWith('audio/')) {
    return <div className="chat-media-attachment is-audio">
      <span className="chat-media-file-icon"><Icon name="mic" size={15} /></span>
      <div className="chat-media-attachment-copy"><b>Voice note</b><small>{attachment.durationMs ? formatDuration(attachment.durationMs) + ' · ' : ''}{formatBytes(attachment.size)}</small></div>
      {url ? <audio controls preload="metadata" src={url} aria-label="Voice note" /> : <small className="chat-media-muted">{loading ? 'Loading audio…' : unavailable ? 'Audio unavailable' : ''}</small>}
    </div>
  }
  return <div className="chat-media-attachment">
    <span className="chat-media-file-icon"><Icon name={attachment.mimeType.startsWith('image/') ? 'image' : 'file'} size={15} /></span>
    <div className="chat-media-attachment-copy"><b title={attachment.name}>{attachment.name}</b><small>{formatBytes(attachment.size)} · {attachment.mimeType || 'File'}</small></div>
    {url ? <a href={url} target="_blank" rel="noreferrer" download={attachment.name}>Open file <Icon name="arrow-up-right" size={12} /></a> : <small className="chat-media-muted">{loading ? 'Preparing secure link…' : unavailable ? 'File unavailable' : ''}</small>}
  </div>
}

export function ChatAttachmentList({ attachments }: { attachments?: ChatAttachment[] }) {
  if (!attachments?.length) return null
  return <div className="chat-media-attachments">{attachments.map((attachment, index) => <ChatAttachmentItem key={attachment.path + '-' + index} attachment={attachment} />)}</div>
}
