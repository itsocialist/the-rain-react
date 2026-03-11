import React, { Suspense, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useControls } from 'leva';
import * as THREE from 'three';
import { OBJLoader, MTLLoader } from 'three-stdlib';

const MODELS = [
    { name: 'Full City', path: '/models/full_gameready_city_buildings.glb', type: 'glb' },
    { name: 'Building 1', path: '/models/building_1.glb', type: 'glb' },
    { name: 'Building 2', path: '/models/building_2.glb', type: 'glb' },
    { name: 'City Pack', path: '/models/city_pack.glb', type: 'glb' },
    { name: 'City Pack 3', path: '/models/city_pack_3.glb', type: 'glb' },
    { name: 'City Pack 7', path: '/models/city_pack_7.glb', type: 'glb' },
    { name: 'City Pack 8', path: '/models/city_pack_8.glb', type: 'glb' },
    { name: 'San Francisco (OBJ)', path: '/models/SanFrancisco_City.OBJ/SanFrancisco_City.obj', type: 'obj', mtl: '/models/SanFrancisco_City.OBJ/SanFrancisco_City.mtl' },
];

function ModelRenderer({ path, type, mtl, materialConfig }: any) {
    if (type === 'glb') {
        const { scene } = useGLTF(path) as any;
        
        // Clone so we don't mutate the cached loaded object permanently across switches
        const clonedScene = useMemo(() => scene.clone(true), [scene]);

        // Process materials
        useMemo(() => {
            clonedScene.traverse((child: any) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    mats.forEach(oldMat => {
                        const mat = oldMat as THREE.MeshStandardMaterial;
                        if (!mat) return;
                        
                        // Copy original color if not saved
                        if (mat.color && !mat.userData.originalColor) {
                            mat.userData.originalColor = mat.color.clone();
                        }

                        if (mat.color && mat.userData.originalColor) {
                            if (materialConfig.overrideColor) {
                                mat.color.set(materialConfig.color);
                            } else {
                                mat.color.copy(mat.userData.originalColor);
                            }
                        }

                        if (materialConfig.overrideRoughness) mat.roughness = materialConfig.roughness;
                        if (materialConfig.overrideMetalness) mat.metalness = materialConfig.metalness;
                        
                        if (mat.emissive && materialConfig.disableEmissive) {
                            mat.emissive.setHex(0x000000); // Stop self-glowing
                        }
                        
                        if (materialConfig.overrideEnvMap) mat.envMapIntensity = materialConfig.envMapIntensity;
                        
                        mat.needsUpdate = true;
                    });
                }
            });
        }, [clonedScene, materialConfig]);

        return <primitive object={clonedScene} />;
    }

    if (type === 'obj') {
        // First load MTL
        const materials = useLoader(MTLLoader as any, mtl) as any;
        materials.preload();
        
        // Then load OBJ with MTL
        const obj = useLoader(OBJLoader, path, (loader) => {
            loader.setMaterials(materials);
        });

        const clonedObj = useMemo(() => (obj as any).clone(true), [obj]);

        // Same material processing
        useMemo(() => {
            clonedObj.traverse((child: any) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    // MTL materials come as Phong or basic usually. We convert to standard to test wetness.
                    let mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    
                    const pMats = mats.map(m => {
                        const newMat = new THREE.MeshStandardMaterial().copy(m as THREE.MeshStandardMaterial);
                        return newMat;
                    });
                    mesh.material = pMats.length === 1 ? pMats[0] : pMats;

                    mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    
                    mats.forEach(oldMat => {
                        const mat = oldMat as THREE.MeshStandardMaterial;
                        
                        // Copy original color if not saved
                        if (mat.color && !mat.userData.originalColor) {
                            mat.userData.originalColor = mat.color.clone();
                        }

                        if (mat.color && mat.userData.originalColor) {
                            if (materialConfig.overrideColor) {
                                mat.color.set(materialConfig.color);
                            } else {
                                mat.color.copy(mat.userData.originalColor);
                            }
                        }

                        if (materialConfig.overrideRoughness) mat.roughness = materialConfig.roughness;
                        if (materialConfig.overrideMetalness) mat.metalness = materialConfig.metalness;
                        
                        // Need an environment map for metalness to work
                        if (materialConfig.overrideEnvMap) mat.envMapIntensity = materialConfig.envMapIntensity;
                        
                        mat.needsUpdate = true;
                    });
                }
            });
        }, [clonedObj, materialConfig]);

        return <primitive object={clonedObj} />;
    }

    return null;
}

export default function ModelViewer() {
    const { modelIndex } = useControls('Model Selection', {
        modelIndex: {
            value: 0,
            options: MODELS.reduce((acc: Record<string, number>, m, i) => {
                acc[m.name] = i;
                return acc;
            }, {} as Record<string, number>)
        }
    });

    const materialConfig = useControls('Material Overrides', {
        overrideColor: true,
        color: '#111622',
        overrideRoughness: true,
        roughness: { value: 0.15, min: 0, max: 1, step: 0.01 },
        overrideMetalness: true,
        metalness: { value: 0.7, min: 0, max: 1, step: 0.01 },
        overrideEnvMap: true,
        envMapIntensity: { value: 1.0, min: 0, max: 5, step: 0.1 },
        disableEmissive: true,
    });

    const lightConfig = useControls('Lighting', {
        ambient: { value: 0.2, min: 0, max: 2, step: 0.1 },
        dirLight: { value: 1.0, min: 0, max: 5, step: 0.1 },
    });

    const activeModel = MODELS[modelIndex];

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#050505' }}>
            <Canvas camera={{ position: [50, 50, 50], fov: 60 }}>
                <color attach="background" args={['#1a1a1a']} />
                
                <ambientLight intensity={lightConfig.ambient} />
                <directionalLight position={[100, 100, 50]} intensity={lightConfig.dirLight} castShadow />

                <Suspense fallback={null}>
                    <ModelRenderer 
                        path={activeModel.path} 
                        type={activeModel.type} 
                        mtl={activeModel.mtl} 
                        materialConfig={materialConfig} 
                    />
                </Suspense>

                <OrbitControls makeDefault />
                
                {/* Visual grid to see ground plane */}
                <gridHelper args={[200, 20]} />
                <axesHelper args={[50]} />
            </Canvas>
            
            <div style={{
                position: 'fixed', bottom: 20, left: 20,
                color: 'white', fontFamily: 'monospace', fontSize: '14px',
                background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '4px',
                pointerEvents: 'none'
            }}>
                Viewing: {activeModel.name}
            </div>
        </div>
    );
}
