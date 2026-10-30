import { Howl } from "howler";

export const gameAudio = new Howl({
  src: ["/sprite.mp3"],
  preload: true, // Начинаем загрузку файла сразу при старте приложения
  sprite: {
    tick: [30, 80],
    win: [500, 2500],
    loss: [3120, 850],
    tick_final: [4036, 80],
    start: [5050, 1500],
  },
});
