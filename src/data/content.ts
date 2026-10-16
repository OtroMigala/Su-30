// Contenido del sitio: un LABORATORIO DE AVIÓNICA. Cada waypoint es un sistema del avión; el MFD
// muestra la física/ingeniería con una demostración en vivo y, en otra página, con qué tecnologías
// web está construida esa parte ("quien hizo esto maneja esto").
// Edita este archivo para cambiar textos, enlaces o la ficha técnica.

export interface Section {
  id: string;
  /** Código de 3–4 letras del waypoint (cinta de rumbo, WPT, radar). */
  code: string;
  /** Rótulo corto del menú tipo selector de armas. */
  menu: string;
  label: string;
  /** Altitud del waypoint en metros. */
  alt: number;
  /** Mensaje de radio al llegar: [emisor, texto]. */
  radio: readonly [string, string];
  /** Explicación del sistema (página SISTEMA del MFD y texto accesible). */
  theory: readonly string[];
  /** Tecnologías con las que se construyó esta parte del sitio. */
  stack: readonly string[];
  /** Cómo se usaron (página CONSTRUIDO CON). */
  how: readonly string[];
}

/** Contactos de radar de la sección RDR: distintas secciones radar (RCS) para ver el efecto de σ. */
export interface Contact {
  id: string;
  kind: string;
  /** Sección radar σ (m²). */
  rcs: number;
}

export const CONTENT = {
  pilot: 'J. A. CÁRDENAS',
  callsign: 'ALEJO',
  role: 'Ingeniería en Telecomunicaciones · Universidad del Cauca',
  // Enlaces del briefing: [rótulo, texto visible, URL]. Se pueden añadir más (LinkedIn, correo...).
  links: [
    ['PORTAFOLIO', 'otromigala.github.io/portfolio-websit', 'https://otromigala.github.io/portfolio-websit/'],
    ['GITHUB', 'github.com/OtroMigala', 'https://github.com/OtroMigala'],
    ['CÓDIGO', 'github.com/OtroMigala/Su-30', 'https://github.com/OtroMigala/Su-30'],
  ] as readonly (readonly [string, string, string])[],

  sections: [
    {
      id: 'start', code: 'TKOF', menu: 'BRIEF', label: 'Briefing', alt: 900,
      radio: ['CONTROL', 'Bienvenido al laboratorio de aviónica. Cada waypoint es un sistema del avión; mantén W para despegar.'],
      theory: [
        'Este sitio es un laboratorio de aviónica: cada waypoint de la ruta es un sistema del avión.',
        'El MFD explica su física con datos en vivo de tu vuelo y cuenta con qué tecnologías web se construyó esa parte.',
      ],
      stack: ['Vite', 'React 19', 'TypeScript', 'Zustand'],
      how: [
        'Aplicación de una sola página con Vite y TypeScript estricto.',
        'React pinta la interfaz HTML (HUD en pantalla, menú, radio); la escena 3D va aparte.',
        'Zustand es el "bus de datos": como el MIL-STD-1553 de un avión, comunica la escena 3D, el HUD y el MFD sin acoplarlos.',
        'Lo que cambia en cada fotograma no pasa por React: se lee de un objeto mutable (0 re-renders por fotograma).',
      ],
    },
    {
      id: 'fcs', code: 'FCS', menu: 'FLT', label: 'Control de vuelo', alt: 2200,
      radio: ['CONTROL', 'Sistema de control de vuelo. Gira y observa cómo el alabeo sale de la física del giro coordinado.'],
      theory: [
        'En un giro coordinado la sustentación L se inclina φ: su parte vertical sostiene el peso y la horizontal curva la trayectoria.',
        'De L·cos φ = m·g y L·sen φ = m·v·ω sale tan φ = v·ω / g, y el factor de carga n = 1 / cos φ.',
      ],
      stack: ['TypeScript', 'Vitest', 'Cuaterniones', 'GSAP ScrollTrigger', 'Lenis'],
      how: [
        'La ruta y la física son funciones puras con 52 tests en Vitest.',
        'El scroll (Lenis + ScrollTrigger) se convierte en distancia recorrida; W/S integran una velocidad con un filtro de primer orden.',
        'En manual, una masa puntual con actitud en cuaternión: la sustentación g·n y la gravedad curvan la velocidad, ω = (f × a⊥) / v.',
        'Suavizados independientes del frame rate: k = 1 − e^(−λ·dt).',
      ],
    },
    {
      id: 'hud', code: 'HUD', menu: 'HUD', label: 'Visualización', alt: 3000,
      radio: ['CONTROL', 'Sistema de visualización. La simbología del HUD está colimada al infinito: mira con F y compruébalo.'],
      theory: [
        'Un HUD proyecta la simbología sobre un vidrio semitransparente con la imagen enfocada al infinito: el piloto la ve superpuesta al mundo sin reenfocar.',
        'Al mover la cabeza, la cabina se desplaza (paralaje) pero la escalera sigue pegada al horizonte.',
      ],
      stack: ['three.js', 'React Three Fiber', 'Stencil buffer', 'CanvasTexture', 'Postprocessing'],
      how: [
        'La simbología se dibuja en un canvas 2D y se pega a un plano a 1000 m, sin paralaje.',
        'La malla del vidrio escribe en el stencil buffer de WebGL; el plano sólo se pinta donde vale 1: recorte exacto.',
        'Proyección gnomónica (x/z, y/z): el horizonte, un círculo máximo, sale como recta exacta aunque el avión alabee.',
        'Render HDR con bloom por umbral y tone mapping ACES: las pantallas emisoras brillan como fósforo.',
      ],
    },
    {
      id: 'radar', code: 'RDR', menu: 'RADAR', label: 'Radar', alt: 2600,
      radio: ['AWACS', 'Contactos en el área. Sólo los ves en el radar si su eco supera el umbral; pasa el cursor para fijarlos.'],
      theory: [
        'Ecuación del radar: Pr = Pt·G²·λ²·σ / ((4π)³·R⁴). El eco viaja de ida y vuelta: duplicar la distancia lo divide entre 16 (−12 dB).',
        'Se detecta si la relación señal/ruido supera ~13 dB. Un blanco con 16 veces más sección radar σ se ve al doble de distancia.',
      ],
      stack: ['Raycasting', 'Sprites', 'Canvas 2D', 'Picking propio'],
      how: [
        'Los contactos son sprites colocados en su dirección real sobre una esfera de 900 m y escalados a un tamaño angular fijo.',
        'Un raycast propio contra los objetos registrados (no contra los 27 000 triángulos del avión) resuelve cursor y clics.',
        'El radar de pantalla es un canvas 2D con la nariz arriba: marcación relativa → (r·sen θ, −r·cos θ).',
      ],
    },
    {
      id: 'nav', code: 'NAV', menu: 'NAV', label: 'Navegación', alt: 3400,
      radio: ['CONTROL', 'Navegación. El GPS es ruidoso; el filtro de Kalman lo fusiona con el modelo de movimiento.'],
      theory: [
        'El GPS da la posición con errores de varios metros. Un filtro de Kalman combina cada medida con la predicción de un modelo (velocidad constante).',
        'La ganancia K = P / (P + R) decide cuánto creer a la medida frente a la predicción; el resultado tiene menos error que el GPS y además estima la velocidad.',
      ],
      stack: ['Filtro de Kalman', 'Box–Muller', 'PRNG con semilla', 'GLSL'],
      how: [
        'El filtro está escrito a mano (matrices 2×2 por eje) y probado con tests: reduce el error del GPS y estima la velocidad.',
        'El ruido gaussiano sale de dos uniformes con la transformada de Box–Muller y un generador mulberry32 con semilla.',
        'Las 6000 luces de la ciudad son un único draw call: un shader GLSL las coloca, repite el terreno y aplica extinción atmosférica.',
      ],
    },
    {
      id: 'comm', code: 'COMM', menu: 'COMMS', label: 'Enlaces', alt: 3800,
      radio: ['TORRE', 'Enlace de datos con la torre. Observa cómo cae la señal con la distancia.'],
      theory: [
        'Ecuación de Friis: Pr = Pt·Gt·Gr·(λ / 4πd)². En dB, las pérdidas de espacio libre son 20·log₁₀(4π·d·f / c): +6 dB al duplicar la distancia.',
        'Más allá del horizonte radio, d ≈ 4.12·(√h₁ + √h₂) km, la curvatura de la Tierra corta la línea de vista.',
      ],
      stack: ['Web Audio API', 'ARIA live', 'ffmpeg', 'Accesibilidad'],
      how: [
        'Sonido con Web Audio: bucles sin cortes, fundidos de potencia constante y arranque de motor sincronizado con el empuje.',
        'Los sonidos se recortan, normalizan (EBU R128) y convierten a Opus con un script de ffmpeg.',
        'La radio es accesible: el texto se escribe letra a letra sólo a la vista; una región aria-live anuncia el mensaje completo una vez.',
      ],
    },
    {
      id: 'credits', code: 'RTB', menu: 'STACK', label: 'Stack y créditos', alt: 4200,
      radio: ['CONTROL', 'Misión cumplida. Aquí está todo con lo que se construyó esta cabina.'],
      theory: ['Lista completa de tecnologías y créditos de los recursos de terceros.'],
      stack: ['Vite', 'React', 'TypeScript', 'three.js', 'R3F', 'drei', 'Postprocessing', 'GSAP', 'Lenis', 'Zustand', 'Vitest', 'Web Audio', 'gltf-transform', 'Blender'],
      how: [],
    },
  ] as readonly Section[],

  /** Ficha técnica del Su-30MKI (valores aproximados de fuentes públicas: verifícalos). */
  aircraft: [
    ['TIPO', 'Caza multirrol biplaza'],
    ['FABRICANTE', 'Sukhoi / HAL'],
    ['TRIPULACIÓN', '2'],
    ['LONGITUD', '21.9 m'],
    ['ENVERGADURA', '14.7 m'],
    ['ALTURA', '6.4 m'],
    ['PESO VACÍO', '18 400 kg'],
    ['PESO MÁX.', '38 800 kg'],
    ['MOTORES', '2 × AL-31FP, empuje vectorial'],
    ['EMPUJE', '2 × 123 kN con poscombustión'],
    ['VEL. MÁX.', 'Mach 2.0 en altura'],
    ['TECHO', '17 300 m'],
    ['ALCANCE', '3000 km (sin repostar)'],
    ['LÍMITE G', '+9 g (el mismo del vuelo manual)'],
    ['RADAR', 'N011M Bars (antena PESA)'],
    ['CONFIG.', 'Canards + empuje vectorial'],
  ] as readonly (readonly [string, string])[],

  /** Contactos de radar (RCS típicos de orden de magnitud). */
  contacts: [
    { id: 'C1', kind: 'CAZA', rcs: 5 },
    { id: 'C2', kind: 'AVIÓN COMERCIAL', rcs: 100 },
    { id: 'C3', kind: 'DRON', rcs: 0.1 },
    { id: 'C4', kind: 'MISIL', rcs: 0.5 },
  ] as readonly Contact[],

  /** Stack completo (página STACK de RTB), por áreas. */
  stackGroups: [
    ['3D / GPU', 'three.js · React Three Fiber · drei · postprocessing · GLSL · stencil · HDR'],
    ['INTERFAZ', 'React 19 · TypeScript · Zustand · CSS · ARIA'],
    ['ANIMACIÓN', 'GSAP ScrollTrigger · Lenis · cuaterniones · slerp'],
    ['SONIDO', 'Web Audio API · Opus · ffmpeg'],
    ['ASSETS', 'Blender · gltf-transform · Meshopt · WebP · sharp'],
    ['CALIDAD', 'Vitest (52 tests) · TypeScript estricto · WCAG · PerformanceMonitor'],
    ['FÍSICA', 'Giro coordinado · Kalman · ecuación del radar · Friis'],
  ] as readonly (readonly [string, string])[],

  // Créditos con enlace (opcional). CC BY pide título, autor, fuente y licencia ("TASL") y que se
  // indiquen los cambios. Más detalle en CREDITS.md.
  credits: [
    { text: 'Modelo "Su-30 MKI loadout#1 [Brahmos]" de abhinab.das000, editado (cabina, HUD, MFD) y optimizado.',
      href: 'https://sketchfab.com/3d-models/su-30-mki-loadout1-brahmos-e9b810ba081544d0997ad8cce4b95fc8' },
    { text: 'Licencia del modelo: CC BY 4.0.', href: 'https://creativecommons.org/licenses/by/4.0/' },
    { text: 'Sonido de arranque: "Jet engine startup" de SamsterBirdies (CC0), recortado.',
      href: 'https://freesound.org/people/samsterbirdies/sounds/491407/' },
    { text: 'Ambiente y empuje: Pixabay (Pixabay Content License), editados.', href: 'https://pixabay.com/service/license-summary/' },
    { text: 'Tipografía B612 de Airbus (SIL Open Font License 1.1).', href: 'https://github.com/polarsys/b612' },
    { text: 'GSAP y ScrollTrigger (GSAP Standard License).', href: 'https://gsap.com/standard-license' },
    { text: 'three.js, React, React Three Fiber, drei, Lenis y Zustand (MIT); postprocessing (Zlib).' },
    { text: 'Interfaz inspirada en la saga Ace Combat (Bandai Namco). Sin fines comerciales ni afiliación.' },
  ] as readonly { text: string; href?: string }[],
};
