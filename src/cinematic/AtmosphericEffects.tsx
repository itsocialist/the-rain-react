import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Animated volumetric cloud layer above the scene.
 * Uses FBM noise for organic cloud shapes that drift with wind.
 */
export function CloudLayer() {
    const matRef = useRef<THREE.ShaderMaterial>(null);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
    }), []);

    useFrame(({ clock }) => {
        if (matRef.current) matRef.current.uniforms.uTime.value = clock.elapsedTime;
    });

    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        uniform float uTime;
        varying vec2 vUv;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                       mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) {
                v += a * noise(p);
                p = p * 2.1 + vec2(1.7, -0.8);
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = vUv * 4.0;
            // Wind drift
            uv.x += uTime * 0.015;
            uv.y += uTime * 0.005;

            float n = fbm(uv);
            float n2 = fbm(uv * 1.5 + 3.0 + uTime * 0.01);

            float cloud = smoothstep(0.35, 0.65, n * 0.6 + n2 * 0.4);

            // Darker storm clouds with occasional lighter patches
            vec3 darkCloud = vec3(0.06, 0.08, 0.12);
            vec3 lightCloud = vec3(0.14, 0.13, 0.12);
            vec3 color = mix(darkCloud, lightCloud, cloud * 0.5);

            // Edge softness
            float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x)
                           * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);

            float alpha = cloud * 0.7 * edgeFade;

            gl_FragColor = vec4(color, alpha);
        }
    `;

    return (
        <mesh position={[0, 55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[350, 350]} />
            <shaderMaterial
                ref={matRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent
                side={THREE.DoubleSide}
                depthWrite={false}
            />
        </mesh>
    );
}

/**
 * Wind-blown debris particles — leaves, paper scraps, dust.
 * Small instanced quads tumbling through the wind.
 */
const DEBRIS_COUNT = 200;

export function WindDebris() {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dataRef = useRef<{
        positions: Float32Array;
        velocities: Float32Array;
        rotations: Float32Array;
        scales: Float32Array;
    } | null>(null);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Initialize debris data
    useMemo(() => {
        const positions = new Float32Array(DEBRIS_COUNT * 3);
        const velocities = new Float32Array(DEBRIS_COUNT * 3);
        const rotations = new Float32Array(DEBRIS_COUNT * 3);
        const scales = new Float32Array(DEBRIS_COUNT);

        for (let i = 0; i < DEBRIS_COUNT; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 100;
            positions[i3 + 1] = Math.random() * 40 + 5;
            positions[i3 + 2] = (Math.random() - 0.5) * 100;

            velocities[i3] = 2 + Math.random() * 4;     // x: wind push
            velocities[i3 + 1] = -0.5 - Math.random();  // y: slow fall
            velocities[i3 + 2] = (Math.random() - 0.5) * 2;

            rotations[i3] = Math.random() * Math.PI * 2;
            rotations[i3 + 1] = Math.random() * Math.PI * 2;
            rotations[i3 + 2] = (1 + Math.random() * 3) * (Math.random() > 0.5 ? 1 : -1);

            scales[i] = 0.05 + Math.random() * 0.15;
        }

        dataRef.current = { positions, velocities, rotations, scales };
    }, []);

    useFrame((_, delta) => {
        if (!meshRef.current || !dataRef.current) return;
        const { positions, velocities, rotations, scales } = dataRef.current;

        for (let i = 0; i < DEBRIS_COUNT; i++) {
            const i3 = i * 3;

            // Move
            positions[i3] += velocities[i3] * delta;
            positions[i3 + 1] += velocities[i3 + 1] * delta;
            positions[i3 + 2] += velocities[i3 + 2] * delta;

            // Tumble
            rotations[i3] += rotations[i3 + 2] * delta;
            rotations[i3 + 1] += rotations[i3 + 2] * delta * 0.7;

            // Wrap
            if (positions[i3] > 60) positions[i3] = -60;
            if (positions[i3 + 1] < -2) {
                positions[i3 + 1] = 35 + Math.random() * 15;
                positions[i3] = -60 + Math.random() * 20;
            }

            dummy.position.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
            dummy.rotation.set(rotations[i3], rotations[i3 + 1], 0);
            const s = scales[i];
            dummy.scale.set(s, s, s * 0.3);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, DEBRIS_COUNT]} frustumCulled={false}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
                color="#2a2520"
                transparent
                opacity={0.4}
                side={THREE.DoubleSide}
                depthWrite={false}
            />
        </instancedMesh>
    );
}

/**
 * Floating debris on water — crates, barrels, wreckage, flotsam.
 */
export function WaterDebris() {
    const groupRef = useRef<THREE.Group>(null);

    const items = useMemo(() => {
        const result: Array<{
            pos: [number, number, number];
            rot: number;
            type: 'crate' | 'barrel' | 'plank' | 'sheet';
            size: number;
            bobPhase: number;
            driftSpeed: number;
        }> = [];

        const rng = (s: number) => {
            let v = s;
            return () => { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; };
        };
        const rand = rng(77);

        for (let i = 0; i < 40; i++) {
            const types: Array<'crate' | 'barrel' | 'plank' | 'sheet'> = ['crate', 'barrel', 'plank', 'sheet'];
            result.push({
                pos: [
                    (rand() - 0.5) * 120,
                    -1.5 + rand() * 0.5,
                    (rand() - 0.5) * 120,
                ],
                rot: rand() * Math.PI * 2,
                type: types[Math.floor(rand() * types.length)],
                size: 0.3 + rand() * 0.8,
                bobPhase: rand() * Math.PI * 2,
                driftSpeed: 0.1 + rand() * 0.3,
            });
        }
        return result;
    }, []);

    useFrame(({ clock }) => {
        if (!groupRef.current) return;
        const t = clock.elapsedTime;
        groupRef.current.children.forEach((child, i) => {
            if (i >= items.length) return;
            const item = items[i];
            // Bob on water
            child.position.y = item.pos[1] + Math.sin(t * 0.5 + item.bobPhase) * 0.15;
            // Slow drift
            child.position.x = item.pos[0] + Math.sin(t * 0.05 * item.driftSpeed) * 2;
            // Slow rotation
            child.rotation.y = item.rot + t * 0.02 * item.driftSpeed;
            child.rotation.z = Math.sin(t * 0.3 + item.bobPhase) * 0.08;
        });
    });

    return (
        <group ref={groupRef}>
            {items.map((item, i) => {
                switch (item.type) {
                    case 'crate':
                        return (
                            <mesh key={i} position={item.pos} rotation={[0, item.rot, 0.1]}>
                                <boxGeometry args={[item.size, item.size * 0.6, item.size]} />
                                <meshBasicMaterial color="#1a120c" />
                            </mesh>
                        );
                    case 'barrel':
                        return (
                            <mesh key={i} position={item.pos} rotation={[Math.PI / 2, item.rot, 0]}>
                                <cylinderGeometry args={[item.size * 0.3, item.size * 0.3, item.size * 0.8, 6]} />
                                <meshBasicMaterial color="#2a1a10" />
                            </mesh>
                        );
                    case 'plank':
                        return (
                            <mesh key={i} position={item.pos} rotation={[0, item.rot, 0.05]}>
                                <boxGeometry args={[item.size * 2, 0.06, item.size * 0.3]} />
                                <meshBasicMaterial color="#1a150c" />
                            </mesh>
                        );
                    case 'sheet':
                        return (
                            <mesh key={i} position={item.pos} rotation={[0.02, item.rot, 0]}>
                                <planeGeometry args={[item.size * 1.5, item.size]} />
                                <meshBasicMaterial
                                    color="#121810"
                                    transparent
                                    opacity={0.6}
                                    side={THREE.DoubleSide}
                                />
                            </mesh>
                        );
                }
            })}
        </group>
    );
}

/**
 * Secondary bridges / power lines / wires connecting buildings.
 */
export function WireNetwork() {
    const wires = useMemo(() => {
        const result: Array<{
            curve: THREE.CatmullRomCurve3;
            thickness: number;
            color: string;
        }> = [];

        // Power lines between nearby buildings
        const wireConfigs = [
            // Secondary bridge — lower, at angle
            { start: [-25, 15, 8], end: [25, 14, 12], sag: 4, thick: 0.08, col: '#3a3a3a' },
            // Power lines
            { start: [-40, 28, -15], end: [-10, 25, -20], sag: 3, thick: 0.02, col: '#333' },
            { start: [-10, 25, -20], end: [30, 30, -18], sag: 4, thick: 0.02, col: '#333' },
            { start: [15, 32, 20], end: [50, 28, 15], sag: 3, thick: 0.02, col: '#333' },
            { start: [-35, 30, 25], end: [-5, 26, 22], sag: 2.5, thick: 0.02, col: '#333' },
            // Larger cable run
            { start: [-50, 22, 0], end: [50, 20, 5], sag: 8, thick: 0.04, col: '#2a2a2a' },
            // Broken bridge — hangs down
            { start: [-30, 18, -5], end: [-15, 12, -6], sag: 6, thick: 0.06, col: '#4a3a2a' },
            // Cross wires
            { start: [20, 35, -25], end: [45, 30, 10], sag: 5, thick: 0.015, col: '#444' },
            { start: [-20, 33, 30], end: [10, 28, -15], sag: 6, thick: 0.015, col: '#444' },
        ];

        for (const w of wireConfigs) {
            const s = new THREE.Vector3(...w.start as [number, number, number]);
            const e = new THREE.Vector3(...w.end as [number, number, number]);
            const mid = s.clone().lerp(e, 0.5);
            mid.y -= w.sag;

            const points: THREE.Vector3[] = [];
            for (let t = 0; t <= 20; t++) {
                const frac = t / 20;
                const p = new THREE.Vector3().lerpVectors(s, e, frac);
                const sagAmount = Math.sin(frac * Math.PI) * w.sag;
                p.y -= sagAmount;
                points.push(p);
            }

            result.push({
                curve: new THREE.CatmullRomCurve3(points),
                thickness: w.thick,
                color: w.col,
            });
        }
        return result;
    }, []);

    return (
        <group>
            {wires.map((w, i) => (
                <mesh key={i}>
                    <tubeGeometry args={[w.curve, 30, w.thickness, 4, false]} />
                    <meshBasicMaterial color={w.color} />
                </mesh>
            ))}

            {/* Secondary walkway bridge — wider, at an angle */}
            {Array.from({ length: 8 }, (_, i) => {
                const t = i / 8;
                const x = -25 + t * 50;
                const y = 15 - Math.sin(t * Math.PI) * 2;
                const z = 8 + t * 4;
                return (
                    <mesh key={`plank-${i}`} position={[x, y, z]} rotation={[0, 0.15, 0]}>
                        <boxGeometry args={[2.5, 0.08, 2]} />
                        <meshBasicMaterial color="#1a120a" />
                    </mesh>
                );
            })}
        </group>
    );
}

/**
 * Rain splash rings on the water surface.
 * Instanced expanding circles that appear randomly.
 */
const SPLASH_COUNT = 300;

export function RainSplashes() {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dataRef = useRef<{
        positions: Float32Array;
        ages: Float32Array;
        lifetimes: Float32Array;
    } | null>(null);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    useMemo(() => {
        const positions = new Float32Array(SPLASH_COUNT * 3);
        const ages = new Float32Array(SPLASH_COUNT);
        const lifetimes = new Float32Array(SPLASH_COUNT);

        for (let i = 0; i < SPLASH_COUNT; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 120;
            positions[i3 + 1] = -1.8;
            positions[i3 + 2] = (Math.random() - 0.5) * 120;
            ages[i] = Math.random(); // stagger initial ages
            lifetimes[i] = 0.3 + Math.random() * 0.4;
        }

        dataRef.current = { positions, ages, lifetimes };
    }, []);

    useFrame((_, delta) => {
        if (!meshRef.current || !dataRef.current) return;
        const { positions, ages, lifetimes } = dataRef.current;

        for (let i = 0; i < SPLASH_COUNT; i++) {
            const i3 = i * 3;

            ages[i] += delta;
            if (ages[i] >= lifetimes[i]) {
                // Respawn
                ages[i] = 0;
                positions[i3] = (Math.random() - 0.5) * 120;
                positions[i3 + 2] = (Math.random() - 0.5) * 120;
                lifetimes[i] = 0.3 + Math.random() * 0.4;
            }

            const progress = ages[i] / lifetimes[i];
            const scale = progress * (0.3 + Math.random() * 0.1);
            const opacity = 1 - progress; // fade out

            dummy.position.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
            dummy.rotation.set(-Math.PI / 2, 0, 0);
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);

            // Per-instance color with fade — set via color attribute
            // For simplicity, use uniform opacity and let scale do the visual work
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, SPLASH_COUNT]} frustumCulled={false}>
            <ringGeometry args={[0.6, 1.0, 16]} />
            <meshBasicMaterial
                color="#445566"
                transparent
                opacity={0.3}
                side={THREE.DoubleSide}
                depthWrite={false}
            />
        </instancedMesh>
    );
}

/**
 * Height-based fog layer — dense at water surface, clear at bridge level, hazy above.
 * Rendered as a large semi-transparent plane hugging the water.
 */
export function HeightFog() {
    const matRef = useRef<THREE.ShaderMaterial>(null);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
    }), []);

    useFrame(({ clock }) => {
        if (matRef.current) matRef.current.uniforms.uTime.value = clock.elapsedTime;
    });

    return (
        <>
            {/* Low fog bank sitting on the water surface */}
            <mesh position={[0, 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[350, 350]} />
                <shaderMaterial
                    ref={matRef}
                    uniforms={uniforms}
                    transparent
                    depthWrite={false}
                    side={THREE.DoubleSide}
                    vertexShader={`
                        varying vec2 vUv;
                        varying float vFogDepth;
                        void main() {
                            vUv = uv;
                            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                            vFogDepth = -mvPos.z;
                            gl_Position = projectionMatrix * mvPos;
                        }
                    `}
                    fragmentShader={`
                        uniform float uTime;
                        varying vec2 vUv;
                        varying float vFogDepth;

                        float hash(vec2 p) {
                            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                        }
                        float noise(vec2 p) {
                            vec2 i = floor(p); vec2 f = fract(p);
                            f = f * f * (3.0 - 2.0 * f);
                            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                                       mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
                        }

                        void main() {
                            vec2 uv = vUv * 3.0;
                            uv.x += uTime * 0.008;
                            uv.y += uTime * 0.003;

                            float n = noise(uv * 2.0) * 0.6 + noise(uv * 4.0 + 3.0) * 0.4;

                            // Fog is denser in middle, fades at edges
                            float edgeFade = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x)
                                           * smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);

                            // Distance fade — fog is most visible at mid-range
                            float distFade = smoothstep(5.0, 30.0, vFogDepth) * smoothstep(250.0, 80.0, vFogDepth);

                            vec3 fogColor = vec3(0.08, 0.10, 0.14);
                            float alpha = n * 0.55 * edgeFade * distFade;

                            gl_FragColor = vec4(fogColor, alpha);
                        }
                    `}
                />
            </mesh>

            {/* Second fog layer slightly higher — thinner mist */}
            <mesh position={[0, 8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[300, 300]} />
                <meshBasicMaterial
                    color="#0a0e18"
                    transparent
                    opacity={0.18}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                />
            </mesh>
        </>
    );
}

