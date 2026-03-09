import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stats } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { Leva, useControls } from 'leva';
import {
    EffectComposer,
    Vignette,
    ChromaticAberration,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

import { PlayerController } from './player/PlayerController';
import { CameraRig } from './player/CameraRig';
import { Skybridge } from './level/Skybridge';
import { Towers } from './level/Towers';
import { useBridgeDegradation } from './level/BridgeDegradation';
import { RainSystem } from './shaders/RainShader';
import { WeatherEngine } from './systems/WeatherEngine';
import { AIDirector } from './systems/AIDirector';
import { HUD } from './hud/HUD';

function GameSystems() {
    useBridgeDegradation();
    return (
        <>
            <WeatherEngine />
            <AIDirector />
        </>
    );
}

function Scene() {
    return (
        <>
            {/* Lighting */}
            <ambientLight intensity={0.15} color="#8899aa" />
            <directionalLight
                position={[10, 30, 5]}
                intensity={0.3}
                color="#99aabb"
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-near={0.5}
                shadow-camera-far={100}
                shadow-camera-left={-30}
                shadow-camera-right={30}
                shadow-camera-top={30}
                shadow-camera-bottom={-30}
            />
            {/* Overcast sky fill */}
            <hemisphereLight
                args={['#2a3545', '#0a0f18', 0.4]}
            />

            {/* Fog for atmosphere */}
            <fog attach="fog" args={['#0a0f18', 30, 80]} />

            {/* Level geometry */}
            <Skybridge />
            <Towers />

            {/* Ground/water plane far below */}
            <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[200, 200]} />
                <meshStandardMaterial
                    color="#0a1520"
                    roughness={0.3}
                    metalness={0.8}
                    transparent
                    opacity={0.7}
                />
            </mesh>

            {/* Rain */}
            <RainSystem />

            {/* Player */}
            <PlayerController />
            <CameraRig />

            {/* Systems */}
            <GameSystems />

            {/* Post-processing */}
            <EffectComposer>
                <Vignette
                    offset={0.3}
                    darkness={0.7}
                    blendFunction={BlendFunction.NORMAL}
                />
                <ChromaticAberration
                    offset={new THREE.Vector2(0.001, 0.001)}
                    blendFunction={BlendFunction.NORMAL}
                    radialModulation={true}
                    modulationOffset={0.5}
                />
            </EffectComposer>
        </>
    );
}

export default function App() {
    return (
        <>
            <Leva collapsed hidden={!import.meta.env.DEV} />
            <Canvas
                shadows
                dpr={[1, 2]}
                gl={{
                    antialias: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 0.8,
                }}
                camera={{ fov: 65, near: 0.1, far: 200, position: [0, 25, 15] }}
            >
                <Suspense fallback={null}>
                    <Physics
                        gravity={[0, -9.81, 0]}
                        timeStep={1 / 60}
                    >
                        <Scene />
                    </Physics>
                </Suspense>
            </Canvas>
            <HUD />
            {import.meta.env.DEV && <Stats />}
        </>
    );
}
