import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  WebGLRenderer,
  sRGBEncoding,
} from 'three'

/** High-end burnt-copper sculpture for the Quorlyth landing cover. */
export function mountCreatorCoverScene(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  const lowPower = window.matchMedia('(max-width: 760px)').matches
    || Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !lowPower,
    powerPreference: lowPower ? 'low-power' : 'high-performance',
    stencil: false,
    depth: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 0.9 : 1.25))
  renderer.outputEncoding = sRGBEncoding
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.16
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const camera = new PerspectiveCamera(34, 1, 0.1, 40)
  camera.position.set(0, 0, 5.5)
  camera.lookAt(0, 0, 0)

  scene.add(new AmbientLight(0xffe4d2, 0.66))

  const key = new DirectionalLight(0xffe1c8, 3.0)
  key.position.set(-3.8, 4.2, 5)
  scene.add(key)

  const copperRim = new DirectionalLight(0xff7446, 3.4)
  copperRim.position.set(4.4, 0.8, -3.8)
  scene.add(copperRim)

  const softFill = new PointLight(0xffb18a, 1.45, 12)
  softFill.position.set(1.8, -2.2, 3.2)
  scene.add(softFill)

  const sculpture = new Group()
  sculpture.rotation.set(-0.2, 0.42, -0.08)
  scene.add(sculpture)

  const copper = new MeshPhysicalMaterial({
    color: new Color(0x9e4327),
    metalness: 0.82,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    reflectivity: 0.9,
  })
  const brightCopper = new MeshPhysicalMaterial({
    color: new Color(0xd16a3e),
    metalness: 0.9,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.09,
  })
  const obsidian = new MeshPhysicalMaterial({
    color: new Color(0x21130f),
    metalness: 0.58,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: new Color(0x481d12),
    emissiveIntensity: 0.16,
  })

  const knot = new Mesh(new TorusKnotGeometry(1.04, 0.205, 192, 24, 2, 3), copper)
  knot.rotation.set(0.28, -0.24, 0.18)
  sculpture.add(knot)

  const innerCore = new Mesh(new SphereGeometry(0.57, 64, 48), obsidian)
  innerCore.position.set(0, -0.02, 0.05)
  sculpture.add(innerCore)

  const orbit = new Mesh(new TorusGeometry(1.46, 0.022, 12, 180), brightCopper)
  orbit.rotation.set(1.12, 0.32, -0.24)
  orbit.scale.set(1.02, 0.82, 1)
  sculpture.add(orbit)

  const fineRing = new Mesh(
    new TorusGeometry(0.72, 0.012, 8, 140),
    new MeshPhysicalMaterial({
      color: 0xf0a17a,
      metalness: 0.92,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    }),
  )
  fineRing.rotation.set(0.62, -0.58, 0.35)
  sculpture.add(fineRing)

  const dustCount = lowPower ? 42 : 86
  const dustPositions = new Float32Array(dustCount * 3)
  for (let i = 0; i < dustCount; i += 1) {
    const angle = i * 2.399963229728653
    const radius = 1.72 + ((i * 17) % 11) * 0.046
    dustPositions[i * 3] = Math.cos(angle) * radius
    dustPositions[i * 3 + 1] = Math.sin(angle * 0.77) * (0.74 + (i % 5) * 0.09)
    dustPositions[i * 3 + 2] = Math.sin(angle) * radius * 0.34
  }
  const dustGeometry = new BufferGeometry()
  dustGeometry.setAttribute('position', new BufferAttribute(dustPositions, 3))
  const dustMaterial = new PointsMaterial({
    color: 0xf3a27c,
    size: lowPower ? 0.014 : 0.018,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const dust = new Points(dustGeometry, dustMaterial)
  sculpture.add(dust)

  let alive = true
  let active = true
  let raf = 0
  let lastRender = 0
  const targetFps = lowPower ? 24 : 40
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(resize)
    : null

  function resize() {
    if (!alive) return
    const width = Math.max(1, host.clientWidth || 320)
    const height = Math.max(1, host.clientHeight || 300)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.position.z = width / height < 0.88 ? 6.15 : 5.5
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    schedule()
  }

  function schedule() {
    if (!alive || !active || document.visibilityState === 'hidden' || raf) return
    raf = window.requestAnimationFrame(frame)
  }

  function frame(now: number) {
    raf = 0
    if (!alive || !active || document.visibilityState === 'hidden') return
    if (!reducedMotion && now - lastRender < 1000 / targetFps) {
      schedule()
      return
    }
    lastRender = now

    if (!reducedMotion) {
      const t = now * 0.00022
      sculpture.rotation.y = 0.42 + t
      sculpture.rotation.x = -0.2 + Math.sin(t * 1.35) * 0.075
      sculpture.rotation.z = -0.08 + Math.cos(t * 0.8) * 0.035
      knot.rotation.y = -0.24 + Math.sin(t * 0.62) * 0.09
      fineRing.rotation.y = -0.58 - t * 0.34
      dust.rotation.y = t * 0.14
      sculpture.position.y = Math.sin(t * 1.2) * 0.045
    }

    renderer.render(scene, camera)
    if (!reducedMotion) schedule()
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    } else {
      lastRender = 0
      schedule()
    }
  }

  let visibilityObserver: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    visibilityObserver = new IntersectionObserver(entries => {
      active = entries.some(entry => entry.isIntersecting)
      if (active) {
        lastRender = 0
        schedule()
      } else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }, { rootMargin: '100px' })
    visibilityObserver.observe(host)
  }

  resizeObserver?.observe(host)
  document.addEventListener('visibilitychange', onVisibility)
  resize()
  schedule()

  return () => {
    alive = false
    active = false
    if (raf) cancelAnimationFrame(raf)
    resizeObserver?.disconnect()
    visibilityObserver?.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    sculpture.traverse(object => {
      const mesh = object as Mesh
      if (mesh.geometry?.dispose) mesh.geometry.dispose()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach(item => item.dispose())
      else if (material) material.dispose()
    })
    renderer.dispose()
  }
}
