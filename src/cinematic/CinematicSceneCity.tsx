import { Suspense, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';
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
import { useControls, folder } from 'leva';


import { CinematicRain } from './CinematicRain';
import { CloudLayer, WindDebris, HeightFog } from './AtmosphericEffects';
import { LightningSystem, AmbientAudio } from './CinematicFX';
import './CinematicScene.css';

/**
 * Loads a generic meshy.ai asset and applies configurable scaling and positioning.
 */
function MeshyAsset({ url, position, scale, rotation }: { url: string; position: number[]; scale: number; rotation: number[] }) {
    const { scene } = useGLTF(url);
    const cloned = useMemo(() => scene.clone(), [scene]);
    
    useEffect(() => {
        cloned.traverse((child: any) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    child.material.envMapIntensity = 1.0;
                    child.material.needsUpdate = true;
                }
            }
        });
    }, [cloned]);

    return <primitive object={cloned} position={position as [number, number, number]} scale={[scale, scale, scale]} rotation={rotation as [number, number, number]} />;
}
useGLTF.preload('/models/meshy_bridge_vt.glb');
useGLTF.preload('/models/meshy_character_vt.glb');

/**
 * Loads the full game-ready city model and applies noir material hijack.
 */
function CityModel() {
    const { scene, materials } = useGLTF('/models/full_gameready_city_buildings.glb');

    const materialConfig = useControls('Building Materials', {
        overrideColor: true,
        color: '#5c5c63',
        overrideRoughness: true,
        roughness: { value: 0.11, min: 0, max: 1, step: 0.01 },
        overrideMetalness: true,
        metalness: { value: 0.22, min: 0, max: 1, step: 0.01 },
        overrideEnvMap: true,
        envMapIntensity: { value: 1.0, min: 0, max: 5, step: 0.1 },
        disableEmissive: true,
        disableTextures: false,
    });

    useEffect(() => {
        let meshCount = 0;
        let instancedCount = 0;
        
        scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                meshCount++;
                const mesh = child as THREE.Mesh;
                if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
                    instancedCount++;
                }

                // Modify original materials directly to preserve maps
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach(oldMat => {
                    const mat = oldMat as THREE.MeshStandardMaterial;
                    
                    // Keep track of the original color if we haven't already
                    if (mat.color && (!mat.userData.originalColor)) {
                        mat.userData.originalColor = mat.color.clone();
                    }

                    if (mat.color && mat.userData.originalColor) {
                        if (materialConfig.overrideColor) {
                            mat.color.set(materialConfig.color);
                        } else {
                            mat.color.copy(mat.userData.originalColor);
                        }
                    }

                    if (materialConfig.overrideRoughness) mat.roughness = materialConfig.roughness;
                    if (materialConfig.overrideMetalness) mat.metalness = materialConfig.metalness;
                    
                    if (mat.emissive && materialConfig.disableEmissive) {
                        mat.emissive.setHex(0x000000); // Stop self-glowing
                    }
                    
                    if (materialConfig.overrideEnvMap) mat.envMapIntensity = materialConfig.envMapIntensity;
                    
                    if (materialConfig.disableTextures) {
                        if (mat.map && !mat.userData.originalMap) mat.userData.originalMap = mat.map;
                        if (mat.normalMap && !mat.userData.originalNormalMap) mat.userData.originalNormalMap = mat.normalMap;
                        if (mat.roughnessMap && !mat.userData.originalRoughnessMap) mat.userData.originalRoughnessMap = mat.roughnessMap;
                        if (mat.metalnessMap && !mat.userData.originalMetalnessMap) mat.userData.originalMetalnessMap = mat.metalnessMap;
                        
                        mat.map = null;
                        mat.normalMap = null;
                        mat.roughnessMap = null;
                        mat.metalnessMap = null;
                    } else {
                        if (mat.userData.originalMap) mat.map = mat.userData.originalMap;
                        if (mat.userData.originalNormalMap) mat.normalMap = mat.userData.originalNormalMap;
                        if (mat.userData.originalRoughnessMap) mat.roughnessMap = mat.userData.originalRoughnessMap;
                        if (mat.userData.originalMetalnessMap) mat.metalnessMap = mat.userData.originalMetalnessMap;
                    }

                    mat.needsUpdate = true;
                });

                mesh.receiveShadow = false;
                mesh.castShadow = false;
            }
        });

        console.log(`CityModel matched ${meshCount} meshes (${instancedCount} instanced).`);
    }, [scene, materialConfig]);

    const processedScene = scene;

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
    const { gl } = useThree();

    const lightingConfig = useControls('Lighting', {
        exposure: { value: 1.45, min: 0.1, max: 3, step: 0.05 },
        ambientIntensity: { value: 0.40, min: 0, max: 2, step: 0.05 },
        mainLightIntensity: { value: 0.35, min: 0, max: 2, step: 0.05 },
        godRayIntensity: { value: 1.45, min: 0, max: 2, step: 0.05 },
        fillLightIntensity: { value: 1.55, min: 0, max: 2, step: 0.01 },
        hemisphereIntensity: { value: 1.10, min: 0, max: 2, step: 0.05 },
    });

    const effectConfig = useControls('Effects', {
        showRain: true,
        showClouds: true,
        showDebris: true,
        showFog: true,
        showLightning: true,
        postProcessing: folder({
            enabled: true,
            bloomIntensity: { value: 0.20, min: 0, max: 2, step: 0.05 },
            bloomThreshold: { value: 0.85, min: 0, max: 1, step: 0.05 },
            brightness: { value: -0.1, min: -0.5, max: 0.5, step: 0.01 },
            contrast: { value: 0.1, min: -0.5, max: 0.5, step: 0.01 },
            saturation: { value: -0.12, min: -1, max: 1, step: 0.05 },
            vignetteDarkness: { value: 0.70, min: 0, max: 1, step: 0.05 },
        })
    });

    useEffect(() => {
        gl.toneMappingExposure = lightingConfig.exposure;
    }, [lightingConfig.exposure, gl]);

    return (
        <>
            {/* Atmospheric lighting */}
            <ambientLight intensity={lightingConfig.ambientIntensity} color="#5566aa" />

            {/* Realistic environment reflections for wet materials */}
            <Environment preset="city" />

            {/* Main overcast light - lowered angle so flat roofs do not reflect blinding circle */}
            <directionalLight
                position={[100, 20, 50]}
                intensity={lightingConfig.mainLightIntensity}
                color="#8899cc"
            />

            {/* God ray — warm break in clouds - glancing side angle */}
            <directionalLight
                position={[-100, 15, -80]}
                intensity={lightingConfig.godRayIntensity}
                color="#ddcc88"
            />

            {/* Fill from below — water reflection bounce */}
            <pointLight
                position={[0, -5, 0]}
                intensity={lightingConfig.fillLightIntensity}
                color="#1a3a5a"
                distance={100}
            />

            {/* Hemisphere for sky/ground color */}
            <hemisphereLight
                args={['#2a3545', '#080610', lightingConfig.hemisphereIntensity]}
            />

            {/* Dense atmospheric fog */}
            {effectConfig.showFog && <fog attach="fog" args={['#0a0f18', 20, 150]} />}

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
            {effectConfig.showRain && <CinematicRain />}
            {effectConfig.showClouds && <CloudLayer />}
            {effectConfig.showDebris && <WindDebris />}
            <HeightFog />
            {effectConfig.showLightning && <LightningSystem />}
            <AmbientAudio />

            {/* Flythrough camera */}
            <CityFlythrough />

            {effectConfig.enabled && (
                <EffectComposer>
                    <Bloom
                        intensity={effectConfig.bloomIntensity}
                        luminanceThreshold={effectConfig.bloomThreshold}
                        luminanceSmoothing={0.8}
                        kernelSize={KernelSize.MEDIUM}
                    />
                    <BrightnessContrast
                        brightness={effectConfig.brightness}
                        contrast={effectConfig.contrast}
                    />
                    <HueSaturation
                        hue={0.05}
                        saturation={effectConfig.saturation}
                    />
                    <Vignette
                        offset={0.15}
                        darkness={effectConfig.vignetteDarkness}
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
            )}
            {/* Meshy AI Generated Assets */}
            <MeshyCyberpunkAssets />
        </>
    );
}

function MeshyCyberpunkAssets() {
    const bridgeConfig = useControls('Meshy Bridge', {
        show: true,
        position: [24, 25.4, 2],
        scale: { value: 6.0, min: 0.1, max: 20, step: 0.1 },
        rotation: [0, 1.57, 0]
    });
    
    const charConfig = useControls('Meshy Character', {
        show: true,
        position: [12, 10, -5],
        scale: { value: 3.5, min: 0.1, max: 10, step: 0.1 },
        rotation: [0, 0, 0]
    });

    return (
        <group>
            {bridgeConfig.show && <MeshyAsset url="/models/meshy_bridge_vt.glb" {...bridgeConfig} />}
            {charConfig.show && <MeshyAsset url="/models/meshy_character_vt.glb" {...charConfig} />}
        </group>
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
