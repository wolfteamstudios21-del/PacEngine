import React, { useState, useRef, useEffect } from "react";
import {
  useListModels,
  getListModelsQueryKey,
  useGenerateMeshyModel,
  usePollMeshyJob,
  getPollMeshyJobQueryKey,
  useGenerateBlendergptModel,
  usePollBlendergptJob,
  getPollBlendergptJobQueryKey,
  useDeleteModel,
  useRequestUploadUrl,
  useRegisterModel,
  useAddProjectMesh,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Box,
  Sparkles,
  Upload,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ArtLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
}

const ART_STYLE_OPTIONS = [
  { value: "realistic", label: "Realistic" },
  { value: "cartoon", label: "Cartoon" },
  { value: "low-poly", label: "Low Poly" },
  { value: "sculpture", label: "Sculpture" },
  { value: "pbr", label: "PBR" },
] as const;

function SourceBadge({ source }: { source: string }) {
  const colorMap: Record<string, string> = {
    meshy: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    blendergpt: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    upload: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  };
  const labelMap: Record<string, string> = {
    meshy: "Meshy.ai",
    blendergpt: "BlenderGPT",
    upload: "Upload",
  };
  return (
    <span
      className={cn(
        "text-[9px] px-1.5 py-0.5 rounded-full border font-medium uppercase tracking-wide",
        colorMap[source] ?? "bg-muted text-muted-foreground",
      )}
    >
      {labelMap[source] ?? source}
    </span>
  );
}

interface ModelCardProps {
  model: {
    id: string;
    name: string;
    source: string;
    storageKey: string;
    thumbnailUrl?: string | null;
    createdAt: string | Date;
  };
  onAddToProject: () => void;
  onDelete: () => void;
  isAdding: boolean;
}

function ModelCard({ model, onAddToProject, onDelete, isAdding }: ModelCardProps) {
  return (
    <div className="bg-background/60 border border-border rounded-lg overflow-hidden group hover:border-primary/40 transition-colors">
      <div className="h-24 bg-muted/30 flex items-center justify-center relative overflow-hidden">
        {model.thumbnailUrl ? (
          <img
            src={model.thumbnailUrl}
            alt={model.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Box className="h-8 w-8 text-muted-foreground/40" />
        )}
        <button
          className="absolute top-1 right-1 p-1 rounded bg-red-500/0 hover:bg-red-500/20 text-transparent hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
          onClick={onDelete}
          title="Remove from gallery"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="p-2 space-y-1.5">
        <p className="text-xs font-medium truncate" title={model.name}>
          {model.name}
        </p>
        <div className="flex items-center justify-between gap-1">
          <SourceBadge source={model.source} />
          <span className="text-[9px] text-muted-foreground font-mono">
            {new Date(model.createdAt).toLocaleDateString()}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-6 text-[10px] gap-1 mt-1"
          onClick={onAddToProject}
          disabled={isAdding}
        >
          {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add to Project
        </Button>
      </div>
    </div>
  );
}

function MeshyGenerateTab({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [artStyle, setArtStyle] = useState<string>("realistic");
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const generateMutation = useGenerateMeshyModel({
    mutation: {
      onSuccess: (data) => {
        setPendingJobId(data.jobId);
        setDone(false);
        toast({ title: "Meshy job started", description: "Polling for completion…" });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "Unknown error";
        toast({ title: "Meshy error", description: msg, variant: "destructive" });
      },
    },
  });

  const pollQuery = usePollMeshyJob(pendingJobId ?? "", {
    query: {
      enabled: !!pendingJobId,
      queryKey: getPollMeshyJobQueryKey(pendingJobId ?? "") as unknown as readonly unknown[],
      refetchInterval: (query) => {
        const s = query.state.data?.status;
        if (s === "SUCCEEDED" || s === "FAILED" || s === "EXPIRED") return false;
        return 3000;
      },
    },
  });

  const pollStatus = pollQuery.data?.status;
  const progress = pollQuery.data?.progress ?? 0;

  useEffect(() => {
    if (!pendingJobId) return;
    if (pollStatus === "SUCCEEDED") {
      setPendingJobId(null);
      setDone(true);
      onSuccess();
      toast({ title: "Model ready!", description: "Added to your gallery." });
    } else if (pollStatus === "FAILED" || pollStatus === "EXPIRED") {
      setPendingJobId(null);
      toast({ title: "Generation failed", description: `Job ended with status: ${pollStatus}`, variant: "destructive" });
    }
  }, [pollStatus, pendingJobId]);

  const isGenerating = generateMutation.isPending;
  const isPolling = !!pendingJobId;

  return (
    <div className="space-y-4 p-1">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Prompt</Label>
        <Textarea
          placeholder="A futuristic battle mech with glowing blue joints…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="text-xs resize-none h-20"
          disabled={isGenerating || isPolling}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Art Style</Label>
        <Select value={artStyle} onValueChange={setArtStyle} disabled={isGenerating || isPolling}>
          <SelectTrigger className="text-xs h-7">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ART_STYLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Negative prompt (optional)</Label>
        <Input
          placeholder="No wings, no organic parts…"
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          className="text-xs h-7"
          disabled={isGenerating || isPolling}
        />
      </div>

      {isPolling && (
        <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Generating…
            </span>
            <span className="font-mono text-violet-400">{progress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-violet-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, progress)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">{pollStatus ?? "PENDING"}</p>
        </div>
      )}

      {done && !isPolling && (
        <div className="flex items-center gap-2 text-green-400 text-xs p-2 rounded bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Model added to gallery!</span>
        </div>
      )}

      <Button
        className="w-full gap-2 text-xs"
        size="sm"
        onClick={() => {
          setDone(false);
          generateMutation.mutate({
            data: {
              prompt,
              artStyle: artStyle as any,
              negativePrompt: negativePrompt || undefined,
            },
          });
        }}
        disabled={!prompt.trim() || isGenerating || isPolling}
      >
        {isGenerating || isPolling ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        {isPolling ? "Generating…" : "Generate with Meshy.ai"}
      </Button>

      <p className="text-[10px] text-muted-foreground text-center">
        Requires{" "}
        <code className="bg-muted px-1 rounded font-mono">MESHY_API_KEY</code> secret in project settings.
      </p>
    </div>
  );
}

function BlenderGPTGenerateTab({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const generateMutation = useGenerateBlendergptModel({
    mutation: {
      onSuccess: (data) => {
        setPendingJobId(data.jobId);
        setDone(false);
        toast({ title: "BlenderGPT job started", description: "Polling for completion…" });
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "Unknown error";
        toast({ title: "BlenderGPT error", description: msg, variant: "destructive" });
      },
    },
  });

  const pollQuery = usePollBlendergptJob(pendingJobId ?? "", {
    query: {
      enabled: !!pendingJobId,
      queryKey: getPollBlendergptJobQueryKey(pendingJobId ?? "") as unknown as readonly unknown[],
      refetchInterval: (query) => {
        const s = query.state.data?.status;
        if (s === "SUCCEEDED" || s === "FAILED") return false;
        return 3000;
      },
    },
  });

  const pollStatus = pollQuery.data?.status;
  const progress = pollQuery.data?.progress;

  useEffect(() => {
    if (!pendingJobId) return;
    if (pollStatus === "SUCCEEDED") {
      setPendingJobId(null);
      setDone(true);
      onSuccess();
      toast({ title: "Model ready!", description: "Added to your gallery." });
    } else if (pollStatus === "FAILED") {
      setPendingJobId(null);
      toast({ title: "Generation failed", description: "BlenderGPT job failed.", variant: "destructive" });
    }
  }, [pollStatus, pendingJobId]);

  const isGenerating = generateMutation.isPending;
  const isPolling = !!pendingJobId;

  return (
    <div className="space-y-4 p-1">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Prompt</Label>
        <Textarea
          placeholder="A low-poly forest scene with pine trees and rocks…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="text-xs resize-none h-20"
          disabled={isGenerating || isPolling}
        />
      </div>

      {isPolling && (
        <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Generating…
            </span>
            {typeof progress === "number" && (
              <span className="font-mono text-orange-400">{progress}%</span>
            )}
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-orange-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, typeof progress === "number" ? progress : 10)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">{pollStatus ?? "PENDING"}</p>
        </div>
      )}

      {done && !isPolling && (
        <div className="flex items-center gap-2 text-green-400 text-xs p-2 rounded bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Model added to gallery!</span>
        </div>
      )}

      <Button
        className="w-full gap-2 text-xs"
        size="sm"
        onClick={() => {
          setDone(false);
          generateMutation.mutate({ data: { prompt } });
        }}
        disabled={!prompt.trim() || isGenerating || isPolling}
      >
        {isGenerating || isPolling ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        {isPolling ? "Generating…" : "Generate with BlenderGPT"}
      </Button>

      <p className="text-[10px] text-muted-foreground text-center">
        Requires{" "}
        <code className="bg-muted px-1 rounded font-mono">BLENDERGPT_API_KEY</code> secret in project settings.
      </p>
    </div>
  );
}

export default function ArtLibrary({ open, onOpenChange, projectId }: ArtLibraryProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingModelName, setUploadingModelName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [addingModelId, setAddingModelId] = useState<string | null>(null);

  const { data: galleryData, isLoading: isLoadingGallery, refetch: refetchGallery } = useListModels({
    query: { enabled: open, queryKey: getListModelsQueryKey() as unknown as readonly unknown[] },
  });
  const models = galleryData?.models ?? [];

  const deleteMutation = useDeleteModel({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["/api/models"] });
        toast({ title: "Model deleted" });
      },
      onError: () => toast({ title: "Failed to delete model", variant: "destructive" }),
    },
  });

  const requestUploadUrlMutation = useRequestUploadUrl();
  const registerModelMutation = useRegisterModel({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
        setUploadingModelName("");
        toast({ title: "Model uploaded!", description: "It's now in your gallery." });
      },
      onError: () => toast({ title: "Failed to register model", variant: "destructive" }),
    },
  });

  const addMeshMutation = useAddProjectMesh({
    mutation: {
      onSuccess: (data) => {
        setAddingModelId(null);
        toast({
          title: "Added to project",
          description: `Project now has ${data.meshCount} mesh reference${data.meshCount !== 1 ? "s" : ""}.`,
        });
      },
      onError: () => {
        setAddingModelId(null);
        toast({ title: "Failed to add to project", variant: "destructive" });
      },
    },
  });

  async function handleFileUpload(file: File) {
    if (!file.name.match(/\.(glb|gltf)$/i)) {
      toast({
        title: "Invalid file type",
        description: "Only .glb and .gltf files are supported.",
        variant: "destructive",
      });
      return;
    }
    setIsUploading(true);
    try {
      const urlData = await requestUploadUrlMutation.mutateAsync({
        data: {
          name: file.name,
          size: file.size,
          contentType: file.type || "model/gltf-binary",
        },
      });

      const putResp = await fetch(urlData.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "model/gltf-binary" },
      });
      if (!putResp.ok) throw new Error(`GCS upload failed: ${putResp.status}`);

      const modelName = uploadingModelName.trim() || file.name.replace(/\.(glb|gltf)$/i, "");
      await registerModelMutation.mutateAsync({
        data: { name: modelName, storageKey: urlData.objectPath },
      });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleAddToProject(model: { id: string; storageKey: string; name: string }) {
    if (!projectId) {
      toast({ title: "No project open", description: "Open a project first.", variant: "destructive" });
      return;
    }
    setAddingModelId(model.id);
    addMeshMutation.mutate({ projectId, data: { modelId: model.id, storageKey: model.storageKey, name: model.name } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Box className="h-4 w-4 text-violet-400" />
            Art Library
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Generate or upload 3D models (.glb/.gltf) and attach them to your projects.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="gallery" className="flex-1 flex flex-col min-h-0">
          <TabsList className="bg-muted/40 border border-border h-8 shrink-0">
            <TabsTrigger value="gallery" className="text-xs h-6 gap-1.5">
              <ImageIcon className="h-3 w-3" /> My Gallery
            </TabsTrigger>
            <TabsTrigger value="meshy" className="text-xs h-6 gap-1.5">
              <Sparkles className="h-3 w-3 text-violet-400" /> Meshy.ai
            </TabsTrigger>
            <TabsTrigger value="blendergpt" className="text-xs h-6 gap-1.5">
              <Sparkles className="h-3 w-3 text-orange-400" /> BlenderGPT
            </TabsTrigger>
          </TabsList>

          {/* Gallery */}
          <TabsContent value="gallery" className="flex-1 flex flex-col min-h-0 mt-3 gap-3">
            <div className="shrink-0 flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Upload .glb / .gltf</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Model name (optional)"
                    value={uploadingModelName}
                    onChange={(e) => setUploadingModelName(e.target.value)}
                    className="text-xs h-7 flex-1"
                    disabled={isUploading}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 shrink-0"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    {isUploading ? "Uploading…" : "Choose File"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".glb,.gltf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileUpload(file);
                    }}
                  />
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => void refetchGallery()}
                title="Refresh gallery"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              {isLoadingGallery ? (
                <div className="h-40 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : models.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Box className="h-8 w-8 opacity-30" />
                  <p className="text-xs">No models yet — generate one or upload a .glb file!</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 pr-2 pb-2">
                  {models.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      onAddToProject={() => handleAddToProject(model)}
                      onDelete={() => deleteMutation.mutate({ modelId: model.id })}
                      isAdding={addingModelId === model.id}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>

            {!projectId && models.length > 0 && (
              <div className="flex items-center gap-2 shrink-0 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                <p className="text-[10px] text-amber-300">Open a project to use "Add to Project".</p>
              </div>
            )}
          </TabsContent>

          {/* Meshy */}
          <TabsContent value="meshy" className="flex-1 overflow-y-auto mt-3">
            <MeshyGenerateTab
              onSuccess={() => void queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() })}
            />
          </TabsContent>

          {/* BlenderGPT */}
          <TabsContent value="blendergpt" className="flex-1 overflow-y-auto mt-3">
            <BlenderGPTGenerateTab
              onSuccess={() => void queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() })}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
