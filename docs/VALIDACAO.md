# Validação local e implantação — 15 de outubro de 2026

Implementação integrada em React/TypeScript, Pages Functions e D1, publicada em [nexo-governamental-eventos.pages.dev](https://nexo-governamental-eventos.pages.dev). Os testes isolados e as verificações em produção são discriminados abaixo e em [IMPLANTACAO.md](IMPLANTACAO.md).

## Evidências

- `npm run build`: TypeScript e Vite concluídos. PDF e leitor de câmera carregam sob demanda; o chunk PDF grande é intencional e não entra no carregamento inicial.
- `npx wrangler pages functions build --outdir .tmp/functions`: Worker compilado.
- `npm run db:migrate`: seis migrations aplicadas no D1 local persistente.
- `npm run typecheck`: aprovado após a correção de implantação.
- `npm test`: 38/38 testes aprovados, incluindo dois novos casos de compatibilidade das migrations e integridade por SQL direto.
- `npm run test:integration`: 31/31 testes aprovados no comando independente após a correção.
- `npm audit --omit=dev --audit-level=high`: nenhum aviso de vulnerabilidade retornado na consulta.
- HTTP local: página inicial e sitemap retornaram 200; HTMLRewriter produziu Open Graph com imagem absoluta e URLs canônicas.

Os testes usam o handler real e um D1/SQLite descartável do Miniflare. Cobrem validação, duplicidade, idempotência concorrente, dez solicitações pela última vaga, rollback, lotação, cancelamento, QR individual, presença duplicada, autenticação/permissões/CSRF, recuperação e revogação, certificados sem presença, liberação, PDF, autenticidade, reemissão e anonimização do histórico, CSV e falha de banco. O lote de 120 certificados foi executado e o limite de consultas da operação foi verificado.

## Ensaio pelo navegador

O script `node scripts/browser-fixture.mjs` serve o build em uma porta local separada com D1 efêmero, evento explicitamente fictício e credenciais aleatórias de teste. Não lê o banco `.wrangler/`, o segredo local nem recursos remotos. Execute `npm run build` antes; encerre com Ctrl+C e descarte os PDFs fictícios. Não insira dados reais nesse ensaio.

Foi executado pelo navegador: inscrição fictícia, confirmação com ingresso individual, download do ingresso, login, consulta no dashboard e na tabela, registro de presença, autorização e emissão do certificado, exibição do botão de download ao titular e download do certificado. O ingresso e o certificado foram salvos como arquivos PDF reais. O certificado foi verificado como página A4 horizontal. Os modelos também foram renderizados por Poppler e conferidos visualmente com Nunito e QR Codes individuais.

A interface pública foi examinada em desktop e largura móvel de 390 px, incluindo menu responsivo e verificação de ausência de rolagem horizontal. Isso não substitui teste físico em Safari/iPhone e Chrome/Android.

## Pendências externas e institucionais

- GitHub, autenticação Cloudflare, D1 remoto, segredo Production, administrador e Pages estão configurados. As seis migrations e os 14 gatilhos foram conferidos no D1 remoto. O erro inicial `incomplete input` foi resolvido com sintaxe equivalente nos gatilhos das migrations ainda não aplicadas; após a aplicação bem-sucedida, elas não foram novamente modificadas.
- Confirmar data, reserva e identificação do auditório, coordenadas exatas, contato responsável, privacidade, convidados, fotografias autorizadas, critérios da carga horária e signatários. As inscrições reais começam fechadas; convidados pendentes não são publicados e o mapa não usa um marcador sem coordenadas conferidas.
- HTTPS público: páginas, assets e evento/API responderam 200; dados administrativos sem sessão responderam 401; certificado inexistente respondeu 404 na API. Login real, dashboard, exportação vazia, CSRF, cookies e logout passaram. PBKDF2 permaneceu com 100.000 iterações; o login remoto completou em cerca de 1 segundo de tempo de parede, sem erro de CPU. Não foi medido CPU por invocação nem executado teste de carga remoto.
- A interface publicada foi examinada pelo navegador em 390 px e 1280 px, sem rolagem horizontal. O menu móvel abriu e navegou à inscrição, que informa fechamento e não apresenta formulário. Previews automáticos estão desabilitados e sem binding D1 de produção.
- Ensaiar câmera, foco, permissões, downloads e internet nos celulares usados pela equipe. Exportar CSV de contingência e conferir backup/restauração antes do evento.
- PDFs utilizam chancela institucional e verificação online; não são assinaturas digitais ICP-Brasil. Retenção e backups têm procedimento operacional documentado, sem scheduler automático.
- Backup remoto privado salvo. A cópia de estrutura sem credenciais administrativas foi restaurada em D1 local novo e isolado: um evento, 14 gatilhos e bloqueios preservados. O backup completo posterior contém hashes de credenciais e deve continuar restrito e fora do Git.
- `npm audit --omit=dev`: zero vulnerabilidades; o audit completo mantém seis avisos exclusivos de desenvolvimento. O scan adicional Codex Security falhou ao iniciar e não produziu análise ou relatório; as evidências acima não devem ser apresentadas como resultado desse scan.

Consulte `OPERACAO.md` para os comandos de instalação/publicação e `SEGURANCA.md` para rotinas de privacidade e resposta a incidentes.
