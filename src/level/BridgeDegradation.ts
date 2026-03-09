import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/gameStore';

const DEGRADE_INTERVAL = 15; // seconds between degradation ticks
const DEGRADE_AMOUNT = 0.25;

export function useBridgeDegradation() {
    const lastDegradeTime = useRef(0);
    const breakSchedule = useRef<Map<number, number>>(new Map()); // segmentId → breakTime

    useFrame(() => {
        const store = useGameStore.getState();
        if (!store.level.started) return;

        const elapsed = store.weather.elapsed;
        const intensity = store.weather.intensity;

        // Scale degradation interval by inverse of weather intensity
        const adjustedInterval = DEGRADE_INTERVAL / Math.max(0.3, intensity);

        if (elapsed - lastDegradeTime.current >= adjustedInterval) {
            lastDegradeTime.current = elapsed;

            // Find intact segments to degrade
            const intactSegments = store.level.bridgeSegments.filter(
                (s) => s.intact && s.health > 0
            );

            if (intactSegments.length > 0) {
                // Degrade a random segment
                const target = intactSegments[Math.floor(Math.random() * intactSegments.length)];
                store.degradeSegment(target.id);

                // If health will reach 0, schedule break with telegraph delay
                const newHealth = Math.max(0, target.health - DEGRADE_AMOUNT);
                if (newHealth <= 0 && !breakSchedule.current.has(target.id)) {
                    // 5-second telegraph before actual break
                    breakSchedule.current.set(target.id, elapsed + 5);
                }
            }
        }

        // Process break schedule
        breakSchedule.current.forEach((breakTime, segmentId) => {
            if (elapsed >= breakTime) {
                store.breakSegment(segmentId);
                breakSchedule.current.delete(segmentId);
            }
        });
    });
}
