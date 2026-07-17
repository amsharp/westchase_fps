const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader','--no-sandbox'] });
  const p = await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|ERR_/.test(m.text()))errs.push('C '+m.text());});
  await p.goto('file://'+path.resolve(__dirname,'../../index.html'),{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>window.__wc&&window.__wc.scene,{timeout:60000});
  await p.evaluate(()=>{__wc.start();__wc.setWanted(0);__wc.state.hp=100;});
  // gear auto-retract: put airborne at alt 30, tick, gear should retract
  const gear = await p.evaluate(()=>{
    __wc.teleport(0,0);__wc.setYaw(0);__wc.spawnPlane();
    var pl=__wc.plane(); pl.onGround=false; pl.group.position.set(0,30,0);
    var nose=new THREE.Vector3(0,0,1).applyQuaternion(pl.group.quaternion);
    pl.vel.copy(nose).multiplyScalar(40); pl.throttle=1;
    var g0=__wc.planeState().gearT;
    for(var i=0;i<120;i++){__wc.planeMouse(0,8);__wc.stepLite(0.03);var s=__wc.planeState();if(!s)break;if(s.alt>34)break;}
    var s2=__wc.planeState();
    return {gearLow:g0, gearHigh:s2?s2.gearT:null, alt:s2?s2.alt:null};
  });
  console.log('gear: at-spawn='+gear.gearLow+'  after-climb(alt '+gear.alt+')='+gear.gearHigh, gear.gearHigh>0.6?'-> PASS auto-retract':'-> FAIL');
  // crash: crashPlane removes plane, kills pilot, spawns debris + scorch
  const crash = await p.evaluate(()=>{
    __wc.state.hp=100;__wc.state.dead=false;
    __wc.crashPlane();
    for(var i=0;i<3;i++)__wc.updatePlaneWorld(0.03);
    return {gone:!__wc.plane(), dead:__wc.state.dead, hp:__wc.state.hp, props:__wc.planeProps?__wc.planeProps():null};
  });
  console.log('crash: planeGone='+crash.gone+' pilotDead='+crash.dead+' hp='+crash.hp+' debris='+(crash.props?crash.props.debris:'?')+' scorch='+(crash.props?crash.props.scorch:'?'),
    (crash.gone&&crash.dead&&crash.props&&crash.props.debris>0)?'-> PASS':'-> FAIL');
  console.log('errors:',errs.length,JSON.stringify(errs.slice(0,5)));
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(2);});
