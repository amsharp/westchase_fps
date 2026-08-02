// Build a self-contained, hostable editor_hosted.html (Artifact body-content form):
// inline remapdata/mapfootprints/house_edit fully, inline SKYSCRAPERS with the heavy
// geometry+texture fields stripped (the 2D editor only needs id/name/dims/q), flatten
// out the <!doctype>/<html>/<head>/<body> wrappers, and add a clipboard export fallback.
const fs = require('fs'), vm = require('vm');
const ROOT = '/home/user/westchase_fps/';
let html = fs.readFileSync(ROOT + 'editor.html', 'utf8');

// --- slim SKYSCRAPERS: keep only what the editor reads (footprint boxes) ---
const sctx = {}; vm.createContext(sctx); vm.runInContext(fs.readFileSync(ROOT + 'skyscrapers.js', 'utf8'), sctx);
const slim = sctx.SKYSCRAPERS.map(function (m) { return { id: m.id, name: m.name, dims: m.dims, q: m.q, tris: m.tris }; });
const skyInline = 'var SKYSCRAPERS = ' + JSON.stringify(slim) + ';';

const deps = {
  'remapdata.js': fs.readFileSync(ROOT + 'remapdata.js', 'utf8'),
  'skyscrapers.js': skyInline,
  'mapfootprints.js': fs.readFileSync(ROOT + 'mapfootprints.js', 'utf8'),
  'house_edit.js': fs.readFileSync(ROOT + 'house_edit.js', 'utf8')
};

// --- pull out <style> block + body content ---
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
let body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'));

// --- inline the external scripts (relative src -> inline) ---
Object.keys(deps).forEach(function (name) {
  const tag = '<script src="' + name + '"></script>';
  body = body.replace(tag, '<script>\n' + deps[name] + '\n</script>');
});

// --- export fallback: Save Map also copies JSON to clipboard (download can be
//     blocked in a hosted sandbox; clipboard always works so the map round-trips) ---
body = body.replace(
  "toast('Saved westchase_map.json — hand it to Claude to rebuild the map');",
  "try{navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(exportObj(),null,1));}catch(e){}\n" +
  "  toast('Saved westchase_map.json (also COPIED to clipboard — paste it to Claude to rebuild the map)');"
);

const out = style + '\n' + body;
fs.writeFileSync('/tmp/claude-0/-home-user-westchase-fps/6762ca26-85bb-50ae-aa02-dab118a4400c/scratchpad/editor_hosted.html', out);
console.log('wrote editor_hosted.html', (out.length / 1024).toFixed(0) + 'KB',
  '| SKYSCRAPERS kept', slim.length, '| skyInline', (skyInline.length / 1024).toFixed(1) + 'KB (was ' + (fs.statSync(ROOT + 'skyscrapers.js').size / 1024).toFixed(0) + 'KB)');
