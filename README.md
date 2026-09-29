# Rotina do estoque

Aplicação web para empresas configurarem a equipe e sortear tarefas semanais do estoque.

## Como executar com login

É necessário ter o Node.js instalado. No PowerShell, abra esta pasta e execute:

```bash
node server.js
```

Abra [http://127.0.0.1:4173](http://127.0.0.1:4173), clique em **Cadastrar empresa**, preencha empresa, cidade, e-mail e senha e crie a conta. Depois, use o mesmo e-mail e senha para entrar.

Para instalar no Windows, abra o site no Microsoft Edge ou Google Chrome. Use o ícone de instalação na barra de endereço ou o botão **Instalar** da tela. No Android, use **Adicionar à tela inicial** no menu do navegador. O aplicativo abre numa janela própria, mas o servidor `node server.js` precisa continuar ativo neste computador.

O servidor cria a pasta `data/` para armazenar as contas e os dados de cada empresa. Não apague essa pasta se quiser preservar os cadastros. O arquivo está excluído do Git.

## Como usar

1. Defina a quantidade de funcionários e de prateleiras, marque se a equipe fará as tarefas de limpeza e clique em **Salvar configuração**.
2. Preencha os nomes dos funcionários. Os nomes devem ser únicos.
3. Clique em **Sortear tarefas**.
4. Consulte a distribuição individual e use **Ver semana** para abrir sorteios anteriores.

## Regras do sorteio

- Cada tarefa configurada aparece uma única vez por semana. A configuração permite de 0 a 5.000 prateleiras e as duas tarefas de limpeza são opcionais.
- A quantidade configurável de funcionários é de 1 a 500; as tarefas são divididas da forma mais equilibrada possível e as extras alternam com base no total recebido.
- As tarefas de cada funcionário não se repetem até ele completar seu ciclo individual, que considera a lista de tarefas da empresa. Ao completar o ciclo, somente o ciclo dessa pessoa reinicia.
- As tarefas extras são distribuídas considerando o total recebido por cada colaborador, para equilibrar a carga ao longo do tempo.

## Dados e tecnologias

O site é uma PWA instalável, feita com HTML, CSS, JavaScript e um servidor Node.js sem dependências externas. Senhas são armazenadas como hashes; sessões usam cookies `HttpOnly`. O servidor separa o histórico e os dados por empresa. Neste protótipo, os dados ficam no arquivo local `data/store.json`; o serviço está limitado ao próprio computador e ainda não foi publicado na internet. A instalação não transforma o site num `.exe` autônomo: o servidor local ainda é necessário.

## Arquivos

- `index.html`: estrutura da página.
- `login.html`: entrada e cadastro de empresas.
- `styles.css`: estilos e layout responsivo.
- `auth.js` e `auth-guard.js`: cadastro, login e proteção da área do sorteio.
- `server.js`: servidor local, autenticação e armazenamento separado por empresa.
- `manifest.webmanifest`, `sw.js` e `pwa.js`: instalação PWA, cache da interface e botão de instalação.
- `app.js`: validação dos nomes, distribuição equilibrada sem repetição individual e histórico.
