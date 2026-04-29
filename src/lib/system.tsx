import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type WorkspaceSystem = "api" | "llc";

export const SYSTEM_LABELS: Record<WorkspaceSystem, string> = {
  api: "Puget Sound Limo API",
  llc: "Puget Sound Limo LLC",
};

const STORAGE_KEY = "psl.workspace.system";

interface Ctx {
  system: WorkspaceSystem;
  setSystem: (s: WorkspaceSystem) => void;
  label: string;
}

const SystemContext = createContext<Ctx | null>(null);

export function SystemProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<WorkspaceSystem>("api");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "api" || v === "llc") setSystemState(v);
  }, []);

  const setSystem = (s: WorkspaceSystem) => {
    setSystemState(s);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, s);
  };

  return (
    <SystemContext.Provider value={{ system, setSystem, label: SYSTEM_LABELS[system] }}>
      {children}
    </SystemContext.Provider>
  );
}

export function useSystem() {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error("useSystem must be used inside <SystemProvider>");
  return ctx;
}
