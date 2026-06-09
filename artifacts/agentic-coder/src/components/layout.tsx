import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Terminal, MessageSquare, Settings, LayoutDashboard, Plus, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListSessions, useGetOllamaStatus } from "@workspace/api-client-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { data: ollamaStatus } = useGetOllamaStatus();

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden selection:bg-primary selection:text-primary-foreground font-sans">
      {/* Sidebar */}
      <div className="w-16 flex flex-col items-center py-4 border-r border-border bg-sidebar shrink-0 z-10">
        <div className="w-10 h-10 rounded bg-primary/10 text-primary flex items-center justify-center mb-8 border border-primary/20 shadow-[0_0_15px_rgba(0,200,255,0.15)]">
          <Terminal size={20} className="stroke-[1.5]" />
        </div>
        
        <nav className="flex flex-col gap-4 flex-1 w-full px-2">
          <NavItem href="/" icon={<MessageSquare size={20} />} isActive={location === "/"} label="Workspace" />
          <NavItem href="/sessions" icon={<History size={20} />} isActive={location.startsWith("/sessions")} label="Sessions" />
          <NavItem href="/settings" icon={<Settings size={20} />} isActive={location.startsWith("/settings")} label="Settings" />
        </nav>
        
        <div className="mt-auto flex flex-col items-center gap-4">
          <div 
            className={cn(
              "w-3 h-3 rounded-full shadow-[0_0_10px_currentColor]",
              ollamaStatus?.reachable ? "bg-green-500 text-green-500" : "bg-destructive text-destructive"
            )} 
            title={ollamaStatus?.reachable ? "Ollama Connected" : "Ollama Offline"}
          />
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-card">
        {children}
      </div>
    </div>
  );
}

function NavItem({ href, icon, isActive, label }: { href: string; icon: React.ReactNode; isActive: boolean; label: string }) {
  return (
    <Link href={href} className={cn(
      "w-full aspect-square flex items-center justify-center rounded-md transition-all duration-200 group relative",
      isActive 
        ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(0,200,255,0.3)]" 
        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
    )}>
      {icon}
      
      <div className="absolute left-full ml-2 px-2 py-1 bg-popover border border-border rounded text-xs font-mono whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
        {label}
      </div>
    </Link>
  );
}