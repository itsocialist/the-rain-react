import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import {
    useGameStore,
    BRIDGE_SEGMENT_COUNT,
    BRIDGE_SEGMENT_WIDTH,
    BRIDGE_SEGMENT_HEIGHT,
    BRIDGE_SEGMENT_DEPTH,
    BRIDGE_Y,
} from '../stores/gameStore';

function BridgeSegmentMesh({
    segment,
}: {
    segment: { id: number; intact: boolean; health: number; position: [number, number, number] };
}) {
    const meshRef = useRef<THREE.Mesh>(null);
    const rbRef = useRef<RapierRigidBody>(null);
    const hasFallen = useRef(false);
    const fallTime = useRef(0);

    // Color interpolation based on health
    const healthColor = useMemo(() => new THREE.Color(), []);

    useFrame((_, delta) => {
        if (!meshRef.current) return;

        if (!segment.intact && !hasFallen.current) {
            hasFallen.current = true;
            // Switch to dynamic so it falls
            if (rbRef.current) {
                rbRef.current.setBodyType(0, true); // 0 = Dynamic
                rbRef.current.setGravityScale(1, true);
                rbRef.current.applyImpulse({ x: 0, y: -2, z: 0 }, true);
            }
        }

        // Animate falling segments
        if (hasFallen.current) {
            fallTime.current += delta;
            if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
                meshRef.current.material.opacity = Math.max(0, 1 - fallTime.current * 0.5);
            }
        }

        // Health-based color (green → yellow → red)
        if (segment.intact) {
            const h = segment.health;
            healthColor.setRGB(
                h < 0.5 ? 1 : 1 - (h - 0.5) * 2,
                h > 0.5 ? 0.6 : h * 1.2,
                0.1
            );
            // Blend with base steel color
            const steelColor = new THREE.Color(0x556677);
            healthColor.lerp(steelColor, segment.health);

            if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
                meshRef.current.material.color.copy(healthColor);
            }
        }
    });

    // Pre-broken segments: never render
    if (!segment.intact && !hasFallen.current && fallTime.current === 0) {
        return null;
    }

    // Segments that fell during gameplay: remove after animation
    if (!segment.intact && hasFallen.current && fallTime.current > 3) {
        return null;
    }

    return (
        <RigidBody
            ref={rbRef}
            type="fixed"
            position={segment.position}
            colliders="cuboid"
        >
            <mesh ref={meshRef} castShadow receiveShadow>
                <boxGeometry args={[
                    BRIDGE_SEGMENT_WIDTH - 0.05,
                    BRIDGE_SEGMENT_HEIGHT,
                    BRIDGE_SEGMENT_DEPTH,
                ]} />
                <meshStandardMaterial
                    color="#556677"
                    roughness={0.8}
                    metalness={0.6}
                    transparent
                    opacity={1}
                />
            </mesh>
            {/* Railing beams */}
            <mesh position={[0, 0.6, BRIDGE_SEGMENT_DEPTH / 2 - 0.1]} castShadow>
                <boxGeometry args={[BRIDGE_SEGMENT_WIDTH - 0.1, 1.2, 0.08]} />
                <meshStandardMaterial color="#445566" roughness={0.9} metalness={0.5} />
            </mesh>
            <mesh position={[0, 0.6, -(BRIDGE_SEGMENT_DEPTH / 2 - 0.1)]} castShadow>
                <boxGeometry args={[BRIDGE_SEGMENT_WIDTH - 0.1, 1.2, 0.08]} />
                <meshStandardMaterial color="#445566" roughness={0.9} metalness={0.5} />
            </mesh>
        </RigidBody>
    );
}

export function Skybridge() {
    const segments = useGameStore((s) => s.level.bridgeSegments);

    return (
        <group>
            {segments.map((seg) => (
                <BridgeSegmentMesh key={seg.id} segment={seg} />
            ))}
        </group>
    );
}
