import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CheckinConfirmation } from '../src/admin/Checkin';

const participant = { name: 'Pessoa Fictícia', code: 'SLZ-123456', status: 'active', checked_in_at: null as string | null };
const render = (identity = participant) => renderToStaticMarkup(<CheckinConfirmation request={async <T,>() => ({}) as T} eventId="ensaio" participant={identity} credential={{ code: identity.code }} onClose={() => {}} onDone={() => {}} />);

describe('conferência antes da presença', () => {
  it('exibe identidade e situação válida e exige confirmação manual', () => {
    const html = render();
    expect(html).toContain('Pessoa Fictícia'); expect(html).toContain('SLZ-123456');
    expect(html).toContain('Ainda não possui presença registrada');
    expect(html).toContain('type="checkbox" required=""');
    expect(html).toContain('disabled=""'); expect(html).toContain('Confirmar presença');
  });
  it('exibe horário anterior e impede confirmar ingresso já utilizado', () => {
    const html = render({ ...participant, checked_in_at: '2026-10-15T18:00:00.000Z' });
    expect(html).toContain('Ingresso já utilizado'); expect(html).toContain('15/10/2026');
    expect(html).not.toContain('Confirmar presença'); expect(html).not.toContain('type="checkbox"');
  });
  it('exibe cancelamento sem oferecer confirmação', () => {
    const html = render({ ...participant, status: 'cancelled' });
    expect(html).toContain('Ingresso cancelado'); expect(html).not.toContain('Confirmar presença');
  });
});
