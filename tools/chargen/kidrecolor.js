// Programmatic canvas recolor of kid base atlases -> variant atlases.
// Replaces the unreliable gpt-image-1 whole-atlas repaint (which smeared dark
// blotches across scattered UV islands). Deterministic: classify every
// non-background pixel to the nearest per-base REFERENCE color (Lab distance),
// look up its semantic GROUP (skin/hair/top/bottom/shoe/keep), and for the
// groups a variant changes, remap to the target color preserving shading
// (absolute target hue, saturation + lightness OFFSET from the group's source
// representative). Untouched groups + graphics stay byte-identical -> no smear.
//
//   node kidrecolor.js --mask   -> aigen/kid_masks.png  (classification debug)
//   node kidrecolor.js          -> work/kidreskin_<NAME>.jpg for all variants
//
// Then rebuild kidchars.js (buildkidjs.js) and re-render kidsheet.js.
const fs = require('fs');
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const WORK = path.join(__dirname, 'work');
const MASK = process.argv.includes('--mask');

// ---- per-base reference palette: [r,g,b] -> semantic group.
// First ref of each group = that group's SOURCE representative for the remap.
// Derived from kidcluster.js k-means centroids + roster knowledge.
const REFS = {
  LEO: [ // fair skin, brown spiky hair, green T-rex tee, denim shorts, red shoes
    { c: [197, 155, 112], g: 'skin' }, { c: [150, 110, 78], g: 'skin' },
    { c: [87, 52, 19], g: 'hair' },
    { c: [60, 145, 7], g: 'top' }, { c: [64, 163, 7], g: 'top' }, { c: [60, 124, 18], g: 'top' }, { c: [34, 73, 20], g: 'top' },
    { c: [32, 67, 92], g: 'bottom' },
    { c: [143, 24, 11], g: 'shoe' },
    { c: [150, 153, 76], g: 'keep' }, // t-rex graphic
  ],
  MAYA: [ // dark skin, black braids, denim overalls, yellow tee, white sneakers
    { c: [113, 59, 26], g: 'skin' }, { c: [70, 35, 13], g: 'skin' }, { c: [96, 79, 51], g: 'skin' },
    { c: [33, 26, 19], g: 'hair' },
    { c: [233, 171, 20], g: 'top' }, { c: [168, 126, 39], g: 'top' },
    { c: [49, 74, 89], g: 'bottom' }, { c: [41, 50, 55], g: 'bottom' },
    { c: [204, 188, 153], g: 'shoe' },
  ],
  SOFIA: [ // tan skin, dark bob, pink unicorn dress, sandals
    { c: [149, 92, 57], g: 'skin' }, { c: [191, 122, 80], g: 'skin' }, { c: [150, 110, 87], g: 'skin' }, { c: [110, 70, 47], g: 'skin' }, { c: [194, 174, 142], g: 'skin' },
    { c: [29, 22, 15], g: 'hair' }, { c: [57, 30, 21], g: 'hair' },
    { c: [147, 66, 86], g: 'top' }, { c: [204, 104, 122], g: 'top' },
  ],
  JAYDEN: [ // brown skin, dark fade, orange jersey #4, black shorts, white high-tops
    { c: [102, 68, 53], g: 'skin' }, { c: [135, 91, 70], g: 'skin' }, { c: [38, 24, 19], g: 'skin' },
    { c: [14, 14, 15], g: 'hair' }, // fade + black shorts share black; kept as-is in variants
    { c: [235, 84, 13], g: 'top' }, { c: [203, 98, 48], g: 'top' }, { c: [122, 50, 20], g: 'top' },
    { c: [223, 219, 213], g: 'keep' }, // white trim / #4 / high-tops
    { c: [56, 21, 12], g: 'top' },
  ],
  EMMA: [ // fair skin, blonde ponytail, teal butterfly tee, purple shorts, pink shoes
    { c: [239, 170, 108], g: 'skin' }, { c: [242, 187, 136], g: 'skin' },
    { c: [188, 148, 29], g: 'hair' }, { c: [144, 116, 66], g: 'hair' },
    { c: [19, 143, 127], g: 'top' },
    { c: [95, 14, 108], g: 'bottom' },
    { c: [203, 49, 114], g: 'shoe' },
    { c: [199, 184, 179], g: 'keep' }, { c: [54, 39, 44], g: 'keep' },
  ],
  KAI: [ // light warm skin, black bowl, blue/white striped tee, tan cargo, blue shoes
    { c: [241, 179, 122], g: 'skin' }, { c: [201, 162, 120], g: 'skin' }, { c: [184, 118, 73], g: 'skin' },
    { c: [33, 30, 29], g: 'hair' },
    { c: [63, 89, 103], g: 'top' }, // blue stripes (+ blue shoes, acceptable)
    { c: [94, 68, 32], g: 'bottom' }, { c: [145, 113, 68], g: 'bottom' },
    { c: [137, 139, 119], g: 'keep' }, { c: [206, 208, 190], g: 'keep' }, // white/grey stripes
  ],
  PRIYA: [ // medium tan skin, dark hair, red star tee, floral leggings, sandals
    { c: [134, 88, 44], g: 'skin' }, { c: [211, 151, 65], g: 'skin' },
    { c: [68, 29, 16], g: 'hair' }, { c: [25, 25, 25], g: 'hair' },
    { c: [99, 5, 4], g: 'top' }, { c: [157, 18, 15], g: 'top' },
    { c: [28, 39, 72], g: 'bottom' }, { c: [159, 69, 111], g: 'bottom' }, // floral leggings
    { c: [179, 181, 150], g: 'keep' }, // sandals / star highlight
  ],
  NOAH: [ // fair skin, red cap + brown curls, denim overalls, light truck tee, sneakers
    { c: [248, 172, 117], g: 'skin' }, { c: [227, 175, 132], g: 'skin' },
    { c: [84, 36, 12], g: 'hair' }, { c: [135, 91, 52], g: 'hair' },
    { c: [47, 68, 83], g: 'bottom' }, // denim overalls
    { c: [208, 194, 163], g: 'top' }, { c: [142, 129, 97], g: 'top' }, // truck tee
    { c: [207, 78, 63], g: 'keep' }, // red cap
    { c: [47, 44, 38], g: 'keep' },
  ],
};

// ---- named target colors (RGB) ----
const T = {
  skin_fair: [240, 196, 156], skin_lightwarm: [236, 186, 148], skin_tan: [199, 148, 100],
  skin_meddark: [166, 118, 78], skin_dark: [108, 68, 42],
  hair_black: [28, 24, 22], hair_darkbrown: [72, 46, 26], hair_brown: [104, 68, 36],
  hair_blonde: [196, 156, 66], hair_lightbrown: [128, 92, 54],
  blue: [40, 82, 158], red: [172, 32, 26], crimson: [150, 22, 32], green: [58, 138, 40],
  darkgreen: [36, 78, 36], teal: [20, 140, 126], pink: [212, 82, 132], purple: [120, 42, 140],
  orange: [226, 108, 24], yellow: [226, 180, 32], skyblue: [116, 178, 220],
};

// ---- variants: which groups change to which target ----
const VARIANTS = [
  { n: 'LEO_COCO', base: 'LEO', race: 'black', ch: { skin: 'skin_dark', hair: 'hair_black', top: 'blue' } },
  { n: 'LEO_SUN', base: 'LEO', race: 'latino', ch: { skin: 'skin_tan', hair: 'hair_darkbrown', top: 'red' } },
  { n: 'MAYA_HAZEL', base: 'MAYA', race: 'latino', ch: { skin: 'skin_tan', hair: 'hair_darkbrown', top: 'green' } },
  { n: 'MAYA_INK', base: 'MAYA', race: 'black', ch: { bottom: 'teal', top: 'orange' } },
  { n: 'SOFIA_SKY', base: 'SOFIA', race: 'white', ch: { skin: 'skin_fair', hair: 'hair_blonde', top: 'skyblue' } },
  { n: 'SOFIA_COCOA', base: 'SOFIA', race: 'black', ch: { skin: 'skin_dark', top: 'green' } },
  { n: 'JAYDEN_AZURE', base: 'JAYDEN', race: 'latino', ch: { skin: 'skin_tan', top: 'blue' } },
  { n: 'JAYDEN_CRIMSON', base: 'JAYDEN', race: 'black', ch: { top: 'crimson' } },
  { n: 'EMMA_JADE', base: 'EMMA', race: 'east_asian', ch: { skin: 'skin_lightwarm', hair: 'hair_black', top: 'pink' } },
  { n: 'EMMA_UMBER', base: 'EMMA', race: 'south_asian', ch: { skin: 'skin_meddark', hair: 'hair_black', top: 'orange' } },
  { n: 'KAI_OLIVE', base: 'KAI', race: 'latino', ch: { skin: 'skin_tan', hair: 'hair_darkbrown', top: 'green' } },
  { n: 'KAI_ASH', base: 'KAI', race: 'white', ch: { skin: 'skin_fair', hair: 'hair_lightbrown', top: 'red' } },
  { n: 'PRIYA_JADE', base: 'PRIYA', race: 'east_asian', ch: { skin: 'skin_lightwarm', hair: 'hair_black', top: 'purple' } },
  { n: 'PRIYA_LINEN', base: 'PRIYA', race: 'white', ch: { skin: 'skin_fair', hair: 'hair_brown', top: 'yellow' } },
  { n: 'NOAH_PINE', base: 'NOAH', race: 'black', ch: { skin: 'skin_dark', hair: 'hair_black', bottom: 'darkgreen' } },
  { n: 'NOAH_CLAY', base: 'NOAH', race: 'latino', ch: { skin: 'skin_tan', hair: 'hair_darkbrown', top: 'yellow' } },
];

const MASKCOLORS = { skin: [255, 80, 80], hair: [80, 80, 255], top: [80, 220, 80], bottom: [230, 200, 40], shoe: [220, 80, 220], keep: [90, 90, 90] };

const atlases = {};
for (const b in REFS) atlases[b] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(WORK, 'tex_' + b + '.jpg')).toString('base64');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const result = await page.evaluate(async (pay) => {
    const { atlases, REFS, T, VARIANTS, MASK, MASKCOLORS } = pay;
    function load(src) { return new Promise(r => { const im = new Image(); im.onload = () => r(im); im.src = src; }); }
    function rgb2lab(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
      g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
      b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
      let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = (r * 0.2126 + g * 0.7152 + b * 0.0722), z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
      const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
      x = f(x); y = f(y); z = f(z);
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    }
    function rgb2hsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
      if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; }
      return [h, s, l];
    }
    function hsl2rgb(h, s, l) {
      let r, g, b; if (s === 0) { r = g = b = l; } else {
        const hue2 = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        r = hue2(p, q, h + 1 / 3); g = hue2(p, q, h); b = hue2(p, q, h - 1 / 3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    // precompute Lab for refs
    const refLab = {};
    for (const b in REFS) refLab[b] = REFS[b].map(rf => ({ lab: rgb2lab(rf.c[0], rf.c[1], rf.c[2]), g: rf.g }));
    // source representative (dominant ref) HSL per group per base
    const srcHSL = {};
    for (const b in REFS) { srcHSL[b] = {}; for (const rf of REFS[b]) if (!(rf.g in srcHSL[b])) srcHSL[b][rf.g] = rgb2hsl(rf.c[0], rf.c[1], rf.c[2]); }

    function classify(base, r, g, bb) {
      const lab = rgb2lab(r, g, bb); const rl = refLab[base]; let best = 'keep', bd = 1e9;
      for (let k = 0; k < rl.length; k++) { const dl = lab[0] - rl[k].lab[0], da = lab[1] - rl[k].lab[1], db = lab[2] - rl[k].lab[2]; const dd = dl * dl + da * da + db * db; if (dd < bd) { bd = dd; best = rl[k].g; } }
      return best;
    }

    const canvases = {};
    for (const b in atlases) {
      const im = await load(atlases[b]);
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, 256, 256);
      canvases[b] = { c, data: g.getImageData(0, 0, 256, 256) };
    }

    if (MASK) {
      const names = Object.keys(atlases); const CELL = 300;
      const out = document.createElement('canvas'); out.width = CELL * 2 + 130; out.height = names.length * CELL;
      const octx = out.getContext('2d'); octx.fillStyle = '#111'; octx.fillRect(0, 0, out.width, out.height);
      for (let ni = 0; ni < names.length; ni++) {
        const b = names[ni]; const src = canvases[b].data; const md = new ImageData(256, 256);
        for (let i = 0; i < src.data.length; i += 4) {
          const r = src.data[i], gg = src.data[i + 1], bb = src.data[i + 2];
          if (r + gg + bb < 36) { md.data[i] = md.data[i + 1] = md.data[i + 2] = 0; md.data[i + 3] = 255; continue; }
          const grp = classify(b, r, gg, bb); const mc = MASKCOLORS[grp];
          md.data[i] = mc[0]; md.data[i + 1] = mc[1]; md.data[i + 2] = mc[2]; md.data[i + 3] = 255;
        }
        const mc = document.createElement('canvas'); mc.width = mc.height = 256; mc.getContext('2d').putImageData(md, 0, 0);
        const y0 = ni * CELL;
        octx.imageSmoothingEnabled = false;
        octx.drawImage(canvases[b].c, 130, y0, CELL, CELL);
        octx.drawImage(mc, 130 + CELL, y0, CELL, CELL);
        octx.fillStyle = '#fff'; octx.font = 'bold 15px monospace'; octx.fillText(b, 6, y0 + 20);
        octx.font = '11px monospace';
        const leg = ['skin', 'hair', 'top', 'bottom', 'shoe', 'keep'];
        for (let li = 0; li < leg.length; li++) { const mcc = MASKCOLORS[leg[li]]; octx.fillStyle = 'rgb(' + mcc.join(',') + ')'; octx.fillRect(6, y0 + 34 + li * 18, 12, 12); octx.fillStyle = '#fff'; octx.fillText(leg[li], 22, y0 + 44 + li * 18); }
      }
      return { mask: out.toDataURL('image/png') };
    }

    // generate variants
    const outputs = {};
    for (const v of VARIANTS) {
      const src = canvases[v.base].data; const od = new ImageData(256, 256);
      // precompute target HSL + source group HSL
      const tHSL = {}; for (const grp in v.ch) tHSL[grp] = rgb2hsl(...T[v.ch[grp]]);
      for (let i = 0; i < src.data.length; i += 4) {
        let r = src.data[i], g = src.data[i + 1], b = src.data[i + 2];
        od.data[i + 3] = 255;
        if (r + g + b < 36) { od.data[i] = od.data[i + 1] = od.data[i + 2] = 0; continue; }
        const grp = classify(v.base, r, g, b);
        if (v.ch[grp]) {
          const ph = rgb2hsl(r, g, b), C = srcHSL[v.base][grp], Tt = tHSL[grp];
          const nh = Tt[0];
          let ns, nl;
          if (grp === 'skin' || grp === 'hair') {
            // skin/hair: FLAT target saturation (no offset -> no orange blowout),
            // DAMPED lightness shading compressed around the target tone.
            const damp = grp === 'skin' ? 0.62 : 0.72;
            ns = Tt[1];
            nl = Tt[2] + damp * (ph[2] - C[2]);
          } else {
            // clothing: preserve print shading via sat + lightness OFFSET.
            ns = Tt[1] + (ph[1] - C[1]);
            nl = ph[2] + (Tt[2] - C[2]);
          }
          ns = ns < 0 ? 0 : ns > 1 ? 1 : ns;
          nl = nl < 0 ? 0 : nl > 1 ? 1 : nl;
          const rgb = hsl2rgb(nh, ns, nl); r = rgb[0]; g = rgb[1]; b = rgb[2];
        }
        // posterize to match genskin crunch
        od.data[i] = Math.round(r / 12) * 12; od.data[i + 1] = Math.round(g / 12) * 12; od.data[i + 2] = Math.round(b / 12) * 12;
      }
      const oc = document.createElement('canvas'); oc.width = oc.height = 256; oc.getContext('2d').putImageData(od, 0, 0);
      outputs[v.n] = oc.toDataURL('image/jpeg', 0.9);
    }
    return { outputs };
  }, { atlases, REFS, T, VARIANTS, MASK, MASKCOLORS });

  if (MASK) {
    fs.writeFileSync(path.join(__dirname, 'aigen', 'kid_masks.png'), Buffer.from(result.mask.split(',')[1], 'base64'));
    console.log('wrote aigen/kid_masks.png');
  } else {
    for (const n in result.outputs) {
      fs.writeFileSync(path.join(WORK, 'kidreskin_' + n + '.jpg'), Buffer.from(result.outputs[n].split(',')[1], 'base64'));
      console.log('wrote work/kidreskin_' + n + '.jpg');
    }
  }
  await browser.close();
})().catch(e => { console.error(String(e)); process.exit(1); });
