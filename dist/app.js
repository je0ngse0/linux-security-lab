const element = id => document.getElementById(id);
const topics = element('topics');
const output = element('output');
const setting = element('setting');
const sessions = new Map();
const scenarios = groups.flatMap(([category, rows]) => rows.map(
  ([title, risk, weak, strong, action, before, after, normal]) =>
    ({ title, category, risk, weak, strong, action, before, after, normal })
));
const storageKey = 'linux-security-lab.completed.v1';
const completed = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) {
    saved.filter(title => scenarios.some(item => item.title === title))
      .forEach(title => completed.add(title));
  }
} catch {
  // Progress is available in memory when browser storage is unavailable.
}

let active = scenarios[0];

function session() {
  if (!sessions.has(active.title)) {
    sessions.set(active.title, { selected: 'weak', lines: [], checkedWeak: false });
  }
  return sessions.get(active.title);
}

function updateProgress() {
  element('progress').textContent = `조치 확인 ${completed.size} / ${scenarios.length}`;
  element('meter').value = completed.size;
  element('meter').setAttribute('aria-label', '조치 확인 진행률');
  for (const button of topics.querySelectorAll('button')) {
    const done = completed.has(button.dataset.title);
    button.firstElementChild.textContent = done ? '✓' : '○';
    button.setAttribute('aria-label', `${button.dataset.title}, ${done ? '조치 확인' : '미완료'}`);
  }
}

function renderLog() {
  output.replaceChildren();
  for (const [text, kind] of session().lines) {
    const line = document.createElement('div');
    line.textContent = text || '\u00a0';
    line.className = kind || '';
    output.append(line);
  }
  output.scrollTop = output.scrollHeight;
}

function openScenario(item) {
  active = item;
  element('title').textContent = item.title;
  element('category').textContent = item.category;
  element('risk').textContent = item.risk;
  element('run').textContent = item.action;
  element('hint').textContent = '기본 설정으로 점검한 다음 설정값을 바꿔 같은 동작을 확인하세요.';
  setting.replaceChildren(new Option(item.weak, 'weak'), new Option(item.strong, 'strong'));
  setting.value = session().selected;
  if (!session().lines.length) {
    session().lines.push(
      ['lab@linux-sim:~$ 가상 서버 상태 확인', 'prompt'],
      [`현재 설정  ${item.weak}`],
      ['점검 버튼을 눌러 현재 설정의 동작을 관찰하세요.']
    );
  }
  for (const button of topics.querySelectorAll('button')) {
    button.setAttribute('aria-current', String(button.dataset.title === item.title));
  }
  renderLog();
}

function renderNavigation() {
  const query = element('search').value.trim().toLowerCase();
  topics.replaceChildren();
  for (const [category] of groups) {
    const matches = scenarios.filter(item =>
      item.category === category && `${item.title} ${category}`.toLowerCase().includes(query)
    );
    if (!matches.length) continue;
    const heading = document.createElement('h3');
    heading.textContent = category;
    topics.append(heading);
    for (const item of matches) {
      const button = document.createElement('button');
      button.dataset.title = item.title;
      button.setAttribute('aria-current', String(item === active));
      const marker = document.createElement('span');
      marker.className = 'marker';
      marker.setAttribute('aria-hidden', 'true');
      button.append(marker, item.title);
      button.addEventListener('click', () => {
        openScenario(item);
        if (matchMedia('(max-width:740px)').matches) {
          element('title').scrollIntoView({ block: 'start' });
        }
      });
      topics.append(button);
    }
  }
  if (!topics.childElementCount) topics.textContent = '일치하는 점검 항목이 없어요.';
  updateProgress();
}

setting.addEventListener('change', () => {
  session().selected = setting.value;
  session().lines.push([''], ['lab@linux-sim:~$ 가상 설정 적용', 'prompt'],
    [`현재 설정  ${active[setting.value]}`]);
  renderLog();
});

element('run').addEventListener('click', () => {
  const state = session();
  const strong = state.selected === 'strong';
  state.lines.push([''], [`lab@linux-sim:~$ ${active.action}`, 'prompt'],
    [strong ? '조치 후 · 양호' : '조치 전 · 미흡', strong ? 'pass' : 'fail'],
    [strong ? active.after : active.before]);
  if (strong) {
    state.lines.push([`정상 동작  ${active.normal}`]);
    if (state.checkedWeak) {
      completed.add(active.title);
      try { localStorage.setItem(storageKey, JSON.stringify([...completed])); } catch {}
      updateProgress();
    } else {
      state.lines.push(['완료하려면 기본 설정의 결과도 확인한 뒤 다시 점검하세요.']);
    }
  } else {
    state.checkedWeak = true;
  }
  renderLog();
});

element('reset').addEventListener('click', () => {
  sessions.delete(active.title);
  openScenario(active);
});

element('search').addEventListener('input', renderNavigation);
renderNavigation();
openScenario(active);
