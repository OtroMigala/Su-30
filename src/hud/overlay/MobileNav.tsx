import { useFlight } from '../../store/flight';
import { CONTENT } from '../../data/content';
import { N } from '../../flight/route';
import { goToSection } from '../../flight/scroll';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Navegación compacta para pantallas estrechas (≤ 760 px), donde no caben el menú tipo selector
 * de armas ni hay teclado: sección anterior / siguiente con botones grandes (mínimo 44 px, el
 * tamaño de objetivo táctil recomendado por WCAG 2.5.5).
 */
export function MobileNav() {
  const section = useFlight((s) => s.section);
  const s = CONTENT.sections[section]!;
  return (
    <nav className="mnav" aria-label="Secciones (compacto)">
      <button aria-label="Sección anterior" disabled={section === 0} onClick={() => goToSection(section - 1)}>
        ◀
      </button>
      <span aria-live="off">
        {pad(section)} {s.code}
      </span>
      <button aria-label="Sección siguiente" disabled={section === N - 1} onClick={() => goToSection(section + 1)}>
        ▶
      </button>
    </nav>
  );
}
