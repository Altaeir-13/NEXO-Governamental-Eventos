import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContentPhoto } from '../src/admin/Admin';

const embed = 'https://www.google.com/maps/embed?pb=!4v123!6m8!1m7!1sPANORAMA-ID';

describe('prévia administrativa da imagem do local', () => {
  it('incorpora somente o src oficial no local, com título e créditos acessíveis no widget', () => {
    const html = renderToStaticMarkup(<ContentPhoto src={embed} name="UNDB" alt="Fachada da UNDB Renascença" venue />);
    expect(html).toContain('<iframe');
    expect(html).toContain(`src="${embed}"`);
    expect(html).toContain('title="Fachada da UNDB Renascença"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(html).not.toContain('<img');
  });

  it('mantém fotografias comuns como imagens e nunca incorpora URLs de outros sites', () => {
    const photo = renderToStaticMarkup(<ContentPhoto src="/images/local/undb.webp" name="UNDB" alt="Fachada da UNDB" venue />);
    const other = renderToStaticMarkup(<ContentPhoto src="https://example.org/embed?pb=!x" name="UNDB" alt="Prévia" venue />);
    expect(photo).toContain('<img');
    expect(photo).not.toContain('<iframe');
    expect(other).not.toContain('<iframe');
  });

  it('mantém convidados restritos a fotografias e usa iniciais para links de incorporação', () => {
    const html = renderToStaticMarkup(<ContentPhoto src={embed} name="Pessoa Fictícia" alt="Retrato" />);
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<img');
    expect(html).toContain('PF');
  });
});
