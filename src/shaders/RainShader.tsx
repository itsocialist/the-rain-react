import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/gameStore';

const RAIN_COUNT = 5000;
const RAIN_AREA = 40;      // spread area around player
const RAIN_HEIGHT = 25;     // height of rain spawn above player
const RAIN_LENGTH = 0.3;    // cylinder length
const RAIN_RADIUS = 0.008;  // thin rain drops

// Vertex shader: wind-driven displacement + gravity fall
const rainVertexShader = `
  attribute float instanceSpeed;
  attribute float instanceOffset;

  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uWindDirection;
  uniform float uWindSpeed;
  uniform vec3 uPlayerPosition;

  varying float vAlpha;
  varying float vSpeed;

  void main() {
    vSpeed = instanceSpeed;

    // Base position from instance matrix
    vec4 worldPos = instanceMatrix * vec4(position, 1.0);

    // Center rain around player
    worldPos.x += uPlayerPosition.x;
    worldPos.z += uPlayerPosition.z;

    // Gravity fall (loop)
    float fallSpeed = 8.0 + instanceSpeed * 4.0;
    float y = worldPos.y - mod(uTime * fallSpeed + instanceOffset * 50.0, ${RAIN_HEIGHT.toFixed(1)});
    worldPos.y = y + uPlayerPosition.y + ${(RAIN_HEIGHT / 2).toFixed(1)};

    // Wind displacement
    float windInfluence = uWindSpeed * uIntensity * 0.3;
    worldPos.x += uWindDirection.x * windInfluence * (1.0 - (worldPos.y - uPlayerPosition.y) / ${RAIN_HEIGHT.toFixed(1)});
    worldPos.z += uWindDirection.z * windInfluence * (1.0 - (worldPos.y - uPlayerPosition.y) / ${RAIN_HEIGHT.toFixed(1)});

    // Alpha fade near ground
    float groundDist = worldPos.y - uPlayerPosition.y + 5.0;
    vAlpha = smoothstep(0.0, 3.0, groundDist) * uIntensity;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const rainFragmentShader = `
  varying float vAlpha;
  varying float vSpeed;

  void main() {
    // Pale blue-white rain color with motion blur elongation effect
    vec3 color = mix(vec3(0.7, 0.78, 0.88), vec3(0.9, 0.93, 0.97), vSpeed);
    gl_FragColor = vec4(color, vAlpha * 0.4);
  }
`;

export function RainSystem() {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);

    // Pre-compute instance attributes
    const { speeds, offsets, matrices } = useMemo(() => {
        const speeds = new Float32Array(RAIN_COUNT);
        const offsets = new Float32Array(RAIN_COUNT);
        const matrices = [];
        const dummy = new THREE.Object3D();

        for (let i = 0; i < RAIN_COUNT; i++) {
            speeds[i] = Math.random();
            offsets[i] = Math.random();

            // Random position in rain area
            dummy.position.set(
                (Math.random() - 0.5) * RAIN_AREA,
                Math.random() * RAIN_HEIGHT,
                (Math.random() - 0.5) * RAIN_AREA
            );
            // Slight tilt along wind
            dummy.rotation.set(0, 0, Math.random() * 0.1 - 0.05);
            dummy.updateMatrix();
            matrices.push(dummy.matrix.clone());
        }

        return { speeds, offsets, matrices };
    }, []);

    // Set instance matrices and attributes
    useRef(() => {
        // This runs on first render via the effect below
    });

    // Apply matrices on mount
    useMemo(() => {
        if (!meshRef.current) return;
        matrices.forEach((m, i) => {
            meshRef.current!.setMatrixAt(i, m);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [matrices]);

    // Set instance buffer attributes after mount
    useFrame(() => {
        if (meshRef.current && !meshRef.current.geometry.getAttribute('instanceSpeed')) {
            meshRef.current.geometry.setAttribute(
                'instanceSpeed',
                new THREE.InstancedBufferAttribute(speeds, 1)
            );
            meshRef.current.geometry.setAttribute(
                'instanceOffset',
                new THREE.InstancedBufferAttribute(offsets, 1)
            );
        }
    });

    // Update uniforms every frame
    useFrame(({ clock }) => {
        if (!materialRef.current) return;

        const store = useGameStore.getState();
        const weather = store.weather;
        const player = store.player;

        materialRef.current.uniforms.uTime.value = clock.elapsedTime;
        materialRef.current.uniforms.uIntensity.value = weather.rainDensity;
        materialRef.current.uniforms.uWindDirection.value.set(
            weather.windDirection[0],
            weather.windDirection[1],
            weather.windDirection[2]
        );
        materialRef.current.uniforms.uWindSpeed.value = weather.windSpeed;
        materialRef.current.uniforms.uPlayerPosition.value.set(
            player.position[0],
            player.position[1],
            player.position[2]
        );

        // Set matrices if not set
        if (meshRef.current && !meshRef.current.userData.matricesSet) {
            matrices.forEach((m, i) => {
                meshRef.current!.setMatrixAt(i, m);
            });
            meshRef.current.instanceMatrix.needsUpdate = true;
            meshRef.current.userData.matricesSet = true;
        }
    });

    const uniforms = useMemo(
        () => ({
            uTime: { value: 0 },
            uIntensity: { value: 0.2 },
            uWindDirection: { value: new THREE.Vector3(1, 0, 0.3) },
            uWindSpeed: { value: 0 },
            uPlayerPosition: { value: new THREE.Vector3(0, 20, 0) },
        }),
        []
    );

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, RAIN_COUNT]} frustumCulled={false}>
            <cylinderGeometry args={[RAIN_RADIUS, RAIN_RADIUS, RAIN_LENGTH, 3, 1]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={rainVertexShader}
                fragmentShader={rainFragmentShader}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </instancedMesh>
    );
}
