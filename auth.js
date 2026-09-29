const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const authMessage = document.querySelector('#auth-message');
const authTitle = document.querySelector('#auth-title');
const authDescription = document.querySelector('#auth-description');

function showForm(mode) {
  const registering = mode === 'register';
  loginForm.hidden = registering;
  registerForm.hidden = !registering;
  document.querySelector('#auth-switch').hidden = registering;
  document.querySelector('#login-switch').hidden = !registering;
  authTitle.textContent = registering ? 'Cadastre sua empresa' : 'Acesse sua conta';
  authDescription.textContent = registering
    ? 'Crie um acesso para salvar os sorteios da sua empresa separadamente.'
    : 'Entre para abrir o sorteio e o histórico da sua empresa.';
  authMessage.textContent = '';
  authMessage.classList.remove('visible');
}

async function submitAuth(form, endpoint) {
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = Object.fromEntries(new FormData(form));
  submitButton.disabled = true;
  submitButton.textContent = endpoint.endsWith('register') ? 'Criando conta…' : 'Entrando…';
  authMessage.textContent = '';
  authMessage.classList.remove('visible');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir o acesso.');
    window.location.assign('/');
  } catch (error) {
    authMessage.textContent = error.message === 'Failed to fetch'
      ? 'Não consegui conectar ao servidor. Inicie o servidor local e tente novamente.'
      : error.message;
    authMessage.classList.add('visible');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = endpoint.endsWith('register') ? 'Criar conta da empresa' : 'Entrar';
  }
}

document.querySelector('#show-register').addEventListener('click', () => showForm('register'));
document.querySelector('#show-login').addEventListener('click', () => showForm('login'));
loginForm.addEventListener('submit', event => {
  event.preventDefault();
  submitAuth(loginForm, '/api/login');
});
registerForm.addEventListener('submit', event => {
  event.preventDefault();
  submitAuth(registerForm, '/api/register');
});

fetch('/api/session').then(response => {
  if (response.ok) window.location.replace('/');
}).catch(() => {});
