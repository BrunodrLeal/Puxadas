const STORAGE_KEY = 'rotina-estoque-v2';
const shelfTasks = Array.from({ length: 19 }, (_, index) => `Prateleira ${index + 1}`);
const cleaningTasks = ['Varrer o estoque', 'Passar pano no estoque'];
const allTasks = [...shelfTasks, ...cleaningTasks];
const inputs = [...document.querySelectorAll('.team-panel input')];
const resultElement = document.querySelector('#results');
const historyElement = document.querySelector('#history');
const messageElement = document.querySelector('#form-message');
const weekElement = document.querySelector('#week-number');
const clearButton = document.querySelector('#clear-history');

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      names: saved?.names && typeof saved.names === 'object' ? saved.names : {},
      firstGroup: saved?.firstGroup === 'b' ? 'b' : 'a',
      history: Array.isArray(saved?.history) ? saved.history : []
    };
  } catch {
    return { names: {}, firstGroup: 'a', history: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateWeek() {
  weekElement.textContent = String(state.history.length + 1);
}

function readTeams() {
  const teams = { a: [], b: [] };
  for (const input of inputs) {
    const name = input.value.trim();
    if (name) teams[input.dataset.team].push(name);
  }
  return teams;
}

function validateTeams(teams) {
  if (teams.a.length !== 3 || teams.b.length !== 3) {
    return 'Preencha os 3 nomes de cada grupo para fazer o sorteio.';
  }
  const normalized = [...teams.a, ...teams.b].map(name => name.toLocaleLowerCase('pt-BR'));
  if (new Set(normalized).size !== normalized.length) {
    return 'Cada pessoa precisa aparecer uma única vez nos grupos.';
  }
  return '';
}

function randomIndex(max) {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do { crypto.getRandomValues(value); } while (value[0] >= limit);
    return value[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function makeDraw(teams) {
  const previousHeavyGroup = state.history.at(-1)?.heavyGroup;
  const heavyGroup = previousHeavyGroup
    ? (previousHeavyGroup === 'a' ? 'b' : 'a')
    : state.firstGroup;
  const lightGroup = heavyGroup === 'a' ? 'b' : 'a';
  const shuffledTasks = shuffled(allTasks);
  const people = [
    ...teams[heavyGroup].map(name => ({ name, group: heavyGroup, tasks: [] })),
    ...teams[lightGroup].map(name => ({ name, group: lightGroup, tasks: [] }))
  ];
  let taskIndex = 0;
  for (const person of people) {
    const taskCount = person.group === heavyGroup ? 4 : 3;
    person.tasks = shuffledTasks.slice(taskIndex, taskIndex + taskCount);
    taskIndex += taskCount;
  }
  return {
    week: state.history.length + 1,
    teams,
    heavyGroup,
    people,
    createdAt: new Date().toISOString()
  };
}

function renderDraw(draw) {
  const groupCard = key => {
    const heavy = draw.heavyGroup === key;
    const assignedPeople = draw.people.filter(person => person.group === key);
    const totalTasks = assignedPeople.reduce((total, person) => total + person.tasks.length, 0);
    const personLists = assignedPeople.map(person => {
      const list = person.tasks.map(task => {
        const cleaning = cleaningTasks.includes(task);
        return `<li class="${cleaning ? 'cleaning' : ''}"><span class="task-check" aria-hidden="true">✓</span>${escapeHTML(task)}</li>`;
      }).join('');
      return `<section class="person-tasks"><h3>${escapeHTML(person.name)}<span>${person.tasks.length} tarefas</span></h3><ul class="task-list">${list}</ul></section>`;
    }).join('');
    return `<article class="result-card">
      <div class="result-head">
        <div class="result-team"><span class="team-symbol">${key.toUpperCase()}</span><span>Grupo ${key.toUpperCase()}<small class="workload">${heavy ? '4 tarefas por pessoa' : '3 tarefas por pessoa'}</small></span></div>
        <span class="task-count">${totalTasks} tarefas</span>
      </div>
      <div class="people-assignments">${personLists}</div>
    </article>`;
  };
  resultElement.innerHTML = `<div class="results-grid">${groupCard('a')}${groupCard('b')}</div>`;
}

function renderHistory() {
  if (!state.history.length) {
    historyElement.innerHTML = '<p class="history-empty">Os sorteios anteriores ficam guardados neste navegador.</p>';
    clearButton.hidden = true;
    return;
  }
  clearButton.hidden = false;
  historyElement.innerHTML = [...state.history].reverse().map(draw => {
    const heavy = draw.heavyGroup.toUpperCase();
    const light = (draw.heavyGroup === 'a' ? 'b' : 'a').toUpperCase();
    return `<article class="history-item"><span class="history-week">Semana ${draw.week}</span><span class="history-meta">Grupo ${heavy}: 12 tarefas (4 por pessoa) · Grupo ${light}: 9 tarefas (3 por pessoa)</span></article>`;
  }).join('');
}

function showLatestDraw() {
  const latest = state.history.at(-1);
  if (latest) renderDraw(latest);
  else resultElement.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true">✳</span><strong>Seu próximo sorteio aparece aqui</strong><span>Preencha os grupos e clique em “Sortear tarefas”.</span></div>';
}

inputs.forEach(input => {
  input.value = state.names[input.id] || '';
  input.addEventListener('input', () => {
    state.names[input.id] = input.value;
    saveState();
    messageElement.classList.remove('visible');
  });
});

document.querySelectorAll('input[name="firstGroup"]').forEach(radio => {
  radio.checked = radio.value === state.firstGroup;
  radio.addEventListener('change', () => {
    if (radio.checked) {
      state.firstGroup = radio.value;
      saveState();
    }
  });
});

document.querySelector('#draw-button').addEventListener('click', () => {
  const teams = readTeams();
  const error = validateTeams(teams);
  if (error) {
    messageElement.textContent = error;
    messageElement.classList.add('visible');
    return;
  }
  messageElement.classList.remove('visible');
  const draw = makeDraw(teams);
  state.history.push(draw);
  saveState();
  updateWeek();
  renderDraw(draw);
  renderHistory();
});

clearButton.addEventListener('click', () => {
  if (!window.confirm('Apagar todos os sorteios anteriores e começar novamente?')) return;
  state.history = [];
  saveState();
  updateWeek();
  showLatestDraw();
  renderHistory();
});

updateWeek();
renderHistory();
showLatestDraw();
