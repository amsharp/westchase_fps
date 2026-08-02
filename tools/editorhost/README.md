# editorhost — self-contained hosted map editor

`build.js` bakes `editor.html` + its data deps into ONE self-contained
`editor_hosted.html` (Artifact body-content form: no `<!doctype>/<html>/<head>/
<body>`) so the map editor can be published as a clickable claude.ai Artifact.

What it does:
- Inlines `remapdata.js` (the current map), `mapfootprints.js`, `house_edit.js`.
- Inlines `SKYSCRAPERS` with the heavy `p/u/i/tex` geometry+texture fields
  STRIPPED (the 2D editor only reads `id/name/dims/q`) — ~1.4MB → ~1KB.
- Flattens the `<style>` + body markup + inline script.
- Patches `saveMap()` to ALSO copy the export JSON to the clipboard (a hosted
  sandbox can block file downloads; clipboard always works for the round-trip).

Run: `node tools/editorhost/build.js` → writes editor_hosted.html to the
scratchpad, then publish it with the Artifact tool (favicon 🗺️). Re-run after the
map (remapdata.js) or skyscraper catalog changes to refresh the hosted editor.
