import catalog from '../src/data/scoringRules.json' with { type: 'json' };

export const officialScoring = catalog;

export function validateFinishRewards(rewards, requireRule) {
  requireRule(Array.isArray(rewards) && rewards.length === 5 && rewards.every((points, index) => Number.isSafeInteger(points) && points >= 0 && points <= 10000 && (index === 0 || points <= rewards[index - 1])), 'FINISH_REWARDS_INVALID', 400);
  return [...rewards];
}

export function taskScoreRules(task, requireRule) {
  const difficulty = task.difficulty;
  requireRule(difficulty == null || ['易', '中', '难', '极难'].includes(difficulty), 'TASK_CONFIG_INVALID', 400);
  const bonus = task.bonus;
  requireRule(bonus == null || Number.isSafeInteger(bonus.points) && bonus.points > 0 && bonus.points <= 10000 && Number.isSafeInteger(bonus.threshold) && bonus.threshold >= 0 && bonus.comparison === 'gte', 'TASK_SCORE_RULES_INVALID', 400);
  requireRule(task.failurePenalty == null || Number.isSafeInteger(task.failurePenalty) && task.failurePenalty > 0 && task.failurePenalty <= 10000, 'TASK_SCORE_RULES_INVALID', 400);
  return { ...(difficulty ? { difficulty } : {}), ...(bonus ? { bonus: { ...bonus } } : {}), ...(task.failurePenalty ? { failurePenalty: task.failurePenalty } : {}) };
}

// 平均名次奖励只在显式同批确认时使用，不将相同服务器毫秒误当作现场同时抵达。
export function finishAward(state, count) {
  const firstRank = state.teams.filter(team => team.finishedAt != null).length + 1;
  const rewards = state.config.finishRewards;
  if (!rewards) return { firstRank, points: state.config.finishPoints };
  const occupied = Array.from({ length: count }, (_, index) => rewards[firstRank - 1 + index] ?? 0);
  return { firstRank, points: Math.round(occupied.reduce((sum, value) => sum + value, 0) / count * 1e6) / 1e6 };
}
