if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.error('Não foi possível preparar a instalação do Puxadas.', error));
  });
}

let deferredInstallPrompt = null;
const installButtons = [...document.querySelectorAll('[data-install-app]')];

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButtons.forEach(button => { button.hidden = false; });
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installButtons.forEach(button => { button.hidden = true; });
});

installButtons.forEach(button => {
  button.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButtons.forEach(item => { item.hidden = true; });
  });
});
