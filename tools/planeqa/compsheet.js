// Build a reliable comparison IMAGE (jpg) showing each control surface neutral
// vs deflected, zoomed tight so the pivot is obvious. Uses toDataURL (which
// captures content reliably, unlike the headless video encoder).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const three = fs.readFileSync(path.resolve(__dirname, '../../three.min.js'), 'utf8');
const planejs = fs.readFileSync(path.resolve(__dirname, '../../plane.js'), 'utf8');
const CW = 380, CH = 250;

const html = `<!doctype html><body>
<canvas id="gl" width="${CW}" height="${CH}"></canvas>
<canvas id="sheet" width="${CW * 2}" height="${CH * 4}"></canvas>
<script>${three}</script><script>window.THREE=THREE;</script><script>${planejs}</script><script>
var gl=document.getElementById('gl'); var R=new THREE.WebGLRenderer({canvas:gl,antialias:true}); R.setClearColor(0x8fb0d6);
var scene=new THREE.Scene(); scene.add(new THREE.AmbientLight(0xffffff,0.9));
var d1=new THREE.DirectionalLight(0xffffff,0.7); d1.position.set(0.5,1,0.4); scene.add(d1);
var d2=new THREE.DirectionalLight(0xffffff,0.35); d2.position.set(-0.6,0.4,-0.6); scene.add(d2);
var built=WC_PLANE.build(); scene.add(built.group);
var cam=new THREE.PerspectiveCamera(40,${CW}/${CH},0.1,400);
function view(cx,cy,cz,tx,ty,tz){ cam.position.set(cx,cy,cz); cam.lookAt(tx,ty,tz); }
window.render1=function(camv,a,e,r,g){
  WC_PLANE.setControls(built.parts,a,e,r); WC_PLANE.setGear(built.parts,g);
  if(camv==='ail')  view(5.5,2.6,-5.5, 4.6,0.3,0.6);   // tight on right wingtip trailing edge from behind-above
  if(camv==='elev') view(12,2.3,-5.3, 0,2.1,-5.3);     // side-on at tail -> elevator trailing edge up/down
  if(camv==='rud')  view(0,3.0,-13, 0,3.0,-5.3);       // straight behind, level with fin -> rudder swings L/R
  if(camv==='gear') view(6,-2.5,12, 0,-0.6,4);         // nose+main gear from low front
  R.render(scene,cam); return gl.toDataURL('image/png');
};
window.__ready=true;
</script></body>`;
fs.writeFileSync(path.resolve(__dirname, '_comp.html'), html);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '_comp.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready===true', { timeout: 30000 });
  const rows = [
    { cam: 'ail', label: 'AILERONS (roll)', a: [-1, 0, 0, 0], b: [1, 0, 0, 0], la: 'aileron down', lb: 'aileron up' },
    { cam: 'elev', label: 'ELEVATOR (pitch)', a: [0, -1, 0, 0], b: [0, 1, 0, 0], la: 'pitch down', lb: 'pitch up' },
    { cam: 'rud', label: 'RUDDER (yaw)', a: [0, 0, -1, 0], b: [0, 0, 1, 0], la: 'yaw left', lb: 'yaw right' },
    { cam: 'gear', label: 'LANDING GEAR', a: [0, 0, 0, 0], b: [0, 0, 0, 1], la: 'deployed (down)', lb: 'retracted (up)' }
  ];
  const imgs = [];
  for (const r of rows) {
    imgs.push({ r, A: await p.evaluate(v => window.render1(v[0], v[1], v[2], v[3], v[4]), [r.cam, ...r.a]) });
    imgs[imgs.length - 1].B = await p.evaluate(v => window.render1(v[0], v[1], v[2], v[3], v[4]), [r.cam, ...r.b]);
  }
  // composite into the sheet with labels
  const dataURL = await p.evaluate(({ imgs, CW, CH }) => {
    var sheet = document.getElementById('sheet'); var s = sheet.getContext('2d');
    s.fillStyle = '#20242c'; s.fillRect(0, 0, CW * 2, CH * 4);
    return new Promise(function (resolve) {
      var loaded = 0, total = imgs.length * 2;
      imgs.forEach(function (o, i) {
        [['A', 0, o.r.la], ['B', 1, o.r.lb]].forEach(function (pair) {
          var im = new Image();
          im.onload = function () {
            var x = pair[1] * CW, y = i * CH;
            s.drawImage(im, x, y);
            s.font = 'bold 20px Arial'; s.textAlign = 'left';
            s.fillStyle = 'rgba(0,0,0,0.5)'; s.fillRect(x + 6, y + 6, s.measureText(o.r.label).width + 14, 26);
            s.fillStyle = '#ffe36b'; s.fillText(o.r.label, x + 12, y + 25);
            s.font = 'bold 16px Arial';
            s.fillStyle = 'rgba(0,0,0,0.55)'; s.fillRect(x + 6, y + CH - 28, s.measureText(pair[2]).width + 14, 22);
            s.fillStyle = '#fff'; s.fillText(pair[2], x + 12, y + CH - 12);
            if (++loaded === total) resolve(sheet.toDataURL('image/jpeg', 0.9));
          };
          im.src = o[pair[0]];
        });
      });
    });
  }, { imgs, CW, CH });
  fs.writeFileSync(path.resolve(__dirname, 'controls_sheet.jpg'), Buffer.from(dataURL.split(',')[1], 'base64'));
  console.log('wrote controls_sheet.jpg');
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
