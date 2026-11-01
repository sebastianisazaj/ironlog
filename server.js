// IronLog — optional LAN server. Zero dependencies (Node 18+).
//   node server.js            -> serve public/ on 0.0.0.0:8080 + device sync API
//   PORT=3000 node server.js  -> custom port
//
// The app in public/ is a static PWA and also runs on any static host (GitHub Pages, Netlify, Cloudflare Pages).
// This server only adds LAN sync between devices; the app hides that feature when /api/health is missing.
// Exercise data + photos: yuhonas/free-exercise-db (Unlicense / public domain).

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.join(__dirname, 'public');
const PROFILES = path.join(__dirname, 'data', 'profiles');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, ...extra });
  res.end(body);
}

function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const data = await fsp.readFile(file);
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
  } catch {
    send(res, 404, 'Not found');
  }
}

const PROFILE_RE = /^\/api\/profiles\/([a-z0-9_-]{1,32})$/;

const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  try {
    if (p === '/api/health') return send(res, 200, JSON.stringify({ ironlog: true }), MIME['.json']);

    // LAN sync: one JSON document per profile name, stored on this machine.
    const m = p.match(PROFILE_RE);
    if (m) {
      const file = path.join(PROFILES, `${m[1]}.json`);
      if (req.method === 'GET') {
        try { return send(res, 200, await fsp.readFile(file), MIME['.json']); }
        catch { return send(res, 404, '{}', MIME['.json']); }
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        const doc = JSON.parse(body); // validates JSON
        if (typeof doc !== 'object' || !doc || !Array.isArray(doc.workouts)) return send(res, 400, 'Bad document');
        await fsp.mkdir(PROFILES, { recursive: true });
        await fsp.writeFile(file + '.part', body);
        await fsp.rename(file + '.part', file);
        return send(res, 200, JSON.stringify({ ok: true, savedAt: Date.now() }), MIME['.json']);
      }
      return send(res, 405, 'Method not allowed');
    }

    if (p === '/api/profiles') {
      let names = [];
      try { names = (await fsp.readdir(PROFILES)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)); } catch {}
      return send(res, 200, JSON.stringify(names), MIME['.json']);
    }

    if (req.method === 'GET') return serveStatic(res, p);
    send(res, 405, 'Method not allowed');
  } catch (err) {
    console.error(req.method, p, err.message);
    if (!res.headersSent) send(res, 500, 'Server error');
  }
});

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map(i => i.address);
}

if (!fs.existsSync(path.join(PUBLIC, 'data', 'exercises.json'))) {
  console.error('Missing public/data/exercises.json');
  process.exit(1);
}
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  IronLog is running\n');
  console.log(`  This computer:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  Other devices:   http://${ip}:${PORT}`);
  console.log('');
});
