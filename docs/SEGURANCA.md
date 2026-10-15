# Segurança e privacidade operacional

Este documento descreve mecanismos técnicos e procedimentos da plataforma. A coordenação deve aprovar aviso de privacidade, responsabilidades, retenção, critérios de presença e emissão, uso de imagens e assinaturas. Não há certificação jurídica automática.

## Dados e acesso

A inscrição coleta nome e e-mail; instituição e curso são opcionais. O site não pede CPF. A API valida os campos e o aceite do aviso. E-mails são normalizados e o banco impede duplicações no mesmo evento. Participantes e inscrições são entidades separadas, permitindo reutilização por evento sem publicar uma lista de pessoas.

Somente equipe autenticada acessa dados pessoais e exportações. O papel de credenciamento tem permissões limitadas; gestão de configurações, recuperação e emissão exige administrador. A API decide a autorização em cada rota. Ocultar um botão no navegador não é um controle de acesso.

A verificação pública de certificado exige código imprevisível e apresenta somente nome, evento, carga horária, emissão e situação. Não oferece busca por e-mail/nome nem exportação pública de inscritos. O PDF é renderizado no navegador após a API autorizar e retornar o snapshot oficial. O documento não tem assinatura digital criptográfica; sua autenticidade é conferida pelo código e pelos dados oficiais da página de validação. Alterar um PDF não altera esse registro.

## Credenciais e sessões

Senhas administrativas usam PBKDF2 com salt individual; não há senha padrão nem credenciais no React. Cookies de sessão são HttpOnly, SameSite e Secure em HTTPS. O banco guarda hashes das sessões. Mutações exigem origem correspondente e token CSRF. Falhas de login e rotas sensíveis têm limitação de requisições no backend; isso reduz abuso e não substitui monitoramento da conta.

`TOKEN_SECRET` é um segredo de servidor com pelo menos 32 caracteres aleatórios, configurado em `.dev.vars` local e nos Secrets do Pages em produção. Nunca use prefixo `VITE_`. Guarde-o em gerenciador da organização; GitHub e backups de código não são cofres. A configuração D1 contém UUID identificador, sem credencial de acesso.

O ingresso usa uma credencial imprevisível, sem dados pessoais no QR. O banco armazena o hash do token. O link privado transporta o token no fragmento `#`, evitando colocá-lo no caminho/query da requisição HTTP. A página envia o token no corpo da solicitação para a API. Quem possui o ingresso pode consultá-lo: salve em local privado. Não inclua tokens, cookies, senhas ou corpos completos das solicitações nos logs.

O check-in requer sessão com permissão, ingresso/código válido e confirmação de identidade. Ler o QR por uma câmera comum não registra presença. O banco bloqueia presença duplicada e registra operador/instante.

## Integridade das operações

Consultas SQL usam parâmetros. Restrições do banco protegem unicidade, referências e capacidade, inclusive em solicitações simultâneas. Inscrições usam uma chave de idempotência para que a repetição do mesmo envio não gere outro ingresso. A chave não é mecanismo de recuperação por e-mail e não deve ser reutilizada para inscrições de pessoas diferentes.

Cancelamento não deve apagar o histórico necessário. Recuperar ingresso revoga a credencial anterior. Certificação depende de inscrição ativa, presença, elegibilidade, regras aprovadas, liberação e data. Revogação continua visível como situação do certificado. Operações administrativas sensíveis ficam no histórico de auditoria.

Não confie em nomes/CSV como fórmulas. Exportações devem neutralizar prefixos de fórmulas e ser abertas apenas pela equipe autorizada. Não disponibilize banco, arquivos `.sql`, CSV, fontes de conversas ou segredos em `public/` ou `dist`.

## Recuperação e contas da equipe

O canal de recuperação é o contato oficial configurado no evento. O administrador confere a identidade por procedimento aprovado fora do site e registra justificativa antes de emitir outro token. Um e-mail informado por alguém, um nome ou conhecimento do evento não comprovam identidade. Não solicite documentos sensíveis sem necessidade aprovada; não os anexe a logs.

Use conta individual por operador e senha exclusiva. Desative imediatamente contas de pessoas que saírem da equipe. O bootstrap de administrador requer acesso ao D1 pela conta Cloudflare; mantenha esse acesso restrito, com MFA no provedor. Se perder a senha, um responsável autorizado pode criar nova conta administrativa pela CLI e desativar a anterior no banco, após backup. Não existe rota pública “virar administrador”.

## Retenção, anonimização e backups

Configure `retention_days` e o aviso de privacidade antes da abertura. O campo comunica a política; a equipe precisa executar e registrar revisões de retenção, porque não há agendador de expurgo automático instalado. Não anuncie exclusão automática.

Na data definida, identifique dados que ainda são necessários para certificados/autenticidade, deveres institucionais ou pedidos pendentes, e os demais que podem ser eliminados. Use a ação de anonimização pelo administrador quando aplicável. Confira o resultado tanto nas consultas quanto nas exportações. A anonimização pode impedir futuras comprovações: revogue ou preserve dados mínimos somente com a decisão institucional adequada.

CSV e cópias SQL também contêm dados pessoais e eventualmente hashes de credenciais. Restrinja acesso, criptografe o armazenamento disponível e defina prazo de descarte das cópias. Não envie por grupo de mensagens ou repositório. O D1 tem histórico próprio de recuperação; remoções no banco ativo podem permanecer nas cópias até expirar seu prazo. Uma restauração exige reaplicar os pedidos de exclusão posteriores ao backup.

Faça export antes/depois do evento e antes de mudanças importantes. Teste restauração em banco vazio separado. O [guia operacional](OPERACAO.md#8-backup-e-restauração) inclui os comandos e os limites de Time Travel.

## Falhas e incidentes

Em caso de ingresso exposto, revogue-o pela recuperação verificada e entregue um novo por canal privado. Em caso de certificado incorreto, revogue e confira a página pública. Em caso de acesso administrativo suspeito, suspenda a conta afetada, invalide suas sessões, troque a senha e examine a auditoria antes de reabrir o acesso.

Se houver suspeita de vazamento de segredo, banco ou exportação, registre instante, ambiente, alcance conhecido e responsáveis; preserve evidências mínimas em canal restrito. Desabilite inscrições/liberação se necessário para conter o incidente, gere backup protegido do estado, revise as permissões Cloudflare/GitHub e substitua credenciais afetadas. A decisão de comunicar pessoas e autoridades deve seguir o procedimento institucional aplicável, sem expor mais dados nos avisos.

Antes de girar `TOKEN_SECRET`, faça backup e ensaio em ambiente separado: o segredo participa da emissão/repetição idempotente. Não o regenere como correção genérica para erros de configuração. Não restaure um banco inteiro para corrigir um único nome ou presença; use a correção administrativa auditada.

Falhas temporárias de conexão ou D1 devem retornar erro e manter o estado confirmado pelo banco. Nunca considere uma captura de tela de “enviando” como inscrição/presença efetiva. Use lista offline controlada no credenciamento e reconcilie depois, conforme o guia.

## Verificação e limites

Os testes cobrem caminhos críticos com D1 local real e dados fictícios. Isso não substitui revisão institucional, ensaio de rede/câmera, teste de restauração nem conferência da configuração da conta de produção. A liberação de uso com pessoas reais deve ocorrer após essas verificações e preenchimento dos dados ainda provisórios.
