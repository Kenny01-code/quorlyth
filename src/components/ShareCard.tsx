import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Icon } from '../lib/Icon'
import { useApp } from '../data/AppProvider'

export function ShareCard({ title, url, sub }: { title: string; url: string; sub?: string }) {
  const { toast } = useApp()
  const [svg, setSvg] = useState('')
  useEffect(() => { QRCode.toString(url, { type: 'svg', margin: 2, color: { dark: '#000000', light: '#ffffff' } }).then(setSvg) }, [url])
  const png = async () => {
    const d = await QRCode.toDataURL(url, { margin: 2, width: 720 })
    const a = document.createElement('a'); a.href = d; a.download = 'quorlyth-qr.png'; a.click()
  }
  return (
    <div className="glass pad" style={{ marginTop: 18 }}>
      <div className="pw">
        <div className="qrb" dangerouslySetInnerHTML={{ __html: svg }} />
        <div style={{ minWidth: 220, flex: 1 }}>
          <h3>{title}</h3>
          <p className="dim" style={{ margin: '6px 0 12px' }}>{sub || 'Scan or open the link.'}</p>
          <p className="lnk">{url}</p>
          <div className="acts" style={{ marginTop: 12 }}>
            <button className="btn p" style={{ padding: '10px 20px' }} onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link copied'))}><Icon name="link" size={16} />Copy link</button>
            <button className="btn" style={{ padding: '10px 20px' }} onClick={png}><Icon name="publish" size={16} />Save QR</button>
          </div>
        </div>
      </div>
    </div>
  )
}
