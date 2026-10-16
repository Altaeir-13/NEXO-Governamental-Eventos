# Aplicativo e credenciamento presencial

Guia da recepção do NEXO Governamental. A instalação é opcional: as mesmas funções estão disponíveis no navegador, em [nexo-governamental-eventos.pages.dev](https://nexo-governamental-eventos.pages.dev/). A equipe usa a câmera do celular e uma conta administrativa autorizada. A consulta e a confirmação de presença exigem internet.

## 1. Instalar no Android

1. Abra o endereço do evento no Chrome, fora de navegação anônima e de navegadores internos de redes sociais.
2. Use **Instalar** na orientação exibida pelo site, se disponível. Outra opção é o menu **⋮ → Instalar e criar atalho → Instalar**. Dependendo da versão, o rótulo aparece como **Instalar app** ou **Adicionar à tela inicial**.
3. Confirme e abra **NEXO Eventos** pelo novo ícone. Na página inicial do aplicativo, role até o rodapé e toque em **Área da organização** para entrar na recepção. O aplicativo abre sem barra de endereços; esse link leva ao login administrativo existente.

A opção de instalação depende do navegador e do aparelho. Se não aparecer, continue no Chrome; o credenciamento funciona por ele. Referência: [Ajuda oficial do Chrome para Android](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=pt-BR).

## 2. Instalar no iPhone

1. Abra o endereço do evento no Safari.
2. Toque em **Compartilhar**; conforme o layout, essa ação fica no menu da página.
3. Escolha **Adicionar à Tela de Início**. Ative **Abrir como App da Web**, quando essa opção aparecer, e toque em **Adicionar**.
4. Abra **NEXO Eventos** pelo ícone. Na página inicial, role até o rodapé e toque em **Área da organização** para entrar; não é necessário digitar um endereço dentro do aplicativo. Teste a câmera nessa abertura antes do evento.

Se a ação estiver oculta, use **Editar Ações** na lista de compartilhamento. Também é possível operar diretamente no Safari. Referência: [Guia oficial da Apple para apps da web no iPhone](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27). Os nomes dos menus podem variar com a versão do iOS.

## 3. Criar a conta do responsável pelo credenciamento

Uma pessoa com acesso autorizado à conta Cloudflare executa o comando no computador de administração, na pasta do projeto. Confira o destino `nexo-eventos` em `wrangler.toml` e a autenticação Cloudflare antes de usar produção:

```powershell
npx wrangler whoami
npm run admin:create -- --remote --email recepcao@example.org --name "Responsável pela recepção" --role checkin
```

Substitua o endereço de exemplo pelo e-mail real do operador. O assistente pede uma senha de 14 a 256 caracteres e a confirmação, sem exibir a senha. Não existe senha padrão ou cadastro administrativo público. Use uma conta individual por operador para identificar quem confirmou a chegada; entregue a senha por canal privado. Para um ensaio local isolado, use `--local` no lugar de `--remote`.

O papel `checkin` consulta os participantes e o acompanhamento e registra presenças, sem liberar certificados, editar eventos ou exportar a lista. Um administrador existente também pode credenciar. A sessão dura até oito horas; entre novamente se expirar. O script não deve ser executado novamente para substituir silenciosamente uma conta já existente.

## 4. Iniciar a câmera

1. No aplicativo instalado, role até o rodapé da página inicial e toque em **Área da organização**. No navegador, também pode abrir a [área administrativa](https://nexo-governamental-eventos.pages.dev/admin) diretamente. Entre com sua conta.
2. Confira o evento selecionado. Use o evento de demonstração nos ensaios; um ingresso de teste não serve para o evento oficial.
3. Abra **Credenciamento** e toque em **Iniciar leitura**.
4. Autorize o acesso à câmera. A câmera traseira é preferida; use a seleção de câmera se o aparelho escolher outra lente.
5. Posicione o QR dentro do enquadramento. Ajuste distância e iluminação até a leitura ocorrer.

Se houver bloqueio de permissão, libere a câmera para este site nas configurações do navegador/aparelho e tente novamente. Outro aplicativo pode estar usando a câmera. Sem câmera, com permissão recusada ou em navegador incompatível, use a busca manual. O acesso à câmera depende de HTTPS. Ao sair da tela, ocultar o aplicativo ou parar a leitura, a câmera é encerrada; ao retornar, reinicie-a pelo botão quando necessário.

## 5. Validar um QR Code

Aponte a câmera para o QR individual do ingresso, mostrado na tela do participante ou no PDF. A leitura trava novas detecções enquanto consulta o servidor. Confira nome, código e situação retornados antes de prosseguir. O QR contém uma credencial privada: não fotografe nem publique seu conteúdo em grupos ou relatórios de suporte.

| Resultado | Procedimento da recepção |
| --- | --- |
| Inscrição ativa e sem presença | Confira a identidade da pessoa; prossiga para a confirmação manual. |
| Presença já registrada | Consulte o horário e o operador anteriores; não confirme outra entrada. |
| Ingresso inválido, revogado ou de outro evento | Confira o evento e use a busca manual. Encaminhe recuperação de ingresso a um administrador. |
| Inscrição cancelada | Não registre presença. Encaminhe à coordenação. |
| Falha de conexão | Não considere confirmado; repita a consulta depois de recuperar a internet. |

A leitura e a consulta não registram presença automaticamente. Não abra links desconhecidos recebidos como se fossem ingressos: o leitor aceita a credencial de ingresso ou um link do próprio site.

## 6. Confirmar a presença

Com o ingresso válido na tela, confira a pessoa presente, marque a confirmação de identidade e toque em **Confirmar presença**. Aguarde a resposta do servidor. O sucesso exibe o participante, o horário registrado no D1 e o operador. A interface se prepara para a próxima leitura após o retorno de sucesso; também permite continuar manualmente.

Se dois operadores confirmarem o mesmo ingresso, a chave única no banco permite somente um registro. O segundo retorno informa a presença anterior, preservando horário e operador originais. Se a internet cair depois do toque, o resultado pode ter sido gravado sem chegar ao celular: consulte o mesmo ingresso novamente. Uma repetição segura retorna a presença já existente, sem criar outra.

## 7. Conferir o comparecimento

Na tela **Credenciamento**, acompanhe inscritos ativos, credenciados, ainda não credenciados, percentual de comparecimento, entradas recentes e a lista com status. O percentual usa `credenciados ÷ inscrições ativas × 100`; cancelamentos não entram nessa base. Os horários vêm do servidor e aparecem conforme o fuso do aparelho; confira que os celulares estão no horário local do evento.

O acompanhamento consulta o servidor a cada 60 segundos enquanto a tela está visível e online, além da atualização após um credenciamento e do botão de atualizar. O ciclo periódico consulta resumo e lista, no máximo duas requisições por minuto por tela ativa; consultas de QR, buscas e confirmações são adicionais. Pausa quando a página fica oculta ou sem conexão. Assim, dois celulares podem ter uma diferença breve na lista; a proteção contra duplicidade continua no D1.

Confira a indicação de atualização: números já exibidos podem ficar desatualizados durante uma falha de internet. O administrador também dispõe de **Visão geral** e **Participantes**.

## 8. Credenciamento manual

Em **Credenciamento**, digite o nome ou o código `NEXO-...` e use **Buscar inscrição**. Escolha a pessoa correta, confira nome/código e identidade e confirme como no QR. Homônimos exigem conferência cuidadosa; não crie uma nova inscrição para contornar dúvida. O código de inscrição permite localizar o cadastro, mas o operador continua responsável pela conferência presencial.

Um link privado ou token pode ser consultado pelo mesmo campo quando disponível. Não é necessário recuperar o ingresso apenas porque o QR está ilegível. A recuperação de um ingresso perdido pertence ao administrador, exige conferência de identidade e justificativa e revoga a credencial anterior.

## 9. Contingência sem internet

Este PWA **não registra nem sincroniza credenciamentos offline**. Instalação, ícones e assets públicos em cache não tornam a API ou a lista de participantes disponíveis sem rede.

Antes do evento, um administrador deve preparar uma lista mínima de contingência, com nome e código, em papel ou arquivo privado protegido, e definir quem a guarda. A exportação CSV existente contém mais dados pessoais; restrinja o acesso e gere a lista mínima em ambiente controlado. Mantenha bateria e conexão alternativa disponíveis.

Durante a interrupção:

1. Avise a coordenação e tente outra rede ou conexão móvel autorizada.
2. Registre numa lista única de contingência nome, código, horário observado e responsável pela conferência, evitando duplicações entre mesas. Identifique o registro como **pendente de lançamento no sistema**.
3. Não anuncie confirmação digital nem autorização de certificado. Não guarde tokens, QR, senha, fotos de documentos ou lista de participantes em grupos de mensagens.
4. Quando a rede voltar, consulte cada código no servidor. Se já houver presença, preserve-a e confira a divergência. Caso contrário, confirme manualmente após a conferência do responsável.
5. O D1 registra o horário efetivo do lançamento e o operador que o executou; o horário observado no papel não é importado nem retrodatado. Guarde essa diferença na conferência restrita da coordenação e descarte a lista conforme a política de retenção.

Uma confirmação que falhou na tela pode ter chegado ao servidor. Sempre consulte antes de relançar; o banco impede duplicação. A contingência é um procedimento humano, sem fila automática no celular.

## 10. Testes, reabertura e atualização

O [relatório desta atualização](PWA_VALIDACAO.md) separa comandos realmente executados, cenários automatizados e pendências físicas. Um teste em viewport móvel no computador não aprova câmera, instalação ou Safari no iPhone.

Antes do evento, ensaie em **cada modelo de celular usado pela recepção**, tanto no navegador quanto instalado: instalação, permissão aceita/negada, câmera traseira/troca de lente, QR válido/duplicado/inválido/cancelado, busca manual, queda de rede antes/depois da confirmação, reabertura, expiração da sessão e dois operadores simultâneos. Use somente inscrições fictícias do evento de teste. Confira foco, luz, leitura do PDF, retorno do segundo plano e conexão da UNDB.

Uma nova versão do PWA prepara um cache separado de assets estáticos. O service worker atualizado aguarda o fechamento de **todas** as janelas/abas antigas do site e do aplicativo; não troca a versão no meio de uma confirmação nem recarrega automaticamente. Quando houver aviso de atualização, conclua a operação, feche essas janelas e reabra online. Se uma versão antiga falhar ao carregar um recurso, feche e reabra online. As respostas de API, ingressos, tokens, sessões e certificados não são armazenados pelo service worker.

## Presença, permanência e certificados

O registro de entrada comprova o credenciamento e a chegada. A equipe ainda precisa conferir a participação segundo as regras aprovadas pela instituição antes de autorizar **elegibilidade para certificado**. Apenas inscrição ou check-in não liberam certificados.

A plataforma preserva a aprovação individual pelo administrador e os bloqueios de emissão existentes. A coordenação pode decidir posteriormente entre registro apenas de entrada ou conferência adicional de permanência/saída. Até essa decisão, não há check-out obrigatório nem comprovação automática de permanência. Se for aprovada uma conferência adicional, a coordenação precisa definir método, responsáveis, exceções e documentação; a aprovação individual deve refletir essa conferência. Uma futura automação de saída exige implementação e validação próprias.

A configuração base mantém **5 horas**; o código não alterou a carga. O material local não contém uma proposta oficial autônoma com carga horária e duração aprovadas. A programação inicial prevê credenciamento às 18h e abertura às 18h30, com encerramento sem horário definido. Não é possível afirmar equivalência entre essa programação e cinco horas certificadas. Cabe à organização apresentar/aprovar a proposta, resolver eventual divergência e confirmar os critérios antes da liberação. Consulte [a investigação técnica](PWA_INVESTIGACAO.md).

As inscrições oficiais e os certificados continuam dependentes de autorização institucional. A implantação do PWA não os abre nem os libera.
