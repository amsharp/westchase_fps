// Search the Fish Audio voice catalog. Use before assigning a NEW character
// voice; then pin the chosen reference_id in voices.json so the character
// sounds the same forever.
//   FISH_API_KEY=... node findvoice.js "old man raspy"
const KEY = process.env.FISH_API_KEY;
if (!KEY) { console.error('set FISH_API_KEY'); process.exit(1); }
const q = process.argv.slice(2).join(' ');
(async () => {
  const r = await fetch('https://api.fish.audio/model?title=' + encodeURIComponent(q) + '&page_size=10&language=en', {
    headers: { Authorization: 'Bearer ' + KEY },
  });
  const j = await r.json();
  for (const m of j.items || []) console.log(m._id, '|', m.title, '|', (m.description || '').slice(0, 80));
  if (!(j.items || []).length) console.log('no matches — try different keywords');
})();
