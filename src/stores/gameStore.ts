import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// ── Player Slice ──────────────────────────────────────────────────────
export interface PlayerState {
    position: [number, number, number];
    velocity: [number, number, number];
    grip: number;          // 0..1, 1 = full grip
    stamina: number;       // 0..1
    mode: 'traverse' | 'grip' | 'falling';
    deaths: number;
    lastSafePosition: [number, number, number];
    inputFrequency: number; // actions per second (rolling average)
}

// ── Weather Slice ─────────────────────────────────────────────────────
export interface WeatherState {
    intensity: number;     // 0..1
    windDirection: [number, number, number];
    windSpeed: number;     // m/s
    rainDensity: number;   // 0..1 controls particle count
    elapsed: number;       // seconds since level start
}

// ── Difficulty Slice ──────────────────────────────────────────────────
export interface DifficultyState {
    gripDrain: number;     // base * multiplier
    windForce: number;     // base * multiplier
    gripMultiplier: number;
    windMultiplier: number;
    tensionScore: number;  // 0..1 — current estimated tension
}

// ── Level Slice ───────────────────────────────────────────────────────
export interface BridgeSegment {
    id: number;
    intact: boolean;
    health: number;        // 0..1, segment breaks at 0
    position: [number, number, number];
}

export interface LevelState {
    id: string;
    bridgeSegments: BridgeSegment[];
    started: boolean;
    completed: boolean;
}

// ── Combined Store ────────────────────────────────────────────────────
export interface GameStore {
    player: PlayerState;
    weather: WeatherState;
    difficulty: DifficultyState;
    level: LevelState;

    // Actions
    setPlayerPosition: (pos: [number, number, number]) => void;
    setPlayerMode: (mode: PlayerState['mode']) => void;
    drainGrip: (amount: number) => void;
    rechargeGrip: (amount: number) => void;
    playerDied: () => void;
    respawn: () => void;
    updateWeather: (dt: number) => void;
    setDifficulty: (d: Partial<DifficultyState>) => void;
    degradeSegment: (segmentId: number) => void;
    breakSegment: (segmentId: number) => void;
    setLastSafePosition: (pos: [number, number, number]) => void;
    startLevel: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────
const BRIDGE_SEGMENT_COUNT = 12;
const BRIDGE_SEGMENT_WIDTH = 2;
const BRIDGE_SEGMENT_HEIGHT = 0.5;
const BRIDGE_SEGMENT_DEPTH = 4;
const BRIDGE_START_X = -((BRIDGE_SEGMENT_COUNT * BRIDGE_SEGMENT_WIDTH) / 2);
const BRIDGE_Y = 20; // High up for vertigo

function createBridgeSegments(): BridgeSegment[] {
    return Array.from({ length: BRIDGE_SEGMENT_COUNT }, (_, i) => ({
        id: i,
        intact: true,
        health: 1,
        position: [
            BRIDGE_START_X + i * BRIDGE_SEGMENT_WIDTH + BRIDGE_SEGMENT_WIDTH / 2,
            BRIDGE_Y,
            0,
        ] as [number, number, number],
    }));
}

const INITIAL_PLAYER: PlayerState = {
    position: [BRIDGE_START_X - 3, BRIDGE_Y + 2, 0],
    velocity: [0, 0, 0],
    grip: 1,
    stamina: 1,
    mode: 'traverse',
    deaths: 0,
    lastSafePosition: [BRIDGE_START_X - 3, BRIDGE_Y + 2, 0],
    inputFrequency: 0,
};

const INITIAL_WEATHER: WeatherState = {
    intensity: 0,
    windDirection: [1, 0, 0.3],
    windSpeed: 0,
    rainDensity: 0,
    elapsed: 0,
};

const INITIAL_DIFFICULTY: DifficultyState = {
    gripDrain: 0.4,
    windForce: 5,
    gripMultiplier: 1,
    windMultiplier: 1,
    tensionScore: 0.5,
};

// ── Store ─────────────────────────────────────────────────────────────
export const useGameStore = create<GameStore>()(
    subscribeWithSelector((set, get) => ({
        player: { ...INITIAL_PLAYER },
        weather: { ...INITIAL_WEATHER },
        difficulty: { ...INITIAL_DIFFICULTY },
        level: {
            id: 'skyline',
            bridgeSegments: createBridgeSegments(),
            started: false,
            completed: false,
        },

        setPlayerPosition: (pos) =>
            set((s) => ({ player: { ...s.player, position: pos } })),

        setPlayerMode: (mode) =>
            set((s) => ({ player: { ...s.player, mode } })),

        drainGrip: (amount) =>
            set((s) => ({
                player: { ...s.player, grip: Math.max(0, s.player.grip - amount) },
            })),

        rechargeGrip: (amount) =>
            set((s) => ({
                player: { ...s.player, grip: Math.min(1, s.player.grip + amount) },
            })),

        playerDied: () =>
            set((s) => ({
                player: { ...s.player, deaths: s.player.deaths + 1, mode: 'falling' },
            })),

        respawn: () => {
            const lastSafe = get().player.lastSafePosition;
            set((s) => ({
                player: {
                    ...s.player,
                    position: [...lastSafe],
                    velocity: [0, 0, 0],
                    grip: 1,
                    stamina: 1,
                    mode: 'traverse',
                },
            }));
        },

        setLastSafePosition: (pos) =>
            set((s) => ({ player: { ...s.player, lastSafePosition: pos } })),

        updateWeather: (dt) =>
            set((s) => {
                const elapsed = s.weather.elapsed + dt;
                // Scripted 60-second ramp cycle
                const cycleTime = elapsed % 60;
                const intensity = Math.min(cycleTime / 45, 1); // ramp 0→1 over 45s, hold 15s
                const windAngle = elapsed * 0.1; // slow rotation
                const windSpeed = intensity * 8; // max 8 m/s
                return {
                    weather: {
                        intensity,
                        windDirection: [Math.cos(windAngle), 0, Math.sin(windAngle) * 0.3],
                        windSpeed,
                        rainDensity: 0.2 + intensity * 0.8, // 20% base → 100%
                        elapsed,
                    },
                };
            }),

        setDifficulty: (d) =>
            set((s) => ({ difficulty: { ...s.difficulty, ...d } })),

        degradeSegment: (segmentId) =>
            set((s) => ({
                level: {
                    ...s.level,
                    bridgeSegments: s.level.bridgeSegments.map((seg) =>
                        seg.id === segmentId
                            ? { ...seg, health: Math.max(0, seg.health - 0.1) }
                            : seg
                    ),
                },
            })),

        breakSegment: (segmentId) =>
            set((s) => ({
                level: {
                    ...s.level,
                    bridgeSegments: s.level.bridgeSegments.map((seg) =>
                        seg.id === segmentId ? { ...seg, intact: false, health: 0 } : seg
                    ),
                },
            })),

        startLevel: () =>
            set((s) => ({ level: { ...s.level, started: true } })),
    }))
);

// Export constants for use in level components
export {
    BRIDGE_SEGMENT_COUNT,
    BRIDGE_SEGMENT_WIDTH,
    BRIDGE_SEGMENT_HEIGHT,
    BRIDGE_SEGMENT_DEPTH,
    BRIDGE_START_X,
    BRIDGE_Y,
};
