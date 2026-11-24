import { useEffect } from 'react'
import { Icon } from '../lib/Icon'
import '../styles/image-lightbox.css'

export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div className="qth-image-lightbox" role="dialog" aria-modal="true" aria-label={'Image preview: ' + alt} onClick={onClose}>
      <button type="button" className="qth-image-lightbox__close" aria-label="Close image preview" onClick={event => { event.stopPropagation(); onClose() }}>
        <Icon name="x" size={20} />
      </button>
      <img src={src} alt={alt} onClick={event => event.stopPropagation()} />
      <p>{alt}</p>
    </div>
  )
}
