import { useEffect, useRef, useState } from 'react'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { Head } from '../components/ui'
import { download } from './Analytics'
import { useApp } from '../data/AppProvider'
import { Doc } from '../data/docstore'
import { cn, slug } from '../lib/util'
import { useDraftState } from '../lib/useDraftState'

const COLLS = ['communities', 'ideas', 'reviews', 'votes', 'members', 'profiles', 'requests', 'decisions', 'promotions', 'settings', 'config']
const cell = (v: any) => v == null ? '' : typeof v === 'number' && v > 1e12 && v < 4e12 ? new Date(v).toLocaleString() : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function Database() {
  return <Gate owner><Inner /></Gate>
}

function Inner() {
  const a = useApp()
  const [path, setPath] = useState('communities')
  const [custom, setCustom] = useState('')
  const [rows, setRows] = useState<Doc[]>([])
  const [q, setQ] = useState('')
  const [edit, setEdit, clearEditDraft] = useDraftState<null | { id: string; isNew?: boolean; json: string; newId?: string }>(`q-draft:${a.me?.id}:database:${path}`, null)
  const [showEditor, setShowEditor] = useState(!!edit)
  const [err, setErr] = useState('')
  const [del, setDel] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    setRefreshing(true)
    const timeout = window.setTimeout(() => { if (active) setRefreshing(false) }, 8000)
    const off = a.backend!.store.subscribe(path, docs => {
      if (!active) return
      setRows(docs); setRefreshing(false); clearTimeout(timeout)
    })
    return () => { active = false; clearTimeout(timeout); off() }
  }, [path, a.backend, refreshKey])
  const shown = rows.filter(r => !q || (r.id + JSON.stringify(r.data)).toLowerCase().includes(q.toLowerCase()))
  const kc: Record<string, number> = {}
  rows.slice(0, 60).forEach(r => Object.keys(r.data || {}).forEach(k => (kc[k] = (kc[k] || 0) + 1)))
  const cols = Object.keys(kc).sort((x, y) => kc[y] - kc[x]).slice(0, 5)

  function openPath() {
    const p = custom.trim().replace(/^\/|\/$/g, '')
    if (!p) return a.toast('Type a path first, for example ideas or ideas/abc/comments')
    if (p.split('/').length % 2 === 0) return a.toast('A collection path has an odd number of parts, like ideas or ideas/abc/comments')
    setPath(p); setQ(''); a.toast('Opened ' + p)
  }

  async function save() {
    if (!edit) return
    let o: any
    try { o = JSON.parse(edit.json); if (!o || typeof o !== 'object' || Array.isArray(o)) throw 0 } catch { return setErr('That is not a valid JSON object.') }
    const id = edit.isNew ? (edit.newId?.trim() || slug()) : edit.id
    if (/[/\s]/.test(id)) return setErr('The id cannot contain spaces or slashes.')
    try {
      await a.backend!.store.set(path + '/' + id, o)
      a.toast('Saved'); clearEditDraft(null); setShowEditor(false); setErr(''); setDel(false)
    } catch { setErr('Save failed. Your draft is still saved on this device.') }
  }

  return (
    <>
      <Head kicker="Database" title="Your data, in full." right={<div className="acts" style={{ margin: 0 }}>{edit && !showEditor && <button className="btn" onClick={() => setShowEditor(true)}><Icon name="edit" size={16} />Resume draft</button>}<button className="btn" disabled={refreshing} onClick={() => { setRefreshing(true); setRefreshKey(k => k + 1) }}><Icon name="rotate" size={16} />{refreshing ? 'Refreshing' : 'Refresh data'}</button><button className="btn p" onClick={() => { setEdit({ id: '', isNew: true, json: '{\n  \n}', newId: '' }); setShowEditor(true) }}><Icon name="contribute" size={16} />New document</button></div>} />
      <div className="glass pad">
        <div className="acts" style={{ margin: '0 0 16px' }}>{COLLS.map(c => <button key={c} className={cn('chip', path === c && 'on')} onClick={() => { setPath(c); setQ('') }}>{c}</button>)}</div>
        <div className="acts" style={{ margin: '0 0 18px' }}>
          <div className="iw" style={{ flex: 1, minWidth: 200 }}><Icon name="search" /><input placeholder={'Search in ' + path} value={q} onChange={e => setQ(e.target.value)} aria-label="Search rows" /></div>
          <div className="iw" style={{ flex: 1, minWidth: 200 }}><Icon name="db" /><input placeholder="Open any path" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && openPath()} aria-label="Open a path" /></div>
          <button className="chip" onClick={openPath}>Open</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <p className="dim">{path}, {shown.length}{shown.length !== rows.length ? ' of ' + rows.length : ''} document{rows.length === 1 ? '' : 's'}</p>
          <div className="acts" style={{ margin: 0 }}>
            <button className="chip" disabled={refreshing} onClick={() => { setRefreshing(true); setRefreshKey(k => k + 1) }}><Icon name="rotate" size={14} />{refreshing ? 'Refreshing' : 'Refresh'}</button>
            <button className="chip" onClick={() => download(`quorlyth-${path.replace(/\//g, '-')}.json`, 'application/json', JSON.stringify(rows.map(r => ({ id: r.id, ...r.data })), null, 2))}>Export JSON</button>
            <button className="chip" onClick={() => file.current?.click()}>Import JSON</button>
          </div>
        </div>
        <input ref={file} type="file" accept="application/json,.json" className="hide" onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
          try { const j = JSON.parse(await f.text()); const arr = Array.isArray(j) ? j : Object.keys(j).map(k => ({ id: k, ...j[k] })); if (arr.length > 300) return a.toast('Import up to 300 documents at a time'); for (const o of arr) { const { id, ...d } = o; await a.backend!.store.set(path + '/' + String(id || slug()), d) } a.toast(arr.length + ' imported') } catch { a.toast('That file could not be imported') }
        }} />
        <div className="dbw">
          {shown.length ? (
            <table className="dbt"><thead><tr><th>id</th>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{shown.map(r => <tr key={r.id} onClick={() => { setEdit({ id: r.id, json: JSON.stringify(r.data, null, 2) }); setShowEditor(true); setDel(false); setErr('') }}><td>{r.id}</td>{cols.map(c => <td key={c} title={cell(r.data[c])}>{cell(r.data[c]).slice(0, 80)}</td>)}</tr>)}</tbody></table>
          ) : <p className="mut" style={{ padding: '30px 0', textAlign: 'center' }}>{rows.length ? 'No rows match your search.' : 'This collection is empty.'}</p>}
        </div>
      </div>
      {edit && showEditor && (
        <div id="dbm" onClick={e => e.target === e.currentTarget && setShowEditor(false)}>
          <div className="cb glass" style={{ padding: 24, maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><h3>{edit.isNew ? 'New document' : 'Edit document'}</h3><button className="chip" onClick={() => setShowEditor(false)}>Close</button></div>
            <p className="dim" style={{ margin: '6px 0 14px', wordBreak: 'break-all' }}>{path}{edit.isNew ? '' : '/' + edit.id}</p>
            <p className="dim" style={{ margin: '0 0 8px', fontSize: 12 }}>Changes are kept as a draft on this device until saved.</p>
            {edit.isNew && <label className="field" style={{ marginTop: 0 }}><span>Document id (leave empty for automatic)</span><input maxLength={80} value={edit.newId || ''} onChange={e => setEdit({ ...edit, newId: e.target.value })} placeholder="optional" /></label>}
            <label className="field"><span>Data as JSON</span><textarea className="code" spellCheck={false} value={edit.json} onChange={e => setEdit({ ...edit, json: e.target.value })} /></label>
            <div style={{ minHeight: 20, marginTop: 10, fontSize: 13 }}>{err}</div>
            <div className="acts"><button className="btn p" onClick={save}>Save</button>{!edit.isNew && <button className="btn" onClick={async () => { if (!del) return setDel(true); await a.backend!.store.delete(path + '/' + edit.id); a.toast('Deleted'); clearEditDraft(null); setShowEditor(false) }}>{del ? 'Confirm delete' : 'Delete'}</button>}<button className="btn" onClick={() => setShowEditor(false)}>Keep as draft</button><button className="chip" onClick={() => { clearEditDraft(null); setShowEditor(false) }}>Discard draft</button></div>
          </div>
        </div>
      )}
    </>
  )
}
