import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
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
import { Water } from 'three-stdlib';

import { CinematicRain } from './CinematicRain';
import { CloudLayer, WindDebris, HeightFog } from './AtmosphericEffects';
import { LightningSystem, AmbientAudio } from './CinematicFX';
import './CinematicScene.css';

/**
 * Loads the full game-ready city model and applies noir material hijack.
 */
function CityModel() {
    const { scene } = useGLTF('/models/full_gameready_city_buildings.glb');

    const processedScene = useMemo(() => {
        const clone = scene.clone(true);

        clone.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;

                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                const newMaterials = materials.map((oldMat: THREE.Material) => {
                    const stdMat = oldMat as THREE.MeshStandardMaterial;

                    // Preserve color with noir darkening (45% brightness)
                    let baseColor = new THREE.Color('#1a2030');
                    if (stdMat.color) {
                        baseColor = stdMat.color.clone().multiplyScalar(0.45);
                    }

                    return new THREE.MeshStandardMaterial({
                        color: baseColor,
                        map: stdMat.map || null,
                        alphaMap: stdMat.alphaMap || null,
                        transparent: stdMat.transparent || (stdMat.opacity != null && stdMat.opacity < 1),
                        opacity: stdMat.opacity ?? 1,
                        side: stdMat.side ?? THREE.FrontSide,
                        roughness: 0.15, // Makes the buildings look wet
                        metalness: 0.2,
                        envMapIntensity: 0.5,
                    });
                });

                mesh.material = newMaterials.length === 1 ? newMaterials[0] : newMaterials;
                mesh.castShadow = false;
                mesh.receiveShadow = false;
            }
        });

        return clone;
    }, [scene]);

    // Compute model bounds to position it correctly
    const { scale, yOffset } = useMemo(() => {
        const box = new THREE.Box3().setFromObject(processedScene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Scale the city to a reasonable scene size (~200 units wide)
        const targetWidth = 200;
        const s = targetWidth / Math.max(size.x, size.z, 1);

        // Shift so bottom sits near Y=0
        const yOff = -box.min.y * s;

        return { scale: s, yOffset: yOff };
    }, [processedScene]);

    return (
        <primitive
            object={processedScene}
            scale={[scale, scale, scale]}
            position={[0, yOffset - 5, 0]}
        />
    );
}

useGLTF.preload('/models/full_gameready_city_buildings.glb');

/**
 * Cinematic flythrough camera that slowly sweeps through the city.
 */
function CityFlythrough() {
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);

    // Create a smooth flythrough path through the city
    const path = useMemo(() => {
        const points = [
            new THREE.Vector3(60, 25, 60),    // Start high, looking down
            new THREE.Vector3(40, 15, 30),     // Descend into streets
            new THREE.Vector3(10, 8, 10),       // Low between buildings
            new THREE.Vector3(-15, 12, -5),     // Rise up through gap
            new THREE.Vector3(-30, 20, -30),    // Mid-height sweep
            new THREE.Vector3(-50, 30, -20),    // Pull back wide
            new THREE.Vector3(-40, 40, 30),     // High overview
            new THREE.Vector3(0, 35, 50),       // Circle back
            new THREE.Vector3(60, 25, 60),      // Complete loop
        ];
        return new THREE.CatmullRomCurve3(points, true);
    }, []);

    // Look-at target also follows a path (slightly ahead of camera)
    const lookAtPath = useMemo(() => {
        const points = [
            new THREE.Vector3(0, 10, 0),
            new THREE.Vector3(-10, 5, -10),
            new THREE.Vector3(-20, 8, -15),
            new THREE.Vector3(-10, 10, -20),
            new THREE.Vector3(10, 15, 0),
            new THREE.Vector3(0, 20, 10),
            new THREE.Vector3(-20, 10, 20),
            new THREE.Vector3(10, 8, 30),
            new THREE.Vector3(0, 10, 0),
        ];
        return new THREE.CatmullRomCurve3(points, true);
    }, []);

    useFrame(({ camera, clock }) => {
        const t = (clock.getElapsedTime() * 0.015) % 1; // ~67 second loop
        const pos = path.getPointAt(t);
        const lookAt = lookAtPath.getPointAt(t);

        camera.position.lerp(pos, 0.02);
        
        // Smooth look-at
        const currentLookAt = new THREE.Vector3();
        camera.getWorldDirection(currentLookAt);
        currentLookAt.multiplyScalar(50).add(camera.position);
        currentLookAt.lerp(lookAt, 0.015);
        camera.lookAt(currentLookAt);
    });

    return null;
}

/**
 * Water/flood plane at ground level.
 */
function CityFloodPlane() {
    const waterNormals = useLoader(THREE.TextureLoader, '/textures/waternormals.jpg');
    waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

    const water = useMemo(() => {
        const waterGeom = new THREE.PlaneGeometry(1000, 1000);
        return new Water(waterGeom, {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals,
            sunDirection: new THREE.Vector3(15, 40, 10).normalize(),
            sunColor: 0x8899cc,
            waterColor: 0x03080c,
            distortionScale: 2.0,
            fog: true,
        });
    }, [waterNormals]);

    useFrame((state, delta) => {
        water.material.uniforms['time'].value += delta * 0.3;
    });

    return <primitive object={water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 4.5, 0]} />;
}

function CinematicCityWorld() {
    return (
        <>
            {/* Atmospheric lighting */}
            <ambientLight intensity={0.1} color="#5566aa" />

            {/* Main overcast light */}
            <directionalLight
                position={[15, 40, 10]}
                intensity={0.35}
                color="#8899cc"
            />

            {/* God ray — warm break in clouds */}
            <directionalLight
                position={[30, 50, -20]}
                intensity={0.2}
                color="#ddcc88"
            />

            {/* Fill from below — water reflection bounce */}
            <pointLight
                position={[0, -5, 0]}
                intensity={0.04}
                color="#1a3a5a"
                distance={100}
            />

            {/* Hemisphere for sky/ground color */}
            <hemisphereLight
                args={['#2a3545', '#080610', 0.4]}
            />

            {/* Dense atmospheric fog */}
            <fog attach="fog" args={['#0a0f18', 20, 150]} />

            {/* Storm sky dome */}
            <mesh scale={[-1, 1, 1]}>
                <sphereGeometry args={[300, 32, 16]} />
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
                            vec3 horizon = vec3(0.04, 0.06, 0.10);
                            vec3 zenith = vec3(0.06, 0.08, 0.14);
                            vec3 cloudBreak = vec3(0.12, 0.11, 0.09);
                            vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.5, y));
                            float breakAngle = atan(vWorldPos.z, vWorldPos.x);
                            float breakMask = smoothstep(0.3, 0.5, y) * smoothstep(0.7, 0.4, y);
                            breakMask *= smoothstep(0.8, 0.5, abs(breakAngle - 0.8));
                            color = mix(color, cloudBreak, breakMask * 0.4);
                            gl_FragColor = vec4(color, 1.0);
                        }
                    `}
                />
            </mesh>

            {/* City model */}
            <Suspense fallback={null}>
                <CityModel />
            </Suspense>

            {/* Flood water */}
            <CityFloodPlane />

            {/* Atmospheric effects */}
            <CinematicRain />
            <CloudLayer />
            <WindDebris />
            <HeightFog />
            <LightningSystem />
            <AmbientAudio />

            {/* Flythrough camera */}
            <CityFlythrough />

            {/* Post-processing — cinematic noir grading */}
            <EffectComposer>
                <Bloom
                    intensity={0.2}
                    luminanceThreshold={0.55}
                    luminanceSmoothing={0.8}
                    kernelSize={KernelSize.MEDIUM}
                />
                <BrightnessContrast
                    brightness={-0.04}
                    contrast={0.1}
                />
                <HueSaturation
                    hue={0.05}
                    saturation={-0.25}
                />
                <Vignette
                    offset={0.15}
                    darkness={0.95}
                    blendFunction={BlendFunction.NORMAL}
                />
                <ChromaticAberration
                    offset={new THREE.Vector2(0.0008, 0.0008)}
                    blendFunction={BlendFunction.NORMAL}
                    radialModulation={true}
                    modulationOffset={0.5}
                />
                <DepthOfField
                    focusDistance={0.03}
                    focalLength={0.06}
                    bokehScale={3}
                />
            </EffectComposer>
        </>
    );
}

/**
 * Cinematic HUD overlay.
 */
function CinematicCityHUD() {
    return (
        <div className="cinematic-hud">
            <div className="cinematic-title-block">
                <h1 className="cinematic-title">THE RAIN CONTINUES</h1>
                <div className="cinematic-subtitle">CITYSCAPE FLYTHROUGH</div>
            </div>
        </div>
    );
}

export default function CinematicSceneCity() {
    return (
        <div className="cinematic-container">
            <Canvas
                shadows
                dpr={[1, 2]}
                gl={{
                    antialias: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 0.55,
                    powerPreference: 'high-performance',
                }}
                camera={{ fov: 60, near: 0.1, far: 400 }}
            >
                <Suspense fallback={null}>
                    <CinematicCityWorld />
                </Suspense>
            </Canvas>
            <CinematicCityHUD />
        </div>
    );
}
