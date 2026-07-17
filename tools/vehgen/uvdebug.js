// Render the body atlas with the tail-region UV triangles outlined, to see the
// island layout before drawing the design in UV space. node uvdebug.js
const fs = require('fs'); const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
// reuse genporsche's parseGLB/processBody by evaluating its top half
const src = fs.readFileSync(path.join(__dirname, 'genporsche.js'), 'utf8');
eval(src.split('// --- WHEEL')[0].replace(/^let pw.*$/m, '').replace(/^const OUT.*$/m, ''));
const body = processBody(true);   // --flip
const { pos, uv, L, H, W } = body;
const nTri = pos.length / 9;
const tris = [];
for (let t = 0; t < nTri; t++) {
  const o = t * 9;
  const e1x = pos[o+3]-pos[o], e1y = pos[o+4]-pos[o+1], e1z = pos[o+5]-pos[o+2];
  const e2x = pos[o+6]-pos[o], e2y = pos[o+7]-pos[o+1], e2z = pos[o+8]-pos[o+2];
  let nx = e1y*e2z - e1z*e2y; const ny = e1z*e2x - e1x*e2z, nz = e1x*e2y - e1y*e2x;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl;
  const mx2 = (pos[o]+pos[o+3]+pos[o+6])/3, my = (pos[o+1]+pos[o+4]+pos[o+7])/3;
  if (mx2 < -0.40*L && my < 0.70*H && nx < -0.30)
    tris.push({ uv: [uv[t*6],uv[t*6+1],uv[t*6+2],uv[t*6+3],uv[t*6+4],uv[t*6+5]],
      y: [pos[o+1],pos[o+4],pos[o+7]], z: [pos[o+2],pos[o+5],pos[o+8]] });
}
console.log('tail tris:', tris.length);
(async () => {
  const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const png = await page.evaluate(o => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const S = 1024, c = document.createElement('canvas'); c.width = S; c.height = S;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, S, S);
      g.lineWidth = 1.5;
      for (const t of o.tris) {
        const u = t.uv;
        // color-code by tail position: hue from horizontal z, lightness from y
        const zc = (t.z[0]+t.z[1]+t.z[2])/3, yc = (t.y[0]+t.y[1]+t.y[2])/3;
        g.strokeStyle = 'hsl(' + ((zc + o.W/2)/o.W*300|0) + ',95%,' + (25 + yc/o.H*55|0) + '%)';
        g.beginPath(); g.moveTo(u[0]*S, u[1]*S); g.lineTo(u[2]*S, u[3]*S); g.lineTo(u[4]*S, u[5]*S); g.closePath(); g.stroke();
      }
      res(c.toDataURL('image/png'));
    };
    img.src = o.src;
  }), { src: body.rawTex, tris, W, H });
  fs.writeFileSync('work/uvdebug.png', Buffer.from(png.split(',')[1], 'base64'));
  console.log('wrote work/uvdebug.png');
  await browser.close();
})();
