# Accessories Tab

Adds a third tab ("Accessories") to the right sidebar, alongside Scene and JSON, for inspecting/toggling `ACC_` and `PROP_` objects — modeled after the visibility logic in the production `cgi-model.vue` accessory viewer.

## What it does

- **Accessory list**: every `ACC_` object in the loaded GLB, each with a checkbox. Multiple accessories can be checked at once (multiselect). Clicking anywhere on a row (except the ⋮ menu) toggles it; checked rows are highlighted.
- **Prop resolution**: each `PROP_` object is grouped under every accessory it can match via its `userData.matches` array. When you check/uncheck an accessory, every prop's visibility is recomputed live:
  - shown if any of its `matches` accessories is checked
  - hidden if any of its `userData.conflicts` accessories is also checked, even when matched
  - props with no `matches` data land in an "Unmatched props" section with an (i) tooltip explaining how to add `matches`/`conflicts` userData to fix it
- **Clean slate on tab entry**: switching to the Accessories tab hides all `ACC_`/`PROP_` objects first, so only what you check is shown (mirrors the production component's approach).
- **View in Scene**: a ⋮ menu on each accessory/prop row jumps back to the Scene tab with that object selected and the camera focused on it.
- **Camera reset**: switching tabs (Scene ↔ Accessories ↔ JSON) now resets the camera to its initial position.
- **Naming**: object names are shown with their `ACC_`/`PROP_` prefix in grey and the part number in bold, so it's clear what type each row is.
- **Dismissible note**: a note at the top of the list explains that the real Accessories Precom component also mounts an accessory's related "mounting part" via an API this tool doesn't have access to, so some parts may appear to float. Dismissing it is remembered via `localStorage`.

## Also changed

- Right sidebar minimum/default width increased to 450px (was 260/350) to fit the new tab's content comfortably.

## Known limitations

- No mutual-exclusivity or prerequisite rule engine (unlike production's `rulesData`) — this is a visibility inspector, not a full cart simulation.
- Mounting-part auto-combination (e.g. towbar + wiring kit) isn't reproduced since it depends on API data not available in this tool.
