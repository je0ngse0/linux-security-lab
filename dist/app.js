const element = id => document.getElementById(id);
const output = element('output');
const setting = element('setting');
const target = element('target');
const selected = new Set();
const scenarios = groups.flatMap(([category, rows]) => rows.map(
  ([title, risk, weak, strong, action, before, after, normal]) =>
    ({ title, category, risk, weak, strong, action, before, after, normal })
));

let server;
let serverNumber = 0;

function log(...entries) {
  for (const [message, kind] of entries) {
    const line = document.createElement('div');
    line.textContent = message || '\u00a0';
    line.className = kind || '';
    output.append(line);
  }
  output.scrollTop = output.scrollHeight;
}

function prompt(action) {
  return [`lab@${server.name}:~$ ${action}`, 'prompt'];
}

function updateSelection() {
  element('selection').textContent = `${selected.size}개 선택`;
  const button = element('create');
  button.disabled = !selected.size;
  button.textContent = server ? '새 가상 서버 만들기' : '가상 서버 만들기';
}

function renderNavigation() {
  const topics = element('topics');
  const query = element('search').value.trim().toLowerCase();
  const matches = scenarios.filter(item =>
    `${item.title} ${item.category}`.toLowerCase().includes(query)
  );
  topics.replaceChildren();
  const legend = document.createElement('legend');
  legend.textContent = '서버에 포함할 취약점';
  legend.className = 'visually-hidden';
  topics.append(legend);
  for (const [category] of groups) {
    const items = matches.filter(item => item.category === category);
    if (!items.length) continue;
    const heading = document.createElement('h3');
    heading.textContent = category;
    topics.append(heading);
    for (const item of items) {
      const label = document.createElement('label');
      label.className = 'topic-choice';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected.has(item);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(item);
        else selected.delete(item);
        updateSelection();
      });
      label.append(checkbox, item.title);
      topics.append(label);
    }
  }
  if (!matches.length) topics.append('일치하는 점검 항목이 없어요.');
}

function updateProgress() {
  const states = server ? [...server.states.values()] : [];
  const count = states.filter(state => state.verified).length;
  element('progress').textContent = `조치 확인 ${count} / ${states.length}`;
  const meter = element('meter');
  meter.max = states.length || 1;
  meter.value = count;
  meter.setAttribute('aria-label', '현재 서버 조치 확인 진행률');
}

function openTarget() {
  const { item, strong } = server.states.get(target.value);
  element('category').textContent = item.category;
  element('risk').textContent = item.risk;
  element('run').textContent = item.action;
  setting.replaceChildren(new Option(item.weak, 'weak'), new Option(item.strong, 'strong'));
  setting.value = strong ? 'strong' : 'weak';
}

element('create').addEventListener('click', () => {
  if (!selected.size) return;
  if (server && !window.confirm('새 서버를 만들면 현재 서버의 설정과 터미널 기록이 초기화됩니다. 새 서버를 만들까요?')) return;
  const items = scenarios.filter(item => selected.has(item));
  serverNumber += 1;
  server = {
    name: `linux-sim-${serverNumber}`,
    states: new Map(items.map(item => [item.title, { item, strong: false, verified: false }]))
  };
  element('title').textContent = server.name;
  element('terminal-name').textContent = `lab@${server.name}`;
  element('server-controls').hidden = false;
  element('hint').textContent = '전체 점검으로 서버 상태를 확인하고, 실습 항목을 골라 설정을 바꿔보세요.';
  target.replaceChildren(...items.map(item => new Option(item.title, item.title)));
  target.value = items[0].title;
  output.replaceChildren();
  log(prompt('가상 서버 생성'), [`취약점 ${items.length}개 적용`],
    ...items.map(item => [`  • ${item.title} · ${item.weak}`]));
  openTarget();
  updateSelection();
  updateProgress();
  if (matchMedia('(max-width:740px)').matches) element('title').scrollIntoView();
});

target.addEventListener('change', openTarget);

setting.addEventListener('change', () => {
  const state = server.states.get(target.value);
  state.strong = setting.value === 'strong';
  state.verified = false;
  log([''], prompt(`가상 설정 적용 · ${state.item.title}`), [setting.selectedOptions[0].text]);
  updateProgress();
});

function audit(states) {
  for (const state of states) {
    const { item, strong } = state;
    state.verified = strong;
    log([`${strong ? '양호' : '미흡'} · ${item.title}`, strong ? 'pass' : 'fail'],
      [strong ? item.after : item.before]);
    if (strong) log([`정상 동작  ${item.normal}`]);
  }
  updateProgress();
}

element('run').addEventListener('click', () => {
  const state = server.states.get(target.value);
  log([''], prompt(state.item.action));
  audit([state]);
});

element('audit').addEventListener('click', () => {
  log([''], prompt('전체 점검'));
  audit(server.states.values());
});

element('reset').addEventListener('click', () => {
  const state = server.states.get(target.value);
  state.strong = false;
  state.verified = false;
  openTarget();
  log([''], prompt(`설정 초기화 · ${state.item.title}`), [state.item.weak]);
  updateProgress();
});

element('search').addEventListener('input', renderNavigation);
element('title').textContent = '가상 서버 만들기';
log(['실습할 취약점을 체크한 뒤 가상 서버를 만들어 주세요.']);
renderNavigation();
updateSelection();
updateProgress();
