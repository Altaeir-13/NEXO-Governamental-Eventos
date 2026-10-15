# Instalação, publicação e operação

Guia para a equipe NEXO. Comandos de terminal usam PowerShell e devem ser executados na pasta do projeto. Textos entre `<...>` são valores a substituir; não copie os sinais `<` e `>` para os comandos. Documentação Cloudflare consultada em 15/10/2026.

## 1. Preparar o computador

Use Node.js 22, indicado em `.nvmrc`, com npm, e Git. Feche e reabra o terminal depois de instalar ferramentas. Confira:

```powershell
node --version
npm --version
git --version
```

Continue na pasta existente do projeto. Apenas em outro computador, obtenha uma cópia com `git clone https://github.com/Altaeir-13/NEXO-Governamental-Eventos.git` e depois `cd NEXO-Governamental-Eventos`. Instale as versões do arquivo de lock:

```powershell
npm ci
```

Se o PowerShell bloquear `npm.ps1`, use `npm.cmd` nos comandos npm. Não é necessário alterar a política de execução da máquina.

## 2. Segredo e banco local

Crie o segredo aleatório local sem mostrá-lo no terminal:

```powershell
node -e "require('node:fs').writeFileSync('.dev.vars','TOKEN_SECRET='+require('node:crypto').randomBytes(32).toString('hex')+'\n',{flag:'wx'})"
npm run db:migrate
```

Se `.dev.vars` já existir, mantenha o arquivo e não gere outro a cada execução. `TOKEN_SECRET` precisa ter pelo menos 32 caracteres. `.dev.vars.example` contém somente o nome da variável. Nunca coloque esse segredo em variáveis `VITE_*`, código React, `public/`, repositório ou mensagem de suporte.

O binding do banco chama-se exatamente `DB`. `db:migrate` aplica os arquivos `migrations/*.sql` na ordem, somente no D1 local. O `database_id` em `wrangler.toml` já identifica o D1 de produção; o destino do comando continua dependendo de `--local` ou `--remote`. As migrations deixam o evento inicial disponível para configuração, com inscrições fechadas e dados provisórios identificados.

O estado local persiste em `.wrangler/`. Testes automatizados usam outro D1 temporário. Não copie dados pessoais de produção para testar. A [documentação de desenvolvimento D1](https://developers.cloudflare.com/d1/best-practices/local-development/) explica a persistência e a diferença entre `--local` e `--remote`.

## 3. Primeiro administrador e execução completa

```powershell
npm run admin:create -- --local --email <EMAIL_DA_EQUIPE> --name "Administrador" --role admin
npm run dev:full
```

Substitua `<EMAIL_DA_EQUIPE>` pelo endereço real antes de executar. O assistente solicita a senha sem exibi-la. Use um endereço controlado pela organização e uma senha exclusiva. Não existe usuário ou senha padrão. O script gera hash de senha e cria a conta no D1 local. Para um operador de recepção, troque `--role admin` por `--role checkin` e use outro e-mail.

Abra **http://127.0.0.1:8788**. Entre em **http://127.0.0.1:8788/admin** com a conta criada. O servidor completo serve o build e a API, usando o D1 local. Para encerrar, pressione `Ctrl+C`.

`npm run dev` é o servidor de interface do Vite. Para usar a plataforma completa, prefira `dev:full`. Depois de mudar o frontend, pare e execute novamente `dev:full`. A execução local não publica nada e o computador precisa estar ligado somente durante o desenvolvimento.

Confira o evento no painel: título, capacidade, abertura, data/local confirmados, programação, convidados e contatos. A capacidade inicial é 120; reduzir abaixo das inscrições ativas é recusado. Horários sem confirmação continuam como “A definir”. Só convidados confirmados e publicados aparecem no site.

## 4. Testes antes de publicar

```powershell
npm run typecheck
npm test
npm run test:integration
npm run build
```

Todos precisam terminar com código de saída zero. A integração usa o handler real e o D1/SQLite do Miniflare: inscrição, duplicidade, idempotência, concorrência na última vaga, cancelamento, controle de acesso, credenciamento e certificados. O comando separado repete apenas a integração para facilitar o diagnóstico.

Além dos testes automatizados, execute o ensaio do item 10 em celulares reais. Asserções de API e build não comprovam foco de câmera, comportamento de iPhone/Android ou estabilidade da rede do auditório.

## 5. Conferir e reutilizar o D1 na conta Cloudflare

Use a conta existente e mantenha o plano **Workers Free**. Este projeto não exige contratar plano pago, domínio ou serviço de e-mail. Não siga ofertas de upgrade para cumprir estas instruções. Se a interface exigir cartão ou contratação, interrompa essa etapa e confira se selecionou o produto/plano corretos.

Confira a autenticação e os recursos antes de criar qualquer banco:

```powershell
npx wrangler whoami
npx wrangler d1 list
npx wrangler pages project list
```

Se a CLI não estiver autenticada, execute `npx wrangler login` e autorize no navegador. Se o retorno ao endereço local expirar, use `npx wrangler login --device` e conclua a autorização privada no navegador; depois repita `npx wrangler whoami`. Não envie senhas, códigos ou tokens pelo chat.

O banco de produção existente é **`nexo-eventos`**, UUID **`612ea13a-1f61-462f-8709-fdfa07cdadde`**, na conta **`bf28b0c5c5dab28e608d46053448e606`**. Reutilize-o; não execute novamente `d1 create nexo-eventos`. O bloco já configurado em `wrangler.toml` é:

```toml
[[d1_databases]]
binding = "DB"
database_name = "nexo-eventos"
database_id = "612ea13a-1f61-462f-8709-fdfa07cdadde"
migrations_dir = "migrations"
```

O UUID do banco identifica um recurso, não é uma senha. A conexão depende das permissões da conta. Antes de aplicar as seis migrations, confira conta, nome e UUID do destino. Não copie o banco local de ensaio para produção:

```powershell
npx wrangler d1 migrations list nexo-eventos --remote
npm run db:migrate:remote
npx wrangler d1 execute nexo-eventos --remote --command "SELECT id, slug, registration_open FROM events;"
```

O último comando deve mostrar o evento inicial. Migrations já aplicadas são registradas; não edite arquivos já usados em produção. Crie uma nova migration para cada mudança de schema. Consulte [migrations D1](https://developers.cloudflare.com/d1/reference/migrations/).

## 6. GitHub e Cloudflare Pages

1. Reutilize o repositório público **[Altaeir-13/NEXO-Governamental-Eventos](https://github.com/Altaeir-13/NEXO-Governamental-Eventos)** e a branch **`main`**. O Git local já foi inicializado. Confira `git status`, `git branch --show-current`, `git remote -v` e o estado remoto com `git ls-remote origin` antes de alterar a configuração. Se `origin` estiver ausente, adicione `https://github.com/Altaeir-13/NEXO-Governamental-Eventos.git`; preserve um remote válido. Não recrie o repositório, não use push forçado nem reescreva históricos. Revise `.gitignore`, os arquivos preparados e `git diff --cached` antes de cada commit: `.dev.vars`, `.env` com segredos, `.wrangler/`, bancos, backups, dados pessoais, PDFs reais e conversas privadas não podem entrar. Inclua código, `package-lock.json`, migrations, Wrangler seguro e documentação. Faça commit e `git push -u origin main` usando a autenticação normal do GitHub, sem tokens na URL.
2. Na Cloudflare, reutilize o projeto **Pages `nexo-governamental-eventos`**, publicado em **https://nexo-governamental-eventos.pages.dev**. Ele foi criado depois de confirmar que não existia Pages na conta e está ligado ao repositório informado. O Worker de modelo com o mesmo nome, sem assets ou bindings, foi preservado: um Worker tradicional não executa automaticamente a estrutura `functions/` do Pages. Não exclua esse recurso nem crie projetos adicionais para atualizar o site. O [relatório de implantação](IMPLANTACAO.md) registra os IDs e deployments verificados.
3. Use a branch de produção **`main`**, comando de build **`npm run build`**, diretório de saída **`dist`** e raiz que contém `package.json`. Selecione React/Vite quando disponível. Configure **`NODE_VERSION=22`**, de acordo com `.nvmrc`.
4. Mantenha as inscrições fechadas e a emissão de certificados bloqueada durante a implantação. Só considere a publicação concluída depois de verificar deployment, API, banco, segredo, administrador e HTTPS público.
5. O `wrangler.toml` enviado é a fonte de configuração de Functions e contém `pages_build_output_dir = "dist"`, UUID real e binding **`DB`**. Em **Settings → Bindings**, confira a associação ao D1 de produção. Campos gerenciados pelo arquivo podem aparecer somente para leitura; nesse caso, corrija o arquivo e publique novamente, sem criar um segundo binding com outro nome. [Configuração Wrangler do Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [bindings D1](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases).
6. Em **Settings → Variables and Secrets**, ambiente **Production**, confira **`TOKEN_SECRET`** como segredo criptografado. Ele já foi gerado com 32 bytes aleatórios independentes do desenvolvimento e configurado sem exibição ou gravação local do valor. Preserve-o; não o recrie a cada deployment. Não reutilize a senha do administrador nem configure o segredo como variável do Vite. `NODE_VERSION=22` é uma variável comum declarada no Wrangler para que a configuração efetiva continue sincronizada depois do build.
7. Execute um novo deployment depois de salvar o segredo. Aguarde o estado de sucesso e abra o endereço **`https://NOME_DO_PROJETO.pages.dev`** informado no painel. HTTPS é servido pelo Pages; não é preciso comprar domínio.

A integração publicou automaticamente um commit de `main`, comprovado pelo gatilho `github:push` e deployment bem-sucedido. **Mantenha deployments automáticos de preview desabilitados** até configurar D1 separado e segredo próprio. O bloco `[env.preview]` contém `d1_databases = []`: previews não recebem `DB` de produção e não oferecem a API completa enquanto o isolamento não for configurado. Nunca ensaie em preview conectado aos inscritos de produção. O guia oficial explica [integração Git e previews](https://developers.cloudflare.com/pages/configuration/git-integration/).

Alternativa para enviar manualmente ao mesmo projeto, depois de toda a configuração:

```powershell
npm run build
npx wrangler pages deploy dist --project-name <NOME_DO_PROJETO> --branch main
```

Escolha a integração Git no início se pretende usá-la. Um projeto criado por Direct Upload não oferece a mesma migração posterior para Git; não crie um segundo projeto por engano. Um upload de `dist` pelo navegador, sem compilar as Functions, não substitui esse fluxo.

## 7. Administrador de produção e conferência pública

O primeiro administrador já foi criado e seu login HTTPS foi verificado. Para adicionar outra conta autorizada, confira o UUID de produção em `wrangler.toml` e use outro e-mail no comando:

```powershell
npm run admin:create -- --remote --email <EMAIL_DA_EQUIPE> --name "Administrador" --role admin
```

Use senha exclusiva e um endereço da equipe. A senha é solicitada em prompt privado. A autorização Cloudflare é necessária para essa ação; ela não cria login público aberto.

No endereço `.pages.dev`, entre em `/admin`. Sem login, a consulta de dados administrativos deve ser recusada. Confira:

- `/api/event?slug=labirinto-da-liberdade` responde com os dados públicos, sem e-mails de inscritos.
- Data/local provisórios continuam assim até confirmação institucional.
- Segredo ausente ou DB sem migration gera falha explícita; não deve mostrar uma inscrição bem-sucedida.
- O login produz uma sessão e o logout a encerra.
- Nenhum arquivo de conversa, banco local, segredo ou backup aparece entre os arquivos publicados.

Preencha contatos oficiais, aviso de privacidade, prazo de retenção e dados confirmados antes da divulgação. Publique apenas fotos autorizadas e convites efetivamente confirmados. O sistema não valida a autorização jurídica/institucional de imagens e assinaturas.

Em **Dados do evento → Inscrições e capacidade**, deixe **Habilitar inscrições** desmarcado e salve. Somente após autorização explícita da organização, revise período e capacidade, marque a opção e salve; para fechar, desmarque e salve novamente. Em **Participantes**, consulte por nome, e-mail ou código; administradores usam **Exportar CSV offline**. Em **Credenciamento**, leia o QR ou busque a inscrição e confirme a identidade antes de registrar a presença. Trate o CSV e os ingressos como dados privados. A liberação dos certificados segue o item 11 e não deve ser antecipada durante testes.

## 8. Backup e restauração

Antes de migration, atualização importante, ensaio remoto ou emissão em lote, crie um backup. `backups/` é ignorado pelo Git. Trate arquivos SQL/CSV como dados pessoais restritos.

```powershell
New-Item -ItemType Directory -Force backups
npx wrangler d1 export nexo-eventos --remote --output backups/nexo-antes-atualizacao.sql
npx wrangler d1 time-travel info nexo-eventos
```

Guarde o SQL e o bookmark do Time Travel em armazenamento privado da organização com acesso limitado. Um backup na mesma conta não elimina a necessidade de uma cópia protegida externa.

Para conferir o SQL sem sobrescrever produção, crie um D1 vazio de restauração, adicione outro binding/configuração de teste e execute:

```powershell
npx wrangler d1 execute <NOME_DO_BANCO_DE_RESTAURACAO> --remote --file backups/nexo-antes-atualizacao.sql
```

Confira contagens e registros de amostra no banco de restauração. Um dump completo deve ser importado em banco vazio: não importe por cima de tabelas existentes. Referência: [importar/exportar D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Para reverter o banco de produção a um bookmark, interrompa inscrições e credenciamento, faça outro export do estado atual, informe a equipe sobre a perda de alterações posteriores e só então execute:

```powershell
npx wrangler d1 time-travel restore nexo-eventos --bookmark=<BOOKMARK_CONFERIDO>
```

No Free, o histórico Time Travel alcança **7 dias**, conforme a [documentação de recuperação](https://developers.cloudflare.com/d1/reference/time-travel/). Restaurar banco e voltar versão do site são ações distintas. Reconcile inscrições/check-ins posteriores antes de reabrir. Não há rotina de backup externa automática instalada por este projeto.

## 9. Publicar uma atualização

Faça cópia/branch de trabalho, execute os testes e build, revise o diff e faça backup. Aplique novas migrations compatíveis antes de publicar código que dependa delas. Envie o commit para a branch escolhida e aguarde a conclusão no Pages. Teste `/`, login, consulta de ingresso e painel depois da atualização.

Novos deployments preservam o D1 vinculado. Não troque seu UUID e não recrie o banco para atualizar o site. Para voltar o site, use o deployment anterior em Pages ou reverta o commit; isso não desfaz migrations. Prefira migrations aditivas e faça restauração separada somente quando necessária.

## 10. Ensaio do credenciamento e contingência

Use banco/evento de ensaio com pessoas fictícias, nunca a lista oficial. Registre o resultado e o aparelho usado.

1. Abra o site a 375 px e em Android/Chrome e iPhone/Safari reais: menu, leitura sem rolagem horizontal, foco por teclado, formulário rotulado, mensagens e download PDF.
2. Faça inscrição válida; repita o envio; confira um único ingresso. Teste e-mail repetido, inválido e capacidade pequena. Faça duas inscrições simultâneas na última vaga.
3. Salve dois ingressos e compare os QR Codes. Sem login, a leitura não pode marcar presença.
4. Entre como equipe de credenciamento, autorize a câmera e leia o QR do outro aparelho. Confira nome com a pessoa antes de confirmar identidade. Teste código inexistente, cancelado e leitura repetida.
5. Desligue a rede durante o envio. A interface deve mostrar falha, conservar informação suficiente para repetição segura e não afirmar sucesso sem resposta da API. Religue e confira a lista antes de repetir.
6. Baixe o CSV com antecedência. Em planilha offline/impresso, confira identidade e marque hora, código e operador durante a indisponibilidade. Não há sincronização automática offline. Quando a rede voltar, registre as presenças no painel e evite duplicações. Descarte a cópia conforme a política aprovada.
7. Teste o fluxo de certificado apenas no ambiente de ensaio. Na produção, mantenha a data de liberação de dezembro e as aprovações reais.

No dia, tenha carregadores, dois celulares autorizados, conexão alternativa e o CSV protegido. Faça backup antes e depois do evento. Não deixe o painel aberto em dispositivo compartilhado sem supervisão.

## 11. Liberar certificados em dezembro de 2026

A coordenação deve conferir a programação efetiva e aprovar a atribuição das **5 horas**. Não invente horário de término para justificar a carga horária. Revise o texto, nomes oficiais, data/cidade, signatários e autorização de assinatura/chancela. A prévia não é prova de aprovação institucional.

No painel, confira e corrija presenças com justificativa, marque a elegibilidade dos participantes autorizados e configure o modelo. Mantenha a data **`2026-12-01T00:00:00-03:00`** ou outra data de dezembro aprovada. A API verifica o instante; liberar o botão antes não antecipa a data.

Depois da revisão, marque as regras como aprovadas e a liberação do evento. Emita para os selecionados elegíveis, individualmente ou em lote. A presença, a elegibilidade, a autorização e a data são condições cumulativas; apenas estar inscrito não basta. Baixe um PDF real, confira A4 horizontal, nome, texto, horas, número e QR. Abra `/validar/<CODIGO>` em sessão pública e confira somente os dados mínimos. Um código inexistente deve ser recusado. Revogue qualquer certificado emitido incorretamente e confira seu estado público.

Participantes usam seu ingresso privado para baixar o certificado. O servidor autoriza o acesso e fornece os dados oficiais imutáveis da emissão; o navegador gera o PDF e seu QR Code por demanda. Isso evita executar a renderização de PDF no limite de CPU do Workers Free. A autenticidade depende do código e do registro oficial consultado em `/validar`, e não da possibilidade de alguém editar um arquivo PDF. Não há disparo automático de e-mails. A disponibilidade futura depende da manutenção da conta, dos dados essenciais e das cotas; preserve o necessário para autenticidade e aplique a retenção aprovada aos demais dados.

## 12. Recuperar ingresso e administrar acessos

Conhecer um e-mail não concede acesso ao ingresso. Se a pessoa perdeu PDF/link, ela deve usar o canal oficial da organização. Um administrador confere sua identidade por procedimento aprovado, registra a justificativa e usa **recuperar ingresso**. Entregue o novo link por canal privado; o token anterior é revogado. Nunca publique o QR em redes sociais ou lista aberta.

Não peça CPF nem foto de documento como rotina. Prefira a conferência presencial ou um canal institucional já confiável. Se não houver evidência suficiente, não emita uma nova credencial com base apenas na declaração do solicitante. A política concreta de conferência deve ser definida pela coordenação.

Crie contas separadas para cada operador com o script e `--role checkin`. Para retirar acesso, faça backup, consulte o ID correto e desative a conta com os comandos abaixo. Substitua `ID_CONFERIDO` pelo ID exato retornado, usando somente UUID da conta selecionada:

```powershell
npx wrangler d1 execute nexo-eventos --remote --command "SELECT id, email, role, enabled FROM admin_users;"
npx wrangler d1 execute nexo-eventos --remote --command "UPDATE admin_users SET enabled=0 WHERE id='ID_CONFERIDO';"
npx wrangler d1 execute nexo-eventos --remote --command "DELETE FROM sessions WHERE user_id='ID_CONFERIDO';"
```

A autenticação também consulta `enabled`, então desativar a conta impede uso de sessões existentes. Não desative sua única conta administrativa. Não compartilhe a senha do administrador.

## 13. Cotas e diagnóstico

O escopo Free consultado inclui **100 mil requisições/dia compartilhadas entre Functions e Workers**; arquivos estáticos que não invocam Functions têm tratamento distinto. Veja [preços de Functions](https://developers.cloudflare.com/pages/functions/pricing/). D1 Free inclui **5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB de armazenamento total**; acompanhe **D1 → Metrics → Row Metrics**. Veja [preços D1](https://developers.cloudflare.com/d1/platform/pricing/). Não é uma promessa de capacidade ilimitada ou ausência de futuros ajustes de produto.

Se não aparecer API local, use porta 8788 e `dev:full`. Se houver erro de segredo, confira `.dev.vars` local ou Secret de Production e faça redeploy. Se o banco não tiver tabelas, aplique migrations no ambiente correto. Se a conta não puder consultar D1, confira plano/cotas e permissões. O navegador pode bloquear câmera em HTTP fora de localhost: use HTTPS do Pages em celulares.

Falha de DB ou rede não deve ser tratada como vaga confirmada. Não repita emissão ou importação às cegas: consulte o estado da operação depois da conexão voltar. Para incidentes, siga [SEGURANCA.md](SEGURANCA.md).
