import { create } from "zustand";
import { gameAudio } from "@/utils/sound";

const FULL_CIRCLE = 360; // Полный круг в градусах
const EDGE_PADDING = 2.5; // Защитный отступ 2.5 градуса от границ сектора

type SpinState = "idle" | "requesting" | "spinning";

interface AppState {
  balance: number;
  betAmount: number;
  winChance: number;
  spinState: SpinState;
  targetAngle: number;
  lastResult: "win" | "loss" | null;
  pendingPayout: number;
  setWinChance: (chance: number) => void;
  startSpin: () => Promise<void>;
  completeSpin: () => void;
}

// Изначальный шанс — случайное число от 1 до 90
const initialRandomChance = Math.floor(Math.random() * 90) + 1;

export const useAppStore = create<AppState>((set, get) => ({
  balance: 1000,
  betAmount: 100,
  winChance: initialRandomChance,
  spinState: "idle",
  targetAngle: 0,
  lastResult: null,
  pendingPayout: 0,

  setWinChance: (chance) => {
    if (get().spinState !== "idle") return;
    set({ winChance: chance, lastResult: null });
  },

  startSpin: async () => {
    const { balance, betAmount, winChance, spinState } = get();

    // Блокируем, если уже крутится или не хватает денег
    if (spinState !== "idle" || balance < betAmount) return;

    // Это мгновенно разбудит AudioContext браузера и даст самый первый щелчок без задержек.
    gameAudio.play("start");

    set({
      balance: balance - betAmount,
      spinState: "requesting",
      lastResult: null,
    });

    // Имитация ответа сервера (рандомная задержка от 0 до 2 секунд)
    const mockNetworkDelay = 1500 + Math.random() * 1000;
    await new Promise((resolve) => setTimeout(resolve, mockNetworkDelay));

    const isWin = Math.random() * 100 < winChance;
    const payout = isWin ? Math.round(betAmount * (100 / winChance)) : 0;

    // Переводим процент шанса в градусы (например, 50% = 180 градусов)
    const winSectorDegrees = (winChance / 100) * FULL_CIRCLE;
    let landingDegree = 0;

    // Считаем чистый градус посадки (0-360) с отступами от швов
    if (isWin) {
      const min = EDGE_PADDING;
      const max = Math.max(min, winSectorDegrees - EDGE_PADDING);
      landingDegree = min + Math.random() * (max - min);
    } else {
      const min = winSectorDegrees + EDGE_PADDING;
      const max = FULL_CIRCLE - EDGE_PADDING;
      landingDegree = min + Math.random() * (max - min);
    }

    // Передаем точный градус, а CanvasEngine сам докрутит нужные 6 оборотов
    set({
      spinState: "spinning",
      targetAngle: landingDegree,
      pendingPayout: payout,
    });
  },

  completeSpin: () => {
    const { balance, pendingPayout } = get();
    const isWin = pendingPayout > 0;

    // Запускаем нужный кусок аудио-спрайта
    gameAudio.play(isWin ? "win" : "loss");

    set({
      spinState: "idle",
      balance: balance + pendingPayout,
      lastResult: isWin ? "win" : "loss",
      pendingPayout: 0,
    });
  },
}));
