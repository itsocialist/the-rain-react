import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as tf from '@tensorflow/tfjs';
import { useGameStore } from '../stores/gameStore';
import { trainDifficultyModel } from './DifficultyModel';

/**
 * AIDirector — Hybrid difficulty system.
 * 
 * Starts with heuristic rules immediately.
 * Trains LSTM model in background during gameplay.
 * Once model is ready, switches to neural inference every 2s.
 */

const INFERENCE_INTERVAL = 2;
const MIN_MULTIPLIER = 0.4;
const MAX_MULTIPLIER = 1.6;
const EASE_RATE = 0.05;
const RAMP_RATE = 0.03;
const SEQUENCE_LENGTH = 10;

export function AIDirector() {
    const lastInferenceTime = useRef(0);
    const recentDeaths = useRef<number[]>([]);
    const metricsHistory = useRef<number[][]>([]);
    const [model, setModel] = useState<tf.LayersModel | null>(null);
    const [modelStatus, setModelStatus] = useState<'loading' | 'training' | 'ready' | 'fallback'>('loading');

    // Train model in background
    useEffect(() => {
        let cancelled = false;

        async function initModel() {
            try {
                setModelStatus('training');
                const trainedModel = await trainDifficultyModel((epoch, loss) => {
                    if (!cancelled) {
                        console.log(`🧠 AI Director training: epoch ${epoch + 1}/20, loss: ${loss.toFixed(5)}`);
                    }
                });

                if (!cancelled) {
                    setModel(trainedModel);
                    setModelStatus('ready');
                    console.log('✅ AI Director LSTM model ready');
                }
            } catch (err) {
                console.warn('⚠️ AI Director: LSTM training failed, using heuristic fallback', err);
                if (!cancelled) {
                    setModelStatus('fallback');
                }
            }
        }

        initModel();
        return () => { cancelled = true; };
    }, []);

    // Track deaths
    useEffect(() => {
        const unsub = useGameStore.subscribe(
            (s) => s.player.deaths,
            () => {
                recentDeaths.current.push(Date.now());
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

        const { difficulty, player, weather } = store;

        // Collect current metrics
        const currentMetrics = [
            player.grip,
            player.stamina,
            1.0, // o2 (Level 1 doesn't use this)
            Math.sqrt(player.velocity[0] ** 2 + player.velocity[2] ** 2) / 3,
            0.5, // hazard distance (simplified)
            Math.min((Date.now() - (recentDeaths.current[recentDeaths.current.length - 1] ?? 0)) / 60000, 1),
            Math.min(player.deaths / 10, 1),
            player.inputFrequency / 10,
        ];

        metricsHistory.current.push(currentMetrics);
        if (metricsHistory.current.length > SEQUENCE_LENGTH) {
            metricsHistory.current.shift();
        }

        // ── Neural inference (if model ready + enough history) ──────────
        if (model && modelStatus === 'ready' && metricsHistory.current.length >= SEQUENCE_LENGTH) {
            try {
                const inputTensor = tf.tensor3d([metricsHistory.current]);
                const prediction = model.predict(inputTensor) as tf.Tensor;
                const values = prediction.dataSync();

                const gripMultiplier = MIN_MULTIPLIER + values[0] * (MAX_MULTIPLIER - MIN_MULTIPLIER);
                const windMultiplier = MIN_MULTIPLIER + values[2] * (MAX_MULTIPLIER - MIN_MULTIPLIER);

                store.setDifficulty({
                    gripMultiplier,
                    windMultiplier,
                    tensionScore: (values[0] + values[2]) / 2,
                });

                inputTensor.dispose();
                prediction.dispose();
                return;
            } catch (err) {
                // Fall through to heuristic
            }
        }

        // ── Heuristic fallback ──────────────────────────────────────────
        const cutoff = Date.now() - 30000;
        const recentDeathCount = recentDeaths.current.filter((t) => t >= cutoff).length;

        const gripTension = 1 - player.grip;
        const deathTension = Math.min(recentDeathCount / 5, 1);
        const tensionScore = gripTension * 0.6 + deathTension * 0.4;

        const TARGET_TENSION = 0.65;
        const tensionDelta = tensionScore - TARGET_TENSION;

        let gripMultiplier = difficulty.gripMultiplier;
        let windMultiplier = difficulty.windMultiplier;

        if (tensionDelta > 0.1) {
            gripMultiplier = Math.max(MIN_MULTIPLIER, gripMultiplier - EASE_RATE);
            windMultiplier = Math.max(MIN_MULTIPLIER, windMultiplier - EASE_RATE);
        } else if (tensionDelta < -0.1) {
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
