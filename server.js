const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT) || 4173;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify({ companies: {}, users: {} }, null, 2));

function readStore() {
  try {
    const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return { companies: store.companies || {}, users: store.users || {} };
  } catch {
    return { companies: {}, users: {} };
  }
}

function writeStore(store) {
  const temporaryFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, STORE_FILE);
}

function sendJson(response, status, data, extraHeaders = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  response.end(JSON.stringify(data));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('Corpo da solicitação muito grande.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('JSON inválido.')); }
    });
    request.on('error', reject);
  });
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function passwordMatches(password, user) {
  const candidate = Buffer.from(passwordHash(password, user.salt).hash, 'hex');
  const original = Buffer.from(user.passwordHash, 'hex');
  return candidate.length === original.length && crypto.timingSafeEqual(candidate, original);
}

function getSession(request) {
  const cookie = request.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)puxadas_session=([a-f0-9]+)/);
  if (!match) return null;
  const session = sessions.get(match[1]);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(match[1]);
    return null;
  }
  return { token: match[1], ...session };
}

function setSessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `puxadas_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

function text(value, maximum = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

async function handleApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/register') {
    const body = await readJson(request);
    const companyName = text(body.companyName, 100);
    const city = text(body.city, 80);
    const email = text(body.email, 160).toLocaleLowerCase('pt-BR');
    const password = typeof body.password === 'string' ? body.password : '';
    if (companyName.length < 2 || city.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(response, 400, { error: 'Informe a empresa, cidade e um e-mail válido.' });
    }
    if (password.length < 8) return sendJson(response, 400, { error: 'A senha precisa ter pelo menos 8 caracteres.' });

    const store = readStore();
    if (store.users[email]) return sendJson(response, 409, { error: 'Já existe uma conta com este e-mail.' });
    const companyId = crypto.randomUUID();
    const { salt, hash } = passwordHash(password);
    store.companies[companyId] = { id: companyId, name: companyName, city, workspace: null, createdAt: new Date().toISOString() };
    store.users[email] = { email, companyId, salt, passwordHash: hash, createdAt: new Date().toISOString() };
    writeStore(store);

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { email, companyId, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendJson(response, 201, { ok: true }, { 'Set-Cookie': setSessionCookie(token) });
  }

  if (request.method === 'POST' && url.pathname === '/api/login') {
    const body = await readJson(request);
    const email = text(body.email, 160).toLocaleLowerCase('pt-BR');
    const password = typeof body.password === 'string' ? body.password : '';
    const store = readStore();
    const user = store.users[email];
    if (!user || !passwordMatches(password, user)) return sendJson(response, 401, { error: 'E-mail ou senha incorretos.' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { email, companyId: user.companyId, expiresAt: Date.now() + SESSION_TTL_MS });
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': setSessionCookie(token) });
  }

  if (request.method === 'POST' && url.pathname === '/api/logout') {
    const session = getSession(request);
    if (session) sessions.delete(session.token);
    return sendJson(response, 200, { ok: true }, { 'Set-Cookie': 'puxadas_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  const session = getSession(request);
  if (request.method === 'GET' && url.pathname === '/api/session') {
    if (!session) return sendJson(response, 401, { error: 'Faça login para continuar.' });
    const store = readStore();
    const company = store.companies[session.companyId];
    if (!company) return sendJson(response, 401, { error: 'A empresa desta conta não existe.' });
    return sendJson(response, 200, {
      email: session.email,
      companyId: company.id,
      companyName: company.name,
      city: company.city
    });
  }

  if (url.pathname === '/api/workspace') {
    if (!session) return sendJson(response, 401, { error: 'Faça login para continuar.' });
    const store = readStore();
    const company = store.companies[session.companyId];
    if (!company) return sendJson(response, 401, { error: 'A empresa desta conta não existe.' });
    if (request.method === 'GET') return sendJson(response, 200, { workspace: company.workspace });
    if (request.method === 'PUT') {
      const body = await readJson(request);
      const workspace = body.workspace;
      if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
        return sendJson(response, 400, { error: 'Configuração inválida.' });
      }
      if (!Number.isSafeInteger(workspace.employeeCount) || workspace.employeeCount < 1 || workspace.employeeCount > 500) {
        return sendJson(response, 400, { error: 'A quantidade de funcionários deve ficar entre 1 e 500.' });
      }
      if (!workspace.taskConfig || !Number.isSafeInteger(workspace.taskConfig.shelfCount)
        || workspace.taskConfig.shelfCount < 0 || workspace.taskConfig.shelfCount > 5000) {
        return sendJson(response, 400, { error: 'A quantidade de prateleiras deve ficar entre 0 e 5.000.' });
      }
      if (!Array.isArray(workspace.history) || workspace.history.length > 10000) {
        return sendJson(response, 400, { error: 'Histórico inválido ou muito extenso.' });
      }
      company.workspace = body.workspace;
      company.updatedAt = new Date().toISOString();
      writeStore(store);
      return sendJson(response, 200, { ok: true });
    }
  }

  return sendJson(response, 404, { error: 'Rota não encontrada.' });
}

const publicFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/login.html', ['login.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/auth.js', ['auth.js', 'text/javascript; charset=utf-8']],
  ['/auth-guard.js', ['auth-guard.js', 'text/javascript; charset=utf-8']],
  ['/pwa.js', ['pwa.js', 'text/javascript; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/assets/mattos-logo.jpg', ['assets/mattos-logo.jpg', 'image/jpeg']],
  ['/assets/pwa-192.png', ['assets/pwa-192.png', 'image/png']],
  ['/assets/pwa-512.png', ['assets/pwa-512.png', 'image/png']]
]);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}` && request.headers.origin !== `https://${request.headers.host}`) {
        return sendJson(response, 403, { error: 'Origem não permitida.' });
      }
      return await handleApi(request, response, url);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Método não permitido.' });
    const file = publicFiles.get(url.pathname);
    if (!file) return sendJson(response, 404, { error: 'Arquivo não encontrado.' });
    const contents = fs.readFileSync(path.join(ROOT, file[0]));
    response.writeHead(200, {
      'Content-Type': file[1],
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      ...(url.pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {})
    });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: 'Ocorreu um erro no servidor.' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Puxadas disponível em http://127.0.0.1:${PORT}`);
  console.log('Os dados ficam na pasta local data/ e não são publicados pelo servidor.');
});
