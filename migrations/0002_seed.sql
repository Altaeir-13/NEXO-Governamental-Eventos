INSERT INTO events(id,slug,title,description,city,event_date,checkin_time,start_time,venue,auditorium,address) VALUES (
 'slz-2026','labirinto-da-liberdade','O Labirinto da Liberdade: Ressocialização, Estigma Social e os Desafios da Reintegração Pós-Cárcere',
 'Um espaço interdisciplinar de diálogo sobre os desafios da ressocialização e da reintegração social de pessoas egressas do sistema prisional brasileiro. Reunindo perspectivas do Direito Penal, da Criminologia, da Psicologia e das políticas públicas, o encontro discute barreiras sociais e institucionais, saúde mental, direitos fundamentais e caminhos para a reintegração.',
 'São Luís — Maranhão','2026-11-11','18:00','18:30','UNDB — Centro Universitário Dom Bosco, Campus Renascença','Auditório Maria Izabel Rodrigues','Avenida Colares Moreira, 443, Renascença, São Luís — MA'
);
INSERT INTO speakers(id,event_id,name,role,bio,area,invitation_status,display_order) VALUES
 ('mauro-rocha','slz-2026','Mauro Rocha','Advogado e professor','Delegado de Polícia Civil aposentado. Mestre em Direito pelo PPG em Direito e Instituições do Sistema de Justiça da UFMA. Especialista em Direito Penal e Criminologia pela PUC-RS.','Direito Penal e Criminologia','pending',0),
 ('italo-leite','slz-2026','Ítalo Leite','Perfil e função a confirmar','','Área criminal','pending',1),
 ('psicologia-confirmar','slz-2026','Convidada da Psicologia — identificação a confirmar','','Nome completo, minicurrículo e participação dependem de confirmação.','Psicologia','pending',2);
INSERT INTO schedule_items(id,event_id,title,description,start_time,time_label,display_order,published,special) VALUES
 ('slz-credenciamento','slz-2026','Credenciamento e recepção dos participantes','','18:00','18h00',0,1,0),
 ('slz-abertura','slz-2026','Abertura institucional do evento','','18:30','18h30',1,1,0),
 ('slz-direito','slz-2026','Direito Penal, Criminologia e ressocialização','Tema previsto, convidado a confirmar.',NULL,'A definir',2,1,0),
 ('slz-psicologia','slz-2026','Psicologia, saúde mental e contexto prisional','Tema previsto, convidada a confirmar.',NULL,'A definir',3,1,0),
 ('slz-estigma','slz-2026','Estigma social e reintegração pós-cárcere','Palestra ou discussão interdisciplinar.',NULL,'A definir',4,1,0),
 ('slz-cafe','slz-2026','Coffee break e integração dos participantes','',NULL,'A definir',5,1,0),
 ('slz-teatro','slz-2026','Apresentação teatral especial','Uma breve encenação para estimular a reflexão sobre estigma, liberdade e reintegração social. Duração e participantes a confirmar.',NULL,'Encerramento',6,1,1),
 ('slz-final','slz-2026','Agradecimentos e encerramento oficial','',NULL,'Após a apresentação',7,1,0);
