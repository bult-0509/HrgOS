export type UserMode = "player" | "staff";

export type PlayerTab = "home" | "tasks" | "cards" | "messages";
export type StaffTab = "overview" | "review" | "map" | "control";

export type RegionState = "upcoming" | "pending" | "active" | "complete";

export interface Region {
  id: string;
  sequence: number;
  name: string;
  subtitle: string;
  imageTone: string;
  clue: string;
  state: RegionState;
  progress: number;
}

export type TaskState = "available" | "pending" | "awarded" | "locked";

export interface Task {
  id: string;
  /** 任务所属的主题棋盘，不是允许提交的队伍。 */
  boardId?: string;
  pointsConfigured?: boolean;
  scoreDifficulty?: '易' | '中' | '难' | '极难';
  bonus?: { points: number; threshold: number; comparison: string };
  failurePenalty?: number;
  regionId: string;
  title: string;
  brief: string;
  points: number;
  difficulty: "轻松" | "标准" | "挑战";
  state: TaskState;
  imageTone: string;
  pendingCount?: number;
  awardedTeam?: string;
  sharedSlot?: string;
  configured?: boolean;
}

export interface GameCard {
  id: string;
  /** 功能卡原编号；不代表次数、费用或 Bingo 格号。 */
  number?: number;
  target?: 'self' | 'other' | 'all' | 'others' | 'random' | 'highest';
  name: string;
  description: string;
  category: "intel" | "boost" | "control";
  uses: number;
  needsConfirmation?: boolean;
}

export interface GameMessage {
  id: string;
  type: "review" | "event" | "system" | "card";
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

export interface TeamStatus {
  id: string;
  name: string;
  shortName: string;
  score: number;
  rank: number;
  region: string;
  status: "online" | "offline" | "finished";
  lastSeen: string;
  x: number;
  y: number;
  color: string;
}

export interface AuditItem {
  id: string;
  kind: "图寻题" | "普通任务" | "格位图寻";
  team: string;
  task: string;
  submittedAt: string;
  waitingSeconds: number;
  imageTone: string;
  checklist: string[];
  /** 区域入口审核必须带明确目标，不得从任务文案猜测。 */
  teamId?: string;
  targetRegionId?: string;
  photoSlot?: string;
  photoRegionId?: string;
  taskId?: string;
  taskRegionId?: string;
}

export interface ToastState {
  id: number;
  tone: "success" | "warning" | "info";
  title: string;
  body: string;
}
