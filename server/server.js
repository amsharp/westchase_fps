'use strict';
// Westchase FPS — dedicated multiplayer RELAY server.
// Replaces PeerJS cloud signaling + P2P data channels: every client holds one
// WebSocket to this server, and the server routes messages within a "room".
// The game keeps its host-authoritative model — the first client in a room is
// the host (runs the world sim); the server just fans messages out. No WebRTC,
// no TURN/NAT, no peer-to-peer links.
//
// Wire protocol (JSON text frames):
//   client->server:
//     {t:'host', name?}                 create a room, become its host
//     {t:'join', room, name?}           join an existing room
//     {t:'msg', to, data}               relay a game message; to = 'host' | '*' | <peerId>
//   server->client:
//     {t:'hosted', room, id}            you are the host of <room>, your peer id is <id>
//     {t:'joined', room, id, host}      you joined <room>; your id + the host's id
//     {t:'peer-join', id, name}         a new peer joined your room (sent to existing peers)
//     {t:'peer-leave', id}              a peer left
//     {t:'host-left'}                   the host disconnected (room is closing)
//     {t:'msg', from, data}             a relayed game message from peer <from>
//     {t:'error', msg}                  fatal (e.g. room not found)

var http = require('http');
var fs = require('fs');
var path = require('path');
var WebSocketServer = require('ws').Server;

var PORT = process.env.PORT || 8080;
var rooms = Object.create(null);          // code -> { host, peers: {id: ws} }

function rid(n, alphabet) {
  var a = alphabet || 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no ambiguous chars
  var s = '';
  for (var i = 0; i < n; i++) s += a[(Math.random() * a.length) | 0];
  return s;
}

// ---- bug reports ----------------------------------------------------------
// In-game bug reports (screenshot + text + meta) POST to /bug and are stored
// for Claude to triage later. BUG_DIR should point at a Railway VOLUME (e.g.
// /data) so reports survive redeploys; falls back to ./bugdata for local dev.
var BUG_DIR = process.env.BUG_DIR || path.join(__dirname, 'bugdata');
var BUG_ADMIN_KEY = process.env.BUG_ADMIN_KEY || '';   // required to LIST/READ reports
try { fs.mkdirSync(BUG_DIR, { recursive: true }); } catch (e) { console.error('bugdir', e && e.message); }
function bugId() { return Date.now().toString(36) + '-' + rid(4, 'abcdefghijkmnpqrstuvwxyz23456789'); }
function readBody(req, cap, cb) {
  var chunks = [], len = 0, done = false;
  req.on('data', function (c) { if (done) return; len += c.length; if (len > cap) { done = true; cb(new Error('too large')); try { req.destroy(); } catch (e) {} return; } chunks.push(c); });
  req.on('end', function () { if (!done) { done = true; cb(null, Buffer.concat(chunks).toString('utf8')); } });
  req.on('error', function () { if (!done) { done = true; cb(new Error('read error')); } });
}
function saveBug(body, cb) {
  var m; try { m = JSON.parse(body); } catch (e) { return cb(new Error('bad json')); }
  if (!m || typeof m !== 'object') return cb(new Error('bad body'));
  var id = bugId();
  var rec = { id: id, ts: new Date().toISOString(), text: ('' + (m.text || '')).slice(0, 4000), meta: (m.meta && typeof m.meta === 'object') ? m.meta : {} };
  var img = '' + (m.img || '');
  var mm = img.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  try {
    if (mm) { var ext = mm[1] === 'jpeg' ? 'jpg' : mm[1]; fs.writeFileSync(path.join(BUG_DIR, id + '.' + ext), Buffer.from(mm[2], 'base64')); rec.img = id + '.' + ext; }
    fs.writeFileSync(path.join(BUG_DIR, id + '.json'), JSON.stringify(rec));
  } catch (e) { return cb(e); }
  console.log('[BUG] ' + id + ' :: ' + rec.text.slice(0, 120).replace(/\s+/g, ' ') + ' :: ' + JSON.stringify(rec.meta));
  cb(null, id);
}
function listBugs() {
  var out = [];
  try {
    fs.readdirSync(BUG_DIR).forEach(function (f) {
      if (f.slice(-5) !== '.json') return;
      try { var r = JSON.parse(fs.readFileSync(path.join(BUG_DIR, f), 'utf8')); out.push({ id: r.id, ts: r.ts, text: r.text, meta: r.meta, img: r.img || null }); } catch (e) {}
    });
  } catch (e) {}
  out.sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });   // newest first
  return out;
}
function corsHead(res, code, type) {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
}
function newRoomCode() { var c; do { c = rid(4); } while (rooms[c]); return c; }
function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} } }

var httpServer = http.createServer(function (req, res) {
  var u = req.url.split('?'), pathname = u[0], qs = u[1] || '';
  if (req.method === 'OPTIONS') { corsHead(res, 204, 'text/plain'); res.end(); return; }
  if (pathname === '/health' || pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    var n = 0; for (var k in rooms) n++;
    var nb = 0; try { nb = fs.readdirSync(BUG_DIR).filter(function (f) { return f.slice(-5) === '.json'; }).length; } catch (e) {}
    res.end(JSON.stringify({ ok: true, rooms: n, bugs: nb }));
    return;
  }
  // submit a bug report (public — anyone in-game can file one)
  if (pathname === '/bug' && req.method === 'POST') {
    readBody(req, 6 * 1024 * 1024, function (err, body) {
      if (err) { corsHead(res, 413, 'application/json'); res.end(JSON.stringify({ ok: false, error: err.message })); return; }
      saveBug(body, function (e2, id) {
        if (e2) { corsHead(res, 400, 'application/json'); res.end(JSON.stringify({ ok: false, error: e2.message })); return; }
        corsHead(res, 200, 'application/json'); res.end(JSON.stringify({ ok: true, id: id }));
      });
    });
    return;
  }
  // admin: list reports / fetch one / fetch its image (key-gated)
  var key = (qs.match(/(?:^|&)key=([^&]*)/) || [])[1] || '';
  key = decodeURIComponent(key);
  if (pathname === '/bugs' && req.method === 'GET') {
    if (!BUG_ADMIN_KEY || key !== BUG_ADMIN_KEY) { corsHead(res, 403, 'application/json'); res.end(JSON.stringify({ ok: false, error: 'forbidden' })); return; }
    corsHead(res, 200, 'application/json'); res.end(JSON.stringify({ ok: true, bugs: listBugs() }));
    return;
  }
  var bm = pathname.match(/^\/bug\/([A-Za-z0-9_.-]+)$/);
  if (bm && req.method === 'GET') {
    if (!BUG_ADMIN_KEY || key !== BUG_ADMIN_KEY) { corsHead(res, 403, 'application/json'); res.end(JSON.stringify({ ok: false, error: 'forbidden' })); return; }
    var name = bm[1];
    if (/\.(png|jpg|jpeg|webp)$/.test(name)) {
      try { var buf = fs.readFileSync(path.join(BUG_DIR, name)); res.writeHead(200, { 'Content-Type': 'image/' + (name.slice(-3) === 'png' ? 'png' : 'jpeg'), 'Access-Control-Allow-Origin': '*' }); res.end(buf); }
      catch (e) { res.writeHead(404); res.end('not found'); }
    } else {
      try { var j = fs.readFileSync(path.join(BUG_DIR, name.replace(/\.json$/, '') + '.json')); corsHead(res, 200, 'application/json'); res.end(j); }
      catch (e) { corsHead(res, 404, 'application/json'); res.end(JSON.stringify({ ok: false, error: 'not found' })); }
    }
    return;
  }
  res.writeHead(404); res.end('not found');
});

var wss = new WebSocketServer({ server: httpServer });

wss.on('connection', function (ws) {
  ws.isAlive = true;
  ws.on('pong', function () { ws.isAlive = true; });

  ws.on('message', function (raw) {
    var m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;

    // ---- room setup (before a peer is placed) ----
    if (m.t === 'host' && !ws.room) {
      var code = newRoomCode();
      var id = rid(8);
      rooms[code] = { host: id, peers: {} };
      rooms[code].peers[id] = ws;
      ws.room = code; ws.id = id; ws.name = (m.name || '').slice(0, 16);
      send(ws, { t: 'hosted', room: code, id: id });
      return;
    }
    if (m.t === 'join' && !ws.room) {
      var room = rooms[m.room];
      if (!room) { send(ws, { t: 'error', msg: 'Room not found' }); return; }
      var jid = rid(8);
      room.peers[jid] = ws;
      ws.room = m.room; ws.id = jid; ws.name = (m.name || '').slice(0, 16);
      send(ws, { t: 'joined', room: m.room, id: jid, host: room.host });
      // only the HOST manages peer connections (host-authoritative); other
      // clients learn about newcomers via the host's relayed state, so telling
      // them here would create phantom connections.
      send(room.peers[room.host], { t: 'peer-join', id: jid, name: ws.name });
      return;
    }

    // ---- message relay (peer must be in a room) ----
    if (m.t === 'msg' && ws.room) {
      var r = rooms[ws.room];
      if (!r) return;
      var out = { t: 'msg', from: ws.id, data: m.data };
      if (m.to === '*') {
        for (var q in r.peers) if (q !== ws.id) send(r.peers[q], out);
      } else if (m.to === 'host') {
        send(r.peers[r.host], out);
      } else {
        send(r.peers[m.to], out);
      }
    }
  });

  ws.on('close', function () {
    var code = ws.room; if (!code || !rooms[code]) return;
    var r = rooms[code];
    delete r.peers[ws.id];
    if (ws.id === r.host) {
      // host left: notify everyone and tear the room down
      for (var pid in r.peers) send(r.peers[pid], { t: 'host-left' });
      delete rooms[code];
    } else {
      // host-only (host then broadcasts 'bye' to clients at the game level)
      send(r.peers[r.host], { t: 'peer-leave', id: ws.id });
      if (Object.keys(r.peers).length === 0) delete rooms[code];
    }
  });
});

// drop dead sockets (and empty rooms) every 30s
setInterval(function () {
  wss.clients.forEach(function (ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false; try { ws.ping(); } catch (e) {}
  });
}, 30000);

httpServer.listen(PORT, function () { console.log('Westchase relay server listening on :' + PORT); });
