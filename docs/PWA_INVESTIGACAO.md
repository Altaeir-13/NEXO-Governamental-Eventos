# Investigação do fluxo existente e decisões preservadas

Auditoria da base `f94a79fab543b7380d546cdb82b4c3a2b2acc17f`, anterior à atualização PWA. Os números de linha abaixo se referem a essa base; os arquivos atuais evoluem. Não foram consultados dados pessoais ou tokens de participantes de produção para mapear o fluxo.

| Tema | Implementação encontrada | Evidência na base |
| --- | --- | --- |
| QR do ingresso na tela | `qrcode` gera imagem com o token individual, em azul `#191F51`, sem nome/e-mail no conteúdo do QR. | `src/App.tsx:64` |
| QR do PDF | O PDF gera matriz com `qrcode/lib/core/qrcode.js`, codificando o mesmo token. O link privado usa `/ingresso#TOKEN`. | `shared/pdf.ts:31`, `shared/pdf.ts:62`, `shared/pdf.ts:65` |
| Token e inscrição | Token de 64 caracteres hexadecimais derivado por HMAC do segredo e chave idempotente da inscrição. Só o SHA-256 é persistido em `tickets.token_hash`; a criação usa transação D1 para participante, inscrição, ingresso e chave de repetição. | `functions/_lib/api.ts:51`–`89`, `functions/_lib/security.ts:5`–`11` |
| Consulta do ingresso | `POST /api/ticket` valida formato e consulta hash não revogado. Cancelamento revoga o token por gatilho. O token é enviado no corpo, sem ser parâmetro de URL da API. | `functions/_lib/api.ts:38`–`44`, `functions/_lib/api.ts:308`–`312`, `migrations/0001_initial.sql` |
| Entrada administrativa | A área existente usa sessão com hash, expiração de oito horas, cookie HttpOnly/Secure/SameSite Strict e CSRF nas mutações. Não foi criado outro sistema de login. | `functions/_lib/api.ts:90`–`103`, `functions/_lib/security.ts:47`–`61` |
| Papéis | `admin_users.role` aceita somente `admin` e `checkin`. O script existente cria ambos. Check-in exige sessão; edição, recuperação, exportação, emissão de certificado e auditoria exigem `admin`. | `migrations/0001_initial.sql:55`–`58`, `scripts/create-admin.mjs:24`–`39`, `functions/_lib/api.ts:32`, `functions/_lib/api.ts:327`–`369` |
| Interface de leitura | A tela Credenciamento já usava `@zxing/browser`, preferia câmera traseira, parava após detecção, consultava `/ticket` e exigia confirmação de identidade antes do POST administrativo. | `src/admin/Admin.tsx:172`–`212` |
| Busca manual | Pesquisa autenticada por nome, e-mail ou código e confirmação pelo código; a interface já oferecia alternativa à câmera. | `functions/_lib/api.ts:342`–`345`, `src/admin/Admin.tsx:210` |
| Persistência da chegada | `checkins` contém inscrição como chave primária, data/hora padrão UTC e `actor_id` associado a `admin_users`. | `migrations/0001_initial.sql:46`–`49` |
| Antiduplicação | `INSERT ... ON CONFLICT(registration_id) DO NOTHING` mantém uma entrada por inscrição. A API distingue nova entrada de presença já existente por `meta.changes`. O gatilho `checkin_active` bloqueia inscrição cancelada inclusive em SQL concorrente. | `functions/_lib/api.ts:253`–`261`, `migrations/0001_initial.sql` |
| Cache e segurança | A API já devolve `Cache-Control: no-store`; SQL parametrizado, verificação de origem, rate limits e CSRF são mantidos. Logs de auditoria usam inscrição/ação/operador, sem token privado. | `functions/_lib/api.ts:7`, `functions/_lib/api.ts:31`, `functions/_lib/security.ts:24`–`56` |

## Aperfeiçoamentos da atualização

O PWA e a nova experiência de câmera aproveitam os tokens, contas, tabelas e a biblioteca gratuita existentes. A consulta administrativa dedicada `POST /api/admin/check-in/lookup` recebe evento e token **ou** código, exige autenticação/CSRF e retorna somente os dados necessários ao credenciamento. O POST de confirmação existente continua separado e exige `confirmIdentity: true`; a leitura não escreve presença.

A resposta inclui nome do operador responsável pelo check-in, preservando o horário e o operador originais em repetições. O resumo administrativo acrescenta percentual, entradas recentes e horário da consulta. A interface atualiza resumo/lista em intervalo de 60 segundos visível/online e após confirmação, sem polling contínuo em segundo plano.

O manifest, ícones Android/iOS e service worker mantêm a identidade do DESIGN fornecido. O build gera uma lista exata dos assets públicos permitidos; o service worker não persiste respostas de API ou páginas com credenciais. HTML é consultado online; a falta de rede apresenta uma orientação genérica, sem simular confirmação de entrada. A nova versão aguarda o fechamento das janelas anteriores para ativar, sem `skipWaiting` automático.

## Certificados e decisão institucional

A emissão e a consulta do certificado exigem cumulativamente inscrição ativa, check-in existente e `certificate_eligible=1`, além de evento oficial, aprovação das regras, liberação, data/local confirmados, signatários e disponibilidade configurada após o evento. Eventos de teste são bloqueados. Evidências: `functions/_lib/api.ts:45`–`50`, `functions/_lib/api.ts:264`–`296`, `functions/_lib/api.ts:308`–`318` e `migrations/0008_test_registrations.sql`.

Os gatilhos de `migrations/0003_certificate_integrity.sql` verificam presença e elegibilidade também no banco; `0004_snapshot_consistency.sql` compara o snapshot com nome e configuração atual. Cancelamento, remoção de presença e reprovação de elegibilidade revogam os certificados correspondentes. A autorização individual pelo administrador já é distinta do credenciamento.

Não há campo de check-out ou medição de permanência. A atualização mantém a escolha institucional futura: entrada como registro de chegada e conferência manual das condições de participação antes da elegibilidade, sem exigir saída automaticamente. Não foram alterados carga horária, dados de produção, inscrição oficial, signatários, liberações ou contas existentes nesta auditoria.

| Ponto | Base disponível | Decisão pendente |
| --- | --- | --- |
| Carga certificada | `certificate_hours` padrão 5 em `migrations/0001_initial.sql:11`; a interface lê a configuração do evento. | Conferir com a proposta aprovada antes da liberação. Não modificar nesta tarefa. |
| Duração | Seed prevê entrada às 18h, abertura às 18h30 e encerramento sem horário fixado (`migrations/0002_seed.sql`). | Conferir duração efetiva e atividades que justificam a carga; não inferir cinco horas de permanência a partir da entrada. |
| Proposta oficial | Não há arquivo autônomo de proposta aprovado no workspace. O ZIP privado disponível contém somente conversas em texto/Markdown, sem anexo formal identificado. Nenhuma conversa privada foi copiada para os artefatos públicos. | Obter a versão institucional aprovada para comparação. A ausência impede afirmar uma divergência quantitativa específica. |
| Entrada ou permanência/saída | Banco registra chegada e aprovação individual de elegibilidade. | Coordenação define depois método de conferência, responsáveis e exceções; uma eventual saída digital precisa de escopo e testes próprios. |

Consulte [o guia operacional](PWA_CREDENCIAMENTO.md) e [as evidências de teste da atualização](PWA_VALIDACAO.md).
