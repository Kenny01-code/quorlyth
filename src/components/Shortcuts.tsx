export function Shortcuts({ onClose }: { onClose: () => void }) {
  const rows = [['Search', 'Ctrl K or /'], ['This help', '?'], ['Dashboard', 'g then d'], ['Communities', 'g then c'], ['Review queue', 'g then q'], ['Analytics', 'g then a'], ['My space', 'g then m'], ['Settings', 'g then s']]
  return (
    <div id="kb" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cb glass" style={{ padding: 26, maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3>Keyboard shortcuts</h3><button className="chip" onClick={onClose}>Esc</button></div>
        <div style={{ marginTop: 14 }}>{rows.map(([k, v]) => <div key={k} className="kr"><span className="mut">{k}</span><kbd>{v}</kbd></div>)}</div>
      </div>
    </div>
  )
}
