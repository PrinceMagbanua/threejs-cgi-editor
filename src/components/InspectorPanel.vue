<script setup>
import { reactive, computed, watch, ref, toRaw } from 'vue'

const props = defineProps({
  object: { type: Object, default: null },
  open: { type: Boolean, default: false },
  sceneVersion: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'changed', 'material-changed'])

// 'name' is auto-populated by GLTFLoader on every named node and just mirrors
// the Name field already editable in Attributes above, so it's noise here.
const EXCLUDED_USERDATA_KEYS = new Set(['originalMaterial', 'gltfExtensions', 'name'])

const form = reactive({
  name: '',
  visible: true,
  posX: 0, posY: 0, posZ: 0,
  rotX: 0, rotY: 0, rotZ: 0,
  scaleX: 1, scaleY: 1, scaleZ: 1,
})

const radToDeg = (r) => (r * 180) / Math.PI
const degToRad = (d) => (d * Math.PI) / 180
function round(n, d = 3) {
  const f = 10 ** d
  return Math.round(n * f) / f
}

function syncFromObject() {
  const o = props.object
  if (!o) return
  form.name = o.name || ''
  form.visible = !!o.visible
  form.posX = round(o.position.x); form.posY = round(o.position.y); form.posZ = round(o.position.z)
  form.rotX = round(radToDeg(o.rotation.x), 1); form.rotY = round(radToDeg(o.rotation.y), 1); form.rotZ = round(radToDeg(o.rotation.z), 1)
  form.scaleX = round(o.scale.x); form.scaleY = round(o.scale.y); form.scaleZ = round(o.scale.z)
}
watch(() => props.object, syncFromObject, { immediate: true })
watch(() => props.sceneVersion, () => { if (props.object) syncFromObject() })

function commitName() {
  if (!props.object) return
  props.object.name = form.name
  emit('changed')
}
function commitVisible() {
  if (!props.object) return
  props.object.visible = form.visible
  emit('changed')
}
function commitPosition() {
  if (!props.object) return
  props.object.position.set(form.posX, form.posY, form.posZ)
  emit('changed')
}
function commitRotation() {
  if (!props.object) return
  props.object.rotation.set(degToRad(form.rotX), degToRad(form.rotY), degToRad(form.rotZ))
  emit('changed')
}
function commitScale() {
  if (!props.object) return
  props.object.scale.set(form.scaleX, form.scaleY, form.scaleZ)
  emit('changed')
}
function onVecInput(field, value, commitFn) {
  form[field] = Number(value)
  commitFn()
}

// Materials are shared between meshes (and cached by the GLTF parser across
// colour variants), so edits apply everywhere the material is used and survive
// variant switches. Writes go to the raw material and bump matTick instead of
// going through Vue's proxy, so dragging a slider doesn't re-run deep watchers.
const MATERIAL_FIELDS = [
  { key: 'roughness', label: 'Roughness' },
  { key: 'clearcoat', label: 'Clearcoat' },
  { key: 'clearcoatRoughness', label: 'Coat Roughness' },
]
const matTick = ref(0)
const originalMatValues = new WeakMap()

const materials = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  props.sceneVersion
  const o = props.object
  if (!o) return []
  const own = new Set()
  o.traverse((c) => {
    if (c.isMesh) [].concat(c.material).forEach((m) => m && own.add(toRaw(m)))
  })
  if (!own.size) return []
  let root = o
  while (root.parent) root = root.parent
  const users = new Map()
  root.traverse((c) => {
    if (!c.isMesh) return
    for (const m of [].concat(c.material)) {
      const r = toRaw(m)
      if (own.has(r)) users.set(r, (users.get(r) || 0) + 1)
    }
  })
  return [...own].map((mat) => ({
    mat,
    users: users.get(mat) || 1,
    fields: MATERIAL_FIELDS.filter((f) => typeof mat[f.key] === 'number'),
  }))
})

function matValue(mat, key) {
  // eslint-disable-next-line no-unused-expressions
  matTick.value
  return round(mat[key])
}

function setMatValue(mat, key, rawValue) {
  const n = Number(rawValue)
  if (rawValue === '' || Number.isNaN(n)) { matTick.value++; return }
  if (!originalMatValues.has(mat)) {
    originalMatValues.set(mat, Object.fromEntries(MATERIAL_FIELDS.map((f) => [f.key, mat[f.key]])))
  }
  mat[key] = Math.min(1, Math.max(0, n))
  matTick.value++
  emit('material-changed')
}

function isMatModified(mat) {
  // eslint-disable-next-line no-unused-expressions
  matTick.value
  const orig = originalMatValues.get(mat)
  return !!orig && MATERIAL_FIELDS.some((f) => orig[f.key] !== mat[f.key])
}

function resetMaterial(mat) {
  const orig = originalMatValues.get(mat)
  if (!orig) return
  MATERIAL_FIELDS.forEach((f) => { if (typeof orig[f.key] === 'number') mat[f.key] = orig[f.key] })
  matTick.value++
  emit('material-changed')
}

const customProps = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  props.sceneVersion
  const o = props.object
  if (!o?.userData) return []
  return Object.keys(o.userData)
    .filter((k) => !EXCLUDED_USERDATA_KEYS.has(k))
    .sort()
    .map((k) => {
      const value = o.userData[k]
      const isPrimitive = ['string', 'number', 'boolean'].includes(typeof value)
      return {
        key: k,
        value,
        raw: isPrimitive ? String(value) : JSON.stringify(value),
      }
    })
})

function humanizeKey(key) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Arrays/objects (e.g. matches/conflicts) round-trip through JSON so they stay
// editable as text; anything that isn't valid JSON falls back to a plain string.
function coerceValue(rawValue, original) {
  if (typeof original === 'number') {
    const n = Number(rawValue)
    return Number.isNaN(n) ? rawValue : n
  }
  if (typeof original === 'boolean') return rawValue === 'true'
  if (original && typeof original === 'object') {
    try { return JSON.parse(rawValue) } catch { return rawValue }
  }
  return rawValue
}

function commitUserDataValue(key, rawValue) {
  if (!props.object) return
  const original = props.object.userData[key]
  props.object.userData[key] = coerceValue(rawValue, original)
  emit('changed')
}

function removeUserDataKey(key) {
  if (!props.object) return
  delete props.object.userData[key]
  emit('changed')
}

const newPropKey = ref('')
const newPropValue = ref('')

function inferValue(rawValue) {
  const trimmed = rawValue.trim()
  if (trimmed === '') return ''
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (!Number.isNaN(Number(trimmed))) return Number(trimmed)
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object') return parsed
  } catch { /* not JSON — keep as plain string */ }
  return rawValue
}

function addUserDataProp() {
  const key = newPropKey.value.trim()
  if (!props.object || !key) return
  props.object.userData[key] = inferValue(newPropValue.value)
  newPropKey.value = ''
  newPropValue.value = ''
  emit('changed')
}

function accTypeTooltip(value) {
  return `"${value}" accessory slot. While this ACC_ is visible, any other part in the model tagged with accType = "${value}" (accessory or ordinary body part) is automatically hidden, since it occupies the same slot on the car — e.g. the stock part this accessory replaces. Turn this accessory off to bring that part back, as long as no other visible accessory shares the same accType.`
}

function parentLabel() {
  const p = props.object?.parent
  if (!p) return '—'
  return p.name || p.type
}
</script>

<template>
  <div class="inspector-drawer" :class="{ open }">
    <div class="inspector-header">
      <div class="inspector-title" v-if="object">
        <span class="obj-name">{{ form.name || '(unnamed)' }}</span>
        <span class="obj-type">{{ object.type }}</span>
      </div>
      <button class="inspector-close" @click="$emit('close')" title="Close">✕</button>
    </div>

    <div class="inspector-body" v-if="object">
      <div class="insp-section">
        <div class="insp-section-label">Attributes</div>
        <div class="insp-grid">
          <label class="insp-field">
            <span class="insp-label">Name</span>
            <input class="insp-input" v-model="form.name" @change="commitName" />
          </label>
          <label class="insp-field insp-field-inline">
            <span class="insp-label">Visible</span>
            <input type="checkbox" v-model="form.visible" @change="commitVisible" />
          </label>
          <div class="insp-field">
            <span class="insp-label">Type</span>
            <span class="insp-readonly">{{ object.type }}</span>
          </div>
          <div class="insp-field">
            <span class="insp-label">Parent</span>
            <span class="insp-readonly">{{ parentLabel() }}</span>
          </div>
          <div class="insp-field insp-field-wide">
            <span class="insp-label">UUID</span>
            <span class="insp-readonly mono">{{ object.uuid }}</span>
          </div>
        </div>
      </div>

      <div class="insp-section">
        <div class="insp-section-label">Transform</div>
        <div class="insp-vec3-row">
          <span class="vec3-label">Position</span>
          <label class="axis"><span>X</span><input type="number" step="0.01" :value="form.posX" @input="onVecInput('posX', $event.target.value, commitPosition)" /></label>
          <label class="axis"><span>Y</span><input type="number" step="0.01" :value="form.posY" @input="onVecInput('posY', $event.target.value, commitPosition)" /></label>
          <label class="axis"><span>Z</span><input type="number" step="0.01" :value="form.posZ" @input="onVecInput('posZ', $event.target.value, commitPosition)" /></label>
        </div>
        <div class="insp-vec3-row">
          <span class="vec3-label">Rotation °</span>
          <label class="axis"><span>X</span><input type="number" step="1" :value="form.rotX" @input="onVecInput('rotX', $event.target.value, commitRotation)" /></label>
          <label class="axis"><span>Y</span><input type="number" step="1" :value="form.rotY" @input="onVecInput('rotY', $event.target.value, commitRotation)" /></label>
          <label class="axis"><span>Z</span><input type="number" step="1" :value="form.rotZ" @input="onVecInput('rotZ', $event.target.value, commitRotation)" /></label>
        </div>
        <div class="insp-vec3-row">
          <span class="vec3-label">Scale</span>
          <label class="axis"><span>X</span><input type="number" step="0.01" :value="form.scaleX" @input="onVecInput('scaleX', $event.target.value, commitScale)" /></label>
          <label class="axis"><span>Y</span><input type="number" step="0.01" :value="form.scaleY" @input="onVecInput('scaleY', $event.target.value, commitScale)" /></label>
          <label class="axis"><span>Z</span><input type="number" step="0.01" :value="form.scaleZ" @input="onVecInput('scaleZ', $event.target.value, commitScale)" /></label>
        </div>
      </div>

      <div class="insp-section" v-if="materials.length">
        <div class="insp-section-label">Material{{ materials.length > 1 ? `s (${materials.length})` : '' }}</div>
        <div class="insp-mat" v-for="m in materials" :key="m.mat.uuid">
          <div class="insp-mat-head">
            <span class="insp-mat-name">{{ m.mat.name || '(unnamed)' }}</span>
            <span class="obj-type">{{ m.mat.type }}</span>
            <span
              v-if="m.users > 1"
              class="insp-mat-shared"
              :title="`Shared material: changes apply to all ${m.users} meshes using it`"
            >{{ m.users }} meshes</span>
            <button v-if="isMatModified(m.mat)" class="insp-add-btn" @click="resetMaterial(m.mat)" title="Restore the values loaded from the GLB">Reset</button>
          </div>
          <div class="insp-row" v-for="f in m.fields" :key="f.key">
            <span class="insp-row-label">{{ f.label }}</span>
            <input
              type="range" min="0" max="1" step="0.01" class="insp-range"
              :value="matValue(m.mat, f.key)"
              @input="setMatValue(m.mat, f.key, $event.target.value)"
            />
            <input
              type="number" min="0" max="1" step="0.01" class="insp-input insp-num"
              :value="matValue(m.mat, f.key)"
              @change="setMatValue(m.mat, f.key, $event.target.value)"
            />
          </div>
          <div v-if="m.fields.length && typeof m.mat.clearcoat !== 'number'" class="insp-mat-note">
            No clearcoat: {{ m.mat.type }} doesn't support it.
          </div>
        </div>
      </div>

      <div class="insp-section">
        <div class="insp-section-label">Custom Properties</div>
        <div class="insp-list">
          <div class="insp-row" v-for="p in customProps" :key="p.key">
            <span class="insp-row-label">
              {{ humanizeKey(p.key) }}
              <span v-if="p.key === 'accType'" class="insp-info" :title="accTypeTooltip(p.value)">ⓘ</span>
            </span>
            <input
              class="insp-input insp-row-input"
              :value="p.raw"
              @change="commitUserDataValue(p.key, $event.target.value)"
            />
            <button class="insp-row-remove" @click="removeUserDataKey(p.key)" title="Remove property">✕</button>
          </div>
          <div class="insp-row insp-row-add">
            <input class="insp-input insp-row-input" v-model="newPropKey" placeholder="Property name" @keyup.enter="addUserDataProp" />
            <input class="insp-input insp-row-input" v-model="newPropValue" placeholder="Value" @keyup.enter="addUserDataProp" />
            <button class="insp-add-btn" :disabled="!newPropKey.trim()" @click="addUserDataProp" title="Add property">+ Add</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inspector-drawer {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  max-height: 46%;
  background: rgba(255,255,255,0.98);
  border-top: 1px solid #e0e0e0;
  box-shadow: 0 -4px 20px rgba(0,0,0,0.12);
  transform: translateY(100%);
  transition: transform 0.22s ease;
  z-index: 20;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}
.inspector-drawer.open { transform: translateY(0); pointer-events: auto; }

.inspector-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid #eee; flex-shrink: 0;
}
.inspector-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.obj-name { font-size: 13px; font-weight: 700; color: #222; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.obj-type { font-size: 11px; color: #999; flex-shrink: 0; }
.inspector-close {
  border: none; background: transparent; cursor: pointer;
  color: #999; font-size: 13px; line-height: 1;
  padding: 4px; border-radius: 4px; flex-shrink: 0;
}
.inspector-close:hover { background: #eee; color: #333; }

.inspector-body { padding: 10px 14px 14px; overflow-y: auto; }

.insp-section { margin-bottom: 14px; }
.insp-section:last-child { margin-bottom: 0; }
.insp-section-label { font-size: 10px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }

.insp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px 14px; }
.insp-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.insp-field-inline { flex-direction: row; align-items: center; gap: 6px; }
.insp-field-wide { grid-column: 1 / -1; }
.insp-label { font-size: 10.5px; color: #888; display: flex; align-items: center; gap: 4px; }
.insp-input {
  font-size: 12px; padding: 4px 6px; border: 1px solid #d9d9d9; border-radius: 5px;
  background: #fff; color: #222; min-width: 0;
}
.insp-input:focus { outline: none; border-color: #4d94ff; box-shadow: 0 0 0 2px rgba(77,148,255,0.15); }
.insp-readonly { font-size: 12px; color: #444; }
.insp-readonly.mono { font-family: ui-monospace, monospace; font-size: 10.5px; color: #777; word-break: break-all; }
.insp-info {
  cursor: help; color: #6a4fc0; font-size: 11px;
}

.insp-list { display: flex; flex-direction: column; gap: 6px; }
.insp-row { display: flex; align-items: center; gap: 8px; width: fit-content; }
.insp-row-label { font-size: 10.5px; color: #888; width: 100px; flex-shrink: 0; display: flex; align-items: center; gap: 4px; }
.insp-row-input { flex: none; width: 190px; }
.insp-row-add .insp-row-input:first-of-type { width: 100px; }
.insp-row-remove {
  border: none; background: transparent; cursor: pointer;
  color: #bbb; font-size: 11px; line-height: 1;
  padding: 4px; border-radius: 4px; flex-shrink: 0;
}
.insp-row-remove:hover { background: #fee; color: #c00; }
.insp-row-add { padding-top: 4px; border-top: 1px dashed #eee; margin-top: 2px; }
.insp-row-add .insp-row-input::placeholder { color: #bbb; }
.insp-add-btn {
  font-size: 11px; font-weight: 600; padding: 4px 9px;
  border: 1px solid #d9d9d9; border-radius: 5px; background: #fff; color: #444;
  cursor: pointer; flex-shrink: 0; white-space: nowrap;
}
.insp-add-btn:hover:not(:disabled) { background: #f2f2f2; border-color: #bbb; }
.insp-add-btn:disabled { opacity: 0.4; cursor: default; }

.insp-mat { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; }
.insp-mat + .insp-mat { border-top: 1px dashed #eee; }
.insp-mat-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
.insp-mat-name { font-size: 12px; font-weight: 600; color: #333; }
.insp-mat-shared { font-size: 10.5px; color: #b07a00; cursor: help; }
.insp-mat-note { font-size: 10.5px; color: #aaa; }
.insp-range { width: 140px; accent-color: #4d94ff; }
.insp-num { width: 64px; flex: none; }

.insp-vec3-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; width: fit-content; }
.insp-vec3-row:last-child { margin-bottom: 0; }
.vec3-label { font-size: 11px; color: #666; width: 70px; flex-shrink: 0; }
.axis { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #aaa; flex: none; }
.axis input {
  width: 64px; flex-shrink: 0; font-size: 12px; padding: 3px 5px;
  border: 1px solid #d9d9d9; border-radius: 5px; background: #fff; color: #222;
}
.axis input:focus { outline: none; border-color: #4d94ff; box-shadow: 0 0 0 2px rgba(77,148,255,0.15); }
</style>
