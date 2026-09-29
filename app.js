const STORAGE_KEY = `rotina-estoque-v3-${window.puxadasAccount.companyId}`;
const LEGACY_STORAGE_KEY = 'rotina-estoque-v2';
const CLEANING_TASKS = ['Varrer o estoque', 'Passar pano no estoque'];
const MAX_EMPLOYEES = 500;
const MAX_SHELVES = 5000;
const resultElement = document.querySelector('#results');
const historyElement = document.querySelector('#history');
const messageElement = document.querySelector('#form-message');
const weekElement = document.querySelector('#week-number');
const clearButton = document.querySelector('#clear-history');
const employeeCountElement = document.querySelector('#employee-count');
const shelfCountElement = document.querySelector('#shelf-count');
const employeesGrid = document.querySelector('#employees-grid');
const configurationForm = document.querySelector('#configuration-form');

let state = loadState();
let allTasks = buildTaskList(state.taskConfig);
let selectedWeek = null;
let inputs = [];
let saveTimer = null;
let saveQueue = Promise.resolve();

function buildTaskList(config) {
  const shelves = Array.from({ length: config.shelfCount }, (_, index) => `Prateleira ${index + 1}`);
  return [...shelves, ...(config.includeSweep ? [CLEANING_TASKS[0]] : []), ...(config.includeMop ? [CLEANING_TASKS[1]] : [])];
}

function employeeIds(source) {
  const ids = new Set();
  for (let index = 1; index <= source.employeeCount; index += 1) ids.add(`p${index}`);
  for (const group of [source.names, source.cycles, source.taskCounts]) {
    for (const id of Object.keys(group || {})) if (/^p\d+$/.test(id)) ids.add(id);
  }
  for (const draw of source.history || []) {
    for (const person of draw.people || []) if (/^p\d+$/.test(person.id || '')) ids.add(person.id);
  }
  return [...ids].sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
}

function loadState() {
  try {
    let saved = window.puxadasInitialWorkspace || JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '{}');
    saved ||= {};
    const oldNames = saved.names && typeof saved.names === 'object' ? saved.names : {};
    const names = { ...oldNames };
    if (!names.p1) names.p1 = oldNames.a1 || '';
    if (!names.p2) names.p2 = oldNames.a2 || '';
    if (!names.p3) names.p3 = oldNames.a3 || '';
    if (!names.p4) names.p4 = oldNames.b1 || '';
    if (!names.p5) names.p5 = oldNames.b2 || '';
    if (!names.p6) names.p6 = oldNames.b3 || '';
    const count = Number(saved.employeeCount);
    const oldCleaning = Array.isArray(saved.taskConfig?.cleaningTasks) ? saved.taskConfig.cleaningTasks : null;
    const taskConfig = {
      shelfCount: Number.isSafeInteger(Number(saved.taskConfig?.shelfCount)) && Number(saved.taskConfig.shelfCount) >= 0
        ? Math.min(Number(saved.taskConfig.shelfCount), MAX_SHELVES) : 19,
      includeSweep: saved.taskConfig ? Boolean(saved.taskConfig.includeSweep) : oldCleaning ? oldCleaning.includes(CLEANING_TASKS[0]) : true,
      includeMop: saved.taskConfig ? Boolean(saved.taskConfig.includeMop) : oldCleaning ? oldCleaning.includes(CLEANING_TASKS[1]) : true
    };
    const next = {
      names,
      employeeCount: Number.isSafeInteger(count) && count > 0 ? Math.min(count, MAX_EMPLOYEES) : 6,
      taskConfig,
      history: Array.isArray(saved.history) ? saved.history : [],
      cycles: saved.cycles && typeof saved.cycles === 'object' ? saved.cycles : null,
      taskCounts: saved.taskCounts && typeof saved.taskCounts === 'object' ? saved.taskCounts : null,
      extraCursor: Number.isInteger(saved.extraCursor) && saved.extraCursor >= 0 ? saved.extraCursor : 0
    };
    restoreProgress(next, buildTaskList(taskConfig));
    normalizeCycles(next.cycles, buildTaskList(taskConfig));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return next;
  } catch {
    return {
      names: {}, employeeCount: 6,
      taskConfig: { shelfCount: 19, includeSweep: true, includeMop: true },
      history: [], cycles: {}, taskCounts: {}, extraCursor: 0
    };
  }
}

function restoreProgress(savedState, tasks) {
  const names = savedState.names;
  const ids = employeeIds(savedState);
  const cycles = savedState.cycles || {};
  const taskCounts = savedState.taskCounts || {};
  const namesToIds = new Map(Object.entries(names)
    .filter(([, name]) => typeof name === 'string' && name.trim())
    .map(([id, name]) => [name.trim().toLocaleLowerCase('pt-BR'), id]));

  for (const id of ids) {
    if (!cycles[id]) cycles[id] = { seenTasks: [], cyclesCompleted: 0 };
    if (!Array.isArray(cycles[id].seenTasks)) cycles[id].seenTasks = [];
    if (!Number.isFinite(Number(taskCounts[id]))) taskCounts[id] = 0;
  }

  if (!savedState.cycles || !savedState.taskCounts) {
    const derivedCycles = Object.fromEntries(ids.map(id => [id, { seenTasks: [], cyclesCompleted: 0 }]));
    const derivedCounts = Object.fromEntries(ids.map(id => [id, 0]));
    for (const draw of savedState.history) {
      for (const person of draw.people || []) {
        const id = person.id || namesToIds.get(String(person.name || '').trim().toLocaleLowerCase('pt-BR'));
        if (!ids.includes(id)) continue;
        const personTasks = Array.isArray(person.tasks) ? person.tasks : [];
        derivedCounts[id] += personTasks.length;
        for (const task of personTasks) {
          if (!tasks.includes(task) || !tasks.length) continue;
          const cycle = derivedCycles[id];
          if (tasks.every(item => cycle.seenTasks.includes(item))) {
            cycle.seenTasks = [];
            cycle.cyclesCompleted += 1;
          }
          if (!cycle.seenTasks.includes(task)) cycle.seenTasks.push(task);
          if (tasks.every(item => cycle.seenTasks.includes(item))) {
            cycle.seenTasks = [];
            cycle.cyclesCompleted += 1;
          }
        }
      }
    }
    if (!savedState.cycles) Object.assign(cycles, derivedCycles);
    if (!savedState.taskCounts) Object.assign(taskCounts, derivedCounts);
  }
  savedState.cycles = cycles;
  savedState.taskCounts = taskCounts;
}

function normalizeCycles(cycles, tasks) {
  for (const cycle of Object.values(cycles)) {
    cycle.seenTasks = [...new Set(cycle.seenTasks)];
    if (tasks.length && tasks.every(task => cycle.seenTasks.includes(task))) {
      cycle.seenTasks = [];
      cycle.cyclesCompleted = (Number(cycle.cyclesCompleted) || 0) + 1;
    }
  }
}

function cycleIsComplete(cycle) {
  return allTasks.length > 0 && allTasks.every(task => cycle.seenTasks.includes(task));
}

function saveState(immediate = false) {
  const payload = JSON.stringify(state);
  try {
    if (payload.length < 1_000_000) localStorage.setItem(STORAGE_KEY, payload);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* O servidor é o armazenamento principal; o cache local é opcional. */ }
  clearTimeout(saveTimer);
  const persist = () => {
    saveQueue = saveQueue.then(async () => {
      const response = await fetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: JSON.parse(payload) })
      });
      if (!response.ok) throw new Error('Não foi possível salvar no servidor.');
    }).catch(error => {
      messageElement.classList.remove('success');
      messageElement.textContent = `${error.message} Seus dados permanecem temporariamente neste navegador.`;
      messageElement.classList.add('visible');
    });
  };
  if (immediate) persist();
  else saveTimer = setTimeout(persist, 250);
}

function updateTaskSummary() {
  const cleaning = allTasks.filter(task => CLEANING_TASKS.includes(task));
  const details = [`${state.taskConfig.shelfCount} ${state.taskConfig.shelfCount === 1 ? 'prateleira' : 'prateleiras'}`];
  if (cleaning.length) details.push(cleaning.join(' e '));
  document.querySelector('#task-summary').textContent = `${allTasks.length} tarefas (${details.join(' + ')}) serão distribuídas entre ${state.employeeCount} funcionários, respeitando o ciclo individual.`;
  document.querySelector('#footer-shelf-count').textContent = details[0];
  document.querySelector('#footer-cleaning-tasks').textContent = cleaning.length ? cleaning.join(' · ') : 'Sem tarefas de limpeza';
}

function updateConfigurationFields() {
  employeeCountElement.value = String(state.employeeCount);
  shelfCountElement.value = String(state.taskConfig.shelfCount);
  document.querySelector('#include-sweep').checked = state.taskConfig.includeSweep;
  document.querySelector('#include-mop').checked = state.taskConfig.includeMop;
}

function renderEmployeeFields() {
  const existingValues = Object.fromEntries(inputs.map(input => [input.id, input.value]));
  for (const [id, value] of Object.entries(existingValues)) state.names[id] = value;
  employeesGrid.innerHTML = Array.from({ length: state.employeeCount }, (_, index) => {
    const id = `p${index + 1}`;
    const name = escapeHTML(state.names[id] || '');
    return `<label class="employee-field" for="${id}">Funcionário ${index + 1}<input id="${id}" value="${name}" placeholder="Nome do funcionário" maxlength="60" autocomplete="off"></label>`;
  }).join('');
  inputs = [...employeesGrid.querySelectorAll('input')];
  inputs.forEach(input => {
    let nameBeforeEdit = input.value;
    input.addEventListener('focus', () => { nameBeforeEdit = input.value; });
    input.addEventListener('input', () => {
      state.names[input.id] = input.value;
      saveState();
      messageElement.classList.remove('visible');
      messageElement.classList.remove('success');
    });
    input.addEventListener('change', () => {
      const oldName = nameBeforeEdit.trim().toLocaleLowerCase('pt-BR');
      const newName = input.value.trim().toLocaleLowerCase('pt-BR');
      if (oldName && oldName !== newName) {
        state.cycles[input.id] = { seenTasks: [], cyclesCompleted: 0 };
        state.taskCounts[input.id] = 0;
      }
      saveState();
    });
  });
}

function readEmployees() {
  return inputs.map(input => ({ id: input.id, name: input.value.trim() }));
}

function validateEmployees(employees) {
  if (!Number.isSafeInteger(state.employeeCount) || state.employeeCount < 1 || state.employeeCount > MAX_EMPLOYEES) {
    return `Informe uma quantidade de funcionários entre 1 e ${MAX_EMPLOYEES}.`;
  }
  if (employees.some(person => !person.name)) return `Preencha os nomes dos ${state.employeeCount} funcionários ativos.`;
  const normalized = employees.map(person => person.name.toLocaleLowerCase('pt-BR'));
  if (new Set(normalized).size !== normalized.length) return 'Cada funcionário precisa ter um nome único.';
  if (!allTasks.length) return 'Cadastre ao menos uma prateleira ou uma tarefa de limpeza antes de sortear.';
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

function getWeeklyLoads(employees) {
  const baseLoad = Math.floor(allTasks.length / employees.length);
  const extraCount = allTasks.length % employees.length;
  const cursor = state.extraCursor % employees.length;
  const tieOrder = new Map(employees.map((person, index) => [person.id, (index - cursor + employees.length) % employees.length]));
  const sorted = [...employees].sort((left, right) =>
    (Number(state.taskCounts[left.id]) || 0) - (Number(state.taskCounts[right.id]) || 0)
    || tieOrder.get(left.id) - tieOrder.get(right.id));
  const loads = Object.fromEntries(employees.map(person => [person.id, baseLoad]));
  sorted.slice(0, extraCount).forEach(person => { loads[person.id] += 1; });
  return { loads, extraCount, sorted };
}

function cloneCycles(employees) {
  return Object.fromEntries(employees.map(person => [person.id, {
    seenTasks: [...(state.cycles[person.id]?.seenTasks || [])],
    cyclesCompleted: Number(state.cycles[person.id]?.cyclesCompleted) || 0
  }]));
}

function findAssignment(employees, loads) {
  if (allTasks.length > 40) return findLargeAssignment(employees, loads);
  const cycles = cloneCycles(employees);
  const remaining = { ...loads };
  const assignments = Object.fromEntries(employees.map(person => [person.id, []]));
  let visits = 0;

  function candidatesFor(task) {
    return shuffled(employees.filter(person => {
      if (remaining[person.id] <= 0) return false;
      const cycle = cycles[person.id];
      return cycleIsComplete(cycle) || !cycle.seenTasks.includes(task);
    }));
  }

  function search(remainingTasks) {
    visits += 1;
    if (visits > 120000) return false;
    if (!remainingTasks.length) return true;
    let selectedTask;
    let selectedCandidates;
    for (const task of remainingTasks) {
      const candidates = candidatesFor(task);
      if (!selectedCandidates || candidates.length < selectedCandidates.length) {
        selectedTask = task;
        selectedCandidates = candidates;
      }
      if (!candidates.length) return false;
    }
    const nextTasks = remainingTasks.filter(task => task !== selectedTask);
    for (const person of selectedCandidates) {
      const cycle = cycles[person.id];
      const previousSeen = [...cycle.seenTasks];
      const previousCompleted = cycle.cyclesCompleted;
      if (cycleIsComplete(cycle)) {
        cycle.seenTasks = [];
        cycle.cyclesCompleted += 1;
      }
      cycle.seenTasks.push(selectedTask);
      if (cycleIsComplete(cycle)) {
        cycle.seenTasks = [];
        cycle.cyclesCompleted += 1;
      }
      remaining[person.id] -= 1;
      assignments[person.id].push(selectedTask);
      if (search(nextTasks)) return true;
      assignments[person.id].pop();
      remaining[person.id] += 1;
      cycle.seenTasks = previousSeen;
      cycle.cyclesCompleted = previousCompleted;
    }
    return false;
  }
  return search(shuffled(allTasks)) ? { cycles, assignments } : null;
}

function findLargeAssignment(employees, loads) {
  const originalCycles = cloneCycles(employees);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const cycles = Object.fromEntries(Object.entries(originalCycles).map(([id, cycle]) => [id, {
      seenTasks: [...cycle.seenTasks], cyclesCompleted: cycle.cyclesCompleted
    }]));
    const remaining = { ...loads };
    const assignments = Object.fromEntries(employees.map(person => [person.id, []]));
    const initialOptions = new Map(allTasks.map(task => [task, employees.filter(person => {
      const cycle = cycles[person.id];
      return loads[person.id] > 0 && (cycleIsComplete(cycle) || !cycle.seenTasks.includes(task));
    }).length]));
    const tasks = shuffled(allTasks).sort((left, right) => initialOptions.get(left) - initialOptions.get(right));
    let failed = false;
    for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
      const task = tasks[taskIndex];
      const candidates = shuffled(employees.filter(person => {
        const cycle = cycles[person.id];
        return remaining[person.id] > 0 && (cycleIsComplete(cycle) || !cycle.seenTasks.includes(task));
      }));
      if (!candidates.length) { failed = true; break; }
      const person = candidates.sort((left, right) => remaining[right.id] - remaining[left.id])[0];
      const cycle = cycles[person.id];
      if (cycleIsComplete(cycle)) {
        cycle.seenTasks = [];
        cycle.cyclesCompleted += 1;
      }
      cycle.seenTasks.push(task);
      if (cycleIsComplete(cycle)) {
        cycle.seenTasks = [];
        cycle.cyclesCompleted += 1;
      }
      remaining[person.id] -= 1;
      assignments[person.id].push(task);
    }
    if (!failed && Object.values(remaining).every(count => count === 0)) return { cycles, assignments };
  }
  return null;
}

function makeDraw(employees) {
  const { loads, extraCount, sorted } = getWeeklyLoads(employees);
  const plan = findAssignment(employees, loads);
  if (!plan) return null;
  for (const person of employees) state.taskCounts[person.id] = (Number(state.taskCounts[person.id]) || 0) + loads[person.id];
  state.cycles = { ...state.cycles, ...plan.cycles };
  if (extraCount) {
    const lastExtraPerson = sorted[extraCount - 1];
    state.extraCursor = (employees.findIndex(person => person.id === lastExtraPerson.id) + 1) % employees.length;
  }
  return {
    week: state.history.length + 1,
    taskCount: allTasks.length,
    people: employees.map(person => ({ ...person, tasks: plan.assignments[person.id] })),
    createdAt: new Date().toISOString()
  };
}

function renderDraw(draw) {
  const cards = draw.people.map(person => {
    const list = person.tasks.map(task => {
      const cleaning = CLEANING_TASKS.includes(task);
      return `<li class="${cleaning ? 'cleaning' : ''}"><span class="task-check" aria-hidden="true">✓</span>${escapeHTML(task)}</li>`;
    }).join('');
    return `<article class="result-card">
      <div class="result-head">
        <div class="result-team"><span class="team-symbol">${escapeHTML(person.name.slice(0, 1).toUpperCase())}</span><span>${escapeHTML(person.name)}<small class="workload">Tarefas desta semana</small></span></div>
        <span class="task-count">${person.tasks.length} ${person.tasks.length === 1 ? 'tarefa' : 'tarefas'}</span>
      </div>
      <ul class="task-list">${list}</ul>
    </article>`;
  }).join('');
  resultElement.innerHTML = `<h3 class="displayed-week">Resultado da semana ${draw.week}</h3><div class="results-grid">${cards}</div>`;
}

function renderHistory() {
  if (!state.history.length) {
    historyElement.innerHTML = '<p class="history-empty">Os sorteios anteriores ficam guardados para esta empresa.</p>';
    clearButton.hidden = true;
    return;
  }
  clearButton.hidden = false;
  historyElement.innerHTML = [...state.history].reverse().map(draw => {
    const selected = Number(selectedWeek) === Number(draw.week);
    const count = draw.people?.length || 0;
    const taskCount = draw.taskCount ?? (draw.people || []).reduce((sum, person) => sum + (person.tasks?.length || 0), 0);
    return `<article class="history-item${selected ? ' selected' : ''}"><span class="history-week">Semana ${draw.week}</span><span class="history-meta">${count} funcionários · ${taskCount} tarefas</span><button class="history-view" type="button" data-week="${draw.week}" aria-pressed="${selected}">${selected ? 'Exibindo' : 'Ver semana'}</button></article>`;
  }).join('');
}

function showLatestDraw() {
  const latest = state.history.at(-1);
  selectedWeek = latest?.week ?? null;
  if (latest) renderDraw(latest);
  else resultElement.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true">✳</span><strong>Seu próximo sorteio aparece aqui</strong><span>Preencha os nomes e clique em “Sortear tarefas”.</span></div>';
  renderHistory();
}

function applySettings() {
  messageElement.classList.remove('success');
  const count = Number(employeeCountElement.value);
  const shelfCount = Number(shelfCountElement.value);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_EMPLOYEES) {
    messageElement.textContent = `Informe de 1 a ${MAX_EMPLOYEES} funcionários.`;
    messageElement.classList.add('visible');
    return;
  }
  if (!Number.isSafeInteger(shelfCount) || shelfCount < 0 || shelfCount > MAX_SHELVES) {
    messageElement.textContent = `Informe de 0 a ${MAX_SHELVES} prateleiras.`;
    messageElement.classList.add('visible');
    return;
  }
  state.employeeCount = count;
  state.taskConfig = {
    shelfCount,
    includeSweep: document.querySelector('#include-sweep').checked,
    includeMop: document.querySelector('#include-mop').checked
  };
  allTasks = buildTaskList(state.taskConfig);
  normalizeCycles(state.cycles, allTasks);
  renderEmployeeFields();
  updateTaskSummary();
  saveState(true);
  messageElement.classList.remove('visible');
  messageElement.textContent = 'Configuração salva para esta empresa.';
  messageElement.classList.add('visible');
  messageElement.classList.add('success');
}

function updateWeek() {
  weekElement.textContent = String(state.history.length + 1);
}

updateConfigurationFields();
renderEmployeeFields();
updateTaskSummary();
configurationForm.addEventListener('submit', event => {
  event.preventDefault();
  applySettings();
});

document.querySelector('#draw-button').addEventListener('click', () => {
  const employees = readEmployees();
  const error = validateEmployees(employees);
  if (error) {
    messageElement.classList.remove('success');
    messageElement.classList.remove('success');
    messageElement.textContent = error;
    messageElement.classList.add('visible');
    return;
  }
  const draw = makeDraw(employees);
  if (!draw) {
    messageElement.classList.remove('success');
    messageElement.textContent = 'Não foi possível montar uma semana sem repetir tarefas antes do ciclo individual completar. Nenhum ciclo foi alterado.';
    messageElement.classList.add('visible');
    return;
  }
  messageElement.classList.remove('visible');
  state.history.push(draw);
  selectedWeek = draw.week;
  saveState(true);
  updateWeek();
  renderDraw(draw);
  renderHistory();
});

clearButton.addEventListener('click', () => {
  if (!window.confirm('Apagar todos os sorteios e reiniciar os ciclos individuais?')) return;
  state.history = [];
  state.cycles = Object.fromEntries(employeeIds(state).map(id => [id, { seenTasks: [], cyclesCompleted: 0 }]));
  state.taskCounts = Object.fromEntries(employeeIds(state).map(id => [id, 0]));
  state.extraCursor = 0;
  saveState(true);
  updateWeek();
  showLatestDraw();
});

historyElement.addEventListener('click', event => {
  const button = event.target.closest('.history-view');
  if (!button) return;
  const draw = state.history.find(item => Number(item.week) === Number(button.dataset.week));
  if (!draw) return;
  selectedWeek = draw.week;
  renderDraw(draw);
  renderHistory();
  document.querySelector('#draw-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

updateWeek();
showLatestDraw();
