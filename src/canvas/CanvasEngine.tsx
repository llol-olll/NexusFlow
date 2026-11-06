import { useEffect, useRef, useCallback, memo } from "react";
import { Application, extend } from "@pixi/react"; // Убрали useTick
import { Container, Graphics, Ticker } from "pixi.js"; // Добавили Ticker
import { useAppStore } from "@/store/useAppStore";
import { gameAudio } from "@/utils/sound";

extend({ Container, Graphics });

const CORRECTION_SPIN_SOUND = 0.01397;
// --- ФИЗИЧЕСКИЕ НАСТРОЙКИ КОЛЕСА ---
const MAX_VELOCITY = 20; // Предельная скорость (градусов/кадр)
const ACCEL_START_BASE = 0.24; // Стартовый толчок (было 0.12 — увеличили в 2 раза для бодрого старта)
const ACCEL_RAMP_POWER = 0.56; // Максимальная прибавка тяги при разгоне
const MIN_STOP_REVOLUTIONS = 5; // Минимальное число полных оборотов при торможении (было 3)
const STOP_EASE_POWER = 2.2; // Степень кривой: 2 = бодрый финиш, 3 = классика, 4-5 = затяжное драматичное подползание

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const UpgraderCore = () => {
  const pointerRef = useRef<Container>(null);

  // Оставляем в React только winChance, так как он нужен для отрисовки дуги.
  // Эта переменная меняется только при клике на кнопки, так что во время спина ререндеров НЕ БУДЕТ.
  const winChance = useAppStore((s) => s.winChance);
  const radarRef = useRef<Graphics>(null);

  const speedFxRef = useRef<Graphics>(null);
  const isSpeedFxActive = useRef(false);
  const noopDraw = useCallback(() => {}, []);

  // Статичный буфер орбитальных дуг (без аллокаций в рантайме)
  const speedArcs = useRef(
    Array.from({ length: 12 }, (_, i) => ({
      radius: 155 + (i % 4) * 18,
      angle: (i * 360) / 12,
      baseLength: 10 + (i % 3) * 6,
      speedMult: 0.85 + (i % 3) * 0.2,
      color: i % 2 === 0 ? 0x06b6d4 : 0xec4899, // Бирюзовый и неоновая маджента
    })),
  );

  // Статичный буфер радиальных лучей
  const speedRays = useRef(
    Array.from({ length: 16 }, (_, i) => ({
      angle: (i * 360) / 16,
      innerR: 146,
      outerR: 200 + (i % 4) * 25,
      offset: (i * 23) % 360,
    })),
  );

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

  const drawSpeedFx = useCallback(
    (
      g: Graphics,
      speed: number,
      delta: number,
      currentAngle: number,
      stopProgress: number = 0, // Добавили параметр: 0 в полете, стремится к 1 перед остановкой
    ) => {
      g.clear();
      if (speed <= 0.1) return;

      const tension = stopProgress > 0 ? Math.pow(stopProgress, 2) : 0;
      const intensity = Math.min(1, Math.max(0.15, speed / MAX_VELOCITY));

      // 1. Орбитальные шлейфы
      speedArcs.current.forEach((arc) => {
        arc.angle = (arc.angle + speed * arc.speedMult * delta) % 360;

        // При торможении дуги не растворяются, а укорачиваются и уплотняются
        const arcLengthDeg =
          (arc.baseLength + 45) * intensity * (1 - tension * 0.5);
        if (arcLengthDeg < 0.5) return;

        // Радиус плавно притягивается ближе к треку колеса
        const dynamicRadius = arc.radius - (arc.radius - 142) * tension;

        const startAngle = degToRad(arc.angle);
        const endAngle = degToRad(arc.angle + arcLengthDeg);

        g.moveTo(
          Math.cos(startAngle) * dynamicRadius,
          Math.sin(startAngle) * dynamicRadius,
        );
        g.arc(0, 0, dynamicRadius, startAngle, endAngle);
        g.stroke({
          width: Math.max(0.5, (1.5 + intensity * 2.5) * (1 + tension * 0.7)),
          color: arc.color,
          alpha: Math.min(1, intensity * 0.7 + tension * 0.3),
          cap: "round",
        });
      });

      // 2. Радиальные лучи (исчезают первыми, чтобы очистить сцену к моменту удара)
      if (tension < 0.8) {
        const rayAlphaMult = 1 - tension / 0.8;
        speedRays.current.forEach((ray, idx) => {
          const rotAngle = (ray.angle + ray.offset + currentAngle * 0.25) % 360;
          const rad = degToRad(rotAngle);
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          const dynamicOuter =
            ray.innerR + (ray.outerR - ray.innerR) * intensity;
          if (dynamicOuter - ray.innerR < 1) return;

          g.moveTo(cos * ray.innerR, sin * ray.innerR);
          g.lineTo(cos * dynamicOuter, sin * dynamicOuter);
          g.stroke({
            width: 1.5 * intensity,
            color: 0x38bdf8,
            alpha: (0.1 + (idx % 3) * 0.1) * intensity * rayAlphaMult,
          });
        });
      }
    },
    [],
  );

  const drawSpeedFxRef = useRef(drawSpeedFx);
  drawSpeedFxRef.current = drawSpeedFx;

  // ВЕСЬ ИГРОВОЙ ЦИКЛ ЖИВЕТ ЗДЕСЬ И НЕ ЗАВИСИТ ОТ REACT
  useEffect(() => {
    // Функция мгновенного завершения спина (если вкладка ушла в фон)
    const forceInstantFinish = () => {
      const state = useAppStore.getState();
      // Завершаем только если рулетка уже получила угол от сервера и крутится
      if (state.spinState !== "spinning" || !pointerRef.current) return;

      // 1. Ставим стрелку ровно на целевой градус без анимации
      pointerRef.current.angle = state.targetAngle;

      // 2. Сбрасываем физику и очищаем шлейфы скорости
      physics.current.isStopping = false;
      physics.current.targetCalculated = false;
      physics.current.velocity = 0;
      physics.current.winRippleProgress = 1;
      physics.current.lossPulseProgress = 1;

      if (speedFxRef.current) {
        speedFxRef.current.clear();
        isSpeedFxActive.current = false;
      }

      // 3. Звук финиша и перевод стейт-машины в завершенное состояние
      gameAudio.play("tick_final");
      state.completeSpin();
    };

    // Завершаем спин только по факту переключения вкладки (событийно, без опроса в каждом кадре)
    const handleVisibilityChange = () => {
      const state = useAppStore.getState();
      if (
        !document.hidden ||
        state.spinState !== "spinning" ||
        !pointerRef.current
      )
        return;

      // Ставим стрелку на цель и сбрасываем физику
      pointerRef.current.angle = state.targetAngle;
      physics.current.isStopping = false;
      physics.current.targetCalculated = false;
      physics.current.velocity = 0;

      if (speedFxRef.current) {
        speedFxRef.current.clear();
        isSpeedFxActive.current = false;
      }

      gameAudio.play("tick_final");
      state.completeSpin();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleTick = (tickerObj: any) => {
      if (!pointerRef.current) return;

      const state = useAppStore.getState();
      const spinState = state.spinState;
      const targetAngle = state.targetAngle;
      const lastResult = state.lastResult;

      const rawDelta = tickerObj?.deltaTime ?? tickerObj ?? 1;
      const delta = Math.min(rawDelta, 10);

      // --- МАТЕМАТИКА АНИМАЦИИ ВОЛНЫ (Автономный цикл) ---
      // --- 1. АВТОНОМНЫЙ ТИК ВОЛН (работает в любом стейте без дублирования условий) ---
      let needsRadarRedraw = false;

      // Волна победы: мягко долетает до конца, даже если уже нажали "Крутить"
      if (physics.current.winRippleProgress < 1) {
        physics.current.winRippleProgress = Math.min(
          1,
          physics.current.winRippleProgress + delta * 0.035,
        );
        needsRadarRedraw = true;
      }

      // Вспышка поражения: аналогично живет своей жизнью до единицы
      if (physics.current.lossPulseProgress < 1) {
        physics.current.lossPulseProgress = Math.min(
          1,
          physics.current.lossPulseProgress + delta * 0.025,
        );
        needsRadarRedraw = true;
      }

      // Перерисовываем радар только если хотя бы одна волна в движении
      if (needsRadarRedraw && radarRef.current) {
        drawRadarRef.current(radarRef.current);
      }

      // --- 2. РАННИЙ ВЫХОД ДЛЯ ФИЗИКИ СТРЕЛКИ ---
      // Если колесо в покое, глушим скорость стрелки и выходим, не считая физику движения
      if (spinState === "idle") {
        physics.current.velocity = 0;
        return;
      }

      // 3. СТАДИЯ 1: Разгон и кручение
      if (spinState === "requesting") {
        if (physics.current.velocity === 0 && !physics.current.isStopping) {
          // Инициализируем только угол для звуковых тиков и сбрасываем флаги физики,
          // НЕ трогая прогресс волн — они сами плавно завершатся в блоке выше
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

        // Прогрессивный разгон: старт с мягких 0.12 (без рывка) с плавным набором темпа до 0.6
        const speedRatio = physics.current.velocity / MAX_VELOCITY;

        const progressiveAccel =
          (ACCEL_START_BASE + Math.pow(speedRatio, 1.5) * ACCEL_RAMP_POWER) *
          delta;

        if (physics.current.velocity < MAX_VELOCITY) {
          physics.current.velocity = Math.min(
            MAX_VELOCITY,
            physics.current.velocity + progressiveAccel,
          );
        }

        // Просто прибавляем угол, НЕ ИСПОЛЬЗУЕМ % 360
        pointerRef.current.angle += physics.current.velocity * delta;
      }

      // 4. СТАДИЯ 2: Торможение и расчет прогресса
      let stopProgress = 0;
      let instantSpeed = 0;

      if (spinState === "requesting") {
        instantSpeed = physics.current.velocity;
      }

      if (spinState === "spinning") {
        if (document.hidden) {
          forceInstantFinish();
          return;
        }

        if (!physics.current.targetCalculated) {
          const currentAngle = pointerRef.current.angle;
          const currentWrapped = currentAngle % 360;

          let dist = targetAngle - currentWrapped;
          if (dist < 0) dist += 360;
          dist += 360 * MIN_STOP_REVOLUTIONS;

          physics.current.startAngle = currentAngle;
          physics.current.distance = dist;
          physics.current.timeTotal =
            (STOP_EASE_POWER * dist) / physics.current.velocity;
          physics.current.timePassed = 0;
          physics.current.traveled = 0;

          physics.current.targetCalculated = true;
          physics.current.isStopping = true;
        }

        if (physics.current.isStopping) {
          physics.current.timePassed += delta;
          stopProgress = Math.min(
            1,
            physics.current.timePassed / physics.current.timeTotal,
          );
          // Поддерживаем видимую скорость шлейфа вплоть до финального пикселя
          instantSpeed = Math.max(
            0.5,
            physics.current.velocity *
              Math.pow(1 - stopProgress, STOP_EASE_POWER),
          );

          if (stopProgress >= 1) {
            pointerRef.current.angle =
              physics.current.startAngle + physics.current.distance;

            gameAudio.play("tick_final");

            pointerRef.current.angle = pointerRef.current.angle % 360;
            physics.current.isStopping = false;

            // Мгновенно стираем шлейф на этом же кадре
            if (speedFxRef.current) {
              speedFxRef.current.clear();
              isSpeedFxActive.current = false;
            }

            // Запускаем волну точно в момент удара стрелки
            if (state.pendingPayout > 0) {
              physics.current.winRippleProgress = 0;
              physics.current.lossPulseProgress = 1;
            } else {
              physics.current.winRippleProgress = 1;
              physics.current.lossPulseProgress = 0;
            }

            state.completeSpin();
          } else {
            // Кубический ease-out: стрелка быстро сбрасывает скорость, но интригующе наплывает в конце
            const easeOut = 1 - Math.pow(1 - stopProgress, STOP_EASE_POWER);
            const traveledNow = physics.current.distance * easeOut;
            physics.current.traveled = traveledNow;

            pointerRef.current.angle = physics.current.startAngle + traveledNow;
          }
        }
      }

      // --- ОТРИСОВКА ШЛЕЙФА СКОРОСТИ ---
      // Вызывается строго ПОСЛЕ движения стрелки, передавая актуальный stopProgress
      if (
        speedFxRef.current &&
        (spinState === "requesting" ||
          (spinState === "spinning" && stopProgress < 1))
      ) {
        if (instantSpeed > 0.1) {
          drawSpeedFxRef.current(
            speedFxRef.current,
            instantSpeed,
            delta,
            pointerRef.current.angle,
            stopProgress,
          );
          isSpeedFxActive.current = true;
        }
      } else if (speedFxRef.current && isSpeedFxActive.current) {
        speedFxRef.current.clear();
        isSpeedFxActive.current = false;
      }

      //5.  Если стрелка + опережение пересекли заветную отметку (45, 90, 135...)
      if (
        pointerRef.current.angle - CORRECTION_SPIN_SOUND >=
        physics.current.nextTickAngle
      ) {
        // Нормализуем текущую скорость относительно максимума (от 0 до 1)
        const speedRatio = Math.min(
          1,
          Math.max(0, instantSpeed / MAX_VELOCITY),
        );

        // Динамический питч: от 0.78 (тяжелый тягучий щелчок) до 1.22 (звонкий резкий)
        const currentRate = 0.78 + speedRatio * 0.44;

        // Динамическая громкость: на излете звук чуть затихает, освобождая сцену под tick_final
        const currentVolume = 0.5 + speedRatio * 0.5;

        const soundId = gameAudio.play("tick");
        gameAudio.rate(currentRate, soundId);
        gameAudio.volume(currentVolume, soundId);

        physics.current.nextTickAngle += 45;
      }
    };

    Ticker.shared.add(handleTick);
    return () => {
      Ticker.shared.remove(handleTick);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const drawRadar = useCallback(
    (g: Graphics) => {
      g.clear();

      // 1. Внешний базовый трек
      g.circle(0, 0, 130);
      g.fill({ color: 0x0f172a });
      g.stroke({ width: 18, color: 0x1e293b });

      // 2. Сектор шанса (зеленая дуга)
      const startRad = degToRad(-90);
      const endRad = degToRad(-90 + (winChance / 100) * 360);

      // ИСПРАВЛЕНИЕ: перемещение пера исключает внутренний паразитный отрезок от (0, 0)
      g.moveTo(0, -130);
      g.arc(0, 0, 130, startRad, endRad);
      g.stroke({ width: 18, color: 0x10b981, cap: "butt" });

      // 3. Аккуратный микро-разделитель нулевой точки строго в пределах трека (12 часов)
      g.moveTo(0, -121);
      g.lineTo(0, -139);
      g.stroke({ width: 2, color: 0x090d16 });

      // 4. Волна победы
      if (physics.current.winRippleProgress < 1) {
        const p = physics.current.winRippleProgress;
        const rippleRadius = 130 + p * 120;
        const rippleAlpha = (1 - p) * 0.9;
        const rippleWidth = 18 * (1 - p * 0.5);

        g.circle(0, 0, rippleRadius);
        g.stroke({ width: rippleWidth, color: 0x34d399, alpha: rippleAlpha });
      }

      // 5. Анимация урона (поражение)
      if (physics.current.lossPulseProgress < 1) {
        const p = physics.current.lossPulseProgress;
        const holdPhase = 0.6;
        let coreAlpha = 0;
        if (p < holdPhase) {
          coreAlpha = 0.8;
        } else {
          coreAlpha = 0.8 * (1 - (p - holdPhase) / (1 - holdPhase));
        }

        g.circle(0, 0, 130);
        g.stroke({ width: 18, color: 0xef4444, alpha: coreAlpha });

        const waveRadius = 145 + p * 50;
        const waveAlpha = (1 - p) * 0.8;
        const waveWidth = 10 * (1 - p);

        g.circle(0, 0, waveRadius);
        g.stroke({ width: waveWidth, color: 0xf87171, alpha: waveAlpha });
      }

      // 6. Контрастная центральная подложка циферблата (отсекает сектор от текста)
      g.circle(0, 0, 98);
      g.fill({ color: 0x090d16 });
      g.stroke({ width: 2, color: 0x1e293b });

      // Тонкая внутренняя декоративная риска
      g.circle(0, 0, 90);
      g.stroke({ width: 1, color: 0x334155, alpha: 0.4 });
    },
    [winChance],
  );

  const drawRadarRef = useRef(drawRadar);
  drawRadarRef.current = drawRadar;

  const drawPointer = useCallback((g: Graphics) => {
    g.clear();

    // 1. Внешний неоновый ореол рассеяния (Bloom-ореол)
    g.moveTo(0, -98);
    g.lineTo(0, -134);
    g.stroke({ width: 34, color: 0xc026d3, alpha: 0.18, cap: "round" });

    // 2. Насыщенный слой неоновой мадженты
    g.moveTo(0, -98);
    g.lineTo(0, -134);
    g.stroke({ width: 20, color: 0xec4899, alpha: 0.4, cap: "round" });

    // 3. Плотный световой фронт
    g.moveTo(0, -98);
    g.lineTo(0, -134);
    g.stroke({ width: 15, color: 0xf472b6, alpha: 0.8, cap: "round" });

    // 4. Раскаленное белое ядро плазменного луча
    g.moveTo(0, -98);
    g.lineTo(0, -134);
    g.stroke({ width: 6.2, color: 0xffffff, alpha: 0.98, cap: "round" });
  }, []);

  return (
    <pixiContainer x={400} y={200}>
      <pixiGraphics ref={speedFxRef} draw={noopDraw} />
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
