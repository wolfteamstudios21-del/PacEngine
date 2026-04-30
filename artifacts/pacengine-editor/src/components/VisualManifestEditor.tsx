import React, { useState, useEffect, useCallback } from "react";
import {
  useUpdateVisualManifest,
  getGetProjectQueryKey,
  VisualManifest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sun, Sparkles, Lightbulb, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Colour helpers ───────────────────────────────────────────────────────────

function rgb01ToHex(rgb: number[]): string {
  const [r = 1, g = 1, b = 1] = rgb;
  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb01(hex: string): number[] {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

// ─── Numeric input helper ─────────────────────────────────────────────────────

function NumField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <span className="text-[11px] font-mono text-foreground/80">{value.toFixed(2)}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="h-4"
      />
    </div>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface VisualManifestEditorProps {
  manifest: VisualManifest;
  projectId: string;
  onSaved: (manifest: VisualManifest) => void;
  onDraftChange?: (manifest: VisualManifest) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VisualManifestEditor({
  manifest,
  projectId,
  onSaved,
  onDraftChange,
}: VisualManifestEditorProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [draft, setDraft] = useState<VisualManifest>(manifest);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setDraft(manifest);
    setIsDirty(false);
  }, [manifest]);

  const patch = useCallback(
    (updater: (m: VisualManifest) => VisualManifest) => {
      setDraft((prev) => {
        const next = updater(prev);
        setIsDirty(true);
        onDraftChange?.(next);
        return next;
      });
    },
    [onDraftChange]
  );

  const patchEnv = useCallback(
    (partial: Partial<NonNullable<VisualManifest["environment"]>>) => {
      patch((m) => ({
        ...m,
        environment: { ...(m.environment ?? {}), ...partial },
      }));
    },
    [patch]
  );

  const patchGi = useCallback(
    (partial: Partial<NonNullable<VisualManifest["global_illumination"]>>) => {
      patch((m) => ({
        ...m,
        global_illumination: { ...(m.global_illumination ?? {}), ...partial },
      }));
    },
    [patch]
  );

  const patchPp = useCallback(
    (partial: Partial<NonNullable<VisualManifest["post_processing"]>>) => {
      patch((m) => ({
        ...m,
        post_processing: { ...(m.post_processing ?? {}), ...partial },
      }));
    },
    [patch]
  );

  const mutation = useUpdateVisualManifest({
    mutation: {
      onSuccess: (saved) => {
        setIsDirty(false);
        void queryClient.invalidateQueries({
          queryKey: getGetProjectQueryKey(projectId),
        });
        onSaved(saved);
        toast({ title: "Visual manifest saved" });
      },
      onError: () => toast({ title: "Failed to save manifest", variant: "destructive" }),
    },
  });

  const handleSave = () => {
    mutation.mutate({ projectId, data: draft });
  };

  const handleReset = () => {
    setDraft(manifest);
    setIsDirty(false);
  };

  const env = draft.environment ?? {};
  const gi  = draft.global_illumination ?? {};
  const pp  = draft.post_processing ?? {};

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium flex items-center gap-1.5 flex-1 border-b border-border pb-1">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Visual Properties
          {manifest.visual_version && (
            <Badge variant="outline" className="text-[9px] h-4 ml-auto font-mono">
              v{manifest.visual_version}
            </Badge>
          )}
        </h3>
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
          <span className="text-[11px] text-amber-400 flex-1">Unsaved changes</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] text-muted-foreground"
            onClick={handleReset}
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
          <Button
            size="sm"
            className="h-6 px-3 text-[10px] bg-amber-500 hover:bg-amber-600 text-black"
            onClick={handleSave}
            disabled={mutation.isPending}
          >
            <Save className="h-3 w-3 mr-1" />
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}

      {/* ── Environment ────────────────────────────────────────────────── */}
      <div className="p-2 rounded bg-muted/30 border border-border/50 space-y-3">
        <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
          <Sun className="h-3 w-3 text-yellow-400" /> Environment
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Sky Type</Label>
          <Select
            value={(env as any).sky_type ?? "physical"}
            onValueChange={(v) => patchEnv({ sky_type: v as any })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["physical", "hdr_cubemap", "procedural", "simple"].map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <NumField
          label="Sun Intensity"
          value={(env as any).sun_intensity ?? 1.0}
          min={0}
          max={5}
          step={0.05}
          onChange={(v) => patchEnv({ sun_intensity: v })}
        />

        <NumField
          label="Ambient Intensity"
          value={(env as any).ambient_intensity ?? 0.5}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => patchEnv({ ambient_intensity: v })}
        />

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Sun Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={rgb01ToHex((env as any).sun_color ?? [1, 0.9, 0.7])}
              onChange={(e) => patchEnv({ sun_color: hexToRgb01(e.target.value) as [number, number, number] })}
              className="h-7 w-10 rounded border border-border/60 bg-muted cursor-pointer p-0.5"
            />
            <span className="text-[10px] font-mono text-muted-foreground">
              [{((env as any).sun_color ?? [1, 0.9, 0.7]).map((v: number) => v.toFixed(2)).join(", ")}]
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-between">
          <Label className="text-[11px] text-muted-foreground">Fog Enabled</Label>
          <Switch
            checked={(env as any).fog_enabled ?? false}
            onCheckedChange={(v) => patchEnv({ fog_enabled: v })}
            className="scale-75"
          />
        </div>

        {(env as any).fog_enabled && (
          <>
            <NumField
              label="Fog Density"
              value={(env as any).fog_density ?? 0.02}
              min={0}
              max={0.5}
              step={0.005}
              onChange={(v) => patchEnv({ fog_density: v })}
            />
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Fog Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={rgb01ToHex((env as any).fog_color ?? [0.7, 0.8, 0.9])}
                  onChange={(e) => patchEnv({ fog_color: hexToRgb01(e.target.value) as [number, number, number] })}
                  className="h-7 w-10 rounded border border-border/60 bg-muted cursor-pointer p-0.5"
                />
                <span className="text-[10px] font-mono text-muted-foreground">
                  [{((env as any).fog_color ?? [0.7, 0.8, 0.9]).map((v: number) => v.toFixed(2)).join(", ")}]
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Global Illumination ────────────────────────────────────────── */}
      <div className="p-2 rounded bg-muted/30 border border-border/50 space-y-3">
        <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
          <Lightbulb className="h-3 w-3 text-green-400" /> Global Illumination
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">GI Type</Label>
          <Select
            value={(gi as any).gi_type ?? "probe_grid"}
            onValueChange={(v) => patchGi({ gi_type: v as any })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["none", "probe_grid", "voxel", "hybrid"].map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Probe Density</Label>
          <Select
            value={typeof (gi as any).probe_density === "string" ? (gi as any).probe_density : "medium"}
            onValueChange={(v) => patchGi({ probe_density: v as any })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["low", "medium", "high"].map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Post-Processing ────────────────────────────────────────────── */}
      <div className="p-2 rounded bg-muted/30 border border-border/50 space-y-3">
        <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-cyan-400" /> Post-Processing
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Tonemap</Label>
          <Select
            value={(pp as any).tonemap ?? "aces"}
            onValueChange={(v) => patchPp({ tonemap: v })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["aces", "filmic", "linear"].map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <NumField
          label="Exposure"
          value={(pp as any).exposure ?? 1.0}
          min={0.1}
          max={4}
          step={0.05}
          onChange={(v) => patchPp({ exposure: v })}
        />

        <NumField
          label="Bloom Intensity"
          value={(pp as any).bloom_intensity ?? 0.3}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => patchPp({ bloom_intensity: v })}
        />

        <NumField
          label="Contrast"
          value={(pp as any).contrast ?? 1.0}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => patchPp({ contrast: v })}
        />

        <NumField
          label="Saturation"
          value={(pp as any).saturation ?? 1.0}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => patchPp({ saturation: v })}
        />
      </div>

      {!isDirty && (
        <Button
          size="sm"
          className="w-full h-7 text-[11px]"
          variant="outline"
          onClick={handleSave}
          disabled={mutation.isPending}
        >
          <Save className="h-3 w-3 mr-1" />
          {mutation.isPending ? "Saving…" : "Save Visual Settings"}
        </Button>
      )}
    </div>
  );
}
