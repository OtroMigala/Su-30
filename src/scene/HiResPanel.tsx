import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFlight } from '../store/flight';

const URL = `${import.meta.env.BASE_URL}textures/panel_front.webp`;

/**
 * Textura del panel delantero a resolución completa, con carga diferida.
 *
 * El GLB trae el panel a 512 px para que la carga inicial sea ligera. La primera vez que entras a
 * la cabina se descarga la versión de 1024 px (~120 KB) y se sustituye en caliente.
 *
 * "Baja resolución de lejos, alta de cerca" ya lo hace la GPU con MIPMAPS: la textura se guarda
 * también a 1/2, 1/4, 1/8... de tamaño y, para cada píxel de pantalla, se lee el nivel cuyo texel
 * mide lo mismo que ese píxel. De lejos se usan niveles pequeños (sin parpadeo ni aliasing); de
 * cerca, el nivel 0, que ahora tiene el doble de detalle.
 *
 * Filtrado ANISÓTROPO: desde el asiento el panel se ve muy oblicuo; un píxel de pantalla cubre un
 * área alargada de la textura y el mipmap normal (isótropo) elegiría un nivel demasiado borroso.
 * Con anisotropía la GPU toma varias muestras a lo largo de esa dirección.
 */
export function HiResPanel({ root }: { root: THREE.Object3D }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const mesh = root.getObjectByName('panel_front') as THREE.Mesh | undefined;
    const mat = (mesh?.material ?? (mesh?.children[0] as THREE.Mesh | undefined)?.material) as THREE.MeshStandardMaterial | undefined;
    if (!mat?.map) return;
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    mat.map.anisotropy = aniso;
    mat.map.needsUpdate = true;

    let cancelled = false;
    const load = () => {
      new THREE.TextureLoader().load(URL, (tex) => {
        if (cancelled) return tex.dispose();
        // Mismas convenciones que las texturas de glTF: v = 0 arriba (sin voltear) y sRGB.
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = aniso;
        tex.wrapS = mat.map!.wrapS;
        tex.wrapT = mat.map!.wrapT;
        const old = mat.map!;
        mat.map = tex;
        if (mat.emissiveMap === old) mat.emissiveMap = tex; // el panel usa la misma imagen como emisiva
        mat.needsUpdate = true;
        old.dispose();
      });
    };
    // Esperar a estar en la cabina: quien sólo mira el exterior no la descarga.
    let unsub = () => {};
    if (useFlight.getState().camMode !== 'exterior') load();
    else
      unsub = useFlight.subscribe((s) => {
        if (s.camMode !== 'exterior') {
          unsub();
          load();
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [root, gl]);
  return null;
}
