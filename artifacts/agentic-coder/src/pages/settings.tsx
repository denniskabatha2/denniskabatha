import AppLayout from "@/components/layout";
import { 
  useGetOllamaStatus, 
  useListWorkspaces,
  useAddWorkspace,
  useRemoveWorkspace,
  getListWorkspacesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Activity, Server, FolderGit2, Trash2, Plus, ShieldCheck, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useGetOllamaStatus();
  const { data: workspaces, isLoading: workspacesLoading } = useListWorkspaces();
  const addWorkspace = useAddWorkspace();
  const removeWorkspace = useRemoveWorkspace();
  const queryClient = useQueryClient();
  
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspacePath, setNewWorkspacePath] = useState("");

  const handleAddWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName || !newWorkspacePath) return;
    
    addWorkspace.mutate({ data: { name: newWorkspaceName, path: newWorkspacePath } }, {
      onSuccess: () => {
        setNewWorkspaceName("");
        setNewWorkspacePath("");
        queryClient.invalidateQueries({ queryKey: getListWorkspacesQueryKey() });
      }
    });
  };

  const handleRemoveWorkspace = (path: string) => {
    removeWorkspace.mutate({ data: { path } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorkspacesQueryKey() });
      }
    });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-y-auto p-6 max-w-4xl mx-auto w-full custom-scrollbar">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Server className="text-primary" size={28} /> Configuration
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">System parameters and environmental variables</p>
        </div>

        <div className="space-y-8">
          {/* Status Panel */}
          <section className="border border-border bg-card rounded-lg overflow-hidden">
            <div className="bg-sidebar px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity size={16} /> Inference Engine Status
              </h2>
              <Button variant="ghost" size="sm" onClick={() => refetchStatus()} className="h-8 font-mono text-xs">
                PING
              </Button>
            </div>
            <div className="p-6">
              {statusLoading ? (
                <div className="animate-pulse flex space-x-4">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                </div>
              ) : (
                <div className="flex items-start gap-6">
                  <div className={`p-4 rounded-full border ${status?.reachable ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-destructive/10 border-destructive/20 text-destructive'}`}>
                    {status?.reachable ? <ShieldCheck size={32} /> : <AlertTriangle size={32} />}
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground w-24">STATUS:</span>
                      <span className={`font-mono font-bold ${status?.reachable ? 'text-green-500' : 'text-destructive'}`}>
                        {status?.reachable ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground w-24">ENDPOINT:</span>
                      <span className="font-mono text-foreground">{status?.url || 'http://localhost:11434'}</span>
                    </div>
                    {status?.reachable ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-muted-foreground w-24">MODELS:</span>
                        <span className="font-mono text-foreground">{status.modelCount}</span>
                      </div>
                    ) : (
                      <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm font-mono">
                        {status?.error || 'Connection refused. Ensure Ollama is running locally.'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Workspaces Panel */}
          <section className="border border-border bg-card rounded-lg overflow-hidden">
            <div className="bg-sidebar px-4 py-3 border-b border-border flex items-center gap-2">
              <FolderGit2 size={16} className="text-muted-foreground" />
              <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
                Registered Workspaces
              </h2>
            </div>
            
            <div className="p-0">
              {workspacesLoading ? (
                <div className="p-6 text-muted-foreground font-mono text-sm">Loading workspaces...</div>
              ) : workspaces?.length === 0 ? (
                <div className="p-6 text-muted-foreground font-mono text-sm border-b border-border">No workspaces registered.</div>
              ) : (
                <ul className="divide-y divide-border border-b border-border">
                  {workspaces?.map((ws) => (
                    <li key={ws.path} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                      <div>
                        <div className="font-semibold text-foreground">{ws.name}</div>
                        <div className="font-mono text-xs text-muted-foreground mt-1">{ws.path}</div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveWorkspace(ws.path)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              
              <div className="p-4 bg-sidebar/50">
                <form onSubmit={handleAddWorkspace} className="flex gap-3 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="font-mono text-xs text-muted-foreground uppercase">Designation</label>
                    <Input 
                      placeholder="Backend Server" 
                      value={newWorkspaceName} 
                      onChange={e => setNewWorkspaceName(e.target.value)} 
                      className="font-mono h-9 bg-background"
                    />
                  </div>
                  <div className="flex-[2] space-y-1">
                    <label className="font-mono text-xs text-muted-foreground uppercase">Absolute Path</label>
                    <Input 
                      placeholder="/Users/dev/projects/backend" 
                      value={newWorkspacePath} 
                      onChange={e => setNewWorkspacePath(e.target.value)} 
                      className="font-mono h-9 bg-background"
                    />
                  </div>
                  <Button type="submit" disabled={!newWorkspaceName || !newWorkspacePath || addWorkspace.isPending} className="h-9 gap-2 font-mono text-xs">
                    <Plus size={14} /> ADD_PATH
                  </Button>
                </form>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}