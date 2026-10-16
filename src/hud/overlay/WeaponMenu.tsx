import { useFlight } from '../../store/flight';
import { CONTENT } from '../../data/content';
import { goToSection } from '../../flight/scroll';

const pad = (n: number) => String(n).padStart(2, '0');

// La columna de la derecha imita el "contador de munición" del selector de armas: cuántos
// elementos tiene cada sección.
const COUNTS: Record<string, string> = {
  start: '--',
  about: '01',
  projects: pad(CONTENT.projects.length),
  skills: pad(CONTENT.skills.length),
  contact: pad(CONTENT.contact.length),
  credits: '01',
};

/**
 * Menú tipo selector de armas (abajo a la derecha). Son botones de verdad dentro de un <nav>:
 * funcionan con ratón, Tab + Enter y lectores de pantalla.
 *  · aria-current marca la sección en la que estás (el waypoint activo).
 *  · El cursor ">" (clase sel) marca la selección de Q/E, que puede ser otra.
 */
export function WeaponMenu() {
  const section = useFlight((s) => s.section);
  const menuSel = useFlight((s) => s.menuSel);
  return (
    <nav className="weapons glow" aria-label="Secciones">
      <ul>
        {CONTENT.sections.map((s, i) => (
          <li key={s.id}>
            <button
              className={i === menuSel ? 'sel' : undefined}
              aria-current={i === section ? 'location' : undefined}
              aria-label={`Ir a ${s.label}`}
              onClick={() => goToSection(i)}
            >
              <span className="cur" aria-hidden="true">
                &gt;
              </span>
              <span>{s.menu}</span>
              <span className="n">{COUNTS[s.id] ?? '--'}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="jet" aria-hidden="true">
        {/* Silueta propia del avión, dibujada a mano (no es un asset de Ace Combat). */}
        <svg viewBox="0 0 60 80" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M30 3 L33 15 L34 30 L55 46 L55 51 L35 47 L35 58 L45 66 L45 71 L33 67 L31 77 L29 77 L27 67 L15 71 L15 66 L25 58 L25 47 L5 51 L5 46 L26 30 L27 15 Z" />
        </svg>
        <span>DMG 0%</span>
      </div>
    </nav>
  );
}
