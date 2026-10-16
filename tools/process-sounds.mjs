// Procesa los sonidos originales de assets-src/sounds (fuera de git) y deja en public/sounds las
// versiones que carga la web: recortadas, en mono, con el volumen normalizado y en bucles sin cortes.
//
//   npm run sounds          (necesita ffmpeg en el PATH o en la variable FFMPEG)
//
// Cada sonido sale en dos formatos: Opus en WebM (el más eficiente: ~64 kbps suenan como un MP3 de
// 128) y MP3 como respaldo para navegadores sin Opus. La web elige con canPlayType.
//
// Los puntos de corte salen de analizar la envolvente de energía (RMS en ventanas de 50–500 ms):
//  · Arranque (CC0, SamsterBirdies, Freesound 491407): 17 s de silbido de turbina y, a los 17.3 s,
//    el encendido: +11 dB en medio segundo. Se toma desde 16.8 s (medio segundo de silbido como
//    preámbulo) hasta 20.3 s, ya en régimen; ahí la web lo funde con el empuje sostenido.
//  · Empuje sostenido (Pixabay, "jet engine"): nivel y timbre iguales a la cola del arranque
//    (−3 dB, ~400 cruces por cero por segundo), por eso encajan. Se descartan los 0.6 s del inicio
//    (entrada con fundido) y se convierte en bucle.
//  · Ambiente (Pixabay, "commercial aircraft in flight"): el tramo 100–136 s es el más estable
//    (RMS entre −14 y −15.6 dB, timbre constante); se convierte en un bucle de 33 s.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'assets-src/sounds';
const OUT = 'public/sounds';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

/**
 * Bucle sin costura con fundido cruzado. Para un tramo A de duración L y fundido d:
 *     salida = A[d, L]  fundiendo su último segundo d con A[0, d]
 * La salida empieza en A(d) y, tras el fundido, termina justo en A(d): al repetirse, el final
 * empalma con el principio sin salto. Dura L − d.
 * Curvas qsin (cuarto de seno): sen² + cos² = 1, así que para dos señales no correladas (ruido
 * de motor) la POTENCIA se mantiene constante durante el fundido y no hay un "bache" de volumen,
 * que sí aparecería con un fundido lineal (a mitad, cada una a 0.5 ⇒ potencia 0.5² + 0.5² = 0.5).
 */
const loop = (start, end, d) =>
  `[0:a]atrim=${start}:${end},asetpts=PTS-STARTPTS,asplit[a][b];` +
  `[a]atrim=start=${d},asetpts=PTS-STARTPTS[body];` +
  `[b]atrim=end=${d},asetpts=PTS-STARTPTS[head];` +
  `[body][head]acrossfade=d=${d}:c1=qsin:c2=qsin`;

// loudnorm: normalización de sonoridad EBU R128. I = sonoridad integrada objetivo (LUFS),
// TP = pico verdadero máximo (dBTP), que deja margen para que el códec no sature.
const NORM = 'loudnorm=I=-18:TP=-1.5:LRA=11';

const SOUNDS = [
  {
    name: 'ambient',
    src: 'freesound_community-commercial-aircraft-in-flight-sounds-17309.mp3',
    filter: `${loop(100, 136, 3)},${NORM}`,
  },
  {
    name: 'spool',
    src: '491407__samsterbirdies__jet-engine-startup.flac',
    // afade: entrada de 0.15 s para no empezar con un clic; salida de 0.5 s al final.
    filter: `[0:a]atrim=16.8:20.3,asetpts=PTS-STARTPTS,afade=t=in:d=0.15,afade=t=out:st=3.0:d=0.5,${NORM}`,
  },
  {
    name: 'thrust',
    src: 'freesound_community-jet-engine-6753.mp3',
    filter: `${loop(0.6, 9.9, 1)},${NORM}`,
  },
];

if (!existsSync(SRC)) {
  console.error(`Falta ${SRC}: los originales no están en git (licencia de Pixabay). Cópialos ahí.`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

for (const s of SOUNDS) {
  const input = join(SRC, s.src);
  if (!existsSync(input)) {
    console.error(`Falta ${input}`);
    process.exit(1);
  }
  const common = ['-v', 'error', '-y', '-i', input, '-filter_complex', s.filter, '-ac', '1', '-map_metadata', '-1'];
  const webm = join(OUT, `${s.name}.webm`);
  const mp3 = join(OUT, `${s.name}.mp3`);
  execFileSync(FFMPEG, [...common, '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k', webm], { stdio: 'inherit' });
  execFileSync(FFMPEG, [...common, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', mp3], { stdio: 'inherit' });
  const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;
  console.log(`${s.name.padEnd(8)} webm ${kb(webm).padStart(7)}   mp3 ${kb(mp3).padStart(7)}`);
}
