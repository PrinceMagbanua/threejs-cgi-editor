<script setup>
import { computed } from 'vue'

const props = defineProps(['node', 'selectedId', 'visibleOverride', 'isExpanded', 'isHighlighted', 'isMenuOpen', 'searchQuery'])
const emit = defineEmits(['toggle', 'select', 'toggle-expand', 'highlight-toggle', 'menu-toggle', 'inspect'])

function onToggle(event) {
  emit('toggle', { id: props.node.id, value: event.target.checked })
}
function onToggleExpand() { emit('toggle-expand', props.node.id) }
function onSelect() { emit('select', props.node.id) }
function onMenuToggle() { emit('menu-toggle', props.node.id) }
function onIsolateClick() {
  emit('menu-toggle', props.node.id)
  emit('highlight-toggle', props.node.id)
}
function onInspectClick() {
  emit('menu-toggle', props.node.id)
  emit('inspect', props.node.id)
}

const nameParts = computed(() => {
  const name = props.node.name || ''
  const q = props.searchQuery?.trim()
  if (!q) return [{ text: name, highlight: false }]
  const lower = name.toLowerCase()
  const lowerQ = q.toLowerCase()
  const parts = []
  let cursor = 0
  let idx
  while ((idx = lower.indexOf(lowerQ, cursor)) !== -1) {
    if (idx > cursor) parts.push({ text: name.slice(cursor, idx), highlight: false })
    parts.push({ text: name.slice(idx, idx + q.length), highlight: true })
    cursor = idx + q.length
  }
  if (cursor < name.length) parts.push({ text: name.slice(cursor), highlight: false })
  return parts
})
</script>

<template>
  <div class="row" :class="{ highlighted: isHighlighted(node.id), selected: node.id === selectedId }" :data-node-id="node.id">
    <button class="expand" @click="onToggleExpand">{{ (node.children&&node.children.length)? (isExpanded(node.id)? '▾':'▸') : '' }}</button>
    <input class="cb" type="checkbox" :checked="visibleOverride(node)" @change="onToggle" />
    <div class="label" @click="onSelect">
      <template v-for="(part, i) in nameParts" :key="i">
        <mark v-if="part.highlight" class="match-highlight">{{ part.text }}</mark>
        <span v-else>{{ part.text }}</span>
      </template>
      <span class="type">{{ node.type }}</span>
    </div>
    <div class="row-menu" :class="{ open: isMenuOpen(node.id) }" @click.stop>
      <button class="menu-btn" @click="onMenuToggle" title="More">⋮</button>
      <div class="menu-dropdown" v-if="isMenuOpen(node.id)">
        <button class="menu-item" @click="onIsolateClick">{{ isHighlighted(node.id) ? '◉ Remove from Isolation' : '◎ Isolate' }}</button>
        <button class="menu-item" @click="onInspectClick">Inspect Details</button>
      </div>
    </div>
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
      :is-menu-open="isMenuOpen"
      :search-query="searchQuery"
      @toggle="$emit('toggle',$event)"
      @select="$emit('select',$event)"
      @toggle-expand="$emit('toggle-expand',$event)"
      @highlight-toggle="$emit('highlight-toggle',$event)"
      @menu-toggle="$emit('menu-toggle',$event)"
      @inspect="$emit('inspect',$event)"
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
.row.selected { background: rgba(0,100,255,0.08); border-left: 2px solid #0064ff; }
.row.selected:hover { background: rgba(0,100,255,0.13); }
.row.highlighted { background: rgba(250,180,0,0.13); }
.row.highlighted:hover { background: rgba(250,180,0,0.22); }
.row .expand { width: 18px; height: 18px; border: none; background: transparent; cursor: pointer; color: #666; flex-shrink: 0; }
.row .cb { cursor: pointer; flex-shrink: 0; }
.row .label { font-size: 13px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.row .type { color: #999; font-size: 11px; margin-left: 6px; }

.match-highlight {
  background: #ffe066;
  color: #5a3e00;
  border-radius: 2px;
  padding: 0 1px;
}

/* Row context menu (⋮ → Isolate / Inspect Details) */
.row-menu { position: relative; flex-shrink: 0; display: none; }
.row:hover .row-menu, .row-menu.open { display: block; }
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
  z-index: 20; overflow: hidden; min-width: 150px;
}
.menu-item {
  display: block; width: 100%;
  padding: 6px 10px; border: none; background: none;
  font-size: 11.5px; color: #222; text-align: left; cursor: pointer;
  white-space: nowrap;
}
.menu-item:hover { background: #f2f2f2; }

.children { padding-left: 18px; }
</style>
