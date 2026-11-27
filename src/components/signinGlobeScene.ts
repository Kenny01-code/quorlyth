import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  sRGBEncoding,
} from 'three'

type GeoPoint = [number, number]

const AFRICA: GeoPoint[] = [
  [-17, 15], [-17, 25], [-8, 34], [2, 37], [14, 36], [24, 33],
  [33, 31], [42, 13], [51, 11], [48, 1], [43, -12], [39, -22],
  [31, -34], [21, -35], [16, -29], [13, -18], [9, -6], [2, 5],
  [-7, 5], [-15, 10],
]

const LAND: { points: GeoPoint[]; fill: string }[] = [
  { fill: '#69717a', points: [[-168, 70], [-145, 71], [-130, 58], [-124, 48], [-128, 39], [-117, 31], [-108, 23], [-96, 18], [-83, 9], [-78, 25], [-66, 45], [-80, 55], [-105, 70], [-132, 74]] },
  { fill: '#69717a', points: [[-52, 82], [-36, 77], [-22, 66], [-40, 58], [-55, 63]] },
  { fill: '#69717a', points: [[-81, 12], [-70, 10], [-62, 6], [-53, -1], [-47, -13], [-53, -25], [-60, -38], [-68, -55], [-75, -45], [-78, -20]] },
  { fill: '#69717a', points: [[-10, 36], [-8, 45], [-4, 51], [4, 57], [14, 61], [18, 70], [31, 70], [42, 58], [35, 47], [29, 37], [16, 35], [4, 36]] },
  { fill: '#69717a', points: [[30, 35], [37, 43], [48, 48], [58, 55], [73, 58], [84, 62], [100, 58], [114, 54], [127, 49], [142, 48], [158, 56], [170, 63], [160, 70], [135, 72], [111, 76], [91, 72], [70, 73], [58, 66], [45, 61], [35, 51]] },
  { fill: '#69717a', points: [[112, -11], [130, -12], [146, -17], [153, -28], [143, -39], [124, -43], [114, -31]] },
  { fill: '#69717a', points: [[47, -13], [50, -17], [49, -25], [45, -22]] },
]

function projectPoint(point: GeoPoint, width: number, height: number): [number, number] {
  return [
    ((point[0] + 180) / 360) * width,
    ((90 - point[1]) / 180) * height,
  ]
}

function drawPolygon(
  context: CanvasRenderingContext2D,
  points: GeoPoint[],
  width: number,
  height: number,
  fill: string,
  stroke: string,
) {
  if (!points.length) return
  context.beginPath()
  points.forEach((point, index) => {
    const [x, y] = projectPoint(point, width, height)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.closePath()
  context.fillStyle = fill
  context.fill()
  context.strokeStyle = stroke
  context.lineWidth = 1.3
  context.stroke()
}

function createRegionalTexture(): CanvasTexture {
  const width = 1024
  const height = 512
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas texture is unavailable')

  const ocean = context.createLinearGradient(0, 0, width, height)
  ocean.addColorStop(0, '#dce1e2')
  ocean.addColorStop(0.48, '#cbd4d7')
  ocean.addColorStop(1, '#e7e4de')
  context.fillStyle = ocean
  context.fillRect(0, 0, width, height)

  // Fine cartographic graticule: enough detail to read as a world, never as a street map.
  context.strokeStyle = 'rgba(255,255,255,.42)'
  context.lineWidth = 1
  for (let longitude = -180; longitude <= 180; longitude += 20) {
    const x = ((longitude + 180) / 360) * width
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }
  for (let latitude = -80; latitude <= 80; latitude += 20) {
    const y = ((90 - latitude) / 180) * height
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }

  LAND.forEach(region => drawPolygon(context, region.points, width, height, region.fill, 'rgba(255,255,255,.5)'))

  const africaFill = context.createLinearGradient(390, 145, 530, 410)
  africaFill.addColorStop(0, '#d8784f')
  africaFill.addColorStop(.52, '#b65332')
  africaFill.addColorStop(1, '#8e3c27')
  drawPolygon(context, AFRICA, width, height, africaFill, '#f2b08b')

  // Restrained internal borders help the highlighted continent read as a region.
  context.strokeStyle = 'rgba(255,225,207,.5)'
  context.lineWidth = 1
  const borderLines: GeoPoint[][] = [
    [[-8, 20], [3, 20], [13, 19], [25, 19], [34, 17]],
    [[-10, 10], [1, 8], [12, 7], [24, 8], [36, 5]],
    [[5, 30], [8, 18], [9, 7], [12, -3], [17, -14]],
    [[25, 31], [24, 19], [26, 7], [28, -4], [29, -17]],
    [[-1, 5], [-2, -7], [1, -15]],
  ]
  borderLines.forEach(line => {
    context.beginPath()
    line.forEach((point, index) => {
      const [x, y] = projectPoint(point, width, height)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  })

  // A soft highlight around West Africa, not a precise live-location beacon.
  const [signalX, signalY] = projectPoint([8, 9], width, height)
  const halo = context.createRadialGradient(signalX, signalY, 1, signalX, signalY, 30)
  halo.addColorStop(0, 'rgba(255,239,216,.95)')
  halo.addColorStop(.16, 'rgba(255,181,135,.78)')
  halo.addColorStop(1, 'rgba(225,112,72,0)')
  context.fillStyle = halo
  context.beginPath()
  context.arc(signalX, signalY, 30, 0, Math.PI * 2)
  context.fill()

  const texture = new CanvasTexture(canvas)
  texture.encoding = sRGBEncoding
  texture.anisotropy = 4
  return texture
}

function createGlobeGeometry(radius: number): BufferGeometry {
  const widthSegments = 96
  const heightSegments = 64
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let y = 0; y <= heightSegments; y += 1) {
    const v = y / heightSegments
    const latitude = Math.PI / 2 - v * Math.PI
    const cosLatitude = Math.cos(latitude)
    const sinLatitude = Math.sin(latitude)

    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments
      const longitude = (u - .5) * Math.PI * 2
      positions.push(
        radius * cosLatitude * Math.sin(longitude),
        radius * sinLatitude,
        radius * cosLatitude * Math.cos(longitude),
      )
      uvs.push(u, 1 - v)
    }
  }

  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = y * (widthSegments + 1) + x
      const b = a + widthSegments + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function surfacePoint(radius: number, latitude: number, longitude: number): Vector3 {
  const lat = latitude * Math.PI / 180
  const lon = longitude * Math.PI / 180
  return new Vector3(
    radius * Math.cos(lat) * Math.sin(lon),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.cos(lon),
  )
}

/**
 * Small, continuously rotating regional globe for the sign-in card.
 * Its highlighted signal is regional (Nigeria / West Africa), never GPS-derived.
 */
export function mountSignInGlobe(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.35))
  renderer.outputEncoding = sRGBEncoding
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const camera = new PerspectiveCamera(33, 1.52, .1, 20)
  camera.position.set(0, 0, 2.25)
  camera.lookAt(0, 0, 0)

  scene.add(new AmbientLight(0xfff7ee, 1.3))

  const keyLight = new DirectionalLight(0xffffff, 2.1)
  keyLight.position.set(-2.5, 3, 4)
  scene.add(keyLight)

  const copperRim = new DirectionalLight(0xf18b61, 2.4)
  copperRim.position.set(2.7, -.35, -2)
  scene.add(copperRim)

  const fillLight = new PointLight(0xffc39e, .8, 4)
  fillLight.position.set(-.3, -1.2, 1.4)
  scene.add(fillLight)

  const system = new Group()
  system.rotation.y = -20 * Math.PI / 180
  system.rotation.x = -.08
  scene.add(system)

  const mapTexture = createRegionalTexture()
  const globe = new Mesh(
    createGlobeGeometry(.64),
    new MeshPhysicalMaterial({
      color: 0xffffff,
      map: mapTexture,
      roughness: .4,
      metalness: .18,
      clearcoat: .72,
      clearcoatRoughness: .22,
    }),
  )
  system.add(globe)

  const atmosphere = new Mesh(
    new SphereGeometry(.668, 48, 36),
    new MeshBasicMaterial({
      color: 0xd37a55,
      transparent: true,
      opacity: .105,
      side: BackSide,
      depthWrite: false,
    }),
  )
  system.add(atmosphere)

  // Fine engineered orbit and satellite node give the globe a premium game-world feel.
  const orbit = new Mesh(
    new TorusGeometry(.79, .009, 8, 128),
    new MeshPhysicalMaterial({
      color: 0xb95b39,
      metalness: .88,
      roughness: .22,
      clearcoat: 1,
    }),
  )
  orbit.rotation.set(.96, .28, -.18)
  system.add(orbit)

  const orbitTrace = new Mesh(
    new TorusGeometry(.84, .003, 6, 128),
    new MeshBasicMaterial({ color: 0xe1a082, transparent: true, opacity: .58 }),
  )
  orbitTrace.rotation.set(.96, .28, -.18)
  system.add(orbitTrace)

  const nigeriaPoint = surfacePoint(.651, 9, 8)
  const nigeriaNormal = nigeriaPoint.clone().normalize()
  const signal = new Group()
  signal.position.copy(nigeriaPoint)
  signal.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), nigeriaNormal)

  const signalCore = new Mesh(
    new SphereGeometry(.021, 18, 14),
    new MeshPhysicalMaterial({
      color: 0xffc6a3,
      emissive: new Color(0xed754d),
      emissiveIntensity: 1.1,
      roughness: .2,
      metalness: .2,
    }),
  )
  signal.add(signalCore)

  const signalPulse = new Mesh(
    new TorusGeometry(.038, .003, 6, 36),
    new MeshBasicMaterial({ color: 0xf18b62, transparent: true, opacity: .9 }),
  )
  signal.add(signalPulse)
  system.add(signal)

  const satelliteOrbit = new Group()
  satelliteOrbit.rotation.set(1.12, -.36, .2)
  const satellite = new Mesh(
    new SphereGeometry(.025, 16, 12),
    new MeshPhysicalMaterial({
      color: 0xffc19d,
      emissive: new Color(0xc85d3d),
      emissiveIntensity: .7,
      metalness: .55,
      roughness: .24,
    }),
  )
  satellite.position.set(.8, 0, 0)
  satelliteOrbit.add(satellite)
  system.add(satelliteOrbit)

  let alive = true
  let active = true
  let raf = 0
  let lastRender = 0
  const targetFps = lowPower ? 24 : 36

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(resize)
    : null

  function resize() {
    if (!alive) return
    const width = Math.max(1, host.clientWidth || 76)
    const height = Math.max(1, host.clientHeight || 50)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.position.z = height > width ? 2.55 : 2.25
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
      const seconds = now * .001
      system.rotation.y = -20 * Math.PI / 180 + seconds * .105
      system.rotation.x = -.08 + Math.sin(seconds * .34) * .025
      orbit.rotation.z = -.18 + Math.sin(seconds * .24) * .045
      satelliteOrbit.rotation.y = seconds * .36
      const pulse = 1 + (Math.sin(seconds * 2.2) + 1) * .16
      signalPulse.scale.setScalar(pulse)
      ;(signalPulse.material as MeshBasicMaterial).opacity = .72 - (pulse - 1) * .75
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
    mapTexture.dispose()
    renderer.dispose()
  }
}
