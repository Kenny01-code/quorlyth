// QuorlythBot's Three.js voice orb. Kept behind the shared RobotApi so the
// chat, voice and accessibility controls do not need to know about the renderer.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  WebGLRenderer,
  sRGBEncoding,
} from 'three'
import { THEMES } from './robot-themes'
export { THEMES }

type OrbOptions = { drag?: boolean; theme?: string; onerror?: (error: unknown) => void }

type OrbApi = {
  theme: (name: string) => void
  active: (value: boolean) => void
  spin: () => void
  turn: (value: boolean) => void
  lvl: (value: number) => void
  calm: (value: boolean) => void
  set: (name: string) => void
  wave: (ms?: number) => void
  welcome: () => void
  cheer: (ms?: number) => void
  think: (value: boolean) => void
  listen: (value: boolean) => void
  talk: (value: boolean) => void
  bump: () => void
  no: () => void
  dispose: () => void
}

const vertexShader = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewDirection;
  varying vec3 vObjectPosition;
  varying vec3 vWorldPosition;

  void main() {
    vObjectPosition = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDirection = normalize(-mvPosition.xyz);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uCalm;
  uniform vec3 uTerracotta;
  uniform vec3 uOrange;
  uniform vec3 uDeep;
  uniform vec3 uBone;

  varying vec3 vNormalView;
  varying vec3 vViewDirection;
  varying vec3 vObjectPosition;
  varying vec3 vWorldPosition;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat3 rot = mat3(
      0.00,  0.80,  0.60,
     -0.80,  0.36, -0.48,
     -0.60, -0.48,  0.64
    );
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise3(p);
      p = rot * p * 2.03 + 17.17;
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec3 N = normalize(vNormalView);
    vec3 V = normalize(vViewDirection);
    vec3 local = normalize(vObjectPosition) * 2.65;
    float t = uTime * mix(0.105, 0.22, uEnergy);

    // Warped, layered flow gives the surface a slow liquid-glass current.
    vec3 warp = vec3(
      fbm(local * 1.25 + vec3(t * 0.72, 1.7, -t * 0.32)),
      fbm(local * 1.35 + vec3(4.1, -t * 0.46, t * 0.61)),
      fbm(local * 1.18 + vec3(-t * 0.39, 3.4, t * 0.53))
    );
    vec3 flowPoint = local * 2.25 + (warp - 0.5) * 2.8;
    flowPoint += vec3(t * 0.62, -t * 0.82, t * 0.31);
    float flow = fbm(flowPoint);
    float detail = fbm(flowPoint * 2.15 + warp * 1.8);
    float current = 0.5 + 0.5 * sin((flow * 5.6 + detail * 1.9 + local.y * 0.68) * 6.2831 + t * 1.5);
    float filament = pow(1.0 - abs(current - 0.5) * 2.0, 5.0);
    filament = smoothstep(0.34, 0.94, filament) * (0.22 + uEnergy * 0.38);

    float latitude = 0.5 + 0.5 * sin(local.y * 1.8 + flow * 4.2 - t * 1.2);
    float depth = smoothstep(0.14, 0.9, flow * 0.76 + latitude * 0.24);
    vec3 color = mix(uDeep, uTerracotta, depth);
    color = mix(color, uOrange, filament * 0.72);
    color = mix(color, uTerracotta, smoothstep(0.7, 0.96, detail) * 0.24);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.7);
    vec3 L = normalize(vec3(-0.48, 0.72, 0.9));
    float diffuse = max(dot(N, L), 0.0);
    float specular = pow(max(dot(reflect(-L, N), V), 0.0), 34.0);
    float innerLight = 0.68 + diffuse * 0.27;
    color *= innerLight;
    color += uBone * (specular * 0.12 + fresnel * 0.055);
    color += uOrange * (fresnel * 0.17 + uEnergy * 0.045);

    // A restrained, brighter current blooms only while QuorlythBot is active.
    color += uOrange * filament * (0.18 + uEnergy * 0.18);
    float calmDim = mix(1.0, 0.91, uCalm);
    color *= calmDim;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`

function createGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return null
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,116,23,0.42)')
  gradient.addColorStop(0.38, 'rgba(255,177,93,0.2)')
  gradient.addColorStop(1, 'rgba(155,46,5,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function makeOrbitPoints(count: number) {
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963229728653
    const band = (i % 7) / 6
    const radius = 1.28 + band * 0.42
    const y = Math.sin(angle * 0.37) * (0.18 + band * 0.19)
    const ringRadius = Math.sqrt(Math.max(0.1, radius * radius - y * y))
    positions[i * 3] = Math.cos(angle) * ringRadius
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = Math.sin(angle) * ringRadius
    sizes[i] = 0.55 + ((i * 13) % 11) / 11
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))
  return geometry
}

export function orb3d(canvas: HTMLCanvasElement, options: OrbOptions = {}): OrbApi {
  const width = Math.max(1, canvas.clientWidth || 320)
  const height = Math.max(1, canvas.clientHeight || 220)
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(width, height, false)
  renderer.outputEncoding = sRGBEncoding
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.04
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const camera = new PerspectiveCamera(34, width / height, 0.1, 40)
  camera.position.set(0, 0, 4.35)
  camera.lookAt(0, 0, 0)

  const root = new Group()
  scene.add(root)

  const key = new DirectionalLight(0xffc4a3, 1.25)
  key.position.set(-3.5, 4, 5)
  const rim = new DirectionalLight(0xff7417, 2.25)
  rim.position.set(4, -1, -4)
  const warmFill = new DirectionalLight(0x9b2e05, 0.9)
  warmFill.position.set(0, -4, 4)
  scene.add(new AmbientLight(0xf0ead9, 0.58), key, rim, warmFill)

  const shader = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0.2 },
      uCalm: { value: 0 },
      uTerracotta: { value: new Color(0xff7417) },
      uOrange: { value: new Color(0xffb15d) },
      uDeep: { value: new Color(0x9b2e05) },
      uBone: { value: new Color(0xf0ead9) },
    },
    vertexShader,
    fragmentShader,
    transparent: false,
    depthWrite: true,
  })

  const orbGeometry = new SphereGeometry(1, 144, 112)
  const orb = new Mesh(orbGeometry, shader)
  root.add(orb)

  // Thin clearcoat shell, with no white wash over the underlying terracotta.
  const shell = new Mesh(
    new SphereGeometry(1.012, 112, 88),
    new MeshPhysicalMaterial({
      color: 0xff7417,
      roughness: 0.2,
      metalness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 0.105,
      side: BackSide,
      depthWrite: false,
    }),
  )
  root.add(shell)

  const ringHot = new Mesh(
    new TorusGeometry(1.2, 0.009, 10, 240),
    new MeshBasicMaterial({ color: 0xffb15d, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }),
  )
  ringHot.rotation.set(1.12, 0.12, -0.22)
  root.add(ringHot)

  const ringTerracotta = new Mesh(
    new TorusGeometry(1.31, 0.006, 8, 220),
    new MeshBasicMaterial({ color: 0xff7417, transparent: true, opacity: 0.52, toneMapped: false, depthWrite: false }),
  )
  ringTerracotta.rotation.set(0.52, -0.88, 0.2)
  root.add(ringTerracotta)

  const ringBone = new Mesh(
    new TorusGeometry(1.43, 0.0035, 6, 220),
    new MeshBasicMaterial({ color: 0xf0ead9, transparent: true, opacity: 0.18, toneMapped: false, depthWrite: false }),
  )
  ringBone.rotation.set(-0.36, 0.7, 1.08)
  root.add(ringBone)

  const particleGeometry = makeOrbitPoints(420)
  const particles = new Points(
    particleGeometry,
    new PointsMaterial({
      color: 0xf0ead9,
      size: 0.014,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    }),
  )
  root.add(particles)

  const glowTexture = createGlowTexture()
  const aura = glowTexture
    ? new Sprite(new SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }))
    : null
  if (aura) {
    aura.scale.set(3.9, 3.9, 1)
    aura.position.set(0, 0, -1.25)
    scene.add(aura)
  }

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let alive = true
  let active = true
  let raf = 0
  let start = performance.now()
  let last = start
  let lastRender = 0
  let mode: 'idle' | 'listening' | 'thinking' | 'speaking' | 'excited' = 'idle'
  let energy = 0.2
  let targetEnergy = 0.2
  let audioLevel = 0
  let calm = false
  let turning = false
  let spinStart = -1
  let bump = 0
  let shake = 0
  let rotationY = 0
  let pointerX = 0
  let pointerY = 0
  let dragPointer: number | null = null
  let lastPointerX = 0
  let lastPointerY = 0
  const timers: number[] = []
  const canvasResize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null

  function resize() {
    if (!alive) return
    const w = Math.max(1, canvas.clientWidth || width)
    const h = Math.max(1, canvas.clientHeight || height)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.position.z = w / h < 0.8 ? 4.35 / Math.max(0.65, w / h) : 4.35
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }

  function schedule() {
    if (alive && active && document.visibilityState !== 'hidden' && !raf) raf = requestAnimationFrame(frame)
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden' || !active) {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    } else {
      last = performance.now()
      lastRender = 0
      schedule()
    }
  }

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    if (rect.width && rect.height) {
      pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1
    }
    if (dragPointer !== null && event.pointerId === dragPointer) {
      rotationY += (event.clientX - lastPointerX) * 0.009
      root.rotation.x += (event.clientY - lastPointerY) * 0.004
      lastPointerX = event.clientX
      lastPointerY = event.clientY
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (!options.drag || event.button !== 0) return
    dragPointer = event.pointerId
    lastPointerX = event.clientX
    lastPointerY = event.clientY
    try { canvas.setPointerCapture(event.pointerId) } catch { /* Capture is optional on embedded canvases. */ }
  }

  function onPointerUp(event: PointerEvent) {
    if (dragPointer !== event.pointerId) return
    dragPointer = null
  }

  function onPointerLeave() {
    pointerX *= 0.4
    pointerY *= 0.4
    dragPointer = null
  }

  function frame(now: number) {
    raf = 0
    if (!alive || !active || document.visibilityState === 'hidden') return
    if (!reducedMotion && now - lastRender < 1000 / 60) {
      schedule()
      return
    }
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    lastRender = now
    const t = (now - start) / 1000

    if (reducedMotion) {
      targetEnergy = mode === 'speaking' ? 0.42 : mode === 'thinking' ? 0.34 : mode === 'listening' ? 0.28 : mode === 'excited' ? 0.48 : 0.17
    } else {
      if (mode === 'idle') targetEnergy = 0.17 + Math.sin(t * 0.72) * 0.035
      if (mode === 'listening') targetEnergy = 0.34 + Math.sin(t * 1.8) * 0.055 + audioLevel * 0.2
      if (mode === 'thinking') targetEnergy = 0.48 + Math.sin(t * 2.3) * 0.065
      if (mode === 'speaking') targetEnergy = 0.48 + Math.abs(Math.sin(t * 5.5) * Math.sin(t * 2.4 + 0.6)) * 0.38 + audioLevel * 0.16
      if (mode === 'excited') targetEnergy = 0.68 + Math.sin(t * 3.3) * 0.12
    }

    const response = 1 - Math.exp(-dt * 4.8)
    energy += (targetEnergy - energy) * response
    bump *= 0.9
    shake *= 0.9
    rotationY += (turning ? dt * 0.25 : -rotationY * response * 0.13)
    if (spinStart >= 0) {
      const elapsed = (now - spinStart) / 1350
      if (elapsed >= 1) spinStart = -1
      else rotationY += (1 - Math.pow(1 - elapsed, 3)) * Math.PI * 2 * dt * 1.8
    }

    const breathe = reducedMotion ? 1 : 1 + Math.sin(t * 1.15) * 0.012 + energy * 0.018 + bump * 0.12
    root.scale.setScalar(breathe)
    root.rotation.y += (rotationY - root.rotation.y) * Math.min(1, response * 1.7)
    root.rotation.x += ((pointerY * -0.1 + Math.sin(t * 0.32) * 0.018 + shake * 0.08) - root.rotation.x) * response
    root.rotation.z += ((pointerX * 0.055 + Math.sin(t * 0.22) * 0.012) - root.rotation.z) * response

    shader.uniforms.uTime.value = reducedMotion ? 0 : t
    shader.uniforms.uEnergy.value = energy
    shader.uniforms.uCalm.value = calm ? 1 : 0
    if (!reducedMotion) {
      ringHot.rotation.z += dt * (mode === 'speaking' ? 0.58 : 0.22)
      ringHot.rotation.x += dt * 0.035
      ringTerracotta.rotation.y -= dt * 0.16
      ringTerracotta.rotation.z += dt * 0.06
      ringBone.rotation.x += dt * 0.045
      ringBone.rotation.y -= dt * 0.025
      particles.rotation.y -= dt * 0.045
      particles.rotation.x += dt * 0.018
    }
    particles.scale.setScalar(1 + energy * 0.035)
    if (aura) {
      aura.material.opacity = reducedMotion ? 0.48 : 0.42 + energy * 0.3 + Math.sin(t * 1.3) * 0.035
      aura.scale.setScalar(reducedMotion ? 3.9 : 3.75 + energy * 0.55)
    }

    renderer.render(scene, camera)
    schedule()
  }

  function setMode(next: typeof mode) {
    mode = next
    schedule()
  }

  function after(ms: number, callback: () => void) {
    const timer = window.setTimeout(callback, ms)
    timers.push(timer)
  }

  function setTheme(name: string) {
    const theme = THEMES[name as keyof typeof THEMES] || THEMES.terracotta
    shader.uniforms.uTerracotta.value.setHex(theme.p)
    shader.uniforms.uOrange.value.setHex(theme.g)
    shader.uniforms.uDeep.value.setHex(Number.parseInt(theme.g2.slice(1), 16))
    shader.uniforms.uBone.value.setHex(theme.c)
    ;(shell.material as MeshPhysicalMaterial).color.setHex(theme.p)
    ;(ringHot.material as MeshBasicMaterial).color.setHex(theme.g)
    ;(ringTerracotta.material as MeshBasicMaterial).color.setHex(theme.p)
    ;(particles.material as PointsMaterial).color.setHex(theme.c)
  }

  const api: OrbApi = {
    theme: setTheme,
    active(value) {
      active = !!value
      if (active) { last = performance.now(); lastRender = 0; schedule() }
      else if (raf) { cancelAnimationFrame(raf); raf = 0 }
    },
    spin() { spinStart = performance.now(); schedule() },
    turn(value) { turning = !!value; schedule() },
    lvl(value) { audioLevel = Math.max(0, Math.min(1, Number(value) || 0)) },
    calm(value) { calm = !!value },
    set(name) {
      if (/think/i.test(name)) setMode('thinking')
      else if (/hold|listen/i.test(name)) setMode('listening')
      else if (/wave|cheer|welcome|open/i.test(name)) setMode('excited')
      else if (/talk|speak/i.test(name)) setMode('speaking')
      else setMode('idle')
    },
    wave(ms = 2400) {
      setMode('excited')
      after(ms, () => { if (mode === 'excited') setMode('idle') })
    },
    welcome() {
      setMode('excited')
      after(2800, () => { if (mode === 'excited') setMode('thinking') })
      after(4400, () => { if (mode === 'thinking') setMode('idle') })
    },
    cheer(ms = 2300) {
      setMode('excited')
      after(ms, () => { if (mode === 'excited') setMode('idle') })
    },
    think(value) { setMode(value ? 'thinking' : 'idle') },
    listen(value) { setMode(value ? 'listening' : 'idle') },
    talk(value) { setMode(value ? 'speaking' : 'idle') },
    bump() { bump = 1; schedule() },
    no() { shake = 1; schedule() },
    dispose() {
      if (!alive) return
      alive = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      timers.forEach(clearTimeout)
      canvasResize?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      orbGeometry.dispose()
      shader.dispose()
      shell.geometry.dispose()
      ;(shell.material as MeshPhysicalMaterial).dispose()
      ringHot.geometry.dispose(); (ringHot.material as MeshBasicMaterial).dispose()
      ringTerracotta.geometry.dispose(); (ringTerracotta.material as MeshBasicMaterial).dispose()
      ringBone.geometry.dispose(); (ringBone.material as MeshBasicMaterial).dispose()
      particleGeometry.dispose(); (particles.material as PointsMaterial).dispose()
      if (aura) { aura.material.map?.dispose(); aura.material.dispose() }
      renderer.dispose()
    },
  }

  canvasResize?.observe(canvas)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)
  setTheme(options.theme || 'terracotta')
  resize()
  schedule()
  return api
}
