# luanalourenco0.github.io

Portfólio de Luan de Almeida Lourenço, desenhado como um fluxograma de processo (P&ID) interativo. Cada equipamento é um projeto real e abre uma folha de dados.

- **Partir a planta**: liga o fluxo nas tubulações e enche os tanques.
- **Fazer o tour**: percorre os equipamentos na ordem do processo.
- **Console**: digite `ajuda` para ver os comandos.
- **Ler em texto**: o mesmo conteúdo em formato de leitura simples.

## Como editar

Todo o conteúdo está em `assets/data.js`: equipamentos (`nodes`), tubulações (`pipes`) e indicadores (`gauges`). Cada equipamento tem coordenadas para o desenho largo (`d`) e para o celular (`m`).

Para mostrar a versão pública do LUAN OS, preencha o campo `demo` do equipamento `TK-501`.

Ao mudar CSS ou JS, troque o `?v=` dos links em `index.html` para os navegadores baixarem a versão nova.

## Rodar localmente

```bash
python -m http.server 8765 --directory .
```

Sem dependências nem etapa de build: HTML, CSS e JavaScript puros, publicados pelo GitHub Pages.
