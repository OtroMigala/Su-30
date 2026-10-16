import { useEffect, useRef } from 'react';
import { goToSection, initScroll } from '../../flight/scroll';
import { initKeyboard } from '../../input/keyboard';
import { N } from '../../flight/route';
import { CONTENT } from '../../data/content';

/**
 * "Pista" de scroll: un bloque alto detrás del canvas. Su altura fija cuánto scroll cuesta cada
 * tramo: la entrada a la cabina más N − 1 tramos de ruta, a SEGMENT_VH de alto de ventana cada uno.
 * Con end = 'bottom bottom', el recorrido útil es altura − 100vh, por eso se suma una pantalla.
 *
 * Además lleva el CONTENIDO REAL del sitio como texto accesible (lo leen lectores de pantalla y
 * buscadores; visualmente lo muestran el HUD y, en la fase 6, el MFD). Cada sección está colocada
 * a la altura de scroll de su waypoint: la sección i está en P = (i + 1)/N del recorrido, es decir,
 * a (i + 1)·SEGMENT_VH desde arriba.
 *
 * Foco visible (WCAG 2.4.7): un enlace oculto pero alcanzable con Tab dejaría al usuario sin saber
 * dónde está. Por eso la sección que contiene el foco se muestra como panel (CSS :focus-within)
 * y el avión vuela a su waypoint (onFocus, que en React es el evento focusin y sube desde el enlace).
 */
const SEGMENT_VH = 120;

function SectionText({ id }: { id: string }) {
  switch (id) {
    case 'about':
      return <p>{CONTENT.about.filter(Boolean).join(' ')}</p>;
    case 'projects':
      return (
        <ul>
          {CONTENT.projects.map((p) => (
            <li key={p.id}>
              {p.name} ({p.tag}): {p.desc}
            </li>
          ))}
        </ul>
      );
    case 'skills':
      return (
        <ul>
          {CONTENT.skills.map(([name, level]) => (
            <li key={name}>
              {name}: {level} de 10
            </li>
          ))}
        </ul>
      );
    case 'contact':
      return (
        <ul>
          {CONTENT.contact.map(([k, v, href]) => (
            <li key={k}>
              <a href={href} target="_blank" rel="noopener noreferrer">
                {k}: {v}
              </a>
            </li>
          ))}
        </ul>
      );
    case 'credits':
      return <p>{CONTENT.credits.map((l) => l.trim()).join(' ')}</p>;
    default:
      return <p>{CONTENT.sections[0]!.radio[1]}</p>;
  }
}

export function FlightTrack() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const stopScroll = initScroll(ref.current!);
    const stopKeys = initKeyboard();
    return () => {
      stopKeys();
      stopScroll();
    };
  }, []);
  return (
    <main ref={ref} className="flight-track" style={{ height: `${N * SEGMENT_VH + 100}vh` }}>
      <h1 className="sr">
        Portafolio de {CONTENT.pilot} ({CONTENT.callsign}): cabina interactiva de un Su-30
      </h1>
      {CONTENT.sections.map((s, i) => (
        <section
          key={s.id}
          className="sr track-section"
          style={{ top: `${(i + 1) * SEGMENT_VH}vh` }}
          aria-labelledby={`sec-${s.id}`}
          onFocus={() => goToSection(i)}
        >
          <h2 id={`sec-${s.id}`}>{s.label}</h2>
          <SectionText id={s.id} />
        </section>
      ))}
    </main>
  );
}
