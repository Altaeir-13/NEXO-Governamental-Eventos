# Validação da atualização PWA e credenciamento

Este relatório descreve somente a atualização PWA. Os relatórios anteriores permanecem como histórico e não comprovam testes desta versão. Nenhum ensaio em computador substitui instalação e câmera em Android/iPhone físicos.

## Verificações automatizadas

TypeScript, build, compilação das Functions e os testes abaixo passaram. A suíte e a integração foram executadas com permissão de loopback para o D1 efêmero do Miniflare. A restrição inicial de ambiente foi resolvida; não se consideraram cenários pulados como aprovados.

| Verificação | Evidência desta atualização |
| --- | --- |
| `npm run typecheck` | Aprovado na versão integrada. |
| `npm test` | 204/204 aprovados, em 15 arquivos, em 171,19 s. |
| `npm run test:integration` | 52/52 aprovados, em D1 efêmero, em 171,09 s. Estes cenários também integram a suíte; não são 52 casos adicionais. |
| Proteção de credenciais na busca e controle da câmera | Após a suíte completa, foi acrescentado um cenário para tokens/links privados malformados. A execução direcionada de `tests/checkin-camera.test.ts` aprovou 16/16 em 598 ms: 15 já estavam na suíte e somente um é novo. Conjunto atual: 205 cenários distintos validados pelas duas execuções, sem alegar nova execução completa de 205. |
| `npm run build` | Aprovado novamente em 7,14 s, incluindo `tsc --noEmit`. |
| Pages Functions | Compilação concluída com `Compiled Worker successfully`, sem erros, usando `WRANGLER_LOG_PATH=.tmp/pwa-functions-build.log`. |
| Manifest, dimensões dos ícones, allowlist e atualização do service worker | 23/23 testes PWA aprovados, incluídos nos 204 da suíte; conferem PNG 192/512/maskable/Apple 180, manifest, instruções, cache restrito, fallback e ativação sem troca forçada. |
| Interface de credenciamento e limites de conexão | 3/3 testes de interface e 2/2 testes de timeout/leitura JSON aprovados, incluídos na suíte. |
| Chromium com dados fictícios | 14/14 cenários aprovados, saída zero, versão 151.0.7922.10 e viewport 390 × 844; detalhes abaixo. |
| WebKit em computador | Ensaio ainda em execução; não aprovado antecipadamente. Não equivale ao Safari/iPhone físico. |
| Publicação automática após push em `main` | Aguardando confirmação do deployment desta versão. |

Os testes de integração usaram D1 efêmero com dados fictícios e não importaram produção. Cobriram consulta de QR autenticada, token/código, confirmação separada, cancelamento/revogação/evento incorreto, sessão/CSRF/papel, concorrência de dois operadores e preservação de operador/horário na repetição. A suíte PWA verificou que API, navegações privadas, tokens, sessões e certificados não entram no cache, e que a atualização não força troca no meio de uma operação. Os testes da câmera usam streams/decodificador simulados para conferir encerramento e bloqueio de repetição; não aprovam o comportamento óptico ou as permissões de um celular real.

## Ensaio no Chromium

O ensaio de navegador concluiu 14 cenários em Chromium 151.0.7922.10, com viewport de 390 × 844 e D1 efêmero. Verificou login fictício, navegação móvel sem rolagem horizontal, busca por nome/código, conferência manual, gravação real no D1 com horário/operador, ingresso duplicado sem botão para nova confirmação, inválido, cancelado, proteção de credencial privada malformada e falha de conexão sem sucesso falso. A reconexão e a consulta segura permitiram prosseguir; a reabertura recuperou a interface autenticada e a presença do servidor.

A biblioteca ZXing real decodificou um QR fornecido por `MediaStream` sintético de canvas. O ensaio conferiu bloqueio de repetição, encerramento das tracks, retomada manual/automática, seleção de câmera e limpeza ao sair. Permissão negada e câmera ausente foram simuladas; não se tratou de câmera física.

O service worker foi instalado e controlou a página; o cache continha 23 recursos estáticos públicos, sem caminhos/valores privados. Uma atualização ficou em espera e preservou o texto de um formulário aberto. Fechar todas as páginas permitiu ativar a versão nova e remover o cache público anterior. Reabrir offline retornou a página genérica HTTP 503, sem dados pessoais; a volta da conexão recuperou o aplicativo.

As evidências locais sanitizadas estão em `.tmp/pwa-browser/report.json` e `.tmp/pwa-browser/chromium-credenciamento-390.png`, ignoradas pelo Git. Esse ensaio comprova o fluxo no Chromium de computador com tela emulada; instalação na tela inicial e câmera Android/iPhone reais continuam pendentes na matriz abaixo.

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
