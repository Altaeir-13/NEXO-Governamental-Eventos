# Implantação NEXO Governamental — 15/10/2026

## Modo de inscrições de teste

A atualização acrescenta o evento isolado **NEXO — Inscrições de teste**, acessível em `/inscricao?evento=teste-inscricoes`, mantendo `slz-2026` fechado e os certificados bloqueados. A migration aditiva **0008_test_registrations.sql** foi aplicada no D1 existente após exportação privada `backups/antes-inscricoes-teste-20261015.sql` (23.638 bytes). Nenhuma migration anterior foi alterada; as configurações e os dados oficiais foram preservados.

Validações da revisão: 150 testes da suíte completa, incluindo 44 de integração com D1 efêmero, além de três testes do middleware real com HTMLRewriter, aprovados; TypeScript, build e compilação das Pages Functions aprovados. O teste dedicado de integração também passou em execução anterior com 43 cenários. O PDF fictício de teste foi renderizado com Poppler e inspecionado. O aviso conhecido do tamanho do chunk PDF permanece. As evidências finais de commit, deployment e ensaio no HTTPS público são informadas na entrega.

O teste usa perfil opcional, ciência do aviso contextual, ingresso/QR sem validade oficial, filtros administrativos e limpeza transacional exclusiva para teste. API padrão, metadados da homepage e sitemap excluem eventos de teste. Os certificados de teste são bloqueados também no D1. Consulte [TESTES_INSCRICAO.md](TESTES_INSCRICAO.md) para operar, encerrar, reabrir uma rodada e abrir oficialmente após autorização.

O commit funcional **db3a04e62b67b526e8482a408260facec7c20302** foi publicado por `github:push`, deployment **d41105fb-587a-44f5-a51a-50282bce66b4**, concluído às **20h14 de 15/10/2026 (America/Sao_Paulo)**. Depois do deployment, foi criado `nexo-teste-inscricoes`, slug `teste-inscricoes`, tipo teste permanente e capacidade própria de 120, sem alterar os campos existentes de `slz-2026`.

O ensaio no HTTPS real incluiu formulário em viewport mobile de 390 px, validação de e-mail inválido, perfil estudante, instituição/curso vazios, confirmação, download do ingresso e persistência. O QR Code foi decodificado tanto da imagem da tela quanto do PDF renderizado e correspondeu à credencial individual. A lista administrativa e o CSV encontraram o cadastro. Credenciamento de teste funcionou, QR no evento oficial foi recusado, cancelamento revogou o ingresso, duplicidade foi recusada, CSRF foi exigido e limpeza do evento oficial foi bloqueada.

Dois cadastros inteiramente fictícios foram anonimizados pela ação de limpeza, com auditoria preservada. A verificação administrativa usou sessão curta de uma conta existente, sem alterar contas, senhas ou permissões; a sessão foi removida no encerramento. O evento de teste foi reaberto e terminou com **120 vagas livres**. Todos os campos originais do evento oficial permaneceram iguais, com inscrições fechadas, certificados bloqueados e 120 vagas oficiais. O sitemap não contém o teste, cuja página responde `X-Robots-Tag: noindex, nofollow`. O ensaio não incluiu uso de câmera física de celular; essa conferência continua necessária no aparelho da recepção.

## Atualização visual e editorial

As seções **Ponto de Encontro** e **Vozes que ampliam o debate** foram atualizadas preservando o Pages, o D1 e a autenticação existentes. A fotografia do local e os retratos ficam prontos para arquivos autorizados. Nenhuma foto da UNDB foi republicada: a galeria oficial foi inventariada, mas os termos exigem permissão. Mauro Rocha, Ítalo Leite e a participação da Psicologia permanecem pendentes, despublicados e sem aprovações editoriais. Consulte [CONTEUDO_EDITORIAL.md](CONTEUDO_EDITORIAL.md) para fontes, rascunho e operação do painel.

A migration **0007_editorial_content.sql** foi aplicada no D1 remoto após exportação privada para `backups/antes-editorial-20261015.sql` (ignorada pelo Git). Apenas acrescenta campos, dois gatilhos de publicação e a descrição institucional solicitada para o local. As seis migrations anteriores foram preservadas. Antes e depois da aplicação: zero inscrições, zero participantes, zero certificados e um administrador; `registration_open`, `certificates_released` e `certificate_rules_approved` continuam em zero. A confirmação do local também permanece em zero.

Validações desta atualização: TypeScript, build de produção e compilação das Pages Functions aprovados; 63 testes de backend/segurança/migrations/URLs aprovados e oito testes de renderização editorial aprovados após corrigir uma asserção que confundia `ll=` com o atributo SVG `fill=`. O comando separado de integração também passou com 35 testes. O aviso conhecido de tamanho do chunk PDF permanece.

O navegador foi exercitado em 1280 px e 390 px, com D1 efêmero e quatro cadastros fictícios: três públicos e um oculto. Foram conferidos imagem carregável (padrão geométrico exclusivo do ensaio), imagem ausente, arquivo inexistente com retorno às iniciais, créditos ocultados após falha, ausência de rolagem horizontal, links de mapas por endereço e edição/reaprovação da biografia pelo formulário mobile com persistência na página pública do ensaio. Nenhum dado fictício foi inserido em produção. A revisão de acessibilidade incluiu semântica, rótulos, foco, leitura dos textos e respeito ao movimento reduzido; não substitui ensaio com leitores de tela e aparelhos físicos.

A publicação desta revisão usa a integração GitHub → Pages da branch `main`. Não foram criados projeto, banco, bucket, serviço de imagens ou cobrança. O commit e o resultado final do deployment são informados na entrega da atualização.

---

O site está publicado e as Functions estão conectadas ao D1. Inscrições e certificados permanecem bloqueados. A publicação preservou a aplicação existente; as alterações de código ficaram restritas à compatibilidade das migrations, com configuração e documentação da implantação.

## GitHub e atualização automática

| Item | Configuração verificada |
|---|---|
| Repositório | https://github.com/Altaeir-13/NEXO-Governamental-Eventos |
| Visibilidade | Público, já existente e inicialmente vazio |
| Branch | `main` |
| Primeiro commit | `46a422c8b82dc4ad0927af82d25ba334b6eaa69a` |
| Versão funcional e configuração verificadas | `f590d2414329da0fd2d5c5112e1b5ad00d3ce7dc` |
| Integração | GitHub → Pages, produção habilitada; deployment com gatilho `github:push` concluído |

O Git local foi inicializado sem histórico anterior e `origin` aponta para o repositório informado. Não houve push forçado ou reescrita de histórico. Os commits de documentação posteriores integram o mesmo fluxo automático; consulte a aba Deployments para o hash mais recente.

Foram revisados os 50 arquivos do primeiro commit e confrontados com os segredos locais sem exibir valores: nenhum arquivo privado ou valor de credencial foi encontrado. `.gitignore` exclui `.dev.vars*`, `.env*` com exceções de exemplo, `.wrangler/`, caches, temporários, bancos, backups, SQL fora de migrations, PDFs, CSVs, ZIPs e materiais privados de referência. Os 23 assets do primeiro deployment foram conferidos no manifesto; código de servidor não é disponibilizado como arquivo estático. O frontend não contém `TOKEN_SECRET` ou credenciais Cloudflare.

## Cloudflare

| Item | Estado |
|---|---|
| Aplicação | **Cloudflare Pages** `nexo-governamental-eventos` |
| ID Pages | `e3e6268f-d2ac-4cd1-b8fc-8afaa3941210` |
| URL pública oficial | https://nexo-governamental-eventos.pages.dev |
| Deployment funcional verificado | `80a0ae2d-8bae-4b57-b250-cdf439d8df7e`, Production, sucesso em 15/10/2026 às 12h47 BRT |
| Functions | `uses_functions: true`; logs confirmam descoberta de `/functions`, compilação e upload |
| Build | `npm run build`, saída `dist`, raiz do repositório |
| Node | `NODE_VERSION=22`; logs: Node 22.22.0/npm 10.9.2 |
| Compatibilidade | `2026-08-01` |
| D1 | `nexo-eventos`, UUID `612ea13a-1f61-462f-8709-fdfa07cdadde` |
| Binding | `DB`, somente Production |
| Migrations | 6/6 aplicadas, 14 gatilhos instalados |
| Segredo criptografado | `TOKEN_SECRET`, somente Production |
| Previews | Automáticos desabilitados; nenhum D1 ou segredo de produção no preview |
| Falha por cota | `fail_open: false` |

O inventário inicial não tinha Pages nem D1. Havia um Worker de modelo com o mesmo nome, sem assets ou bindings; ele foi preservado. Sua configuração não executa automaticamente a estrutura de Pages Functions existente, justificando o Pages separado. Os dois deployments anteriores do Worker vieram de `dash_template`. A consulta de históricos Workers Builds foi recusada por falta de permissão; os logs e a integração do Pages foram consultados e verificados diretamente.

O segredo foi gerado com 32 bytes criptograficamente aleatórios na memória e enviado como `secret_text`, sem exibição, arquivo local ou inclusão no Git. Não foi reutilizado o segredo de desenvolvimento. A configuração efetiva preserva esse segredo e coincide com `wrangler.toml` quanto ao banco e ao Node. Foi necessário declarar `NODE_VERSION` em `[vars]`, pois o Wrangler passa a ser a fonte dessas variáveis após o deployment. Referência: [configuração de Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).

O plano **Free — $0 — Current plan** foi confirmado na captura do painel **Workers plans** fornecida pelo responsável em 15/10/2026. Não foram contratados planos, domínios ou serviços pagos, adicionados cartões ou alteradas assinaturas. A consulta de cobrança pela sessão OAuth retornou 403; a confirmação veio da tela do plano atual. O login e as operações HTTPS descritas abaixo funcionaram nessa conta Free. Nenhuma oferta de upgrade é necessária.

## Validações realizadas

| Comando | Resultado final |
|---|---|
| `npm run typecheck` | Aprovado |
| `npm test` | 38/38, três arquivos, 92,16 s |
| `npm run test:integration` | 31/31, 91,88 s |
| `npm run build` | Aprovado |
| `wrangler pages functions build` | Compilação aprovada |
| `npm audit --omit=dev` | Zero vulnerabilidades |

A execução local usou Node 24.16.0; o build remoto comprovou Node 22.22.0. As suítes executaram o handler real com D1 efêmero, dados fictícios e as seis migrations. Cobrem inscrição, validação, duplicidade, idempotência, concorrência pela última vaga, cancelamento, ingresso/QR individuais, recuperação e revogação, papéis, CSRF, presença, CSV, PDFs, autenticidade, histórico de certificados e emissão em lote de 120 pessoas. Os testes de migrations verificam também os impedimentos por SQL direto. Nenhuma inscrição fictícia foi inserida em produção.

No HTTPS público, foram conferidos:

- Home, página do evento, inscrição, administração, certificados, validação, privacidade, robots e sitemap: HTTP 200.
- Evento público/API: HTTP 200 com dados reais do D1, oito itens de programação e convidados ainda não publicados. Data e local permanecem provisórios, auditório ocultado e coordenadas não confirmadas zeradas. Links para Google Maps/Waze usam o endereço previsto.
- Participantes, sessão e CSV sem autenticação: HTTP 401. Validação de código inexistente: HTTP 404 na API.
- Login com senha privada definida pelo responsável: HTTP 200; sessão, dashboard, participantes e CSV vazio: HTTP 200; CSRF inválido: HTTP 403; logout: HTTP 200; sessão anterior após logout: HTTP 401.
- Cookies: HttpOnly, Secure e SameSite=Strict. A inspeção e os testes conferem SQL parametrizado, autorização por papel, limites de requisições, tokens de 256 bits, hashes no banco e bloqueios de certificação.
- Assets JavaScript/CSS/favicon públicos: HTTP 200 e hashes idênticos ao build local. HTML com CSP, HSTS, nosniff, proteção contra frames e política de referência.
- Navegador em 390 px e 1280 px: sem rolagem horizontal; menu móvel funcional. A inscrição fechada informa o estado e não oferece formulário.

O primeiro administrador foi criado diretamente no D1 remoto com `npm run admin:create -- --remote`, papel `admin`, pelo script existente. A senha e sua confirmação foram digitadas sem eco pelo responsável. O verificador HTTPS manteve senha e sessão somente na memória e gravou apenas os resultados acima. O estado final conferido contém **um administrador, zero sessões ativas, zero inscrições e zero certificados**.

PBKDF2-SHA256 permaneceu com 100.000 iterações e salt individual. O login remoto completou em aproximadamente 1.006 ms de tempo de parede, sem erro de limite de CPU; esse tempo não mede CPU por invocação nem comprova desempenho sob carga. PDFs continuam gerados no navegador a partir dos dados autorizados pela API. A emissão de produção foi preservada bloqueada; ingresso, presença e emissão/revogação foram exercitados em ambiente isolado.

## Problemas corrigidos e limites

O callback OAuth em `localhost:8976` expirou; a autorização oficial por dispositivo concluiu o login sem solicitar segredos no chat. A primeira tentativa de migrations remotas retornou `incomplete input` e foi revertida. Os gatilhos contendo `CASE ... END` foram reescritos de forma equivalente com `SELECT RAISE ... WHERE` e aritmética booleana, antes de qualquer migration bem-sucedida em produção. A reaplicação funcionou e os testes mantiveram as regras de capacidade, presença e certificados. Migrations já aplicadas não foram novamente editadas.

O audit completo registrou seis avisos em dependências de desenvolvimento: Vitest/Mocker/Tinypool e Miniflare/Sharp/Undici (um moderado, três altos e dois críticos). Não foram encontradas importações desses pacotes em `src/`, `functions/` ou `shared/`, nem caminho HTTP público que exercite os mecanismos afetados. O risco das ferramentas de teste/CI permanece e merece atualização separada com regressão; não foi aplicado `audit fix --force`. As dependências de produção auditadas retornaram zero avisos. Advisories: [Mocker](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9), [Tinypool](https://github.com/tinylibs/tinypool/security/advisories/GHSA-5gmw-xhrv-c9v3), [Sharp](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c), [Undici](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3).

A tentativa adicional de scan Codex Security falhou ao iniciar com “The selected scan target changed while the scan was starting”. Não retornou identificação de scan, não analisou fontes e não produziu relatório. A skill proíbe iniciar um substituto após essa falha; os resultados descritos aqui são das verificações operacionais, inspeções e testes, sem atribuição ao scan indisponível.

Continuam pendentes decisões institucionais sobre data, auditório, convidados, horários detalhados, contatos, privacidade/retenção, imagens, critérios de presença e signatários. Permanecem necessários ensaios físicos de câmera, download e rede em iPhone/Android e no auditório. O aviso conhecido do chunk PDF carregado sob demanda não impediu o build. Não há teste de carga remoto, expurgo agendado ou cópia externa automática de backup.

## Operação e recuperação

O painel é **https://nexo-governamental-eventos.pages.dev/admin**. Use o e-mail cadastrado e a senha privada escolhida. Cada operador deve receber sua própria conta; papel `checkin` limita permissões.

Em **Dados do evento → Inscrições e capacidade**, mantenha **Habilitar inscrições** desmarcado. A abertura exige autorização explícita e a confirmação de data, local e contato institucional. Para fechar depois, desmarque e salve. Em **Participantes**, pesquise por nome/e-mail/código e use **Exportar CSV offline**. Em **Credenciamento**, leia o QR ou busque a pessoa e confira identidade antes de confirmar presença.

Em dezembro de 2026, confirme a carga horária de cinco horas, texto, data/local, signatários, presença e elegibilidade individual. Preserve a data `2026-12-01T03:00:00.000Z` ou outra data de dezembro aprovada. Só então aprove regras e libere certificados no painel; teste a validação pública e revogue emissões incorretas. Consulte [OPERACAO.md](OPERACAO.md#11-liberar-certificados-em-dezembro-de-2026).

Atualizações: execute os quatro comandos de validação, revise o diff e os arquivos privados, faça backup, aplique novas migrations compatíveis se existirem e envie o commit à `main`. Aguarde sucesso no Pages e confira home, API e login. Novos deployments preservam o mesmo D1. Para voltar o site, use rollback Pages ou um commit de reversão; banco exige procedimento próprio.

Foram salvos backups privados em `backups/`, ignorados pelo Git: estrutura inicial e cópia completa posterior à criação do administrador. A estrutura sem dados administrativos foi restaurada em D1 **local novo e isolado** (`.tmp/restauracao-estrutura-20261015`): 58 comandos, um evento, 14 gatilhos, inscrições e certificados fechados. A cópia completa contém hashes de credenciais e auditoria; mantenha acesso restrito e providencie armazenamento externo protegido. Não publique nem importe o backup sobre produção para testar.

Para novos backups e recuperação, siga [OPERACAO.md](OPERACAO.md#8-backup-e-restauração): `wrangler d1 export`, conferência de Time Travel e restauração primeiro em banco vazio. Time Travel Free possui janela de sete dias; restauração destrutiva de produção exige autorização específica e reconciliação posterior. Referência: [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

Confira cotas em **Workers & Pages → Metrics**, **D1 → Metrics** e **Workers plans**. Functions compartilham 100 mil requisições/dia no Free; D1 inclui 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB totais. O limite de CPU Free é de 10 ms por invocação, com comportamento e tolerâncias definidos pela plataforma. Fontes: [Functions](https://developers.cloudflare.com/pages/functions/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [limites Workers](https://developers.cloudflare.com/workers/platform/limits/). Ao atingir limites, investigue erros e uso; não ative upgrade ou plano pago sem autorização.
