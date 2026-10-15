import { Canvas } from '@react-three/fiber';

// Fase 0: sólo comprueba que la cadena Vite + React + R3F + three funciona.
// La fase 1 lo sustituye por la escena real (src/scene/).
export function App() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 3], fov: 50 }}>
      <color attach="background" args={['#02060a']} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[2, 3, 4]} intensity={2} />
      <mesh rotation={[0.4, 0.6, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#7dffb2" />
      </mesh>
    </Canvas>
  );
}
