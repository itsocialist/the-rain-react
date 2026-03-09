import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/gameStore';

const OFFSET = new THREE.Vector3(0, 3, 8); // behind and above
const LOOK_OFFSET = new THREE.Vector3(0, 1, 0);
const SMOOTH_SPEED = 4;

export function CameraRig() {
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);
    const targetPos = useRef(new THREE.Vector3());
    const currentPos = useRef(new THREE.Vector3(0, 25, 10));

    useFrame(({ camera }, delta) => {
        const store = useGameStore.getState();
        const playerPos = new THREE.Vector3(...store.player.position);

        // Target camera position: behind and above player
        targetPos.current.copy(playerPos).add(OFFSET);

        // Subtle wind sway on camera
        const weather = store.weather;
        const swayX = Math.sin(weather.elapsed * 1.3) * weather.intensity * 0.15;
        const swayY = Math.cos(weather.elapsed * 0.7) * weather.intensity * 0.08;
        targetPos.current.x += swayX;
        targetPos.current.y += swayY;

        // Smooth follow
        const dt = Math.min(delta, 0.05);
        currentPos.current.lerp(targetPos.current, 1 - Math.exp(-SMOOTH_SPEED * dt));

        camera.position.copy(currentPos.current);
        camera.lookAt(playerPos.clone().add(LOOK_OFFSET));

        // FOV ramp for vertigo effect (widen when near bridge gaps)
        // TODO: Detect gap proximity for Phase 3
        const baseFOV = 65;
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = THREE.MathUtils.lerp(camera.fov, baseFOV, 0.1);
            camera.updateProjectionMatrix();
        }
    });

    return null;
}
