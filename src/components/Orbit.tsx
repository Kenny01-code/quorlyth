export function Orbit() {
  const ticks = []
  for (let i = 0; i < 120; i++) {
    const x = (Math.PI / 180) * i * 3
    const r2 = i % 10 === 0 ? 284 : i % 5 === 0 ? 290 : 295
    ticks.push(<line key={i} x1={450 + 300 * Math.cos(x)} y1={300 + 300 * Math.sin(x)} x2={450 + r2 * Math.cos(x)} y2={300 + r2 * Math.sin(x)} strokeOpacity={i % 10 === 0 ? 0.5 : 0.2} />)
  }
  const node = { fill: '#fff', stroke: 'none', style: { filter: 'drop-shadow(0 0 8px #fff)' } as React.CSSProperties }
  return (
    <svg className="orb" viewBox="0 0 900 600" fill="none" stroke="#fff" strokeWidth="1" aria-hidden="true">
      <g>{ticks}</g>
      <circle cx="450" cy="300" r="300" strokeOpacity=".1" />
      <circle cx="450" cy="300" r="215" strokeOpacity=".12" />
      <g className="sp"><circle cx="450" cy="300" r="215" strokeOpacity=".18" strokeDasharray="2 8" /><circle cx="665" cy="300" r="4" {...node} /></g>
      <g className="sp b"><circle cx="450" cy="300" r="140" strokeOpacity=".14" /><circle cx="310" cy="300" r="3" {...node} /></g>
    </svg>
  )
}
