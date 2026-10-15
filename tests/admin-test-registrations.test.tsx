import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { EventSettings, Participant } from '../shared/types';
import { ParticipantEditor, ParticipantsTable, TestCleanupDialog, TestEventNotice } from '../src/admin/Admin';

const event = { id: 'demonstracao', slug: 'demonstracao-nexo', title: 'Demonstração NEXO', is_test: 1 } as EventSettings;
const participant: Participant = {
  id: 'registro-teste', participant_id: 'pessoa-teste', name: 'Pessoa de Demonstração', email: 'pessoa@example.invalid', profile: 'student',
  institution: 'Instituição de demonstração', course: 'Área de demonstração', code: 'TESTE-123456', status: 'active', is_test: 1,
  created_at: '2026-10-15T18:30:00.000Z', checked_in_at: null, certificate_eligible: 0, certificate_code: null, certificate_status: null,
};
const noAction = () => {};
const table = (value: Participant, admin = true) => renderToStaticMarkup(<ParticipantsTable participants={[value]} admin={admin} onCheckin={noAction} onEdit={noAction} onRecover={noAction} onAnonymize={noAction} />);

describe('administração de inscrições reais e testes', () => {
  it('mostra todos os dados necessários e identifica o registro como teste', () => {
    const html = table(participant);
    for (const text of ['Pessoa de Demonstração', 'pessoa@example.invalid', 'Estudante', 'Instituição de demonstração', 'Área de demonstração', 'TESTE-123456', 'Ativa', '>Teste<', '15/10/2026', 'Indisponível no teste']) expect(html).toContain(text);
    expect(html).toContain('scope="col"');
    expect(html).toContain('tabindex="0"');
  });

  it('mantém o registro oficial identificado e sua situação de certificado', () => {
    const html = table({ ...participant, is_test: 0, certificate_eligible: 1 });
    expect(html).toContain('>Oficial<');
    expect(html).toContain('Elegível');
    expect(html).not.toContain('Indisponível no teste');
  });

  it('preserva o acesso de credenciamento sem expor edição, recuperação ou anonimização', () => {
    const html = table(participant, false);
    expect(html).toContain('Registrar presença de Pessoa de Demonstração');
    expect(html).not.toContain('Editar Pessoa');
    expect(html).not.toContain('Recuperar ingresso de');
    expect(html).not.toContain('Anonimizar Pessoa');
  });

  it('explica campos opcionais vazios sem inventar perfil ou vínculo', () => {
    const html = table({ ...participant, profile: '', institution: '', course: '' });
    expect(html).toContain('Não informado');
    expect(html).toContain('Instituição não informada');
    expect(html).toContain('Curso ou área não informado');
  });

  it('oferece o link de demonstração apenas para o evento de teste', () => {
    const html = renderToStaticMarkup(<MemoryRouter><TestEventNotice event={event} /></MemoryRouter>);
    expect(html).toContain('/inscricao?evento=demonstracao-nexo');
    expect(html).toContain('Não ocupam vagas do evento oficial');
    expect(renderToStaticMarkup(<MemoryRouter><TestEventNotice event={{ ...event, is_test: 0 }} /></MemoryRouter>)).toBe('');
  });

  it('não renderiza o diálogo de limpeza para um evento oficial', () => {
    const html = renderToStaticMarkup(<TestCleanupDialog event={{ ...event, is_test: 0 }} request={async <T,>() => ({}) as T} onClose={noAction} onDone={noAction} />);
    expect(html).toBe('');
  });

  it('exige confirmação explícita antes de encerrar e anonimizar o teste', () => {
    const html = renderToStaticMarkup(<TestCleanupDialog event={event} request={async <T,>() => ({}) as T} onClose={noAction} onDone={noAction} />);
    expect(html).toContain('pattern="ANONIMIZAR TESTES"');
    expect(html).toContain('A auditoria será preservada');
    expect(html).toContain('Os registros oficiais, as contas administrativas');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Demonstração NEXO');
  });

  it('permite revisar os quatro perfis sem expor alteração do tipo permanente da inscrição', () => {
    const html = renderToStaticMarkup(<ParticipantEditor participant={participant} request={async <T,>() => ({}) as T} onClose={noAction} onSaved={noAction} />);
    for (const label of ['Estudante', 'Professor(a)', 'Profissional', 'Outro', 'Não informado']) expect(html).toContain(label);
    expect(html).toContain('value="student" selected=""');
    expect(html).not.toContain('Tipo de registro');
    expect(html).not.toContain('Autorizar elegibilidade para certificado');
  });

  it('impede presença e elegibilidade contraditórias ao revisar uma inscrição cancelada', () => {
    const cancelled = { ...participant, is_test: 0, status: 'cancelled', checked_in_at: '2026-10-15T18:35:00.000Z', certificate_eligible: 1 };
    const html = renderToStaticMarkup(<ParticipantEditor participant={cancelled} request={async <T,>() => ({}) as T} onClose={noAction} onSaved={noAction} />);
    expect(html).toContain('a presença e a elegibilidade para certificado serão removidas');
    expect(html.match(/type="checkbox" disabled=""/g)).toHaveLength(2);
    expect(html).not.toContain('checked=""');
  });
});
