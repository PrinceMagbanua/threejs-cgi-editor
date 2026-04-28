<script setup>
import { ref } from 'vue'
import SceneOutliner from './SceneOutliner.vue'
import JsonEditor from './JsonEditor.vue'

const props = defineProps({
  jsonConfig: { type: Object, default: null },
  sceneObjectNames: { type: Array, default: () => [] },
  jsonFileName: { type: String, default: '' },
  currentModel: { type: Object, required: true },
  selectedNodeId: { type: String, default: '' },
  sceneVersion: { type: Number, default: 0 },
  highlightedIds: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'select', 'toggle', 'focus-object', 'json-updated',
  'tab-change', 'preview-part', 'restore-scene', 'preview-variant',
  'highlight-toggle', 'add-as-variant', 'clear-highlights',
])

const activeTab = ref('scene')
const showSidebar = ref(true)
const cascadeVisibility = ref(true)
const jsonEditorRef = ref(null)

// Panel width with drag-resize
const panelWidth = ref(350)
let dragStartX = 0
let dragStartWidth = 0

function onResizeStart(e) {
  dragStartX = e.clientX
  dragStartWidth = panelWidth.value
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
  e.preventDefault()
}
function onResizeMove(e) {
  const delta = dragStartX - e.clientX
  panelWidth.value = Math.max(260, Math.min(700, dragStartWidth + delta))
}
function onResizeEnd() {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

function switchTab(tab) {
  activeTab.value = tab
  emit('tab-change', tab)
}

function onToggle(payload) {
  emit('toggle', { ...payload, cascade: cascadeVisibility.value })
}

defineExpose({
  isJsonEditorDirty: () => jsonEditorRef.value?.isDirty?.() ?? false,
  resetEditorWithConfig: (cfg) => jsonEditorRef.value?.resetWithConfig?.(cfg),
  addOptionFromScene: (opt) => jsonEditorRef.value?.addOptionFromScene?.(opt),
  switchToTab: (tab) => { activeTab.value = tab },
})
</script>

<template>
  <div
    class="right-panel"
    :class="{ 'is-collapsed': !showSidebar }"
  >
    <button
      class="panel-handle"
      @click="showSidebar = !showSidebar"
      :title="showSidebar ? 'Collapse' : 'Expand'"
    >
      {{ showSidebar ? '▸' : '◂' }}
    </button>

    <div class="panel-body" :style="{ width: showSidebar ? panelWidth + 'px' : '0' }">
      <div class="resize-handle" @mousedown="onResizeStart"></div>

      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'scene' }" @click="switchTab('scene')">Scene</button>
        <button class="tab-btn" :class="{ active: activeTab === 'json' }" @click="switchTab('json')">JSON</button>
      </div>

      <div class="panel-content">
        <div class="tab-pane" v-show="activeTab === 'scene'">
          <SceneOutliner
            :root="currentModel"
            :selected-id="selectedNodeId"
            :scene-version="sceneVersion"
            :highlighted-ids="highlightedIds"
            @select="$emit('select', $event)"
            @toggle="onToggle"
            @highlight-toggle="$emit('highlight-toggle', $event)"
            @add-as-variant="$emit('add-as-variant')"
            @clear-highlights="$emit('clear-highlights')"
          />
        </div>
        <div class="tab-pane" v-show="activeTab === 'json'">
          <JsonEditor
            ref="jsonEditorRef"
            :json-config="jsonConfig"
            :scene-object-names="sceneObjectNames"
            :json-file-name="jsonFileName"
            @focus-object="$emit('focus-object', $event)"
            @json-updated="$emit('json-updated', $event)"
            @preview-part="$emit('preview-part', $event)"
            @restore-scene="$emit('restore-scene')"
            @preview-variant="$emit('preview-variant', $event)"
          />
        </div>
      </div>

      <div class="panel-settings">
        <label class="setting-row">
          <input type="checkbox" v-model="cascadeVisibility" />
          <span class="setting-label">Apply visibility to children</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.right-panel {
  position: relative;
  flex-shrink: 0;
  height: 100%;
  z-index: 2;
}

.panel-handle {
  position: absolute;
  left: -20px; top: 50%;
  transform: translateY(-50%);
  width: 20px; height: 48px;
  background: rgba(255,255,255,0.96);
  border: 1px solid #e7e7e7;
  border-right: none;
  border-radius: 8px 0 0 8px;
  box-shadow: -2px 0 8px rgba(0,0,0,0.06);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: #888;
  transition: background 0.15s, color 0.15s;
  z-index: 1;
}
.panel-handle:hover { background: #f0f0f0; color: #333; }

.panel-body {
  height: 100%;
  overflow: hidden;
  background: rgba(255,255,255,0.96);
  border-left: 1px solid #e7e7e7;
  box-shadow: -2px 0 12px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  position: relative;
}

.resize-handle {
  position: absolute;
  left: -4px; top: 0; bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 10;
  border-radius: 4px;
  transition: background 0.15s;
}
.resize-handle:hover { background: rgba(0,100,255,0.15); }

.tab-bar {
  display: flex;
  border-bottom: 1px solid #e7e7e7;
  flex-shrink: 0;
}
.tab-btn {
  flex: 1; padding: 9px 0;
  font-size: 12px; font-weight: 500;
  border: none; background: transparent; color: #999;
  cursor: pointer; border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.tab-btn:hover { color: #444; }
.tab-btn.active { color: #111; border-bottom-color: #111; }

.panel-content {
  flex: 1; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
}
.tab-pane {
  flex: 1; min-height: 0; overflow: hidden;
  display: flex; flex-direction: column;
}

.panel-settings {
  flex-shrink: 0;
  border-top: 1px solid #eee;
  padding: 8px 12px;
}
.setting-row {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; user-select: none;
}
.setting-row input[type="checkbox"] {
  width: 14px; height: 14px;
  cursor: pointer; accent-color: #111; flex-shrink: 0;
}
.setting-label { font-size: 11px; color: #666; }
</style>
