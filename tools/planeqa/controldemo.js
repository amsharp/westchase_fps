// Close-up demo of the Learjet's moving parts: sweeps ailerons, elevator,
// rudder, and the landing gear through their range with on-screen labels,
// recorded to mp4 (phone-friendly) via a composited 2D canvas + MediaRecorder.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const three = fs.readFileSync(path.resolve(__dirname, '../../three.min.js'), 'utf8');
const planejs = fs.readFileSync(path.resolve(__dirname, '../../plane.js'), 'utf8');
const OUT = path.resolve(__dirname, 'plane_controls.mp4');
const FPS = 30;

const html = `<!doctype html><html><body style="margin:0">
<canvas id="gl" width="720" height="460"></canvas>
<canvas id="stage" width="720" height="460"></canvas>
<script>${three}</script><script>window.THREE=THREE;</script><script>${planejs}</script><script>
var gl=document.getElementById('gl'), stage=document.getElementById('stage'), sx=stage.getContext('2d');
var R=new THREE.WebGLRenderer({canvas:gl,antialias:true}); R.setClearColor(0x8fb0d6);
var scene=new THREE.Scene(); scene.add(new THREE.AmbientLight(0xffffff,0.85));
var dl=new THREE.DirectionalLight(0xffffff,0.75); dl.position.set(0.5,1,0.4); scene.add(dl);
var dl2=new THREE.DirectionalLight(0xffffff,0.3); dl2.position.set(-0.6,0.3,-0.5); scene.add(dl2);
var built=WC_PLANE.build(); scene.add(built.group);
var cam=new THREE.PerspectiveCamera(42,720/460,0.1,400);
function look(px,py,pz,tx,ty,tz){ cam.position.set(px,py,pz); cam.lookAt(tx,ty,tz); }
window.frame=function(label,camv,ail,elev,rud,gear){
  WC_PLANE.setControls(built.parts, ail, elev, rud);
  WC_PLANE.setGear(built.parts, gear);
  if(camv==='ail') look(3,9,-15, 0,0.5,1);
  else if(camv==='elev') look(17,2.5,-7, 0,1.2,-5);
  else if(camv==='rud') look(2,15,-9, 0,0.5,-5);
  else if(camv==='gear') look(9,-4,13, 0,-1,3);
  else look(11,6,15, 0,0.3,1);
  R.render(scene,cam);
  sx.drawImage(gl,0,0);
  // label
  sx.font='bold 30px Arial'; sx.textAlign='center';
  sx.lineWidth=5; sx.strokeStyle='rgba(0,0,0,0.55)'; sx.strokeText(label,360,438);
  sx.fillStyle='#ffffff'; sx.fillText(label,360,438);
};
window.startRec=function(){
  var mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm;codecs=vp8';
  window.__mime=mime;
  var stream=stage.captureStream(0); window.__track=stream.getVideoTracks()[0];
  window.__chunks=[];
  window.__rec=new MediaRecorder(stream,{mimeType:mime, videoBitsPerSecond:6000000});
  window.__rec.ondataavailable=function(e){ if(e.data&&e.data.size) window.__chunks.push(e.data); };
  window.__rec.start();
};
window.stopRec=async function(){
  await new Promise(function(res){ window.__rec.onstop=res; window.__rec.stop(); });
  var blob=new Blob(window.__chunks,{type:window.__mime});
  var buf=await blob.arrayBuffer(), by=new Uint8Array(buf), bin='';
  for(var i=0;i<by.length;i++) bin+=String.fromCharCode(by[i]);
  return { mime:window.__mime, b64:btoa(bin) };
};
window.push=function(){ window.__track.requestFrame(); };
window.__ready=true;
</script></body></html>`;
fs.writeFileSync(path.resolve(__dirname, '_ctl.html'), html);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 760, height: 500 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '_ctl.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__ready===true', { timeout: 30000 });
  await p.evaluate(() => window.startRec());

  // timeline: each segment ~3.3s. value = triangle/sine sweep.
  const dt = 1 / FPS;
  const segs = [
    { label: 'AILERONS  —  roll', cam: 'ail', ctl: t => [Math.sin(t * Math.PI * 2) , 0, 0], n: 105 },
    { label: 'ELEVATOR  —  pitch', cam: 'elev', ctl: t => [0, Math.sin(t * Math.PI * 2), 0], n: 105 },
    { label: 'RUDDER  —  yaw', cam: 'rud', ctl: t => [0, 0, Math.sin(t * Math.PI * 2)], n: 105 },
    { label: 'LANDING GEAR  —  retract / deploy', cam: 'gear', ctl: null, n: 120 }
  ];
  async function sleep(ms) { await new Promise(r => setTimeout(r, ms)); }
  for (const s of segs) {
    for (let f = 0; f < s.n; f++) {
      const t = f / s.n;
      let a = 0, e = 0, r = 0, gear = 0;
      if (s.ctl) { const v = s.ctl(t); a = v[0]; e = v[1]; r = v[2]; }
      else { gear = 0.5 - 0.5 * Math.cos(t * Math.PI * 2); }   // 0->1->0 smooth
      await p.evaluate(({ label, cam, a, e, r, gear }) => window.frame(label, cam, a, e, r, gear), { label: s.label, cam: s.cam, a, e, r, gear });
      await p.evaluate(() => window.push());
      await sleep(dt * 1000);
    }
  }
  const res = await p.evaluate(() => window.stopRec());
  const ext = res.mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  const outp = OUT.replace(/\.mp4$/, '.' + ext);
  fs.writeFileSync(outp, Buffer.from(res.b64, 'base64'));
  console.log('wrote', outp, (fs.statSync(outp).size / 1024).toFixed(0) + 'KB, mime=' + res.mime);
  console.log('errors:', errs.length, JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
