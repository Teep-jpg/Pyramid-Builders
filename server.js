// Pyramid Works relay: serves the game (index.html) and relays co-op messages over WebSocket.
// No dependencies. Needs Node 18+.  Run: node server.js   (PORT env var optional, default 3000)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 3000;
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 8;
const MAX_FRAME = 24 * 1024;          // largest message a client may send
const IDLE_MS = 75 * 1000;            // drop sockets that go silent (clients ping every 20 s)
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const CODE_RE = /^[a-z0-9]{3,12}$/;

const rooms = new Map();              // code -> Map(id -> client)

/* ---------------- static file ---------------- */
const indexPath = path.join(__dirname, 'index.html');
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/' || url === '/index.html') {
    fs.readFile(indexPath, (err, buf) => {
      if (err) { res.writeHead(500); res.end('index.html missing'); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(buf);
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
});

/* ---------------- minimal WebSocket (RFC 6455) ---------------- */
function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url.split('?')[0] !== '/ws' || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  onConnect(socket);
});

function onConnect(socket) {
  const c = {
    id: crypto.randomBytes(6).toString('hex'), socket, room: null, pres: {}, alive: true,
    tokens: 200, last: Date.now(), buf: Buffer.alloc(0), frag: null, closed: false,
    send(obj) { if (!c.closed) { try { socket.write(frame(0x1, Buffer.from(JSON.stringify(obj)))); } catch (e) {} } },
    close() { if (c.closed) return; c.closed = true; try { socket.write(frame(0x8, Buffer.alloc(0))); } catch (e) {} socket.destroy(); leave(c); },
  };
  socket.on('data', d => {
    c.buf = Buffer.concat([c.buf, d]);
    try { parse(c); } catch (e) { c.close(); }
  });
  socket.on('close', () => { c.closed = true; leave(c); });
  socket.on('error', () => { c.closed = true; leave(c); });
}

function parse(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f, off = 2;
    if (!masked) { c.close(); return; }                       // clients must mask
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > BigInt(MAX_FRAME)) { c.close(); return; } len = Number(big); off = 10; }
    if (len > MAX_FRAME) { c.close(); return; }
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4);
    const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
    c.buf = b.subarray(off + 4 + len);
    if (op === 0x8) { c.close(); return; }
    if (op === 0x9) { try { c.socket.write(frame(0xA, data)); } catch (e) {} continue; }
    if (op === 0xA) continue;
    let text;
    if (op === 0x1 || op === 0x2) { if (fin) text = data; else { c.frag = [data]; continue; } }
    else if (op === 0x0 && c.frag) {
      c.frag.push(data);
      if (c.frag.reduce((n, x) => n + x.length, 0) > MAX_FRAME) { c.close(); return; }
      if (!fin) continue;
      text = Buffer.concat(c.frag); c.frag = null;
    } else continue;
    onMessage(c, text.toString('utf8'));
  }
}

/* ---------------- rooms ---------------- */
function peersOf(room) {
  return [...room.values()].map(p => ({ id: p.id, d: p.pres }));
}
function broadcastPeers(room) {
  const list = peersOf(room);
  for (const p of room.values()) p.send({ t: 'peers', peers: list });
}
function leave(c) {
  if (!c.room) return;
  const room = rooms.get(c.room);
  c.room = null;
  if (!room) return;
  room.delete(c.id);
  if (room.size === 0) rooms.delete(c.roomCode); else broadcastPeers(room);
}

function onMessage(c, text) {
  const now = Date.now();
  c.tokens = Math.min(200, c.tokens + (now - c.last) * 0.1); c.last = now;   // 100 msgs/s refill, burst 200
  if (--c.tokens < 0) { c.close(); return; }
  c.alive = true;
  let o; try { o = JSON.parse(text); } catch (e) { return; }
  if (!o || typeof o !== 'object') return;

  if (o.t === 'ping') { c.send({ t: 'pong' }); return; }

  if (o.t === 'join') {
    if (c.room) return;
    const code = String(o.room || '').toLowerCase();
    if (!CODE_RE.test(code)) { c.send({ t: 'err', code: 'bad-code' }); return; }
    let room = rooms.get(code);
    if (o.mode === 'host') {
      if (room && room.size) { c.send({ t: 'err', code: 'exists' }); return; }
      if (!room) { room = new Map(); rooms.set(code, room); }
    } else {
      if (!room) { c.send({ t: 'err', code: 'no-room' }); return; }
    }
    if (room.size >= MAX_PLAYERS) { c.send({ t: 'err', code: 'full' }); return; }
    c.room = code; c.roomCode = code; room.set(c.id, c);
    c.send({ t: 'joined', id: c.id });
    broadcastPeers(room);
    return;
  }

  const room = c.room && rooms.get(c.room);
  if (!room) return;

  if (o.t === 'p') {                       // presence update
    const s = JSON.stringify(o.d || {});
    if (s.length > 400) return;
    c.pres = JSON.parse(s);
    broadcastPeers(room);
  } else if (o.t === 'm') {                // world message -> everyone else
    const out = { t: 'm', from: c.id, d: o.d };
    for (const p of room.values()) if (p !== c) p.send(out);
  }
}

setInterval(() => {                         // drop dead sockets
  for (const room of rooms.values()) for (const c of [...room.values()]) {
    if (!c.alive) c.close(); else c.alive = false;
  }
}, IDLE_MS);

server.listen(PORT, () => console.log('Pyramid Works listening on http://localhost:' + PORT));
