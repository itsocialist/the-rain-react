import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Stats, Environment } from '@react-three/drei';
import {
    EffectComposer,
    Vignette,
    ChromaticAberration,
    Bloom,
    DepthOfField,
    BrightnessContrast,
    HueSaturation,
} from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';
import * as THREE from 'three';

import {
    FloodPlane,
    CitySkyline,
    CinematicBridge,
    CinematicTowers,
    PlayerFigure,
} from './CinematicElementsModels';
import { CinematicRain } from './CinematicRain';
import { CloudLayer, WindDebris, WaterDebris, WireNetwork, RainSplashes, HeightFog } from './AtmosphericEffects';
import { LightningSystem, AmbientAudio, CinematicCameraSequence } from './CinematicFX';
import './CinematicScene.css';

function CinematicWorld() {
    return (
        <>
            {/* Atmospheric lighting — boosted contrast */}
            <ambientLight intensity={0.12} color="#5566aa" />

            {/* Main overcast light — dim, bluish */}
            <directionalLight
                position={[15, 40, 10]}
                intensity={0.4}
                color="#8899cc"
                castShadow
                shadow-mapSize-width={4096}
                shadow-mapSize-height={4096}
                shadow-camera-near={0.5}
                shadow-camera-far={120}
                shadow-camera-left={-50}
                shadow-camera-right={50}
                shadow-camera-top={50}
                shadow-camera-bottom={-50}
                shadow-bias={-0.0003}
            />

            {/* God ray light — warm break in clouds */}
            <directionalLight
                position={[30, 50, -20]}
                intensity={0.25}
                color="#ddcc88"
            />

            {/* Fill from below — water reflection bounce */}
            <pointLight
                position={[0, 0, 0]}
                intensity={0.05}
                color="#1a3a5a"
                distance={80}
            />

            {/* Hemisphere for sky/ground color */}
            <hemisphereLight
                args={['#2a3545', '#080610', 0.45]}
            />

            {/* Dense atmospheric fog */}
            <fog attach="fog" args={['#0a0f18', 30, 130]} />

            {/* Storm sky dome */}
            <mesh scale={[-1, 1, 1]}>
                <sphereGeometry args={[180, 32, 16]} />
                <shaderMaterial
                    side={THREE.BackSide}
                    uniforms={{}}
                    vertexShader={`
                        varying vec3 vWorldPos;
                        void main() {
                            vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
                        }
                    `}
                    fragmentShader={`
                        varying vec3 vWorldPos;
                        void main() {
                            float y = normalize(vWorldPos).y;
                            // Dark stormy gradient: deep blue-black at horizon → slightly lighter above
                            vec3 horizon = vec3(0.04, 0.06, 0.10);
                            vec3 zenith = vec3(0.06, 0.08, 0.14);
                            vec3 cloudBreak = vec3(0.12, 0.11, 0.09);

                            vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.5, y));
                            // Warm cloud break in one direction
                            float breakAngle = atan(vWorldPos.z, vWorldPos.x);
                            float breakMask = smoothstep(0.3, 0.5, y) * smoothstep(0.7, 0.4, y);
                            breakMask *= smoothstep(0.8, 0.5, abs(breakAngle - 0.8));
                            color = mix(color, cloudBreak, breakMask * 0.4);

                            gl_FragColor = vec4(color, 1.0);
                        }
                    `}
                />
            </mesh>

            {/* God ray spotlight — warm beam onto bridge */}
            <spotLight
                position={[25, 55, -15]}
                angle={0.25}
                penumbra={0.8}
                intensity={0.3}
                color="#ccbb88"
                target-position={[0, 20, 0]}
                castShadow={false}
            />

            {/* Rim light — makes bridge and towers readable */}
            <directionalLight
                position={[-20, 25, 15]}
                intensity={0.18}
                color="#5577aa"
            />

            {/* Scene elements */}
            <FloodPlane />
            <CitySkyline />
            <CinematicBridge segmentCount={14} />
            <CinematicTowers />
            <PlayerFigure />
            <CinematicRain />
            <CloudLayer />
            <WindDebris />
            <WaterDebris />
            <WireNetwork />
            <RainSplashes />
            <HeightFog />
            <LightningSystem />
            <AmbientAudio />
            <CinematicCameraSequence />

            {/* Post-processing stack — cinematic color grading */}
            <EffectComposer>
                <Bloom
                    intensity={0.25}
                    luminanceThreshold={0.55}
                    luminanceSmoothing={0.8}
                    kernelSize={KernelSize.MEDIUM}
                />
                <BrightnessContrast
                    brightness={-0.03}
                    contrast={0.08}
                />
                <HueSaturation
                    hue={0.05}
                    saturation={-0.2}
                />
                <Vignette
                    offset={0.2}
                    darkness={0.9}
                    blendFunction={BlendFunction.NORMAL}
                />
                <ChromaticAberration
                    offset={new THREE.Vector2(0.001, 0.001)}
                    blendFunction={BlendFunction.NORMAL}
                    radialModulation={true}
                    modulationOffset={0.5}
                />
                <DepthOfField
                    focusDistance={0.02}
                    focalLength={0.05}
                    bokehScale={2.5}
                />
            </EffectComposer>
        </>
    );
}

/**
 * Cinematic HUD overlay — game title + atmospheric text.
 */
function CinematicHUD() {
    return (
        <div className="cinematic-hud">
            <div className="cinematic-title-block">
                <h1 className="cinematic-title">THE RAIN CONTINUES (3D MODELS)</h1>
                <div className="cinematic-subtitle">LEVEL 1 — THE CROSSING</div>
            </div>
        </div>
    );
}

export default function CinematicSceneModels() {
    return (
        <div className="cinematic-container">
            <Canvas
                shadows
                dpr={[1, 2]}
                gl={{
                    antialias: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 0.6,
                    powerPreference: 'high-performance',
                }}
                camera={{ fov: 55, near: 0.1, far: 250 }}
            >
                <Suspense fallback={null}>
                    <CinematicWorld />
                </Suspense>
            </Canvas>
            <CinematicHUD />
        </div>
    );
}
