import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import {
    BRIDGE_START_X,
    BRIDGE_Y,
    BRIDGE_SEGMENT_COUNT,
    BRIDGE_SEGMENT_WIDTH,
} from '../stores/gameStore';

const TOWER_WIDTH = 8;
const TOWER_HEIGHT = 40;
const TOWER_DEPTH = 8;

function Tower({ position, label }: { position: [number, number, number]; label: string }) {
    return (
        <RigidBody type="fixed" position={position} colliders="cuboid">
            <mesh castShadow receiveShadow>
                <boxGeometry args={[TOWER_WIDTH, TOWER_HEIGHT, TOWER_DEPTH]} />
                <meshStandardMaterial
                    color="#2a3040"
                    roughness={0.85}
                    metalness={0.4}
                />
            </mesh>
            {/* Window grid pattern */}
            {Array.from({ length: 8 }).map((_, row) =>
                Array.from({ length: 3 }).map((_, col) => (
                    <mesh
                        key={`${row}-${col}`}
                        position={[
                            -2 + col * 2,
                            -TOWER_HEIGHT / 2 + 4 + row * 4.5,
                            TOWER_DEPTH / 2 + 0.01,
                        ]}
                    >
                        <planeGeometry args={[1.2, 2]} />
                        <meshStandardMaterial
                            color="#1a2535"
                            emissive="#334455"
                            emissiveIntensity={Math.random() * 0.3 + 0.1}
                            roughness={0.3}
                            metalness={0.8}
                        />
                    </mesh>
                ))
            )}
            {/* Roof platform */}
            <mesh position={[0, TOWER_HEIGHT / 2 + 0.25, 0]} receiveShadow>
                <boxGeometry args={[TOWER_WIDTH + 1, 0.5, TOWER_DEPTH + 1]} />
                <meshStandardMaterial color="#1e2530" roughness={0.9} metalness={0.3} />
            </mesh>
        </RigidBody>
    );
}

export function Towers() {
    const bridgeEnd = BRIDGE_START_X + BRIDGE_SEGMENT_COUNT * BRIDGE_SEGMENT_WIDTH;

    return (
        <group>
            {/* Source tower (left) */}
            <Tower
                position={[BRIDGE_START_X - TOWER_WIDTH / 2 - 0.5, BRIDGE_Y - 0.25, 0]}
                label="Source Tower"
            />
            {/* Destination tower (right) */}
            <Tower
                position={[bridgeEnd + TOWER_WIDTH / 2 + 0.5, BRIDGE_Y - 0.25, 0]}
                label="Destination Tower"
            />
        </group>
    );
}
