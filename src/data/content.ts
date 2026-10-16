// Contenido del sitio, portado del objeto DATA de reference/cockpit-hud.html.
// Todo el sitio sale de aquí: edita este archivo para cambiar textos, proyectos o contacto.
// `as const` hace que TypeScript conserve los literales (p. ej. el número exacto de secciones).

export interface Section {
  id: string;
  /** Código de 3–4 letras del waypoint (cinta de rumbo, WPT). */
  code: string;
  /** Rótulo corto del menú tipo selector de armas. */
  menu: string;
  label: string;
  /** Altitud del waypoint en metros. */
  alt: number;
  /** Mensaje de radio al llegar: [emisor, texto]. */
  radio: readonly [string, string];
}

export interface Project {
  id: string;
  name: string;
  tag: string;
  desc: string;
}

export const CONTENT = {
  pilot: 'J. A. CÁRDENAS',
  callsign: 'ALEJO',
  sections: [
    { id: 'start', code: 'TKOF', menu: 'START', label: 'Despegue', alt: 900,
      radio: ['CONTROL', 'Bienvenido a bordo. Haz scroll para despegar; con F miras alrededor.'] },
    { id: 'about', code: 'PRFL', menu: 'ABOUT', label: 'Perfil', alt: 2200,
      radio: ['CONTROL', 'Waypoint alcanzado. Transmitiendo el perfil del piloto a tu pantalla.'] },
    { id: 'projects', code: 'TGTS', menu: 'PROJ', label: 'Proyectos', alt: 3000,
      radio: ['AWACS', 'Varios objetivos en el radar. Pasa el cursor sobre uno para fijarlo.'] },
    { id: 'skills', code: 'SYS', menu: 'SYS', label: 'Sistemas', alt: 2600,
      radio: ['CONTROL', 'Diagnóstico de sistemas completo. Revisa el estado en la pantalla.'] },
    { id: 'contact', code: 'COMM', menu: 'COMMS', label: 'Contacto', alt: 3400,
      radio: ['CONTROL', 'Canal abierto. Las frecuencias de contacto están en tu pantalla.'] },
    { id: 'credits', code: 'RTB', menu: 'CRED', label: 'Créditos', alt: 4200,
      radio: ['CONTROL', 'Misión cumplida. Regresa a base cuando quieras.'] },
  ] as readonly Section[],
  about: [
    'Estudiante de Ingeniería en Telecomunicaciones,',
    'Universidad del Cauca, Popayán.',
    '',
    'Programo microcontroladores STM32 en C,',
    'simulo fenómenos físicos con React y',
    'construyo bots de mensajería con Node.js.',
    '',
    'Vicepresidente de la rama AESS Unicauca y',
    'webmaster del Semillero de Ingeniería Aeroespacial.',
    '',
    'Explorando: sensor fusion, tracking y',
    'computación cuántica.',
  ],
  // EDITAR: proyectos de ejemplo
  projects: [
    { id: 'P1', name: 'Portafolio retro', tag: 'THREE.JS', desc: 'Portafolio 3D: un computador retro que muestra mi experiencia en su pantalla.' },
    { id: 'P2', name: 'Bots de mensajería', tag: 'NODE.JS', desc: 'Bots para aplicaciones de mensajería como WhatsApp.' },
    { id: 'P3', name: 'Simulaciones físicas', tag: 'REACT', desc: 'Simulaciones interactivas de fenómenos físicos en el navegador.' },
    { id: 'P4', name: 'Firmware STM32', tag: 'C', desc: 'Programación de microcontroladores STM32 en C.' },
  ] as readonly Project[],
  // EDITAR: niveles de ejemplo (0 a 10)
  skills: [
    ['C / STM32', 8], ['REACT', 7], ['NODE.JS', 7], ['THREE.JS', 6],
    ['GLSL', 3], ['SENSOR FUS.', 2], ['QUANTUM', 1],
  ] as readonly (readonly [string, number])[],
  // EDITAR: datos de contacto de ejemplo
  contact: [
    ['EMAIL', 'tu-correo@ejemplo.com', 'mailto:tu-correo@ejemplo.com'],
    ['GITHUB', 'github.com/tu-usuario', 'https://github.com/'],
    ['LINKEDIN', 'linkedin.com/in/tu-usuario', 'https://www.linkedin.com/'],
  ] as readonly (readonly [string, string, string])[],
  credits: [
    'Modelo "Su-30 MKI loadout#1 [Brahmos]"',
    '  por abhinab.das000 (Sketchfab), CC BY 4.0.',
    'Tipografía B612 de Airbus, SIL Open Font License.',
    'Animación con GSAP y ScrollTrigger.',
    'Interfaz inspirada en la saga Ace Combat',
    '  (Bandai Namco). Proyecto sin fines comerciales.',
  ],
};
