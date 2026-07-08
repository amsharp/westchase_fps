// fetchrefs.js — pull Street View + satellite reference photos for a building.
//   GOOGLE_MAPS_KEY=... node fetchrefs.js <id> <lat> <lng> [heading]
// Steps:
//   1. Street View metadata (FREE) — snaps to the nearest pano; abort early
//      if there is no coverage instead of burning a paid image request.
//   2. Two Street View Static images (640x640): straight at the building
//      (heading from pano to target, or the explicit [heading] arg) and a
//      second angled view (+28 deg) for the AI to read depth/side wall.
//   3. One zoom-20 satellite closeup (roof color / footprint).
// Output: work/<id>_sv1.jpg, work/<id>_sv2.jpg, work/<id>_sat.png,
//         work/<id>_meta.json
'use strict';
const fs = require('fs');
const path = require('path');
const { need } = require('./lib');

const [, , id, latS, lngS, headS] = process.argv;
if (!lngS) { console.error('usage: node fetchrefs.js id lat lng [heading]'); process.exit(1); }
const KEY = need('GOOGLE_MAPS_KEY');
const lat = +latS, lng = +lngS;
const DIR = path.join(__dirname, 'work');
fs.mkdirSync(DIR, { recursive: true });

function bearing(la1, lo1, la2, lo2) {
  const r = Math.PI / 180;
  const y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r);
  const x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url.split('key=')[0] + ' -> HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const mUrl = 'https://maps.googleapis.com/maps/api/streetview/metadata?location=' + lat + ',' + lng + '&radius=100&source=outdoor&key=' + KEY;
  const meta = JSON.parse((await get(mUrl)).toString());
  if (meta.status !== 'OK') { console.error('no street view coverage: ' + meta.status); process.exit(2); }
  const pl = meta.location;
  const head = headS !== undefined ? +headS : bearing(pl.lat, pl.lng, lat, lng);
  console.log('pano', meta.pano_id, 'at', pl.lat.toFixed(6) + ',' + pl.lng.toFixed(6), 'date', meta.date, 'heading', head.toFixed(1));

  const sv = (h, fov) => 'https://maps.googleapis.com/maps/api/streetview?size=640x640&pano=' + meta.pano_id + '&heading=' + h.toFixed(1) + '&fov=' + fov + '&pitch=8&key=' + KEY;
  fs.writeFileSync(path.join(DIR, id + '_sv1.jpg'), await get(sv(head, 80)));
  fs.writeFileSync(path.join(DIR, id + '_sv2.jpg'), await get(sv((head + 28) % 360, 80)));
  const satUrl = 'https://maps.googleapis.com/maps/api/staticmap?center=' + lat + ',' + lng + '&zoom=20&size=640x640&maptype=satellite&key=' + KEY;
  fs.writeFileSync(path.join(DIR, id + '_sat.png'), await get(satUrl));
  fs.writeFileSync(path.join(DIR, id + '_meta.json'), JSON.stringify({ id, target: { lat, lng }, pano: meta.pano_id, panoLoc: pl, date: meta.date, heading: +head.toFixed(1) }, null, 2));
  console.log('wrote work/' + id + '_sv1.jpg _sv2.jpg _sat.png _meta.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
