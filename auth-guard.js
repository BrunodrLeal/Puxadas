(async function loadPrivateWorkspace() {
  try {
    const sessionResponse = await fetch('/api/session');
    if (sessionResponse.status === 401) {
      window.location.replace('/login.html');
      return;
    }
    if (!sessionResponse.ok) throw new Error('Não foi possível verificar a sessão.');
    const account = await sessionResponse.json();
    const workspaceResponse = await fetch('/api/workspace');
    if (!workspaceResponse.ok) throw new Error('Não foi possível carregar os dados da empresa.');
    const saved = await workspaceResponse.json();
    window.puxadasAccount = account;
    window.puxadasInitialWorkspace = saved.workspace;
    document.querySelector('#account-name').textContent = `${account.companyName} · ${account.city}`;
    document.querySelector('#account-email').textContent = account.email;
    document.body.classList.remove('app-loading');
    const appScript = document.createElement('script');
    appScript.src = '/app.js';
    document.body.append(appScript);
  } catch (error) {
    document.body.classList.remove('app-loading');
    const message = document.querySelector('#connection-message');
    message.textContent = `${error.message} Verifique se o servidor está em execução.`;
    message.hidden = false;
    message.classList.add('visible');
  }
})();

document.querySelector('#logout-button').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.replace('/login.html');
});
