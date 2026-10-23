import { useEffect, useRef, useCallback, memo } from "react";
import { Application, extend, useTick } from "@pixi/react";
import { Container, Graphics } from "pixi.js";
import { useAppStore } from "@/store/useAppStore";

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
  });

  // Старт запроса — даем начальный импульс
  useEffect(() => {
    if (spinState === "requesting") {
      physics.current.velocity = 25; // Градусов за кадр
      physics.current.isStopping = false;
      physics.current.targetCalculated = false;
    }
  }, [spinState]);

  // Вызывается каждый кадр (обычно 60 раз в секунду)
  // Вызывается каждый кадр
  useTick((ticker: any) => {
    if (!pointerRef.current || spinState === "idle") return;
    const delta = ticker?.deltaTime ?? ticker ?? 1;

    // СТАДИЯ 1: Бесконечное вращение с постоянной скоростью
    if (spinState === "requesting") {
      pointerRef.current.angle += physics.current.velocity * delta;
      pointerRef.current.angle %= 360;
    }

    // СТАДИЯ 2: Ответ получен, вычисляем идеальный тормозной путь
    if (spinState === "spinning") {
      if (!physics.current.targetCalculated) {
        const currentAngle = pointerRef.current.angle;
        let dist = targetAngle - currentAngle;
        if (dist < 0) dist += 360;
        dist += 360 * 6; // Накидываем ровно 6 обязательных оборотов

        physics.current.startAngle = currentAngle;
        physics.current.distance = dist;
        // Время торможения (в кадрах) = 2 * Путь / Начальная Скорость
        physics.current.timeTotal = (2 * dist) / physics.current.velocity;
        physics.current.timePassed = 0;

        physics.current.targetCalculated = true;
        physics.current.isStopping = true;
      }

      if (physics.current.isStopping) {
        physics.current.timePassed += delta;
        // Прогресс анимации от 0 до 1
        let progress = physics.current.timePassed / physics.current.timeTotal;

        if (progress >= 1) {
          progress = 1;
          pointerRef.current.angle = targetAngle;
          physics.current.isStopping = false;
          completeSpin();
        } else {
          // Идеальная математическая кривая торможения (Quadratic Ease Out)
          // Формула: 2t - t^2. Сохраняет начальную скорость и плавно сводит ее в 0
          const easeOut = progress * (2 - progress);
          const traveled = physics.current.distance * easeOut;

          pointerRef.current.angle =
            (physics.current.startAngle + traveled) % 360;
        }
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
