import { useEffect, useRef, useCallback, memo } from "react";
import { Application, extend, useTick } from "@pixi/react";
import { Container, Graphics } from "pixi.js";
import { useAppStore } from "@/store/useAppStore";
import { gameAudio } from "@/utils/sound";

extend({ Container, Graphics });

// Однострочный переводчик градусов в радианы специально для метода g.arc()
const degToRad = (deg: number) => (deg * Math.PI) / 180;

const UpgraderCore = () => {
  const pointerRef = useRef<Container>(null);

  const targetAngle = useAppStore((s) => s.targetAngle);
  const winChance = useAppStore((s) => s.winChance);
  const spinState = useAppStore((s) => s.spinState);
  const completeSpin = useAppStore((s) => s.completeSpin);

  // Стейт физики. Переписан под точную математику кривой Безье (без потери кадров)

  const physics = useRef({
    velocity: 0,
    startAngle: 0,
    distance: 0,
    timePassed: 0,
    timeTotal: 0,
    isStopping: false,
    targetCalculated: false,
    // Звуковой накопитель
    tickAccumulator: 0,
    traveled: 0,
    lastTickTime: 0,
  });

  // Старт запроса — даем начальный импульс
  useEffect(() => {
    if (spinState === "requesting") {
      physics.current.velocity = 17;
      physics.current.isStopping = false;
      physics.current.targetCalculated = false;
      physics.current.tickAccumulator = 0; // Обнуляем звук перед новым спином
    }
  }, [spinState]);

  // Вызывается каждый кадр (обычно 60 раз в секунду)
  useTick((ticker: any) => {
    if (!pointerRef.current || spinState === "idle") return;
    const delta = ticker?.deltaTime ?? ticker ?? 1;

    // В эту переменную мы будем записывать, на сколько градусов сдвинулась стрелка В ЭТОМ КАДРЕ
    let deltaAngle = 0;

    // СТАДИЯ 1: Ожидание (крутим линейно)
    if (spinState === "requesting") {
      deltaAngle = physics.current.velocity * delta; // Путь = Скорость * Время
      pointerRef.current.angle += deltaAngle;
      pointerRef.current.angle %= 360;
    }

    // СТАДИЯ 2: Ответ получен, плавно тормозим
    if (spinState === "spinning") {
      if (!physics.current.targetCalculated) {
        const currentAngle = pointerRef.current.angle;
        let dist = targetAngle - currentAngle;
        if (dist < 0) dist += 360;
        dist += 360 * 4; // Накидываем обороты

        physics.current.startAngle = currentAngle;
        physics.current.distance = dist;
        physics.current.timeTotal = (2 * dist) / physics.current.velocity;
        physics.current.timePassed = 0;
        physics.current.traveled = 0; // Изначально проехали 0

        physics.current.targetCalculated = true;
        physics.current.isStopping = true;
      }

      if (physics.current.isStopping) {
        physics.current.timePassed += delta;
        let progress = physics.current.timePassed / physics.current.timeTotal;

        if (progress >= 1) {
          // Остановка
          progress = 1;
          // Добиваем остаток угла, чтобы звук щелкнул правильно в самом конце
          deltaAngle = physics.current.distance - physics.current.traveled;

          pointerRef.current.angle = targetAngle; // Идеальная остановка
          physics.current.isStopping = false;
          completeSpin();
        } else {
          // Движение по кривой торможения
          const easeOut = progress * (2 - progress);
          const traveledNow = physics.current.distance * easeOut;

          // Пройденный угол за кадр = (Сколько прошли всего сейчас) - (Сколько прошли всего кадр назад)
          deltaAngle = traveledNow - physics.current.traveled;
          physics.current.traveled = traveledNow; // Запоминаем текущую дистанцию

          pointerRef.current.angle =
            (physics.current.startAngle + traveledNow) % 360;
        }
      }
    }

    // --- ЗВУКОВОЙ ТРИГГЕР ---
    // Добавляем пройденный в этом кадре микро-угол в копилку
    physics.current.tickAccumulator += deltaAngle;

    // Если накопили больше 36 градусов — издаем щелчок
    if (physics.current.tickAccumulator >= 36) {
      physics.current.tickAccumulator %= 36; // Сбрасываем копилку сразу

      const now = performance.now(); // Берем текущее время браузера

      // Играем звук только если с прошлого щелчка прошло больше 50 миллисекунд
      if (now - physics.current.lastTickTime > 50) {
        gameAudio.play("tick");
        physics.current.lastTickTime = now;
      }
    }
  });

  const drawRadar = useCallback(
    (g: Graphics) => {
      g.clear();

      g.circle(0, 0, 130);
      g.fill({ color: 0x0f172a });
      g.stroke({ width: 18, color: 0x1e293b });

      // В градусах всё прозрачно: стартуем с -90 град. (12 часов) и рисуем дугу длиной (winChance * 3.6) град.
      const startRad = degToRad(-90);
      const endRad = degToRad(-90 + (winChance / 100) * 360);

      g.arc(0, 0, 130, startRad, endRad);
      g.stroke({ width: 18, color: 0x10b981, cap: "butt" });

      g.circle(0, 0, 95);
      g.fill({ color: 0x090d16 });
      g.stroke({ width: 2, color: 0x334155 });
    },
    [winChance],
  );

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
      <pixiGraphics draw={drawRadar} />
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
