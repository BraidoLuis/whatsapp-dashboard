# Meus Gastos

Bot de automação financeira para acompanhar as finanças de duas pessoas por mensagens no WhatsApp, com uma dashboard responsiva para consultar e organizar os registros.

O projeto transforma comandos de texto em gastos, aportes, salários e faturas armazenados em SQLite. A dashboard apresenta a visão individual ou do casal, metas mensais, gráficos e histórico. O processamento usa regras de comandos implementadas em JavaScript.

## Funcionalidades

- Registro de gastos por descrição e valor, enviado no grupo configurado.
- Registro de aportes com `investimento`, `aporte` e `reserva`, separados dos gastos.
- Recebimentos de salário e lançamentos de fatura acumuláveis, separados por pessoa e mês.
- Telas Resumo, Semanal, Mensal, Lançamentos e Planejamento, com filtros individuais e do casal e navegação inferior no celular.
- Evolução dos gastos, roscas por categoria com legenda, reais e percentuais e comparação entre períodos.
- Limite de gastos e meta de aportes para o casal ou para cada pessoa, por mês.
- Histórico com busca por descrição ou pessoa, filtro por tipo e carregamento de mais registros.
- Inclusão, edição e exclusão de lançamentos pela dashboard; gestão dos salários e faturas mensais.
- Exportação CSV dos lançamentos filtrados e, separadamente, dos valores mensais.
- Temas claro e escuro, layout adaptável a celular e desktop, animações locais com Motion e respeito à preferência de movimento reduzido.
- Atualização automática da dashboard, estados vazios e mensagens de erro com opção de tentar novamente.
- Processamento restrito ao grupo e às duas pessoas configuradas, com deduplicação de mensagens já processadas.

## Regras financeiras

### Gastos e aportes

Gastos e aportes são lançamentos independentes. `reserva` é registrada como **aporte**, assim como `aporte` e `investimento`. Aportes representam valores destinados à reserva ou a investimentos; o sistema não calcula patrimônio, rendimentos ou valorização de ativos.

Os valores são armazenados em centavos inteiros. Gastos e aportes precisam ser maiores que zero.

### Salário e fatura mensal

Cada comando `salario`, `cartao` ou `fatura` adiciona um **lançamento individual** à pessoa e ao mês. `salario 2000` seguido de `salario 800` totaliza R$ 2.800; `fatura 500` seguido de `fatura 300` totaliza R$ 800. Mensagens diferentes com o mesmo valor são lançamentos distintos. Reprocessar a mesma mensagem não duplica o lançamento, mesmo depois de editar ou excluir o item na dashboard. Os valores não são copiados automaticamente para outros meses.

Em Planejamento, o botão **Adicionar** soma um novo item; **Editar** altera apenas o lançamento escolhido, identificado por ID. Cada item pode ser excluído separadamente. Uma descrição opcional identifica a origem ou o cartão. A data pode ficar em branco quando só o mês é conhecido; a dashboard não atribui esses itens a uma semana.

`R$ 0,00` é um valor informado. A ausência de cadastro é mostrada como “não informado” ou um traço. Essa distinção também aparece na exportação dos valores mensais. Salários e faturas podem ser editados ou removidos pela dashboard.

A fatura é **informativa**: não é somada novamente aos gastos, não reduz novamente o saldo estimado e não indica que o cartão foi pago. Registre as compras como gastos e use a fatura para acompanhamento. Registrar também o pagamento da fatura como gasto duplicaria as despesas das compras já lançadas.

### Saldo estimado

```text
Saldo estimado = salários informados − gastos registrados − aportes registrados
```

O cálculo considera o mês e a pessoa ou visão do casal selecionados. Sem salário informado, o saldo não é calculado. Na visão do casal, se apenas uma pessoa informou o salário, o saldo é marcado como **parcial**: considera essa receita e os gastos e aportes de ambas.

Esse indicador considera somente os registros do projeto. Não representa o saldo bancário, não consulta contas ou cartões e não inclui automaticamente outras receitas, dívidas, transferências ou despesas não registradas. A fatura não faz parte da fórmula.

## Comandos do WhatsApp

Envie os comandos no grupo escolhido durante a configuração, a partir de uma das duas pessoas autorizadas. Os exemplos abaixo usam valores fictícios.

| Objetivo | Exemplos |
| --- | --- |
| Registrar gasto | `mercado 107,87`, `farmácia 40`, `transporte R$ 25,50` |
| Registrar aporte | `investimento CDB 200`, `aporte 150` |
| Registrar reserva | `reserva 200`, `reserva emergência 150,50` |
| Adicionar recebimento | `salario 2000`, `salario 800`, `salário 2026-10 Empresa 3000` |
| Adicionar fatura informativa | `cartao 850,90`, `cartão 2026-10 Visa 500`, `fatura Outro cartão 300` |
| Consultar total de gastos e aportes | `total`, `total mês`, `total 2026-10` |
| Consultar os últimos dez lançamentos | `listar`, `listar mês`, `listar 2026-10` |
| Remover o próprio último gasto ou aporte | `desfazer` |
| Consultar ajuda | `ajuda` |

Sem mês explícito, os comandos mensais e as consultas usam o mês da mensagem no fuso `America/Sao_Paulo`. O formato de mês é `AAAA-MM`. Salário e fatura aceitam zero; os demais lançamentos exigem valor positivo. Os comandos mensais aceitam as formas com ou sem acento.

A sintaxe é `comando [AAAA-MM] [descrição] valor`: a descrição vem antes do valor e preserva acentos. Ex.: `salario Trabalho extra R$ 800,00` e `fatura 2026-10 Visa 300`. O valor deve ser o último elemento. Um mês explícito diferente do mês da mensagem não cria uma data de ocorrência fictícia; o item permanece mensal até uma data conhecida ser informada.

`total` mantém gastos e aportes separados; salário e fatura são consultados na dashboard. `desfazer` remove apenas o último gasto ou aporte de quem enviou a mensagem, e não altera salário nem fatura.

## Períodos, categorias e migração

A semana vai de **segunda a domingo**, inclusive, no calendário de `America/Sao_Paulo`, e pode atravessar meses e anos. A tela Semanal tem data de referência, semana anterior, próxima e atual, total de gastos, valores diários, categorias e lista filtrável. O filtro de pessoa vale para toda a tela. A seleção semanal é independente do mês das outras telas. A comparação informa ausência de gastos anteriores e não divide por zero.

A tela Mensal mostra receitas, gastos, aportes, faturas informativas, metas, saldo e gastos acumulados. As composições percentuais incluem **apenas gastos**, com base no total do período e da pessoa/casal selecionados. Selecionar uma categoria na rosca mensal destaca a legenda e filtra a tela Lançamentos; na semanal, filtra a lista da própria semana. Cada legenda é um botão acessível por teclado. Períodos vazios não apresentam percentuais.

Categorias são textos opcionais de até 60 caracteres, editáveis ao criar ou corrigir gastos na dashboard. Não há classificação automática: registros antigos e mensagens novas sem categoria aparecem em **Sem categoria**. Categorias já utilizadas no mês são sugeridas. Os CSVs mantêm os filtros; o CSV de salários/faturas exporta cada item com ID, descrição, data conhecida e indicação de migração.

Antes de atualizar uma instalação existente, faça um backup consistente com `scripts/backup-db.mjs`. Na primeira abertura com esta versão, `openDb` executa uma migração **transacional e idempotente** (esquema 2). A antiga tabela mensal é preservada como `monthly_values_legacy_v1`; cada valor é copiado uma única vez para `monthly_values` com ID próprio, inclusive zeros, mantendo grupo, pessoa, mês, tipo, valor e o timestamp original de atualização. A migração marca o item como migrado e deixa descrição, data de ocorrência e identidade da mensagem em branco: esses dados não existiam. O registro de mensagens processadas é mantido. O histórico já substituído pela versão antiga não pode ser reconstruído.

Itens migrados sem data continuam nos totais mensais; a interface informa a impossibilidade de atribuí-los a uma semana. Reabrir o banco não recopia itens editados ou excluídos. Gastos existentes recebem uma categoria inicialmente vazia, exibida como Sem categoria, sem mudar descrição, valor ou tipo. A tabela legada é um arquivo de preservação e não deve ser usada pelo código antigo: esta mudança de esquema exige planejar um eventual retorno de versão e reconciliar novos lançamentos em cópias isoladas. Nunca substitua o banco da instalação pelo banco de outro computador.

## Tecnologias

| Camada | Tecnologias utilizadas |
| --- | --- |
| Execução e lógica | Node.js 24, JavaScript e módulos ES (`.mjs`) |
| WhatsApp | Baileys, QR Code no terminal com `qrcode-terminal`, logging com `pino` |
| Persistência | SQLite pela API nativa `node:sqlite`, com WAL e migrações incrementais |
| Dashboard e API | Servidor HTTP nativo do Node.js, HTML, CSS e JavaScript; gráficos em SVG |
| Animações | Motion, distribuído como módulo local da dashboard |
| Build | esbuild para gerar o bundle do Motion |
| Testes | Executor nativo `node:test` e Playwright com Chromium |

As versões das dependências estão fixadas em `package.json` e `package-lock.json`. Não há framework de frontend nem CDN necessária para carregar o Motion.

## Organização do projeto

```text
.
├── bot.mjs                       # Comandos, configuração, conexão WhatsApp e banco
├── dashboard.mjs                 # Servidor HTTP, API e agregação financeira
├── dashboard.html                # Estrutura da interface
├── dashboard.css                 # Layout, temas e responsividade
├── dashboard.js                  # Gráficos, filtros, formulários e exportação
├── motion-entry.js               # API do Motion incluída no bundle
├── public/assets/
│   ├── motion.js                 # Bundle local gerado pelo build
│   ├── motion-LICENSE.md         # Licença obrigatória do Motion distribuído
│   └── THIRD-PARTY-LICENSES.txt  # Licenças dos pacotes incluídos no bundle
├── scripts/
│   ├── build-motion.mjs          # Build do Motion e avisos de licença
│   └── backup-db.mjs             # Backup consistente com verificação SQLite
├── tests/
│   ├── bot.test.mjs              # Comandos, valores mensais e migração
│   ├── dashboard.test.mjs        # Estado financeiro, API e proteções
│   ├── backup.test.mjs           # Backup e dados confirmados no WAL
│   ├── preview-server.mjs        # Dashboard de teste com banco em memória
│   ├── ui-teardown.mjs           # Encerramento da prévia de testes
│   └── ui/dashboard.spec.mjs     # Testes da interface no navegador
├── playwright.config.mjs
├── package.json
├── package-lock.json
└── README.md
```

Durante o uso, são criados `config.json`, `sessao/` e `dados/gastos.sqlite`. Esses arquivos são privados e ficam fora do Git, assim como backups, logs, resultados de testes, capturas e pacotes de atualização. Guias operacionais e outras anotações Markdown permanecem locais; a licença do Motion acompanha o asset publicado.

## Requisitos

- Node.js **24.x** e npm. O projeto declara `>=24 <25` e depende da API nativa de SQLite dessa versão.
- Uma conta WhatsApp que participe do grupo usado para registrar as finanças.
- Um grupo com as duas pessoas que serão autorizadas a registrar valores.
- Acesso à internet para instalar dependências e manter a conexão do bot com o WhatsApp.
- Um navegador moderno para a dashboard. Os testes da interface usam Chromium.

## Instalação e configuração local

Na pasta do projeto, instale as dependências e gere os assets:

```sh
npm ci
npm run build
node bot.mjs --verificar
```

No PowerShell do Windows, use `npm.cmd` e `npx.cmd` nos comandos correspondentes se a política de execução bloquear os scripts `.ps1` do npm.

`--verificar` carrega Baileys, QR Code e SQLite com um banco em memória. Não conecta uma conta WhatsApp nem abre o banco de uso diário.

Execute a configuração interativa:

```sh
node bot.mjs configurar
```

1. Leia o QR Code no WhatsApp, em **Aparelhos conectados → Conectar aparelho**.
2. Escolha o grupo apresentado no terminal.
3. Selecione as duas pessoas autorizadas e informe os nomes que aparecerão nos registros.
4. Se a conta conectada também será usada para enviar comandos, habilite o recebimento das próprias mensagens e identifique qual das duas pessoas corresponde a ela.

A configuração salva `config.json` e a sessão fica em `sessao/`. Ao concluir, o processo de configuração termina. Não é necessário criar manualmente uma configuração ou publicar um exemplo com identificadores de participantes.

## Execução local

Inicie o bot:

```sh
npm start
```

Em outro terminal, na mesma pasta, inicie a dashboard:

```sh
npm run dashboard
```

Abra [http://127.0.0.1:3210](http://127.0.0.1:3210) ou [http://localhost:3210](http://localhost:3210). O servidor escuta somente em `127.0.0.1`, e os dois processos compartilham o banco SQLite local. Use `Ctrl+C` para encerrar cada processo.

Não execute duas cópias do bot com a mesma sessão. O banco é criado e o esquema é atualizado ao abrir a conexão. Faça backup antes de atualizar uma instalação que já tenha registros.

## Build e testes

O build usa esbuild para gerar `public/assets/motion.js` a partir de `motion-entry.js`. Também copia a licença do Motion para `public/assets/motion-LICENSE.md` e reúne as licenças de Motion, Framer Motion, motion-dom e motion-utils em `public/assets/THIRD-PARTY-LICENSES.txt`:

```sh
npm run build
```

Execute os testes de comandos, migração, API, agregação financeira e backup:

```sh
npm test
```

Para os testes da interface, instale o Chromium do Playwright e execute:

```sh
npx playwright install chromium
npm run test:ui
```

Em Ubuntu, se forem necessárias as bibliotecas do navegador, use `npx playwright install --with-deps chromium` no lugar do comando de instalação acima.

Os testes usam bancos em memória ou arquivos temporários e dados fictícios. O Playwright inicia uma prévia isolada em `http://127.0.0.1:3219`; não usa `config.json`, `sessao/` nem o banco pessoal. A suíte verifica tamanhos de 360, 390 e 430 px e desktop, filtros, gráficos, metas, inclusão, edição, exclusão, CSV, estados vazios e de erro, carregamento do Motion e movimento reduzido. Os testes da API verificam isolamento de registros, entradas inválidas e proteções de Host, Origin e CSRF.

## Hospedagem e acesso privado

Uma instalação em Ubuntu pode manter o bot e a dashboard em **dois serviços systemd**, executados por um usuário dedicado, com Node.js 24, diretório de trabalho do projeto e reinício automático. O bot precisa de sua configuração e sessão persistentes; a dashboard usa o mesmo banco. A execução pelo systemd não substitui a configuração inicial com QR Code.

Para acesso remoto privado, o [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) pode encaminhar uma URL HTTPS da tailnet para `http://127.0.0.1:3210`. A dashboard continua vinculada ao loopback. O acesso depende da configuração do Tailscale, da rede e das permissões da tailnet; este projeto não configura esses serviços automaticamente.

### Origem HTTPS autorizada

O acesso local funciona sem configuração adicional. Para autorizar o endereço remoto, configure a variável de ambiente **`DASHBOARD_PUBLIC_ORIGIN`** no serviço da dashboard com a URL HTTPS exata fornecida pelo Tailscale Serve. Exemplo fictício, a ser substituído pela URL da sua própria instalação:

```ini
[Service]
Environment="DASHBOARD_PUBLIC_ORIGIN=https://dashboard.tail-exemplo.ts.net"
```

Essa configuração deve ficar em um arquivo local do systemd, fora do repositório. Após alterar a unidade ou um drop-in, é necessário recarregar a configuração do systemd e reiniciar o serviço da dashboard.

A origem autorizada deve ser HTTPS, estar em minúsculas, ter um hostname válido terminado em `.ts.net` e não conter credenciais, caminho, barra final, consulta ou fragmento. Para HTTPS padrão, omita `:443`; uma porta diferente, se utilizada, precisa corresponder exatamente à URL de acesso. Uma variável vazia ou inválida é rejeitada ao iniciar. A aplicação valida o Host e exige a Origin exata e o token CSRF nas alterações; não usa cabeçalhos `X-Forwarded-*` para decidir quais origens são confiáveis. Autorizar uma origem não cria um proxy nem abre uma porta de rede.

**Antes de atualizar uma instalação que já utiliza Tailscale**, configure `DASHBOARD_PUBLIC_ORIGIN` com a URL atual no serviço da dashboard, antes do próximo reinício. Sem essa variável, somente os endereços locais são autorizados. Essa etapa preserva o acesso remoto ao substituir um endereço anteriormente fixado no código.

## Dados, segurança e operação

- Não publique `config.json`, a pasta `sessao/`, bancos SQLite, arquivos WAL/SHM, `.env`, chaves, backups, dumps ou logs. A sessão do WhatsApp contém credenciais de acesso à conta; a configuração e o banco contêm dados pessoais e financeiros.
- A dashboard não possui autenticação própria por usuário. Use acesso local ou uma rede privada com permissões restritas. As proteções de Host, Origin, CSRF e CSP não substituem o controle de acesso da rede.
- Arquivos servidos pela dashboard são definidos explicitamente; configuração, sessão e banco não são expostos como arquivos estáticos.
- Para backup, `scripts/backup-db.mjs` usa a API de backup do SQLite, inclui dados confirmados ainda no WAL, verifica a cópia e recusa sobrescrever o destino. Guarde a cópia em um local privado e protegido.
- Ao atualizar uma instalação, envie somente código, dependências declaradas e assets. **Nunca envie o banco local por cima do banco do servidor.** Preserve a configuração, a sessão e os registros existentes, faça backup e confira os logs e o funcionamento após o reinício.
- Revise os arquivos e o histórico Git antes de publicar. `.gitignore` não elimina dados privados que já tenham sido versionados.

## Limitações

- O bot precisa estar em execução e conectado para processar novos comandos. Não é uma importação completa do histórico do WhatsApp.
- Baileys é uma integração **não oficial** com WhatsApp. Mudanças do serviço, desconexões e invalidação da sessão podem exigir manutenção ou reconexão.
- O funcionamento dos registros independe da dashboard estar aberta, mas o acesso à interface depende do servidor e da configuração de rede.
- A versão atual foi planejada para um grupo e duas pessoas. Não oferece cadastro de múltiplos grupos, contas bancárias, login individual ou sincronização bancária.
- As metas, o saldo e os gráficos dependem da qualidade dos dados registrados. Categorias são definidas manualmente; não há classificação automática de despesas.
- A dashboard limita cada período consultado a 20 mil gastos/aportes ativos, inclusive períodos anteriores usados nas comparações. Os percentuais são exibidos com uma casa decimal, podendo haver diferença de arredondamento na soma visual.

## Licença e atribuições

A licença do código do projeto **ainda precisa ser escolhida pelo autor**. A publicação do repositório, por si só, não concede uma licença de reutilização.

O bundle do Motion é acompanhado de sua [licença MIT](public/assets/motion-LICENSE.md) e dos [avisos dos pacotes incorporados](public/assets/THIRD-PARTY-LICENSES.txt). Ambos devem permanecer publicados junto do asset. As demais dependências mantêm suas próprias licenças e avisos nos respectivos pacotes.
