const element = id => document.getElementById(id);
const setting = element('setting');
const target = element('target');
const selected = new Set();
const scenarios = groups.flatMap(([category, rows]) => rows.map(
  ([title, risk, weak, strong, action, before, after, normal]) =>
    ({ title, category, risk, weak, strong, action, before, after, normal })
));

let server;
let serverNumber = 0;

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
  const state = server.states.get(target.value);
  const { item, strong } = state;
  element('category').textContent = item.category;
  element('title').textContent = item.title;
  element('risk').textContent = item.risk;
  element('run').textContent = item.action;
  setting.replaceChildren(new Option(item.weak, 'weak'), new Option(item.strong, 'strong'));
  setting.value = strong ? 'strong' : 'weak';

  const steps = [
    `설정값을 「${item.weak}」로 두고 ‘${item.action}’을 실행하세요.`,
    `조치 전 결과를 확인하세요. ${item.before}.`,
    `「${item.strong}」로 바꾸고 같은 점검을 다시 실행하세요. 예상 결과는 ‘${item.after}’입니다.`,
    `‘정상 작업 실행’을 눌러 ‘${item.normal}’도 확인하세요.`
  ];
  element('steps').replaceChildren(...steps.map(text => {
    const step = document.createElement('li');
    step.textContent = text;
    return step;
  }));
  showResult();
}

function showResult() {
  const result = element('result');
  result.replaceChildren();
  const { before, after, normal } = server.states.get(target.value);
  for (const [label, text] of [['조치 전', before], ['조치 후', after], ['정상 작업', normal]]) {
    if (!text) continue;
    const row = document.createElement('p');
    const heading = document.createElement('strong');
    heading.textContent = label;
    row.append(heading, ' ', text);
    result.append(row);
  }
  result.hidden = !result.childElementCount;
}

element('create').addEventListener('click', () => {
  if (!selected.size) return;
  if (server && !window.confirm('새 서버를 만들면 현재 서버의 설정과 점검 결과이 초기화됩니다. 새 서버를 만들까요?')) return;
  const items = scenarios.filter(item => selected.has(item));
  serverNumber += 1;
  server = {
    name: `linux-sim-${serverNumber}`,
    states: new Map(items.map(item => [item.title, { item, strong: false, verified: false }]))
  };
  element('audit-result').hidden = true;
  element('server-controls').hidden = false;
  element('hint').textContent = `${server.name} · 실습 항목 ${items.length}개`;
  target.replaceChildren(...items.map(item => new Option(item.title, item.title)));
  target.value = items[0].title;
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
  state.normal = undefined;
  element('audit-result').hidden = true;
  showResult();
  updateProgress();
});

function audit(state) {
  if (state.strong) state.after = state.item.after;
  else state.before = state.item.before;
  state.verified = state.strong;
}

element('run').addEventListener('click', () => {
  audit(server.states.get(target.value));
  showResult();
  updateProgress();
});

element('normal').addEventListener('click', () => {
  const state = server.states.get(target.value);
  state.normal = state.item.normal;
  showResult();
});

element('audit').addEventListener('click', () => {
  const states = [...server.states.values()];
  states.forEach(audit);
  const result = element('audit-result');
  result.replaceChildren(...states.map(state => {
    const row = document.createElement('p');
    row.textContent = `${state.strong ? '양호' : '미흡'} · ${state.item.title}`;
    row.className = state.strong ? 'pass' : 'fail';
    return row;
  }));
  result.hidden = false;
  showResult();
  updateProgress();
});

element('reset').addEventListener('click', () => {
  const { item } = server.states.get(target.value);
  server.states.set(item.title, { item, strong: false, verified: false });
  element('audit-result').hidden = true;
  openTarget();
  updateProgress();
});

element('search').addEventListener('input', renderNavigation);
element('title').textContent = '가상 서버 만들기';
renderNavigation();
updateSelection();
updateProgress();
