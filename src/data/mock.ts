import type { AuditItem, GameCard, GameMessage, Region, Task, TeamStatus } from "../types";
import { bingoSlots, photoRegions } from './photoClues';
import { previewAbilityCards } from './abilityPreview';

export const regions: Region[] = [
  { id: "stage-a", sequence: 1, name: "A 区", subtitle: "起始赛段 · 已完成", imageTone: "tone-cyan", clue: "找到与参考图一致的入口编号", state: "complete", progress: 100 },
  { id: "stage-b", sequence: 2, name: "B 区", subtitle: "当前赛段 · 任务已解锁", imageTone: "tone-lime", clue: "找到参考图中的荧光标识并完成合照", state: "active", progress: 58 },
  { id: "stage-c", sequence: 3, name: "C 区", subtitle: "等待上一赛段结束", imageTone: "tone-magenta", clue: "找到两个编号同时进入画面的拍摄点", state: "upcoming", progress: 0 }
];

const existingTasks: Task[] = [
  { id: "T-201", regionId: "stage-b", title: "同步判定", brief: "两名队员在指定标记前完成同一动作，动作误差不超过一拍。", points: 12, difficulty: "标准", state: "available", imageTone: "tone-lime" },
  { id: "T-202", regionId: "stage-b", title: "极限连击", brief: "按参考顺序完成三处打卡，并把三个编号拍进同一张照片。", points: 18, difficulty: "挑战", state: "pending", imageTone: "tone-cyan", pendingCount: 2 },
  { id: "T-203", regionId: "stage-b", title: "盲区协作", brief: "一人只看提示，一人完成指定站位；最终照片需包含完整标记。", points: 8, difficulty: "轻松", state: "available", imageTone: "tone-violet" },
  { id: "T-204", regionId: "stage-b", title: "精准落点", brief: "复刻参考图中的前后站位关系，脚尖需要落在指定线内。", points: 15, difficulty: "标准", state: "awarded", imageTone: "tone-orange", awardedTeam: "Arcaea队" },
  { id: "T-205", regionId: "stage-b", title: "反向操作", brief: "按反向口令完成四个动作，并提交最后一个动作的现场照片。", points: 10, difficulty: "标准", state: "available", imageTone: "tone-red" },
  { id: "T-207", regionId: "stage-b", title: "双人谱面", brief: "两名队员分别站在左右标记点，同时完成对应手势。", points: 14, difficulty: "标准", state: "available", imageTone: "tone-blue" },
  { id: "T-208", regionId: "stage-b", title: "体感校准", brief: "根据现场箭头调整方向，让两人的手臂与指示线重合。", points: 16, difficulty: "挑战", state: "available", imageTone: "tone-cyan" },
  { id: "T-209", regionId: "stage-b", title: "指令交换", brief: "交换手机后读取对方指令，完成指定姿势并合照。", points: 9, difficulty: "轻松", state: "available", imageTone: "tone-violet" },
  { id: "T-210", regionId: "stage-b", title: "终局加速", brief: "在倒计时结束前完成连续动作，两名队员都需完整出镜。", points: 20, difficulty: "挑战", state: "available", imageTone: "tone-magenta" },
  { id: "T-206", regionId: "stage-c", title: "双点锁定", brief: "通过 C 区图寻题后显示完整任务。", points: 16, difficulty: "挑战", state: "locked", imageTone: "tone-magenta" }
];

// Preserve existing demo task text/state. New slots remain explicitly unconfigured.
export const initialTasks: Task[] = photoRegions.flatMap(region => {
  const existing = existingTasks.filter(task => task.regionId === region.id);
  return bingoSlots.map(sharedSlot => {
    const seed = sharedSlot.startsWith('P') ? existing[Number(sharedSlot.slice(1)) - 1] : undefined;
    if (seed) return { ...seed, sharedSlot, configured: true };
    return {
      id: `T-${region.letter}-${sharedSlot}`,
      regionId: region.id,
      sharedSlot,
      configured: false,
      title: `${sharedSlot.startsWith('P') ? '图寻' : '直接'}任务 · ${sharedSlot}`,
      brief: '正式任务内容待工作人员配置。',
      points: 0,
      difficulty: '标准' as const,
      state: region.id === 'stage-c' ? 'locked' as const : 'available' as const,
      imageTone: 'tone-cyan'
    };
  });
});

// 赛事棋盘是固定 25 项任务。旧分区样稿保留，但不随区域推进切换任务集。
export const initialBingoTasks = initialTasks.filter(task => task.regionId === 'stage-b');

// 本地仅模拟持有前三张真实功能卡，不把完整卡池冒充已获得的库存。
export const initialCards: GameCard[] = previewAbilityCards.slice(0, 3).map((card, index) => ({ ...card, id: `C-${String(index + 1).padStart(2, '0')}` }));

export const initialMessages: GameMessage[] = [
  { id: "M-01", type: "review", title: "任务审核通过", body: "“同步判定”已通过审核，队伍增加 12 分。", time: "14:26", unread: true },
  { id: "M-02", type: "event", title: "随机事件已触发", body: "Phigros队进入 B 区时触发了一项新事件。", time: "14:21", unread: true },
  { id: "M-03", type: "system", title: "下一次排名公开", body: "全体排名将在 18 分钟后公开两分钟。", time: "14:12", unread: false },
  { id: "M-04", type: "card", title: "获得道具卡", body: `道具卡“${initialCards[2].name}”已放入队伍卡包。`, time: "13:58", unread: false }
];

export const teams: TeamStatus[] = [
  { id: "team-1", name: "Phigros队", shortName: "PHI", score: 126, rank: 2, region: "B 区", status: "online", lastSeen: "刚刚", x: 47, y: 44, color: "#c8ff32" },
  { id: "team-2", name: "Arcaea队", shortName: "ARC", score: 139, rank: 1, region: "B 区", status: "online", lastSeen: "3 秒前", x: 64, y: 32, color: "#42d9ff" },
  { id: "team-3", name: "范式起源队", shortName: "PPR", score: 102, rank: 3, region: "A 区", status: "offline", lastSeen: "2 分钟前", x: 31, y: 62, color: "#a78bfa" },
  { id: "team-4", name: "maimai队", shortName: "MMA", score: 88, rank: 4, region: "工作人员包厢", status: "finished", lastSeen: "14:02 完赛", x: 76, y: 74, color: "#f6c84f" },
  { id: "team-5", name: "全能队", shortName: "ALL", score: 74, rank: 5, region: "A 区", status: "online", lastSeen: "7 秒前", x: 20, y: 38, color: "#ff4f9a" }
];

export const initialAuditQueue: AuditItem[] = [
  { id: "A-108", kind: "普通任务", team: "范式起源队", task: "极限连击", submittedAt: "14:28:16", waitingSeconds: 42, imageTone: "tone-cyan", checklist: ["两名队员至少一人出镜", "三个编号清晰可辨", "画面为现场原图"] },
  { id: "A-109", kind: "图寻题", teamId: "team-5", targetRegionId: "stage-b", team: "全能队", task: "B 区 · 入口图寻", submittedAt: "14:28:41", waitingSeconds: 17, imageTone: "tone-lime", checklist: ["与参考图为同一入口标识", "画面包含本队成员", "位置编号完整"] },
  { id: "A-110", kind: "普通任务", team: "Phigros队", task: "盲区协作", submittedAt: "14:28:52", waitingSeconds: 6, imageTone: "tone-violet", checklist: ["站位与参考一致", "队友完整出镜", "未遮挡公共通道"] }
];
