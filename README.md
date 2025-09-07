# threejs-cgi-editor

A minimal Three.js + Vue 3 tool to view GLB models, apply JSON-driven variant visibility, pick GLTF material variants (colors), and inspect the full scene hierarchy with live visibility toggles. Includes HDR environment upload and local caching (IndexedDB). Deployed via GitHub Pages.

## Features
- Upload GLB (renders immediately), optional JSON, and optional HDR; spinner while loading
- Draco decoding (WASM) and HDR environment
- JSON variant dropdown (variant + optionPackToggle combinations)
- GLTF color/material variants dropdown (KHR_materials_variants)
- Scene Outliner (right panel): search, expand/collapse, node visibility
- Selection highlight via lightweight emissive pulse
- Local caching for GLB/JSON/HDR with Clear Cache
- GitHub Pages workflow with correct base path

## JSON format (example)
- `options[]`: each with `conditions.variant` (string) and `conditions.optionPackToggle` (boolean), and `visibleObjs[]` logical ids
- `objectNames`: maps logical ids to actual GLB object names
- Optional `lightPositions[]`: `{ x, y, z, intensity?, opts? }`

See `public/kona.json` for a full example.

## Quick start (local)
```bash
npm ci
npm run dev
```
Open http://localhost:5173 (or the shown port). Upload a GLB and the JSON, then (optionally) an HDR.

## Usage
- Upload flow
  - GLB: renders immediately. If the GLB contains `KHR_materials_variants`, the Color dropdown is active.
  - JSON: enables the Variant dropdown (combinations built from `conditions.variant` + `optionPackToggle`). A hint appears if only GLB is loaded.
  - HDR: overrides the default environment map; cached for refreshes.
- Variant: pick a combination to apply JSON-driven visibility.
- Color: choose a material variant from GLB `KHR_materials_variants`.
- Outliner: toggle visibility per node; selection pulses the mesh emissive.
- Overrides: manual visibility changes are temporary; on variant change the variant visibility is applied first, then your overrides are re-applied.
- Clear Cache: prompts for confirmation, clears cached GLB/JSON/HDR and names, and reloads the page.

## Deploy to GitHub Pages
- Push to `main`; the workflow `.github/workflows/deploy.yml` builds and publishes
- The site will be available at `https://<user>.github.io/<repo>/`

## Notes
- Paths for HDR and Draco respect the Vite base via `import.meta.env.BASE_URL`
- The renderer uses ACES tone mapping; exposure can be adjusted in `ThreeViewer.vue`
- For parity with older projects, code uses example loaders from `three/examples/...`

## Folder structure
- `src/components/ThreeViewer.vue` – main viewer
- `src/components/SceneOutliner.vue` – right sidebar tree
- `src/components/TreeNode.vue` – tree row
- `src/utils/sceneTree.js` – helpers for building/lookup
- `src/utils/idbCache.js` – IndexedDB helpers
- `public/` – default HDR, Draco WASM, gear.svg icon

## Troubleshooting
- If GLB colors don’t change, your GLB might lack `gltf.functions.selectVariant`; fallback parser logic applies variants via `KHR_materials_variants`
- If assets 404 on Pages, ensure the repo deployed and base path matches; we use `import.meta.env.BASE_URL`
