import { useRef, useState, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Dynamic lightning system.
 * Randomly fires dramatic flashes that:
 *   1. Flash the ambient light to reveal city silhouettes
 *   2. Illuminate the cloud layer from within
 *   3. Trigger a thunder sound after a delay
 */
export function LightningSystem() {
    const lightRef = useRef<THREE.PointLight>(null);
    const flashRef = useRef({
        active: false,
        intensity: 0,
        nextFlash: 3 + Math.random() * 5,
        phase: 0,      // 0 = waiting, 1 = flash, 2 = afterglow
        thunderDelay: 0,
        thunderPlayed: false,
    });

    // Audio context for synthesized thunder
    const audioCtxRef = useRef<AudioContext | null>(null);

    const playThunder = useCallback((distance: number) => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        const now = ctx.currentTime;

        // Brown noise burst shaped into thunder rumble
        const duration = 2.5 + distance * 0.8;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                lastOut = (lastOut + (0.02 * white)) / 1.02;
                data[i] = lastOut * 3.5;
            }
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Shape the thunder envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4 / (1 + distance * 0.3), now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.3);
        gain.gain.linearRampToValueAtTime(0.08, now + 1.0);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        // Low-pass filter for distant rumble
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200 + (1 - distance) * 400, now);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start(now);
        source.stop(now + duration);
    }, []);

    useFrame((_, delta) => {
        const f = flashRef.current;
        f.nextFlash -= delta;

        if (f.nextFlash <= 0 && f.phase === 0) {
            // Trigger flash
            f.phase = 1;
            f.intensity = 3 + Math.random() * 4;
            f.thunderDelay = 0.8 + Math.random() * 2.5;
            f.thunderPlayed = false;

            // Double/triple flash chance
            const multiFlash = Math.random();
            if (multiFlash > 0.6) {
                // Schedule a second flash
                setTimeout(() => {
                    if (flashRef.current) {
                        flashRef.current.phase = 1;
                        flashRef.current.intensity = 1.5 + Math.random() * 2;
                    }
                }, 100 + Math.random() * 150);
            }
        }

        if (f.phase === 1) {
            // Flash phase — very fast decay
            f.intensity *= 0.85;
            if (f.intensity < 0.3) {
                f.phase = 2;
            }
        }

        if (f.phase === 2) {
            // Afterglow — slower decay
            f.intensity *= 0.95;
            f.thunderDelay -= delta;

            if (!f.thunderPlayed && f.thunderDelay <= 0) {
                f.thunderPlayed = true;
                playThunder(f.thunderDelay < -1 ? 0.8 : 0.3);
            }

            if (f.intensity < 0.01) {
                f.phase = 0;
                f.intensity = 0;
                f.nextFlash = 8 + Math.random() * 18;
            }
        }

        if (lightRef.current) {
            lightRef.current.intensity = f.intensity;
        }
    });

    return (
        <>
            {/* Lightning flash light — high up, covers whole scene */}
            <pointLight
                ref={lightRef}
                position={[10, 80, -20]}
                intensity={0}
                color="#cce0ff"
                distance={300}
                decay={0.5}
            />
        </>
    );
}

/**
 * Ambient rain + wind audio loop.
 * Synthesizes continuous rain hiss and wind using Web Audio API.
 */
export function AmbientAudio() {
    const [started, setStarted] = useState(false);
    const audioCtxRef = useRef<AudioContext | null>(null);

    useEffect(() => {
        // Auto-resume on user interaction
        const resume = () => {
            if (!started) setStarted(true);
        };
        window.addEventListener('click', resume, { once: true });
        window.addEventListener('keydown', resume, { once: true });
        // Also try auto-start
        setStarted(true);
        return () => {
            window.removeEventListener('click', resume);
            window.removeEventListener('keydown', resume);
        };
    }, []);

    useEffect(() => {
        if (!started) return;

        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

        // --- Rain noise layer ---
        const rainSize = ctx.sampleRate * 2;
        const rainBuffer = ctx.createBuffer(2, rainSize, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = rainBuffer.getChannelData(ch);
            for (let i = 0; i < rainSize; i++) {
                // Pink-ish noise for rain
                data[i] = (Math.random() * 2 - 1) * 0.3;
            }
        }
        const rainSource = ctx.createBufferSource();
        rainSource.buffer = rainBuffer;
        rainSource.loop = true;

        // Band-pass filter for rain frequency
        const rainFilter = ctx.createBiquadFilter();
        rainFilter.type = 'bandpass';
        rainFilter.frequency.value = 6000;
        rainFilter.Q.value = 0.5;

        const rainGain = ctx.createGain();
        rainGain.gain.value = 0.12;

        rainSource.connect(rainFilter);
        rainFilter.connect(rainGain);
        rainGain.connect(ctx.destination);
        rainSource.start();

        // --- Wind layer ---
        const windSize = ctx.sampleRate * 4;
        const windBuffer = ctx.createBuffer(2, windSize, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = windBuffer.getChannelData(ch);
            let lastOut = 0;
            for (let i = 0; i < windSize; i++) {
                const white = Math.random() * 2 - 1;
                lastOut = (lastOut + (0.02 * white)) / 1.02;
                data[i] = lastOut * 3;
            }
        }
        const windSource = ctx.createBufferSource();
        windSource.buffer = windBuffer;
        windSource.loop = true;

        const windFilter = ctx.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.value = 300;

        // Modulate wind volume for gusts
        const windGain = ctx.createGain();
        windGain.gain.value = 0.08;

        const windLfo = ctx.createOscillator();
        windLfo.frequency.value = 0.15;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.04;
        windLfo.connect(lfoGain);
        lfoGain.connect(windGain.gain);
        windLfo.start();

        windSource.connect(windFilter);
        windFilter.connect(windGain);
        windGain.connect(ctx.destination);
        windSource.start();

        // --- Dripping water layer ---
        const startDrips = () => {
            const scheduleDrip = () => {
                if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return;
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800 + Math.random() * 600, now);
                osc.frequency.exponentialRampToValueAtTime(200 + Math.random() * 200, now + 0.08);

                const dripGain = ctx.createGain();
                dripGain.gain.setValueAtTime(0.03, now);
                dripGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

                osc.connect(dripGain);
                dripGain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.15);

                setTimeout(scheduleDrip, 2000 + Math.random() * 6000);
            };
            scheduleDrip();
        };
        startDrips();

        return () => {
            ctx.close();
        };
    }, [started]);

    return null;
}

/**
 * Cinematic camera with scripted 3-act reveal sequence.
 *
 * Act 1 (0-8s):  Tight shot on bridge railing, shallow DOF.
 * Act 2 (8-20s): Pull-back reveal of bridge and towers.
 * Act 3 (20s+):  Wide orbit around the full scene.
 */
export function CinematicCameraSequence() {
    const { camera } = useThree();
    const timeRef = useRef(0);

    useFrame((_, delta) => {
        timeRef.current += delta;
        const t = timeRef.current;

        if (t < 8) {
            // Act 1: Tight shot — close to the bridge railing
            // Start looking at railing detail, very slow drift
            const progress = t / 8;
            const ease = progress * progress * (3 - 2 * progress); // smoothstep

            const startPos = new THREE.Vector3(2, 21.5, 3);
            const endPos = new THREE.Vector3(5, 22, 6);
            camera.position.lerpVectors(startPos, endPos, ease);

            // Look at bridge railing area
            const lookTarget = new THREE.Vector3(0, 20, 0);
            camera.lookAt(lookTarget);

        } else if (t < 20) {
            // Act 2: Pull-back reveal — crane out to show the bridge and towers
            const progress = (t - 8) / 12;
            const ease = progress * progress * (3 - 2 * progress);

            const startPos = new THREE.Vector3(5, 22, 6);
            const endPos = new THREE.Vector3(25, 30, 30);
            camera.position.lerpVectors(startPos, endPos, ease);

            // Look target shifts from bridge to scene center
            const lookStart = new THREE.Vector3(0, 20, 0);
            const lookEnd = new THREE.Vector3(0, 15, 0);
            const look = new THREE.Vector3();
            look.lerpVectors(lookStart, lookEnd, ease);
            camera.lookAt(look);

        } else {
            // Act 3: Wide orbit — continuous rotation around the scene
            const orbitTime = t - 20;
            const angle = orbitTime * 0.04;
            const radius = 55;
            const height = 30 + Math.sin(orbitTime * 0.08) * 5;

            camera.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius,
            );
            camera.lookAt(0, 12, 0);
        }
    });

    return null;
}
