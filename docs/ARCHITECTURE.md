# Arquitetura e plano de execução

React + TypeScript + Vite, Nunito hospedada localmente, CSS responsivo e acessível. API HTTP em Cloudflare Pages Functions; banco relacional Cloudflare D1, migrations versionadas. Nenhum serviço pago obrigatório. Todos os dados operacionais passam pela API, nunca por uma simulação no navegador.

A implantação usa o Pages `nexo-governamental-eventos`, branch `main`, build `npm run build` e saída `dist`. O binding `DB` aponta para o D1 `nexo-eventos`; `TOKEN_SECRET` existe somente como segredo de servidor em Production. O Wrangler é a fonte de configuração dos bindings e de `NODE_VERSION=22`. Previews automáticos estão desabilitados e o ambiente de preview não recebe o D1 de produção. Os IDs e as evidências estão em [IMPLANTACAO.md](IMPLANTACAO.md).

1. Fundação: configuração, tipos compartilhados, schema e integridade no banco.
2. Site público: identidade NEXO, dados provisórios explícitos, agenda e convidados aprovados.
3. Inscrições: validação, transação atômica, idempotência, ingresso individual e PDF.
4. Administração: autenticação, sessão, permissões, gestão e credenciamento.
5. Certificados: aprovação institucional, presença, liberação por data, PDF e autenticidade.
6. Qualidade: testes com SQLite/D1 local, concorrência, build, segurança e operação Cloudflare.

O DESIGN fornecido é referência obrigatória. Corrigimos o contraste indicado no próprio documento, o menu mobile e estados de feedback com texto/ícone e cores institucionais. Dados não confirmados não são apresentados como definitivos. Materiais de conversa não são publicados.

Tokens de ingresso são credenciais de posse: 256 bits aleatórios, somente hashes no banco e compartilhamento pelo fragmento da URL. Recuperação administrativa exige verificação de identidade fora do site e revoga o token anterior. Sessões administrativas usam cookies HttpOnly e hash no banco. Mutações exigem origem correspondente e token CSRF. A capacidade é garantida no banco, inclusive em concorrência.

## Contrato HTTP

JSON com erros `{error: string}`. GET `/api/event?slug=...` retorna `PublicEvent`. POST `/api/register` recebe `{eventId,name,email,institution,course,consent,website,idempotencyKey}` e retorna `{token,code,id}`. POST `/api/ticket` recebe `{token}` e retorna `Ticket`. POST `/api/certificate` recebe `{token}` e retorna `{snapshot,code,issued_at}` após autorização. O navegador gera os PDFs com `shared/pdf.ts`, sob demanda e com dados oficiais, evitando depender de processamento pesado nas Functions do plano gratuito. GET `/api/validate/:code` retorna certificado público mínimo.

POST `/api/admin/login` e GET `/api/admin/session` retornam `AdminSession`. POST `/api/admin/logout`. Demais mutações exigem `X-CSRF-Token`. GET/PUT `/api/admin/event?eventId=...`; GET/POST `/api/admin/events`; GET/POST `/api/admin/speakers?eventId=...`, PUT/DELETE `/api/admin/speakers/:id`; idem schedule. GET `/api/admin/participants?eventId=...&q=...` retorna `{participants}`; PATCH `/api/admin/participants/:id` altera nome/email/institution/course/status/checkedIn/certificateEligible; DELETE anonimiza. POST `/api/admin/participants/:id/recover` exige `{identityVerified:true,reason}` e retorna `{token,code}`. GET `/api/admin/dashboard?eventId=...` retorna métricas; POST `/api/admin/check-in` recebe `{token|code,eventId,confirmIdentity:true}`. GET `/api/admin/export?eventId=...` CSV. POST `/api/admin/certificates` recebe `{registrationIds,action:'issue'|'revoke'}`; GET lista incluindo emissões anteriores invalidadas; POST `/api/admin/certificate-preview` retorna os dados de uma prévia sem validade para renderização local. GET `/api/admin/audit` histórico.

EventSettings e tipos são compartilhados em `shared/types.ts`. Rotas administrativas respeitam o papel `admin` ou `checkin`. Painel envia campos de EventSettings para edição; respostas não retornam segredos. A API decide elegibilidade, abertura, capacidade e confirmação.

## Inscrições de teste

A migration aditiva `0008_test_registrations.sql` acrescenta `events.is_test` e `registrations.profile`. O tipo é imutável e derivado do evento na resposta administrativa. A homepage seleciona somente eventos oficiais, enquanto o teste exige slug explícito. POST `/api/register` também aceita `profile` opcional (`student`, `teacher`, `professional`, `other` ou vazio). O campo histórico `consent` registra ciência do aviso; o texto e instante são armazenados em `consent_text`/`consent_at`. Perfil vazio mantém compatibilidade da chave idempotente anterior.

GET de participantes e CSV aceita `kind=all|test|official` junto de evento e busca. POST `/api/admin/test-data/cleanup` exige administrador, CSRF e `{eventId,confirmation:"ANONIMIZAR TESTES"}`. Fecha e anonimiza exclusivamente o evento de teste em batch atômico, preservando auditoria e recusando identidades compartilhadas ou certificado emitido. Gatilhos serializam a limpeza contra novas inscrições e impedem certificados de teste, mantendo as regras oficiais intactas. Consulte [o roteiro de testes](TESTES_INSCRICAO.md).

## Conteúdo editorial

A migration aditiva `0007_editorial_content.sql` acrescenta descrição e metadados da foto do local, vínculo profissional, horário, tema/resumo e aprovações dos convidados. Os campos existentes de instituição, auditório, endereço, foto, biografia, confirmação e publicação são reaproveitados. Nenhuma tabela operacional é substituída.

Convidados públicos exigem `confirmed`, `published=1`, `credentials_verified=1` e `bio_approved=1`. A API exige biografia aprovada entre 40 e 80 palavras e resumo aprovado entre 40 e 90. Os gatilhos impedem novas publicações sem as aprovações básicas. Tema e foto possuem aprovações independentes: rascunhos e metadados de imagens sem autorização são retirados das respostas públicas, inclusive dados de local retornados pelo ingresso. A programação não expõe o identificador de convidados ocultos.

Imagens são assets versionados em `public/images/`, configuráveis pelo painel usando `/images/...` ou HTTPS validado. Não há upload, bucket ou produto pago novo. O frontend reserva proporções, carrega imagens sob demanda e usa iniciais ou composição institucional quando não há imagem autorizada ou o arquivo falha. Consulte [o guia editorial](CONTEUDO_EDITORIAL.md).
