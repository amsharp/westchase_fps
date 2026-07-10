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

// ---- static game files + the WORLD BOT -----------------------------------
// The repo root (one level up) holds the game. Serving it here lets the
// server run a headless Chromium "world bot" that loads the game from its own
// origin and permanently hosts room MAIN — so the WORLD SIM lives on Railway
// and human players are never hosts. (It also means the game is playable
// straight from the relay URL.)
var GAME_DIR = path.resolve(__dirname, '..');
var MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain', '.ico': 'image/x-icon' };
function serveGameFile(pathname, res) {
  var rel = pathname === '/index.html' || pathname === '/game' ? 'index.html' : pathname.slice(1);
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(rel)) return false;   // flat files only, no dotfiles/traversal
  var ext = path.extname(rel).toLowerCase();
  if (!MIME[ext]) return false;
  var full = path.join(GAME_DIR, rel);
  try {
    var buf = fs.readFileSync(full);
    res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': 'no-cache' });
    res.end(buf);
    return true;
  } catch (e) { return false; }
}
// world-bot process manager: launch headless Chromium at /index.html?bot=1,
// relaunch (with backoff) if it dies. Requires BOT_ENABLE=1 + playwright.
var botRestarts = 0;
function startWorldBot() {
  if (process.env.BOT_ENABLE !== '1') { console.log('[BOT] disabled (set BOT_ENABLE=1 to run the world on this server)'); return; }
  var pw;
  try { pw = require('playwright'); } catch (e) { console.error('[BOT] playwright not installed — world bot disabled'); return; }
  var exe = process.env.BOT_CHROMIUM || undefined;   // Docker image ships browsers; sandbox tests override
  pw.chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] }).then(function (browser) {
    return browser.newContext({ viewport: { width: 128, height: 96 } }).then(function (ctx) {
      return ctx.addInitScript('window.WC_SERVER_URL = "ws://127.0.0.1:' + PORT + '";').then(function () { return ctx.newPage(); });
    }).then(function (page) {
      page.on('pageerror', function (e) { console.error('[BOT] pageerror', ('' + e).slice(0, 300)); });
      page.on('crash', function () { console.error('[BOT] page crashed'); browser.close().catch(function () {}); });
      browser.on('disconnected', function () {
        var delay = Math.min(60000, 2000 * Math.pow(2, botRestarts++));
        console.error('[BOT] browser gone — relaunching in ' + delay + 'ms');
        setTimeout(startWorldBot, delay);
      });
      return page.goto('http://127.0.0.1:' + PORT + '/index.html?bot=1', { waitUntil: 'domcontentloaded', timeout: 120000 }).then(function () {
        console.log('[BOT] world bot up — hosting room MAIN');
        setTimeout(function () { botRestarts = 0; }, 120000);   // stable for 2min = reset backoff
      });
    });
  }).catch(function (e) {
    var delay = Math.min(60000, 2000 * Math.pow(2, botRestarts++));
    console.error('[BOT] launch failed: ' + ('' + e).slice(0, 300) + ' — retry in ' + delay + 'ms');
    setTimeout(startWorldBot, delay);
  });
}
function newRoomCode() { var c; do { c = rid(4); } while (rooms[c]); return c; }
function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} } }

// ---- accounts: name + PIN progress saves on the volume (BUG_DIR sibling) ----
// register-on-first-auth; PIN stored as sha256(salt+pin); session tokens live
// in memory (relay restart = clients silently re-auth on next boot).
var crypto = require('crypto');
var ACCT_DIR = path.join(BUG_DIR, 'accounts');
try { fs.mkdirSync(ACCT_DIR, { recursive: true }); } catch (e) { console.error('acctdir', e && e.message); }
var acctTokens = {};      // token -> account key
var acctSaveGate = {};    // account key -> last save ms (rate limit)
function acctKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 12); }
function acctPath(key) { return path.join(ACCT_DIR, key + '.json'); }
// ---- outbound mail: Resend REST when RESEND_API_KEY is set; otherwise codes
// are logged server-side (dev mode — delivery off until the key is configured)
var RESEND_KEY = process.env.RESEND_API_KEY || '';
var MAIL_FROM = process.env.MAIL_FROM || 'Westchase <onboarding@resend.dev>';
function sendMail(to, subject, text, cb) {
  if (!RESEND_KEY) { console.log('[MAIL:dev — no RESEND_API_KEY] to=' + to + ' subj=' + subject + ' body=' + text); return cb(null, { dev: true }); }
  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: subject, text: text })
  }).then(function (r) { return r.json().then(function (j) { cb(r.ok ? null : new Error(j && j.message || 'mail failed'), j); }); })
    .catch(function (e) { cb(e); });
}
function emailOk(e) { return typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
function makeCode() { return ('' + (crypto.randomInt(0, 1000000))).padStart(6, '0'); }
function codeFresh(c) { return c && c.exp > Date.now() && (c.tries || 0) < 5; }
// per-IP limiter for code-sending + auth attempts (resets hourly)
var acctIpGate = {};
function ipAllowed(ip, budget) {
  var now = Date.now(), g = acctIpGate[ip];
  if (!g || now - g.t > 3600000) { g = acctIpGate[ip] = { n: 0, t: now }; }
  g.n++;
  return g.n <= budget;
}
function acctAuth(body, ip, cb) {
  var name = String(body.name || '').trim().slice(0, 12);
  var key = acctKey(name), pin = String(body.pin || '');
  if (key.length < 2) return cb(new Error('name must be 2-12 letters/numbers'));
  if (!/^[0-9]{4,8}$/.test(pin)) return cb(new Error('PIN must be 4-8 digits'));
  if (!ipAllowed(ip, 60)) return cb(new Error('too many attempts — try later'));
  var rec = null;
  try { rec = JSON.parse(fs.readFileSync(acctPath(key), 'utf8')); } catch (e) { }
  if (!rec) {
    var salt = crypto.randomBytes(8).toString('hex');
    rec = { name: name, salt: salt, hash: crypto.createHash('sha256').update(salt + pin).digest('hex'), created: new Date().toISOString(), save: null };
  } else if (crypto.createHash('sha256').update(rec.salt + pin).digest('hex') !== rec.hash) {
    return cb(new Error('wrong PIN for that name'));
  }
  // attach an email on sign-in when the account has none yet — kicks off a
  // 6-digit verification code; recovery only works once verified
  var emailPending = false;
  var em = String(body.email || '').trim().toLowerCase();
  if (em && !rec.email && emailOk(em)) {
    rec.email = em; rec.emailVerified = false;
    rec.codes = rec.codes || {};
    rec.codes.verify = { c: makeCode(), exp: Date.now() + 15 * 60000, tries: 0 };
    emailPending = true;
    sendMail(em, 'Westchase: verify your email',
      'Your Westchase verification code is ' + rec.codes.verify.c + '\nIt expires in 15 minutes.', function () { });
  }
  fs.writeFileSync(acctPath(key), JSON.stringify(rec));
  var token = crypto.randomBytes(16).toString('hex');
  acctTokens[token] = key;
  cb(null, {
    ok: true, token: token, name: rec.name, save: rec.save || null, savedAt: rec.savedAt || null,
    email: rec.email || null, emailVerified: !!rec.emailVerified, emailPending: emailPending
  });
}
function acctVerifyEmail(body, cb) {
  var key = acctTokens[String(body.token || '')];
  if (!key) return cb(new Error('bad session — sign in again'));
  var rec; try { rec = JSON.parse(fs.readFileSync(acctPath(key), 'utf8')); } catch (e) { return cb(new Error('account vanished')); }
  var vc = rec.codes && rec.codes.verify;
  if (!codeFresh(vc)) return cb(new Error('code expired — sign in again to resend'));
  vc.tries = (vc.tries || 0) + 1;
  if (String(body.code || '') !== vc.c) { fs.writeFileSync(acctPath(key), JSON.stringify(rec)); return cb(new Error('wrong code')); }
  rec.emailVerified = true; delete rec.codes.verify;
  fs.writeFileSync(acctPath(key), JSON.stringify(rec));
  cb(null, { ok: true, emailVerified: true });
}
function acctRecover(body, ip, cb) {
  if (!ipAllowed(ip, 10)) return cb(new Error('too many attempts — try later'));
  // response is IDENTICAL whether or not the account/email exists — no probing
  var generic = { ok: true, sent: true, note: 'if that account has a verified email, a code is on its way' };
  var key = acctKey(String(body.name || ''));
  var rec = null; try { rec = JSON.parse(fs.readFileSync(acctPath(key), 'utf8')); } catch (e) { }
  if (!rec || !rec.email || !rec.emailVerified) return cb(null, generic);
  rec.codes = rec.codes || {};
  rec.codes.recover = { c: makeCode(), exp: Date.now() + 15 * 60000, tries: 0 };
  fs.writeFileSync(acctPath(key), JSON.stringify(rec));
  sendMail(rec.email, 'Westchase: PIN reset code',
    'Your Westchase PIN reset code is ' + rec.codes.recover.c + '\nIt expires in 15 minutes. If you did not ask for this, ignore it.', function () { });
  cb(null, generic);
}
function acctResetPin(body, ip, cb) {
  if (!ipAllowed(ip, 15)) return cb(new Error('too many attempts — try later'));
  var key = acctKey(String(body.name || ''));
  var newPin = String(body.newPin || '');
  if (!/^[0-9]{4,8}$/.test(newPin)) return cb(new Error('new PIN must be 4-8 digits'));
  var rec = null; try { rec = JSON.parse(fs.readFileSync(acctPath(key), 'utf8')); } catch (e) { }
  var rc = rec && rec.codes && rec.codes.recover;
  if (!rec || !codeFresh(rc)) return cb(new Error('no valid reset code — request a new one'));
  rc.tries = (rc.tries || 0) + 1;
  if (String(body.code || '') !== rc.c) { fs.writeFileSync(acctPath(key), JSON.stringify(rec)); return cb(new Error('wrong code')); }
  rec.salt = crypto.randomBytes(8).toString('hex');
  rec.hash = crypto.createHash('sha256').update(rec.salt + newPin).digest('hex');
  delete rec.codes.recover;
  fs.writeFileSync(acctPath(key), JSON.stringify(rec));
  for (var t in acctTokens) if (acctTokens[t] === key) delete acctTokens[t];   // old sessions die with the old PIN
  cb(null, { ok: true, reset: true });
}
function acctSave(body, cb) {
  var key = acctTokens[String(body.token || '')];
  if (!key) return cb(new Error('bad session — sign in again'));
  var now = Date.now();
  if (acctSaveGate[key] && now - acctSaveGate[key] < 2000) return cb(null, { ok: true, throttled: true });
  var save = body.save;
  if (!save || typeof save !== 'object' || JSON.stringify(save).length > 32768) return cb(new Error('bad save payload'));
  var rec;
  try { rec = JSON.parse(fs.readFileSync(acctPath(key), 'utf8')); } catch (e) { return cb(new Error('account vanished')); }
  rec.save = save; rec.savedAt = new Date().toISOString();
  fs.writeFileSync(acctPath(key), JSON.stringify(rec));
  acctSaveGate[key] = now;
  cb(null, { ok: true, savedAt: rec.savedAt });
}

var httpServer = http.createServer(function (req, res) {
  var u = req.url.split('?'), pathname = u[0], qs = u[1] || '';
  if (req.method === 'OPTIONS') { corsHead(res, 204, 'text/plain'); res.end(); return; }
  // accounts: auth (register-on-first-login) + save
  if (pathname === '/acct' && req.method === 'POST') {
    readBody(req, 64 * 1024, function (err, body) {
      var fail = function (msg) { corsHead(res, 400, 'application/json'); res.end(JSON.stringify({ ok: false, error: msg })); };
      if (err) return fail(err.message);
      var b; try { b = JSON.parse(body); } catch (e) { return fail('bad json'); }
      var done = function (e2, out) { if (e2) return fail(e2.message); corsHead(res, 200, 'application/json'); res.end(JSON.stringify(out)); };
      var ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
      if (b.action === 'auth') acctAuth(b, ip, done);
      else if (b.action === 'save') acctSave(b, done);
      else if (b.action === 'verifyEmail') acctVerifyEmail(b, done);
      else if (b.action === 'recover') acctRecover(b, ip, done);
      else if (b.action === 'resetPin') acctResetPin(b, ip, done);
      else fail('unknown action');
    });
    return;
  }
  if (pathname === '/health') {
    var n = 0, players = 0;
    for (var k in rooms) { n++; var pr = rooms[k].peers; for (var pk in pr) if (!pr[pk].bot) players++; }   // humans only — the world bot isn't a player
    var nb = 0; try { nb = fs.readdirSync(BUG_DIR).filter(function (f) { return f.slice(-5) === '.json'; }).length; } catch (e) {}
    corsHead(res, 200, 'application/json');   // CORS: the game menu polls this for the players-online count
    res.end(JSON.stringify({ ok: true, rooms: n, players: players, bugs: nb }));
    return;
  }
  // the game itself (also what the local world bot loads)
  if (req.method === 'GET' && (pathname === '/' || pathname === '/game' || serveGameFile(pathname, res))) {
    if (pathname === '/' || pathname === '/game') serveGameFile('/index.html', res);
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
    // the ONE shared world: everyone joins room MAIN, no codes. The first
    // player in becomes the (invisible) host; when the host leaves, the
    // longest-connected peer is PROMOTED (see close handler) so the world
    // survives — the "dedicated server" feel with a listen-server engine.
    if (m.t === 'joinMain' && !ws.room) {
      var mroom = rooms.MAIN;
      var mid = rid(8);
      ws.room = 'MAIN'; ws.id = mid; ws.name = (m.name || '').slice(0, 16); ws.joinedAt = Date.now();
      ws.bot = m.bot === 1;   // the server's own world bot — excluded from player counts, preferred as host
      if (!mroom) {
        rooms.MAIN = { host: mid, peers: {} };
        rooms.MAIN.peers[mid] = ws;
        send(ws, { t: 'hosted', room: 'MAIN', id: mid, main: 1 });
      } else {
        mroom.peers[mid] = ws;
        send(ws, { t: 'joined', room: 'MAIN', id: mid, host: mroom.host });
        send(mroom.peers[mroom.host], { t: 'peer-join', id: mid, name: ws.name });
      }
      return;
    }
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
      var ids = Object.keys(r.peers);
      if (code === 'MAIN' && ids.length) {
        // the shared world survives its host: promote the world bot if one is
        // connected, else the longest-connected human — they convert their
        // mirrored world into the authoritative one
        var best = ids[0];
        for (var bi = 1; bi < ids.length; bi++) {
          var cand = r.peers[ids[bi]], cur = r.peers[best];
          if ((cand.bot && !cur.bot) || (cand.bot === cur.bot && (cand.joinedAt || 0) < (cur.joinedAt || 0))) best = ids[bi];
        }
        r.host = best;
        send(r.peers[best], { t: 'host-promote', room: code, oldHost: ws.id });
        for (var np in r.peers) if (np !== best) send(r.peers[np], { t: 'host-changed', host: best, oldHost: ws.id });
      } else {
        // coded rooms keep the old behavior: host left = room over
        for (var pid in r.peers) send(r.peers[pid], { t: 'host-left' });
        delete rooms[code];
      }
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

httpServer.listen(PORT, function () {
  console.log('Westchase relay server listening on :' + PORT);
  startWorldBot();
});
