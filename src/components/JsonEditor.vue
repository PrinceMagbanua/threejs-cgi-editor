<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const props = defineProps({
  jsonConfig: { type: Object, default: null },
  sceneObjectNames: { type: Array, default: () => [] },
  jsonFileName: { type: String, default: '' },
})

const emit = defineEmits(['focus-object', 'json-updated', 'preview-part', 'restore-scene', 'preview-variant', 'preview-parts'])

const localOptions = ref([])
const localAliases = ref([])
const isDirty = ref(false)
const expandedOption = ref(null)
const aliasSearch = ref('')

// Export filename — derived from uploaded file, then persisted across exports
const exportFileName = ref('config')
watch(() => props.jsonFileName, (name) => {
  if (name) exportFileName.value = name.replace(/\.json$/i, '')
}, { immediate: true })

// Bulk-add modal
const showBulkModal = ref(false)
const bulkText = ref('')
const bulkResult = ref(null) // null = input phase, object = result phase

function openBulkModal() {
  bulkText.value = ''
  bulkResult.value = null
  showBulkModal.value = true
}

function cleanBulkName(raw) {
  return raw.trim().replace(/[."'`]/g, '')
}

const bulkParsed = computed(() => {
  const existing = new Set(localAliases.value.map(a => a.glbName))
  const sceneSet = new Set(props.sceneObjectNames)
  const hasScene = props.sceneObjectNames.length > 0
  const seen = new Set()
  const toAdd = []
  let dupeCount = 0

  for (const raw of bulkText.value.split(/[\n,]+/)) {
    const name = cleanBulkName(raw)
    if (!name) continue
    if (existing.has(name) || seen.has(name)) { dupeCount++; continue }
    seen.add(name)
    toAdd.push({ name, inScene: !hasScene || sceneSet.has(name) })
  }

  const willAdd = toAdd.filter(e => e.inScene)
  const willSkip = toAdd.filter(e => !e.inScene)
  return { toAdd, willAdd, willSkip, dupeCount, hasScene }
})

const bulkNewCount = computed(() => bulkParsed.value.willAdd.length)
const bulkDuplicateCount = computed(() => bulkParsed.value.dupeCount)

function confirmBulkAdd() {
  const { willAdd, willSkip, hasScene } = bulkParsed.value
  ;[...willAdd].reverse().forEach(({ name }) => {
    localAliases.value.unshift({ alias: suggestAlias(name), glbName: name })
  })
  if (willAdd.length) markDirtyAndEmit()

  if (hasScene && willSkip.length > 0) {
    bulkResult.value = {
      added: willAdd.length,
      missing: willSkip.map(e => e.name),
    }
  } else {
    showBulkModal.value = false
  }
}

const DEFAULT_LIGHTS = [
  { x: '-10', y: '1', z: '0', intensity: '1' },
  { x: '10',  y: '1', z: '0', intensity: '1' },
  { x: '0',   y: '1', z: '10', intensity: '1' },
  { x: '0',   y: '1', z: '-10', intensity: '1' },
]

function resetWithConfig(cfg) {
  if (cfg) {
    localOptions.value = (cfg.options || []).map(o => ({
      name: o.name || '',
      variant: o.conditions?.variant || '',
      optionPackToggle: !!o.conditions?.optionPackToggle,
      visibleObjs: [...(o.visibleObjs || [])],
    }))
    localAliases.value = Object.entries(cfg.objectNames || {}).map(([alias, glbName]) => ({ alias, glbName }))
  } else {
    localOptions.value = []
    localAliases.value = []
  }
  isDirty.value = false
}

onMounted(() => { if (props.jsonConfig) resetWithConfig(props.jsonConfig) })

function addOptionFromScene({ name, variant, optionPackToggle, glbNames }) {
  const visibleObjs = localAliases.value
    .filter(a => glbNames.includes(a.glbName) && a.alias)
    .map(a => a.alias)
  if (expandedOption.value !== null) expandedOption.value++
  localOptions.value.unshift({ name, variant, optionPackToggle: !!optionPackToggle, visibleObjs })
  expandedOption.value = 0
  markDirtyAndEmit()
}

defineExpose({ isDirty: () => isDirty.value, resetWithConfig, addOptionFromScene })

function buildJsonOutput() {
  const objectNames = {}
  localAliases.value.forEach(({ alias, glbName }) => {
    if (alias && glbName) objectNames[alias] = glbName
  })
  const options = localOptions.value.map(opt => ({
    name: opt.name,
    conditions: { optionPackToggle: opt.optionPackToggle, variant: opt.variant },
    visibleObjs: [...opt.visibleObjs],
  }))
  return { lightPositions: DEFAULT_LIGHTS, options, objectNames }
}

function markDirtyAndEmit() {
  isDirty.value = true
  emit('json-updated', buildJsonOutput())
}

const filteredAliases = computed(() => {
  const q = aliasSearch.value.trim().toLowerCase()
  if (!q) return localAliases.value
  return localAliases.value.filter(a =>
    a.alias.toLowerCase().includes(q) || a.glbName.toLowerCase().includes(q)
  )
})

const aliasKeys = computed(() => localAliases.value.map(a => a.alias).filter(Boolean))
const aliasGlbSet = computed(() => new Set(localAliases.value.map(a => a.glbName)))

function addOption() {
  if (expandedOption.value !== null) expandedOption.value++
  localOptions.value.unshift({ name: '', variant: '', optionPackToggle: false, visibleObjs: [] })
  expandedOption.value = 0
  markDirtyAndEmit()
}

function removeOption(i) {
  localOptions.value.splice(i, 1)
  if (expandedOption.value === i) {
    expandedOption.value = null
    emit('restore-scene')
  } else if (expandedOption.value > i) {
    expandedOption.value--
  }
  markDirtyAndEmit()
}

function toggleExpand(i) {
  if (expandedOption.value === i) {
    expandedOption.value = null
    emit('restore-scene')
  } else {
    expandedOption.value = i
    const opt = localOptions.value[i]
    if (opt.variant) emit('preview-variant', { variant: opt.variant, optionPackToggle: opt.optionPackToggle })
  }
}

function toggleVisibleObj(opt, alias, checked) {
  if (checked && !opt.visibleObjs.includes(alias)) {
    opt.visibleObjs.push(alias)
  } else if (!checked) {
    opt.visibleObjs = opt.visibleObjs.filter(a => a !== alias)
  }
  markDirtyAndEmit()
}

function addAlias() {
  localAliases.value.unshift({ alias: '', glbName: '' })
  markDirtyAndEmit()
}

function removeAlias(aliasObj) {
  const i = localAliases.value.indexOf(aliasObj)
  if (i !== -1) localAliases.value.splice(i, 1)
  markDirtyAndEmit()
}

// SmartCase: convert GLB_OBJECT_NAME → glbObjectName
const STRIP_PREFIXES = /^(VARIANTGROUP_?|VARIANTS?_?|VARIANT_?|STOCK_?|OPTION_?|MAT_?|GRP_?|GROUP_?)/i

function suggestAlias(glbName) {
  if (!glbName) return ''
  let s = glbName.replace(STRIP_PREFIXES, '')
  if (!s) s = glbName
  const parts = s.split(/[_\-\s\.]+/).filter(Boolean)
  if (!parts.length) return ''
  return parts[0].toLowerCase() +
    parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('')
}

// Autocomplete for 3D Object Name (alias rows)
const activeAcAlias = ref(null)
let acCloseTimer = null

const acOptions = computed(() => {
  if (!activeAcAlias.value || !props.sceneObjectNames.length) return []
  const q = (activeAcAlias.value.glbName || '').toLowerCase()
  if (!q) return props.sceneObjectNames
  return props.sceneObjectNames.filter(n => n.toLowerCase().includes(q))
})

function openAc(al) {
  clearTimeout(acCloseTimer)
  activeAcAlias.value = al
}

function scheduleCloseAc() {
  acCloseTimer = setTimeout(() => {
    activeAcAlias.value = null
    emit('restore-scene')
  }, 150)
}

function selectAcOption(al, opt) {
  if (!al.alias) al.alias = suggestAlias(opt)
  al.glbName = opt
  activeAcAlias.value = null
  markDirtyAndEmit()
}

// Validation: find visibleObjs entries with no matching alias+glbName
const exportIssues = computed(() => {
  const validAliases = new Set(
    localAliases.value.filter(a => a.alias && a.glbName).map(a => a.alias)
  )
  return localOptions.value
    .map((opt, i) => ({
      index: i,
      name: opt.name || '(unnamed)',
      missing: opt.visibleObjs.filter(a => !validAliases.has(a)),
    }))
    .filter(iss => iss.missing.length > 0)
})

function exportJson() {
  // Strip broken refs from editor state before exporting
  if (exportIssues.value.length) {
    const validAliases = new Set(
      localAliases.value.filter(a => a.alias && a.glbName).map(a => a.alias)
    )
    localOptions.value.forEach(opt => {
      opt.visibleObjs = opt.visibleObjs.filter(a => validAliases.has(a))
    })
    markDirtyAndEmit()
  }

  const data = buildJsonOutput()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const fname = (exportFileName.value || 'config').replace(/\.json$/i, '')
  a.download = `${fname}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Toggle-preview state for alias rows
const toggledParts = ref(new Set())

function toggleShowPart(al) {
  if (!al.glbName) return
  if (toggledParts.value.has(al.glbName)) {
    toggledParts.value.delete(al.glbName)
  } else {
    toggledParts.value.add(al.glbName)
  }
  toggledParts.value = new Set(toggledParts.value) // trigger reactivity
  const names = [...toggledParts.value]
  if (names.length === 0) {
    emit('restore-scene')
  } else {
    emit('preview-parts', names)
  }
}
function onAcOptionEnter(opt) {
  emit('preview-part', opt)
}

// Search field autocomplete — shows sceneObjectNames with Add/Added state
const aliasSearchFocused = ref(false)
let searchAcCloseTimer = null

const searchAcOptions = computed(() => {
  if (!aliasSearchFocused.value || !props.sceneObjectNames.length) return []
  const q = aliasSearch.value.trim().toLowerCase()
  const list = q
    ? props.sceneObjectNames.filter(n => n.toLowerCase().includes(q))
    : props.sceneObjectNames
  return list.slice(0, 14)
})

function onSearchFocus() {
  clearTimeout(searchAcCloseTimer)
  aliasSearchFocused.value = true
}

function scheduleCloseSearchAc() {
  searchAcCloseTimer = setTimeout(() => {
    aliasSearchFocused.value = false
  }, 150)
}

function addPartFromSearch(glbName) {
  if (aliasGlbSet.value.has(glbName)) return
  localAliases.value.unshift({ alias: suggestAlias(glbName), glbName })
  markDirtyAndEmit()
}

function onSearchAcEnter(glbName) {
  emit('preview-part', glbName)
}
function onSearchAcLeave() {
  emit('restore-scene')
}
</script>

<template>
  <div class="json-editor">

    <!-- Section A: Variant Options -->
    <section class="editor-section">
      <div class="section-header">
        <span class="section-title">Variant Options</span>
        <button class="add-btn" @click="addOption">+ Add Option</button>
      </div>

      <div v-if="localOptions.length === 0" class="empty-state">No options yet. Add one above.</div>

      <div
        v-for="(opt, i) in localOptions"
        :key="i"
        class="option-card"
        :class="{ 'option-card--expanded': expandedOption === i }"
      >
        <div class="option-header" @click="toggleExpand(i)">
          <span class="option-name">{{ opt.name || '(unnamed)' }}</span>
          <span class="option-tag" v-if="opt.variant">{{ opt.variant }}{{ opt.optionPackToggle ? ' + Pack' : '' }}</span>
          <span v-if="expandedOption === i" class="previewing-badge">Previewing</span>
          <div class="option-actions">
            <button class="icon-btn danger" @click.stop="removeOption(i)" title="Delete">✕</button>
            <span class="chevron">{{ expandedOption === i ? '▾' : '▸' }}</span>
          </div>
        </div>

        <div v-if="expandedOption === i" class="option-body">
          <div class="field">
            <label class="field-label">Display Name</label>
            <input class="field-input" v-model="opt.name" @input="markDirtyAndEmit" placeholder="e.g. Kona NLine" />
          </div>

          <div class="field">
            <label class="field-label">
              Variant Name
              <span class="field-hint field-hint-important">SubGroup Name in PCM2</span>
            </label>
            <input class="field-input" v-model="opt.variant" @input="markDirtyAndEmit" placeholder="e.g. Kona" />
          </div>

          <div class="field field-row">
            <input type="checkbox" :id="`pack-${i}`" v-model="opt.optionPackToggle" @change="markDirtyAndEmit" />
            <label :for="`pack-${i}`" class="field-label inline">Option Pack Toggle</label>
          </div>

          <div class="field">
            <label class="field-label">Visible Objects</label>
            <div v-if="aliasKeys.length === 0" class="field-hint">Add Model 3D Parts below first.</div>
            <div v-else class="visible-objs-grid">
              <label v-for="key in aliasKeys" :key="key" class="obj-check">
                <input
                  type="checkbox"
                  :checked="opt.visibleObjs.includes(key)"
                  @change="toggleVisibleObj(opt, key, $event.target.checked)"
                />
                <span>{{ key }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section B: Model 3D Parts -->
    <section class="editor-section">
      <div class="section-header">
        <span class="section-title">Model 3D Parts</span>
        <button class="add-btn" @click="addAlias">+ Add Part</button>
        <button class="add-btn" @click="openBulkModal">+ Add Parts List</button>
      </div>

      <div class="alias-search-row">
        <div class="alias-search-wrap">
          <input
            v-model="aliasSearch"
            class="alias-search"
            placeholder="Search parts..."
            autocomplete="off"
            @focus="onSearchFocus"
            @blur="scheduleCloseSearchAc"
            @input="onSearchFocus"
          />
          <div v-if="aliasSearchFocused && searchAcOptions.length" class="search-ac-dropdown">
            <div
              v-for="name in searchAcOptions"
              :key="name"
              class="search-ac-option"
              @mouseenter="onSearchAcEnter(name)"
              @mouseleave="onSearchAcLeave"
            >
              <span class="search-ac-name">{{ name }}</span>
              <button
                v-if="!aliasGlbSet.has(name)"
                class="search-ac-add-btn"
                @mousedown.prevent="addPartFromSearch(name)"
                title="Add to parts list"
              >+ Add</button>
              <span v-else class="search-ac-added">Added</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="localAliases.length === 0" class="empty-state">No parts yet. Add one above.</div>

      <div v-else class="alias-table">
        <div class="alias-header-row">
          <span>3D Object</span>
          <span>Part Alias/Nickname</span>
          <span></span>
          <span></span>
        </div>
        <div
          v-for="al in filteredAliases"
          :key="al"
          class="alias-row"
        >
        <div class="ac-wrap">
            <input
              class="alias-input"
              v-model="al.glbName"
              @focus="openAc(al)"
              @blur="scheduleCloseAc()"
              @input="openAc(al); markDirtyAndEmit()"
              placeholder="3D Object name"
              autocomplete="off"
            />
            <div v-if="activeAcAlias === al && acOptions.length" class="ac-dropdown">
              <div
                v-for="opt in acOptions"
                :key="opt"
                class="ac-option"
                @mousedown.prevent="selectAcOption(al, opt)"
                @mouseenter="onAcOptionEnter(opt)"
              >{{ opt }}</div>
            </div>
          </div>
          <input
            class="alias-input"
            v-model="al.alias"
            @input="markDirtyAndEmit"
            placeholder="partName"
          />

          <button
            class="icon-btn show-part-btn"
            :class="{ active: toggledParts.has(al.glbName) }"
            @click="toggleShowPart(al)"
            title="Show part"
          >👁</button>
          <button class="icon-btn danger" @click="removeAlias(al)" title="Remove">✕</button>
        </div>
      </div>
    </section>

    <!-- Section C: Export -->
    <section class="editor-section export-section">
      <div class="export-info">
        Exports a <code>.json</code> config with default light positions, your options, and parts.
      </div>


      <div class="export-row">
        <div class="export-filename-wrap">
          <input
            class="export-filename-input"
            v-model="exportFileName"
            placeholder="config"
            spellcheck="false"
          />
          <span class="export-filename-ext">.json</span>
        </div>
        <button class="export-btn" @click="exportJson">Export JSON</button>
      </div>
    </section>

  </div>

  <!-- Bulk add modal -->
  <teleport to="body">
    <div v-if="showBulkModal" class="bulk-overlay" @click.self="showBulkModal = false">
      <div class="bulk-modal">
        <div class="bulk-header">
          <span class="bulk-title">{{ bulkResult ? 'Parts Added' : 'Add Parts List' }}</span>
          <button class="bulk-close" @click="showBulkModal = false">✕</button>
        </div>

        <!-- Input phase -->
        <template v-if="!bulkResult">
          <div class="bulk-body">
            <p class="bulk-hint">Paste 3D object names — one per line or comma-separated. Empty lines and duplicates are ignored. Part names are auto-generated via SmartCase.</p>
            <textarea
              class="bulk-textarea"
              v-model="bulkText"
              placeholder="STOCK_BODYKIT&#10;VARIANTGROUP_WHEELS&#10;STOCK_HEADLIGHTS"
              rows="12"
              autofocus
            ></textarea>
            <div class="bulk-preview" v-if="bulkText.trim()">
              <span class="preview-add">{{ bulkNewCount }} to add</span>
              <template v-if="bulkParsed.hasScene">
                <span v-if="bulkParsed.willSkip.length === 0 && bulkNewCount > 0" class="preview-ok"> · all found in scene ✓</span>
                <span v-else-if="bulkParsed.willSkip.length > 0" class="preview-warn"> · {{ bulkParsed.willSkip.length }} not in scene (won't be added)</span>
              </template>
              <span v-if="bulkDuplicateCount > 0" class="preview-skip"> · {{ bulkDuplicateCount }} duplicate{{ bulkDuplicateCount !== 1 ? 's' : '' }} skipped</span>
            </div>
          </div>
          <div class="bulk-footer">
            <button class="bulk-btn cancel" @click="showBulkModal = false">Cancel</button>
            <button class="bulk-btn confirm" @click="confirmBulkAdd" :disabled="bulkNewCount === 0">Add Parts</button>
          </div>
        </template>

        <!-- Result phase (only shown when some parts were missing in scene) -->
        <template v-else>
          <div class="bulk-body">
            <div class="result-summary">
              <span class="result-ok">✓ {{ bulkResult.added }} part{{ bulkResult.added !== 1 ? 's' : '' }} added</span>
            </div>
            <div class="result-warn-block">
              <div class="result-warn-title">⚠ {{ bulkResult.missing.length }} object{{ bulkResult.missing.length !== 1 ? 's' : '' }} not found in the loaded 3D model:</div>
              <div class="result-missing-list">
                <div v-for="name in bulkResult.missing" :key="name" class="result-missing-item">{{ name }}</div>
              </div>
              <p class="result-warn-note">These were not added. Check the object names match exactly what's in your GLB file.</p>
            </div>
          </div>
          <div class="bulk-footer">
            <button class="bulk-btn confirm" @click="showBulkModal = false">Got it</button>
          </div>
        </template>

      </div>
    </div>
  </teleport>
</template>

<style scoped>
.json-editor {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: rgba(255,255,255,0.92);
}

.editor-section {
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #444;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.add-btn {
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  color: #222;
  white-space: nowrap;
  flex-shrink: 0;
}
.add-btn:hover { background: #f5f5f5; }

.empty-state {
  font-size: 12px;
  color: #999;
  padding: 4px 0;
}

/* Option cards */
.option-card {
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  margin-bottom: 6px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.option-card--expanded {
  border-color: #1a73e8;
  box-shadow: 0 0 0 2px rgba(26,115,232,0.15);
}

.option-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  background: #fafafa;
  user-select: none;
}
.option-header:hover { background: #f0f0f0; }
.option-card--expanded .option-header { background: #f0f5ff; }

.option-name { font-size: 13px; font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.option-tag { font-size: 11px; color: #666; background: #eee; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
.option-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.chevron { font-size: 11px; color: #999; }

.previewing-badge {
  font-size: 10px;
  font-weight: 600;
  color: #1a73e8;
  background: #e8f0fe;
  padding: 2px 7px;
  border-radius: 10px;
  white-space: nowrap;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.option-body {
  padding: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid #d2e3fc;
}

/* Fields */
.field { display: flex; flex-direction: column; gap: 4px; }
.field-row { flex-direction: row; align-items: center; gap: 8px; }
.field-label { font-size: 11px; font-weight: 600; color: #555; display: flex; align-items: center; gap: 6px; }
.field-label.inline { font-size: 12px; font-weight: 400; }
.field-hint { font-size: 10px; color: #999; }
.field-hint-important { font-size: 10px; color: #e06c00; background: #fff8f0; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
.field-input {
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
  color: #222;
  background: #fff;
}
.field-input:focus { outline: none; border-color: #aaa; }

.visible-objs-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  max-height: 140px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 6px;
}
.obj-check {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Parts search row */
.alias-search-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.alias-search-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.alias-search {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  color: #222;
  background: #fff;
}
.alias-search:focus { outline: none; border-color: #aaa; }

/* Search autocomplete */
.search-ac-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.13);
  max-height: 220px;
  overflow-y: auto;
  z-index: 50;
}

.search-ac-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: default;
  transition: background 0.1s;
}
.search-ac-option:hover { background: #f0f5ff; }

.search-ac-name {
  font-size: 12px;
  color: #222;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-ac-add-btn {
  font-size: 11px;
  font-weight: 600;
  color: #1a73e8;
  background: #e8f0fe;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.12s;
}
.search-ac-add-btn:hover { background: #c5d8fc; }

.search-ac-added {
  font-size: 11px;
  color: #888;
  background: #f0f0f0;
  border-radius: 4px;
  padding: 2px 7px;
  white-space: nowrap;
  flex-shrink: 0;
}

.alias-table { display: flex; flex-direction: column; gap: 4px; }

.alias-header-row {
  display: grid;
  grid-template-columns: 1fr 1fr 24px 24px;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 2px 4px;
}

.alias-row {
  display: grid;
  grid-template-columns: 1fr 1fr 24px 24px;
  gap: 6px;
  align-items: center;
  padding: 3px 2px;
  border-radius: 6px;
  transition: background 0.15s;
  overflow: visible;
}
.alias-row:hover { background: #f5f9ff; }

.alias-input {
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  color: #222;
  background: #fff;
}
.alias-input:focus { outline: none; border-color: #aaa; }

.ac-wrap {
  position: relative;
  min-width: 0;
}

.ac-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  max-height: 180px;
  overflow-y: auto;
  z-index: 50;
}

.ac-option {
  padding: 6px 10px;
  font-size: 12px;
  color: #222;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-option:hover { background: #f0f4ff; color: #0055cc; }

/* Icon buttons */
.icon-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: transparent;
}
.icon-btn.danger { color: #999; }
.icon-btn.danger:hover { background: #fee; color: #c00; }
.icon-btn.show-part-btn { color: #aaa; font-size: 13px; }
.icon-btn.show-part-btn:hover { background: #eef4ff; color: #0055cc; }
.icon-btn.show-part-btn.active { color: #0055cc; background: #ddeeff; }

/* Export */
.export-section { display: flex; flex-direction: column; gap: 8px; }
.export-info { font-size: 11px; color: #888; }
.export-info code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }


.export-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.export-filename-wrap {
  display: flex;
  align-items: center;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
  flex: 1;
  min-width: 0;
  max-width: 180px;
}

.export-filename-input {
  border: none;
  outline: none;
  padding: 6px 8px;
  font-size: 12px;
  color: #222;
  background: transparent;
  flex: 1;
  min-width: 0;
}

.export-filename-ext {
  font-size: 12px;
  color: #999;
  padding: 0 8px 0 0;
  white-space: nowrap;
  user-select: none;
}

.export-btn {
  padding: 7px 14px;
  background: #111;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s;
}
.export-btn:hover { background: #333; }

/* Header button group */
.header-btns { display: flex; gap: 6px; }
</style>

<style>
.bulk-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.bulk-modal {
  background: #fff;
  border-radius: 12px;
  width: 420px;
  max-width: 94vw;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.bulk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #eee;
}
.bulk-title { font-size: 14px; font-weight: 600; color: #111; }
.bulk-close {
  width: 24px; height: 24px;
  border: none; background: transparent;
  cursor: pointer; font-size: 12px; color: #999; border-radius: 4px;
}
.bulk-close:hover { background: #f0f0f0; color: #333; }
.bulk-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.bulk-hint { font-size: 11px; color: #888; margin: 0; line-height: 1.5; }
.bulk-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  font-family: 'Menlo', 'Consolas', monospace;
  color: #222;
  background: #fff;
  resize: vertical;
  line-height: 1.6;
}
.bulk-textarea:focus { outline: none; border-color: #aaa; }
.bulk-preview { font-size: 11px; font-weight: 600; }
.preview-add { color: #1a73e8; }
.preview-ok { color: #1e7c3a; font-weight: 400; }
.preview-warn { color: #d97706; font-weight: 600; }
.preview-skip { color: #999; font-weight: 400; }

.result-summary { font-size: 13px; font-weight: 600; }
.result-ok { color: #1e7c3a; }
.result-warn-block {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.result-warn-title { font-size: 12px; font-weight: 600; color: #92400e; }
.result-missing-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 160px;
  overflow-y: auto;
}
.result-missing-item {
  font-size: 11px;
  font-family: 'Menlo', 'Consolas', monospace;
  color: #92400e;
  background: #fef3c7;
  padding: 2px 6px;
  border-radius: 4px;
}
.result-warn-note { font-size: 11px; color: #a16207; margin: 0; }
.bulk-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #eee;
}
.bulk-btn {
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid;
}
.bulk-btn.cancel { background: #fff; color: #444; border-color: #d9d9d9; }
.bulk-btn.cancel:hover { background: #f5f5f5; }
.bulk-btn.confirm { background: #111; color: #fff; border-color: #111; }
.bulk-btn.confirm:hover { background: #333; }
.bulk-btn.confirm:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
