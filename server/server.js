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
var WebSocketServer = require('ws').Server;

var PORT = process.env.PORT || 8080;
var rooms = Object.create(null);          // code -> { host, peers: {id: ws} }

function rid(n, alphabet) {
  var a = alphabet || 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no ambiguous chars
  var s = '';
  for (var i = 0; i < n; i++) s += a[(Math.random() * a.length) | 0];
  return s;
}
function newRoomCode() { var c; do { c = rid(4); } while (rooms[c]); return c; }
function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} } }

var httpServer = http.createServer(function (req, res) {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    var n = 0; for (var k in rooms) n++;
    res.end(JSON.stringify({ ok: true, rooms: n }));
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
      // tell everyone already in the room (esp. the host) about the newcomer
      for (var pid in room.peers) if (pid !== jid) send(room.peers[pid], { t: 'peer-join', id: jid, name: ws.name });
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
      for (var pid2 in r.peers) send(r.peers[pid2], { t: 'peer-leave', id: ws.id });
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
