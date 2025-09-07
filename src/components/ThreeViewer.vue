<script setup>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import * as THREE from 'three'
import CameraControls from 'camera-controls'
import SceneOutliner from './SceneOutliner.vue'
import { buildTreeFromObject3D, findObjectByUUID, collectMeshes } from '../utils/sceneTree.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { idbGet, idbSet, idbDelete } from '../utils/idbCache.js'
// import { setName } from 'three/tsl'

const containerRef = ref(null)
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
const visibilityOverrides = ref({})

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

  // Environment HDR (defaults to public file; can be overridden)
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
  mainDirLight.shadow.mapSize.width = 1024
  mainDirLight.shadow.mapSize.height = 1024
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
  renderer.setPixelRatio(window.devicePixelRatio)
}

function animate() {
  const delta = clock.getDelta()
  controls.update(delta)
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

async function loadGLBFromFile(file) {
  if (!file) return
  const url = URL.createObjectURL(file)
  try {
    // cache raw GLB bytes for reloads
    try {
      const buf = await file.arrayBuffer()
      await idbSet('glb', buf)
      await idbSet('glbName', file.name)
    } catch {}
    glbName.value = file.name
    glbCached.value = false
    isGLBLoading.value = true
    // Dispose previous model
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
    }

    const loader = new GLTFLoader()
    const draco = new DRACOLoader()
    // Draco assets placed in public root; adjust if you move them
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
}

async function onJsonSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
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
    maybeInitializeModel()
  } catch (err) {
    console.warn('Invalid JSON file', err)
  } finally {
    isJSONLoading.value = false
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
    // Create a blob URL and load
    const url = URL.createObjectURL(new Blob([buf]))
    await loadHDRFromPath(url)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.warn('Invalid HDR file', err)
  } finally {
    isHDRLoading.value = false
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
  if (!selectedKey.value && optionsList.value.length) {
    selectedKey.value = optionsList.value[0].key
  }
}

function maybeInitializeModel() {
  if (!loadedGLTF || !jsonConfig.value) {
    return
  }
  // Attach and prepare the model once both GLB and JSON are available
  isInitializing.value = true
  const model = loadedGLTF.scene
  model.scale.set(1, 1, 1)
  model.position.y = -0.5
  model.traverse((child) => {
    if (child.isMesh) child.castShadow = true
    child.visible = false
    if (child.isMesh && !child.userData.originalMaterial) {
      child.userData.originalMaterial = child.material
    }
  })
  scene.add(model)
  currentModel.value = model
  applySelectionFromKey(selectedKey.value)
  // Material variants
  const variants = extractVariantNames(loadedGLTF)
  colorVariants.value = variants
  if (variants.length) {
    selectedVariant.value = variants[0]
    applyColorVariant(variants[0])
  }
  // Lights could be in JSON; re-apply on init as well
  applyAdditionalLights()
  isInitializing.value = false
  // Reset outliner overrides on model init
  visibilityOverrides.value = {}
}

function hideAll() {
  if (!currentModel.value) return
  currentModel.value.traverse((child) => {
    child.visible = false
  })
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
    const obj = currentModel.value.getObjectByName(name)
    if (!obj) return
    obj.visible = true
    obj.traverse((c) => (c.visible = true))
    obj.traverseAncestors((a) => (a.visible = true))
  })
  // After variant visibility, re-apply user overrides
  applyVisibilityOverrides()
}

watch(selectedKey, (val) => {
  applySelectionFromKey(val)
})

async function applyColorVariant(key) {
  if (!loadedGLTF || !currentModel.value || !key) return
  const fn = loadedGLTF?.functions?.selectVariant
  if (typeof fn === 'function') {
    fn(currentModel.value, key)
    return
  }
  await applyColorVariantViaParser(key)
}

watch(selectedVariant, (val) => {
  applyColorVariant(val)
})

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
}

function extractVariantNames(gltf) {
  const fromUserData = Array.isArray(gltf?.userData?.variants)
    ? gltf.userData.variants
    : null
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
function applyVisibilityOverrides() {
  if (!currentModel.value) return
  Object.entries(visibilityOverrides.value).forEach(([uuid, vis]) => {
    const obj = findObjectByUUID(currentModel.value, uuid)
    if (obj) obj.visible = !!vis
  })
}

function handleOutlinerToggle({ id, value }) {
  if (!currentModel.value) return
  visibilityOverrides.value = { ...visibilityOverrides.value, [id]: value }
  const obj = findObjectByUUID(currentModel.value, id)
  if (obj) obj.visible = !!value
}

let pulseTimer = null
function clearPulse() { if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null } }
function handleOutlinerSelect(id) {
  selectedNodeId.value = id
  clearPulse()
  const obj = findObjectByUUID(currentModel.value, id)
  if (!obj) return
  const meshes = obj.isMesh ? [obj] : collectMeshes(obj)
  // lightweight emissive pulse
  let on = false
  pulseTimer = setInterval(() => {
    on = !on
    meshes.forEach((m) => {
      const mat = Array.isArray(m.material) ? m.material : [m.material]
      mat.forEach((mm) => { if (mm && 'emissive' in mm) { mm.emissive.setHex(on ? 0x00aa77 : 0x000000) } })
    })
  }, 600)
}
async function clearCache() {
  try { await Promise.all([idbDelete('glb'), idbDelete('json'), idbDelete('hdr'), idbDelete('hdrName')]) } catch {}
  // Reset to defaults
  hdrName.value = 'HDRI_STUDIO_Combined_5.hdr'
  hdrCached.value = false
  loadHDRFromPath(defaultHdrPath)
}

onMounted(() => {
  initScene()
  window.addEventListener('resize', onResize)
  animate()
  // Attempt autoload from cache
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
  window.removeEventListener('resize', onResize)
  controls?.dispose?.()
  renderer?.dispose?.()
})
</script>

<template>
  <div class="viewer-wrap">
    <div class="toolbar">
      <div class="tool">
        <div class="tool-label">GLB</div>
        <label class="btn" :title="glbHoverText">
          <input class="file-input" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" @change="onFileSelected" />
          <span class="btn-text">{{ glbButtonText }}</span>
          <span class="btn-hover">{{ glbHoverText }}</span>
        </label>
      </div>
      <div class="tool">
        <div class="tool-label">JSON</div>
        <label class="btn" :title="jsonHoverText">
          <input class="file-input" type="file" accept=".json,application/json" @change="onJsonSelected" />
          <span class="btn-text">{{ jsonButtonText }}</span>
          <span class="btn-hover">{{ jsonHoverText }}</span>
        </label>
      </div>
      <div class="tool">
        <div class="tool-label">HDR</div>
        <label class="btn" :title="hdrHoverText">
          <input class="file-input" type="file" accept=".hdr" @change="onHdrSelected" />
          <span class="btn-text">{{ hdrButtonText }}</span>
          <span class="btn-hover">{{ hdrHoverText }}</span>
        </label>
      </div>
      <div class="tool">
        <div class="tool-label">Variant</div>
        <select class="select" v-model="selectedKey" :disabled="!jsonConfig || !currentModel">
          <option v-for="opt in optionsList" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
        </select>
      </div>
      <div class="tool">
        <div class="tool-label">Color</div>
        <select class="select" v-model="selectedVariant" :disabled="!colorVariants.length || !currentModel">
          <option v-for="v in colorVariants" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
      <button class="btn" type="button" @click="clearCache">Clear Cache</button>
    </div>
    <div ref="containerRef" class="viewer"></div>
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
    </div>
  </div>
  <div class="right-panel" v-if="currentModel">
    <SceneOutliner :root="currentModel" :selected-id="selectedNodeId" :visibility-overrides="visibilityOverrides" @select="handleOutlinerSelect" @toggle="handleOutlinerToggle" />
  </div>
</template>

<style scoped>
.viewer-wrap {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
}
.right-panel { position: absolute; right: 0; top: 0; bottom: 0; }
.toolbar {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.85);
  border: 1px solid #e7e7e7;
  border-radius: 12px;
  padding: 8px 10px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.06);
  z-index: 2;
}
.tool {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}
.tool-label {
  font-size: 11px;
  color: #666;
  text-align: center;
}
.viewer {
  position: relative;
  flex: 1;
  width: 100%;
  background: linear-gradient(180deg,#f6f3f2 0,#f6f3f2 50%,#e4dfdd 50.2%,#f6f3f2);
}
.btn {
  appearance: none;
  border: 1px solid #d9d9d9;
  background: #ffffff;
  color: #222;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  position: relative;
  overflow: hidden;
  min-width: 140px;
  text-align: center;
}
.btn:hover {
  border-color: #c8c8c8;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.file-input {
  display: none;
}
.btn-text {
  display: inline-block;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.btn-hover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.btn:hover .btn-text { opacity: 0.2; transform: scale(0.98); }
.btn:hover .btn-hover { opacity: 1; }
.select {
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #222;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.8);
  pointer-events: none;
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
</style>


