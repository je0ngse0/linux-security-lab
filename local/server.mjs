import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';

const docker = promisify(execFile);
const host = '127.0.0.1';
const port = 4781;
const origin = 'http://' + host + ':' + port;
const name = 'linux-security-lab-' + randomUUID();
const image = 'alpine:3.22';
const assets = new Map([
  ['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']],
  ['/shell.js', ['shell.js', 'text/javascript']], ['/scenarios.js', ['scenarios.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']]
]);
let shell;
let starting;
let history = '';
let end = 0;
const historyLimit = 64 * 1024;

function appendOutput(chunk) {
  end += chunk.length;
  history = (history + chunk).slice(-historyLimit);
}

async function startShell() {
  if (shell) return;
  if (!starting) {
    starting = (async () => {
      await docker('docker', ['run', '--rm', '--detach', '--name', name, '--network', 'none',
        '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--memory', '64m', '--cpus', '0.5', '--pids-limit', '32', '--user', '1000:1000',
        '--tmpfs', '/lab:rw,noexec,nosuid,nodev,uid=1000,gid=1000,mode=0700,size=8m',
        '--workdir', '/lab', image, 'sleep', '3600'], { timeout: 120000 });
      history = '';
      const child = spawn('docker', ['exec', '-i', name, '/bin/sh', '-s']);
      shell = child;
      child.stdin.on('error', () => {});
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8');
        stream.on('data', appendOutput);
      }
      child.on('error', error => appendOutput(error.message + '\n'));
      child.on('close', async () => {
        await removeContainer();
        if (shell === child) shell = undefined;
        appendOutput('\n셸이 종료됐어요. 컨테이너를 다시 시작할 수 있습니다.\n');
      });
    })().finally(() => { starting = undefined; });
  }
  await starting;
}

async function removeContainer() {
  await docker('docker', ['rm', '-f', name], { timeout: 5000 }).catch(() => {});
}

function reply(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readCommand(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 512) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

const server = createServer(async (req, res) => {
  if (req.headers.host !== host + ':' + port) return reply(res, 403, {});
  const [path, query] = req.url.split('?', 2);
  if (req.method === 'GET' && path === '/local/output') {
    const requested = Number(new URLSearchParams(query).get('cursor'));
    const offset = Math.max(0, Math.min(history.length, requested - (end - history.length)));
    const cursor = Number.isSafeInteger(requested) ? offset : 0;
    return reply(res, 200, { output: history.slice(cursor), cursor: end, running: Boolean(shell) });
  }
  if (req.method === 'GET' && assets.has(req.url)) {
    const [file, type] = assets.get(req.url);
    const body = await readFile(new URL('../dist/' + file, import.meta.url)).catch(() => null);
    if (!body) return reply(res, 404, {});
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    return res.end(body);
  }
  if (req.method !== 'POST' || !['/local/start', '/local/command'].includes(req.url)) {
    return reply(res, 404, {});
  }
  if (req.headers.origin !== origin || req.headers['content-type'] !== 'text/plain') {
    return reply(res, 403, {});
  }
  try {
    if (req.url === '/local/start') {
      await startShell();
      return reply(res, 200, { running: true });
    }
    const input = await readCommand(req);
    if (!shell || !shell.stdin.writable) return reply(res, 409, { output: '먼저 컨테이너를 시작하세요.' });
    if (input === null) return reply(res, 413, { output: '한 줄에 최대 512바이트를 입력할 수 있어요.' });
    if (shell.stdin.writableNeedDrain) return reply(res, 429, { output: '셸 입력이 처리될 때까지 잠시 기다려 주세요.' });
    shell.stdin.write(input + '\n');
    return reply(res, 202, {});
  } catch (error) {
    return reply(res, 503, { output: error.stderr || error.message });
  }
});

server.listen(port, host, () => console.log('실습실: ' + origin));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await removeContainer();
    process.exit(0);
  });
}
