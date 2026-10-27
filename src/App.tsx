import { CanvasEngine } from "@/canvas/CanvasEngine";
import { useAppStore } from "@/store/useAppStore";

const CHANCE_PRESETS = [10, 25, 50, 75];

export default function App() {
  const balance = useAppStore((s) => s.balance);
  const betAmount = useAppStore((s) => s.betAmount);
  const winChance = useAppStore((s) => s.winChance);
  const spinState = useAppStore((s) => s.spinState);
  const lastResult = useAppStore((s) => s.lastResult);
  const setWinChance = useAppStore((s) => s.setWinChance);
  const startSpin = useAppStore((s) => s.startSpin);

  // Потенциальная выплата для отображения игроку
  const isSpinning = spinState !== "idle";
  const potentialWin = Math.round(betAmount * (100 / winChance));

  // Если текущий шанс не входит в массив стандартных, значит выбрана кастомная/рандомная кнопка
  const isCustomChance = !CHANCE_PRESETS.includes(winChance);

  const handleRandomChance = () => {
    // Генерируем случайный шанс от 1 до 90
    const randomChance = Math.floor(Math.random() * 90) + 1;
    setWinChance(randomChance);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 flex flex-col items-center gap-6">
      <header className="flex items-center justify-between w-full max-w-[800px] bg-slate-900 px-6 py-4 rounded-xl border border-slate-800">
        <h1 className="text-xl font-bold tracking-tight text-sky-400">tema</h1>
        <div className="px-4 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sm">
          Баланс: <span className="text-emerald-400 font-bold">${balance}</span>
        </div>
      </header>

      <div className="relative">
        <CanvasEngine />

        {/* Оверлей поверх канваса с процентом шанса и результатом */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
          <span className="text-3xl font-black font-mono text-slate-100">
            {winChance}%
          </span>
          <span className="text-xs text-slate-400">
            Выплата: ${potentialWin}
          </span>
          {lastResult && !isSpinning && (
            <span
              className={`mt-2 px-3 py-0.5 rounded text-xs font-bold uppercase ${
                lastResult === "win"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
              }`}
            >
              {lastResult === "win" ? `Победа +$${potentialWin}` : "Неудача"}
            </span>
          )}
        </div>
      </div>

      {/* Панель выбора процента шанса и запуска */}
      <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800 w-full max-w-[800px] justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400 mr-2">Шанс:</span>

          {/* Стандартные кнопки */}
          {CHANCE_PRESETS.map((preset) => (
            <button
              key={preset}
              disabled={isSpinning}
              onClick={() => setWinChance(preset)}
              className={`px-4 py-2 rounded-lg font-mono text-sm font-bold transition cursor-pointer disabled:opacity-50 ${
                winChance === preset
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {preset}%
            </button>
          ))}

          {/* Кнопка случайного шанса */}
          <button
            disabled={isSpinning}
            onClick={handleRandomChance}
            className={`px-4 py-2 rounded-lg font-mono text-sm font-bold transition cursor-pointer disabled:opacity-50 ${
              isCustomChance
                ? "bg-amber-500 text-amber-950 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                : "bg-slate-800 text-amber-400 hover:bg-slate-700"
            }`}
          >
            {isCustomChance ? `${winChance}%` : "RND"}
          </button>
        </div>

        <button
          disabled={isSpinning || balance < betAmount}
          onClick={startSpin}
          className="px-8 py-3 rounded-xl font-bold bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 transition cursor-pointer"
        >
          {isSpinning ? "Крутим..." : `Апгрейд ($${betAmount})`}
        </button>
      </div>
    </main>
  );
}
