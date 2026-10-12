// @ts-nocheck
import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl'

const DEFAULT_SRC = 'https://images.unsplash.com/photo-1737071371043-761e02b1ef95?q=80&w=1400&auto=format&fit=crop'
const vertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`
const fragment = `#version 300 es
precision highp float;
uniform sampler2D tImage;
uniform vec2 uResolution;
uniform vec2 uImageSize;
uniform vec2 uPointer;
uniform float uTime;
uniform float uCell;
uniform float uLevels;
uniform float uContrast;
uniform float uBrightness;
uniform float uRadius;
uniform float uSoftness;
uniform float uPresence;
uniform float uReverse;
uniform float uIntro;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uRimColor;
uniform float uRim;
in vec2 vUv;
out vec4 fragColor;
float bayer8(vec2 p) {
  ivec2 cell = ivec2(mod(p, 8.0)); int x = cell.x; int y = cell.y; int value = 0;
  for (int bit = 0; bit < 3; bit++) {
    value |= ((x >> bit) & 1) << (bit * 2);
    value |= (((x >> bit) & 1) ^ ((y >> bit) & 1)) << (bit * 2 + 1);
  }
  return (float(value) + 0.5) / 64.0;
}
vec2 coverUv(vec2 uv) {
  float screenAspect = uResolution.x / uResolution.y;
  float imageAspect = uImageSize.x / uImageSize.y;
  vec2 scale = vec2(1.0);
  if (screenAspect > imageAspect) scale.y = imageAspect / screenAspect;
  else scale.x = screenAspect / imageAspect;
  return (uv - 0.5) * scale + 0.5;
}
vec3 grade(vec3 color) {
  color = clamp((color - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);
  return pow(color, vec3(1.6));
}
void main() {
  vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 cell = floor(pixel / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec2 uv = vec2(center.x / uResolution.x, 1.0 - center.y / uResolution.y);
  vec3 photo = texture(tImage, coverUv(uv)).rgb;
  vec3 graded = grade(photo);
  float luminance = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  float steps = max(uLevels - 1.0, 1.0);
  float scaled = luminance * steps;
  float level = min(floor(scaled) + step(bayer8(cell), fract(scaled)), steps) / steps;
  vec3 dithered = mix(uInk, uPaper, level);
  float distanceToPointer = distance(pixel, uPointer);
  float feather = max(1.0, uRadius * uSoftness);
  float reveal = 1.0 - smoothstep(uRadius - feather, uRadius, distanceToPointer);
  reveal *= uPresence;
  reveal = mix(reveal, 1.0 - reveal, uReverse);
  float rimBand = smoothstep(uRadius, uRadius - feather * 0.25, distanceToPointer)
    - smoothstep(uRadius - feather * 0.25, uRadius - feather * 0.7, distanceToPointer);
  vec3 color = mix(dithered, photo, reveal);
  color = mix(color, uRimColor, rimBand * uRim * uPresence);
  float spread = distance(vUv, vec2(0.5)) * 1.35;
  float appear = step(spread + bayer8(cell + vec2(3.0, 5.0)) * 0.25, uIntro);
  fragColor = vec4(mix(uInk, color, appear), 1.0);
}
`
const hexToRgb = (hex) => {
  let value = String(hex || '').replace('#', '')
  if (value.length === 3) value = value.replace(/./g, (character) => character + character)
  const number = Number.parseInt(value.slice(0, 6), 16)
  return Number.isNaN(number) ? [0, 0, 0] : [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255]
}
const wanderAt = (time, width, height) => [
  width * (0.5 + 0.33 * Math.sin(time * 0.53) + 0.08 * Math.sin(time * 1.31 + 0.6)),
  height * (0.5 + 0.28 * Math.sin(time * 0.71 + 1.1) + 0.07 * Math.cos(time * 1.57)),
]

export default function DitherVeil({
  src = DEFAULT_SRC, pixelSize = 2, levels = 2, inkColor = '#08090a',
  paperColor = '#e7e7e7', contrast = 1.15, brightness = 0,
  revealRadius = 200, softness = 0.6, linger = 1,
  rimColor = '#aeb5bc', rim = 0.16, reverse = false, wander = false,
  className = '', style,
}) {
  const containerRef = useRef(null)
  const settingsRef = useRef(null)
  useEffect(() => {
    settingsRef.current = { pixelSize, levels, inkColor, paperColor, contrast, brightness, revealRadius, softness, linger, rimColor, rim, reverse, wander }
  })
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let renderer
    try {
      renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: false, antialias: false, webgl: 2 })
    } catch (error) {
      console.warn('Quorlyth dither background could not initialize WebGL.', error)
      return undefined
    }
    const gl = renderer.gl
    const canvas = gl.canvas
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%'
    container.appendChild(canvas)
    const texture = new Texture(gl, { minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR })
    const uniforms = {
      tImage: { value: texture }, uResolution: { value: [1, 1] }, uImageSize: { value: [1, 1] },
      uPointer: { value: [0, 0] }, uTime: { value: 0 }, uCell: { value: 3 }, uLevels: { value: 2 },
      uContrast: { value: 1 }, uBrightness: { value: 0 }, uRadius: { value: 200 }, uSoftness: { value: 0.6 },
      uPresence: { value: 0 }, uReverse: { value: 0 }, uIntro: { value: 0 }, uInk: { value: [0, 0, 0] },
      uPaper: { value: [1, 1, 1] }, uRimColor: { value: [1, 1, 1] }, uRim: { value: 0 },
    }
    const program = new Program(gl, { vertex, fragment, uniforms, depthTest: false, depthWrite: false })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })
    const pointer = { x: 0, y: 0, inside: false, placed: false }
    const brush = { x: 0, y: 0 }
    let width = 1, height = 1, presence = 0, raf = 0, introStart = 0, lastMove = 0, imageLoaded = false
    const layout = () => {
      width = Math.max(1, container.clientWidth); height = Math.max(1, container.clientHeight)
      renderer.setSize(width, height); uniforms.uResolution.value = [canvas.width, canvas.height]
      if (!pointer.placed) { pointer.x = brush.x = width / 2; pointer.y = brush.y = height / 2 }
    }
    const frame = (now) => {
      const settings = settingsRef.current
      const dpr = renderer.dpr
      const canWander = settings.wander && !reducedMotion
      let target = [pointer.x, pointer.y]
      if (!pointer.inside && canWander) target = wanderAt(now / 1000, width, height)
      brush.x += (target[0] - brush.x) * 0.2; brush.y += (target[1] - brush.y) * 0.2
      const active = pointer.inside || canWander || now - lastMove < settings.linger * 1000
      presence += ((active ? 1 : 0) - presence) * 0.08
      uniforms.uPointer.value = [brush.x * dpr, brush.y * dpr]
      uniforms.uTime.value = now / 1000
      uniforms.uCell.value = Math.max(1, Math.round(settings.pixelSize * dpr))
      uniforms.uLevels.value = Math.max(2, Math.round(settings.levels))
      uniforms.uContrast.value = settings.contrast; uniforms.uBrightness.value = settings.brightness
      uniforms.uRadius.value = settings.revealRadius * dpr; uniforms.uSoftness.value = settings.softness
      uniforms.uPresence.value = presence; uniforms.uReverse.value = settings.reverse ? 1 : 0
      uniforms.uInk.value = hexToRgb(settings.inkColor); uniforms.uPaper.value = hexToRgb(settings.paperColor)
      uniforms.uRimColor.value = hexToRgb(settings.rimColor); uniforms.uRim.value = settings.rim
      uniforms.uIntro.value = imageLoaded ? Math.min(1, (now - introStart) / 1100) : 0
      renderer.render({ scene: mesh }); raf = requestAnimationFrame(frame)
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'; image.decoding = 'async'
    image.onload = () => { texture.image = image; uniforms.uImageSize.value = [image.naturalWidth, image.naturalHeight]; imageLoaded = true; introStart = performance.now() }
    image.onerror = () => { uniforms.uImageSize.value = [1, 1]; imageLoaded = false }
    image.src = src
    const onMove = (event) => {
      const rect = container.getBoundingClientRect()
      pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top
      pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height
      pointer.placed = true; lastMove = performance.now()
    }
    const onLeave = () => { pointer.inside = false }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave, { passive: true })
    const resizeObserver = new ResizeObserver(layout)
    resizeObserver.observe(container); layout(); raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf); resizeObserver.disconnect(); image.onload = null; image.onerror = null
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerleave', onLeave)
      gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.remove()
    }
  }, [src])
  return <div ref={containerRef} className={`q-dither-veil ${className}`.trim()} style={style} aria-hidden="true" />
}
