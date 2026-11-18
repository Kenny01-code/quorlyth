// QuorlythBot's Three.js voice orb. Kept behind the shared RobotApi so the
// chat, voice and accessibility controls do not need to know about the renderer.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
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
  uniform vec3 uPearl;
  uniform vec3 uIce;
  uniform vec3 uCobalt;
  uniform vec3 uWhite;

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
    float n000 = hash31(i);
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 0.0));
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
    vec3 spherePoint = normalize(vObjectPosition);
    vec3 local = spherePoint * 2.65;
    float t = uTime * mix(0.085, 0.205, uEnergy);

    // Preserve the procedural orb while deepening its slow volumetric liquid current.
    vec3 warp = vec3(
      fbm(local * 1.22 + vec3(t * 0.66, 1.7, -t * 0.29)),
      fbm(local * 1.34 + vec3(4.1, -t * 0.43, t * 0.56)),
      fbm(local * 1.16 + vec3(-t * 0.36, 3.4, t * 0.49))
    );
    vec3 flowPoint = local * 2.18 + (warp - 0.5) * 2.65;
    flowPoint += vec3(t * 0.58, -t * 0.76, t * 0.28);
    float flow = fbm(flowPoint);
    float detail = fbm(flowPoint * 2.08 + warp * 1.7);
    float current = 0.5 + 0.5 * sin((flow * 5.2 + detail * 1.8 + local.y * 0.62) * 6.2831 + t * 1.35);
    float filament = pow(1.0 - abs(current - 0.5) * 2.0, 5.0);
    filament = smoothstep(0.42, 0.96, filament) * (0.12 + uEnergy * 0.28);

    // Cobalt occupies the upper hemisphere; pearl-white clouding rolls through the lower half.
    float boundary = spherePoint.y + (flow - 0.5) * 0.34 + (detail - 0.5) * 0.16;
    float blueMask = smoothstep(-0.24, 0.37, boundary);
    vec3 cobalt = mix(uCobalt, uIce, smoothstep(0.16, 0.86, flow * 0.66 + detail * 0.34));
    vec3 pearl = mix(uPearl, uWhite, smoothstep(0.28, 0.82, detail) * 0.26);
    vec3 color = mix(pearl, cobalt, blueMask);
    float cloud = smoothstep(0.43, 0.82, fbm(flowPoint * 0.72 + warp * 1.35));
    float lowerCloud = (1.0 - blueMask) * cloud * 0.22;
    color = mix(color, uWhite, lowerCloud);
    color = mix(color, uIce, filament * (0.08 + blueMask * 0.18));

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.55);
    vec3 L = normalize(vec3(-0.46, 0.74, 0.88));
    float diffuse = max(dot(N, L), 0.0);
    float specular = pow(max(dot(reflect(-L, N), V), 0.0), 48.0);
    float broadSpecular = pow(max(dot(reflect(-L, N), V), 0.0), 10.0);
    float innerLight = 0.78 + diffuse * 0.23;
    color *= innerLight;
    color += uWhite * (specular * 0.28 + broadSpecular * 0.035 + fresnel * 0.085);
    color += uIce * (fresnel * 0.075 + filament * (0.08 + uEnergy * 0.14));
    color *= mix(1.0, 0.94, uCalm);
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
  const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(132,174,255,0.34)')
  gradient.addColorStop(0.42, 'rgba(206,222,255,0.15)')
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.045)')
  gradient.addColorStop(1, 'rgba(35,78,172,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export function orb3d(canvas: HTMLCanvasElement, options: OrbOptions = {}): OrbApi {
  const width = Math.max(1, canvas.clientWidth || 320)
  const height = Math.max(1, canvas.clientHeight || 220)
  const lowPowerDevice = window.matchMedia('(max-width: 760px)').matches
    || Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4
  const renderer = new WebGLRenderer({
    canvas,
    antialias: !lowPowerDevice,
    alpha: true,
    powerPreference: lowPowerDevice ? 'low-power' : 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPowerDevice ? 1 : 1.35))
  renderer.setSize(width, height, false)
  renderer.outputEncoding = sRGBEncoding
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.04
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const camera = new PerspectiveCamera(32, width / height, 0.1, 40)
  camera.position.set(0, 0, 4.15)
  camera.lookAt(0, 0, 0)

  const root = new Group()
  scene.add(root)

  const key = new DirectionalLight(0xffffff, 1.55)
  key.position.set(-3.5, 4.2, 5)
  const rim = new DirectionalLight(0x85adff, 2.35)
  rim.position.set(4, -1.2, -4)
  const pearlFill = new DirectionalLight(0xdce8ff, 1.05)
  pearlFill.position.set(0, -4, 4)
  scene.add(new AmbientLight(0xeaf0ff, 0.78), key, rim, pearlFill)

  const shader = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0.2 },
      uCalm: { value: 0 },
      uPearl: { value: new Color(0xeaf0ff) },
      uIce: { value: new Color(0x91b7ff) },
      uCobalt: { value: new Color(0x285bd8) },
      uWhite: { value: new Color(0xffffff) },
    },
    vertexShader,
    fragmentShader,
    transparent: false,
    depthWrite: true,
  })

  const orbGeometry = new SphereGeometry(1, 144, 112)
  const orb = new Mesh(orbGeometry, shader)
  root.add(orb)

  // A clear optical surface gives the same sphere a deeper polished-glass finish.
  const shell = new Mesh(
    new SphereGeometry(1.014, 144, 112),
    new MeshPhysicalMaterial({
      color: 0xeaf0ff,
      roughness: 0.085,
      metalness: 0.035,
      clearcoat: 1,
      clearcoatRoughness: 0.055,
      reflectivity: 0.82,
      transparent: true,
      opacity: 0.12,
      side: BackSide,
      depthWrite: false,
    }),
  )
  root.add(shell)

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
    aura.scale.set(3.15, 3.15, 1)
    aura.position.set(0, 0, -0.95)
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
    camera.position.z = w / h < 0.8 ? 4.15 / Math.max(0.65, w / h) : 4.15
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
    if (!reducedMotion && now - lastRender < (lowPowerDevice ? 1000 / 30 : 1000 / 60)) {
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
      if (mode === 'idle') targetEnergy = 0.19 + Math.sin(t * 0.72) * 0.035
      if (mode === 'listening') targetEnergy = 0.32 + Math.sin(t * 1.8) * 0.055 + audioLevel * 0.3
      if (mode === 'thinking') targetEnergy = 0.39 + Math.sin(t * 2.3) * 0.065
      if (mode === 'speaking') targetEnergy = 0.44 + Math.abs(Math.sin(t * 5.5) * Math.sin(t * 2.4 + 0.6)) * 0.42 + audioLevel * 0.2
      if (mode === 'excited') targetEnergy = 0.7 + Math.sin(t * 3.3) * 0.12
    }

    const response = 1 - Math.exp(-dt * 7.2)
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
    if (aura) {
      aura.material.opacity = reducedMotion ? 0.3 : 0.24 + energy * 0.14 + Math.sin(t * 1.1) * 0.018
      aura.scale.setScalar(reducedMotion ? 3.1 : 3.0 + energy * 0.25)
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
    const theme = THEMES[name as keyof typeof THEMES] || THEMES.pearl
    shader.uniforms.uPearl.value.setHex(theme.p)
    shader.uniforms.uIce.value.setHex(theme.g)
    shader.uniforms.uCobalt.value.setHex(Number.parseInt(theme.g2.slice(1), 16))
    shader.uniforms.uWhite.value.setHex(theme.c)
    ;(shell.material as MeshPhysicalMaterial).color.setHex(theme.p)
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
  setTheme(options.theme || 'pearl')
  resize()
  schedule()
  return api
}
