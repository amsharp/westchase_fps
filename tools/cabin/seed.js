// Generate a clean isolated low-poly cabin seed image for Meshy image-to-3d.
const fs=require('fs');
const KEY=process.env.OPENAI_API_KEY;
const PROMPT = `A single 3D low-poly video game asset: a small rustic off-grid cabin / shack built from reclaimed PALLET WOOD. Horizontal wooden plank siding in mixed weathered tones (warm brown, pale tan, and a few charred dark planks). A CURVED corrugated galvanized METAL BARREL ROOF arching over the top with a slight overhang. A simple vertical wood-plank DOOR centered on the front gable wall. ONE small square WINDOW on the left side wall. The building sits flat on bare dirt. Rendered as an isolated object, 3/4 front-left camera angle showing the front wall and the left side wall and the roof, the ENTIRE building centered and fully visible with margin around it. Plain flat neutral light-grey studio background, soft even lighting, no shadows cast on background. PSX / early-3D game style, chunky low-poly geometry, simple flat posterized textures. No people, no tools, no picnic table, no clutter, no trees.`;
(async()=>{
  const r=await fetch('https://api.openai.com/v1/images/generations',{
    method:'POST',headers:{'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
    body:JSON.stringify({model:'gpt-image-1',prompt:PROMPT,size:'1024x1024',quality:'high',n:1})
  });
  const j=await r.json();
  if(!j.data){console.error('ERR',JSON.stringify(j).slice(0,500));process.exit(1);}
  fs.writeFileSync(process.argv[2]||'seed.png',Buffer.from(j.data[0].b64_json,'base64'));
  console.log('wrote',process.argv[2],'usage',JSON.stringify(j.usage||{}));
})();
