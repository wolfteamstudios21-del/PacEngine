import React, { useRef, useEffect, useState, useMemo, Suspense, useCallback } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Sky,
  Grid,
  useGLTF,
  Billboard,
  Text,
} from "@react-three/drei";
import * as THREE from "three";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VisualManifest } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Entity {
  id: string;
  type: string;
}

interface EntityPosition {
  x: number;
  y: number;
  z: number;
}

interface FrameEntity {
  index: number;
  pacId?: string;
  position?: EntityPosition;
}

interface ArtLibraryMesh {
  modelId: string;
  storageKey: string;
  name: string;
}

export interface Viewport3DProps {
  entities: Entity[];
  currentFrameEntities?: FrameEntity[];
  selectedEntityIndex: number | null;
  onSelectEntity: (index: number) => void;
  worldBounds: { min: number; max: number };
  artLibraryMeshes?: ArtLibraryMesh[];
  visualManifest?: VisualManifest;
}

// ─── Entity colours ───────────────────────────────────────────────────────────

const AGENT_COLOR    = new THREE.Color("#3b82f6");
const OBSTACLE_COLOR = new THREE.Color("#f97316");
const SELECT_COLOR   = new THREE.Color("#ffffff");

// ─── GltfModel — loads a .glb from object storage ─────────────────────────────

function GltfModel({ url, position }: { url: string; position: [number, number, number] }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(), [scene]);
  return <primitive object={clone} position={position} scale={0.5} />;
}

// ─── EntityMesh — one entity in the scene ─────────────────────────────────────

function EntityMesh({
  entity,
  index,
  position,
  isSelected,
  onSelect,
  trailPoints,
}: {
  entity: Entity;
  index: number;
  position: THREE.Vector3;
  isSelected: boolean;
  onSelect: (i: number) => void;
  trailPoints: THREE.Vector3[];
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isAgent = entity.type === "agent";
  const color   = isSelected ? SELECT_COLOR : (isAgent ? AGENT_COLOR : OBSTACLE_COLOR);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.position.lerp(position, 1 - Math.exp(-10 * delta));
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect(index);
    },
    [index, onSelect]
  );

  const trailGeometry = useMemo(() => {
    if (trailPoints.length < 2) return null;
    const geo = new THREE.BufferGeometry().setFromPoints(trailPoints);
    return geo;
  }, [trailPoints]);

  return (
    <group>
      {/* Trail */}
      {trailGeometry && (
        <line>
          <bufferGeometry attach="geometry" {...trailGeometry} />
          <lineBasicMaterial
            attach="material"
            color={isAgent ? "#3b82f6" : "#f97316"}
            opacity={0.35}
            transparent
          />
        </line>
      )}

      {/* Body */}
      <mesh
        ref={meshRef}
        position={position}
        onClick={handleClick}
        castShadow
        receiveShadow
      >
        {isAgent ? (
          <sphereGeometry args={[0.28, 16, 12]} />
        ) : (
          <boxGeometry args={[0.4, 0.4, 0.4]} />
        )}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.6 : 0.15}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh position={position}>
          <torusGeometry args={[0.42, 0.04, 8, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}

      {/* Label */}
      <Billboard position={[position.x, position.y + 0.55, position.z]} follow lockX={false} lockY={false} lockZ={false}>
        <Text
          fontSize={0.18}
          color={isSelected ? "#ffffff" : "rgba(200,220,255,0.7)"}
          anchorX="center"
          anchorY="bottom"
          font={undefined}
          outlineWidth={0.04}
          outlineColor="#000000"
        >
          {entity.id}
        </Text>
      </Billboard>

      {/* Ground shadow disk */}
      <mesh position={[position.x, 0.01, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 16]} />
        <meshBasicMaterial color="#000000" opacity={0.22} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ─── EntityTrailStore — keeps last N positions per entity ─────────────────────

function useEntityTrails(
  frameEntities: FrameEntity[],
  worldBounds: { min: number; max: number },
  maxLen = 40
) {
  const store = useRef<Map<number, THREE.Vector3[]>>(new Map());

  const getTrail = useCallback(
    (index: number, cur: THREE.Vector3): THREE.Vector3[] => {
      const arr = store.current.get(index) ?? [];
      if (arr.length === 0 || !arr[arr.length - 1].equals(cur)) {
        arr.push(cur.clone());
        if (arr.length > maxLen) arr.shift();
        store.current.set(index, arr);
      }
      return arr;
    },
    [maxLen]
  );

  // clear when frame resets
  useEffect(() => {
    store.current.clear();
  }, [frameEntities.length]);

  return getTrail;
}

// ─── Scene contents ───────────────────────────────────────────────────────────

function SceneContent({
  entities,
  currentFrameEntities,
  selectedEntityIndex,
  onSelectEntity,
  worldBounds,
  artLibraryMeshes = [],
  visualManifest,
}: Viewport3DProps) {
  const range   = Math.max(worldBounds.max - worldBounds.min, 1);
  const scale   = 10 / range;
  const getTrail = useEntityTrails(currentFrameEntities ?? [], worldBounds);

  const { camera, gl } = useThree();
  useEffect(() => {
    camera.position.set(0, 6, 12);
    camera.lookAt(0, 0, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve visual manifest values with sensible defaults
  const env = visualManifest?.environment as any;
  const pp  = visualManifest?.post_processing as any;

  const sunDir: [number, number, number] = env?.sun_direction
    ? [env.sun_direction[0], env.sun_direction[1], env.sun_direction[2]]
    : [0.72, 0.22, -0.5];
  const sunIntensity  = env?.sun_intensity  ?? 1.8;
  const ambientInt    = env?.ambient_intensity ?? 0.5;
  const fogEnabled    = env?.fog_enabled ?? false;
  const fogDensity    = env?.fog_density ?? 0.02;
  const fogColorArr: number[] = env?.fog_color ?? [0.72, 0.84, 0.94];
  const fogHex        = `rgb(${fogColorArr.map((v: number) => Math.round(v * 255)).join(",")})`;
  const exposure      = pp?.exposure ?? 1.0;

  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  // Compute entity world positions
  const entityPositions = useMemo(() => {
    return entities.map((_, i) => {
      const fe = (currentFrameEntities ?? []).find((f) => f.index === i);
      let wx: number, wz: number;
      if (fe?.position) {
        wx = (fe.position.x - worldBounds.min) * scale - 5;
        wz = (fe.position.z - worldBounds.min) * scale - 5;
      } else {
        const seed = i * 137.5;
        wx = (Math.sin(seed) * 0.5 + 0.5) * 8 - 4;
        wz = (Math.cos(seed) * 0.5 + 0.5) * 8 - 4;
      }
      return new THREE.Vector3(wx, 0.28, wz);
    });
  }, [entities, currentFrameEntities, worldBounds, scale]);

  return (
    <>
      {/* Lights */}
      <ambientLight intensity={ambientInt} />
      <directionalLight
        position={sunDir}
        intensity={sunIntensity}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={50}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <hemisphereLight args={["#b0ccff", "#1c2a1e", 0.5]} />

      {/* Sky */}
      <Sky
        distance={450000}
        sunPosition={sunDir}
        inclination={0.49}
        azimuth={0.25}
        turbidity={6}
        rayleigh={0.5}
      />

      {/* Atmosphere fog */}
      {fogEnabled && <fog attach="fog" args={[fogHex, 18 / Math.max(fogDensity * 50, 0.01), 60]} />}
      {!fogEnabled && <fog attach="fog" args={["#b8d4f0", 60, 200]} />}

      {/* Ground */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#1c2a1e" roughness={0.9} metalness={0} />
      </mesh>

      {/* Perspective grid */}
      <Grid
        args={[24, 24]}
        position={[0, 0.005, 0]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#3a6040"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#4a8050"
        fadeDistance={28}
        fadeStrength={1}
        infiniteGrid
      />

      {/* Entities */}
      {entities.map((entity, i) => {
        const pos   = entityPositions[i];
        const trail = getTrail(i, pos);
        return (
          <EntityMesh
            key={entity.id}
            entity={entity}
            index={i}
            position={pos}
            isSelected={selectedEntityIndex === i}
            onSelect={onSelectEntity}
            trailPoints={trail}
          />
        );
      })}

      {/* Art Library static meshes */}
      {artLibraryMeshes.map((m, i) => {
        const url = `/api/storage/object/${m.storageKey}`;
        const angle = (i / Math.max(artLibraryMeshes.length, 1)) * Math.PI * 2;
        const pos: [number, number, number] = [
          Math.cos(angle) * 3,
          0,
          Math.sin(angle) * 3,
        ];
        return (
          <Suspense key={m.modelId} fallback={null}>
            <GltfModel url={url} position={pos} />
          </Suspense>
        );
      })}

      {/* Orbit camera */}
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        minDistance={2}
        maxDistance={40}
        maxPolarAngle={Math.PI / 2 - 0.05}
        enablePan
        panSpeed={0.6}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
    </>
  );
}

// ─── Loading fallback ─────────────────────────────────────────────────────────

function CanvasLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1e]">
      <div className="text-xs font-mono text-white/30 animate-pulse">Initialising 3D scene…</div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function Viewport3D(props: Viewport3DProps) {
  const { entities, artLibraryMeshes = [] } = props;
  const [webgpu, setWebgpu] = useState<boolean | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { gpu?: unknown };
    setWebgpu("gpu" in nav && nav.gpu != null);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0f1e]">
      <Suspense fallback={<CanvasLoader />}>
        <Canvas
          shadows
          camera={{ position: [0, 6, 12], fov: 60, near: 0.1, far: 500 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          style={{ width: "100%", height: "100%" }}
        >
          <SceneContent {...props} artLibraryMeshes={artLibraryMeshes} />
        </Canvas>
      </Suspense>

      {/* HUD overlay */}
      <div className="absolute top-0 w-full h-8 bg-gradient-to-b from-black/60 to-transparent z-10 flex items-center px-4 pointer-events-none gap-2">
        <span className="text-[10px] font-mono text-white/60 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          3D Live Scene
        </span>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-4 font-mono",
            webgpu === true
              ? "bg-green-500/10 text-green-400 border-green-500/30"
              : webgpu === false
              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
              : "bg-muted/30 text-muted-foreground border-border"
          )}
        >
          {webgpu === true ? "WebGPU ready" : webgpu === false ? "WebGPU unavailable" : "WebGPU…"}
        </Badge>
        <Badge variant="outline" className="text-[9px] h-4 font-mono bg-blue-500/10 text-blue-400 border-blue-500/30">
          Three.js r3f
        </Badge>
        {artLibraryMeshes.length > 0 && (
          <Badge variant="outline" className="text-[9px] h-4 font-mono bg-violet-500/10 text-violet-400 border-violet-500/30">
            {artLibraryMeshes.length} model{artLibraryMeshes.length !== 1 ? "s" : ""} loaded
          </Badge>
        )}
        <span className="ml-auto text-[9px] font-mono text-white/25">LMB rotate · RMB pan · scroll zoom</span>
      </div>

      {/* Empty state */}
      {entities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center space-y-1">
            <div className="text-xs font-mono text-white/30">No entities in world</div>
            <div className="text-[10px] text-white/20">Import a .pacexport to populate the scene</div>
          </div>
        </div>
      )}
    </div>
  );
}
