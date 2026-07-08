const fs = require('fs');
let h = fs.readFileSync('index.html', 'utf8');
const tag = '<script src="game.js"></script>';
const inject = '<script>window.WC_REMAP_OVERRIDE=true;</script>\n'
  + '<script src="remapdata.js"></script>\n'
  + '<script src="houses.js"></script>\n';
h = h.replace(tag, inject + tag);
fs.writeFileSync('wctest.html', h);
console.log('wrote wctest.html; override present:', h.includes('WC_REMAP_OVERRIDE'), 'remapdata:', h.includes('remapdata.js'), 'houses:', h.includes('houses.js'));
