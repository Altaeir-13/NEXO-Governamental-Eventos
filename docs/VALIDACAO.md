# Validação local — 15 de outubro de 2026

Implementação integrada em React/TypeScript, Pages Functions e D1. Esta validação não equivale a uma implantação em produção.

## Evidências

- `npm run build`: TypeScript e Vite concluídos. PDF e leitor de câmera carregam sob demanda; o chunk PDF grande é intencional e não entra no carregamento inicial.
- `npx wrangler pages functions build --outdir .tmp/functions`: Worker compilado.
- `npm run db:migrate`: seis migrations aplicadas no D1 local persistente.
- `npm test`: suíte completa de 35 testes aprovada com as seis migrations e limites finais. Uma regressão adicional foi acrescentada após a revisão do formulário administrativo; os dois testes específicos de preservação/correção do nome passaram. A suíte atual contém 36 casos.
- `npm run test:integration`: runner independente executado com sucesso durante a implementação.
- `npm audit --omit=dev --audit-level=high`: nenhum aviso de vulnerabilidade retornado na consulta.
- HTTP local: página inicial e sitemap retornaram 200; HTMLRewriter produziu Open Graph com imagem absoluta e URLs canônicas.

Os testes usam o handler real e um D1/SQLite descartável do Miniflare. Cobrem validação, duplicidade, idempotência concorrente, dez solicitações pela última vaga, rollback, lotação, cancelamento, QR individual, presença duplicada, autenticação/permissões/CSRF, recuperação e revogação, certificados sem presença, liberação, PDF, autenticidade, reemissão e anonimização do histórico, CSV e falha de banco. O lote de 120 certificados foi executado e o limite de consultas da operação foi verificado.

## Ensaio pelo navegador

O script `node scripts/browser-fixture.mjs` serve o build em uma porta local separada com D1 efêmero, evento explicitamente fictício e credenciais aleatórias de teste. Não lê o banco `.wrangler/`, o segredo local nem recursos remotos. Execute `npm run build` antes; encerre com Ctrl+C e descarte os PDFs fictícios. Não insira dados reais nesse ensaio.

Foi executado pelo navegador: inscrição fictícia, confirmação com ingresso individual, download do ingresso, login, consulta no dashboard e na tabela, registro de presença, autorização e emissão do certificado, exibição do botão de download ao titular e download do certificado. O ingresso e o certificado foram salvos como arquivos PDF reais. O certificado foi verificado como página A4 horizontal. Os modelos também foram renderizados por Poppler e conferidos visualmente com Nunito e QR Codes individuais.

A interface pública foi examinada em desktop e largura móvel de 390 px, incluindo menu responsivo e verificação de ausência de rolagem horizontal. Isso não substitui teste físico em Safari/iPhone e Chrome/Android.

## Pendências externas e institucionais

- A CLI Cloudflare informou que não há sessão autenticada. Não foi criado D1 remoto, deployment ou repositório na conta do usuário.
- Confirmar data, reserva e identificação do auditório, coordenadas exatas, contato responsável, privacidade, convidados, fotografias autorizadas, critérios da carga horária e signatários. As inscrições reais começam fechadas; convidados pendentes não são publicados e o mapa não usa um marcador sem coordenadas conferidas.
- Executar o guia de produção e conferir HTTPS, cookies Secure, isolamento de previews, login e orçamento real de CPU do plano Free. A medição do Miniflare não comprova o limite de CPU remoto; a derivação de senha permanece segura, sem reduzir seu custo para esconder essa limitação.
- Ensaiar câmera, foco, permissões, downloads e internet nos celulares usados pela equipe. Exportar CSV de contingência e conferir backup/restauração antes do evento.
- PDFs utilizam chancela institucional e verificação online; não são assinaturas digitais ICP-Brasil. Retenção e backups têm procedimento operacional documentado, sem scheduler automático.

Consulte `OPERACAO.md` para os comandos de instalação/publicação e `SEGURANCA.md` para rotinas de privacidade e resposta a incidentes.
