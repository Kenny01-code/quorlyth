import { useState } from 'react'
import { Chip } from './ui'

const CATS: [string, string[]][] = [
  ['Faces', '😀😃😄😁😆😅😂🤣😊😇🙂😉😍🥰😘😎🤩🥳😌🤗🤔😮🥹😭😤'.match(/\p{Extended_Pictographic}/gu) || []],
  ['Hands', ['👍', '👏', '🙌', '🙏', '🤝', '💪', '👀', '🫶', '✌️', '🤞', '👋', '🤙', '👌', '🫡']],
  ['Love', ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💫', '✨', '🌟', '⭐', '🔥', '💯']],
  ['Party', ['🎵', '🎶', '🎤', '🎧', '🎸', '🎹', '🥁', '🎬', '🎉', '🎊', '🏆', '🥇', '🎁', '📣']],
  ['Ideas', ['💡', '🧠', '📌', '📍', '🔔', '🚀', '🌍', '✅', '📅', '📢', '🔗', '📝', '💬', '🛠️']],
  ['Nature', ['🌈', '☀️', '🌙', '🌸', '🌿', '🍀', '🌊', '🏔️', '🦋']],
]

export function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const [cat, setCat] = useState(0)
  const recent: string[] = (() => { try { return JSON.parse(localStorage.getItem('qemo') || '[]') } catch { return [] } })()
  const pick = (e: string) => {
    const r = [e, ...recent.filter(x => x !== e)].slice(0, 12)
    try { localStorage.setItem('qemo', JSON.stringify(r)) } catch {}
    onPick(e)
  }
  return (
    <div className="emop">
      <div className="acts" style={{ margin: '0 0 8px', gap: 6 }}>{CATS.map((c, i) => <Chip key={c[0]} on={cat === i} onClick={() => setCat(i)}>{c[0]}</Chip>)}</div>
      <div className="emg">
        {recent.slice(0, 8).map(e => <button key={'r' + e} className="emi" onClick={() => pick(e)} aria-label={'Insert ' + e}>{e}</button>)}
        {recent.length > 0 && <span className="emsep" />}
        {CATS[cat][1].map(e => <button key={e} className="emi" onClick={() => pick(e)} aria-label={'Insert ' + e}>{e}</button>)}
      </div>
    </div>
  )
}
