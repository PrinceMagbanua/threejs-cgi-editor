<script setup>
import { ref, computed, watch } from 'vue'
import { buildTreeFromObject3D } from '../utils/sceneTree.js'
import TreeNode from './TreeNode.vue'

const props = defineProps({
  root: { type: Object, required: false },
  selectedId: { type: String, default: '' },
  visibilityOverrides: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['select', 'toggle'])

const search = ref('')
const expanded = ref(new Set())
const tree = ref(null)

function rebuild() {
  tree.value = props.root ? buildTreeFromObject3D(props.root) : null
}

watch(() => props.root, rebuild, { immediate: true })

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

function rowVisible(node) {
  const ov = props.visibilityOverrides[node.id]
  return ov !== undefined ? ov : node.visible
}

function onToggle(node, value) {
  emit('toggle', { id: node.id, value })
}

function onSelect(node) { emit('select', node.id) }

</script>

<template>
  <div class="outliner">
    <div class="outliner-controls">
      <input class="search" v-model="search" placeholder="Search scene..." />
      <div class="spacer"></div>
      <button class="small" @click="() => expandAll(tree)">Expand</button>
      <button class="small" @click="collapseAll">Collapse</button>
    </div>
    <div class="tree" v-if="filteredTree">
      <TreeNode :node="filteredTree" :selectedId="selectedId" :visible-override="rowVisible" :is-expanded="isExpanded" @toggle="onToggle" @select="onSelect" @toggle-expand="toggleExpand" />
    </div>
    <div v-else class="empty">No scene</div>
  </div>
</template>

 

<style scoped>
.outliner { width: 320px; height: 100%; display: flex; flex-direction: column; background: rgba(255,255,255,0.92); border-left: 1px solid #e7e7e7; }
.outliner-controls { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid #eee; }
.search { flex: 1; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 8px; font-size: 13px; }
.small { color: black; border: 1px solid #d9d9d9; background: #fff; border-radius: 8px; padding: 6px 8px; font-size: 12px; }
.tree { padding: 8px; overflow: auto; }
.empty { padding: 12px; color: #666; font-size: 13px; }
.row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.row .expand { width: 18px; height: 18px; border: none; background: transparent; cursor: pointer; color: #666; }
.row .cb { cursor: pointer; }
.row .label { cursor: pointer; font-size: 13px; }
.row .type { color: #999; font-size: 11px; margin-left: 6px; }
.row.selected .label { color: #0a7; }
.children { padding-left: 18px; }
</style>

