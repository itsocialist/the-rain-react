import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { inputManager } from './InputManager';
import {
    useGameStore,
    BRIDGE_Y,
    BRIDGE_SEGMENT_HEIGHT,
    BRIDGE_SEGMENT_WIDTH,
    BRIDGE_START_X,
    BRIDGE_END_X,
    BRIDGE_SEGMENT_COUNT,
    BRIDGE_SEGMENT_DEPTH,
} from '../stores/gameStore';

const MAX_SPEED = 3;
const ACCELERATION = 15;
const DECELERATION = 25;
const GRIP_DRAIN_BASE = 0.4;
const GRIP_RECHARGE_RATE = 0.6;

// Bridge surface = center of segment + half height
const BRIDGE_SURFACE_Y = BRIDGE_Y + BRIDGE_SEGMENT_HEIGHT / 2;
// Player capsule: half-height=0.5, radius=0.3 → center is 0.8 above surface
const PLAYER_GROUND_Y = BRIDGE_SURFACE_Y + 0.8;
const FALL_THRESHOLD = BRIDGE_Y - 15;

export function PlayerController() {
    const rigidBodyRef = useRef<RapierRigidBody>(null);
    const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
    const meshRef = useRef<THREE.Mesh>(null);
    const fallingVelY = useRef(0);
    const respawnTimerRef = useRef<number | null>(null);

    const setPlayerPosition = useGameStore((s) => s.setPlayerPosition);
    const setPlayerMode = useGameStore((s) => s.setPlayerMode);
    const drainGrip = useGameStore((s) => s.drainGrip);
    const rechargeGrip = useGameStore((s) => s.rechargeGrip);
    const playerDied = useGameStore((s) => s.playerDied);
    const respawn = useGameStore((s) => s.respawn);
    const setLastSafePosition = useGameStore((s) => s.setLastSafePosition);

    useFrame((_, delta) => {
        const rb = rigidBodyRef.current;
        if (!rb) return;

        const dt = Math.min(delta, 0.05);
        const input = inputManager.getInput();
        const pos = rb.translation();
        const store = useGameStore.getState();

        // ── Fall death ──────────────────────────────────────────────────
        if (pos.y < FALL_THRESHOLD) {
            if (store.player.mode !== 'falling') {
                playerDied();
            }
            if (!respawnTimerRef.current) {
                respawnTimerRef.current = window.setTimeout(() => {
                    respawn();
                    fallingVelY.current = 0;
                    respawnTimerRef.current = null;
                }, 800);
            }
            return;
        }

        // ── Ground check — segment-aware ────────────────────────────────
        // Check if player is over an intact bridge segment OR over a tower
        const onTower =
            pos.x < BRIDGE_START_X + 0.5 || pos.x > BRIDGE_END_X - 0.5;
        const withinBridgeZ = Math.abs(pos.z) < BRIDGE_SEGMENT_DEPTH / 2 + 0.5;

        let onIntactSegment = false;
        if (!onTower && withinBridgeZ) {
            const segments = store.level.bridgeSegments;
            for (const seg of segments) {
                if (!seg.intact) continue;
                const segLeft = seg.position[0] - BRIDGE_SEGMENT_WIDTH / 2;
                const segRight = seg.position[0] + BRIDGE_SEGMENT_WIDTH / 2;
                if (pos.x >= segLeft - 0.3 && pos.x <= segRight + 0.3) {
                    onIntactSegment = true;
                    break;
                }
            }
        }

        const hasGroundBelow = onTower || onIntactSegment;
        const isAtGroundLevel = Math.abs(pos.y - PLAYER_GROUND_Y) < 0.5;
        const isGrounded = hasGroundBelow && isAtGroundLevel;

        // ── Movement ────────────────────────────────────────────────────
        const targetVel = new THREE.Vector3(input.direction.x, 0, input.direction.z);
        const hasInput = targetVel.length() > 0.1;

        if (hasInput) {
            targetVel.normalize().multiplyScalar(MAX_SPEED);
        }

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

        const exposureFactor = onTower ? 0.3 : 1.0;
        velocityRef.current.add(windVec.multiplyScalar(exposureFactor * dt));

        // ── Grip / Fall mechanic ────────────────────────────────────────
        if (isGrounded) {
            // Standing on solid ground
            rechargeGrip(GRIP_RECHARGE_RATE * dt);
            fallingVelY.current = 0;
            if (store.player.mode !== 'traverse') {
                setPlayerMode('traverse');
            }
            setLastSafePosition([pos.x, pos.y, pos.z]);
        } else if (!hasGroundBelow && store.player.mode !== 'falling') {
            // Over a gap — check if close enough to grip
            const nearBridgeHeight = Math.abs(pos.y - PLAYER_GROUND_Y) < 2.0;
            if (nearBridgeHeight && store.player.grip > 0 && input.gripAction) {
                // Actively gripping — drain grip
                setPlayerMode('grip');
                const drainRate =
                    GRIP_DRAIN_BASE *
                    Math.max(0.3, weather.intensity) *
                    difficulty.gripMultiplier;
                drainGrip(drainRate * dt);
                fallingVelY.current = 0; // grip arrests fall

                if (store.player.grip <= 0) {
                    setPlayerMode('falling');
                }
            } else {
                // Not gripping or too far → fall
                setPlayerMode('falling');
            }
        } else if (hasGroundBelow && !isAtGroundLevel && pos.y > PLAYER_GROUND_Y) {
            // Above bridge surface (e.g. just spawned) — settle down
            fallingVelY.current = Math.min(fallingVelY.current + 9.81 * dt, 15);
        }

        // ── Apply movement ──────────────────────────────────────────────
        const currentPos = rb.translation();
        let newX = currentPos.x + velocityRef.current.x * dt;
        let newZ = currentPos.z + velocityRef.current.z * dt;
        let newY = currentPos.y;

        // Clamp Z to bridge width
        newZ = Math.max(-BRIDGE_SEGMENT_DEPTH / 2 + 0.5, Math.min(BRIDGE_SEGMENT_DEPTH / 2 - 0.5, newZ));

        // Clamp X to playable area (tower edges)
        const TOWER_WIDTH = 8;
        const MIN_X = BRIDGE_START_X - TOWER_WIDTH + 1;
        const MAX_X = BRIDGE_END_X + TOWER_WIDTH - 1;
        newX = Math.max(MIN_X, Math.min(MAX_X, newX));

        // Kill horizontal velocity if hitting boundary
        if (newX <= MIN_X || newX >= MAX_X) {
            velocityRef.current.x = 0;
        }

        if (store.player.mode === 'falling') {
            fallingVelY.current = Math.min(fallingVelY.current + 9.81 * dt, 20);
            newY -= fallingVelY.current * dt;
        } else if (store.player.mode === 'grip') {
            // Held in place — slight sag for feel
            newY -= 0.1 * dt;
        } else {
            // Grounded — snap to ground level
            newY = THREE.MathUtils.lerp(newY, PLAYER_GROUND_Y, 0.3);
        }

        rb.setNextKinematicTranslation({ x: newX, y: newY, z: newZ });
        setPlayerPosition([newX, newY, newZ]);
    });

    // Spawn on the source tower platform
    const spawnPos: [number, number, number] = [
        BRIDGE_START_X - 2,
        PLAYER_GROUND_Y + 0.5, // slightly above, will settle
        0,
    ];

    return (
        <RigidBody
            ref={rigidBodyRef}
            type="kinematicPosition"
            position={spawnPos}
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
