# Rotina do estoque

Aplicação web simples para sortear e distribuir as tarefas semanais do estoque entre duas equipes.

## Como executar

Não é necessário instalar dependências ou compilar o projeto. Abra o arquivo `index.html` no navegador.

Opcionalmente, você pode iniciar um servidor local na pasta do projeto:

```bash
py -m http.server 8000
```

Depois, acesse [http://localhost:8000](http://localhost:8000).

## Como usar

1. Informe os nomes das três pessoas do Grupo A e das três pessoas do Grupo B. Os nomes devem ser únicos.
2. Escolha qual grupo começa com mais tarefas.
3. Clique em **Sortear tarefas**.
4. Consulte as tarefas atribuídas a cada pessoa e o histórico de semanas.

## Regras do sorteio

- São distribuídas 21 tarefas: 19 prateleiras, varrer o estoque e passar pano no estoque.
- As tarefas são embaralhadas e distribuídas sem repetição dentro da semana.
- O grupo escolhido recebe 12 tarefas, quatro por pessoa; o outro recebe nove, três por pessoa.
- Na semana seguinte, os grupos trocam as cargas: quem teve quatro tarefas por pessoa passa a ter três, e vice-versa.

## Dados e tecnologias

O projeto usa HTML, CSS e JavaScript sem dependências externas de execução. Os nomes, o grupo inicial e o histórico são guardados no `localStorage` do navegador atual. Limpar os dados do navegador remove essas informações.

## Arquivos

- `index.html`: estrutura da página.
- `styles.css`: estilos e layout responsivo.
- `app.js`: validação dos nomes, sorteio, exibição dos resultados e persistência local.
