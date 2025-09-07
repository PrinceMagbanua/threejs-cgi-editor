<script setup>
const props = defineProps(['node', 'selectedId', 'visibleOverride', 'isExpanded'])
const emit = defineEmits(['toggle', 'select', 'toggle-expand'])

function onToggle(event) { 
  emit('toggle', { id: props.node.id, value: event.target.checked }) 
}
function onSelect() { emit('select', props.node.id) }
function onToggleExpand() { emit('toggle-expand', props.node.id) }
</script>

<template>
  <div class="row" :class="{ selected: node.id===selectedId }">
    <button class="expand" @click="onToggleExpand">{{ (node.children&&node.children.length)? (isExpanded(node.id)? '▾':'▸') : '' }}</button>
    <input class="cb" type="checkbox" :checked="visibleOverride(node)" @change="onToggle" />
    <div class="label" @click="onSelect">{{ node.name }} <span class="type">{{ node.type }}</span></div>
  </div>
  <div v-if="node.children && node.children.length && isExpanded(node.id)" class="children">
    <TreeNode v-for="c in node.children" :key="c.id" :node="c" :selectedId="selectedId" :visible-override="visibleOverride" :is-expanded="isExpanded" @toggle="$emit('toggle',$event)" @select="$emit('select',$event)" @toggle-expand="$emit('toggle-expand',$event)" />
  </div>
</template>

<style scoped>
.row { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
.row .expand { width: 18px; height: 18px; border: none; background: transparent; cursor: pointer; color: #666; }
.row .cb { cursor: pointer; }
.row .label { cursor: pointer; font-size: 13px; }
.row .type { color: #999; font-size: 11px; margin-left: 6px; }
.row.selected .label { color: #0a7; }
.children { padding-left: 18px; }
</style>

