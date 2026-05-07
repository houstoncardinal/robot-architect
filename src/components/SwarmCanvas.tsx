import { motion, AnimatePresence } from "framer-motion";
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

const colorVar: Record<RobotRole["color"], string> = {
  cyan: "var(--cyan)",
  magenta: "var(--magenta)",
  amber: "var(--amber)",
  lime: "var(--lime)",
};

const PRIME_POS = { x: 50, y: 50 };

function nodePos(i: number, total: number) {
  // arrange around prime in a circle
  const angle = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const r = 32;
  return {
    x: PRIME_POS.x + Math.cos(angle) * r,
    y: PRIME_POS.y + Math.sin(angle) * r,
  };
}

export function SwarmCanvas({ primeActive, nodes, pulses }: Props) {
  const positions = new Map<string, { x: number; y: number }>();
  positions.set("PRIME", PRIME_POS);
  nodes.forEach((n, i) => positions.set(n.robot.id, nodePos(i, nodes.length)));

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-panel-edge bg-panel/40 backdrop-blur">
      {/* corner ticks */}
      <div className="pointer-events-none absolute inset-0">
        {["top-3 left-3", "top-3 right-3", "bottom-3 left-3", "bottom-3 right-3"].map((p) => (
          <div key={p} className={`absolute ${p} h-3 w-3 border-cyan/60`} style={{
            borderTopWidth: p.includes("top") ? 1 : 0,
            borderBottomWidth: p.includes("bottom") ? 1 : 0,
            borderLeftWidth: p.includes("left") ? 1 : 0,
            borderRightWidth: p.includes("right") ? 1 : 0,
            borderColor: "var(--cyan)",
          }} />
        ))}
      </div>

      <div className="absolute left-4 top-4 z-10 font-mono text-[10px] uppercase tracking-widest text-cyan">
        ◉ swarm.live // node-graph
      </div>
      <div className="absolute right-4 top-4 z-10 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        agents: {nodes.length.toString().padStart(2, "0")}
      </div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          {(["cyan", "magenta", "amber", "lime"] as const).map((c) => (
            <linearGradient key={c} id={`grad-${c}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colorVar[c]} stopOpacity="0.1" />
              <stop offset="100%" stopColor={colorVar[c]} stopOpacity="0.9" />
            </linearGradient>
          ))}
        </defs>

        {/* connection lines */}
        {nodes.map((n) => {
          const p = positions.get(n.robot.id)!;
          return (
            <line
              key={n.robot.id}
              x1={PRIME_POS.x}
              y1={PRIME_POS.y}
              x2={p.x}
              y2={p.y}
              stroke={colorVar[n.robot.color]}
              strokeOpacity={n.status === "done" ? 0.7 : 0.35}
              strokeWidth={0.25}
              strokeDasharray="1 1.2"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {/* pulses traveling along lines */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        <AnimatePresence>
          {pulses.map((pulse) => {
            const a = positions.get(pulse.from);
            const b = positions.get(pulse.to);
            if (!a || !b) return null;
            return (
              <motion.circle
                key={pulse.id}
                r={0.7}
                fill="var(--cyan)"
                initial={{ cx: a.x, cy: a.y, opacity: 1 }}
                animate={{ cx: b.x, cy: b.y, opacity: 0.2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeInOut" }}
              />
            );
          })}
        </AnimatePresence>
      </svg>

      {/* PRIME node */}
      <NodeBubble
        x={PRIME_POS.x}
        y={PRIME_POS.y}
        label="PRIME"
        sub="orchestrator"
        emoji="🤖"
        color="cyan"
        size={88}
        active={primeActive}
        status={primeActive ? "working" : "done"}
      />

      {/* spawned nodes */}
      <AnimatePresence>
        {nodes.map((n, i) => {
          const p = nodePos(i, nodes.length);
          return (
            <NodeBubble
              key={n.robot.id}
              x={p.x}
              y={p.y}
              label={n.robot.codename}
              sub={n.robot.skill}
              emoji={n.robot.emoji}
              color={n.robot.color}
              size={64}
              active={n.status === "working" || n.status === "thinking"}
              status={n.status}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function NodeBubble({
  x,
  y,
  label,
  sub,
  emoji,
  color,
  size,
  active,
  status,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
  emoji: string;
  color: RobotRole["color"];
  size: number;
  active: boolean;
  status: "spawning" | "thinking" | "working" | "done";
}) {
  const c = colorVar[color];
  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
    >
      <div className="relative flex flex-col items-center">
        {active && (
          <span
            className="pulse-ring absolute rounded-full"
            style={{
              width: size,
              height: size,
              border: `1px solid ${c}`,
            }}
          />
        )}
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: size,
            height: size,
            background: `radial-gradient(circle at 30% 30%, color-mix(in oklab, ${c} 35%, transparent), color-mix(in oklab, ${c} 5%, var(--panel)))`,
            border: `1px solid ${c}`,
            boxShadow: `0 0 20px color-mix(in oklab, ${c} 40%, transparent), inset 0 0 12px color-mix(in oklab, ${c} 25%, transparent)`,
          }}
        >
          <span style={{ fontSize: size * 0.42 }}>{emoji}</span>
          {status === "done" && (
            <span
              className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold"
              style={{ background: "var(--lime)", color: "var(--background)" }}
            >
              ✓
            </span>
          )}
        </div>
        <div className="mt-2 text-center">
          <div className="font-mono text-[10px] font-bold tracking-wider" style={{ color: c }}>
            {label}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {sub}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
