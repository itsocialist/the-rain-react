import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { inputManager } from './InputManager';
import { useGameStore, BRIDGE_Y } from '../stores/gameStore';

const MAX_SPEED = 3;
const ACCELERATION = 15;
const DECELERATION = 25;
const GRIP_PROXIMITY = 0.5;
const GRIP_DRAIN_BASE = 0.4;
const GRIP_RECHARGE_RATE = 0.6;
const FALL_THRESHOLD = BRIDGE_Y - 10;

export function PlayerController() {
    const rigidBodyRef = useRef<RapierRigidBody>(null);
    const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
    const meshRef = useRef<THREE.Mesh>(null);

    const setPlayerPosition = useGameStore((s) => s.setPlayerPosition);
    const setPlayerMode = useGameStore((s) => s.setPlayerMode);
    const drainGrip = useGameStore((s) => s.drainGrip);
    const rechargeGrip = useGameStore((s) => s.rechargeGrip);
    const playerDied = useGameStore((s) => s.playerDied);
    const respawn = useGameStore((s) => s.respawn);
    const setLastSafePosition = useGameStore((s) => s.setLastSafePosition);

    // Respawn when falling below threshold
    useFrame((_, delta) => {
        const rb = rigidBodyRef.current;
        if (!rb) return;

        const dt = Math.min(delta, 0.05); // clamp delta
        const input = inputManager.getInput();
        const pos = rb.translation();
        const store = useGameStore.getState();

        // ── Fall detection ──────────────────────────────────────────────
        if (pos.y < FALL_THRESHOLD) {
            if (store.player.mode !== 'falling') {
                playerDied();
            }
            // Wait a beat then respawn
            setTimeout(() => respawn(), 500);
            return;
        }

        // ── Ground check (simplified: Y-position proximity) ─────────────
        // Simplified ground check: if player Y is close to bridge Y, they're grounded
        const isGrounded = Math.abs(pos.y - (BRIDGE_Y + 1.2)) < 0.8;

        // ── Movement ────────────────────────────────────────────────────
        const targetVel = new THREE.Vector3(input.direction.x, 0, input.direction.z);
        const hasInput = targetVel.length() > 0.1;

        if (hasInput) {
            targetVel.normalize().multiplyScalar(MAX_SPEED);
        }

        // Acceleration / deceleration
        const accel = hasInput ? ACCELERATION : DECELERATION;
        velocityRef.current.lerp(
            hasInput ? targetVel : new THREE.Vector3(0, 0, 0),
            1 - Math.exp(-accel * dt)
        );

        // ── Wind force ──────────────────────────────────────────────────
        const weather = store.weather;
        const difficulty = store.difficulty;
        const windVec = new THREE.Vector3(
            weather.windDirection[0],
            0,
            weather.windDirection[2]
        ).multiplyScalar(weather.windSpeed * difficulty.windMultiplier * 0.1);

        // Exposure factor: 1.0 on bridge, reduced otherwise
        const exposureFactor = 1.0;
        velocityRef.current.add(windVec.multiplyScalar(exposureFactor * dt));

        // ── Grip mechanic ───────────────────────────────────────────────
        if (isGrounded) {
            // Recharge grip when on solid ground
            rechargeGrip(GRIP_RECHARGE_RATE * dt);
            if (store.player.mode !== 'traverse') {
                setPlayerMode('traverse');
            }
            // Update last safe position
            setLastSafePosition([pos.x, pos.y, pos.z]);
        } else if (store.player.mode !== 'falling') {
            // Not grounded — check grip proximity (simplified: proximity to any surface)
            const nearSurface = Math.abs(pos.y - (BRIDGE_Y + 1.2)) < GRIP_PROXIMITY + 0.8;
            if (nearSurface && store.player.grip > 0) {
                setPlayerMode('grip');
                const drainRate = GRIP_DRAIN_BASE * weather.intensity * difficulty.gripMultiplier;
                drainGrip(drainRate * dt);

                if (store.player.grip <= 0) {
                    setPlayerMode('falling');
                }
            } else {
                setPlayerMode('falling');
            }
        }

        // ── Apply movement ──────────────────────────────────────────────
        const currentPos = rb.translation();
        const newX = currentPos.x + velocityRef.current.x * dt;
        const newZ = currentPos.z + velocityRef.current.z * dt;
        const newY = store.player.mode === 'falling'
            ? currentPos.y - 9.81 * dt // simple gravity
            : currentPos.y;

        rb.setNextKinematicTranslation({ x: newX, y: newY, z: newZ });

        // ── Update store ────────────────────────────────────────────────
        setPlayerPosition([newX, newY, newZ]);
    });

    const startPos = useGameStore.getState().player.position;

    return (
        <RigidBody
            ref={rigidBodyRef}
            type="kinematicPosition"
            position={startPos}
            colliders={false}
        >
            <CapsuleCollider args={[0.5, 0.3]} />
            <mesh ref={meshRef} castShadow>
                <capsuleGeometry args={[0.3, 1, 8, 16]} />
                <meshStandardMaterial
                    color="#88aacc"
                    roughness={0.6}
                    metalness={0.2}
                    emissive="#223344"
                    emissiveIntensity={0.15}
                />
            </mesh>
        </RigidBody>
    );
}
