import { useEffect, useRef, useCallback, memo } from "react";
import { Application, extend } from "@pixi/react";
import { Container, Graphics } from "pixi.js";
import gsap from "gsap";
import { useAppStore } from "@/store/useAppStore";

extend({ Container, Graphics });

// Однострочный переводчик градусов в радианы специально для метода g.arc()
const degToRad = (deg: number) => (deg * Math.PI) / 180;

const UpgraderCore = () => {
  const pointerRef = useRef<Container>(null);

  const targetAngle = useAppStore((s) => s.targetAngle);
  const winChance = useAppStore((s) => s.winChance);
  const completeSpin = useAppStore((s) => s.completeSpin);

  useEffect(() => {
    if (!pointerRef.current || targetAngle === 0) return;

    // Крутим свойство angle (в градусах) вместо rotation
    const tween = gsap.to(pointerRef.current, {
      angle: targetAngle,
      duration: 4,
      ease: "power4.out",
      onComplete: () => {
        completeSpin();
      },
    });

    return () => {
      tween.kill();
    };
  }, [targetAngle, completeSpin]);

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
