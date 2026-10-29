import { useEffect, useRef } from "react";
import gsap from "gsap";

interface BalanceCounterProps {
  balance: number;
}

export const BalanceCounter = ({ balance }: BalanceCounterProps) => {
  const balanceRef = useRef<HTMLSpanElement>(null);
  const prevBalance = useRef(balance); // Запоминаем предыдущее значение

  useEffect(() => {
    if (!balanceRef.current) return;

    // Если баланс не изменился (например, при первом рендере) - ничего не делаем
    if (balance === prevBalance.current) return;

    // Создаем объект-пустышку для GSAP
    const target = { val: prevBalance.current };

    // Плавно меняем значение от старого к новому
    const tween = gsap.to(target, {
      val: balance,
      duration: 1.2, // Время накрутки (1.2 секунды)
      ease: "power3.out", // Быстрый старт, плавное замедление в конце
      onUpdate: () => {
        if (balanceRef.current) {
          // Напрямую пишем в DOM, React об этом даже не знает
          balanceRef.current.innerText = `$${Math.round(target.val)}`;
        }
      },
    });

    // Обновляем память для следующего раза
    prevBalance.current = balance;

    // Очистка анимации, если компонент вдруг удалится
    return () => {
      tween.kill();
    };
  }, [balance]); // React вызывает этот хук ТОЛЬКО в момент смены баланса (1 раз за спин)

  // Первичный рендер
  return (
    <span ref={balanceRef} className="text-emerald-400 font-bold">
      ${prevBalance.current}
    </span>
  );
};
