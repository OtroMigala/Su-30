// Sonido de la cabina con Web Audio.
//
// Por qué Web Audio y no <audio>: un <audio loop> deja un pequeño hueco al volver al principio y
// no permite fundir dos sonidos con precisión. Web Audio decodifica cada archivo a un AudioBuffer
// (muestras PCM en memoria) y lo reproduce con AudioBufferSourceNode, que repite sin huecos y cuyo
// volumen (GainNode) se puede programar en el reloj del audio, con precisión de muestra.
//
// Grafo:
//   ambient (bucle) ──► gAmbient ──┐
//   spool (una vez) ──► gSpool ────┼──► master (silencio con M) ──► altavoces
//   thrust (bucle) ───► gThrust ───┘
//
// Los navegadores no dejan sonar audio hasta que el usuario interactúa con la página (política de
// autoplay): el AudioContext se crea en la primera tecla, clic o toque.

const VOL_AMBIENT = 0.16; // "bajo volumen todo el tiempo"
const VOL_SPOOL = 0.7;
const VOL_THRUST = 0.5;
/** Momento del arranque (s) en que entra el empuje sostenido, y duración del fundido cruzado.
 *  El encendido ocupa 0.5–1.05 s del recorte y el clip termina a los 3.5 s (ver process-sounds). */
const THRUST_IN_AT = 2.2;
const CROSSFADE = 1.0;
/** Constante de tiempo (s) del apagado al soltar W/S: setTargetAtTime decae como e^(−t/τ),
 *  así que en 3τ = 0.75 s el volumen ha caído al 5 %. Es un "spool-down" de motor. */
const RELEASE_TAU = 0.25;
/** Si vuelves a acelerar antes de que el motor se haya apagado del todo, no se repite el arranque. */
const RESTART_AFTER = 1.5;

type Name = 'ambient' | 'spool' | 'thrust';

let ctx: AudioContext | null = null;
let master: GainNode;
let gAmbient: GainNode, gSpool: GainNode, gThrust: GainNode;
const buffers: Partial<Record<Name, AudioBuffer>> = {};
let thrustSrc: AudioBufferSourceNode | null = null;
let spoolSrc: AudioBufferSourceNode | null = null;
/** Instante (reloj del audio) en que empieza el fundido arranque → empuje. */
let thrustStartAt = 0;
let throttle = false;
let releasedAt = -Infinity;
let muted = false;

// Opus en WebM si el navegador lo decodifica; si no, MP3.
const ext = () => (new Audio().canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'mp3');

// Las descargas empiezan al cargar el módulo (no necesitan gesto); sólo la decodificación espera
// al AudioContext.
const raw: Record<Name, Promise<ArrayBuffer | null>> = (() => {
  const e = typeof window === 'undefined' ? 'mp3' : ext();
  const get = (n: Name) =>
    fetch(`${import.meta.env.BASE_URL}sounds/${n}.${e}`).then((r) => (r.ok ? r.arrayBuffer() : null), () => null);
  return { ambient: get('ambient'), spool: get('spool'), thrust: get('thrust') };
})();

/** Crea el contexto y arranca el ambiente. Idempotente: se llama en cada gesto. */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended' && !document.hidden) void ctx.resume();
    return;
  }
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  const gain = (v: number) => {
    const g = ctx!.createGain();
    g.gain.value = v;
    g.connect(master);
    return g;
  };
  gAmbient = gain(0);
  gSpool = gain(0);
  gThrust = gain(0);

  for (const n of ['ambient', 'spool', 'thrust'] as const) {
    raw[n].then(async (data) => {
      if (!data || !ctx) return;
      // decodeAudioData "consume" el ArrayBuffer; se pasa una copia por si se vuelve a usar.
      buffers[n] = await ctx.decodeAudioData(data.slice(0));
      if (n === 'ambient') startAmbient();
      if (n !== 'ambient' && throttle) setThrottle(true, true); // W pulsada antes de terminar de cargar
    });
  }

  // Pestaña en segundo plano: se suspende el audio (y se reanuda al volver).
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
}

function startAmbient() {
  if (!ctx || !buffers.ambient) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers.ambient;
  src.loop = true;
  src.connect(gAmbient);
  src.start();
  // Entrada suave en 2 s: aparecer de golpe a mitad de la escena sobresalta.
  gAmbient.gain.setValueAtTime(0, ctx.currentTime);
  gAmbient.gain.linearRampToValueAtTime(VOL_AMBIENT, ctx.currentTime + 2);
}

/**
 * Acelerador: true mientras W o S estén pulsadas.
 * Al acelerar suena el arranque y, a los THRUST_IN_AT s, entra el bucle de empuje con un fundido
 * cruzado. Al soltar, ambos decaen exponencialmente (como un motor que baja de vueltas).
 */
export function setThrottle(on: boolean, force = false) {
  if (on === throttle && !force) return;
  throttle = on;
  if (!ctx || !buffers.spool || !buffers.thrust) return;
  const now = ctx.currentTime;

  if (!on) {
    releasedAt = now;
    for (const g of [gSpool, gThrust]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.setTargetAtTime(0, now, RELEASE_TAU);
    }
    return;
  }

  // ¿El motor sigue girando (soltaste hace poco)? Entonces no se repite el arranque.
  if (thrustSrc && now - releasedAt < RESTART_AFTER) {
    for (const g of [gSpool, gThrust]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
    }
    if (now < thrustStartAt) {
      // Aún sonaba el arranque: se recupera su volumen y se vuelve a programar el fundido.
      gSpool.gain.setTargetAtTime(VOL_SPOOL, now, 0.1);
      scheduleCrossfade(thrustStartAt);
    } else {
      gThrust.gain.setTargetAtTime(VOL_THRUST, now, 0.3);
    }
    return;
  }

  // Arranque completo: se paran las fuentes anteriores (un AudioBufferSourceNode sólo puede
  // sonar una vez; para repetir se crea otro, que es barato: comparte el AudioBuffer).
  spoolSrc?.stop();
  thrustSrc?.stop();

  spoolSrc = ctx.createBufferSource();
  spoolSrc.buffer = buffers.spool;
  spoolSrc.connect(gSpool);
  gSpool.gain.cancelScheduledValues(now);
  gSpool.gain.setValueAtTime(VOL_SPOOL, now);
  spoolSrc.start(now);

  thrustSrc = ctx.createBufferSource();
  thrustSrc.buffer = buffers.thrust;
  thrustSrc.loop = true;
  thrustSrc.connect(gThrust);
  thrustStartAt = now + THRUST_IN_AT;
  gThrust.gain.cancelScheduledValues(now);
  gThrust.gain.setValueAtTime(0, now);
  scheduleCrossfade(thrustStartAt);
  thrustSrc.start(thrustStartAt);
}

/** Programa el fundido cruzado arranque → empuje a partir del instante t0 del reloj del audio. */
function scheduleCrossfade(t0: number) {
  gThrust.gain.setValueAtTime(0, t0);
  gThrust.gain.linearRampToValueAtTime(VOL_THRUST, t0 + CROSSFADE);
  gSpool.gain.setValueAtTime(VOL_SPOOL, t0);
  gSpool.gain.linearRampToValueAtTime(0, t0 + CROSSFADE);
}

/** Silencio global (tecla M / botón). Rampa corta de 50 ms para no producir un clic. */
export function setMuted(m: boolean) {
  muted = m;
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05 / 3);
}
