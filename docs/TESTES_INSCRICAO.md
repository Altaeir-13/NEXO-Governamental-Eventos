# Inscrições de teste no sistema publicado

Link para computador e celular: **https://nexo-governamental-eventos.pages.dev/inscricao?evento=teste-inscricoes**.

O evento **NEXO — Inscrições de teste** usa as mesmas Pages Functions, D1, administração, ingressos e credenciamento do sistema oficial. É uma demonstração com persistência real. Seu cadastro e ingresso não são válidos para o encontro oficial, não ocupam suas vagas e não emitem certificado. Não há outro projeto Cloudflare, serviço de envio de e-mail ou cobrança.

## Fazer uma inscrição

Informe nome completo, e-mail válido e confirme a leitura do aviso de privacidade. Perfil, instituição e curso ou área são opcionais. O aviso deste evento está em `/privacidade?evento=teste-inscricoes`.

Após confirmar, salve o PDF ou o link privado do ingresso. O QR Code contém uma credencial individual conferida no servidor. Não há envio automático por e-mail. A recuperação continua exigindo conferência de identidade pela organização; não existe consulta pública apenas por e-mail.

O mesmo e-mail não pode se inscrever duas vezes no mesmo evento. É permitido usá-lo no teste e, futuramente, no evento oficial: as inscrições e capacidades são separadas. Duplo clique e repetição da mesma solicitação não criam segunda vaga.

## Consultar, credenciar, cancelar e exportar

1. Entre em https://nexo-governamental-eventos.pages.dev/admin com sua conta existente.
2. No seletor **Evento selecionado**, escolha **[Teste] NEXO — Inscrições de teste**. Contagens e vagas pertencem somente ao evento selecionado.
3. Em **Participantes**, pesquise nome, e-mail ou código. A tabela mostra perfil, instituição, curso/área, data e horário, código, situação, presença e tipo Teste/Oficial. O filtro por tipo e o CSV respeitam esse evento e a busca.
4. Em **Credenciamento**, selecione o evento de teste, leia o QR Code ou informe o código e confirme a identidade. Um ingresso do teste é recusado no evento oficial. A câmera exige permissão do navegador; confira sua operação no aparelho da recepção.
5. Para cancelar, use **Editar** em Participantes e selecione **Cancelada**. A vaga é liberada, o ingresso é revogado e o formulário remove presença/elegibilidade. A recuperação do ingresso cancelado continua bloqueada.

## Encerrar e limpar os testes

Somente administradores podem usar **Encerrar e anonimizar testes** na lista de participantes de um evento de teste. Revise o nome do evento e digite exatamente **ANONIMIZAR TESTES**.

A ação fecha novas inscrições desse teste, cancela os registros, substitui nome/e-mail, apaga campos opcionais, revoga ingressos, remove presenças e chaves de repetição e preserva a auditoria. Não apaga banco, configurações, administradores, inscrições ou certificados oficiais. Recusa identidades compartilhadas com outro evento ou certificado emitido. A verificação e limpeza são uma transação D1 protegida contra novas inscrições simultâneas.

O evento permanece no seletor, fechado. Para nova rodada, use **Dados do evento → Inscrições e capacidade**, revise o período e marque **Habilitar inscrições**. Não altere a capacidade oficial para testar lotação. O prazo operacional de revisão do teste é de 30 dias; não há exclusão automática. A organização também deve revisar exportações e backups.

## Abrir oficialmente após autorização

Selecione **[Oficial] O Labirinto da Liberdade**, confira capacidade, data/local confirmados, contato institucional, aviso e períodos. Depois da aprovação da organização, marque **Habilitar inscrições** e salve. O servidor exige data/local e contato para abrir. O link oficial continua `/inscricao`.

Não converta o teste em oficial: o tipo é permanente, protegido na API e no D1. Quem fez o teste precisará se inscrever no evento oficial após sua abertura. A liberação dos certificados é independente e permanece bloqueada até o cumprimento das regras institucionais.

## Implementação e validação

A migration aditiva `0008_test_registrations.sql` acrescenta `events.is_test` com padrão oficial e `registrations.profile` opcional. Os campos históricos `consent_at` e `consent_text` registram ciência do aviso, sem assumir consentimento como base legal de todas as operações. Nenhuma migration anterior foi editada.

Eventos de teste são excluídos da seleção automática da homepage. Perfil e tipo integram respostas administrativas e CSV. O tipo é derivado do evento, sem escolha pelo participante. Permanecem unicidade, contadores/gatilhos de capacidade, tokens com hash, autenticação, sessões, origem e CSRF existentes. Novos gatilhos bloqueiam certificados de teste e inscrições após o encerramento.

`POST /api/admin/test-data/cleanup` exige administrador, sessão, CSRF e `{eventId, confirmation:"ANONIMIZAR TESTES"}`.

Execute `npm run typecheck`, `npm test`, `npm run test:integration` e `npm run build`. Os testes usam D1 efêmero e incluem duplicidade, repetição, perfis, opcionais, capacidade concorrente, QR/credenciamento, PDF, isolamento, filtros/CSV, cancelamento, permissões, aviso e limpeza preservando certificado oficial.

Antes da migration remota, exporte backup privado ignorado pelo Git. Aplique `0008` antes do novo backend; crie o teste depois da publicação dos filtros da API, dos metadados e do sitemap, para o código anterior não o selecionar como encontro principal. Uma reversão de código deve preservar os filtros `is_test=0`; fechar as inscrições de teste, sozinho, não impede a seleção por data feita pelo código antigo. Preserve as colunas aditivas e os dados.
