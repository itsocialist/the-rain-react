import { useRef, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Animated flood water plane below the city.
 * Uses a custom shader for slow undulation + dark reflective surface.
 */
export function FloodPlane() {
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
    }), []);

    useFrame(({ clock }) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = clock.elapsedTime;
        }
    });

    const vertexShader = `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;

        void main() {
            vUv = uv;
            vec3 pos = position;

            // Multi-frequency waves for organic feel
            float w1 = sin(pos.x * 0.08 + uTime * 0.25) * cos(pos.y * 0.06 + uTime * 0.15) * 0.6;
            float w2 = sin(pos.x * 0.22 + pos.y * 0.18 + uTime * 0.35) * 0.25;
            float w3 = cos(pos.y * 0.12 - uTime * 0.2) * sin(pos.x * 0.05 + uTime * 0.1) * 0.4;
            pos.z += w1 + w2 + w3;

            // Compute normal from wave displacement for lighting
            float eps = 0.5;
            float hL = sin((pos.x - eps) * 0.08 + uTime * 0.25) * 0.6 + sin((pos.x - eps) * 0.22 + pos.y * 0.18 + uTime * 0.35) * 0.25;
            float hR = sin((pos.x + eps) * 0.08 + uTime * 0.25) * 0.6 + sin((pos.x + eps) * 0.22 + pos.y * 0.18 + uTime * 0.35) * 0.25;
            float hD = cos((pos.y - eps) * 0.12 - uTime * 0.2) * 0.4;
            float hU = cos((pos.y + eps) * 0.12 - uTime * 0.2) * 0.4;
            vNormal = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));

            vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
        }
    `;

    const fragmentShader = `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        // Simple hash noise
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p *= 2.0;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = vWorldPos.xz * 0.02;

            // Layered murky water color
            float n1 = fbm(uv * 3.0 + uTime * 0.03);
            float n2 = fbm(uv * 5.0 - uTime * 0.02 + 5.0);
            float murkiness = n1 * 0.6 + n2 * 0.4;

            vec3 deepColor = vec3(0.03, 0.06, 0.10);
            vec3 surfaceColor = vec3(0.08, 0.12, 0.18);
            vec3 muddyColor = vec3(0.10, 0.08, 0.05);

            vec3 color = mix(deepColor, surfaceColor, murkiness);
            color = mix(color, muddyColor, smoothstep(0.55, 0.75, n1) * 0.3);

            // Subtle specular highlight from waves
            vec3 lightDir = normalize(vec3(0.3, 1.0, -0.2));
            vec3 viewDir = normalize(cameraPosition - vWorldPos);
            vec3 halfDir = normalize(lightDir + viewDir);
            float spec = pow(max(dot(vNormal, halfDir), 0.0), 40.0);
            color += spec * vec3(0.15, 0.18, 0.22) * 0.5;

            // Distance fade to horizon
            float dist = length(vWorldPos.xz) / 150.0;
            vec3 horizonColor = vec3(0.04, 0.05, 0.08);
            color = mix(color, horizonColor, smoothstep(0.2, 1.0, dist));

            gl_FragColor = vec4(color, 0.92);
        }
    `;

    return (
        <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[400, 400, 128, 128]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}

/**
 * Loads the stock GLB model and instances it across the skyline.
 * Applies a dark meshBasicMaterial override to prevent bloom blowout.
 * Supports per-instance color tint and mirroring for variety.
 */
function StockBuildingProxy({ position, scale, rotation, colorTint, mirror, modelPath }: {
    position: [number, number, number],
    scale: [number, number, number],
    rotation: number,
    colorTint?: [number, number, number],
    mirror?: boolean,
    modelPath?: string,
}) {
    const { scene } = useGLTF(modelPath || '/models/building_1.glb');
    const tint = colorTint || [1, 1, 1];

    const clonedScene = useMemo(() => {
        const clone = scene.clone(true);

        // Shader hijack: convert to meshBasicMaterial to prevent bloom blowout,
        // but PRESERVE original texture maps so buildings retain their detail
        clone.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;

                // Handle both single materials and material arrays
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                const newMaterials = materials.map((oldMat: THREE.Material) => {
                    const stdMat = oldMat as THREE.MeshStandardMaterial;

                    // Preserve the original color, darkened + tinted per-instance
                    let baseColor = new THREE.Color('#1a2030');
                    if (stdMat.color) {
                        baseColor = stdMat.color.clone().multiplyScalar(0.4);
                    }
                    // Apply per-instance tint for variety
                    baseColor.r *= tint[0];
                    baseColor.g *= tint[1];
                    baseColor.b *= tint[2];

                    const newMat = new THREE.MeshBasicMaterial({
                        color: baseColor,
                        map: stdMat.map || null,
                        alphaMap: stdMat.alphaMap || null,
                        transparent: stdMat.transparent || (stdMat.opacity != null && stdMat.opacity < 1),
                        opacity: stdMat.opacity ?? 1,
                        side: stdMat.side ?? THREE.FrontSide,
                    });

                    return newMat;
                });

                mesh.material = newMaterials.length === 1 ? newMaterials[0] : newMaterials;
                mesh.castShadow = false;
                mesh.receiveShadow = false;
            }
        });

        return clone;
    }, [scene, tint]);

    // Normalize scale + compute Y offset so the bottom of the model sits at position.y
    const { normalizedScale, yOffset } = useMemo(() => {
        const box = new THREE.Box3().setFromObject(clonedScene);
        const modelSize = box.getSize(new THREE.Vector3());
        const modelCenter = box.getCenter(new THREE.Vector3());

        const sx = modelSize.x > 0.01 ? scale[0] / modelSize.x : 1;
        const sy = modelSize.y > 0.01 ? scale[1] / modelSize.y : 1;
        const sz = modelSize.z > 0.01 ? scale[2] / modelSize.z : 1;

        // Shift model up so its bottom edge aligns with Y=0 (relative to position)
        // box.min.y is the model's bottom in local space; after scaling, offset = -box.min.y * sy
        const yOff = -box.min.y * sy;

        return {
            normalizedScale: [mirror ? -sx : sx, sy, sz] as [number, number, number],
            yOffset: yOff,
        };
    }, [clonedScene, scale, mirror]);

    // Apply Y offset: position the model so its bottom sits at position[1]
    const adjustedPosition: [number, number, number] = [
        position[0],
        position[1] + yOffset,
        position[2]
    ];

    return (
        <primitive
            object={clonedScene}
            position={adjustedPosition}
            scale={normalizedScale}
            rotation={[0, rotation, 0]}
        />
    );
}

// Preload both models so they start downloading immediately
useGLTF.preload('/models/building_1.glb');
useGLTF.preload('/models/building_2.glb');

// Available model paths for skyline variety
const MODEL_PATHS = ['/models/building_1.glb', '/models/building_2.glb'];

/**
 * Generic tower component that loads a GLB model and positions it
 * so the bridge deck sits at the correct height.
 */
function ModelTower({ modelPath, position, towerSize, tint }: {
    modelPath: string;
    position: [number, number, number];
    towerSize: [number, number, number];
    tint?: [number, number, number];
}) {
    const { scene } = useGLTF(modelPath);
    const colorTint = tint || [1, 1, 1];

    const clonedScene = useMemo(() => {
        const clone = scene.clone(true);
        clone.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                const newMaterials = materials.map((oldMat: THREE.Material) => {
                    const stdMat = oldMat as THREE.MeshStandardMaterial;
                    let baseColor = new THREE.Color('#1a2030');
                    if (stdMat.color) {
                        baseColor = stdMat.color.clone().multiplyScalar(0.4);
                    }
                    baseColor.r *= colorTint[0];
                    baseColor.g *= colorTint[1];
                    baseColor.b *= colorTint[2];
                    return new THREE.MeshBasicMaterial({
                        color: baseColor,
                        map: stdMat.map || null,
                        alphaMap: stdMat.alphaMap || null,
                        transparent: stdMat.transparent || (stdMat.opacity != null && stdMat.opacity < 1),
                        opacity: stdMat.opacity ?? 1,
                        side: stdMat.side ?? THREE.FrontSide,
                    });
                });
                mesh.material = newMaterials.length === 1 ? newMaterials[0] : newMaterials;
                mesh.castShadow = false;
                mesh.receiveShadow = false;
            }
        });
        return clone;
    }, [scene, colorTint]);

    const { normalizedScale, yOffset } = useMemo(() => {
        const box = new THREE.Box3().setFromObject(clonedScene);
        const modelSize = box.getSize(new THREE.Vector3());
        const sx = modelSize.x > 0.01 ? towerSize[0] / modelSize.x : 1;
        const sy = modelSize.y > 0.01 ? towerSize[1] / modelSize.y : 1;
        const sz = modelSize.z > 0.01 ? towerSize[2] / modelSize.z : 1;
        const yOff = -box.min.y * sy;
        return {
            normalizedScale: [sx, sy, sz] as [number, number, number],
            yOffset: yOff,
        };
    }, [clonedScene, towerSize]);

    const adjustedPosition: [number, number, number] = [
        position[0],
        position[1] + yOffset,
        position[2],
    ];

    return (
        <primitive
            object={clonedScene}
            position={adjustedPosition}
            scale={normalizedScale}
            rotation={[0, 0, 0]}
        />
    );
}

/**
 * City skyline using stock 3D models with per-instance variety.
 * Each building gets a unique combination of: rotation, mirror, color tint,
 * and asymmetric width/depth ratios so it doesn't look like clones.
 */
export function CitySkyline() {
    const rng = (seed: number) => {
        let s = seed;
        return () => {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    };

    // Color tint palette — subtle shifts so each building feels different
    const tintPalette: [number, number, number][] = [
        [1.0, 1.0, 1.0],   // neutral
        [1.2, 1.0, 0.85],   // warm (rusty)
        [0.85, 0.95, 1.2],  // cool (blue steel)
        [0.9, 1.1, 0.9],    // mossy green
        [1.1, 0.95, 0.8],   // sandstone
        [0.8, 0.85, 1.0],   // cold concrete
        [1.0, 0.9, 0.75],   // aged yellow
    ];

    const buildingData = useMemo(() => {
        const rand = rng(42);
        const result: Array<{
            pos: [number, number, number];
            size: [number, number, number];
            rotation: number;
            tint: [number, number, number];
            mirror: boolean;
            model: string;
        }> = [];

        for (let i = 0; i < 15; i++) {
            const angle = (i / 15) * Math.PI * 2 + rand() * 0.4;
            const dist = 22 + rand() * 55;

            // Asymmetric width/depth for variety — some wide/shallow, some narrow/deep
            const widthBase = 8 + rand() * 12;
            const depthBase = 8 + rand() * 12;
            const height = 18 + rand() * 35;
            // Ensure bottom is always well below water (Y=-2)
            // Position is where the BOTTOM of the building will be placed
            const bottomY = -2 - rand() * 8; // 2-10 units below water

            result.push({
                pos: [
                    Math.cos(angle) * dist,
                    bottomY,
                    Math.sin(angle) * dist,
                ],
                size: [widthBase, height, depthBase],
                rotation: rand() * Math.PI * 2,
                tint: tintPalette[i % tintPalette.length],
                mirror: rand() > 0.5,
                model: MODEL_PATHS[i % MODEL_PATHS.length],
            });
        }

        return result;
    }, []);

    return (
        <group>
            {buildingData.map((b, i) => (
                <Suspense fallback={null} key={i}>
                    <StockBuildingProxy
                        position={b.pos}
                        scale={b.size}
                        rotation={b.rotation}
                        colorTint={b.tint}
                        mirror={b.mirror}
                        modelPath={b.model}
                    />
                </Suspense>
            ))}
        </group>
    );
}


/**
 * Enhanced bridge with suspension cables and rust detailing.
 */
export function CinematicBridge({ segmentCount = 14 }: { segmentCount?: number }) {
    const segWidth = 2.5;
    const startX = -(segmentCount * segWidth) / 2;
    const bridgeY = 20;
    const brokenSegments = new Set([4, 8, 11]);

    // Catenary cable points
    const cablePoints = useMemo(() => {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= 40; i++) {
            const t = i / 40;
            const x = startX + t * segmentCount * segWidth;
            const sag = Math.sin(t * Math.PI) * -3; // catenary sag
            points.push(new THREE.Vector3(x, bridgeY + 3 + sag, 0));
        }
        return points;
    }, [startX, segmentCount, segWidth]);

    const cableCurve = useMemo(() => new THREE.CatmullRomCurve3(cablePoints), [cablePoints]);

    return (
        <group>
            {/* Bridge segments */}
            {Array.from({ length: segmentCount }, (_, i) => {
                if (brokenSegments.has(i)) return null;
                const x = startX + i * segWidth + segWidth / 2;
                return (
                    <group key={i} position={[x, bridgeY, 0]}>
                        {/* Main deck */}
                        <mesh>
                            <boxGeometry args={[segWidth - 0.08, 0.15, 3.5]} />
                            <meshBasicMaterial color="#1a150f" />
                        </mesh>
                        {/* I-beam supports */}
                        <mesh position={[0, -0.3, -1.4]}>
                            <boxGeometry args={[segWidth - 0.1, 0.5, 0.12]} />
                            <meshBasicMaterial color="#15100a" />
                        </mesh>
                        <mesh position={[0, -0.3, 1.4]}>
                            <boxGeometry args={[segWidth - 0.1, 0.5, 0.12]} />
                            <meshBasicMaterial color="#15100a" />
                        </mesh>
                        {/* Railing posts */}
                        {[-1, 1].map(side => (
                            <mesh key={side} position={[0, 0.6, side * 1.6]}>
                                <boxGeometry args={[0.06, 1.2, 0.06]} />
                                <meshBasicMaterial color="#151515" />
                            </mesh>
                        ))}
                        {/* Railing bars */}
                        {[-1, 1].map(side => (
                            <mesh key={`rail-${side}`} position={[0, 1.1, side * 1.6]}>
                                <boxGeometry args={[segWidth - 0.1, 0.04, 0.04]} />
                                <meshBasicMaterial color="#181818" />
                            </mesh>
                        ))}
                    </group>
                );
            })}

            {/* Suspension cables */}
            {[-1.8, 1.8].map((z, ci) => (
                <mesh key={ci} position={[0, 0, z]}>
                    <tubeGeometry args={[cableCurve, 40, 0.03, 4, false]} />
                    <meshBasicMaterial color="#0e0e0e" />
                </mesh>
            ))}

            {/* Vertical cable drops from suspension to deck */}
            {Array.from({ length: segmentCount }, (_, i) => {
                if (brokenSegments.has(i)) return null;
                const x = startX + i * segWidth + segWidth / 2;
                return [-1.8, 1.8].map((z, zi) => {
                    const cableY = bridgeY + 3 - Math.sin(((i + 0.5) / segmentCount) * Math.PI) * 3;
                    const dropHeight = cableY - bridgeY;
                    return (
                        <mesh key={`drop-${i}-${zi}`} position={[x, bridgeY + dropHeight / 2, z]}>
                            <cylinderGeometry args={[0.015, 0.015, dropHeight, 3]} />
                            <meshBasicMaterial color="#121212" />
                        </mesh>
                    );
                });
            })}
        </group>
    );
}

/**
 * Tower platforms using real 3D models.
 * Source tower = building_1.glb, Destination tower = building_2.glb
 */
export function CinematicTowers() {
    const towerWidth = 12;
    const towerHeight = 24;
    const bridgeStartX = -(14 * 2.5) / 2;
    const bridgeEndX = (14 * 2.5) / 2;
    const bridgeY = 20;

    // Position towers so the top (rooftop) is at bridge deck level
    const towerBottomY = bridgeY - towerHeight;

    return (
        <group>
            {/* Source tower — building_1.glb */}
            <Suspense fallback={
                <mesh position={[bridgeStartX - towerWidth / 2 - 0.5, bridgeY - towerHeight / 2, 0]}>
                    <boxGeometry args={[towerWidth, towerHeight, towerWidth]} />
                    <meshBasicMaterial color="#0e1518" />
                </mesh>
            }>
                <ModelTower
                    modelPath="/models/building_1.glb"
                    position={[bridgeStartX - towerWidth / 2 - 0.5, towerBottomY, 0]}
                    towerSize={[towerWidth, towerHeight, towerWidth]}
                    tint={[1.0, 0.95, 0.85]}
                />
            </Suspense>

            {/* Destination tower — building_2.glb */}
            <Suspense fallback={
                <mesh position={[bridgeEndX + towerWidth / 2 + 0.5, bridgeY - towerHeight / 2, 0]}>
                    <boxGeometry args={[towerWidth, towerHeight, towerWidth]} />
                    <meshBasicMaterial color="#0e1518" />
                </mesh>
            }>
                <ModelTower
                    modelPath="/models/building_2.glb"
                    position={[bridgeEndX + towerWidth / 2 + 0.5, towerBottomY, 0]}
                    towerSize={[towerWidth, towerHeight, towerWidth]}
                    tint={[0.85, 0.9, 1.1]}
                />
            </Suspense>
        </group>
    );
}

/**
 * Player figure silhouette on the tower platform.
 */
export function PlayerFigure() {
    const bridgeStartX = -(14 * 2.5) / 2;
    const figureX = bridgeStartX - 3;
    const figureY = 20.5;

    return (
        <group position={[figureX, figureY, 0.5]} rotation={[0, 0.3, 0]}>
            {/* Body */}
            <mesh position={[0, 0.6, 0]}>
                <capsuleGeometry args={[0.22, 0.7, 4, 8]} />
                <meshBasicMaterial color="#0a1510" />
            </mesh>
            {/* Head */}
            <mesh position={[0, 1.3, 0]}>
                <sphereGeometry args={[0.18, 8, 6]} />
                <meshBasicMaterial color="#121010" />
            </mesh>
            {/* Poncho overlay */}
            <mesh position={[0, 0.5, 0.05]}>
                <boxGeometry args={[0.55, 0.8, 0.35]} />
                <meshBasicMaterial
                    color="#0f1a0f"
                    transparent
                    opacity={0.85}
                />
            </mesh>
            {/* Backpack */}
            <mesh position={[0, 0.5, -0.25]}>
                <boxGeometry args={[0.3, 0.4, 0.2]} />
                <meshBasicMaterial color="#15100a" />
            </mesh>
        </group>
    );
}
