import { useMemo } from 'react';
import { Bloom, EffectComposer, Noise, ToneMapping } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { HalfFloatType } from 'three';
import { useFlight } from '../store/flight';
import { prefersReducedMotion } from '../flight/scroll';

/**
 * Post-procesado: bloom suave → tone mapping ACES → grano leve.
 *
 * Por qué en este orden y en HDR:
 *  · La escena se renderiza a un buffer de punto flotante (HalfFloat), donde un color puede valer
 *    más de 1. Las pantallas emisoras (HUD, MFD, objetivos) se pintan con ganancia > 1 (EMISSIVE_GAIN):
 *    una pantalla encendida es mucho más brillante que una superficie iluminada por la luna.
 *  · BLOOM con umbral de luminancia: sólo "sangra" luz lo que supera el umbral (las pantallas, la
 *    luna, las luces), como la difusión en el ojo o en una lente. mipmapBlur desenfoca en una
 *    pirámide de resoluciones (cada nivel a la mitad), mucho más barato que un desenfoque grande.
 *  · TONE MAPPING ACES: comprime el rango [0, ∞) a [0, 1] de la pantalla con una curva fílmica.
 *    El EffectComposer desactiva el del renderer mientras está activo, así que va aquí.
 *  · GRANO al final, sobre la imagen ya en rango de pantalla, como en una película.
 *
 * stencilBuffer: el HUD del combinador se recorta con el stencil; el render target del composer
 * necesita tenerlo o la máscara no existiría.
 */
export function Effects() {
  const low = useFlight((s) => s.quality === 'low');
  const grain = useMemo(() => !prefersReducedMotion(), []); // el grano cambia cada fotograma
  return (
    <EffectComposer stencilBuffer frameBufferType={HalfFloatType} multisampling={low ? 0 : 4}>
      <Bloom mipmapBlur intensity={0.55} luminanceThreshold={1} luminanceSmoothing={0.25} radius={0.55} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={grain ? 0.35 : 0} />
    </EffectComposer>
  );
}

/**
 * Ganancia de las pantallas emisoras. Con ACES, un color de 1.0 sale bastante más apagado de lo
 * que entra; multiplicándolo, el verde fósforo vuelve a verse vivo y supera el umbral del bloom.
 */
export const EMISSIVE_GAIN = 1.7;
