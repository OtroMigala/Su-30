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

/** Texto accesible de una sección: la misma información que el MFD, como HTML real. */
function SectionText({ id }: { id: string }) {
  const sec = CONTENT.sections.find((x) => x.id === id)!;
  const ext = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  );
  if (id === 'credits')
    return (
      <>
        <h3>Stack</h3>
        <ul>
          {CONTENT.stackGroups.map(([g, items]) => (
            <li key={g}>
              {g}: {items}
            </li>
          ))}
        </ul>
        <h3>Créditos</h3>
        <ul>
          {CONTENT.credits.map((c) => (
            <li key={c.text}>{c.href ? ext(c.href, c.text) : c.text}</li>
          ))}
        </ul>
      </>
    );
  return (
    <>
      {id === 'start' && (
        <>
          <p>
            {CONTENT.pilot} ({CONTENT.callsign}). {CONTENT.role}.
          </p>
          <ul>
            {CONTENT.links.map(([k, v, href]) => (
              <li key={k}>{ext(href, `${k}: ${v}`)}</li>
            ))}
          </ul>
        </>
      )}
      {sec.theory.map((t) => (
        <p key={t}>{t}</p>
      ))}
      {id === 'start' && (
        <>
          <h3>Ficha técnica del Su-30MKI (valores aproximados)</h3>
          <dl>
            {CONTENT.aircraft.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <h3>Construido con: {sec.stack.join(', ')}</h3>
      <ul>
        {sec.how.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
    </>
  );
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
