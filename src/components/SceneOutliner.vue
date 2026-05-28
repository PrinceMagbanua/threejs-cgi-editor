<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { buildTreeFromObject3D } from '../utils/sceneTree.js'
import TreeNode from './TreeNode.vue'

const props = defineProps({
  root: { type: Object, required: false },
  selectedId: { type: String, default: '' },
  sceneVersion: { type: Number, default: 0 },
  highlightedIds: { type: Array, default: () => [] },
})
const emit = defineEmits(['select', 'toggle', 'highlight-toggle', 'add-as-variant', 'clear-highlights'])

const search = ref('')
const searchFocused = ref(false)
const searchRef = ref(null)
const expanded = ref(new Set())
const tree = ref(null)
const treeRef = ref(null)

function rebuild() {
  tree.value = props.root ? buildTreeFromObject3D(props.root) : null
}

watch(() => props.root, (newRoot) => {
  rebuild()
  if (newRoot) {
    nextTick(() => expandAll(tree.value))
  }
}, { immediate: true })

watch(() => props.sceneVersion, rebuild)

function findAncestorIds(node, targetId, ancestors = []) {
  if (node.id === targetId) return ancestors
  for (const child of node.children || []) {
    const result = findAncestorIds(child, targetId, [...ancestors, node.id])
    if (result) return result
  }
  return null
}

watch(() => props.selectedId, (id) => {
  if (!id || !tree.value) return
  const ancestors = findAncestorIds(tree.value, id)
  if (ancestors) ancestors.forEach(aid => expanded.value.add(aid))
  nextTick(() => {
    if (!treeRef.value) return
    const el = treeRef.value.querySelector(`[data-node-id="${id}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  })
})

function isExpanded(id) { return search.value.trim() ? true : expanded.value.has(id) }
function toggleExpand(id) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
}
function expandAll(node) {
  const walk = (n) => { expanded.value.add(n.id); n.children?.forEach(walk) }
  if (node) walk(node)
}
function collapseAll() { expanded.value.clear() }

const filteredTree = computed(() => {
  if (!tree.value) return null
  if (!search.value.trim()) return tree.value
  const q = search.value.toLowerCase()
  const filterNode = (n) => {
    const match = n.name?.toLowerCase().includes(q)
    const kids = (n.children || []).map(filterNode).filter(Boolean)
    if (match || kids.length) return { ...n, children: kids }
    return null
  }
  return filterNode(tree.value)
})

function rowVisible(node) { return node.visible }
function isHighlighted(id) { return props.highlightedIds.includes(id) }
function onToggle(node) { emit('toggle', { id: node.id, value: node.value }) }
function onSelect(id) { emit('select', id) }
function onHighlightToggle(id) { emit('highlight-toggle', id) }

function onCtrlF(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    searchRef.value?.focus()
    searchRef.value?.select()
    searchFocused.value = true
  }
}

onMounted(() => document.addEventListener('keydown', onCtrlF))
onUnmounted(() => document.removeEventListener('keydown', onCtrlF))
</script>

<template>
  <div class="outliner">
    <div class="outliner-controls">
      <input
        ref="searchRef"
        class="search"
        :class="{ flash: searchFocused }"
        v-model="search"
        placeholder="Search Parts/ACC_..."
        autocomplete="off"
        @focus="searchFocused = true"
        @blur="searchFocused = false"
        @animationend="searchFocused = false"
      />
      <button class="small" @click="() => expandAll(tree)">Expand</button>
      <button class="small" @click="collapseAll">Collapse</button>
    </div>

    <!-- Selection action bar -->
    <div v-if="highlightedIds.length > 0" class="selection-bar">
      <span class="sel-count">{{ highlightedIds.length }} selected</span>
      <button class="sel-btn add" @click="$emit('add-as-variant')">+ Add as Variant</button>
      <button class="sel-btn clear" @click="$emit('clear-highlights')">✕ Clear</button>
    </div>

    <div class="tree" ref="treeRef" v-if="filteredTree">
      <TreeNode
        :node="filteredTree"
        :selectedId="selectedId"
        :visible-override="rowVisible"
        :is-expanded="isExpanded"
        :is-highlighted="isHighlighted"
        :search-query="search"
        @toggle="onToggle"
        @select="onSelect"
        @toggle-expand="toggleExpand"
        @highlight-toggle="onHighlightToggle"
      />
    </div>
    <div v-else class="empty">No scene</div>
  </div>
</template>

<style scoped>
.outliner { width: 100%; height: 100%; display: flex; flex-direction: column; background: rgba(255,255,255,0.92); border-left: 1px solid #e7e7e7; }
.outliner-controls { display: flex; align-items: center; gap: 8px; padding: 10px 10px 8px; border-bottom: 1px solid #eee; flex-shrink: 0; }
.search {
  flex: 1;
  padding: 8px 12px;
  border: 1.5px solid #d9d9d9;
  border-radius: 8px;
  font-size: 13px;
  background: #fff;
  color: #222;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.search:focus { outline: none; border-color: #4d94ff; box-shadow: 0 0 0 3px rgba(77,148,255,0.15); }
.search.flash { animation: search-flash 0.4s ease; }

@keyframes search-flash {
  0%   { border-color: #4d94ff; box-shadow: 0 0 0 4px rgba(77,148,255,0.35); }
  60%  { border-color: #4d94ff; box-shadow: 0 0 0 4px rgba(77,148,255,0.35); }
  100% { border-color: #4d94ff; box-shadow: 0 0 0 3px rgba(77,148,255,0.15); }
}

.small { color: black; border: 1px solid #d9d9d9; background: #fff; border-radius: 8px; padding: 6px 8px; font-size: 12px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }

.selection-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; background: #fffbea; border-bottom: 1px solid #f0e4a0;
  flex-shrink: 0;
}
.sel-count { font-size: 11px; color: #a07800; flex: 1; }
.sel-btn {
  font-size: 11px; padding: 3px 8px; border-radius: 6px;
  cursor: pointer; border: 1px solid;
}
.sel-btn.add { background: #111; color: #fff; border-color: #111; }
.sel-btn.add:hover { background: #333; }
.sel-btn.clear { background: #fff; color: #666; border-color: #d0d0d0; }
.sel-btn.clear:hover { background: #fee; color: #c00; border-color: #f99; }

.tree { padding: 8px; overflow: auto; flex: 1; }
.empty { padding: 12px; color: #666; font-size: 13px; }
</style>
