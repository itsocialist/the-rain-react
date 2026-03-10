import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Enhanced cinematic rain — denser, more atmospheric than gameplay rain.
 * No player-tracking, fixed area coverage for the showcase.
 */

const RAIN_COUNT = 8000;
const RAIN_AREA = 80;
const RAIN_HEIGHT = 35;

const vertexShader = `
    attribute float instanceSpeed;
    attribute float instanceOffset;

    uniform float uTime;

    varying float vAlpha;
    varying float vSpeed;

    void main() {
        vSpeed = instanceSpeed;

        vec4 worldPos = instanceMatrix * vec4(position, 1.0);

        // Gravity fall (loop)
        float fallSpeed = 18.0 + instanceSpeed * 10.0;
        float y = worldPos.y - mod(uTime * fallSpeed + instanceOffset * 60.0, ${RAIN_HEIGHT.toFixed(1)});
        worldPos.y = y + ${(RAIN_HEIGHT / 2).toFixed(1)} + 10.0;

        // Wind push — aggressive storm wind
        float windStr = 5.0;
        worldPos.x += windStr * (1.0 - worldPos.y / ${RAIN_HEIGHT.toFixed(1)}) * 0.4;
        worldPos.z += windStr * 0.2 * sin(uTime * 0.7 + worldPos.x * 0.1);

        // Alpha — fade near edges
        float edgeDist = length(worldPos.xz) / ${(RAIN_AREA / 2).toFixed(1)};
        vAlpha = smoothstep(1.0, 0.6, edgeDist) * 0.7;

        // Ground fade
        float groundDist = worldPos.y + 2.0;
        vAlpha *= smoothstep(-2.0, 5.0, groundDist);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

const fragmentShader = `
    varying float vAlpha;
    varying float vSpeed;

    void main() {
        vec3 color = mix(vec3(0.6, 0.7, 0.82), vec3(0.85, 0.88, 0.95), vSpeed);
        gl_FragColor = vec4(color, vAlpha * 0.35);
    }
`;

export function CinematicRain() {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    const { speeds, offsets, matrices } = useMemo(() => {
        const speeds = new Float32Array(RAIN_COUNT);
        const offsets = new Float32Array(RAIN_COUNT);
        const matrices: THREE.Matrix4[] = [];
        const dummy = new THREE.Object3D();

        for (let i = 0; i < RAIN_COUNT; i++) {
            speeds[i] = Math.random();
            offsets[i] = Math.random();

            dummy.position.set(
                (Math.random() - 0.5) * RAIN_AREA,
                Math.random() * RAIN_HEIGHT,
                (Math.random() - 0.5) * RAIN_AREA
            );
            dummy.rotation.set(0, 0, Math.random() * 0.15 - 0.075);
            dummy.updateMatrix();
            matrices.push(dummy.matrix.clone());
        }

        return { speeds, offsets, matrices };
    }, []);

    // Set matrices + attributes
    useFrame(({ clock }) => {
        if (!meshRef.current) return;

        if (!meshRef.current.userData.init) {
            matrices.forEach((m, i) => meshRef.current!.setMatrixAt(i, m));
            meshRef.current.instanceMatrix.needsUpdate = true;

            meshRef.current.geometry.setAttribute(
                'instanceSpeed',
                new THREE.InstancedBufferAttribute(speeds, 1)
            );
            meshRef.current.geometry.setAttribute(
                'instanceOffset',
                new THREE.InstancedBufferAttribute(offsets, 1)
            );
            meshRef.current.userData.init = true;
        }

        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = clock.elapsedTime;
        }
    });

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
    }), []);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, RAIN_COUNT]} frustumCulled={false}>
            <cylinderGeometry args={[0.005, 0.005, 0.6, 3, 1]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </instancedMesh>
    );
}
