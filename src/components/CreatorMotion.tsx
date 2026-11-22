import { useEffect, useRef, useState } from 'react'

const CREATOR_ART = '/creator-hero.webp'

export function HeroCreator() {
  const stageRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { threshold: 0.12 })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={stageRef} className="qth-creator-stage" data-visible={visible ? 'true' : 'false'} aria-hidden="true">
      <div className="qth-creator-stage__art">
        <img src={CREATOR_ART} width="430" height="722" alt="" loading="eager" decoding="async" />
      </div>
    </div>
  )
}

export function PreviewCreator() {
  return (
    <div className="qth-creator-echo" aria-hidden="true">
      <img src={CREATOR_ART} width="430" height="722" alt="" loading="lazy" decoding="async" />
    </div>
  )
}
