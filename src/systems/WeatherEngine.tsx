import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/gameStore';

/**
 * WeatherEngine — Scripted weather cycle for PoC.
 * Updates the weather slice in the Zustand store each frame.
 * No neural network — just a deterministic sine-based ramp.
 */
export function WeatherEngine() {
    useFrame((_, delta) => {
        const store = useGameStore.getState();
        if (!store.level.started) return;
        store.updateWeather(Math.min(delta, 0.05));
    });

    return null;
}
