import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
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
 * Procedural city skyline — distant buildings with lit windows.
 */
export function CitySkyline() {
    const rng = (seed: number) => {
        let s = seed;
        return () => {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    };

    const buildingData = useMemo(() => {
        const rand = rng(42);
        const result: Array<{
            pos: [number, number, number];
            size: [number, number, number];
            color: string;
            windowRows: number;
            windowCols: number;
            litWindows: boolean[];
            hasDamage: boolean;
            damagePos: [number, number, number];
            damageSize: [number, number, number];
            hasMoss: boolean;
            mossY: number;
            hasAntenna: boolean;
            hasStep: boolean;
            stepSize: [number, number, number];
            stepOffset: [number, number];
        }> = [];

        for (let i = 0; i < 80; i++) {
            const angle = (i / 80) * Math.PI * 2 + rand() * 0.3;
            const dist = 35 + rand() * 85;
            const width = 3 + rand() * 9;
            const depth = 3 + rand() * 9;
            const height = 8 + rand() * 40;
            const submerge = rand() * height * 0.35;

            const windowRows = Math.floor(height / 3);
            const windowCols = Math.floor(width / 2.5);
            const litWindows: boolean[] = [];
            for (let w = 0; w < windowRows * windowCols; w++) {
                litWindows.push(rand() > 0.75);
            }

            // Stepped building extension for shape variation (~30%)
            const hasStep = rand() > 0.7;
            const stepWidth = width * (0.3 + rand() * 0.4);
            const stepDepth = depth * (0.3 + rand() * 0.4);
            const stepHeight = height * (0.2 + rand() * 0.3);
            const stepOffsetX = (rand() - 0.5) * (width - stepWidth) * 0.8;
            const stepOffsetZ = (rand() - 0.5) * (depth - stepDepth) * 0.8;

            result.push({
                pos: [
                    Math.cos(angle) * dist,
                    height / 2 - submerge - 2,
                    Math.sin(angle) * dist,
                ],
                size: [width, height, depth],
                color: `hsl(${200 + rand() * 25}, ${8 + rand() * 12}%, ${6 + rand() * 10}%)`,
                windowRows,
                windowCols,
                litWindows,
                hasDamage: rand() > 0.65,
                damagePos: [
                    (rand() - 0.5) * width * 0.6,
                    (rand() - 0.3) * height * 0.3,
                    depth / 2 + 0.1,
                ],
                damageSize: [1 + rand() * 3, 1 + rand() * 4, 0.8 + rand()],
                hasMoss: rand() > 0.45, // more vegetation
                mossY: height * (0.2 + rand() * 0.3),
                hasAntenna: rand() > 0.7,
                hasStep,
                stepSize: [stepWidth, stepHeight, stepDepth] as [number, number, number],
                stepOffset: [stepOffsetX, stepOffsetZ] as [number, number],
            });
        }
        return result;
    }, []);

    return (
        <group>
            {buildingData.map((b, i) => (
                <group key={i} position={b.pos}>
                    {/* Building body — procedural concrete/grime shader */}
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={b.size} />
                        <shaderMaterial
                            uniforms={{
                                uBaseColor: { value: new THREE.Color(b.color) },
                                uSeed: { value: i * 7.31 },
                                uFogColor: { value: new THREE.Color('#0a0f18') },
                                uFogNear: { value: 30.0 },
                                uFogFar: { value: 130.0 },
                            }}
                            vertexShader={`
                                varying vec3 vWorldPos;
                                varying vec3 vNormal;
                                varying float vFogDepth;
                                void main() {
                                    vNormal = normalMatrix * normal;
                                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                                    vWorldPos = worldPos.xyz;
                                    vec4 mvPos = viewMatrix * worldPos;
                                    vFogDepth = -mvPos.z;
                                    gl_Position = projectionMatrix * mvPos;
                                }
                            `}
                            fragmentShader={`
                                uniform vec3 uBaseColor;
                                uniform float uSeed;
                                uniform vec3 uFogColor;
                                uniform float uFogNear;
                                uniform float uFogFar;
                                varying vec3 vWorldPos;
                                varying vec3 vNormal;
                                varying float vFogDepth;

                                float hash(vec2 p) {
                                    return fract(sin(dot(p + uSeed, vec2(127.1, 311.7))) * 43758.5453);
                                }
                                float noise(vec2 p) {
                                    vec2 i = floor(p); vec2 f = fract(p);
                                    f = f * f * (3.0 - 2.0 * f);
                                    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                                               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
                                }

                                void main() {
                                    vec3 color = uBaseColor;

                                    // Per-face UV projection: project world coords
                                    // onto the plane of each face using the normal
                                    vec3 absN = abs(vNormal);
                                    vec2 faceUV;
                                    if (absN.x > absN.y && absN.x > absN.z) {
                                        // X-facing wall → use YZ
                                        faceUV = vWorldPos.yz;
                                    } else if (absN.z > absN.y) {
                                        // Z-facing wall → use XY
                                        faceUV = vWorldPos.xy;
                                    } else {
                                        // Top/bottom → use XZ
                                        faceUV = vWorldPos.xz;
                                    }

                                    // Fine concrete aggregate grain (sub-meter detail)
                                    float fineGrain = noise(faceUV * 6.0) * 0.04;
                                    color += fineGrain;

                                    // Large tonal variation across facade (multi-meter, very subtle)
                                    float tonal = noise(faceUV * 0.3 + uSeed * 0.1);
                                    color = mix(color, color * 0.85, tonal * 0.15);

                                    // Vertical water/rain stains (narrow streaks)
                                    // faceUV.x = horizontal on-face, faceUV.y or vWorldPos.y = vertical
                                    float stainU = faceUV.x * 1.5 + uSeed;
                                    float stain = noise(vec2(stainU, vWorldPos.y * 0.15));
                                    stain = smoothstep(0.45, 0.65, stain);
                                    float stainMask = smoothstep(0.0, 8.0, vWorldPos.y);
                                    color = mix(color, color * 0.75, stain * stainMask * 0.2);

                                    // Rust patches — cold, dark, sparse
                                    float rust = noise(faceUV * 1.2 + uSeed * 0.7);
                                    rust = smoothstep(0.72, 0.85, rust);
                                    vec3 rustColor = vec3(0.08, 0.04, 0.04);
                                    color = mix(color, rustColor, rust * 0.10);

                                    // Wet darkening near waterline
                                    float wetZone = 1.0 - smoothstep(-2.0, 4.0, vWorldPos.y);
                                    color = mix(color, color * 0.7, wetZone * 0.4);

                                    // Subtle floor separation lines
                                    float floorLine = abs(fract(vWorldPos.y * 0.33) - 0.5);
                                    floorLine = smoothstep(0.47, 0.5, floorLine);
                                    color = mix(color, color * 0.85, floorLine * 0.06);

                                    // Ambient occlusion: DARKEN top face to prevent blowout
                                    float topFace = max(dot(vNormal, vec3(0.0, 1.0, 0.0)), 0.0);
                                    float ao = 1.0 - topFace * 0.4; // top faces get darkened
                                    // Slight edge darkening on walls
                                    ao *= 0.85 + abs(dot(vNormal, vec3(0.0, 1.0, 0.0))) * 0.15;
                                    color *= ao;

                                    // Fog integration
                                    float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
                                    color = mix(color, uFogColor, fogFactor);

                                    gl_FragColor = vec4(color, 1.0);
                                }
                            `}
                        />
                    </mesh>
                    {/* Emissive windows on ALL 4 vertical faces */}
                    {b.windowRows > 0 && b.windowCols > 0 && (() => {
                        const windows: JSX.Element[] = [];
                        const [w, h, d] = b.size;

                        // Each face: position axis for the flush surface,
                        // and the two axes for distributing windows
                        const faces = [
                            { // +X face (right side)
                                flushAxis: 'x' as const, flushVal: w / 2 + 0.03,
                                spanAxis: 'z' as const, spanSize: d,
                                rotY: Math.PI / 2,
                            },
                            { // -X face (left side)
                                flushAxis: 'x' as const, flushVal: -w / 2 - 0.03,
                                spanAxis: 'z' as const, spanSize: d,
                                rotY: -Math.PI / 2,
                            },
                            { // +Z face (front)
                                flushAxis: 'z' as const, flushVal: d / 2 + 0.03,
                                spanAxis: 'x' as const, spanSize: w,
                                rotY: 0,
                            },
                            { // -Z face (back)
                                flushAxis: 'z' as const, flushVal: -d / 2 - 0.03,
                                spanAxis: 'x' as const, spanSize: w,
                                rotY: Math.PI,
                            },
                        ];

                        let wIdx = 0;
                        for (let fi = 0; fi < faces.length; fi++) {
                            const face = faces[fi];
                            const cols = Math.max(1, Math.floor(face.spanSize / 2.5));
                            const rows = Math.max(1, Math.floor(h / 3.5));

                            for (let r = 0; r < rows; r++) {
                                for (let c = 0; c < cols; c++) {
                                    const litIdx = (wIdx + r * cols + c + fi * 7) % b.litWindows.length;
                                    if (!b.litWindows[litIdx]) { wIdx++; continue; }

                                    const wy = -h / 2 + 2.5 + r * 3.2;
                                    const spanOffset = -face.spanSize / 2 + 1.2 + c * (face.spanSize / cols);

                                    // Color
                                    const temp = (r + c + i + fi) % 5;
                                    const winColor = temp === 0 ? '#aa8844'
                                        : temp < 3 ? '#2244aa' : '#887755';
                                    const winOpacity = temp === 0 ? 0.7
                                        : temp < 3 ? 0.3 : 0.45;

                                    // Position: set the flush axis and span axis explicitly
                                    const pos: [number, number, number] = [0, wy, 0];
                                    if (face.flushAxis === 'x') {
                                        pos[0] = face.flushVal;
                                        pos[2] = spanOffset;
                                    } else {
                                        pos[2] = face.flushVal;
                                        pos[0] = spanOffset;
                                    }

                                    windows.push(
                                        <mesh
                                            key={`w-${i}-${fi}-${r}-${c}`}
                                            position={pos}
                                            rotation={[0, face.rotY, 0]}
                                        >
                                            <planeGeometry args={[1.0, 1.5]} />
                                            <meshBasicMaterial
                                                color={winColor}
                                                transparent
                                                opacity={winOpacity}
                                            />
                                        </mesh>
                                    );
                                    wIdx++;
                                }
                            }
                        }
                        return windows;
                    })()}

                    {/* Damage chunk — missing section */}
                    {b.hasDamage && (
                        <mesh position={b.damagePos}>
                            <boxGeometry args={b.damageSize} />
                            <meshBasicMaterial color="#060810" />
                        </mesh>
                    )}

                    {/* Ivy / climbing vegetation — VISIBLE bright strips */}
                    {b.hasMoss && (() => {
                        const ivyStrips: JSX.Element[] = [];
                        const ivyCount = 2 + Math.floor(((i * 13) % 7) / 2);
                        for (let iv = 0; iv < ivyCount; iv++) {
                            const ivX = (((i * 17 + iv * 31) % 100) / 100 - 0.5) * b.size[0] * 0.7;
                            const ivHeight = b.mossY * 0.8 + iv * 3;
                            const faceZ = iv % 2 === 0 ? b.size[2] / 2 + 0.05 : -b.size[2] / 2 - 0.05;
                            // Main ivy strip
                            ivyStrips.push(
                                <mesh key={`ivy-${i}-${iv}`} position={[ivX, -b.size[1] / 2 + ivHeight / 2 + 1, faceZ]}>
                                    <boxGeometry args={[1.2 + iv * 0.5, ivHeight, 0.15]} />
                                    <meshBasicMaterial color="#0a2a0a" />
                                </mesh>
                            );
                            // Hanging vine tendril below the ivy
                            if (iv < 2) {
                                ivyStrips.push(
                                    <mesh key={`vine-${i}-${iv}`} position={[ivX + 0.3, -b.size[1] / 2 + 1.5, faceZ]}>
                                        <boxGeometry args={[0.15, 3 + iv * 2, 0.08]} />
                                        <meshBasicMaterial color="#082208" />
                                    </mesh>
                                );
                            }
                        }
                        return ivyStrips;
                    })()}

                    {/* Rooftop vegetation — visible against dark rooftops */}
                    {b.hasMoss && (
                        <group position={[0, b.size[1] / 2 + 0.05, 0]}>
                            {/* Main grass patch */}
                            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                                <planeGeometry args={[
                                    Math.min(b.size[0] * 0.5, 3 + (i % 3)),
                                    Math.min(b.size[2] * 0.5, 3 + ((i * 3) % 4)),
                                ]} />
                                <meshBasicMaterial color="#0c2a0c" side={THREE.DoubleSide} />
                            </mesh>
                            {/* Single small bush — only on some buildings */}
                            {i % 4 === 0 && (
                                <mesh position={[0, 0.2, 0]}>
                                    <sphereGeometry args={[0.35, 4, 3]} />
                                    <meshBasicMaterial color="#0a200a" />
                                </mesh>
                            )}
                        </group>
                    )}

                    {/* Stepped building extension for L/T shape variation */}
                    {b.hasStep && (
                        <mesh
                            position={[
                                b.stepOffset[0],
                                b.size[1] / 2 + b.stepSize[1] / 2,
                                b.stepOffset[1],
                            ]}
                        >
                            <boxGeometry args={b.stepSize} />
                            <meshBasicMaterial color="#0a0e14" />
                        </mesh>
                    )}

                    {/* Antenna */}
                    {b.hasAntenna && (
                        <mesh position={[0, b.size[1] / 2 + 1.5, 0]}>
                            <cylinderGeometry args={[0.04, 0.04, 3, 4]} />
                            <meshBasicMaterial color="#111418" />
                        </mesh>
                    )}
                </group>
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
 * Tower platforms with rooftop details — gardens, barrels, solar panels.
 */
export function CinematicTowers() {
    const towerWidth = 10;
    const towerHeight = 22;
    const bridgeStartX = -(14 * 2.5) / 2;
    const bridgeEndX = (14 * 2.5) / 2;

    return (
        <group>
            {/* Source tower */}
            <group position={[bridgeStartX - towerWidth / 2 - 0.5, towerHeight / 2 - 2, 0]}>
                <mesh>
                    <boxGeometry args={[towerWidth, towerHeight, towerWidth]} />
                    <meshBasicMaterial color="#0e1518" />
                </mesh>
                {/* Window grid */}
                {Array.from({ length: 6 }, (_, row) =>
                    Array.from({ length: 3 }, (_, col) => (
                        <mesh
                            key={`win-${row}-${col}`}
                            position={[
                                towerWidth / 2 + 0.01,
                                -towerHeight / 2 + 3 + row * 3,
                                -3 + col * 3,
                            ]}
                        >
                            <planeGeometry args={[1.2, 1.8]} />
                            <meshBasicMaterial
                                color={Math.random() > 0.7 ? '#1a2a15' : '#0a0f14'}
                                transparent
                                opacity={0.6}
                            />
                        </mesh>
                    ))
                )}
                {/* Rooftop garden */}
                <mesh position={[0, towerHeight / 2 + 0.15, -1]}>
                    <boxGeometry args={[3, 0.3, 2]} />
                    <meshBasicMaterial color="#0a1a0a" />
                </mesh>
                {/* Solar panel */}
                <mesh position={[2, towerHeight / 2 + 0.5, 2]} rotation={[0.3, 0, 0]}>
                    <boxGeometry args={[2, 0.05, 1.5]} />
                    <meshBasicMaterial color="#0a1520" />
                </mesh>
                {/* Barrel */}
                <mesh position={[-2, towerHeight / 2 + 0.4, 3]}>
                    <cylinderGeometry args={[0.3, 0.3, 0.8, 8]} />
                    <meshBasicMaterial color="#1a100a" />
                </mesh>
                {/* Antenna */}
                <mesh position={[3, towerHeight / 2 + 2, -3]}>
                    <cylinderGeometry args={[0.03, 0.03, 4, 4]} />
                    <meshBasicMaterial color="#181818" />
                </mesh>
            </group>

            {/* Destination tower */}
            <group position={[bridgeEndX + towerWidth / 2 + 0.5, towerHeight / 2 - 2, 0]}>
                <mesh>
                    <boxGeometry args={[towerWidth, towerHeight, towerWidth]} />
                    <meshBasicMaterial color="#0e1518" />
                </mesh>
                {/* Tarp/shelter on roof */}
                <mesh position={[0, towerHeight / 2 + 1, 0]} rotation={[0, 0.3, 0.1]}>
                    <boxGeometry args={[4, 0.02, 3]} />
                    <meshBasicMaterial
                        color="#0f1f0f"
                        transparent
                        opacity={0.7}
                        side={THREE.DoubleSide}
                    />
                </mesh>
                {/* Crates */}
                <mesh position={[-1, towerHeight / 2 + 0.35, 2]}>
                    <boxGeometry args={[0.7, 0.7, 0.7]} />
                    <meshBasicMaterial color="#15100a" />
                </mesh>
                <mesh position={[-0.3, towerHeight / 2 + 0.25, 2.5]}>
                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                    <meshBasicMaterial color="#1a150f" />
                </mesh>
            </group>
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
