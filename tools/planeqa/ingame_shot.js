const { chromium } = require('playwright'); const path=require('path'),fs=require('fs');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:960,height:600}});
  await p.goto('file://'+path.resolve(__dirname,'../../index.html'),{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.__wc&&window.__wc.scene,{timeout:60000});
  await p.evaluate(()=>{__wc.start();__wc.setWanted(0);__wc.state.hp=100;__wc.setClock(70);});
  const st = await p.evaluate(()=>{
    __wc.teleport(0,0);__wc.setYaw(0);__wc.spawnPlane();
    var pl=__wc.plane();pl.onGround=false;pl.group.position.set(0,45,-40);
    var nose=new THREE.Vector3(0,0,1).applyQuaternion(pl.group.quaternion);
    pl.vel.copy(nose).multiplyScalar(38);pl.throttle=0.8;
    for(var i=0;i<50;i++){__wc.stepLite(0.03);}
    return __wc.planeState()||'crashed';
  });
  const url=await p.evaluate(()=>{__wc.renderer.render(__wc.scene,__wc.camera);return __wc.renderer.domElement.toDataURL('image/jpeg',0.9);});
  fs.writeFileSync(path.resolve(__dirname,'ingame_fly.jpg'),Buffer.from(url.split(',')[1],'base64'));
  console.log('state:',JSON.stringify(st));
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(2);});
