<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  root: { type: Object, required: false },
  sceneVersion: { type: Number, default: 0 },
})
const emit = defineEmits(['toggle', 'view-in-scene'])

const search = ref('')
const menuOpenFor = ref('')
const infoOpen = ref(false)
const infoBtnRef = ref(null)
const infoPos = ref({ top: 0, left: 0 })
const INFO_POPOVER_WIDTH = 240
const INFO_POPOVER_MAX_HEIGHT = 260
const MOUNTING_NOTE_KEY = 'accessoriesPanel.mountingNoteDismissed'
const mountingNoteDismissed = ref(localStorage.getItem(MOUNTING_NOTE_KEY) === 'true')

function dismissMountingNote() {
  mountingNoteDismissed.value = true
  localStorage.setItem(MOUNTING_NOTE_KEY, 'true')
}

function toggleMenu(uuid) {
  menuOpenFor.value = menuOpenFor.value === uuid ? '' : uuid
}
function closeMenus() { menuOpenFor.value = ''; infoOpen.value = false }
function toggleInfo() {
  if (!infoOpen.value && infoBtnRef.value) {
    const rect = infoBtnRef.value.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const top = spaceBelow >= INFO_POPOVER_MAX_HEIGHT || spaceBelow >= rect.top
      ? rect.bottom + 6
      : Math.max(12, rect.top - INFO_POPOVER_MAX_HEIGHT - 6)
    infoPos.value = {
      top,
      left: Math.min(rect.left, window.innerWidth - INFO_POPOVER_WIDTH - 12),
    }
  }
  infoOpen.value = !infoOpen.value
}
function viewInScene(obj) {
  closeMenus()
  emit('view-in-scene', obj.uuid)
}
onMounted(() => document.addEventListener('click', closeMenus))
onUnmounted(() => document.removeEventListener('click', closeMenus))

function splitName(name) {
  const m = name?.match(/^(ACC_|PROP_)/)
  if (!m) return { prefix: '', rest: name || '' }
  return { prefix: m[1], rest: name.slice(m[1].length) }
}

// Re-derived every time sceneVersion changes (three objects aren't reactive themselves)
const scan = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  props.sceneVersion
  const accObjects = []
  const propObjects = []
  if (props.root) {
    props.root.traverse((obj) => {
      if (obj.name?.includes('ACC_')) accObjects.push(obj)
      if (obj.name?.includes('PROP_')) propObjects.push(obj)
    })
  }
  return { accObjects, propObjects }
})

const activeAccNames = computed(() => {
  const set = new Set()
  scan.value.accObjects.forEach((o) => { if (o.visible) set.add(o.name) })
  return set
})

// Group props under every accessory they can match, track ones with no match data
const grouped = computed(() => {
  const { accObjects, propObjects } = scan.value
  const byAcc = new Map(accObjects.map((acc) => [acc.name, { acc, props: [] }]))
  const unmatched = []

  propObjects.forEach((prop) => {
    const matches = prop.userData?.matches
    if (!Array.isArray(matches) || matches.length === 0) {
      unmatched.push(prop)
      return
    }
    let attached = false
    matches.forEach((m) => {
      const entry = byAcc.get(m)
      if (entry) {
        entry.props.push(prop)
        attached = true
      }
    })
    if (!attached) unmatched.push(prop)
  })

  return { byAcc, unmatched }
})

function propStatus(prop, accName) {
  const active = activeAccNames.value.has(accName)
  if (!active) return { state: 'inactive', label: 'shows if this accessory is selected' }

  const conflicts = prop.userData?.conflicts
  if (Array.isArray(conflicts)) {
    const hit = conflicts.find((c) => activeAccNames.value.has(c) && c !== accName)
    if (hit) return { state: 'suppressed', label: `hidden — conflicts with ${hit}` }
  }
  return { state: 'shown', label: 'shown' }
}

const filteredAccEntries = computed(() => {
  const entries = Array.from(grouped.value.byAcc.values())
  const q = search.value.trim().toLowerCase()
  const filtered = q
    ? entries.filter((e) => e.acc.name.toLowerCase().includes(q) || e.props.some((p) => p.name.toLowerCase().includes(q)))
    : entries
  return filtered.sort((a, b) => a.acc.name.localeCompare(b.acc.name))
})

const unmatchedProps = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = grouped.value.unmatched
  return (q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
})

function recomputePropsVisibility() {
  const activeNames = new Set()
  scan.value.accObjects.forEach((o) => { if (o.visible) activeNames.add(o.name) })

  scan.value.propObjects.forEach((prop) => {
    const matches = prop.userData?.matches
    let desired = false
    if (Array.isArray(matches) && matches.length) {
      desired = matches.some((m) => activeNames.has(m))
      if (desired) {
        const conflicts = prop.userData?.conflicts
        if (Array.isArray(conflicts) && conflicts.some((c) => activeNames.has(c))) {
          desired = false
        }
      }
    }
    if (!!prop.visible !== desired) {
      emit('toggle', { id: prop.uuid, value: desired })
    }
  })
}

function onRowClick(e, acc) {
  if (e.target.closest('.row-menu')) return
  onAccToggle(acc)
}

function onAccToggle(acc) {
  // acc.visible is mutated synchronously by the parent's toggle handler,
  // so it can be read immediately after emitting to resolve prop matches/conflicts.
  emit('toggle', { id: acc.uuid, value: !acc.visible })
  recomputePropsVisibility()
}
</script>

<template>
  <div class="accessories-panel">
    <div class="controls">
      <input
        class="search"
        v-model="search"
        placeholder="Search ACC_/PROP_..."
        autocomplete="off"
      />
    </div>

    <div class="list" v-if="root">
      <div class="mounting-note" v-if="!mountingNoteDismissed">
        <span class="mounting-note-text">
          Note: the real Accessories Precom component has extra logic to also combine/display an accessory's mounting part — that isn't reproduced here since we don't have access to that API, so some accessories/parts will appear floating.
        </span>
        <button class="mounting-note-close" @click="dismissMountingNote" title="Dismiss">✕</button>
      </div>

      <div class="empty" v-if="!filteredAccEntries.length && !unmatchedProps.length">
        No ACC_/PROP_ objects found in this model.
      </div>

      <div class="acc-row" v-for="entry in filteredAccEntries" :key="entry.acc.uuid">
        <div class="acc-header" :class="{ selected: entry.acc.visible }" @click="onRowClick($event, entry.acc)">
          <input
            type="checkbox"
            :checked="entry.acc.visible"
            @click.stop="onAccToggle(entry.acc)"
          />
          <span class="acc-name">
            <span class="name-prefix">{{ splitName(entry.acc.name).prefix }}</span><span class="name-main">{{ splitName(entry.acc.name).rest }}</span>
          </span>
          <span class="acc-count" v-if="entry.props.length">{{ entry.props.length }} prop{{ entry.props.length !== 1 ? 's' : '' }}</span>
          <div class="row-menu" @click.stop>
            <button class="menu-btn" @click="toggleMenu(entry.acc.uuid)" title="More">⋮</button>
            <div class="menu-dropdown" v-if="menuOpenFor === entry.acc.uuid">
              <button class="menu-item" @click="viewInScene(entry.acc)">View in Scene</button>
            </div>
          </div>
        </div>

        <div class="prop-list" v-if="entry.props.length">
          <div
            class="prop-row"
            v-for="prop in entry.props"
            :key="prop.uuid + entry.acc.uuid"
            :class="propStatus(prop, entry.acc.name).state"
          >
            <span class="prop-dot"></span>
            <span class="prop-name">
              <span class="name-prefix">{{ splitName(prop.name).prefix }}</span><span class="name-main">{{ splitName(prop.name).rest }}</span>
            </span>
            <span class="prop-status">{{ propStatus(prop, entry.acc.name).label }}</span>
            <div class="row-menu" @click.stop>
              <button class="menu-btn" @click="toggleMenu(prop.uuid)" title="More">⋮</button>
              <div class="menu-dropdown" v-if="menuOpenFor === prop.uuid">
                <button class="menu-item" @click="viewInScene(prop)">View in Scene</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="section-divider" v-if="unmatchedProps.length"></div>
      <div class="section-label-row" v-if="unmatchedProps.length">
        <span class="section-label">Unmatched props (no userData.matches)</span>
        <div class="info-wrap" @click.stop>
          <button ref="infoBtnRef" class="info-btn" @click="toggleInfo" title="How to fix">i</button>
          <Teleport to="body">
            <div
              v-if="infoOpen"
              class="info-popover"
              :style="{ top: infoPos.top + 'px', left: infoPos.left + 'px' }"
              @click.stop
            >
              <strong>Why these aren't auto-shown</strong>
              <p>These PROP_ objects have no <code>userData.matches</code> in the GLB, so nothing tells this tool which accessory should reveal them.</p>
              <strong>How to fix</strong>
              <p>On the PROP_ object, add custom properties on export:</p>
              <p><code>matches: ["ACC_N9A04APH01"]</code> means: show this prop when ACC_N9A04APH01 is selected</p>
              <p><code>conflicts: ["ACC_C0A13APH40"]</code> (optional) means: hide this prop when ACC_C0A13APH40 is selected, even if matched</p>
              <p>Re-export the GLB and reload it here.</p>
            </div>
          </Teleport>
        </div>
      </div>
      <div class="prop-row unmatched" v-for="prop in unmatchedProps" :key="prop.uuid">
        <span class="prop-dot"></span>
        <span class="prop-name">
          <span class="name-prefix">{{ splitName(prop.name).prefix }}</span><span class="name-main">{{ splitName(prop.name).rest }}</span>
        </span>
        <span class="prop-status">no match data — never auto-shown</span>
        <div class="row-menu" @click.stop>
          <button class="menu-btn" @click="toggleMenu(prop.uuid)" title="More">⋮</button>
          <div class="menu-dropdown" v-if="menuOpenFor === prop.uuid">
            <button class="menu-item" @click="viewInScene(prop)">View in Scene</button>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty">No scene</div>
  </div>
</template>

<style scoped>
.accessories-panel { width: 100%; height: 100%; display: flex; flex-direction: column; background: rgba(255,255,255,0.92); }
.controls { padding: 10px 10px 8px; border-bottom: 1px solid #eee; flex-shrink: 0; }
.search {
  width: 100%; box-sizing: border-box;
  padding: 8px 12px;
  border: 1.5px solid #d9d9d9;
  border-radius: 8px;
  font-size: 13px;
  background: #fff;
  color: #222;
}
.search:focus { outline: none; border-color: #4d94ff; box-shadow: 0 0 0 3px rgba(77,148,255,0.15); }

.list { flex: 1; overflow: auto; padding: 8px; }
.empty { padding: 12px; color: #666; font-size: 13px; }

.mounting-note {
  display: flex; align-items: flex-start; gap: 8px;
  background: #f2f7ff; border: 1px solid #d6e6fc;
  border-radius: 8px; padding: 8px 10px;
  margin-bottom: 10px;
}
.mounting-note-text { font-size: 11px; line-height: 1.5; color: #3a5a85; flex: 1; }
.mounting-note-close {
  border: none; background: transparent; cursor: pointer;
  color: #7d9cc2; font-size: 12px; line-height: 1;
  flex-shrink: 0; padding: 2px; border-radius: 4px;
}
.mounting-note-close:hover { background: rgba(0,0,0,0.06); color: #3a5a85; }

.acc-row { margin-bottom: 10px; }
.acc-header {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 4px; cursor: pointer; user-select: none;
  border-radius: 6px;
  transition: background 0.1s;
}
.acc-header:hover { background: #f5f5f5; }
.acc-header.selected { background: #eaf2ff; }
.acc-header.selected:hover { background: #ddeaff; }
.acc-header input[type="checkbox"] { width: 14px; height: 14px; accent-color: #111; flex-shrink: 0; }
.acc-name { font-size: 12.5px; color: #222; flex: 1; word-break: break-all; }
.acc-count { font-size: 10px; color: #999; flex-shrink: 0; }

.prop-list { margin-left: 20px; padding-left: 8px; border-left: 1px solid #eee; display: flex; flex-direction: column; gap: 3px; margin-top: 3px; }
.prop-row {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; padding: 2px 4px; border-radius: 4px;
}
.prop-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: #ccc; }
.prop-name { color: #444; word-break: break-all; }
.name-prefix { color: #aaa; font-weight: 400; }
.name-main { color: #222; font-weight: 700; }
.prop-status { color: #999; margin-left: auto; text-align: right; flex-shrink: 0; white-space: nowrap; }

.prop-row.shown .prop-dot { background: #1e7c3a; }
.prop-row.shown .prop-status { color: #1e7c3a; }

.prop-row.suppressed .prop-dot { background: #c0392b; }
.prop-row.suppressed .prop-status { color: #c0392b; }

.prop-row.inactive .prop-dot { background: #ccc; }
.prop-row.inactive .prop-status { color: #aaa; }

.prop-row.unmatched .prop-dot { background: #e0a020; }
.prop-row.unmatched .prop-status { color: #b9860a; }

.section-divider { height: 1px; background: #eee; margin: 6px 4px 8px; }
.section-label-row { display: flex; align-items: center; gap: 4px; padding: 0 4px 6px; }
.section-label { font-size: 10px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.06em; }

.info-wrap { position: relative; }
.info-btn {
  width: 14px; height: 14px;
  border: 1px solid #ccc; background: #fff;
  color: #999; cursor: pointer;
  font-size: 9px; font-style: italic; font-weight: 700;
  border-radius: 50%; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  padding: 0;
}
.info-btn:hover { background: #f2f2f2; color: #555; border-color: #aaa; }
.info-popover {
  position: fixed;
  width: 240px;
  max-height: 260px;
  overflow-y: auto;
  background: #fff; border: 1px solid #e0e0e0;
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.14);
  z-index: 1000; padding: 10px 12px;
  font-size: 11px; line-height: 1.5; color: #444;
  text-transform: none; letter-spacing: normal;
}
.info-popover strong { display: block; font-size: 11px; color: #222; margin: 6px 0 2px; }
.info-popover strong:first-child { margin-top: 0; }
.info-popover p { margin: 2px 0; }
.info-popover code { background: #f2f2f2; color: #b9860a; border-radius: 3px; padding: 1px 4px; font-size: 10.5px; }

.row-menu { position: relative; flex-shrink: 0; }
.menu-btn {
  width: 18px; height: 18px;
  border: none; background: transparent;
  color: #999; cursor: pointer;
  font-size: 13px; line-height: 1;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
}
.menu-btn:hover { background: #eee; color: #333; }
.menu-dropdown {
  position: absolute; right: 0; top: 20px;
  background: #fff; border: 1px solid #e0e0e0;
  border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.12);
  z-index: 5; overflow: hidden; min-width: 110px;
}
.menu-item {
  display: block; width: 100%;
  padding: 6px 10px; border: none; background: none;
  font-size: 11.5px; color: #222; text-align: left; cursor: pointer;
  white-space: nowrap;
}
.menu-item:hover { background: #f2f2f2; }
</style>
