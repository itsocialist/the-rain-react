import React, {
    Suspense, useRef, useState, useCallback, useEffect, createContext, useContext,
} from 'react';
import { Canvas, useThree, ThreeEvent, useFrame } from '@react-three/fiber';
import {
    OrbitControls,
    Grid,
    TransformControls,
    useGLTF,
    GizmoHelper,
    GizmoViewport,
    Environment,
    Box,
    Sphere,
    CameraControls,
} from '@react-three/drei';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LightType = 'point' | 'spot' | 'directional';

export interface MaterialOverride {
    color?: string;
    roughness?: number;
    metalness?: number;
    emissiveColor?: string;
    emissiveIntensity?: number;
    opacity?: number;
    wireframe?: boolean;
}

export interface SceneObject {
    id: string;
    name: string;
    modelPath: string | null;
    primitiveType?: 'box' | 'sphere' | 'plane';
    objectType?: 'model' | 'primitive' | 'light' | 'rain' | 'water';
    lightType?: LightType;
    lightIntensity?: number;
    lightColor?: string;
    lightDistance?: number;
    lightAngle?: number;  // spotlight cone
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    visible: boolean;
    locked: boolean;
    color?: string;
    material?: MaterialOverride;
    // Rain-specific
    rainIntensity?: number;
    rainCount?: number;
    rainArea?: number;
    rainWindSpeed?: number;
    rainWindDir?: [number, number, number];
    // Water-specific
    waterLevel?: number;
    waterColor?: string;
    waterOpacity?: number;
    waterSize?: number;
}

interface DragPayload {
    type: 'glb' | 'primitive' | 'light' | 'rain' | 'water';
    label: string;
    path?: string;
    primitiveType?: 'box' | 'sphere' | 'plane';
    lightType?: LightType;
}

// ─── Staged Asset (click-to-place) ───────────────────────────────────────────

interface StagedAsset {
    payload: DragPayload;
    label: string;
}

// ─── Available Assets ─────────────────────────────────────────────────────────

const AVAILABLE_ASSETS = [
    { label: '🌆 City – Full Gameready', path: '/models/full_gameready_city_buildings.glb' },
    { label: '🏙️ City Pack', path: '/models/city_pack.glb' },
    { label: '🏙️ City Pack 3', path: '/models/city_pack_3.glb' },
    { label: '🏙️ City Pack 7', path: '/models/city_pack_7.glb' },
    { label: '🏙️ City Pack 8', path: '/models/city_pack_8.glb' },
    { label: '🏢 Building 1', path: '/models/building_1.glb' },
    { label: '🏢 Building 2', path: '/models/building_2.glb' },
    { label: '🌉 Bridge (Image-to-3D)', path: '/models/meshy_bridge_vt.glb' },
    { label: '🕵️ Character (Image-to-3D)', path: '/models/meshy_character_vt.glb' },
    { label: '🌉 Bridge (Text-to-3D)', path: '/models/meshy_bridge.glb' },
    { label: '🕵️ Character (Text-to-3D)', path: '/models/meshy_character.glb' },
];

const PRIMITIVES = [
    { label: '📦 Box', type: 'box' as const },
    { label: '🔵 Sphere', type: 'sphere' as const },
    { label: '⬜ Plane', type: 'plane' as const },
];

const ENVIRONMENT_ASSETS = [
    { label: '💡 Point Light', type: 'light' as const, lightType: 'point' as LightType },
    { label: '🔦 Spot Light', type: 'light' as const, lightType: 'spot' as LightType },
    { label: '☀️ Directional Light', type: 'light' as const, lightType: 'directional' as LightType },
    { label: '🌧️ Rain Effect', type: 'rain' as const },
    { label: '🌊 Water Plane', type: 'water' as const },
];

// ─── ID Generator ─────────────────────────────────────────────────────────────

let idCounter = 0;
function genId() { return `obj_${Date.now()}_${idCounter++}`; }

function snap(v: number, size: number) {
    return Math.round(v / size) * size;
}

// ─── Drag Context ─────────────────────────────────────────────────────────────

const DragContext = createContext<{
    payload: DragPayload | null;
    setPayload: (p: DragPayload | null) => void;
}>({ payload: null, setPayload: () => {} });

// ─── GLB Model ────────────────────────────────────────────────────────────────

function GlbModel({ path, onClick }: {
    path: string;
    onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
    const { scene } = useGLTF(path);
    const cloned = React.useMemo(() => scene.clone(true), [scene]);

    useEffect(() => {
        cloned.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }, [cloned]);

    return (
        <primitive
            object={cloned}
            onClick={onClick}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => e.stopPropagation()}
        />
    );
}

// ─── Primitive Mesh ───────────────────────────────────────────────────────────

function PrimitiveMesh({ type, color, onClick }: {
    type: 'box' | 'sphere' | 'plane';
    color: string;
    onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
    if (type === 'sphere') {
        return (
            <Sphere args={[1, 16, 16]} onClick={onClick} castShadow receiveShadow>
                <meshStandardMaterial color={color} />
            </Sphere>
        );
    }
    if (type === 'plane') {
        return (
            <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={onClick} receiveShadow>
                <planeGeometry args={[10, 10]} />
                <meshStandardMaterial color={color} side={THREE.DoubleSide} />
            </mesh>
        );
    }
    return (
        <Box args={[1, 1, 1]} onClick={onClick} castShadow receiveShadow>
            <meshStandardMaterial color={color} />
        </Box>
    );
}

// ─── Selection Bounding Box Outline ──────────────────────────────────────────

function SelectionBox({ obj }: { obj: SceneObject }) {
    const meshRef = useRef<THREE.Group>(null!);
    const boxHelper = useRef<THREE.BoxHelper | null>(null);
    const { scene } = useThree();

    useEffect(() => {
        return () => { if (boxHelper.current) scene.remove(boxHelper.current); };
    }, []);

    return null; // Handled by transform gizmo visual
}

// ─── Scene Object Node ────────────────────────────────────────────────────────

function SceneObjectNode({
    obj, isSelected, onSelect, onTransformChange, onTransformCommit,
    transformMode, gridSnap, snapSize,
}: {
    obj: SceneObject;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onTransformChange: (id: string, pos: THREE.Vector3, rot: THREE.Euler, sca: THREE.Vector3) => void;
    onTransformCommit: () => void;
    transformMode: 'translate' | 'rotate' | 'scale';
    gridSnap: boolean;
    snapSize: number;
}) {
    const groupRef = useRef<THREE.Group>(null!);
    const { camera, gl } = useThree();

    const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(obj.id);
    }, [obj.id, onSelect]);

    // Apply snap on position change
    const handleChange = useCallback(() => {
        if (!groupRef.current) return;
        if (gridSnap && transformMode === 'translate') {
            groupRef.current.position.x = snap(groupRef.current.position.x, snapSize);
            groupRef.current.position.z = snap(groupRef.current.position.z, snapSize);
        }
        onTransformChange(
            obj.id,
            groupRef.current.position.clone(),
            groupRef.current.rotation.clone(),
            groupRef.current.scale.clone(),
        );
    }, [obj.id, gridSnap, snapSize, transformMode, onTransformChange]);

    if (!obj.visible) return null;

    return (
        <>
            <group
                ref={groupRef}
                position={obj.position}
                rotation={obj.rotation}
                scale={obj.scale}
            >
                <Suspense fallback={
                    <Box args={[2, 2, 2]} onClick={handleClick}>
                        <meshStandardMaterial color="#1a3050" wireframe />
                    </Box>
                }>
                    {obj.objectType === 'light' ? (
                        <LightObject obj={obj} />
                    ) : obj.objectType === 'rain' ? (
                        <RainEffect obj={obj} />
                    ) : obj.objectType === 'water' ? (
                        <WaterPlane obj={obj} />
                    ) : obj.modelPath ? (
                        <GlbModel path={obj.modelPath} onClick={handleClick} />
                    ) : (
                        <PrimitiveMesh type={obj.primitiveType || 'box'} color={obj.color || '#4488cc'} onClick={handleClick} />
                    )}
                </Suspense>
            </group>

            {isSelected && !obj.locked && (
                <TransformControls
                    object={groupRef}
                    mode={transformMode}
                    camera={camera}
                    domElement={gl.domElement}
                    onObjectChange={handleChange}
                    onMouseUp={onTransformCommit}
                />
            )}
        </>
    );
}

// ─── Drop Ghost (preview while dragging over viewport) ───────────────────────

function DropGhost({ position }: { position: THREE.Vector3 | null }) {
    if (!position) return null;
    return (
        <mesh position={position}>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshBasicMaterial color="#00ddaa" wireframe transparent opacity={0.7} />
        </mesh>
    );
}

// ─── Light Object Renderer ───────────────────────────────────────────────────

function LightObject({ obj }: { obj: SceneObject }) {
    const helperColor = obj.lightColor || '#ffffff';
    const intensity = obj.lightIntensity ?? 2;
    const distance = obj.lightDistance ?? 50;

    return (
        <group>
            {obj.lightType === 'point' && (
                <>
                    <pointLight
                        color={helperColor}
                        intensity={intensity}
                        distance={distance}
                        castShadow
                    />
                    {/* Visual helper sphere */}
                    <mesh>
                        <sphereGeometry args={[0.4, 8, 8]} />
                        <meshBasicMaterial color={helperColor} wireframe />
                    </mesh>
                    <mesh>
                        <sphereGeometry args={[0.15]} />
                        <meshBasicMaterial color={helperColor} />
                    </mesh>
                </>
            )}
            {obj.lightType === 'spot' && (
                <>
                    <spotLight
                        color={helperColor}
                        intensity={intensity}
                        distance={distance}
                        angle={obj.lightAngle ?? 0.5}
                        penumbra={0.5}
                        castShadow
                    />
                    <mesh>
                        <coneGeometry args={[0.3, 0.6, 8]} />
                        <meshBasicMaterial color={helperColor} wireframe />
                    </mesh>
                </>
            )}
            {obj.lightType === 'directional' && (
                <>
                    <directionalLight
                        color={helperColor}
                        intensity={intensity}
                        castShadow
                        shadow-mapSize={[1024, 1024]}
                    />
                    <mesh>
                        <boxGeometry args={[0.6, 0.1, 0.6]} />
                        <meshBasicMaterial color={helperColor} wireframe />
                    </mesh>
                    {/* Arrow pointing down */}
                    <mesh position={[0, -0.4, 0]}>
                        <coneGeometry args={[0.2, 0.5, 6]} />
                        <meshBasicMaterial color={helperColor} />
                    </mesh>
                </>
            )}
        </group>
    );
}

// ─── Rain Effect (placeable) ─────────────────────────────────────────────────

const RAIN_VERT = `
  attribute float aSpeed;
  attribute float aOffset;
  uniform float uTime;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    vec4 wp = instanceMatrix * vec4(position, 1.0);
    float fallSpeed = 8.0 + aSpeed * 4.0;
    float h = 25.0;
    wp.y -= mod(uTime * fallSpeed + aOffset * 50.0, h);
    wp.y += h * 0.5;
    vAlpha = smoothstep(0.0, 3.0, wp.y + 5.0) * uIntensity;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const RAIN_FRAG = `
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.7, 0.8, 0.9, vAlpha * 0.35);
  }
`;

function RainEffect({ obj }: { obj: SceneObject }) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const count = obj.rainCount ?? 3000;
    const area = obj.rainArea ?? 40;

    const { speeds, offsets, matrices } = React.useMemo(() => {
        const speeds = new Float32Array(count);
        const offsets = new Float32Array(count);
        const matrices: THREE.Matrix4[] = [];
        const d = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
            speeds[i] = Math.random();
            offsets[i] = Math.random();
            d.position.set((Math.random() - 0.5) * area, Math.random() * 25, (Math.random() - 0.5) * area);
            d.rotation.set(0, 0, Math.random() * 0.1 - 0.05);
            d.updateMatrix();
            matrices.push(d.matrix.clone());
        }
        return { speeds, offsets, matrices };
    }, [count, area]);

    useEffect(() => {
        if (!meshRef.current) return;
        matrices.forEach((m, i) => meshRef.current!.setMatrixAt(i, m));
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [matrices]);

    useFrame(() => {
        if (meshRef.current && !meshRef.current.geometry.getAttribute('aSpeed')) {
            meshRef.current.geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
            meshRef.current.geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 1));
        }
    });

    useFrame(({ clock }) => {
        if (!matRef.current) return;
        matRef.current.uniforms.uTime.value = clock.elapsedTime;
        matRef.current.uniforms.uIntensity.value = obj.rainIntensity ?? 0.8;
    });

    const uniforms = React.useMemo(() => ({
        uTime: { value: 0 },
        uIntensity: { value: 0.8 },
    }), []);

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
            <cylinderGeometry args={[0.008, 0.008, 0.3, 3, 1]} />
            <shaderMaterial
                ref={matRef}
                vertexShader={RAIN_VERT}
                fragmentShader={RAIN_FRAG}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </instancedMesh>
    );
}

// ─── Water Plane (placeable) ─────────────────────────────────────────────────

function WaterPlane({ obj }: { obj: SceneObject }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const size = obj.waterSize ?? 200;
    const waterColor = obj.waterColor ?? '#0a2540';
    const waterOpacity = obj.waterOpacity ?? 0.65;

    useFrame(({ clock }) => {
        if (!meshRef.current) return;
        // Gentle wave animation
        meshRef.current.position.y = (obj.waterLevel ?? 0) + Math.sin(clock.elapsedTime * 0.5) * 0.08;
    });

    return (
        <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[size, size, 32, 32]} />
            <meshStandardMaterial
                color={waterColor}
                transparent
                opacity={waterOpacity}
                roughness={0.1}
                metalness={0.9}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}

// ─── Fit Camera to Objects ───────────────────────────────────────────────────

function SceneTools({
    fitSignal, selectedId, objects,
}: {
    fitSignal: number;
    selectedId: string | null;
    objects: SceneObject[];
}) {
    const { camera, controls } = useThree() as any;

    useEffect(() => {
        if (fitSignal === 0) return;

        const targets = selectedId
            ? objects.filter(o => o.id === selectedId)
            : objects;

        if (targets.length === 0) return;

        const box = new THREE.Box3();
        targets.forEach(obj => {
            const pos = new THREE.Vector3(...obj.position);
            box.expandByPoint(pos.clone().add(new THREE.Vector3(-5, -5, -5)));
            box.expandByPoint(pos.clone().add(new THREE.Vector3(20, 30, 20)));
        });

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
        let dist = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        dist *= 1.5;

        const direction = camera.position.clone().sub(center).normalize();
        camera.position.copy(center.clone().add(direction.multiplyScalar(dist)));
        if (controls && controls.target) {
            controls.target.copy(center);
            controls.update();
        }
    }, [fitSignal]);

    return null;
}

// ─── Viewport ─────────────────────────────────────────────────────────────────

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const intersectPt = new THREE.Vector3();

function Viewport({
    objects, selectedId, onSelect, onTransformChange, onTransformCommit,
    transformMode, gridSnap, snapSize, fitSignal, onDropAtPoint,
    isDragOver,
}: {
    objects: SceneObject[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onTransformChange: (id: string, pos: THREE.Vector3, rot: THREE.Euler, sca: THREE.Vector3) => void;
    onTransformCommit: () => void;
    transformMode: 'translate' | 'rotate' | 'scale';
    gridSnap: boolean;
    snapSize: number;
    fitSignal: number;
    onDropAtPoint: (point: THREE.Vector3) => void;
    isDragOver: boolean;
}) {
    const [ghostPos, setGhostPos] = useState<THREE.Vector3 | null>(null);
    const { camera, gl, size } = useThree();
    const orbitRef = useRef<any>(null);

    // Mouse tracking for ghost position
    const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
        if (!isDragOver) return;
        const ndcX = (e.nativeEvent.offsetX / size.width) * 2 - 1;
        const ndcY = -(e.nativeEvent.offsetY / size.height) * 2 + 1;
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        if (raycaster.ray.intersectPlane(groundPlane, intersectPt)) {
            const snapped = gridSnap
                ? new THREE.Vector3(snap(intersectPt.x, snapSize), 0, snap(intersectPt.z, snapSize))
                : intersectPt.clone();
            setGhostPos(snapped);
        }
    }, [isDragOver, camera, size, gridSnap, snapSize]);


    // Disable orbit during transform drag
    const handleTransformStart = () => {
        if (orbitRef.current) orbitRef.current.enabled = false;
    };
    const handleTransformEnd = () => {
        if (orbitRef.current) orbitRef.current.enabled = true;
        onTransformCommit();
    };

    useEffect(() => {
        if (!isDragOver) setGhostPos(null);
    }, [isDragOver]);

    return (
        <>
            <ambientLight intensity={0.6} color="#8899bb" />
            <directionalLight position={[20, 40, 10]} intensity={1.4} castShadow color="#ffffff"
                shadow-mapSize={[2048, 2048]} shadow-camera-far={800} shadow-camera-left={-200}
                shadow-camera-right={200} shadow-camera-top={200} shadow-camera-bottom={-200}
            />
            <hemisphereLight args={['#2a3545', '#0a0f18', 0.5]} />
            <fog attach="fog" args={['#0a0e1a', 300, 900]} />
            <Environment preset="city" />

            {/* ── Ground grid ── */}
            <Grid
                args={[500, 500]}
                cellSize={5}
                cellThickness={0.4}
                cellColor="#1a2535"
                sectionSize={20}
                sectionThickness={0.8}
                sectionColor="#2a3f5f"
                fadeDistance={300}
                fadeStrength={0.8}
                position={[0, 0, 0]}
            />

            {/* Origin axes helper */}
            <axesHelper args={[10]} />

            {/* Invisible ground for raycasting deselect + ghost tracking */}
            <mesh
                position={[0, -0.01, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                onClick={() => onSelect(null)}
                onPointerMove={handlePointerMove}
                visible={false}
            >
                <planeGeometry args={[5000, 5000]} />
                <meshBasicMaterial side={THREE.DoubleSide} />
            </mesh>

            {/* Drop ghost */}
            {isDragOver && <DropGhost position={ghostPos} />}

            {/* Objects */}
            {objects.map(obj => (
                <SceneObjectNode
                    key={obj.id}
                    obj={obj}
                    isSelected={selectedId === obj.id}
                    onSelect={onSelect}
                    onTransformChange={onTransformChange}
                    onTransformCommit={handleTransformEnd}
                    transformMode={transformMode}
                    gridSnap={gridSnap}
                    snapSize={snapSize}
                />
            ))}

            <OrbitControls ref={orbitRef} makeDefault />

            <SceneTools fitSignal={fitSignal} selectedId={selectedId} objects={objects} />

            <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                <GizmoViewport axisColors={['#ff4444', '#44ff44', '#4488ff']} labelColor="white" />
            </GizmoHelper>
        </>
    );
}

// ─── Main WorldBuilder ─────────────────────────────────────────────────────────

export default function WorldBuilder() {
    const [objects, setObjects] = useState<SceneObject[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
    const [panelTab, setPanelTab] = useState<'assets' | 'environ' | 'properties' | 'scene' | 'meshy' | 'export'>('assets');
    const [sceneJson, setSceneJson] = useState('');
    const [importJson, setImportJson] = useState('');
    const [historyStack, setHistoryStack] = useState<SceneObject[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [gridSnap, setGridSnap] = useState(false);
    const [snapSize, setSnapSize] = useState(5);
    const [fitSignal, setFitSignal] = useState(0);
    const [isDragOver, setIsDragOver] = useState(false);
    const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
    const [stagedAsset, setStagedAsset] = useState<StagedAsset | null>(null);
    // Meshy AI state
    const [meshyTasks, setMeshyTasks] = useState<any[]>([]);
    const [meshyLoading, setMeshyLoading] = useState(false);
    const [meshyPrompt, setMeshyPrompt] = useState('');
    const [meshyGenerating, setMeshyGenerating] = useState(false);
    const viewportRef = useRef<HTMLDivElement>(null);

    const selectedObj = objects.find(o => o.id === selectedId) ?? null;

    // ── Camera for drop raycasting ───────────────────────────────────────────
    const cameraRef = useRef<THREE.Camera | null>(null);

    // ── History ──────────────────────────────────────────────────────────────
    const pushHistory = useCallback((newObjects: SceneObject[]) => {
        setHistoryStack(prev => {
            const trimmed = prev.slice(0, historyIndex + 1);
            return [...trimmed, newObjects];
        });
        setHistoryIndex(prev => prev + 1);
    }, [historyIndex]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            setHistoryIndex(h => h - 1);
            setObjects(historyStack[historyIndex - 1]);
        }
    }, [historyIndex, historyStack]);

    const redo = useCallback(() => {
        if (historyIndex < historyStack.length - 1) {
            setHistoryIndex(h => h + 1);
            setObjects(historyStack[historyIndex + 1]);
        }
    }, [historyIndex, historyStack]);

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); }
            if (e.key === 'w') setTransformMode('translate');
            if (e.key === 'e') setTransformMode('rotate');
            if (e.key === 'r') setTransformMode('scale');
            if (e.key === 'f') triggerFit();
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
                deleteObject(selectedId);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selectedId, undo, redo]);

    // ── Object creation at position ──────────────────────────────────────────
    const createObject = useCallback((
        label: string,
        modelPath: string | null,
        primitiveType?: 'box' | 'sphere' | 'plane',
        position: [number, number, number] = [0, 0, 0],
        extra?: Partial<SceneObject>,
    ) => {
        const newObj: SceneObject = {
            id: genId(),
            name: label,
            modelPath,
            primitiveType,
            objectType: extra?.objectType || (modelPath ? 'model' : 'primitive'),
            position,
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            visible: true,
            locked: false,
            color: '#4488cc',
            ...extra,
        };
        const updated = [...objects, newObj];
        setObjects(updated);
        setSelectedId(newObj.id);
        pushHistory(updated);
        setPanelTab('properties');
        return newObj;
    }, [objects, pushHistory]);

    const addGlbAsset = useCallback((label: string, path: string, position?: [number, number, number]) => {
        createObject(label, path, undefined, position, { objectType: 'model' });
    }, [createObject]);

    const addPrimitive = useCallback((type: 'box' | 'sphere' | 'plane') => {
        createObject(
            `${type.charAt(0).toUpperCase() + type.slice(1)} ${objects.length + 1}`,
            null,
            type,
            [0, 0, 0],
            { objectType: 'primitive' },
        );
    }, [createObject, objects.length]);

    const addEnvironment = useCallback((envType: 'light' | 'rain' | 'water', lightType?: LightType, position?: [number, number, number]) => {
        const labels: Record<string, string> = { light: `${lightType ?? 'point'} Light`, rain: 'Rain Effect', water: 'Water Plane' };
        const defaults: Partial<SceneObject> = { objectType: envType };
        if (envType === 'light') {
            defaults.lightType = lightType ?? 'point';
            defaults.lightIntensity = 2;
            defaults.lightColor = '#ffffff';
            defaults.lightDistance = 50;
            defaults.lightAngle = 0.5;
        } else if (envType === 'rain') {
            defaults.rainIntensity = 0.8;
            defaults.rainCount = 3000;
            defaults.rainArea = 40;
            defaults.rainWindSpeed = 1;
            defaults.rainWindDir = [1, 0, 0.3];
        } else if (envType === 'water') {
            defaults.waterLevel = -2;
            defaults.waterColor = '#0a2540';
            defaults.waterOpacity = 0.65;
            defaults.waterSize = 200;
        }
        createObject(labels[envType] ?? envType, null, undefined, position ?? [0, envType === 'light' ? 10 : 0, 0], defaults);
    }, [createObject]);

    const deleteObject = useCallback((id: string) => {
        const updated = objects.filter(o => o.id !== id);
        setObjects(updated);
        setSelectedId(prev => prev === id ? null : prev);
        pushHistory(updated);
    }, [objects, pushHistory]);

    const duplicateObject = useCallback((id: string) => {
        const src = objects.find(o => o.id === id);
        if (!src) return;
        const dup: SceneObject = {
            ...src,
            id: genId(),
            name: `${src.name} (copy)`,
            position: [src.position[0] + 5, src.position[1], src.position[2]],
        };
        const updated = [...objects, dup];
        setObjects(updated);
        setSelectedId(dup.id);
        pushHistory(updated);
    }, [objects, pushHistory]);

    const updateObjectProp = useCallback(<K extends keyof SceneObject>(id: string, key: K, value: SceneObject[K]) => {
        const updated = objects.map(o => o.id === id ? { ...o, [key]: value } : o);
        setObjects(updated);
    }, [objects]);

    const updateObjectTransform = useCallback((id: string, pos: THREE.Vector3, rot: THREE.Euler, sca: THREE.Vector3) => {
        setObjects(prev => prev.map(o => {
            if (o.id !== id) return o;
            return {
                ...o,
                position: [pos.x, pos.y, pos.z] as [number, number, number],
                rotation: [rot.x, rot.y, rot.z] as [number, number, number],
                scale: [sca.x, sca.y, sca.z] as [number, number, number],
            };
        }));
    }, []);

    const commitTransform = useCallback(() => {
        pushHistory(objects);
    }, [objects, pushHistory]);

    // ── Quick Transform Actions ───────────────────────────────────────────────
    const snapToOrigin = useCallback(() => {
        if (!selectedId) return;
        updateObjectProp(selectedId, 'position', [0, 0, 0]);
        pushHistory(objects.map(o => o.id === selectedId ? { ...o, position: [0, 0, 0] } : o));
    }, [selectedId, updateObjectProp, objects, pushHistory]);

    const snapToGround = useCallback(() => {
        if (!selectedId) return;
        const obj = objects.find(o => o.id === selectedId);
        if (!obj) return;
        const updated = objects.map(o => o.id === selectedId
            ? { ...o, position: [o.position[0], 0, o.position[2]] as [number, number, number] }
            : o
        );
        setObjects(updated);
        pushHistory(updated);
    }, [selectedId, objects, pushHistory]);

    const resetTransform = useCallback(() => {
        if (!selectedId) return;
        const updated = objects.map(o => o.id === selectedId
            ? { ...o, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] }
            : o
        );
        setObjects(updated);
        pushHistory(updated);
    }, [selectedId, objects, pushHistory]);

    const clearScene = useCallback(() => {
        if (!window.confirm('Clear all objects from the scene?')) return;
        setObjects([]);
        setSelectedId(null);
        pushHistory([]);
    }, [pushHistory]);

    const triggerFit = useCallback(() => {
        setFitSignal(s => s + 1);
    }, []);

    // ── Staged Asset (click-to-place from left panel) ──────────────────────────
    const stageAsset = useCallback((payload: DragPayload, label: string) => {
        setStagedAsset({ payload, label });
    }, []);

    // ── Drag-and-Drop ─────────────────────────────────────────────────────────
    const handleDragStart = useCallback((e: React.DragEvent, payload: DragPayload) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify(payload));
        setDragPayload(payload);
    }, []);

    const handleViewportDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragOver(true);
    }, []);

    const handleViewportDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const placePayload = useCallback((payload: DragPayload, pos: [number, number, number]) => {
        if (payload.type === 'glb') addGlbAsset(payload.label, payload.path!, pos);
        else if (payload.type === 'primitive') addPrimitive(payload.primitiveType!);
        else if (payload.type === 'light') addEnvironment('light', payload.lightType, pos);
        else if (payload.type === 'rain') addEnvironment('rain', undefined, pos);
        else if (payload.type === 'water') addEnvironment('water', undefined, pos);
    }, [addGlbAsset, addPrimitive, addEnvironment]);

    const handleViewportDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const raw = e.dataTransfer.getData('application/json');
        if (!raw) return;

        let payload: DragPayload;
        try { payload = JSON.parse(raw); } catch { return; }

        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) { placePayload(payload, [0, 0, 0]); return; }

        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (cameraRef.current) {
            const ray = new THREE.Raycaster();
            ray.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
            const hit = new THREE.Vector3();
            if (ray.ray.intersectPlane(groundPlane, hit)) {
                const pos: [number, number, number] = gridSnap
                    ? [snap(hit.x, snapSize), 0, snap(hit.z, snapSize)]
                    : [hit.x, 0, hit.z];
                placePayload(payload, pos);
                return;
            }
        }
        placePayload(payload, [0, 0, 0]);
    }, [placePayload, gridSnap, snapSize]);

    // ── Click-to-place for staged asset ──────────────────────────────────────
    const handleViewportClick = useCallback((e: React.MouseEvent) => {
        if (!stagedAsset) return;
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect || !cameraRef.current) return;

        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
        const hit = new THREE.Vector3();
        if (ray.ray.intersectPlane(groundPlane, hit)) {
            const pos: [number, number, number] = gridSnap
                ? [snap(hit.x, snapSize), 0, snap(hit.z, snapSize)]
                : [hit.x, 0, hit.z];
            placePayload(stagedAsset.payload, pos);
        } else {
            placePayload(stagedAsset.payload, [0, 0, 0]);
        }
        setStagedAsset(null);
    }, [stagedAsset, placePayload, gridSnap, snapSize]);

    // Escape to cancel staged asset
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStagedAsset(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── Export / Import ───────────────────────────────────────────────────────
    const exportScene = useCallback(() => {
        const json = JSON.stringify({ version: 1, objects }, null, 2);
        setSceneJson(json);
        setPanelTab('export');
    }, [objects]);

    const importScene = useCallback(() => {
        try {
            const parsed = JSON.parse(importJson);
            if (parsed.objects && Array.isArray(parsed.objects)) {
                setObjects(parsed.objects);
                pushHistory(parsed.objects);
                setImportJson('');
            }
        } catch {
            alert('Invalid JSON. Please check your scene data.');
        }
    }, [importJson, pushHistory]);

    // ── Vec Field helper ──────────────────────────────────────────────────────
    const vecField = (label: string, key: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2) => {
        if (!selectedObj) return null;
        const val = selectedObj[key][axis];
        const step = key === 'scale' ? 0.05 : key === 'rotation' ? 0.05 : 0.5;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <label style={{ color: axisColors[axis], fontSize: 9, letterSpacing: 1 }}>{label}</label>
                <input
                    type="number"
                    step={step}
                    value={parseFloat(val.toFixed(3))}
                    onChange={e => {
                        const arr = [...selectedObj[key]] as [number, number, number];
                        arr[axis] = parseFloat(e.target.value) || 0;
                        updateObjectProp(selectedObj.id, key, arr);
                    }}
                    onBlur={() => pushHistory(objects)}
                    style={inputStyle}
                />
            </div>
        );
    };

    const axisColors = ['#ff6666', '#66dd88', '#6699ff'];

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div style={rootStyle}>
            {/* ── Toolbar ── */}
            <div style={toolbarStyle}>
                <span style={{ color: '#00ddaa', fontWeight: 700, letterSpacing: 3, fontSize: 13, marginRight: 12 }}>
                    ⬡ WORLD BUILDER
                </span>

                {/* Transform modes */}
                <div style={{ display: 'flex', gap: 3, borderRight: '1px solid #1a2f45', paddingRight: 10, marginRight: 6 }}>
                    {(['translate', 'rotate', 'scale'] as const).map((m, i) => (
                        <button key={m} onClick={() => setTransformMode(m)}
                            title={`${m} (${['W','E','R'][i]})`}
                            style={{ ...toolBtnStyle,
                                background: transformMode === m ? '#00ddaa18' : 'transparent',
                                borderColor: transformMode === m ? '#00ddaa' : '#2a3f5f',
                                color: transformMode === m ? '#00ddaa' : '#5a7a9a',
                            }}>
                            {['↕ MOVE', '↻ ROT', '⤡ SCALE'][i]}
                        </button>
                    ))}
                </div>

                {/* Undo / Redo */}
                <button onClick={undo} disabled={historyIndex <= 0} style={toolBtnStyle} title="Undo (Cmd+Z)">↩</button>
                <button onClick={redo} disabled={historyIndex >= historyStack.length - 1} style={toolBtnStyle} title="Redo (Cmd+Y)">↪</button>

                <div style={sep} />

                {/* Snap controls */}
                <label style={snapLabelStyle}>
                    <input type="checkbox" checked={gridSnap} onChange={e => setGridSnap(e.target.checked)} style={{ marginRight: 4 }} />
                    SNAP
                </label>
                {gridSnap && (
                    <select value={snapSize} onChange={e => setSnapSize(Number(e.target.value))} style={selectStyle}>
                        {[0.5, 1, 2, 5, 10].map(v => <option key={v} value={v}>{v}u</option>)}
                    </select>
                )}

                <div style={sep} />

                {/* View actions */}
                <button onClick={triggerFit} style={toolBtnStyle} title="Fit in view (F)">⊡ FIT</button>
                <button onClick={snapToOrigin} disabled={!selectedId} style={toolBtnStyle} title="Snap to origin">⊛ ORIGIN</button>
                <button onClick={snapToGround} disabled={!selectedId} style={toolBtnStyle} title="Snap Y to ground">⤓ GROUND</button>
                <button onClick={resetTransform} disabled={!selectedId} style={toolBtnStyle} title="Reset position/rotation/scale">↺ RESET</button>

                <div style={{ flex: 1 }} />

                <button onClick={clearScene} disabled={objects.length === 0}
                    style={{ ...toolBtnStyle, color: '#ff4466', borderColor: '#ff446640' }}>
                    🗑 CLEAR
                </button>
                <button onClick={exportScene} style={{ ...toolBtnStyle, color: '#00ddaa', borderColor: '#00ddaa50' }}>
                    ⬇ EXPORT
                </button>
                <a href="/" style={{ ...toolBtnStyle, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>← EXIT</a>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* ── Left Panel ── */}
                <div style={leftPanelStyle}>
                    <div style={{ display: 'flex', borderBottom: '1px solid #1a2535', flexWrap: 'wrap' }}>
                        {(['assets', 'environ', 'scene', 'properties', 'meshy', 'export'] as const).map(tab => (
                            <button key={tab} onClick={() => setPanelTab(tab)} style={{
                                ...tabBtnStyle,
                                borderBottom: panelTab === tab ? '2px solid #00ddaa' : '2px solid transparent',
                                color: panelTab === tab ? '#00ddaa' : '#3a5a7a',
                            }}>
                                {tab === 'environ' ? 'ENV' : tab.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    {/* ── Staged Asset Banner ── */}
                    {stagedAsset && (
                        <div style={{ padding: '6px 10px', background: '#00ddaa15', borderBottom: '1px solid #00ddaa40', fontSize: 10, color: '#00ddaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>🎯 <b>{stagedAsset.label}</b> — click viewport to place</span>
                            <button onClick={() => setStagedAsset(null)} style={{ ...iconBtnStyle, color: '#ff4466', fontSize: 10 }}>✕</button>
                        </div>
                    )}

                    {/* ── Assets Tab ── */}
                    {panelTab === 'assets' && (
                        <div style={panelBodyStyle}>
                            <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                                GLB MODELS
                                <span style={{ color: '#2a6a8a', fontWeight: 400, fontSize: 8 }}>click to stage · drag to viewport</span>
                            </div>
                            {AVAILABLE_ASSETS.map(asset => {
                                const isStaged = stagedAsset?.payload.path === asset.path;
                                return (
                                    <button
                                        key={asset.path}
                                        draggable
                                        onDragStart={e => handleDragStart(e, { type: 'glb', label: asset.label, path: asset.path })}
                                        onClick={() => stageAsset({ type: 'glb', label: asset.label, path: asset.path }, asset.label)}
                                        style={{ ...assetBtnStyle, borderColor: isStaged ? '#00ddaa' : '#1a2f45', background: isStaged ? '#00ddaa12' : '#0d1525' }}
                                    >
                                        <span>⠿</span> {asset.label}
                                    </button>
                                );
                            })}
                            <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>PRIMITIVES</div>
                            {PRIMITIVES.map(p => {
                                const isStaged = stagedAsset?.payload.primitiveType === p.type;
                                return (
                                    <button
                                        key={p.type}
                                        draggable
                                        onDragStart={e => handleDragStart(e, { type: 'primitive', label: p.label, primitiveType: p.type })}
                                        onClick={() => stageAsset({ type: 'primitive', label: p.label, primitiveType: p.type }, p.label)}
                                        style={{ ...assetBtnStyle, borderColor: isStaged ? '#00ddaa' : '#1a2f45', background: isStaged ? '#00ddaa12' : '#0d1525' }}
                                    >
                                        <span>⠿</span> {p.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Environment Tab ── */}
                    {panelTab === 'environ' && (
                        <div style={panelBodyStyle}>
                            <div style={sectionHeaderStyle}>LIGHTING</div>
                            {ENVIRONMENT_ASSETS.filter(e => e.type === 'light').map(env => {
                                const isStaged = stagedAsset?.payload.lightType === env.lightType;
                                return (
                                    <button
                                        key={env.label}
                                        draggable
                                        onDragStart={e => handleDragStart(e, { type: 'light', label: env.label, lightType: env.lightType })}
                                        onClick={() => stageAsset({ type: 'light', label: env.label, lightType: env.lightType }, env.label)}
                                        style={{ ...assetBtnStyle, borderColor: isStaged ? '#ffaa00' : '#1a2f45', background: isStaged ? '#ffaa0012' : '#0d1525' }}
                                    >
                                        <span>⠿</span> {env.label}
                                    </button>
                                );
                            })}

                            <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>EFFECTS</div>
                            {ENVIRONMENT_ASSETS.filter(e => e.type !== 'light').map(env => {
                                const isStaged = stagedAsset?.payload.type === env.type;
                                return (
                                    <button
                                        key={env.label}
                                        draggable
                                        onDragStart={e => handleDragStart(e, { type: env.type as DragPayload['type'], label: env.label })}
                                        onClick={() => stageAsset({ type: env.type as DragPayload['type'], label: env.label }, env.label)}
                                        style={{ ...assetBtnStyle, borderColor: isStaged ? '#00aaff' : '#1a2f45', background: isStaged ? '#00aaff12' : '#0d1525' }}
                                    >
                                        <span>⠿</span> {env.label}
                                    </button>
                                );
                            })}

                            <div style={{ fontSize: 9, color: '#2a4a6a', marginTop: 12, lineHeight: 1.8 }}>
                                Click to stage, then click on the viewport to place.<br/>
                                Or drag directly onto the viewport.<br/>
                                Press <b>Esc</b> to cancel.
                            </div>
                        </div>
                    )}

                    {/* ── Meshy AI Tab ── */}
                    {panelTab === 'meshy' && (
                        <div style={panelBodyStyle}>
                            <div style={sectionHeaderStyle}>MESHY AI — TEXT TO 3D</div>
                            <div style={{ marginBottom: 10 }}>
                                <input
                                    type="text"
                                    value={meshyPrompt}
                                    onChange={e => setMeshyPrompt(e.target.value)}
                                    placeholder="e.g. rain-soaked bridge, sci-fi prop..."
                                    style={{ ...inputStyle, marginBottom: 6 }}
                                />
                                <button
                                    onClick={async () => {
                                        if (!meshyPrompt.trim()) return;
                                        setMeshyGenerating(true);
                                        try {
                                            // This calls the Meshy AI MCP — the agent will proxy it
                                            alert('💡 To generate: use the Meshy AI tools from the agent.\n\nPrompt: ' + meshyPrompt);
                                        } finally {
                                            setMeshyGenerating(false);
                                        }
                                    }}
                                    disabled={meshyGenerating || !meshyPrompt.trim()}
                                    style={{ ...actionBtnStyle, color: '#00ddaa', borderColor: '#00ddaa50' }}
                                >
                                    {meshyGenerating ? '⏳ Generating...' : '🚀 Generate 3D Model'}
                                </button>
                            </div>

                            <div style={{ ...sectionHeaderStyle, marginTop: 12 }}>YOUR MESHY MODELS</div>
                            <button
                                onClick={() => {
                                    setMeshyLoading(true);
                                    // Show existing GLBs from meshy downloads
                                    const meshyModels = AVAILABLE_ASSETS.filter(a => a.path.includes('meshy'));
                                    setMeshyTasks(meshyModels.map(m => ({ label: m.label, path: m.path, status: 'SUCCEEDED' })));
                                    setMeshyLoading(false);
                                }}
                                style={{ ...actionBtnStyle, marginBottom: 10 }}
                            >
                                {meshyLoading ? '⏳ Loading...' : '🔄 Refresh Models'}
                            </button>
                            {meshyTasks.map((task: any, i: number) => (
                                <div key={i} style={{ ...hierarchyItemStyle, gap: 6 }}>
                                    <span style={{ flex: 1, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {task.label || task.prompt || `Task ${i + 1}`}
                                    </span>
                                    <span style={{ fontSize: 8, color: task.status === 'SUCCEEDED' ? '#00ddaa' : '#ffaa00' }}>
                                        {task.status || 'READY'}
                                    </span>
                                    {task.path && (
                                        <button
                                            onClick={() => addGlbAsset(task.label || `Meshy Model ${i + 1}`, task.path)}
                                            style={{ ...iconBtnStyle, color: '#00ddaa' }}
                                            title="Add to scene"
                                        >+</button>
                                    )}
                                </div>
                            ))}
                            {meshyTasks.length === 0 && !meshyLoading && (
                                <div style={{ color: '#2a3f5f', fontSize: 10, textAlign: 'center', marginTop: 16, lineHeight: 2 }}>
                                    No models loaded.<br/>Click Refresh to load your Meshy models.
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Scene Hierarchy ── */}
                    {panelTab === 'scene' && (
                        <div style={panelBodyStyle}>
                            <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>{objects.length} OBJECTS</span>
                                {objects.length > 0 && (
                                    <button onClick={clearScene} style={{ ...iconBtnStyle, color: '#ff4466', fontSize: 9 }}>CLEAR ALL</button>
                                )}
                            </div>
                            {objects.length === 0 && (
                                <div style={{ color: '#2a3f5f', fontSize: 11, textAlign: 'center', marginTop: 32, lineHeight: 2 }}>
                                    No objects yet.<br />
                                    <span style={{ color: '#1a4a6a' }}>Drag assets or click them<br />from the Assets tab.</span>
                                </div>
                            )}
                            {objects.map((obj, i) => (
                                <div
                                    key={obj.id}
                                    onClick={() => { setSelectedId(obj.id); setPanelTab('properties'); }}
                                    onDoubleClick={() => { setSelectedId(obj.id); triggerFit(); }}
                                    title="Click to select · Double-click to focus"
                                    style={{
                                        ...hierarchyItemStyle,
                                        background: selectedId === obj.id ? '#00ddaa12' : 'transparent',
                                        borderLeft: selectedId === obj.id ? '2px solid #00ddaa' : '2px solid transparent',
                                        opacity: obj.visible ? 1 : 0.4,
                                    }}
                                >
                                    <span style={{ color: '#1e4a6a', fontSize: 10, minWidth: 18 }}>{i + 1}</span>
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                                        {obj.name}
                                    </span>
                                    <button onClick={e => { e.stopPropagation(); updateObjectProp(obj.id, 'locked', !obj.locked); }}
                                        style={iconBtnStyle} title={obj.locked ? 'Unlock' : 'Lock'}>
                                        {obj.locked ? '🔒' : '🔓'}
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); updateObjectProp(obj.id, 'visible', !obj.visible); }}
                                        style={iconBtnStyle} title="Toggle visibility">
                                        {obj.visible ? '👁' : '🚫'}
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); duplicateObject(obj.id); }}
                                        style={iconBtnStyle} title="Duplicate">⊕</button>
                                    <button onClick={e => { e.stopPropagation(); deleteObject(obj.id); }}
                                        style={{ ...iconBtnStyle, color: '#ff4466' }} title="Delete">✕</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Properties ── */}
                    {panelTab === 'properties' && (
                        <div style={panelBodyStyle}>
                            {!selectedObj ? (
                                <div style={{ color: '#2a3f5f', fontSize: 11, textAlign: 'center', marginTop: 32, lineHeight: 2 }}>
                                    Select an object in the<br />viewport or Scene tab.
                                </div>
                            ) : (
                                <>
                                    {/* Name */}
                                    <div style={sectionHeaderStyle}>OBJECT</div>
                                    <div style={{ marginBottom: 12 }}>
                                        <label style={labelStyle}>Name</label>
                                        <input type="text" value={selectedObj.name}
                                            onChange={e => updateObjectProp(selectedObj.id, 'name', e.target.value)}
                                            style={inputStyle} />
                                    </div>

                                    {/* Transform */}
                                    <div style={{ ...sectionHeaderStyle, display: 'flex', gap: 4, alignItems: 'center' }}>
                                        TRANSFORM
                                        <button onClick={resetTransform} style={{ ...iconBtnStyle, fontSize: 9, marginLeft: 'auto', color: '#4a7aaa' }} title="Reset transform">↺ reset</button>
                                    </div>
                                    <div style={{ marginBottom: 8 }}>
                                        <label style={labelStyle}>Position</label>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {vecField('X', 'position', 0)}{vecField('Y', 'position', 1)}{vecField('Z', 'position', 2)}
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: 8 }}>
                                        <label style={labelStyle}>Rotation (rad)</label>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {vecField('X', 'rotation', 0)}{vecField('Y', 'rotation', 1)}{vecField('Z', 'rotation', 2)}
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: 12 }}>
                                        <label style={labelStyle}>Scale</label>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {vecField('X', 'scale', 0)}{vecField('Y', 'scale', 1)}{vecField('Z', 'scale', 2)}
                                        </div>
                                    </div>

                                    {/* Quick transform buttons */}
                                    <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                                        <button onClick={snapToOrigin} style={chipBtnStyle}>⊛ To Origin</button>
                                        <button onClick={snapToGround} style={chipBtnStyle}>⤓ Ground Y</button>
                                        <button onClick={triggerFit} style={chipBtnStyle}>⊡ Fit View</button>
                                        <button onClick={() => duplicateObject(selectedObj.id)} style={chipBtnStyle}>⊕ Duplicate</button>
                                    </div>

                                    {/* Light Properties */}
                                    {selectedObj.objectType === 'light' && (
                                        <>
                                            <div style={sectionHeaderStyle}>LIGHT</div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Color</label>
                                                <input type="color" value={selectedObj.lightColor || '#ffffff'}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'lightColor', e.target.value)}
                                                    style={{ width: '100%', height: 28, background: 'none', border: 'none', cursor: 'pointer' }} />
                                            </div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Intensity</label>
                                                <input type="range" min={0} max={20} step={0.1} value={selectedObj.lightIntensity ?? 2}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'lightIntensity', parseFloat(e.target.value))}
                                                    style={{ width: '100%' }} />
                                                <span style={{ fontSize: 9, color: '#5a8aaa' }}>{(selectedObj.lightIntensity ?? 2).toFixed(1)}</span>
                                            </div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Distance</label>
                                                <input type="range" min={1} max={200} step={1} value={selectedObj.lightDistance ?? 50}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'lightDistance', parseFloat(e.target.value))}
                                                    style={{ width: '100%' }} />
                                                <span style={{ fontSize: 9, color: '#5a8aaa' }}>{selectedObj.lightDistance ?? 50}</span>
                                            </div>
                                            {selectedObj.lightType === 'spot' && (
                                                <div style={{ marginBottom: 6 }}>
                                                    <label style={labelStyle}>Cone Angle</label>
                                                    <input type="range" min={0.1} max={1.5} step={0.05} value={selectedObj.lightAngle ?? 0.5}
                                                        onChange={e => updateObjectProp(selectedObj.id, 'lightAngle', parseFloat(e.target.value))}
                                                        style={{ width: '100%' }} />
                                                    <span style={{ fontSize: 9, color: '#5a8aaa' }}>{(selectedObj.lightAngle ?? 0.5).toFixed(2)} rad</span>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Rain Properties */}
                                    {selectedObj.objectType === 'rain' && (
                                        <>
                                            <div style={sectionHeaderStyle}>RAIN</div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Intensity</label>
                                                <input type="range" min={0} max={1} step={0.05} value={selectedObj.rainIntensity ?? 0.8}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'rainIntensity', parseFloat(e.target.value))}
                                                    style={{ width: '100%' }} />
                                                <span style={{ fontSize: 9, color: '#5a8aaa' }}>{(selectedObj.rainIntensity ?? 0.8).toFixed(2)}</span>
                                            </div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Particle Count</label>
                                                <input type="range" min={500} max={10000} step={500} value={selectedObj.rainCount ?? 3000}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'rainCount', parseInt(e.target.value))}
                                                    style={{ width: '100%' }} />
                                                <span style={{ fontSize: 9, color: '#5a8aaa' }}>{selectedObj.rainCount ?? 3000}</span>
                                            </div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Area</label>
                                                <input type="range" min={10} max={200} step={5} value={selectedObj.rainArea ?? 40}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'rainArea', parseFloat(e.target.value))}
                                                    style={{ width: '100%' }} />
                                                <span style={{ fontSize: 9, color: '#5a8aaa' }}>{selectedObj.rainArea ?? 40}u</span>
                                            </div>
                                        </>
                                    )}

                                    {/* Water Properties */}
                                    {selectedObj.objectType === 'water' && (
                                        <>
                                            <div style={sectionHeaderStyle}>WATER</div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Water Level (Y)</label>
                                                <input type="range" min={-20} max={20} step={0.5} value={selectedObj.waterLevel ?? -2}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'waterLevel', parseFloat(e.target.value))}
                                                    style={{ width: '100%' }} />
                                                <span style={{ fontSize: 9, color: '#5a8aaa' }}>{(selectedObj.waterLevel ?? -2).toFixed(1)}</span>
                                            </div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Color</label>
                                                <input type="color" value={selectedObj.waterColor || '#0a2540'}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'waterColor', e.target.value)}
                                                    style={{ width: '100%', height: 28, background: 'none', border: 'none', cursor: 'pointer' }} />
                                            </div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Opacity</label>
                                                <input type="range" min={0} max={1} step={0.05} value={selectedObj.waterOpacity ?? 0.65}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'waterOpacity', parseFloat(e.target.value))}
                                                    style={{ width: '100%' }} />
                                                <span style={{ fontSize: 9, color: '#5a8aaa' }}>{(selectedObj.waterOpacity ?? 0.65).toFixed(2)}</span>
                                            </div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Size</label>
                                                <input type="range" min={50} max={500} step={10} value={selectedObj.waterSize ?? 200}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'waterSize', parseFloat(e.target.value))}
                                                    style={{ width: '100%' }} />
                                                <span style={{ fontSize: 9, color: '#5a8aaa' }}>{selectedObj.waterSize ?? 200}u</span>
                                            </div>
                                        </>
                                    )}

                                    {/* Material for primitives */}
                                    {(selectedObj.objectType === 'primitive' || !selectedObj.objectType) && selectedObj.modelPath === null && (
                                        <>
                                            <div style={sectionHeaderStyle}>MATERIAL</div>
                                            <div style={{ marginBottom: 6 }}>
                                                <label style={labelStyle}>Color</label>
                                                <input type="color" value={selectedObj.color || '#4488cc'}
                                                    onChange={e => updateObjectProp(selectedObj.id, 'color', e.target.value)}
                                                    style={{ width: '100%', height: 28, background: 'none', border: 'none', cursor: 'pointer' }} />
                                            </div>
                                        </>
                                    )}

                                    {/* Actions */}
                                    <div style={sectionHeaderStyle}>ACTIONS</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        <button onClick={() => updateObjectProp(selectedObj.id, 'visible', !selectedObj.visible)} style={actionBtnStyle}>
                                            {selectedObj.visible ? '🚫 Hide' : '👁 Show'}
                                        </button>
                                        <button onClick={() => updateObjectProp(selectedObj.id, 'locked', !selectedObj.locked)} style={actionBtnStyle}>
                                            {selectedObj.locked ? '🔓 Unlock Transform' : '🔒 Lock Transform'}
                                        </button>
                                        <button onClick={() => deleteObject(selectedObj.id)}
                                            style={{ ...actionBtnStyle, color: '#ff4466', borderColor: '#ff446630' }}>
                                            ✕ Delete Object
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Export / Import ── */}
                    {panelTab === 'export' && (
                        <div style={panelBodyStyle}>
                            <div style={sectionHeaderStyle}>EXPORT</div>
                            <textarea readOnly value={sceneJson}
                                placeholder="Click 'EXPORT' in the toolbar to generate..."
                                style={{ ...textareaStyle, height: 240 }} />
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                <button onClick={() => navigator.clipboard.writeText(sceneJson)} disabled={!sceneJson} style={actionBtnStyle}>📋 Copy</button>
                                <button onClick={() => {
                                    const blob = new Blob([sceneJson], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url; a.download = 'scene.json'; a.click();
                                }} disabled={!sceneJson} style={actionBtnStyle}>⬇ .json</button>
                            </div>
                            <div style={{ ...sectionHeaderStyle, marginTop: 18 }}>IMPORT</div>
                            <textarea value={importJson} onChange={e => setImportJson(e.target.value)}
                                placeholder="Paste scene JSON here..." style={{ ...textareaStyle, height: 110 }} />
                            <button onClick={importScene} disabled={!importJson}
                                style={{ ...actionBtnStyle, marginTop: 6, color: '#00ddaa', borderColor: '#00ddaa50' }}>
                                ⬆ Import Scene
                            </button>
                        </div>
                    )}
                </div>

                {/* ── 3D Viewport ── */}
                <div
                    ref={viewportRef}
                    style={{ flex: 1, position: 'relative', cursor: stagedAsset ? 'crosshair' : 'default' }}
                    onDragOver={handleViewportDragOver}
                    onDragLeave={handleViewportDragLeave}
                    onDrop={handleViewportDrop}
                    onClick={handleViewportClick}
                >
                    {/* Drop zone overlay */}
                    {isDragOver && (
                        <div style={dropOverlayStyle}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>⬡</div>
                            <div>DROP TO PLACE IN SCENE</div>
                        </div>
                    )}

                    {/* Staged asset viewport indicator */}
                    {stagedAsset && !isDragOver && (
                        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, background: '#00ddaa20', border: '1px solid #00ddaa50', padding: '6px 12px', borderRadius: 6, fontSize: 10, color: '#00ddaa', pointerEvents: 'none', backdropFilter: 'blur(4px)' }}>
                            🎯 Click to place: <b>{stagedAsset.label}</b> · <span style={{ color: '#5a8aaa' }}>Esc to cancel</span>
                        </div>
                    )}

                    <Canvas
                        shadows
                        camera={{ fov: 55, near: 0.1, far: 2000, position: [40, 35, 70] }}
                        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
                        style={{ background: '#070c14' }}
                    >
                        <Suspense fallback={null}>
                            <CameraCapture />
                            <Viewport
                                objects={objects}
                                selectedId={selectedId}
                                onSelect={setSelectedId}
                                onTransformChange={updateObjectTransform}
                                onTransformCommit={commitTransform}
                                transformMode={transformMode}
                                gridSnap={gridSnap}
                                snapSize={snapSize}
                                fitSignal={fitSignal}
                                onDropAtPoint={() => {}}
                                isDragOver={isDragOver}
                            />
                        </Suspense>
                    </Canvas>

                    {/* Keyboard hints */}
                    <div style={hintsStyle}>
                        W–Move · E–Rotate · R–Scale · F–Fit · Del–Delete · Cmd+Z–Undo · Double-click hierarchy to focus
                    </div>

                    {/* Status badge */}
                    <div style={badgeStyle}>
                        {objects.length} object{objects.length !== 1 ? 's' : ''}
                        {selectedObj && ` · ${selectedObj.name}`}
                        {gridSnap && ` · snap ${snapSize}u`}
                    </div>
                </div>
            </div>
        </div>
    );

    function CameraCapture() {
        const { camera } = useThree();
        useEffect(() => { cameraRef.current = camera; }, [camera]);
        return null;
    }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column',
    width: '100vw', height: '100vh',
    background: '#070c14',
    fontFamily: '"Roboto Mono", "SF Mono", monospace',
    color: '#c0d4e8', overflow: 'hidden',
};
const toolbarStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '0 14px', background: '#0a0e1a',
    borderBottom: '1px solid #1a2535', flexShrink: 0, height: 46,
};
const toolBtnStyle: React.CSSProperties = {
    background: 'transparent', border: '1px solid #2a3f5f',
    color: '#5a7a9a', padding: '4px 9px', borderRadius: 3,
    fontSize: 10, cursor: 'pointer', letterSpacing: 1,
    fontFamily: 'inherit', transition: 'all 0.12s', whiteSpace: 'nowrap',
};
const sep: React.CSSProperties = { width: 1, height: 22, background: '#1e2f42', margin: '0 6px' };
const snapLabelStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center',
    color: '#5a7a9a', fontSize: 10, cursor: 'pointer',
};
const selectStyle: React.CSSProperties = {
    background: '#0d1820', border: '1px solid #2a3f5f',
    color: '#7a9ab8', padding: '3px 6px', borderRadius: 3,
    fontSize: 10, fontFamily: 'inherit', cursor: 'pointer',
};
const leftPanelStyle: React.CSSProperties = {
    width: 280, flexShrink: 0, background: '#090e1a',
    borderRight: '1px solid #1a2535',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
const tabBtnStyle: React.CSSProperties = {
    flex: 1, background: 'transparent', border: 'none',
    padding: '10px 0', fontSize: 9, letterSpacing: 1.5,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s',
};
const panelBodyStyle: React.CSSProperties = {
    flex: 1, overflowY: 'auto', padding: '12px 10px',
};
const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 9, letterSpacing: 2, color: '#2a5a7a',
    marginBottom: 8, paddingBottom: 4,
    borderBottom: '1px solid #1a2535', textTransform: 'uppercase',
};
const assetBtnStyle: React.CSSProperties = {
    width: '100%', background: '#0d1525',
    border: '1px solid #1a2f45', color: '#7a9ab8',
    padding: '8px 10px', borderRadius: 4, fontSize: 11,
    cursor: 'grab', fontFamily: 'inherit', textAlign: 'left',
    marginBottom: 4, transition: 'all 0.12s', display: 'flex', gap: 6, alignItems: 'center',
};
const hierarchyItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 3,
    padding: '5px 6px', borderRadius: 3, cursor: 'pointer',
    color: '#8aaac8', marginBottom: 2, transition: 'all 0.1s',
};
const iconBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: '#3a5a7a',
    cursor: 'pointer', fontSize: 12, padding: '2px 4px',
    borderRadius: 2, lineHeight: 1,
};
const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, color: '#3a6a8a',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0d1820',
    border: '1px solid #1a3045', color: '#8ac0e0',
    padding: '4px 6px', borderRadius: 3,
    fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box',
};
const chipBtnStyle: React.CSSProperties = {
    background: '#0d1820', border: '1px solid #1a3045',
    color: '#5a8aaa', padding: '4px 8px', borderRadius: 10,
    fontSize: 9, cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: 0.5, whiteSpace: 'nowrap',
};
const actionBtnStyle: React.CSSProperties = {
    width: '100%', background: '#0d1820',
    border: '1px solid #1a3045', color: '#7aa8c8',
    padding: '7px 10px', borderRadius: 4,
    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
};
const textareaStyle: React.CSSProperties = {
    width: '100%', background: '#060c16',
    border: '1px solid #1a2535', color: '#4a7a9a',
    padding: 8, borderRadius: 4,
    fontSize: 10, fontFamily: 'inherit', resize: 'vertical',
    boxSizing: 'border-box', lineHeight: 1.5,
};
const hintsStyle: React.CSSProperties = {
    position: 'absolute', bottom: 12, left: '50%',
    transform: 'translateX(-50%)',
    background: '#00000085', color: '#3a5a7a',
    fontSize: 9, letterSpacing: 1, padding: '4px 14px',
    borderRadius: 12, backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
};
const badgeStyle: React.CSSProperties = {
    position: 'absolute', top: 12, left: 12,
    background: '#00000075', color: '#5a8aaa',
    fontSize: 10, letterSpacing: 1, padding: '4px 10px',
    borderRadius: 4, backdropFilter: 'blur(4px)',
};
const dropOverlayStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, zIndex: 10,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#00ddaa0a',
    border: '2px dashed #00ddaa60',
    color: '#00ddaa', fontSize: 12, letterSpacing: 3,
    pointerEvents: 'none',
    fontFamily: '"Roboto Mono", monospace',
};
