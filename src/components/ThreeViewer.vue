<script setup>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import * as THREE from 'three'
import CameraControls from 'camera-controls'
import RightPanel from './RightPanel.vue'
import { findObjectByUUID, buildNameMap } from '../utils/sceneTree.js'
import { QUALITY_PRESETS } from '../utils/qualityPresets.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { idbGet, idbSet, idbDelete } from '../utils/idbCache.js'

const containerRef = ref(null)
const rightPanelRef = ref(null)

// Loading flags
const isGLBLoading = ref(false)
const isJSONLoading = ref(false)
const isHDRLoading = ref(false)
const isInitializing = ref(false)
const isLoading = computed(() => isGLBLoading.value || isJSONLoading.value || isHDRLoading.value || isInitializing.value)

const selectedKey = ref('')
const optionsList = ref([])
const jsonConfig = ref(null)

let loadedGLTF
let renderer
let scene
let camera
let controls
let clock
const currentModel = ref(null)
let mainDirLight
let extraLights = []
let nameMap = new Map()
const sceneObjectNames = ref([])

// Demand-based rendering
let needsRender = true
function requestRender() { needsRender = true }

// Material variants (colors)
const colorVariants = ref([])
const selectedVariant = ref('')

// Uploaded filenames
const glbName = ref('')
const jsonName = ref('')
const glbCached = ref(false)
const jsonCached = ref(false)
const glbButtonText = computed(() => glbName.value ? `${glbName.value}${glbCached.value ? ' (Cached)' : ''}` : 'Upload GLB')
const jsonButtonText = computed(() => jsonName.value ? `${jsonName.value}${jsonCached.value ? ' (Cached)' : ''}` : 'Upload JSON')
const glbHoverText = computed(() => (glbName.value ? 'Replace' : 'Upload'))
const jsonHoverText = computed(() => (jsonName.value ? 'Replace' : 'Upload'))

// HDR controls
const defaultHdrPath = `${import.meta.env.BASE_URL}HDRI_STUDIO_Combined_5.hdr`
const hdrName = ref('HDRI_STUDIO_Combined_5.hdr')
const hdrCached = ref(false)
const hdrButtonText = computed(() => hdrName.value ? `${hdrName.value}${hdrCached.value ? ' (Cached)' : ''}` : 'Upload HDR')
const hdrHoverText = computed(() => (hdrName.value ? 'Replace' : 'Upload'))

// Outliner state
const selectedNodeId = ref('')

// Quality
const currentQuality = ref('High')

// Sidebar visibility
const showLeftPanel = ref(true)

// Mode
const isJsonMode = ref(false)

// Scene selection (highlight / isolate)
const highlightedIds = ref([])
const showAddVariantModal = ref(false)
const newOptionForm = ref({ name: '', variant: '', optionPackToggle: false })

// Outliner tree sync — increment to force SceneOutliner to rebuild its snapshot
const sceneVersion = ref(0)

function applyQualityPreset(preset) {
  const q = QUALITY_PRESETS[preset]
  if (!q || !renderer) return
  renderer.setPixelRatio(q.pixelRatio())
  renderer.shadowMap.enabled = q.shadowEnabled
  renderer.shadowMap.type = q.shadowType
  if (mainDirLight) {
    mainDirLight.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize)
    mainDirLight.shadow.map?.dispose()
    mainDirLight.shadow.map = null
  }
  requestRender()
}

watch(currentQuality, applyQualityPreset)

function initScene() {
  scene = new THREE.Scene()
  scene.background = null

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50)
  camera.position.set(-3, 1, 4.5)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.6
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x000000, 0)

  containerRef.value.appendChild(renderer.domElement)

  loadHDRFromPath(defaultHdrPath)

  // Lights
  const spotLight = new THREE.SpotLight(0xffffff, 0.9)
  spotLight.position.set(20, -10, 0)
  spotLight.target.position.set(2, 0.5, 0)
  spotLight.target.updateMatrixWorld()
  scene.add(spotLight)

  mainDirLight = new THREE.DirectionalLight(0xffffff, 1)
  mainDirLight.position.set(0, 10, 0)
  mainDirLight.castShadow = true
  mainDirLight.shadow.mapSize.width = 2048
  mainDirLight.shadow.mapSize.height = 2048
  scene.add(mainDirLight)

  const planeGeometry = new THREE.PlaneGeometry(10, 10, 1, 1)
  const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.3 })
  const plane = new THREE.Mesh(planeGeometry, planeMaterial)
  plane.material.side = THREE.DoubleSide
  plane.rotation.x = Math.PI / 2
  plane.position.y = -0.5
  plane.receiveShadow = true
  scene.add(plane)

  // Controls
  CameraControls.install({ THREE })
  controls = new CameraControls(camera, renderer.domElement)
  controls.minDistance = 4
  controls.maxDistance = 8
  controls.minPolarAngle = (45 * Math.PI) / 180
  controls.maxPolarAngle = (89 * Math.PI) / 180
  controls.mouseButtons.middle = CameraControls.ACTION.TRUCK
  controls.mouseButtons.right = CameraControls.ACTION.NONE
  controls.touches.two = CameraControls.ACTION.TOUCH_ZOOM_ROTATE
  controls.touches.three = CameraControls.ACTION.NONE

  clock = new THREE.Clock()
}

function loadHDRFromPath(path) {
  return new Promise((resolve, reject) => {
    new RGBELoader().load(path, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping
      scene.environment = texture
      requestRender()
      resolve()
    }, undefined, (err) => {
      console.warn('HDR load failed', err)
      reject(err)
    })
  })
}

function onResize() {
  if (!containerRef.value || !renderer || !camera) return
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  const q = QUALITY_PRESETS[currentQuality.value]
  renderer.setPixelRatio(q ? q.pixelRatio() : window.devicePixelRatio)
  requestRender()
}

function animate() {
  requestAnimationFrame(animate)
  const delta = clock.getDelta()
  const updated = controls.update(delta)
  if (updated || needsRender) {
    renderer.render(scene, camera)
    needsRender = false
  }
}

async function loadGLBFromFile(file) {
  if (!file) return
  const url = URL.createObjectURL(file)
  try {
    try {
      const buf = await file.arrayBuffer()
      await idbSet('glb', buf)
      await idbSet('glbName', file.name)
    } catch {}
    glbName.value = file.name
    glbCached.value = false
    isGLBLoading.value = true
    if (currentModel.value) {
      scene.remove(currentModel.value)
      currentModel.value.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose?.())
          } else {
            child.material?.dispose?.()
          }
        }
      })
      currentModel.value = null
      nameMap.clear()
      sceneObjectNames.value = []
    }

    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    draco.setDecoderPath(import.meta.env.BASE_URL)
    loader.setDRACOLoader(draco)
    loadedGLTF = await loader.loadAsync(url)
    maybeInitializeModel()
  } finally {
    URL.revokeObjectURL(url)
    isGLBLoading.value = false
  }
}

function onFileSelected(e) {
  const file = e.target.files?.[0]
  loadGLBFromFile(file)
  try { e.target.value = '' } catch {}
}

async function onJsonSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return

  if (rightPanelRef.value?.isJsonEditorDirty?.()) {
    if (!confirm('The JSON editor has unsaved changes. Uploading a new file will overwrite them. Continue?')) {
      try { e.target.value = '' } catch {}
      return
    }
  }

  isJSONLoading.value = true
  const text = await file.text()
  try {
    const parsed = JSON.parse(text)
    jsonConfig.value = parsed
    try { await idbSet('json', text) } catch {}
    try { await idbSet('jsonName', file.name) } catch {}
    jsonName.value = file.name
    jsonCached.value = false
    buildOptionsFromJson(parsed)
    applyAdditionalLights()
    if (currentModel.value) {
      const fallbackKey = optionsList.value[0]?.key || ''
      const keyToApply = selectedKey.value || fallbackKey
      hideAll()
      applySelectionFromKey(keyToApply)
    } else if (loadedGLTF) {
      maybeInitializeModel()
    }
    rightPanelRef.value?.resetEditorWithConfig?.(parsed)
  } catch (err) {
    console.warn('Invalid JSON file', err)
  } finally {
    isJSONLoading.value = false
    try { e.target.value = '' } catch {}
  }
}

async function onHdrSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  isHDRLoading.value = true
  try {
    const buf = await file.arrayBuffer()
    await idbSet('hdr', buf)
    await idbSet('hdrName', file.name)
    hdrName.value = file.name
    hdrCached.value = false
    const url = URL.createObjectURL(new Blob([buf]))
    await loadHDRFromPath(url)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.warn('Invalid HDR file', err)
  } finally {
    isHDRLoading.value = false
    try { e.target.value = '' } catch {}
  }
}

function buildOptionsFromJson(cfg) {
  const map = new Map()
  cfg.options.forEach((o) => {
    const key = `${String(o.conditions.variant)}|${Boolean(o.conditions.optionPackToggle)}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: `${o.conditions.variant} ${o.conditions.optionPackToggle ? '(W/ Option Pack ✅)' : '(No Option Pack ❌)'}`,
        variant: o.conditions.variant,
        pack: !!o.conditions.optionPackToggle,
      })
    }
  })
  optionsList.value = Array.from(map.values())
  const validKeys = new Set(optionsList.value.map(o => o.key))
  if (!validKeys.has(selectedKey.value)) {
    selectedKey.value = optionsList.value[0]?.key || ''
  }
}

function maybeInitializeModel() {
  if (!loadedGLTF) return
  isInitializing.value = true
  const model = loadedGLTF.scene
  model.scale.set(1, 1, 1)
  model.position.y = -0.5
  model.traverse((child) => {
    if (child.isMesh) child.castShadow = true
    if (jsonConfig.value) child.visible = false
    if (child.isMesh && !child.userData.originalMaterial) {
      child.userData.originalMaterial = child.material
    }
  })
  scene.add(model)
  currentModel.value = model
  nameMap = buildNameMap(model)
  sceneObjectNames.value = Array.from(nameMap.keys()).sort()
  if (jsonConfig.value) {
    applySelectionFromKey(selectedKey.value)
  }
  const variants = extractVariantNames(loadedGLTF)
  colorVariants.value = variants
  if (variants.length) {
    selectedVariant.value = variants[0]
    applyColorVariant(variants[0])
  }
  applyAdditionalLights()
  isInitializing.value = false
  requestRender()
}

function hideAll() {
  if (!currentModel.value) return
  currentModel.value.traverse((child) => { child.visible = false })
}

function hideAccessoriesAndProps() {
  if (!currentModel.value) return
  currentModel.value.traverse((obj) => {
    if (obj.name?.includes('ACC_') || obj.name?.includes('PROP_')) {
      obj.visible = false
    }
  })
  sceneVersion.value++
  requestRender()
}

function applySelectionFromKey(key) {
  if (!currentModel.value || !jsonConfig.value || !key) return
  const [variant, packStr] = key.split('|')
  const pack = packStr === 'true'
  const cfg = jsonConfig.value
  const match = cfg.options.find(
    (o) => String(o.conditions.variant) === variant && !!o.conditions.optionPackToggle === pack
  )
  hideAll()
  if (!match) return
  const names = match.visibleObjs
    .map((id) => cfg.objectNames[id])
    .filter(Boolean)
  names.forEach((name) => {
    const obj = nameMap.get(name)
    if (!obj) return
    obj.visible = true
    obj.traverse((c) => (c.visible = true))
    obj.traverseAncestors((a) => (a.visible = true))
  })
  requestRender()
}

watch(selectedKey, (val) => { applySelectionFromKey(val) })

async function applyColorVariant(key) {
  if (!loadedGLTF || !currentModel.value || !key) return
  const fn = loadedGLTF?.functions?.selectVariant
  if (typeof fn === 'function') {
    fn(currentModel.value, key)
    requestRender()
    return
  }
  await applyColorVariantViaParser(key)
  requestRender()
}

watch(selectedVariant, (val) => { applyColorVariant(val) })

function clearExtraLights() {
  extraLights.forEach((l) => scene.remove(l))
  extraLights = []
}

function applyAdditionalLights() {
  if (!jsonConfig.value) return
  clearExtraLights()
  const positions = jsonConfig.value.lightPositions
  if (Array.isArray(positions) && positions.length) {
    positions.forEach((pos) => {
      const light = new THREE.DirectionalLight(0xffffff, pos.intensity ?? 0.5)
      light.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)
      Object.assign(light, pos.opts || {})
      scene.add(light)
      extraLights.push(light)
    })
    if (mainDirLight) mainDirLight.intensity = 0
  } else {
    if (mainDirLight) mainDirLight.intensity = 0
  }
  requestRender()
}

function extractVariantNames(gltf) {
  const fromUserData = Array.isArray(gltf?.userData?.variants) ? gltf.userData.variants : null
  if (fromUserData) return fromUserData
  const list = gltf?.parser?.json?.extensions?.KHR_materials_variants?.variants
  if (Array.isArray(list)) return list.map((v) => v.name)
  return []
}

async function applyColorVariantViaParser(variantName) {
  const parser = loadedGLTF?.parser
  if (!parser || !currentModel.value) return
  const json = parser.json
  const variantExt = json?.extensions?.KHR_materials_variants
  if (!variantExt) return
  const variantDefs = variantExt.variants || []
  const materialsCache = new Map()
  const getMaterial = async (index) => {
    if (!materialsCache.has(index)) {
      materialsCache.set(index, parser.getDependency('material', index))
    }
    return materialsCache.get(index)
  }
  const tasks = []
  currentModel.value.traverse((object) => {
    if (!object.isMesh) return
    const ext = object.userData?.gltfExtensions?.KHR_materials_variants
    if (!ext || !Array.isArray(ext.mappings)) return
    const mapping = ext.mappings.find((m) => {
      return m.variants?.some((vIdx) => variantDefs[vIdx]?.name === variantName)
    })
    if (mapping) {
      tasks.push(
        (async () => {
          const material = await getMaterial(mapping.material)
          parser.assignFinalMaterial(object, material)
          object.material = material
        })()
      )
    } else if (object.userData.originalMaterial) {
      tasks.push(
        (async () => {
          const material = object.userData.originalMaterial
          parser.assignFinalMaterial(object, material)
          object.material = material
        })()
      )
    }
  })
  await Promise.all(tasks)
}

let activeFlashTimeout = null
let activeBoxHelper = null

// Scene mode pick state
let hoverObj = null
let _tooltipTimer = null
let _lastMouse = { x: 0, y: 0 }
let _mouseDownPos = { x: 0, y: 0 }
const _mouse = new THREE.Vector2()
const _raycaster = new THREE.Raycaster()
const tooltipVisible = ref(false)
const tooltipPos = ref({ x: 0, y: 0 })
const tooltipName = ref('')

function _doRaycast(clientX, clientY) {
  if (!currentModel.value || !containerRef.value) return null
  const rect = containerRef.value.getBoundingClientRect()
  _mouse.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  )
  _raycaster.setFromCamera(_mouse, camera)
  const hits = _raycaster.intersectObject(currentModel.value, true)
  return hits.find(h => h.object.visible)?.object ?? null
}

function clearHoverState() {
  tooltipVisible.value = false
  if (_tooltipTimer) { clearTimeout(_tooltipTimer); _tooltipTimer = null }
  hoverObj = null
  if (containerRef.value) containerRef.value.style.cursor = ''
}

function onCanvasMouseMove(e) {
  if (isJsonMode.value || !currentModel.value) return
  _lastMouse = { x: e.clientX, y: e.clientY }
  tooltipVisible.value = false
  if (_tooltipTimer) { clearTimeout(_tooltipTimer); _tooltipTimer = null }
  _tooltipTimer = setTimeout(() => {
    hoverObj = _doRaycast(_lastMouse.x, _lastMouse.y)
    if (containerRef.value) containerRef.value.style.cursor = hoverObj ? 'pointer' : ''
    if (hoverObj) {
      tooltipPos.value = { x: _lastMouse.x + 14, y: _lastMouse.y + 14 }
      tooltipName.value = hoverObj.name || ''
      tooltipVisible.value = true
    }
  }, 400)
}

function onCanvasMouseDown(e) {
  _mouseDownPos = { x: e.clientX, y: e.clientY }
}

function onCanvasClick(e) {
  if (isJsonMode.value || !currentModel.value) return
  const dx = e.clientX - _mouseDownPos.x
  const dy = e.clientY - _mouseDownPos.y
  if (dx * dx + dy * dy > 25) return  // >5px movement = drag
  const obj = _doRaycast(e.clientX, e.clientY)
  if (!obj) return
  clearHoverState()
  clearActiveFlash()
  const helper = new THREE.BoxHelper(obj, 0x00aaff)
  scene.add(helper)
  activeBoxHelper = helper
  requestRender()
  activeFlashTimeout = setTimeout(clearActiveFlash, 1200)
  selectedNodeId.value = obj.uuid
  rightPanelRef.value?.openAndShowScene?.()
}

function clearActiveFlash() {
  if (activeFlashTimeout) { clearTimeout(activeFlashTimeout); activeFlashTimeout = null }
  if (activeBoxHelper) {
    scene.remove(activeBoxHelper)
    activeBoxHelper.geometry?.dispose()
    activeBoxHelper.material?.dispose()
    activeBoxHelper = null
    requestRender()
  }
}

function focusOnPartFromOutside(obj) {
  // Compute overall model bounding sphere so we know what "outside" means
  const modelBox = new THREE.Box3().setFromObject(currentModel.value)
  const modelCenter = new THREE.Vector3()
  modelBox.getCenter(modelCenter)
  const modelSize = new THREE.Vector3()
  modelBox.getSize(modelSize)
  const modelRadius = modelSize.length() / 2

  // Center of the target part
  const partBox = new THREE.Box3().setFromObject(obj)
  const partCenter = new THREE.Vector3()
  partBox.getCenter(partCenter)

  // Direction from model center outward toward this part
  const dir = new THREE.Vector3().subVectors(partCenter, modelCenter)
  if (dir.lengthSq() < 0.0001) {
    // Part is at the model center — fall back to current camera direction
    dir.subVectors(camera.position, modelCenter)
  }
  dir.normalize()

  // Place camera outside the model along that direction, clamped to control limits
  const distance = Math.min(Math.max(modelRadius * 2.2, controls.minDistance), controls.maxDistance)
  const camPos = new THREE.Vector3().copy(partCenter).addScaledVector(dir, distance)

  // Never go below the model's lower bound
  camPos.y = Math.max(camPos.y, modelCenter.y - modelSize.y * 0.1)

  controls.setLookAt(camPos.x, camPos.y, camPos.z, partCenter.x, partCenter.y, partCenter.z, true)
}

function flashObject(obj) {
  if (!obj || isJsonMode.value) return
  clearActiveFlash()
  focusOnPartFromOutside(obj)
  const helper = new THREE.BoxHelper(obj, 0x00aaff)
  scene.add(helper)
  activeBoxHelper = helper
  requestRender()
  activeFlashTimeout = setTimeout(clearActiveFlash, 1200)
}

function focusAndFlash(objectName) {
  if (!currentModel.value) return
  const obj = nameMap.get(objectName)
  if (obj) flashObject(obj)
}


function showAllObjects() {
  if (!currentModel.value) return
  currentModel.value.traverse((c) => { c.visible = true })
  requestRender()
}

function previewPart(name) {
  if (!currentModel.value) return
  if (!name) { showAllObjects(); return }
  const obj = nameMap.get(name)
  if (!obj) return
  currentModel.value.traverse((c) => { c.visible = false })
  obj.visible = true
  obj.traverse((c) => { c.visible = true })
  obj.traverseAncestors((a) => { a.visible = true })
  controls.fitToBox(obj, true)
  requestRender()
}

function previewParts(names) {
  if (!currentModel.value) return
  currentModel.value.traverse((c) => { c.visible = false })
  names.forEach((name) => {
    const obj = nameMap.get(name)
    if (!obj) return
    obj.visible = true
    obj.traverse((c) => { c.visible = true })
    obj.traverseAncestors((a) => { a.visible = true })
  })
  requestRender()
}

function restoreScene() {
  if (!currentModel.value) return
  clearActiveFlash()
  if (selectedKey.value && jsonConfig.value) {
    hideAll()
    applySelectionFromKey(selectedKey.value)
  } else {
    showAllObjects()
  }
}

function updateHighlightVisibility() {
  if (!currentModel.value) return
  if (highlightedIds.value.length === 0) {
    restoreScene()
    return
  }
  currentModel.value.traverse((c) => { c.visible = false })
  highlightedIds.value.forEach((uuid) => {
    const obj = findObjectByUUID(currentModel.value, uuid)
    if (!obj) return
    obj.visible = true
    obj.traverse((c) => { c.visible = true })
    obj.traverseAncestors((a) => { a.visible = true })
  })
  requestRender()
}

function toggleHighlight(uuid) {
  const idx = highlightedIds.value.indexOf(uuid)
  if (idx !== -1) highlightedIds.value.splice(idx, 1)
  else highlightedIds.value.push(uuid)
  updateHighlightVisibility()
}

function clearHighlights() {
  highlightedIds.value = []
  updateHighlightVisibility()
}

function openAddVariantModal() {
  newOptionForm.value = { name: '', variant: '', optionPackToggle: false }
  showAddVariantModal.value = true
}

function confirmAddVariant() {
  const glbNames = highlightedIds.value
    .map((uuid) => findObjectByUUID(currentModel.value, uuid)?.name)
    .filter(Boolean)
  rightPanelRef.value?.addOptionFromScene({
    name: newOptionForm.value.name,
    variant: newOptionForm.value.variant,
    optionPackToggle: newOptionForm.value.optionPackToggle,
    glbNames,
  })
  rightPanelRef.value?.switchToTab('json')
  showAddVariantModal.value = false
  clearHighlights()
}

function handlePreviewVariant({ variant, optionPackToggle }) {
  if (!currentModel.value || !jsonConfig.value) return
  const key = `${variant}|${optionPackToggle}`
  selectedKey.value = key
  hideAll()
  applySelectionFromKey(key)
}

function handleTabChange(tab) {
  isJsonMode.value = tab === 'json'
  showLeftPanel.value = tab === 'scene'
  clearActiveFlash()
  controls?.reset(true)
  if (tab === 'scene') {
    showAllObjects()
  } else if (tab === 'accessories') {
    hideAccessoriesAndProps()
  } else {
    if (jsonConfig.value && optionsList.value.length) {
      selectedKey.value = optionsList.value[0].key
      hideAll()
      applySelectionFromKey(selectedKey.value)
    } else {
      showAllObjects()
    }
  }
}

function handleJsonUpdated(newConfig) {
  jsonConfig.value = newConfig
  buildOptionsFromJson(newConfig)
  applyAdditionalLights()
  if (currentModel.value) {
    hideAll()
    applySelectionFromKey(selectedKey.value)
  }
  requestRender()
}

function handleOutlinerToggle({ id, value, cascade }) {
  if (!currentModel.value) return
  const obj = findObjectByUUID(currentModel.value, id)
  if (!obj) return
  const newVisible = value === null ? !obj.visible : !!value
  if (cascade) {
    obj.traverse((child) => { child.visible = newVisible })
  } else {
    obj.visible = newVisible
  }
  sceneVersion.value++
  requestRender()
}

function handleOutlinerSelect(id) {
  selectedNodeId.value = id
  const obj = findObjectByUUID(currentModel.value, id)
  if (obj) flashObject(obj)
}

async function clearCache() {
  if (!confirm('Are you sure? This will remove cached GLB/JSON files and set HDR to the default one.')) return
  try { await Promise.all([idbDelete('glb'), idbDelete('json'), idbDelete('hdr'), idbDelete('hdrName'), idbDelete('glbName'), idbDelete('jsonName')]) } catch {}
  hdrName.value = 'HDRI_STUDIO_Combined_5.hdr'
  hdrCached.value = false
  location.reload()
}

let resizeObserver = null

onMounted(() => {
  initScene()
  resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(containerRef.value)
  animate()
  ;(async () => {
    try {
      const [glbBuf, jsonText, cachedGlbName, cachedJsonName, hdrBuf, cachedHdrName] = await Promise.all([
        idbGet('glb'), idbGet('json'), idbGet('glbName'), idbGet('jsonName'), idbGet('hdr'), idbGet('hdrName')
      ])
      if (jsonText) {
        try {
          jsonConfig.value = JSON.parse(jsonText)
          buildOptionsFromJson(jsonConfig.value)
          applyAdditionalLights()
          jsonName.value = cachedJsonName || 'JSON'
          jsonCached.value = true
        } catch {}
      }
      if (hdrBuf) {
        const url = URL.createObjectURL(new Blob([hdrBuf]))
        await loadHDRFromPath(url)
        URL.revokeObjectURL(url)
        hdrName.value = cachedHdrName || hdrName.value
        hdrCached.value = true
      }
      if (glbBuf && jsonText) {
        isInitializing.value = true
        const blob = new Blob([glbBuf], { type: 'model/gltf-binary' })
        const url = URL.createObjectURL(blob)
        const loader = new GLTFLoader()
        const draco = new DRACOLoader()
        draco.setDecoderPath(import.meta.env.BASE_URL)
        loader.setDRACOLoader(draco)
        loadedGLTF = await loader.loadAsync(url)
        URL.revokeObjectURL(url)
        maybeInitializeModel()
        glbName.value = cachedGlbName || 'GLB'
        glbCached.value = true
      }
    } catch {}
  })()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  controls?.dispose?.()
  renderer?.dispose?.()
})
</script>

<template>
  <div class="viewer-wrap">
    <!-- Left sidebar -->
    <div class="left-panel" :class="{ 'is-collapsed': !showLeftPanel }">
      <div class="left-panel-body">
        <div class="panel-header">
          <span class="panel-title">3D Viewer</span>
          <span class="mode-badge" :class="isJsonMode ? 'mode-json' : 'mode-scene'">
            {{ isJsonMode ? 'JSON' : 'Scene' }}
          </span>
        </div>

        <div class="panel-section-label">Files</div>
        <div class="panel-section">
          <div class="tool">
            <div class="tool-label">GLB Model</div>
            <label class="file-btn">
              <input class="file-input" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" @change="onFileSelected" />
              <span class="file-btn-text">{{ glbButtonText }}</span>
              <span class="file-btn-hover">{{ glbHoverText }}</span>
            </label>
          </div>
          <div class="tool">
            <div class="tool-label">JSON Config</div>
            <label class="file-btn">
              <input class="file-input" type="file" accept=".json,application/json" @change="onJsonSelected" />
              <span class="file-btn-text">{{ jsonButtonText }}</span>
              <span class="file-btn-hover">{{ jsonHoverText }}</span>
            </label>
          </div>
          <div class="tool">
            <div class="tool-label">HDR Environment</div>
            <label class="file-btn">
              <input class="file-input" type="file" accept=".hdr" @change="onHdrSelected" />
              <span class="file-btn-text">{{ hdrButtonText }}</span>
              <span class="file-btn-hover">{{ hdrHoverText }}</span>
            </label>
          </div>
        </div>

        <div class="panel-divider"></div>
        <div class="panel-section-label">Variants</div>
        <div class="panel-section">
          <div class="tool">
            <div class="tool-label">Variant</div>
            <select class="select" v-model="selectedKey" :disabled="!jsonConfig || !currentModel">
              <template v-if="jsonConfig">
                <option v-for="opt in optionsList" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
              </template>
              <option v-else disabled value="">No JSON loaded</option>
            </select>
          </div>
          <div class="tool">
            <div class="tool-label">Color</div>
            <select class="select" v-model="selectedVariant" :disabled="!colorVariants.length || !currentModel">
              <option v-if="!colorVariants.length" disabled value="">No variants</option>
              <option v-for="v in colorVariants" :key="v" :value="v">{{ v }}</option>
            </select>
          </div>
        </div>

        <div class="panel-divider"></div>
        <div class="panel-section-label">Renderer</div>
        <div class="panel-section">
          <div class="tool">
            <div class="tool-label">Quality</div>
            <select class="select" v-model="currentQuality">
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
        </div>

        <div class="panel-spacer"></div>
        <div class="panel-section panel-footer">
          <button class="clear-btn" type="button" @click="clearCache">Clear Cache</button>
        </div>
      </div>
      <button class="left-panel-handle" @click="showLeftPanel = !showLeftPanel" :title="showLeftPanel ? 'Collapse' : 'Expand'">
        {{ showLeftPanel ? '◂' : '▸' }}
      </button>
    </div>

    <!-- Canvas + overlays -->
    <div ref="containerRef" class="viewer"
      @mouseenter="clearActiveFlash(); requestRender()"
      @mousemove="onCanvasMouseMove"
      @mousedown="onCanvasMouseDown"
      @mouseleave="clearHoverState"
      @click="onCanvasClick"
    >
      <div v-if="isLoading" class="loading-overlay">
        <div class="spinner"></div>
      </div>
      <div v-if="loadedGLTF && !jsonConfig" class="json-hint">
        Upload a JSON config or build one in the JSON tab →
      </div>
    </div>

    <!-- Right panel (flex sibling) -->
    <RightPanel
      v-if="currentModel"
      ref="rightPanelRef"
      :json-config="jsonConfig"
      :scene-object-names="sceneObjectNames"
      :json-file-name="jsonName"
      :current-model="currentModel"
      :selected-node-id="selectedNodeId"
      :scene-version="sceneVersion"
      :highlighted-ids="highlightedIds"
      @select="handleOutlinerSelect"
      @toggle="handleOutlinerToggle"
      @focus-object="focusAndFlash"
      @json-updated="handleJsonUpdated"
      @tab-change="handleTabChange"
      @preview-part="previewPart"
      @preview-parts="previewParts"
      @restore-scene="restoreScene"
      @preview-variant="handlePreviewVariant"
      @highlight-toggle="toggleHighlight"
      @add-as-variant="openAddVariantModal"
      @clear-highlights="clearHighlights"
    />

    <!-- Scene pick tooltip -->
    <div v-if="tooltipVisible" class="pick-tooltip" :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }">
      <span class="pick-tooltip-hint">click to find in scene</span>
      <span v-if="tooltipName" class="pick-tooltip-name">{{ tooltipName }}</span>
    </div>

    <!-- Add as Variant Option modal -->
    <div v-if="showAddVariantModal" class="modal-overlay" @click.self="showAddVariantModal = false">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Add as Variant Option</span>
          <button class="modal-close" @click="showAddVariantModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-note">
            {{ highlightedIds.length }} object{{ highlightedIds.length !== 1 ? 's' : '' }} selected as visible objects.
          </div>
          <div class="mfield">
            <label class="mlabel">Display Name</label>
            <input class="minput" v-model="newOptionForm.name" placeholder="e.g. Kona NLine" autofocus />
          </div>
          <div class="mfield">
            <label class="mlabel">
              Variant Name
              <span class="mlabel-hint">SubGroup Name in PCM2</span>
            </label>
            <input class="minput" v-model="newOptionForm.variant" placeholder="e.g. Kona" />
          </div>
          <div class="mfield mfield-row">
            <input type="checkbox" id="modal-pack" v-model="newOptionForm.optionPackToggle" />
            <label for="modal-pack" class="mlabel inline">Option Pack Toggle</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn cancel" @click="showAddVariantModal = false">Cancel</button>
          <button class="modal-btn confirm" @click="confirmAddVariant" :disabled="!newOptionForm.name || !newOptionForm.variant">Add Option</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.viewer-wrap {
  display: flex;
  flex-direction: row;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

/* ── Canvas ── */
.viewer {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, #f6f3f2 0, #f6f3f2 50%, #e4dfdd 50.2%, #f6f3f2);
}

/* ── Left panel ── */
.left-panel {
  position: relative;
  flex-shrink: 0;
  height: 100%;
  z-index: 2;
}

.left-panel-body {
  width: 220px;
  height: 100%;
  background: rgba(255, 255, 255, 0.96);
  border-right: 1px solid #e7e7e7;
  box-shadow: 2px 0 12px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
}
.left-panel.is-collapsed .left-panel-body { width: 0; }

.left-panel-handle {
  position: absolute;
  right: -20px; top: 50%;
  transform: translateY(-50%);
  width: 20px; height: 48px;
  background: rgba(255,255,255,0.96);
  border: 1px solid #e7e7e7;
  border-left: none;
  border-radius: 0 8px 8px 0;
  box-shadow: 2px 0 8px rgba(0,0,0,0.06);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: #888;
  transition: background 0.15s, color 0.15s;
  z-index: 1;
}
.left-panel-handle:hover { background: #f0f0f0; color: #333; }

/* Panel header */
.panel-header {
  padding: 12px 14px 10px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: #111;
  letter-spacing: 0.01em;
}
.mode-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 20px;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.mode-json { background: #e8f0fe; color: #1a73e8; }
.mode-scene { background: #e6f4ea; color: #1e7c3a; }

/* Sections */
.panel-section-label {
  font-size: 10px;
  font-weight: 700;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 10px 14px 4px;
  flex-shrink: 0;
}
.panel-section {
  padding: 0 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}
.panel-divider {
  height: 1px;
  background: #eee;
  margin: 4px 0;
  flex-shrink: 0;
}
.panel-spacer { flex: 1; }
.panel-footer {
  padding: 10px;
  border-top: 1px solid #eee;
}

/* Tool rows */
.tool {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-label {
  font-size: 11px;
  color: #888;
  padding-left: 2px;
}

/* File upload buttons */
.file-btn {
  display: block;
  position: relative;
  overflow: hidden;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  background: #fff;
  padding: 7px 10px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-btn:hover { border-color: #bbb; box-shadow: 0 2px 6px rgba(0,0,0,0.07); }
.file-input { display: none; }
.file-btn-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #333;
  transition: opacity 0.15s, transform 0.15s;
}
.file-btn-hover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
  color: #fff;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
  border-radius: 7px;
}
.file-btn:hover .file-btn-text { opacity: 0.15; transform: scale(0.97); }
.file-btn:hover .file-btn-hover { opacity: 1; }

/* Selects */
.select {
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #222;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  width: 100%;
}
.select:disabled { opacity: 0.5; }

/* Clear cache button */
.clear-btn {
  width: 100%;
  padding: 7px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  background: #fff;
  color: #555;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.clear-btn:hover { background: #fee; color: #c00; border-color: #f99; }

/* ── Pick tooltip ── */
.pick-tooltip {
  position: fixed;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 11px;
  padding: 5px 9px;
  border-radius: 5px;
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
  user-select: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pick-tooltip-hint { color: rgba(255,255,255,0.6); font-size: 10px; }
.pick-tooltip-name { color: #fff; font-size: 12px; font-weight: 600; }

/* ── Overlays ── */
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.75);
  pointer-events: none;
  z-index: 3;
}
.json-hint {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  background: rgba(255,255,255,0.92);
  color: #555;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  white-space: nowrap;
  pointer-events: none;
  z-index: 1;
}
.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #ccc;
  border-top-color: #555;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.modal {
  background: #fff;
  border-radius: 12px;
  width: 360px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #eee;
}
.modal-title { font-size: 14px; font-weight: 600; color: #111; }
.modal-close {
  width: 24px; height: 24px;
  border: none; background: transparent;
  cursor: pointer; font-size: 12px; color: #999;
  border-radius: 4px;
}
.modal-close:hover { background: #f0f0f0; color: #333; }
.modal-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-note {
  font-size: 11px;
  color: #888;
  background: #f8f8f8;
  border-radius: 6px;
  padding: 6px 10px;
}
.mfield { display: flex; flex-direction: column; gap: 4px; }
.mfield-row { flex-direction: row; align-items: center; gap: 8px; }
.mlabel {
  font-size: 11px; font-weight: 600; color: #555;
  display: flex; align-items: center; gap: 6px;
}
.mlabel.inline { font-size: 12px; font-weight: 400; }
.mlabel-hint {
  font-size: 10px; color: #e06c00;
  background: #fff8f0; padding: 1px 5px;
  border-radius: 3px; font-weight: 600;
}
.minput {
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  color: #222;
  background: #fff;
  width: 100%;
  box-sizing: border-box;
}
.minput:focus { outline: none; border-color: #aaa; }
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #eee;
}
.modal-btn {
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid;
}
.modal-btn.cancel { background: #fff; color: #444; border-color: #d9d9d9; }
.modal-btn.cancel:hover { background: #f5f5f5; }
.modal-btn.confirm { background: #111; color: #fff; border-color: #111; }
.modal-btn.confirm:hover { background: #333; }
.modal-btn.confirm:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
