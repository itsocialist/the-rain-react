import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/gameStore';

/**
 * AIDirector — Heuristic difficulty for PoC.
 * Phase 4 will replace this with TF.js LSTM inference.
 * For now: simple rule-based adaptive difficulty.
 */

const INFERENCE_INTERVAL = 2; // seconds
const MIN_MULTIPLIER = 0.4;
const MAX_MULTIPLIER = 1.6;
const EASE_RATE = 0.05;    // how fast difficulty drops
const RAMP_RATE = 0.03;    // how fast difficulty increases

export function AIDirector() {
    const lastInferenceTime = useRef(0);
    const recentDeaths = useRef<number[]>([]); // timestamps of recent deaths

    // Track deaths
    useEffect(() => {
        const unsub = useGameStore.subscribe(
            (s) => s.player.deaths,
            (deaths) => {
                recentDeaths.current.push(Date.now());
                // Keep only last 30s of deaths
                const cutoff = Date.now() - 30000;
                recentDeaths.current = recentDeaths.current.filter((t) => t >= cutoff);
            }
        );
        return unsub;
    }, []);

    useFrame(() => {
        const store = useGameStore.getState();
        if (!store.level.started) return;

        const elapsed = store.weather.elapsed;
        if (elapsed - lastInferenceTime.current < INFERENCE_INTERVAL) return;
        lastInferenceTime.current = elapsed;

        const { difficulty, player } = store;

        // Count recent deaths (last 30s)
        const cutoff = Date.now() - 30000;
        const recentDeathCount = recentDeaths.current.filter((t) => t >= cutoff).length;

        // Compute tension estimate (0..1)
        // Low grip + many deaths = high tension → ease off
        // High grip + few deaths = low tension → ramp up
        const gripTension = 1 - player.grip;
        const deathTension = Math.min(recentDeathCount / 5, 1);
        const tensionScore = gripTension * 0.6 + deathTension * 0.4;

        // Target tension: 0.65 (from spec)
        const TARGET_TENSION = 0.65;
        const tensionDelta = tensionScore - TARGET_TENSION;

        let gripMultiplier = difficulty.gripMultiplier;
        let windMultiplier = difficulty.windMultiplier;

        if (tensionDelta > 0.1) {
            // Too tense → ease off
            gripMultiplier = Math.max(MIN_MULTIPLIER, gripMultiplier - EASE_RATE);
            windMultiplier = Math.max(MIN_MULTIPLIER, windMultiplier - EASE_RATE);
        } else if (tensionDelta < -0.1) {
            // Too easy → ramp up
            gripMultiplier = Math.min(MAX_MULTIPLIER, gripMultiplier + RAMP_RATE);
            windMultiplier = Math.min(MAX_MULTIPLIER, windMultiplier + RAMP_RATE);
        }

        store.setDifficulty({
            gripMultiplier,
            windMultiplier,
            tensionScore,
        });
    });

    return null;
}
