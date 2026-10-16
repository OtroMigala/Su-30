import { Experience } from './scene/Experience';
import { Loader } from './hud/overlay/Loader';
import { EntryButton } from './hud/overlay/EntryButton';

export function App() {
  return (
    <>
      <Experience />
      <EntryButton />
      <Loader />
    </>
  );
}
