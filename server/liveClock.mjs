import { tick } from './rules.mjs';
import { periodicAbilityIntervalMs } from './abilityCards.mjs';

export async function runLiveClockOnce(store) {
  for (const id of await store.gamesDueAbilityWave(periodicAbilityIntervalMs)) {
    // 与玩家请求共用数据库行锁。多实例、重启和并发刷新不会重复发卡。
    await store.update(id, state => { if (state.status === 'RUNNING') tick(state); return { wave: state.lastAbilityPeriodicWave }; }, true);
  }
}

export function registerLiveClock(app, store) {
  let timer; let running; let closed = false;
  const scan = () => {
    if (closed || running) return;
    running = runLiveClockOnce(store).catch(error => app.log.error({ error: error.message }, 'Live card clock failed')).finally(() => { running = null; });
  };
  app.addHook('onReady', async () => { scan(); timer = setInterval(scan, 1000); timer.unref(); });
  app.addHook('onClose', async () => { closed = true; clearInterval(timer); await running; });
}
