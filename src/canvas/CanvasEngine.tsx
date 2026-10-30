import { useEffect, useRef, useCallback, memo } from "react";
import { Application, extend } from "@pixi/react"; // Убрали useTick
import { Container, Graphics, Ticker } from "pixi.js"; // Добавили Ticker
import { useAppStore } from "@/store/useAppStore";
import { gameAudio } from "@/utils/sound";

extend({ Container, Graphics });

const CORRECTION_SPIN_SOUND = 0.01397;

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const UpgraderCore = () => {
  const pointerRef = useRef<Container>(null);

  // Оставляем в React только winChance, так как он нужен для отрисовки дуги.
  // Эта переменная меняется только при клике на кнопки, так что во время спина ререндеров НЕ БУДЕТ.
  const winChance = useAppStore((s) => s.winChance);
  const radarRef = useRef<Graphics>(null);

  // Наш физический движок
  const physics = useRef({
    velocity: 0,
    nextTickAngle: 0, // Абсолютная цель для следующего звука
    startAngle: 0,
    distance: 0,
    timePassed: 0,
    timeTotal: 0,
    isStopping: false,
    targetCalculated: false,
    traveled: 0,
    winRippleProgress: 1, // 1 = анимация завершена (покой), 0 = старт
    lossPulseProgress: 1, // 1 = анимация завершена (покой), 0 = старт
  });

  // ВЕСЬ ИГРОВОЙ ЦИКЛ ЖИВЕТ ЗДЕСЬ И НЕ ЗАВИСИТ ОТ REACT
  useEffect(() => {
    const handleTick = (tickerObj: any) => {
      if (!pointerRef.current) return;

      const state = useAppStore.getState();
      const spinState = state.spinState;
      const targetAngle = state.targetAngle;
      const lastResult = state.lastResult;

      const rawDelta = tickerObj?.deltaTime ?? tickerObj ?? 1;
      const delta = Math.min(rawDelta, 10);

      // --- МАТЕМАТИКА АНИМАЦИИ ВОЛНЫ (Без графики!) ---
      if (spinState === "idle") {
        let needsRedraw = false;

        // 1. Волна победы
        if (physics.current.winRippleProgress < 1) {
          // Если статус "win", двигаем анимацию. Если статус пропал (сменили шанс) - жестко сбрасываем в 1
          physics.current.winRippleProgress =
            lastResult === "win"
              ? physics.current.winRippleProgress + delta * 0.035
              : 1;
          needsRedraw = true;
        }

        // 2. Вспышка урона
        if (physics.current.lossPulseProgress < 1) {
          // Если статус "loss", двигаем анимацию. Иначе - жестко сбрасываем в 1
          physics.current.lossPulseProgress =
            lastResult === "loss"
              ? physics.current.lossPulseProgress + delta * 0.025
              : 1;
          needsRedraw = true;
        }

        // Защита от переполнения (ограничиваем ровно единицей)
        if (physics.current.winRippleProgress > 1)
          physics.current.winRippleProgress = 1;
        if (physics.current.lossPulseProgress > 1)
          physics.current.lossPulseProgress = 1;

        // Перерисовываем холст только если 애니мaция активна
        if (needsRedraw && radarRef.current) {
          drawRadarRef.current(radarRef.current);
        }
      }

      // --- РАННИЙ ВЫХОД ---
      if (spinState === "idle") {
        physics.current.velocity = 0;
        return;
      }

      // 3. СТАДИЯ 1: Разгон и кручение
      if (spinState === "requesting") {
        if (physics.current.velocity === 0 && !physics.current.isStopping) {
          physics.current.winRippleProgress = 1;
          physics.current.lossPulseProgress = 1;

          // 2. Заставляем PixiJS стереть зависшие волны (вызов g.clear())
          if (radarRef.current) {
            drawRadarRef.current(radarRef.current);
          }

          const currentA = pointerRef.current.angle;
          let nextGrid = Math.floor(currentA / 45) * 45 + 45;

          // ЗАЩИТА ОТ ДАБЛ-КЛИКА:
          // Если до ближайшего тика меньше 25 градусов, пропускаем его.
          // Это даст звуку "start" отзвучать чисто, без наслоения.
          if (nextGrid - currentA < 35) {
            nextGrid += 45;
          }

          physics.current.nextTickAngle = nextGrid;
          physics.current.targetCalculated = false;
          physics.current.traveled = 0;
        }

        const MAX_VELOCITY = 20;
        const ACCELERATION = 0.5;

        if (physics.current.velocity < MAX_VELOCITY) {
          physics.current.velocity += ACCELERATION * delta;
          if (physics.current.velocity > MAX_VELOCITY) {
            physics.current.velocity = MAX_VELOCITY;
          }
        }

        // Просто прибавляем угол, НЕ ИСПОЛЬЗУЕМ % 360
        pointerRef.current.angle += physics.current.velocity * delta;
      }

      //4.  СТАДИЯ 2: Торможение
      if (spinState === "spinning") {
        if (!physics.current.targetCalculated) {
          const currentAngle = pointerRef.current.angle;

          // Так как currentAngle теперь может быть 3000 градусов,
          // находим его позицию на круге
          const currentWrapped = currentAngle % 360;

          let dist = targetAngle - currentWrapped;
          if (dist < 0) dist += 360;
          dist += 360 * 3; // 3 полных оборота

          physics.current.startAngle = currentAngle;
          physics.current.distance = dist;
          physics.current.timeTotal = (2 * dist) / physics.current.velocity;
          physics.current.timePassed = 0;
          physics.current.traveled = 0;

          physics.current.targetCalculated = true;
          physics.current.isStopping = true;
        }

        if (physics.current.isStopping) {
          physics.current.timePassed += delta;
          let progress = physics.current.timePassed / physics.current.timeTotal;

          if (progress >= 1) {
            progress = 1;
            pointerRef.current.angle =
              physics.current.startAngle + physics.current.distance;

            // --- ФИНАЛЬНЫЙ АКЦЕНТИРОВАННЫЙ ЩЕЛЧОК ---
            // Срабатывает в идеальный момент полной остановки физики
            gameAudio.play("tick_final");

            pointerRef.current.angle = pointerRef.current.angle % 360;
            physics.current.isStopping = false;

            // Взводим волну в 0 для запуска при выигрыше
            if (state.pendingPayout > 0) {
              physics.current.winRippleProgress = 0;
              physics.current.lossPulseProgress = 1;
            } else {
              physics.current.winRippleProgress = 1;
              physics.current.lossPulseProgress = 0; // Запускаем урон
            }

            state.completeSpin();
          } else {
            const easeOut = progress * (2 - progress);
            const traveledNow = physics.current.distance * easeOut;
            physics.current.traveled = traveledNow;

            pointerRef.current.angle = physics.current.startAngle + traveledNow;
          }
        }
      }

      //5.  Если стрелка + опережение пересекли заветную отметку (45, 90, 135...)
      if (
        pointerRef.current.angle - CORRECTION_SPIN_SOUND >=
        physics.current.nextTickAngle
      ) {
        gameAudio.play("tick");
        physics.current.nextTickAngle += 45; // Ставим следующую цель ровно через 45 градусов
      }
    };

    Ticker.shared.add(handleTick);
    return () => {
      Ticker.shared.remove(handleTick);
    };
  }, []);

  const drawRadar = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(0, 0, 130);
      g.fill({ color: 0x0f172a });
      g.stroke({ width: 18, color: 0x1e293b });

      const startRad = degToRad(-90);
      const endRad = degToRad(-90 + (winChance / 100) * 360);

      g.arc(0, 0, 130, startRad, endRad);
      g.stroke({ width: 18, color: 0x10b981, cap: "butt" });

      /// --- ВОЛНА ХИЛА (ПОБЕДА) ---
      if (physics.current.winRippleProgress < 1) {
        const p = physics.current.winRippleProgress;
        // УВЕЛИЧИЛИ РАДИУС РАССЕИВАНИЯ: теперь кольцо расходится на 120px вместо 60px
        const rippleRadius = 130 + p * 120;
        const rippleAlpha = (1 - p) * 0.9;
        const rippleWidth = 18 * (1 - p * 0.5);

        g.circle(0, 0, rippleRadius);
        g.stroke({ width: rippleWidth, color: 0x34d399, alpha: rippleAlpha });
      }

      // --- АНИМАЦИЯ УРОНА (ПОРАЖЕНИЕ) ---
      if (physics.current.lossPulseProgress < 1) {
        const p = physics.current.lossPulseProgress;

        // 1. Статичный круг: висит на максимуме до 60% времени анимации, затем резко тухнет
        const holdPhase = 0.6;
        let coreAlpha = 0;
        if (p < holdPhase) {
          coreAlpha = 0.8; // Зависшая яркая фаза
        } else {
          // Резкий спад в 0 за остаток времени
          coreAlpha = 0.8 * (1 - (p - holdPhase) / (1 - holdPhase));
        }

        g.circle(0, 0, 130);
        g.stroke({ width: 18, color: 0xef4444, alpha: coreAlpha });

        // 2. Ударная волна урона: появляется ЗА кругом (начинается с радиуса 145px)
        const waveRadius = 145 + p * 50; // Расширяется наружу
        const waveAlpha = (1 - p) * 0.8; // Резкое затухание
        const waveWidth = 10 * (1 - p); // Тонкая агрессивная линия

        g.circle(0, 0, waveRadius);
        g.stroke({ width: waveWidth, color: 0xf87171, alpha: waveAlpha });
      }
    },
    [winChance],
  );

  const drawRadarRef = useRef(drawRadar);
  drawRadarRef.current = drawRadar;

  const drawPointer = useCallback((g: Graphics) => {
    g.clear();
    g.moveTo(0, -148);
    g.lineTo(-9, -166);
    g.lineTo(9, -166);
    g.closePath();
    g.fill({ color: 0x38bdf8 });

    g.moveTo(0, 0);
    g.lineTo(0, -140);
    g.stroke({ width: 3, color: 0x38bdf8 });

    g.circle(0, 0, 8);
    g.fill({ color: 0xf8fafc });
  }, []);

  return (
    <pixiContainer x={400} y={200}>
      <pixiGraphics ref={radarRef} draw={drawRadar} />
      <pixiContainer ref={pointerRef}>
        <pixiGraphics draw={drawPointer} />
      </pixiContainer>
    </pixiContainer>
  );
};

export const CanvasEngine = memo(() => {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-800 shadow-2xl relative">
      <Application width={800} height={400} background="#090d16" antialias>
        <UpgraderCore />
      </Application>
    </div>
  );
});
