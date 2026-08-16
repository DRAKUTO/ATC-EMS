import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Box, Sphere } from '@react-three/drei';
import ErrorBoundary from './ErrorBoundary';

function BuildingStructure() {
  const group = useRef();

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = state.clock.elapsedTime * 0.1;
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    }
  });

  return (
    <group ref={group} position={[0, -0.5, 0]}>
      <Box args={[3, 2, 2]} position={[0, 0, 0]}>
        <meshPhysicalMaterial color="#0a6baf" metalness={0.3} roughness={0.4} transparent opacity={0.6} />
      </Box>
      <Box args={[1.2, 0.8, 0.8]} position={[0, 1.3, 0]}>
        <meshPhysicalMaterial color="#0a5c9e" metalness={0.3} roughness={0.4} transparent opacity={0.5} />
      </Box>
      <Box args={[0.6, 0.3, 0.6]} position={[0, 1.9, 0]}>
        <meshPhysicalMaterial color="#14b8a6" metalness={0.5} roughness={0.3} transparent opacity={0.4} />
      </Box>
      {[-1.2, 0, 1.2].map((x, i) => (
        <Box key={i} args={[0.4, 1.2, 0.4]} position={[x, -0.4, 1.1]}>
          <meshPhysicalMaterial color="#1e293b" metalness={0.8} roughness={0.2} transparent opacity={0.4} />
        </Box>
      ))}
      <Sphere args={[0.1, 16, 16]} position={[0, 2.1, 0]}>
        <meshPhysicalMaterial color="#14b8a6" emissive="#14b8a6" emissiveIntensity={2} />
      </Sphere>
      <group position={[0, -1, 0]}>
        {[-0.8, 0, 0.8].map((x, i) => (
          <Box key={i} args={[0.15, 0.4, 0.15]} position={[x, 0, 0]}>
            <meshPhysicalMaterial color="#475569" metalness={0.6} roughness={0.3} transparent opacity={0.5} />
          </Box>
        ))}
      </group>
    </group>
  );
}

function FloatingElements() {
  const elements = useRef();

  useFrame((state) => {
    if (elements.current) {
      elements.current.children.forEach((child, i) => {
        child.position.y += Math.sin(state.clock.elapsedTime * 0.5 + i) * 0.002;
      });
    }
  });

  const positions = [
    { x: -2.5, y: 1, z: -1 },
    { x: 2.5, y: 0.5, z: -0.5 },
    { x: -2, y: -0.5, z: -1.5 },
    { x: 2, y: -0.8, z: -1 },
  ];

  return (
    <group ref={elements}>
      {positions.map((pos, i) => (
        <Box key={i} args={[0.1, 0.1, 0.1]} position={[pos.x, pos.y, pos.z]}>
          <meshPhysicalMaterial
            color={i % 2 === 0 ? '#0a6baf' : '#14b8a6'}
            emissive={i % 2 === 0 ? '#0a6baf' : '#14b8a6'}
            emissiveIntensity={0.5}
            transparent
            opacity={0.6}
          />
        </Box>
      ))}
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} />
      <pointLight position={[-5, -5, -5]} intensity={0.5} color="#0a6baf" />
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
        <BuildingStructure />
      </Float>
      <FloatingElements />
    </>
  );
}

function BuildingCanvas() {
  return (
    <div className="w-full h-[400px] md:h-[500px]">
      <Canvas camera={{ position: [4, 2, 5], fov: 50 }}>
        <Scene />
      </Canvas>
    </div>
  );
}

export default function HospitalBuilding3D() {
  return (
    <ErrorBoundary>
      <BuildingCanvas />
    </ErrorBoundary>
  );
}
