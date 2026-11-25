{
  const start = document.getElementById('real-start');
  const form = document.getElementById('real-form');
  const field = document.getElementById('real-command');
  const run = document.getElementById('real-run');
  const output = document.getElementById('real-output');
  const available = location.origin === 'http://127.0.0.1:4781';
  let cursor = 0;

  function write(message) {
    if (!message) return;
    const line = document.createElement('div');
    line.textContent = message.trimEnd();
    output.append(line);
    if (output.childElementCount > 200) output.firstElementChild.remove();
    output.scrollTop = output.scrollHeight;
  }

  function setConnected(connected) {
    start.disabled = connected;
    field.disabled = run.disabled = !connected;
  }

  async function request(path, body = '') {
    try {
      const response = await fetch('/local/' + path, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body
      });
      write((await response.json()).output);
      return response.ok;
    } catch {
      write('로컬 실습 서버에 연결할 수 없어요.');
      return false;
    }
  }

  async function poll() {
    try {
      const response = await fetch('/local/output?cursor=' + cursor, { cache: 'no-store' });
      const data = await response.json();
      write(data.output);
      cursor = data.cursor;
      if (data.running) setTimeout(poll, 200);
      else setConnected(false);
    } catch {
      setConnected(false);
      write('로컬 실습 서버 연결이 종료됐어요.');
    }
  }

  start.disabled = !available;
  if (!available) write('프로젝트 폴더에서 node local/server.mjs를 실행한 뒤 http://127.0.0.1:4781 에서 열어 주세요.');

  start.addEventListener('click', async () => {
    start.disabled = true;
    write('컨테이너 시작 중…');
    const ok = await request('start');
    setConnected(ok);
    if (!ok) return;
    write('리눅스 셸에 연결했어요. 종료하려면 exit를 입력하세요.');
    field.focus();
    poll();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const command = field.value.trim();
    if (!command || run.disabled) return;
    write('lab@linux $ ' + command);
    field.value = '';
    run.disabled = true;
    await request('command', command);
    run.disabled = field.disabled;
  });
}
