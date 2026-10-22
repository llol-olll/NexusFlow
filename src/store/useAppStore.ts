import { create } from "zustand";

const FULL_CIRCLE = 360; // Полный круг в градусах
const EDGE_PADDING = 2.5; // Защитный отступ 2.5 градуса от границ сектора

interface AppState {
  balance: number;
  betAmount: number;
  winChance: number;
  isSpinning: boolean;
  targetAngle: number; // Угол в обычных градусах (0 - 360+)
  lastResult: "win" | "loss" | null;
  pendingPayout: number;
  setWinChance: (chance: number) => void;
  startSpin: () => void;
  completeSpin: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  balance: 1000,
  betAmount: 100,
  winChance: 30,
  isSpinning: false,
  targetAngle: 0,
  lastResult: null,
  pendingPayout: 0,

  setWinChance: (chance) => {
    if (get().isSpinning) return;
    set({ winChance: chance, lastResult: null });
  },

  startSpin: () => {
    const { balance, betAmount, winChance, isSpinning, targetAngle } = get();
    if (isSpinning || balance < betAmount) return;

    // --- БЛОК ИМИТАЦИИ ОТВЕТА СЕРВЕРА (Mock Backend) ---
    const isWin = Math.random() * 100 < winChance;
    const payout = isWin ? Math.round(betAmount * (100 / winChance)) : 0;
    // ---------------------------------------------------

    // Переводим процент шанса в градусы (например, 50% = 180 градусов)
    const winSectorDegrees = (winChance / 100) * FULL_CIRCLE;

    let landingDegree = 0;
    if (isWin) {
      const min = EDGE_PADDING;
      const max = Math.max(min, winSectorDegrees - EDGE_PADDING);
      landingDegree = min + Math.random() * (max - min);
    } else {
      const min = winSectorDegrees + EDGE_PADDING;
      const max = FULL_CIRCLE - EDGE_PADDING;
      landingDegree = min + Math.random() * (max - min);
    }

    // Округляем прошлые полные обороты до 360 + добавляем 6 новых кругов (2160 град.) + угол посадки
    const baseFullTurns = Math.floor(targetAngle / FULL_CIRCLE) * FULL_CIRCLE;
    const nextAngle = baseFullTurns + FULL_CIRCLE * 6 + landingDegree;

    set({
      balance: balance - betAmount,
      isSpinning: true,
      targetAngle: nextAngle,
      lastResult: null,
      pendingPayout: payout,
    });
  },

  completeSpin: () => {
    const { balance, pendingPayout } = get();
    set({
      isSpinning: false,
      balance: balance + pendingPayout,
      lastResult: pendingPayout > 0 ? "win" : "loss",
      pendingPayout: 0,
    });
  },
}));
