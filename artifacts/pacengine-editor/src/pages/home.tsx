import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListProjects, 
  useListTemplates, 
  useGetStats, 
  useImportProject,
  useInstantiateTemplate
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Activity, Plus, FolderOpen, Play, Box, FileJson, Hash, Settings } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: projectsData, isLoading: loadingProjects } = useListProjects();
  const { data: templatesData, isLoading: loadingTemplates } = useListTemplates();
  const { data: statsData, isLoading: loadingStats } = useGetStats();
  
  const importMutation = useImportProject();
  const instantiateMutation = useInstantiateTemplate();
  
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importJson, setImportJson] = useState("");
  
  const [instantiateOpen, setInstantiateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  const handleImport = () => {
    if (!importName || !importJson) {
      toast({ title: "Validation Error", description: "Name and JSON are required.", variant: "destructive" });
      return;
    }
    
    importMutation.mutate({ data: { name: importName, rawJson: importJson } }, {
      onSuccess: (data) => {
        setImportOpen(false);
        setImportName("");
        setImportJson("");
        toast({ title: "Import Successful", description: `Project ${data.project.name} imported.` });
        setLocation(`/projects/${data.project.id}`);
      },
      onError: (err) => {
        toast({ title: "Import Failed", description: err.error, variant: "destructive" });
      }
    });
  };

  const handleInstantiate = () => {
    if (!selectedTemplate || !projectName) {
      toast({ title: "Validation Error", description: "Project name is required.", variant: "destructive" });
      return;
    }
    
    instantiateMutation.mutate({ templateId: selectedTemplate, data: { name: projectName } }, {
      onSuccess: (data) => {
        setInstantiateOpen(false);
        setSelectedTemplate(null);
        setProjectName("");
        toast({ title: "Template Instantiated", description: `Project ${data.project.name} created.` });
        setLocation(`/projects/${data.project.id}`);
      },
      onError: (err) => {
        toast({ title: "Instantiation Failed", description: err.error, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* Topbar */}
      <header className="h-12 border-b border-border bg-card flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight text-sm">PacEngine Browser</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/engine" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            <Settings className="h-4 w-4" /> Engine Status
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
          <div className="p-4 border-b border-border">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Actions</h2>
            <div className="space-y-2">
              <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="w-full justify-start gap-2 h-9 text-xs">
                    <FileJson className="h-4 w-4" /> Import PacData
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Import PacData</DialogTitle>
                    <DialogDescription>Paste PacData JSON from PacAI or an external source.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Project Name</Label>
                      <Input id="name" value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="e.g. my-imported-sim" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="json">Raw JSON</Label>
                      <Textarea 
                        id="json" 
                        value={importJson} 
                        onChange={(e) => setImportJson(e.target.value)} 
                        className="font-mono text-xs h-[200px]" 
                        placeholder='{"pacdata_version": "1.0", ...}'
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                    <Button onClick={handleImport} disabled={importMutation.isPending}>
                      {importMutation.isPending ? "Importing..." : "Import Project"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Workspace Stats</h2>
              {loadingStats ? (
                <div className="text-xs text-muted-foreground">Loading stats...</div>
              ) : statsData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-background p-2 rounded border border-border">
                      <div className="text-muted-foreground mb-1">Projects</div>
                      <div className="text-lg font-mono font-medium">{statsData.projectCount}</div>
                    </div>
                    <div className="bg-background p-2 rounded border border-border">
                      <div className="text-muted-foreground mb-1">Templates</div>
                      <div className="text-lg font-mono font-medium">{statsData.templateCount}</div>
                    </div>
                    <div className="bg-background p-2 rounded border border-border">
                      <div className="text-muted-foreground mb-1">Entities</div>
                      <div className="text-lg font-mono font-medium">{statsData.totalEntities}</div>
                    </div>
                    <div className="bg-background p-2 rounded border border-border">
                      <div className="text-muted-foreground mb-1">Agents</div>
                      <div className="text-lg font-mono font-medium">{statsData.totalAgents}</div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">PacData Versions</div>
                    <div className="space-y-1">
                      {statsData.byPacdataVersion.map(v => (
                        <div key={v.version} className="flex justify-between text-xs bg-background p-1.5 rounded border border-border">
                          <span>v{v.version}</span>
                          <span className="font-mono">{v.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <ScrollArea className="flex-1 bg-background">
          <div className="p-8 max-w-6xl mx-auto space-y-12">
            
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-primary" /> Recent Projects
                </h2>
              </div>
              
              {loadingProjects ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1,2,3].map(i => <div key={i} className="h-32 bg-card rounded-md border border-border animate-pulse" />)}
                </div>
              ) : projectsData?.projects.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground">
                  No projects found. Import one or use a template.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projectsData?.projects.map(project => (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer bg-card overflow-hidden group">
                        <div className="h-1 w-full" style={{ backgroundColor: project.accentColor }} />
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            {project.name}
                            <Badge variant="secondary" className="font-mono text-[10px]">{project.fileSizeBytes}B</Badge>
                          </CardTitle>
                          <CardDescription className="text-xs truncate">{project.filename}</CardDescription>
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1" title="Entities"><Box className="h-3 w-3"/> {project.entityCount}</span>
                            <span className="flex items-center gap-1" title="Agents"><Activity className="h-3 w-3"/> {project.agentCount}</span>
                            <span className="flex items-center gap-1" title="Scenarios"><Hash className="h-3 w-3"/> {project.scenarioCount}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Play className="h-5 w-5 text-accent" /> Templates
                </h2>
              </div>
              
              {loadingTemplates ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1,2,3].map(i => <div key={i} className="h-40 bg-card rounded-md border border-border animate-pulse" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templatesData?.templates.map(template => (
                    <Card key={template.id} className="h-full flex flex-col bg-card border-border overflow-hidden">
                      <div className="h-1 w-full" style={{ backgroundColor: template.accentColor }} />
                      <CardHeader className="pb-2 flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <Badge className="text-[10px] font-semibold bg-secondary text-secondary-foreground hover:bg-secondary">{template.category}</Badge>
                        </div>
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        <CardDescription className="text-xs text-foreground/70 mt-1">{template.tagline}</CardDescription>
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{template.description}</p>
                      </CardHeader>
                      <CardFooter className="pt-2 pb-4 bg-background/50 border-t border-border flex justify-between items-center">
                        <div className="flex gap-3 text-[10px] text-muted-foreground font-mono">
                          <span>{template.agentCount} Agents</span>
                          <span>{template.scenarioCount} Scen</span>
                        </div>
                        <Dialog open={instantiateOpen && selectedTemplate === template.id} onOpenChange={(open) => {
                          if (open) {
                            setSelectedTemplate(template.id);
                            setInstantiateOpen(true);
                          } else {
                            setInstantiateOpen(false);
                            setSelectedTemplate(null);
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="secondary" className="h-7 text-xs">Use Template</Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>Instantiate {template.name}</DialogTitle>
                              <DialogDescription>Provide a name for your new project.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid gap-2">
                                <Label htmlFor="new-project-name">Project Name</Label>
                                <Input 
                                  id="new-project-name" 
                                  value={projectName} 
                                  onChange={(e) => setProjectName(e.target.value)} 
                                  placeholder={`${template.id}-project`} 
                                  autoFocus
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setInstantiateOpen(false)}>Cancel</Button>
                              <Button onClick={handleInstantiate} disabled={instantiateMutation.isPending}>
                                {instantiateMutation.isPending ? "Creating..." : "Create Project"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </section>
            
          </div>
        </ScrollArea>
      </div>
      
      {/* Status Bar */}
      <footer className="h-6 bg-card border-t border-border flex items-center px-4 justify-between text-[10px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          <span>PacEngine Editor v1.0.0</span>
          <span>Ready</span>
        </div>
        <div>
          Deterministic Execution Engine
        </div>
      </footer>
    </div>
  );
}
