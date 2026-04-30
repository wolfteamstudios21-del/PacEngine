import React, { useRef, useEffect, useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePacRenderer } from "@/hooks/usePacRenderer";

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

interface Viewport3DProps {
  entities: Entity[];
  currentFrameEntities?: FrameEntity[];
  selectedEntityIndex: number | null;
  onSelectEntity: (index: number) => void;
  worldBounds: { min: number; max: number };
}

// ─── Atmospheric canvas renderer ────────────────────────────────────────────
// Draws a convincing 3D atmospheric scene using 2D Canvas API until the Vulkan
// bridge is wired in Phase 2.5.3.  All math is pure JS; no external deps.

function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  entities: Entity[],
  frameEntities: FrameEntity[],
  bounds: { min: number; max: number },
  selectedIndex: number | null
) {
  ctx.clearRect(0, 0, w, h);

  // Sky gradient — physical sky approximation
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
  sky.addColorStop(0, "#0a0f1e");
  sky.addColorStop(0.35, "#112244");
  sky.addColorStop(0.65, "#1a3a6e");
  sky.addColorStop(1, "#4a7abf");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.65);

  // Horizon haze
  const haze = ctx.createLinearGradient(0, h * 0.55, 0, h * 0.72);
  haze.addColorStop(0, "rgba(120,160,210,0)");
  haze.addColorStop(0.4, "rgba(180,210,240,0.45)");
  haze.addColorStop(1, "rgba(200,225,245,0.0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, h * 0.55, w, h * 0.17);

  // Ground
  const ground = ctx.createLinearGradient(0, h * 0.65, 0, h);
  ground.addColorStop(0, "#1c2a1e");
  ground.addColorStop(1, "#0e1610");
  ctx.fillStyle = ground;
  ctx.fillRect(0, h * 0.65, w, h * 0.35);

  // Sun disk (gently oscillating)
  const sunX = w * 0.72 + Math.sin(t * 0.0003) * 10;
  const sunY = h * 0.22;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 90);
  sunGlow.addColorStop(0, "rgba(255,230,140,0.95)");
  sunGlow.addColorStop(0.08, "rgba(255,200,80,0.6)");
  sunGlow.addColorStop(0.3, "rgba(200,160,60,0.2)");
  sunGlow.addColorStop(1, "rgba(100,120,180,0)");
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,235,160,1)";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
  ctx.fill();

  // Perspective grid on the "ground" plane
  const horizon  = h * 0.65;
  const vp       = { x: w * 0.5, y: horizon };

  ctx.save();
  ctx.strokeStyle = "rgba(80,160,80,0.18)";
  ctx.lineWidth   = 0.8;

  const gridCols = 18;
  const spread   = w * 2.2;
  for (let i = 0; i <= gridCols; i++) {
    const bx = -spread / 2 + (i / gridCols) * spread;
    const by = h;
    ctx.beginPath();
    ctx.moveTo(vp.x, vp.y);
    ctx.lineTo(vp.x + bx, by);
    ctx.stroke();
  }
  const gridRows = 10;
  for (let j = 1; j <= gridRows; j++) {
    const t2   = j / gridRows;
    const persp = 1 - Math.pow(1 - t2, 2.5);
    const y    = horizon + persp * (h - horizon);
    const xSpan = 0 + persp * (spread / 2);
    ctx.beginPath();
    ctx.moveTo(vp.x - xSpan, y);
    ctx.lineTo(vp.x + xSpan, y);
    ctx.stroke();
  }
  ctx.restore();

  // Fog overlay over ground
  const fog = ctx.createLinearGradient(0, horizon - 20, 0, horizon + 60);
  fog.addColorStop(0, "rgba(180,210,240,0)");
  fog.addColorStop(0.5, "rgba(170,200,230,0.22)");
  fog.addColorStop(1, "rgba(160,195,220,0)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, horizon - 20, w, 80);

  // Entity spheres — projected onto the ground plane using simple perspective
  const range = bounds.max - bounds.min || 1;

  entities.forEach((e, i) => {
    const fe = frameEntities.find((f) => f.index === i);
    let nx: number, nz: number;

    if (fe?.position) {
      nx = (fe.position.x - bounds.min) / range;
      nz = (fe.position.z - bounds.min) / range;
    } else {
      const seed = i * 137.5;
      nx = 0.2 + ((Math.sin(seed) * 0.5 + 0.5) * 0.6);
      nz = 0.2 + ((Math.cos(seed) * 0.5 + 0.5) * 0.6);
    }

    // Perspective project from normalised ground coords
    const depth   = nz;                                   // 0 (far) … 1 (near)
    const persp   = 0.15 + depth * 0.85;
    const screenX = w * 0.5 + (nx - 0.5) * w * persp;
    const screenY = horizon + depth * (h - horizon) * 0.72;
    const radius  = 4 + persp * 12;

    const isAgent    = e.type === "agent";
    const isSelected = selectedIndex === i;

    // Shadow
    const shadow = ctx.createRadialGradient(screenX, screenY + radius, 0, screenX, screenY + radius, radius * 2.5);
    shadow.addColorStop(0, "rgba(0,0,0,0.35)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(screenX, screenY + radius, radius * 2, radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sphere body
    const color = isAgent ? "#3b82f6" : "#f97316";
    const sphere = ctx.createRadialGradient(
      screenX - radius * 0.25, screenY - radius * 0.25, radius * 0.05,
      screenX, screenY, radius
    );
    sphere.addColorStop(0, isSelected ? "#ffffff" : (isAgent ? "#93c5fd" : "#fdba74"));
    sphere.addColorStop(0.5, color);
    sphere.addColorStop(1, isAgent ? "#1d4ed8" : "#c2410c");
    ctx.fillStyle = sphere;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle    = `rgba(255,255,255,${0.55 + persp * 0.45})`;
    ctx.font         = `${9 + persp * 4}px monospace`;
    ctx.textAlign    = "center";
    ctx.fillText(e.id, screenX, screenY - radius - 4);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Viewport3D({
  entities,
  currentFrameEntities = [],
  selectedEntityIndex,
  onSelectEntity,
  worldBounds,
}: Viewport3DProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const [webgpu, setWebgpu] = useState<boolean | null>(null);

  usePacRenderer({ canvasRef, enabled: true });

  // WebGPU availability check
  useEffect(() => {
    const nav = navigator as Navigator & { gpu?: unknown };
    setWebgpu("gpu" in nav && nav.gpu != null);
  }, []);

  // Atmospheric canvas render loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawAtmosphere(
      ctx,
      canvas.width,
      canvas.height,
      performance.now(),
      entities,
      currentFrameEntities,
      worldBounds,
      selectedEntityIndex
    );
    rafRef.current = requestAnimationFrame(draw);
  }, [entities, currentFrameEntities, worldBounds, selectedEntityIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });
    ro.observe(canvas);
    canvas.width  = canvas.clientWidth  || 800;
    canvas.height = canvas.clientHeight || 450;

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [draw]);

  // Entity click hit-test on canvas
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx   = e.clientX - rect.left;
      const my   = e.clientY - rect.top;
      const w    = canvas.width;
      const h    = canvas.height;
      const horizon = h * 0.65;
      const spread  = w * 2.2;
      const range   = worldBounds.max - worldBounds.min || 1;

      let closest = -1;
      let minDist = Infinity;

      entities.forEach((ent, i) => {
        const fe = currentFrameEntities.find((f) => f.index === i);
        let nx: number, nz: number;
        if (fe?.position) {
          nx = (fe.position.x - worldBounds.min) / range;
          nz = (fe.position.z - worldBounds.min) / range;
        } else {
          const seed = i * 137.5;
          nx = 0.2 + (Math.sin(seed) * 0.5 + 0.5) * 0.6;
          nz = 0.2 + (Math.cos(seed) * 0.5 + 0.5) * 0.6;
        }
        const depth   = nz;
        const persp   = 0.15 + depth * 0.85;
        const screenX = w * 0.5 + (nx - 0.5) * w * persp;
        const screenY = horizon + depth * (h - horizon) * 0.72;
        const radius  = 4 + persp * 12 + 8; // generous hit area
        const dist    = Math.hypot(mx - screenX, my - screenY);
        if (dist < radius && dist < minDist) { minDist = dist; closest = i; }
        void ent; void spread;
      });
      if (closest >= 0) onSelectEntity(closest);
    },
    [entities, currentFrameEntities, worldBounds, onSelectEntity]
  );

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0f1e]">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onClick={handleClick}
        style={{ cursor: "crosshair" }}
      />

      {/* Status badge */}
      <div className="absolute top-0 w-full h-8 bg-gradient-to-b from-black/60 to-transparent z-10 flex items-center px-4 pointer-events-none gap-2">
        <span className="text-[10px] font-mono text-white/60 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          3D Atmospheric View
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
          {webgpu === true ? "WebGPU ready" : webgpu === false ? "WebGPU unavailable" : "WebGPU checking…"}
        </Badge>
        <Badge
          variant="outline"
          className="text-[9px] h-4 font-mono bg-blue-500/10 text-blue-400 border-blue-500/30"
        >
          Renderer: M2.5 stub
        </Badge>
      </div>

      {/* Phase callout when no entities */}
      {entities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-1">
            <div className="text-xs font-mono text-white/30">No entities in world</div>
            <div className="text-[10px] text-white/20">Import a .pacexport to populate the scene</div>
          </div>
        </div>
      )}
    </div>
  );
}
