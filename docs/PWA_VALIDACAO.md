# Validação da atualização PWA e credenciamento

Este relatório descreve somente a atualização PWA. Os relatórios anteriores permanecem como histórico e não comprovam testes desta versão. Nenhum ensaio em computador substitui instalação e câmera em Android/iPhone físicos.

## Verificações automatizadas

TypeScript, build e a regressão final passaram depois da correção de compatibilidade com as URLs do Pages descrita adiante. Os testes de integração usaram permissão de loopback para o D1 efêmero do Miniflare. A restrição inicial de ambiente foi resolvida; não se consideraram cenários pulados como aprovados. Há **206 cenários distintos validados**: 154 na regressão final de unidade/interface/PWA e 52 na integração do backend, que permaneceu inalterado. A suíte completa anterior de 204 se sobrepõe a essas execuções; não houve uma execução monolítica de 206. O domínio público corrigido passou também em 39 verificações HTTP e 18 verificações Chromium de funcionamento técnico do PWA, descritas abaixo. Instalação e câmera em aparelhos Android/iPhone físicos continuam pendentes.

| Verificação | Evidência desta atualização |
| --- | --- |
| `npm run typecheck` | Aprovado na versão integrada. |
| `npm test` antes dos dois últimos cenários de regressão | 204/204 aprovados, em 15 arquivos, em 171,19 s. Essa execução é histórica e se sobrepõe às duas seguintes. |
| `npm test -- --exclude tests/integration.test.ts` na revisão final | 154/154 aprovados, em 14 arquivos, em 4,44 s, incluindo câmera 16/16 e PWA 24/24. |
| `npm run test:integration` | 52/52 aprovados, em D1 efêmero, em 171,09 s; o backend permaneceu inalterado. Esses 52 já constavam na suíte histórica de 204 e complementam os 154 da regressão final que excluiu integração. |
| Proteção de credenciais na busca e controle da câmera | 16/16 aprovados e incluídos nos 154 finais; contemplam o cenário adicional de tokens/links privados malformados. |
| `npm run build` | Aprovado novamente depois da correção de `/offline`, incluindo `tsc --noEmit`. |
| Pages Functions | Compilação concluída com `Compiled Worker successfully`, sem erros, usando `WRANGLER_LOG_PATH=.tmp/pwa-functions-build.log`. |
| Manifest, dimensões dos ícones, allowlist e atualização do service worker | 24/24 testes PWA aprovados, incluídos nos 154 finais; conferem PNG 192/512/maskable/Apple 180, manifest, instruções, cache restrito, URL canônica `/offline`, fallback e ativação sem troca forçada. |
| Interface de credenciamento e limites de conexão | 3/3 testes de interface e 2/2 testes de timeout/leitura JSON aprovados, incluídos na suíte. |
| Chromium com dados fictícios | Reexecução depois da correção: 14/14 cenários aprovados, saída zero, versão 151.0.7922.10 e viewport 390 × 844, com fixture reproduzindo `/offline.html` 308 e `/offline` 200. Nenhum `browserError`. |
| WebKit 26.4 em computador | Parcial: a rodada instrumentada com movimento reduzido concluiu 9/9 cenários, saída zero e `browserErrors: []`. A rodada com movimento padrão e dois erros intermitentes de rodada anterior continuam pendentes de esclarecimento; não há aprovação integral do WebKit ou do iPhone. |
| Publicação automática após push em `main` | A correção `b6b80b6` foi enviada à `main` em 15/10/2026 às 21h45 (Brasília); deployment `c68a286f-da44-43b1-a598-1ceb9ff712a9` concluído com `success`. |
| Verificação HTTP pública após a correção | `node scripts/verify-pwa-production.mjs`: 39/39 aprovadas, saída zero, no domínio oficial, incluindo `/offline` 200, `/offline.html` 308, os 23 recursos da allowlist sem redirecionamento, autorização HTTP 401 e bloqueios/carga do evento preservados. |
| Service worker e instalabilidade no domínio público | 18/18 verificações aprovadas em Chromium 151.0.7922.10, perfil temporário novo fora do modo incógnito e viewport 390 × 844: worker ativo/pronto e controlando a página, cache exato com 23 recursos públicos, `installabilityErrors: []` e botão de instalação disponível. Nenhum erro de console/página, falha de rede ou tentativa de mutação. |

Os testes de integração usaram D1 efêmero com dados fictícios e não importaram produção. Cobriram consulta de QR autenticada, token/código, confirmação separada, cancelamento/revogação/evento incorreto, sessão/CSRF/papel, concorrência de dois operadores e preservação de operador/horário na repetição. A suíte PWA verificou que API, navegações privadas, tokens, sessões e certificados não entram no cache, e que a atualização não força troca no meio de uma operação. Os testes da câmera usam streams/decodificador simulados para conferir encerramento e bloqueio de repetição; não aprovam o comportamento óptico ou as permissões de um celular real.

## Ensaio no Chromium

O ensaio de navegador foi repetido após a correção da URL canônica e concluiu 14 cenários em Chromium 151.0.7922.10, com viewport de 390 × 844, D1 efêmero e nenhum erro de página. Verificou login fictício, navegação móvel sem rolagem horizontal, busca por nome/código, conferência manual, gravação real no D1 com horário/operador, ingresso duplicado sem botão para nova confirmação, inválido, cancelado, proteção de credencial privada malformada e falha de conexão sem sucesso falso. A reconexão e a consulta segura permitiram prosseguir; a reabertura recuperou a interface autenticada e a presença do servidor.

A biblioteca ZXing real decodificou um QR fornecido por `MediaStream` sintético de canvas. O ensaio conferiu bloqueio de repetição, encerramento das tracks, retomada manual/automática, seleção de câmera e limpeza ao sair. Permissão negada e câmera ausente foram simuladas; não se tratou de câmera física.

No servidor local, o service worker foi instalado e controlou a página; o cache continha 23 recursos estáticos públicos, sem caminhos/valores privados. Uma atualização ficou em espera e preservou o texto de um formulário aberto. Fechar todas as páginas permitiu ativar a versão nova e remover o cache público anterior. Reabrir offline retornou a página genérica HTTP 503, sem dados pessoais; a volta da conexão recuperou o aplicativo. A fixture foi corrigida para reproduzir `/offline.html` com HTTP 308 para `/offline`, que responde HTTP 200, como observado no Pages. Essa condição está incluída na reexecução aprovada.

As evidências locais sanitizadas da reexecução estão em `.tmp/pwa-browser/chromium-canonical-offline-report.json` e `.tmp/pwa-browser/chromium-credenciamento-390.png`, ignoradas pelo Git. O relatório anterior foi preservado em `report.json`. Esse ensaio comprova o fluxo no Chromium de computador com tela emulada; instalação na tela inicial e câmera Android/iPhone reais continuam pendentes na matriz abaixo.

## Resultado parcial no WebKit

A última rodada instrumentada em WebKit 26.4, com a preferência **movimento reduzido**, concluiu nove cenários funcionais com saída zero e nenhuma entrada em `browserErrors`. A captura mostrou os dados completos e ausência de rolagem horizontal na largura móvel. Isso valida somente essa configuração e os cenários executados no motor de computador.

Uma rodada com movimento padrão não concluiu por instabilidade ao interagir com um botão. Uma rodada anterior com movimento reduzido registrou dois erros de página cujas mensagens não foram preservadas; eles não reapareceram na última execução. A causa e a resolução desses resultados anteriores não foram demonstradas. Portanto, **WebKit permanece parcialmente validado**: movimento padrão, investigação dos erros intermitentes e instalação/câmera no iPhone físico continuam pendentes.

As evidências sanitizadas ficam em `.tmp/pwa-browser/webkit-report.json`, `.tmp/pwa-browser/webkit-reduced-motion-report.json` e `.tmp/pwa-browser/webkit-diagnostic-report.json`. O relatório Chromium foi preservado em `report.json`. Nenhum desses arquivos contém contas ou dados reais de produção.

## Reproduzir o ensaio opcional no navegador

O script usa o Playwright já disponível no runtime de desenvolvimento, sem acrescentar dependência ao pacote de produção. Requer os executáveis de navegador correspondentes e permissão para abrir o servidor de loopback:

```powershell
npm run build
node scripts/pwa-browser.mjs
```

Se o módulo não for encontrado automaticamente, informe o caminho absoluto do `index.mjs` do Playwright existente no computador antes de executar:

```powershell
$env:NEXO_PLAYWRIGHT_MODULE = 'C:\caminho\do\runtime\node_modules\playwright\index.mjs'
node scripts/pwa-browser.mjs
```

O ensaio sobe uma fixture local com Miniflare/D1 descartável e credenciais inteiramente fictícias, consumidas somente em memória. Não usa contas reais, banco persistente, segredo local ou produção. O ensaio do build de produção e da atualização do service worker usa exclusivamente esse servidor `localhost`/loopback. Capturas e relatório sanitizado ficam em `.tmp/pwa-browser/`, ignorado pelo Git. O script tenta Chromium e WebKit em viewport de 390 × 844; se um motor não estiver disponível ou falhar, registre a limitação, sem aprová-lo por inferência.

Os resultados desta execução devem aparecer na tabela acima. A existência do script e a aprovação dos testes unitários não comprovam a execução do ensaio nem a instalação em aparelho físico.

## Publicação e conferência pública

O commit corrigido [b6b80b6](https://github.com/Altaeir-13/NEXO-Governamental-Eventos/commit/b6b80b6) foi enviado à branch `main` pelo fluxo GitHub existente em **15/10/2026 às 21h45, America/Sao_Paulo**. O Cloudflare Pages concluiu o deployment `c68a286f-da44-43b1-a598-1ceb9ff712a9` com status `success`. O site continua em [nexo-governamental-eventos.pages.dev](https://nexo-governamental-eventos.pages.dev/); a [URL imutável do deployment corrigido](https://c68a286f.nexo-governamental-eventos.pages.dev/) identifica essa versão do código.

O verificador público atualizado aprovou 39 conferências: página inicial e `/admin`, manifest, dimensões dos quatro ícones, service worker e cabeçalhos, URL canônica `/offline` com HTTP 200 e `/offline.html` com HTTP 308, os 23 recursos da allowlist sem redirecionamentos, evento público com HTTP 200 e recusas HTTP 401 para sessão, consulta de ingresso administrativa e confirmação de presença sem autenticação. O procedimento não fez login em produção, não criou inscrições fictícias e não gravou credenciamentos ou certificados no banco real. A carga de cinco horas e os bloqueios do evento oficial foram preservados.

O ensaio Chromium público usou um perfil temporário novo, fora do modo incógnito, em 390 × 844, e aprovou 18 verificações. `navigator.serviceWorker.ready` concluiu, o worker ficou `activated` e passou a controlar a página após reabertura. O único cache NEXO era `nexo-public-38ad0952667c1a69f8ef`, com os mesmos 23 recursos estáticos da allowlist, sem API, query strings ou valores privados. O diagnóstico CDP retornou `installabilityErrors: []` e a interface ofereceu **Instalar aplicativo**. Não houve rolagem horizontal, exceção de página, erro de console, falha de rede ou tentativa de mutação. Os dois avisos de depreciação da metatag Apple foram registrados separadamente e não impediram o funcionamento do PWA; não são erros de instalação.

As evidências sanitizadas dessa rodada estão em `.tmp/pwa-public390-qa.json` (`passed: true`, 18 verificações aprovadas) e `.tmp/pwa-public390.png`. O navegador foi encerrado e os perfis temporários de QA foram removidos após a verificação. O teste técnico em produção não instalou o aplicativo em celulares físicos nem autorizou câmera de aparelhos reais.

Para repetir essa conferência pública de leitura:

```powershell
node scripts/verify-pwa-production.mjs
```

A conferência HTTP comprova publicação e controles públicos e é complementada pela verificação Chromium da ativação, controle, cache e instalabilidade do PWA. Permissões de câmera, autenticação instalada no aparelho e instalação em Android/iPhone físicos continuam na matriz abaixo.

### Incompatibilidade encontrada no domínio público

Na publicação inicial [6fd71f9](https://github.com/Altaeir-13/NEXO-Governamental-Eventos/commit/6fd71f9), deployment `acbd1473-ddd5-48a8-9c96-6b4d909654b2`, o ensaio Chromium no domínio oficial encontrou `/offline.html` respondendo HTTP 308 para `/offline`. O Pages remove a extensão `.html` das URLs públicas por padrão, conforme [a documentação oficial de entrega de páginas](https://developers.cloudflare.com/pages/configuration/serving-pages/). Como o precache recusa redirecionamentos com `redirect: 'error'`, essa resposta interrompeu a instalação do service worker. Os 14 checks HTTP anteriores não conferiam a conclusão dessa instalação e foram insuficientes para aprovar o PWA.

A correção usa a URL pública canônica `/offline` na lista permitida e no fallback, mantendo o arquivo físico `public/offline.html` no build. A fixture reproduz o redirecionamento para que o ensaio local detecte essa classe de incompatibilidade. Os 24 testes PWA, o build e a reexecução Chromium de 14 cenários passaram com essa correção; o teste adicional confere o caminho canônico e preserva a recusa de redirecionamentos inesperados e o cache restrito.

Depois do deployment corrigido `c68a286f-da44-43b1-a598-1ceb9ff712a9`, a reexecução no domínio oficial comprovou `navigator.serviceWorker.ready`, worker ativo controlando a página, cache restrito aos 23 recursos públicos e diagnóstico de instalabilidade sem erros. A incompatibilidade de URL foi corrigida e o PWA ficou tecnicamente validado em produção no Chromium, sem estender esse resultado aos testes físicos pendentes.

## Preservação da produção

Foi criado o backup privado `backups/nexo-antes-pwa-20261015.sql`, fora do Git e dos assets publicados. Essa cópia contém informações restritas e não integra a entrega pública. A atualização não exige migration; preserva schema, banco, contas e dados existentes.

A conferência somente de leitura do evento oficial `slz-2026` encontrou inscrições fechadas (`registration_open=0`), certificados bloqueados (`certificates_released=0`, `certificate_rules_approved=0`) e carga de cinco horas. O evento de teste permaneceu aberto, separado do oficial. Não havia certificados emitidos nem conta com papel `checkin`; a criação nominal do responsável segue o [guia operacional](PWA_CREDENCIAMENTO.md#3-criar-a-conta-do-responsável-pelo-credenciamento) e não foi substituída por conta ou senha padrão.

## Pendências em dispositivos físicos

Todos os itens abaixo ficam **pendentes** até serem executados pela equipe com aparelhos reais e evidência identificando modelo, sistema, navegador, data e resultado. Emulação de tela, renderização estática e mocks de câmera não os aprovam.

| Ensaio | Chrome/Android físico | Safari/iPhone físico |
| --- | --- | --- |
| Instalar, verificar ícone/nome e abrir sem barra do navegador | Pendente | Pendente |
| Usar diretamente no navegador e no PWA instalado | Pendente | Pendente |
| Permitir, negar e recuperar permissão de câmera | Pendente | Pendente |
| Preferência traseira, foco e seleção de câmeras disponíveis | Pendente | Pendente |
| QR no celular do participante e em PDF impresso | Pendente | Pendente |
| QR válido, inválido, revogado/cancelado e de evento diferente | Pendente | Pendente |
| Impedir repetição enquanto consulta/confirmação está em andamento | Pendente | Pendente |
| Confirmar manualmente e ler o próximo ingresso | Pendente | Pendente |
| Conferir horário/operador de ingresso já utilizado | Pendente | Pendente |
| Dois operadores simultâneos no mesmo ingresso | Pendente | Pendente |
| Buscar nome/código e credenciar manualmente | Pendente | Pendente |
| Cortar conexão durante consulta e durante confirmação; repetir sem duplicar | Pendente | Pendente |
| Ocultar/sair da tela e conferir câmera encerrada | Pendente | Pendente |
| Reabrir online; recuperar sessão ou pedir novo login | Pendente | Pendente |
| Nova versão aguardar fechar todas as abas/janelas e ativar ao reabrir | Pendente | Pendente |
| Sem câmera, bloqueio de câmera e uso da alternativa manual | Pendente | Pendente |
| Rede, iluminação e bateria na UNDB, com múltiplos operadores | Pendente | Pendente |

Não existe confirmação offline sincronizada. O ensaio de contingência deve comprovar que a interface não anuncia sucesso sem resposta e que a equipe reconcilia a lista restrita pelo procedimento do [guia operacional](PWA_CREDENCIAMENTO.md#9-contingência-sem-internet).
