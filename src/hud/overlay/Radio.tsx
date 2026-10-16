import { useEffect, useRef } from 'react';
import { bindRadio } from './radioQueue';

/** Mensajes de radio: arriba al centro, quien habla en azul y el texto entre << >>. */
export function Radio() {
  const root = useRef<HTMLDivElement>(null);
  const who = useRef<HTMLDivElement>(null);
  const msg = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bindRadio({ root: root.current!, who: who.current!, msg: msg.current!, live: live.current! });
    return () => bindRadio(null);
  }, []);
  return (
    <>
      <div ref={root} className="radio idle" aria-hidden="true">
        <div ref={who} className="who" />
        <div ref={msg} className="msg" />
      </div>
      {/* Lo que oye un lector de pantalla: el mensaje completo, una vez. */}
      <div ref={live} className="sr" role="status" aria-live="polite" />
    </>
  );
}
