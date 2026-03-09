# The Rain Continues — PoC Spike Plan

> **Goal**: Validate the riskiest technical assumptions from the [production spec](file:///Users/briandawson/workspace/the-rain-react/rain_continues_production_spec.docx) in a **single playable vertical slice**. A player should be able to walk across a degrading skybridge in the rain, feel the wind push them, grip a beam, and experience adaptive difficulty — all in-browser, on desktop and mobile.

---

## 🎯 Spike Scope: What We're Proving

| # | Risk / Assumption | PoC Validation Criteria |
|---|---|---|
| 1 | R3F + Rapier WASM can deliver 60fps gameplay | Stable 60fps desktop / 30fps mobile with physics, rain, and player active |
| 2 | Custom rain shader is performant on mobile | 5K instanced rain particles rendering with wind-driven animation on iPhone 14+ |
| 3 | Kinematic player controller feels good | Beam-walk with wind push and grip drain feels tight, not floaty |
| 4 | TF.js LSTM inference doesn't stall the render loop | 2-second inference cycle completes in <5ms, no frame drops |
| 5 | Zustand → R3F ref-based data flow is viable | HUD reads state, useFrame reads refs, no unnecessary re-renders |
| 6 | Touch controls are usable on mobile | D-pad + action button overlay is playable without frustration |

---

## 🚫 Explicitly Out of Scope

- Level 2 (The Deep / underwater)
- Brain.js procedural generation
- Neural weather GRU (use scripted weather cycle instead)
- Audio / Howler.js integration
- Narrative / relic system
- GLTF asset pipeline (use procedural geometry)
- PWA / offline / service worker
- Shareable URLs / viral loop

---

## 📐 Architecture (PoC-Scoped)

```
src/
├── main.tsx                  # Entry point
├── App.tsx                   # Canvas + HUD shell
├── stores/
│   └── gameStore.ts          # Zustand store (player, weather, difficulty slices)
├── systems/
│   ├── PhysicsWorld.tsx      # Rapier provider + collision groups
│   ├── WeatherEngine.tsx     # Scripted weather cycle (intensity ramp, wind vector)
│   └── AIDirector.ts         # TF.js LSTM loader + 2s inference loop
├── player/
│   ├── PlayerController.tsx  # Kinematic body, movement, grip mechanic
│   ├── InputManager.ts       # Keyboard + touch abstraction
│   └── CameraRig.tsx         # Third-person follow cam with wind sway
├── level/
│   ├── Skybridge.tsx         # Procedural bridge geometry (12 segments)
│   ├── Towers.tsx            # Simple box towers (placeholder)
│   └── BridgeDegradation.ts  # Segment removal logic
├── shaders/
│   ├── RainShader.ts         # Instanced cylinder mesh, wind-driven vertex anim
│   └── RustShader.ts         # PBR + simplex noise rust blend (stretch goal)
├── hud/
│   ├── HUD.tsx               # Overlay container
│   ├── GripBar.tsx           # Grip meter
│   ├── StaminaBar.tsx        # Stamina/wind exposure indicator
│   └── DebugPanel.tsx        # Leva dev tuning panel
└── utils/
    └── mathHelpers.ts        # Shared vector/interpolation utilities
```

---

## 🏗️ Spike Phases

### Phase 0: Scaffold (Day 1 morning)
> **Deliverable**: Empty scene renders, physics world ticks, store wired up.

| Task | Detail |
|---|---|
| Vite + R3F project init | `npm create vite@latest ./ -- --template react-ts`, add R3F deps |
| Rapier WASM integration | `@react-three/rapier` with fixed 60Hz timestep, verify WASM loads |
| Zustand store skeleton | `gameStore.ts` with player/weather/difficulty slices |
| Dev tooling | Leva panel, FPS counter (`drei Stats`), hot reload verified |

### Phase 1: The Bridge (Day 1 afternoon → Day 2)
> **Deliverable**: Player walks across a procedural skybridge between two boxes. Bridge segments have physics colliders. Camera follows.

| Task | Detail |
|---|---|
| Procedural bridge geometry | 12 `BoxGeometry` segments (2m × 0.5m × 4m) connected in a line, each its own rigid body. Simple steel-grey material. |
| Tower placeholders | Two `BoxGeometry` towers at each end. Static rigid bodies. |
| Player capsule | Kinematic rigid body capsule (0.5m radius, 1.8m height). Velocity-based movement: 3 m/s max, 15 m/s² accel, 25 m/s² decel. |
| Input manager | Keyboard (WASD / arrows) + touch virtual D-pad. Abstracted to normalized direction vector. |
| Camera rig | Third-person: 2m behind, 1m above. Smooth follow via `lerp`. |
| Ground raycast | Downward ray from player center. If no surface within 0.5m → grip mode activates. |

### Phase 2: Rain + Weather (Day 2 → Day 3)
> **Deliverable**: Rain falls. Wind blows rain sideways and pushes the player. Intensity ramps up over 60 seconds.

| Task | Detail |
|---|---|
| Rain shader (instanced) | 5,000 instanced cylinder meshes. Vertex shader displaces along wind vector. Fragment shader: white, motion-blur elongation, alpha fadeout at ground contact. |
| Scripted weather cycle | Linear ramp: `intensity` 0→1 over 60s, resets. Wind vector rotates slowly. No neural network — just a sine-based interpolation. |
| Wind force on player | External velocity added to player per-frame. `windForce * exposureFactor` (1.0 on bridge, 0.3 inside tower bounds). |
| Post-processing baseline | Vignette, subtle chromatic aberration, desaturated cool color grade. `@react-three/postprocessing`. |

### Phase 3: Grip + Degradation (Day 3 → Day 4)
> **Deliverable**: Bridge segments break. Player must grip beams at gaps. Grip drains. Falling = respawn.

| Task | Detail |
|---|---|
| Grip mechanic | When ground raycast fails but player is within 0.5m of a grippable surface → grip mode. Drain: 0.4/sec × weather intensity. At 0 → detach (fall). Grip recharges when standing on solid surface. |
| Bridge degradation | Every 15s (scaled by weather intensity), a bridge segment's rigid body is removed. Visual telegraph: segment color shifts red 5s before breaking. Segment drops with gravity on break. |
| Fall + respawn | Below Y=-5 → respawn at last safe platform. Death counter increments in store. |
| HUD: grip bar | Horizontal bar, drains left-to-right. Color shifts green→yellow→red. Pulse animation at <20%. |

### Phase 4: AI Director (Day 4 → Day 5)
> **Deliverable**: TF.js LSTM loads, runs inference every 2s, adjusts grip drain and wind force based on player metrics.

| Task | Detail |
|---|---|
| Synthetic training data | Generate 1,000 mock gameplay sessions (grip %, velocity, deaths, input frequency) with target tension outputs. Python script or in-browser generator. |
| LSTM model | 8 input features → 2 hidden LSTM layers (16 units each) → 4 outputs (gripMul, o2Mul, windMul, currentMul). ~8K params. Train in TF.js or Python, export LayersModel JSON. |
| AIDirector integration | Load model async during scene init. Every 2s: sample player state → predict → update difficulty slice in Zustand. |
| Verify no frame drops | Profile with Chrome DevTools. Inference must complete in <5ms. If it stalls, fall back to heuristic difficulty. |
| Heuristic fallback | Simple rule-based difficulty (if deaths > 3 in 30s → reduce wind by 20%) as a safety net. |

### Phase 5: Mobile + Polish (Day 5 → Day 6)
> **Deliverable**: Playable on iPhone Safari. Touch controls. Performance validated.

| Task | Detail |
|---|---|
| Touch controls | Virtual D-pad (left thumb region) + grip button (right thumb region). CSS overlay, pointer events → InputManager. |
| Mobile perf pass | Reduce rain to 2K instances on mobile. Clamp pixel ratio to 2. Reduce shadow map to 1024. Feature detect via `renderer.capabilities`. |
| FOV vertigo effect | FOV widens 65°→75° when player is at a gap edge. Smooth transition via camera FOV lerp. |
| Visual polish | Add subtle camera sway synced to wind. Rain-on-lens screen-space particles (stretch goal). |

---

## 📊 Estimated Timeline

| Phase | Duration | Cumulative |
|---|---|---|
| **Phase 0**: Scaffold | 0.5 day | 0.5 days |
| **Phase 1**: The Bridge | 1.5 days | 2 days |
| **Phase 2**: Rain + Weather | 1 day | 3 days |
| **Phase 3**: Grip + Degradation | 1 day | 4 days |
| **Phase 4**: AI Director | 1.5 days | 5.5 days |
| **Phase 5**: Mobile + Polish | 0.5 day | **6 days** |

> [!TIP]
> The AI Director phase (Phase 4) is the highest-risk item. If TF.js model training proves problematic, the heuristic fallback lets us still ship a playable PoC without it.

---

## 🧪 Success Criteria

The PoC spike is **successful** if:

1. **Runs in-browser** — Chrome desktop + Safari mobile, no plugins
2. **60fps desktop / 30fps mobile** — with rain, physics, and player all active
3. **Feels like a game** — walking the bridge with wind and rain creates genuine tension
4. **AI adapts** — observable difficulty change when dying repeatedly vs. cruising through
5. **Touch playable** — a person can complete the bridge on an iPhone without rage-quitting
6. **< 5MB initial load** — procedural geometry, no heavy GLTF assets in PoC

---

## 📦 Key Dependencies

```json
{
  "@react-three/fiber": "^8.x",
  "@react-three/drei": "^9.x",
  "@react-three/rapier": "^1.x",
  "@react-three/postprocessing": "^2.x",
  "three": "^0.168",
  "@tensorflow/tfjs": "^4.x",
  "zustand": "^4.x",
  "leva": "^0.9",
  "vite": "^5.x",
  "react": "^18.x",
  "typescript": "^5.x"
}
```

> [!IMPORTANT]
> **No Brain.js, no Howler.js, no GLTF pipeline in the PoC.** These are validated in later spikes. This one is about the core gameplay loop: physics + rain + grip + adaptive AI.

---

## 🔀 Decision Points After Spike

| If... | Then... |
|---|---|
| Rapier WASM cold-start > 500ms | Investigate pre-initialization during splash screen or switch to Cannon.js |
| Rain shader kills mobile GPU | Switch from instanced geometry to point sprite particles |
| TF.js inference > 10ms | Increase interval to 5s or use heuristic-only difficulty |
| Touch controls feel terrible | Consider tilt-based movement or simplify to auto-walk with swipe-dodge |
| Total bundle > 5MB | Investigate TF.js tree-shaking and model quantization (float16) |

---

## 🚀 Let's Go

Ready to start **Phase 0** whenever you are. The first concrete output will be a running Vite + R3F app with Rapier physics ticking, a Zustand store wired up, and a Leva dev panel — all in about 2 hours.
