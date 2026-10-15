# Plataforma de Eventos — NEXO Governamental

Inscrição gratuita, ingresso individual com QR Code, administração, credenciamento e certificados PDF para eventos do NEXO. O primeiro evento é **O Labirinto da Liberdade**, em São Luís. O NEXO é apresentado como organização promotora; seu nome não representa vínculo com órgão público.

## Começar no computador

Use Node.js 22, conforme `.nvmrc`, e npm. Abra um terminal nesta pasta. Se a instalação local já estiver configurada, preserve `.dev.vars` e o banco local; não repita sua criação.

```powershell
npm ci
node -e "require('node:fs').writeFileSync('.dev.vars','TOKEN_SECRET='+require('node:crypto').randomBytes(32).toString('hex')+'\n',{flag:'wx'})"
npm run db:migrate
npm run admin:create -- --local --email admin@example.org --name "Administrador" --role admin
npm run dev:full
```

Substitua `admin@example.org` pelo e-mail real da equipe. O comando do segredo cria um arquivo privado e recusa sobrescrever um existente. Guarde a senha escolhida para o administrador num gerenciador de senhas. Abra **http://127.0.0.1:8788** e use `/admin` para entrar. A execução completa usa Pages Functions e D1 local, com persistência em `.wrangler/`. Não exige login na Cloudflare para os testes locais.

`npm run dev` inicia apenas o Vite; a API completa é executada por `dev:full`. Depois de editar o frontend, reinicie `dev:full` para reconstruir `dist`. O guia detalhado explica instalação, configuração e problemas comuns.

## Validar

```powershell
npm run typecheck
npm test
npm run test:integration
npm run build
```

Os testes de integração executam o backend real com SQLite/D1 do Miniflare em ambiente isolado, usando somente dados fictícios. Não acessam o banco de produção. Consulte [o roteiro de operação](docs/OPERACAO.md) para os testes manuais em celular e o ensaio do credenciamento.

## Arquitetura

- React, TypeScript, Vite e Nunito local no frontend; identidade baseada no arquivo DESIGN fornecido.
- Cloudflare Pages Functions para regras de negócio e autorização.
- Cloudflare D1 com migrations, restrições de unicidade e controle de vagas no banco.
- PDFs e QR Codes gerados no navegador com bibliotecas JavaScript gratuitas, a partir dos dados autorizados pela API.
- Tokens de ingresso, sessões administrativas, auditoria e permissões verificadas no servidor.

Dados de inscrição e presença ficam no banco. O navegador guarda apenas o necessário para acesso e repetição segura de uma solicitação. O ingresso é uma credencial privada: o participante deve salvar seu PDF ou link. A recuperação exige conferência de identidade pela organização.

## Publicação e decisões institucionais

O repositório existente é [Altaeir-13/NEXO-Governamental-Eventos](https://github.com/Altaeir-13/NEXO-Governamental-Eventos), com branch de produção `main`. A hospedagem prevista é **Cloudflare Pages, Functions e D1 no plano Free**, usando subdomínio `.pages.dev`. O D1 de produção `nexo-eventos` já foi criado e seu UUID consta em `wrangler.toml`. A implantação Pages e a conferência pública ainda estão em andamento; a existência do banco não comprova um deployment concluído.

O Worker de modelo encontrado na conta não hospeda esta aplicação completa. Antes de criar recursos, liste e reutilize os existentes. Previews automáticos devem permanecer desabilitados até receberem D1 e segredo isolados; `[env.preview]` não possui binding `DB`.

As inscrições começam fechadas. A organização precisa confirmar data, local, convidados, contatos, privacidade e critérios para 5 horas antes de abrir. A liberação dos certificados exige presença, elegibilidade, aprovação institucional e a data configurada de dezembro de 2026.

Não há serviço pago obrigatório, pagamento, checkout ou envio automático de e-mail. O plano gratuito tem cotas e pode suspender requisições ao excedê-las; não há garantia de disponibilidade ilimitada. O guia contém os limites e links oficiais consultados.

- [Guia completo de instalação, publicação e operação](docs/OPERACAO.md)
- [Segurança, privacidade e resposta a incidentes](docs/SEGURANCA.md)
- [Arquitetura e contrato HTTP](docs/ARCHITECTURE.md)

O arquivo ZIP de conversas e demais materiais privados recebidos não são arquivos públicos do site e não devem ser enviados ao GitHub ou para `public/`.
