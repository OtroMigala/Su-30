import { Experience } from './scene/Experience';
import { Loader } from './hud/overlay/Loader';
import { FlightTrack } from './hud/overlay/FlightTrack';
import { FlightReadout } from './hud/overlay/FlightReadout';
import { ScrollHint } from './hud/overlay/ScrollHint';

export function App() {
  return (
    <>
      <Experience />
      <FlightTrack />
      <ScrollHint />
      <FlightReadout />
      <Loader />
    </>
  );
}
