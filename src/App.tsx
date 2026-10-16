import { Experience } from './scene/Experience';
import { Loader } from './hud/overlay/Loader';
import { FlightTrack } from './hud/overlay/FlightTrack';
import { FlightReadout } from './hud/overlay/FlightReadout';
import { ScrollHint } from './hud/overlay/ScrollHint';
import { SoundToggle } from './hud/overlay/SoundToggle';
import { Hud } from './hud/overlay/Hud';

// La lectura numérica de la fase 2 queda sólo para depurar: /?debug en `npm run dev`.
const SHOW_READOUT = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');

export function App() {
  return (
    <>
      <Experience />
      <FlightTrack />
      <ScrollHint />
      <Hud />
      {SHOW_READOUT && <FlightReadout />}
      <SoundToggle />
      <Loader />
    </>
  );
}
