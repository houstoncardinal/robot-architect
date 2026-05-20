import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import {
  Environment,
  ContactShadows,
  OrbitControls,
  Html,
  useGLTF,
  useAnimations,
  Float,
  Sparkles,
} from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SkeletonUtils } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { RobotRole } from "@/lib/swarm";

type NodeState = {
  robot: RobotRole;
  status: "spawning" | "thinking" | "working" | "done";
};
type Pulse = { id: number; from: string; to: string };
type Props = {
  primeActive: boolean;
  nodes: NodeState[];
  pulses: Pulse[];
};

/** Free GLB models from threejs.org examples (CORS-enabled). */
const ROBOT_URL = "https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb";

useGLTF.preload(ROBOT_URL);

const COLOR_HEX: Record<RobotRole["color"], string> = {
  cyan: "#5a9bd8",     // sapphire
  magenta: "#d96a6a",  // rose
  amber: "#e9c46a",    // gold
  lime: "#7bbf9e",     // emerald
};

const PRIME_GOLD = "#e9c46a";

function ringPosition(i: number, total: number, radius = 3.6): [number, number, number] {
  const angle = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

/** A single GLB robot with retargeted animations + per-instance tint. */
function Robot({
  url,
  homePos,
  tint,
  isPrime,
  status,
  conversing,
  label,
  sub,
  scale = 0.42,
}: {
  url: string;
  homePos: [number, number, number];
  tint: string;
  isPrime?: boolean;
  status: NodeState["status"] | "idle";
  conversing: boolean;
  label: string;
  sub: string;
  scale?: number;
}) {
  const { scene, animations } = useGLTF(url) as any;
  // Clone with skinned-mesh support so each instance is independent.
  const cloned = useMemo(() => {
    const c = SkeletonUtils.clone(scene) as THREE.Object3D;
    const tintColor = new THREE.Color(tint);
    c.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          const m = o.material.clone();
          // Tint the original color toward the agent palette.
          if (m.color) {
            const base = m.color.clone();
            base.lerp(tintColor, isPrime ? 0.85 : 0.55);
            m.color.copy(base);
          }
          if ("metalness" in m) m.metalness = isPrime ? 0.9 : 0.55;
          if ("roughness" in m) m.roughness = isPrime ? 0.18 : 0.32;
          if (m.emissive) {
            m.emissive.set(tintColor);
            m.emissiveIntensity = isPrime ? 0.35 : 0.18;
          }
          o.material = m;
        }
      }
    });
    return c;
  }, [scene, tint, isPrime]);

  const group = useRef<THREE.Group>(null!);
  const { actions, names } = useAnimations(animations, group);

  // Pick animation per status.
  useEffect(() => {
    if (!actions || !names.length) return;
    let next = "Idle";
    if (status === "spawning") next = "Jump";
    else if (status === "working") next = conversing ? "Wave" : "Running";
    else if (status === "thinking") next = "Wave";
    else if (status === "done") next = "ThumbsUp";
    else if (isPrime) next = conversing ? "Wave" : "Idle";
    // Fallback if name missing.
    const pick = names.includes(next) ? next : names[0];
    Object.values(actions).forEach((a) => a?.fadeOut(0.3));
    const action = actions[pick];
    if (action) {
      action.reset().fadeIn(0.3).play();
      action.timeScale = next === "Running" ? 1.4 : 1;
    }
  }, [status, conversing, actions, names, isPrime]);

  // Smoothly move agent toward prime when conversing, else home.
  const target = useMemo(() => new THREE.Vector3(...homePos), [homePos]);
  const lookTarget = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  useFrame((_, dt) => {
    if (!group.current) return;
    // When conversing, agents step ~60% toward prime.
    if (conversing && !isPrime) {
      target.set(homePos[0] * 0.5, 0, homePos[2] * 0.5);
    } else {
      target.set(homePos[0], 0, homePos[2]);
    }
    group.current.position.lerp(target, Math.min(1, dt * 2.5));
    // Face the center (prime) — or for prime, face slightly forward
    if (!isPrime) {
      const dx = lookTarget.x - group.current.position.x;
      const dz = lookTarget.z - group.current.position.z;
      const desired = Math.atan2(dx, dz);
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, desired, Math.min(1, dt * 4));
    } else {
      group.current.rotation.y += dt * 0.25;
    }
  });

  return (
    <group ref={group} position={homePos} scale={scale} dispose={null}>
      <primitive object={cloned} />
      {/* Floating nameplate */}
      <Html
        position={[0, 2.6, 0]}
        center
        distanceFactor={8}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="whitespace-nowrap rounded-full px-3 py-1 text-center"
          style={{
            background: "linear-gradient(180deg, rgba(20,16,10,0.85), rgba(10,8,5,0.85))",
            border: `1px solid ${tint}`,
            boxShadow: `0 0 14px ${tint}55`,
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            className="font-mono text-[9px] font-bold tracking-[0.18em]"
            style={{ color: tint }}
          >
            {label}
          </div>
          <div className="font-mono text-[8px] uppercase tracking-widest text-white/60">
            {sub}
          </div>
        </div>
      </Html>
      {/* Status halo on floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.9, 1.0, 64]} />
        <meshBasicMaterial color={tint} transparent opacity={status === "done" ? 0.9 : 0.5} />
      </mesh>
    </group>
  );
}

/** A glowing data-packet that travels between two world positions. */
function Pulse3D({
  from,
  to,
  color,
  onDone,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  onDone: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt * 1.4;
    if (t.current >= 1) {
      onDone();
      return;
    }
    const p = from.clone().lerp(to, t.current);
    // arc upward
    p.y += Math.sin(t.current * Math.PI) * 1.2;
    if (ref.current) ref.current.position.copy(p);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} toneMapped={false} />
    </mesh>
  );
}

function Stage({ primeActive, nodes, pulses }: Props) {
  // Convert node ids -> world positions for pulses
  const positions = useMemo(() => {
    const m = new Map<string, THREE.Vector3>();
    m.set("PRIME", new THREE.Vector3(0, 1.2, 0));
    nodes.forEach((n, i) => {
      const [x, , z] = ringPosition(i, nodes.length);
      m.set(n.robot.codename, new THREE.Vector3(x * 0.6, 1.2, z * 0.6));
    });
    return m;
  }, [nodes]);

  const [activePulses, setActivePulses] = useState<{ id: number; from: THREE.Vector3; to: THREE.Vector3; color: string }[]>([]);

  useEffect(() => {
    pulses.forEach((p) => {
      const from = positions.get(p.from) ?? positions.get("PRIME")!;
      const to = positions.get(p.to) ?? positions.get("PRIME")!;
      const tint = nodes.find((n) => n.robot.codename === p.from || n.robot.codename === p.to)?.robot.color ?? "amber";
      setActivePulses((prev) => [...prev, { id: p.id, from: from.clone(), to: to.clone(), color: COLOR_HEX[tint] }]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulses]);

  const conversing = pulses.length > 0 || nodes.some((n) => n.status === "working");

  return (
    <>
      <color attach="background" args={["#0d0a07"]} />
      <fog attach="fog" args={["#0d0a07", 10, 26]} />

      {/* Cinematic key + rim lights */}
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[6, 8, 4]}
        intensity={1.6}
        color="#fff3d6"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-6, 4, -4]} intensity={0.6} color="#9ec5ff" />
      <pointLight position={[0, 3, 0]} intensity={1.2} color="#e9c46a" distance={10} decay={2} />

      <Environment preset="city" />

      {/* Marble floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <circleGeometry args={[10, 64]} />
        <meshStandardMaterial color="#1a1612" metalness={0.6} roughness={0.25} />
      </mesh>
      {/* Inlaid gold ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[3.55, 3.7, 128]} />
        <meshStandardMaterial color="#e9c46a" metalness={1} roughness={0.2} emissive="#7a5a1c" emissiveIntensity={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]}>
        <ringGeometry args={[1.2, 1.28, 128]} />
        <meshStandardMaterial color="#e9c46a" metalness={1} roughness={0.2} emissive="#7a5a1c" emissiveIntensity={0.4} />
      </mesh>

      <ContactShadows position={[0, 0.005, 0]} opacity={0.55} scale={18} blur={2.4} far={6} />

      <Sparkles count={60} scale={[14, 5, 14]} size={2} speed={0.3} color="#e9c46a" opacity={0.5} />

      {/* PRIME — center, slightly larger, gold */}
      <Float floatIntensity={0.2} rotationIntensity={0.1} speed={1.4}>
        <Robot
          url={ROBOT_URL}
          homePos={[0, 0, 0]}
          tint={PRIME_GOLD}
          isPrime
          status={primeActive ? "working" : "done"}
          conversing={conversing}
          label="PRIME"
          sub="orchestrator"
          scale={0.55}
        />
      </Float>

      {/* Agents around the ring */}
      {nodes.map((n, i) => {
        const home = ringPosition(i, nodes.length);
        const isConversing = pulses.some(
          (p) => p.from === n.robot.codename || p.to === n.robot.codename,
        );
        return (
          <Robot
            key={n.robot.id}
            url={ROBOT_URL}
            homePos={home}
            tint={COLOR_HEX[n.robot.color]}
            status={n.status}
            conversing={isConversing}
            label={n.robot.codename}
            sub={n.robot.skill}
          />
        );
      })}

      {/* Travelling data pulses */}
      {activePulses.map((p) => (
        <Pulse3D
          key={p.id}
          from={p.from}
          to={p.to}
          color={p.color}
          onDone={() => setActivePulses((prev) => prev.filter((x) => x.id !== p.id))}
        />
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={6}
        maxDistance={14}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.1}
        autoRotate
        autoRotateSpeed={0.35}
        target={[0, 1, 0]}
      />
    </>
  );
}

export function SwarmStage3D(props: Props) {
  // Avoid SSR canvas mount issues.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl glass">
      {/* Stage chrome */}
      <div className="pointer-events-none absolute left-5 top-4 z-10 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
        <span className="h-1 w-6 bg-gold" /> atelier · live
      </div>
      <div className="pointer-events-none absolute right-5 top-4 z-10 font-mono text-[10px] uppercase tracking-[0.3em] text-platinum/70">
        agents <span className="text-gold">{props.nodes.length.toString().padStart(2, "0")}</span>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.4em] text-platinum/50">
        drag to orbit · scroll to zoom
      </div>

      {mounted && (
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [6, 4.5, 8], fov: 38 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        >
          <Suspense fallback={null}>
            <Stage {...props} />
          </Suspense>
        </Canvas>
      )}
      {!mounted && (
        <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-widest text-platinum/60">
          loading atelier…
        </div>
      )}
    </div>
  );
}

// Silence unused-import warnings for tools imported defensively.
void useLoader;
void GLTFLoader;
