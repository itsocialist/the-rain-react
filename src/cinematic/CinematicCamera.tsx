import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Cinematic orbit camera — slow reveal of the game world.
 * 
 * Phase 1: Slow pull-back from bridge detail → wide shot
 * Phase 2: Steady orbit around the axis
 */

const ORBIT_RADIUS = 35;
const ORBIT_HEIGHT = 28;
const ORBIT_SPEED = 0.04; // radians per second
const LOOK_TARGET = new THREE.Vector3(0, 18, 0); // center of bridge

export function CinematicCamera() {
    const { camera } = useThree();
    const timeRef = useRef(0);
    const initializedRef = useRef(false);

    useFrame((_, delta) => {
        timeRef.current += delta;
        const t = timeRef.current;

        // Smooth start — ease in from a tighter angle
        const easeIn = 1 - Math.exp(-t * 0.15);
        const radius = 15 + ORBIT_RADIUS * easeIn;
        const height = 22 + (ORBIT_HEIGHT - 22) * easeIn;

        const angle = -Math.PI * 0.6 + t * ORBIT_SPEED;

        camera.position.set(
            Math.cos(angle) * radius,
            height + Math.sin(t * 0.1) * 1.5, // gentle bob
            Math.sin(angle) * radius
        );

        // Smooth look-at with slight vertical oscillation
        const target = LOOK_TARGET.clone();
        target.y += Math.sin(t * 0.15) * 0.5;
        camera.lookAt(target);

        if (!initializedRef.current) {
            initializedRef.current = true;
        }
    });

    return null;
}
