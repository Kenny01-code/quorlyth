import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
  sRGBEncoding,
} from 'three'

/** Miniature mechanical chronograph driven by the device's actual local time. */
export function mountSignInClock(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  const lowPower = window.matchMedia('(max-width: 760px)').matches
    || Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new WebGLRenderer({
    canvas, alpha: true, antialias: !lowPower,
    powerPreference: lowPower ? 'low-power' : 'high-performance',
    stencil: false, depth: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.45))
  renderer.outputEncoding = sRGBEncoding
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const camera = new PerspectiveCamera(32, 1, 0.1, 10)
  camera.position.set(0, 0, 3.1)
  camera.lookAt(0, 0, 0)
  scene.add(new AmbientLight(0xfff7ef, 1.55))
  const keyLight = new DirectionalLight(0xffffff, 2.15)
  keyLight.position.set(-2.2, 2.8, 3.4)
  scene.add(keyLight)
  const copperLight = new DirectionalLight(0xe27b52, 1.65)
  copperLight.position.set(2.5, -1.2, -2.2)
  scene.add(copperLight)
  const glow = new PointLight(0xef9a70, 0.65, 4)
  glow.position.set(0.1, -0.45, 1.7)
  scene.add(glow)

  const dial = new Group()
  scene.add(dial)
  const face = new Mesh(new CircleGeometry(0.82, 96), new MeshPhysicalMaterial({
    color: new Color(0xf5eee5), roughness: 0.35, metalness: 0.12,
    clearcoat: 0.9, clearcoatRoughness: 0.18,
  }))
  face.position.z = -0.012
  dial.add(face)
  const bezel = new Mesh(new TorusGeometry(0.87, 0.055, 14, 100), new MeshPhysicalMaterial({
    color: new Color(0xb65a39), metalness: 0.9, roughness: 0.2,
    clearcoat: 1, clearcoatRoughness: 0.1,
  }))
  bezel.position.z = 0.02
  dial.add(bezel)
  const track = new Mesh(new TorusGeometry(0.73, 0.006, 6, 100), new MeshPhysicalMaterial({
    color: 0xcf8867, metalness: 0.82, roughness: 0.26,
  }))
  track.position.z = 0.024
  dial.add(track)

  const markerMaterial = new MeshPhysicalMaterial({ color: 0x79513d, metalness: 0.55, roughness: 0.32 })
  const accentMaterial = new MeshPhysicalMaterial({ color: 0xc06442, metalness: 0.78, roughness: 0.2 })
  for (let index = 0; index < 60; index += 1) {
    const major = index % 5 === 0
    const angle = (Math.PI * 2 * index) / 60
    const marker = new Mesh(new BoxGeometry(major ? 0.027 : 0.012, major ? 0.105 : 0.045, 0.012), major ? accentMaterial : markerMaterial)
    marker.position.set(Math.sin(angle) * 0.665, Math.cos(angle) * 0.665, 0.038)
    marker.rotation.z = -angle
    dial.add(marker)
  }

  function makeHand(width: number, length: number, material: MeshPhysicalMaterial, z: number, tail = 0) {
    const hand = new Group()
    hand.position.z = z
    const body = new Mesh(new BoxGeometry(width, length, 0.014), material)
    body.position.y = (length - tail) * 0.5
    hand.add(body)
    if (tail > 0) {
      const counterweight = new Mesh(new SphereGeometry(width * 1.35, 12, 10), material)
      counterweight.position.y = -tail * 0.48
      counterweight.position.z = 0.006
      hand.add(counterweight)
    }
    dial.add(hand)
    return hand
  }
  const hourHand = makeHand(0.055, 0.43, markerMaterial, 0.066, 0.085)
  const minuteHand = makeHand(0.038, 0.6, markerMaterial, 0.081, 0.075)
  const secondHand = makeHand(0.014, 0.72, accentMaterial, 0.095, 0.13)
  const pivot = new Mesh(new SphereGeometry(0.047, 20, 16), new MeshPhysicalMaterial({
    color: 0xa94d30, metalness: 0.86, roughness: 0.18, clearcoat: 1,
  }))
  pivot.position.z = 0.12
  dial.add(pivot)

  const aura = new Mesh(new TorusGeometry(1.02, 0.006, 6, 120), new MeshPhysicalMaterial({
    color: 0xe0a084, metalness: 0.82, roughness: 0.26, transparent: true, opacity: 0.62,
  }))
  aura.rotation.set(0.52, 0.18, -0.24)
  dial.add(aura)
  const satelliteTrack = new Group()
  satelliteTrack.rotation.set(0.7, 0.24, -0.16)
  const satellite = new Mesh(new SphereGeometry(0.035, 16, 12), new MeshPhysicalMaterial({
    color: 0xf0a17c, metalness: 0.82, roughness: 0.18,
    emissive: new Color(0x9b3f25), emissiveIntensity: 0.2,
  }))
  satellite.position.set(1.01, 0, 0.02)
  satelliteTrack.add(satellite)
  dial.add(satelliteTrack)

  let alive = true
  let active = true
  let raf = 0
  let lastRender = 0
  const targetFps = lowPower ? 24 : 36
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null

  function updateHands(now: Date) {
    const hours = now.getHours() % 12
    const minutes = now.getMinutes()
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000
    hourHand.rotation.z = -((hours + minutes / 60 + seconds / 3600) * Math.PI / 6)
    minuteHand.rotation.z = -((minutes + seconds / 60) * Math.PI / 30)
    secondHand.rotation.z = -(seconds * Math.PI / 30)
  }
  function resize() {
    if (!alive) return
    const width = Math.max(1, host.clientWidth || 174)
    const height = Math.max(1, host.clientHeight || 62)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.position.z = height > width ? 3.35 : 3.1
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
    updateHands(new Date())
    if (!reducedMotion) {
      const seconds = now * 0.001
      aura.rotation.z = -0.24 + Math.sin(seconds * 0.24) * 0.075
      satelliteTrack.rotation.z = seconds * 0.32
      aura.scale.setScalar(1 + (Math.sin(seconds * 1.7) + 1) * 0.012)
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
  let intersectionObserver: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(entries => {
      active = entries.some(entry => entry.isIntersecting)
      if (active) {
        lastRender = 0
        schedule()
      } else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }, { rootMargin: '80px' })
    intersectionObserver.observe(host)
  }
  resizeObserver?.observe(host)
  document.addEventListener('visibilitychange', onVisibility)
  resize()
  updateHands(new Date())
  renderer.render(scene, camera)
  schedule()
  return () => {
    alive = false
    active = false
    if (raf) cancelAnimationFrame(raf)
    resizeObserver?.disconnect()
    intersectionObserver?.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    scene.traverse(object => {
      const mesh = object as Mesh
      if (mesh.geometry?.dispose) mesh.geometry.dispose()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach(item => item.dispose())
      else if (material) material.dispose()
    })
    renderer.dispose()
  }
}
