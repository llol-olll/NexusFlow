import { create } from "zustand";
import type { AppState } from "@/types";

export const useAppStore = create<AppState>((set) => ({
  config: {
    isStreaming: false,
    maxPoints: 100,
    colorScheme: "default",
  },
  metrics: {
    fps: 0,
    renderTimeMs: 0,
    pointsCount: 0,
  },

  setStreaming: (isStreaming) =>
    set((state) => ({
      config: { ...state.config, isStreaming },
    })),

  setMaxPoints: (maxPoints) =>
    set((state) => ({
      config: { ...state.config, maxPoints },
    })),

  updateMetrics: (patch) =>
    set((state) => ({
      metrics: { ...state.metrics, ...patch },
    })),
}));
