import { reachMetrikaGoal } from '~/utils/metrika'

/**
 * Отправка цели в Яндекс.Метрику (reachGoal). Единая точка вызова `ym`, чтобы
 * не дублировать обращение к window/счётчику по компонентам. Безопасно no-op,
 * если Метрика не загружена (напр. внутри iframe Б24 — metrika.js там глушится)
 * или id счётчика пустой. Счётчик — `yandexCounterId` (только цифры, см. layout).
 */
export function useMetrikaGoal() {
  const config = useRuntimeConfig()

  function reachGoal(goal: string) {
    if (!import.meta.client) return
    const w = window as Window & { ym?: unknown }
    reachMetrikaGoal(w.ym, config.public.yandexCounterId as string, goal)
  }

  return { reachGoal }
}
