import { Howl } from "howler";

export const gameAudio = new Howl({
  src: ["/sprite.mp3"],
  preload: true, // Начинаем загрузку файла сразу при старте приложения
  sprite: {
    tick: [35, 48],
    win: [500, 2500],
    loss: [3100, 850],
  },
});
