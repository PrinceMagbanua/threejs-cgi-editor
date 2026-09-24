# Idea: JSON config validator (not yet built)

## Problem

`kona.json`-style configs reference GLB object names two ways:

- `objectNames`: alias → actual GLB object `.name`
- `options[].visibleObjs`: array of alias keys (must exist in `objectNames`)

When the 3D artist renames or removes objects in a newer GLB export, nothing
currently tells you the JSON has gone stale. The JsonEditor already warns on
*import* if a typed-in object name doesn't match the loaded GLB ("These were
not added. Check the object names match exactly..."), but there's no
standalone check you can run against an existing config + GLB pair, and no
check for the inverse case (GLB objects nobody references).

## Proposed checks

Given a loaded GLB and a `kona.json`:

1. **Dangling alias** — `objectNames[alias]` doesn't match any object `.name`
   in the current GLB. (Silent failure today: the part just never shows up.)
2. **Orphaned GLB object** — an object in the GLB (matching relevant prefixes,
   e.g. not internal/helper nodes) isn't referenced by any `objectNames`
   value. Likely a new part the JSON hasn't been updated for yet.
3. **Unknown visibleObjs key** — `options[].visibleObjs` contains a key with
   no entry in `objectNames`.
4. **Empty/no-op variant** — an `options[]` entry whose `visibleObjs` resolve
   to zero visible objects after alias resolution.

## Where it could live

A new tab/panel alongside JsonEditor/AccessoriesPanel (e.g. `ValidatorPanel.vue`),
reusing the existing `nameMap`/`sceneObjectNames` built for the outliner —
no new GLB-parsing logic needed, just cross-reference against the current
`jsonConfig`.

## Status

Parked for now — revisit once it's actually causing pain (i.e. once a stale
alias ships silently in practice). Not implemented.
