<script setup>
import { ref, computed, watch } from 'vue'
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
const expanded = ref(new Set())
const tree = ref(null)

function rebuild() {
  tree.value = props.root ? buildTreeFromObject3D(props.root) : null
}

watch(() => [props.root, props.sceneVersion], rebuild, { immediate: true })

function isExpanded(id) { return expanded.value.has(id) }
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
</script>

<template>
  <div class="outliner">
    <div class="outliner-controls">
      <input class="search" v-model="search" placeholder="Search scene..." />
      <div class="spacer"></div>
      <button class="small" @click="() => expandAll(tree)">Expand</button>
      <button class="small" @click="collapseAll">Collapse</button>
    </div>

    <!-- Selection action bar -->
    <div v-if="highlightedIds.length > 0" class="selection-bar">
      <span class="sel-count">{{ highlightedIds.length }} selected</span>
      <button class="sel-btn add" @click="$emit('add-as-variant')">+ Add as Variant</button>
      <button class="sel-btn clear" @click="$emit('clear-highlights')">✕ Clear</button>
    </div>

    <div class="tree" v-if="filteredTree">
      <TreeNode
        :node="filteredTree"
        :selectedId="selectedId"
        :visible-override="rowVisible"
        :is-expanded="isExpanded"
        :is-highlighted="isHighlighted"
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
.outliner-controls { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid #eee; flex-shrink: 0; }
.search { flex: 1; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 8px; font-size: 13px; background: #fff; color: #222; }
.small { color: black; border: 1px solid #d9d9d9; background: #fff; border-radius: 8px; padding: 6px 8px; font-size: 12px; cursor: pointer; }
.spacer { flex: 1; }

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
