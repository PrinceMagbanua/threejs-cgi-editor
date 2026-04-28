<script setup>
const props = defineProps(['node', 'selectedId', 'visibleOverride', 'isExpanded', 'isHighlighted'])
const emit = defineEmits(['toggle', 'select', 'toggle-expand', 'highlight-toggle'])

function onToggle(event) {
  emit('toggle', { id: props.node.id, value: event.target.checked })
}
function onToggleExpand() { emit('toggle-expand', props.node.id) }
function onSelect() { emit('select', props.node.id) }
function onHighlightToggle() { emit('highlight-toggle', props.node.id) }
</script>

<template>
  <div class="row" :class="{ highlighted: isHighlighted(node.id) }">
    <button class="expand" @click="onToggleExpand">{{ (node.children&&node.children.length)? (isExpanded(node.id)? '▾':'▸') : '' }}</button>
    <input class="cb" type="checkbox" :checked="visibleOverride(node)" @change="onToggle" />
    <div class="label" @click="onSelect">{{ node.name }} <span class="type">{{ node.type }}</span></div>
    <button
      class="hl-btn"
      :class="{ active: isHighlighted(node.id) }"
      @click.stop="onHighlightToggle"
      :title="isHighlighted(node.id) ? 'Remove from selection' : 'Isolate & select'"
    >{{ isHighlighted(node.id) ? '◉ On' : '◎ Isolate' }}</button>
  </div>
  <div v-if="node.children && node.children.length && isExpanded(node.id)" class="children">
    <TreeNode
      v-for="c in node.children"
      :key="c.id"
      :node="c"
      :selectedId="selectedId"
      :visible-override="visibleOverride"
      :is-expanded="isExpanded"
      :is-highlighted="isHighlighted"
      @toggle="$emit('toggle',$event)"
      @select="$emit('select',$event)"
      @toggle-expand="$emit('toggle-expand',$event)"
      @highlight-toggle="$emit('highlight-toggle',$event)"
    />
  </div>
</template>

<style scoped>
.row {
  display: flex; align-items: center; gap: 6px;
  padding: 2px 4px; border-radius: 4px; cursor: default;
  position: relative;
}
.row:hover { background: rgba(0,0,0,0.05); }
.row.highlighted { background: rgba(250,180,0,0.13); }
.row.highlighted:hover { background: rgba(250,180,0,0.22); }
.row .expand { width: 18px; height: 18px; border: none; background: transparent; cursor: pointer; color: #666; flex-shrink: 0; }
.row .cb { cursor: pointer; flex-shrink: 0; }
.row .label { font-size: 13px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.row .type { color: #999; font-size: 11px; margin-left: 6px; }

/* Highlight toggle button */
.hl-btn {
  flex-shrink: 0;
  border: 1px solid #d0d0d0;
  background: #fff;
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 20px;
  color: #666;
  white-space: nowrap;
  display: none;
  align-items: center;
  gap: 3px;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  line-height: 1.4;
}
.row:hover .hl-btn { display: flex; }
.row.highlighted .hl-btn { display: flex; }
.hl-btn:hover { background: #fff8e0; color: #c88000; border-color: #e6a800; }
.hl-btn.active { background: #e6a800; color: #fff; border-color: #c88000; }
.hl-btn.active:hover { background: #c88000; border-color: #a07000; }

.children { padding-left: 18px; }
</style>
