const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--no-sandbox'] });
  const p = await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.resolve(__dirname,'../index.html'),{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.__wc&&window.__wc.scene,{timeout:60000});
  const r = await p.evaluate(()=>{
    __wc.start(); __wc.setWanted(0); __wc.state.hp=100;
    // (1) open-ground walk at 60fps covers ~expected distance (fix must not over-slow normal play)
    __wc.teleport(0,0); __wc.player.y=1.6; __wc.setYaw(0); // face -z
    __wc.pressKey('KeyW',true); var sx=__wc.player.x, sz=__wc.player.z;
    for (var i=0;i<60;i++) __wc.stepLite(1/60);          // 1 second walking
    __wc.pressKey('KeyW',false);
    var dist=Math.hypot(__wc.player.x-sx, __wc.player.z-sz);
    // (2) sprint into a solid outdoor building at 10fps must NOT tunnel through it
    var L=__wc.landCollidersRef?__wc.landCollidersRef():null; var tun=null, tested=0;
    if(L){ for(var k=0;k<L.length;k++){ var c=L[k]; if(c.obb||c.lake) continue; var w=c.x1-c.x0,d=c.z1-c.z0; if(w<0.8||d<0.8||w>30||d>30) continue; // pick a normal building box
        var cx=(c.x0+c.x1)/2, cz=(c.z0+c.z1)/2, hw=w/2;
        __wc.player.x=cx-(hw+0.7); __wc.player.z=cz; __wc.player.y=1.6;
        __wc.pressKey('ShiftLeft',true); __wc.pressKey('KeyW',true);
        for(var f=0;f<25;f++){ __wc.setYaw(Math.atan2(-(cx-__wc.player.x),-(cz-__wc.player.z))); __wc.stepLite(1/10); }
        __wc.pressKey('KeyW',false); __wc.pressKey('ShiftLeft',false);
        tested++; if(__wc.player.x>cx+hw){ tun={k:k,endX:Math.round(__wc.player.x*100)/100,cx:Math.round(cx*100)/100}; break; }
        if(tested>=25) break;
    }}
    return { walkDist:Math.round(dist*100)/100, tunneled:tun, tested:tested };
  });
  console.log('open-ground 1s walk distance:', r.walkDist, '(expect ~5.0-5.2)');
  console.log('outdoor buildings sprint-tested:', r.tested, '| tunneled:', JSON.stringify(r.tunneled));
  console.log('errors:', errs.length);
  var ok = r.walkDist>4.7 && r.walkDist<5.4 && !r.tunneled && errs.length===0;
  console.log(ok?'PASS outdoor movement normal + buildings solid at low fps':'FAIL');
  await b.close(); process.exit(ok?0:1);
})().catch(e=>{console.error('FATAL',e);process.exit(2);});
