import { useEffect } from 'react';
import { useFlight } from '../../store/flight';
import { CONTENT } from '../../data/content';
import { Status } from './Status';
import { Radio } from './Radio';
import { KeysHelp } from './KeysHelp';
import { Radar } from './Radar';
import { WeaponMenu } from './WeaponMenu';
import { LookControls } from './LookControls';
import { MobileNav } from './MobileNav';
import { PilotTag } from './PilotTag';
import { radio } from './radioQueue';

/**
 * HUD en pantalla (HTML encima del canvas), portado del prototipo. Sólo aparece dentro de la
 * cabina. Cuando está oculto lleva `inert`: sus botones salen del orden de Tab y del árbol de
 * accesibilidad, además de no verse.
 */
export function Hud() {
  const on = useFlight((s) => s.camMode !== 'exterior');
  const focus = useFlight((s) => s.camMode === 'focus');

  // Radio al llegar a cada sección. Fuera de la cabina no se habla; al entrar por primera vez
  // se anuncia la sección en la que estás.
  useEffect(() => {
    let announced = -1;
    const announce = () => {
      const s = useFlight.getState();
      if (s.camMode === 'exterior' || s.section === announced) return;
      announced = s.section;
      const [who, text] = CONTENT.sections[s.section]!.radio;
      radio(who, text, true);
    };
    announce();
    return useFlight.subscribe((s, prev) => {
      if (s.section !== prev.section || s.camMode !== prev.camMode) announce();
    });
  }, []);

  return (
    <div className={`hud${on ? ' on' : ''}${focus ? ' focus' : ''}`} inert={!on}>
      <Status />
      <Radio />
      <KeysHelp />
      <Radar />
      <WeaponMenu />
      <LookControls />
      <MobileNav />
      <PilotTag />
    </div>
  );
}
