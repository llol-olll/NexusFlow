// Точка данных для отрисовки на Canvas
export interface DataPoint {
  id: string;
  timestamp: number;
  value: number;
  category: "buy" | "sell";
}

// Метрики производительности
export interface PerformanceMetrics {
  fps: number;
  renderTimeMs: number;
  pointsCount: number;
}

// Настройки отображения
export interface ChartConfig {
  isStreaming: boolean;
  maxPoints: number;
  colorScheme: "default" | "highContrast";
}

// Состояние Zustand-стора
export interface AppState {
  config: ChartConfig;
  metrics: PerformanceMetrics;
  setStreaming: (isStreaming: boolean) => void;
  setMaxPoints: (maxPoints: number) => void;
  updateMetrics: (metrics: Partial<PerformanceMetrics>) => void;
}
