import { validateTestApiBase } from '../testing/ruleSuite';

const messages: Record<string, string> = {
  PHOTO_FIND_REQUIRED: '请先复刻这张参考图的地点与拍摄角度，图寻审核通过后才能提交对应任务。',
  PHOTO_SLOT_INVALID: '请选择本区域有效的图寻图片编号。', PHOTO_ALREADY_APPROVED: '这张图寻已通过，对应任务已解锁。', PHOTO_REVIEW_PENDING: '这张图寻正在审核，请等待工作人员处理。',
  FINISH_REGION_REQUIRED: '请先通过龙翔桥入口审核，再确认完赛。', FINISH_TASKS_PENDING: '本队仍有任务待审核，请先处理后再确认完赛。', FINISH_REWARDS_INVALID: '完赛奖励须为五个递减的非负整数。',
  TASK_SCORE_RULES_INVALID: '任务额外奖励或失败扣分配置无效。', TASK_ATTEMPTS_INVALID: '请核对队伍、任务、真实失败次数与审核依据。', TASK_PERFORMANCE_INVALID: '核验成绩须为非负整数，并填写核验依据。',
  CARD_UNAVAILABLE: '这张卡已被使用、正在确认或已停用。', FORBIDDEN: '当前账号没有执行此操作的权限。',
  HISTORIC_LOCATION_UNAVAILABLE: '缺少十分钟前的有效定位，请由队长提前开启定位。', FRESH_LOCATION_REQUIRED: '冻结开始前，目标队长需要上报一次最新定位。',
  DURATION_NOT_FINISHED: '规定持续时间尚未结束，暂不能确认成功。', TIMELY_COMPLETION_REQUIRED: '请核实是否在截止前完成，并勾选现场确认或查看期间提交的证据。',
  KEY_INCORRECT: '密钥答案不正确，请重新检查。', KEY_ALREADY_ACCEPTED: '本队已有正确答案，无需重复提交。', SEMANTIC_REVIEW_PENDING: '请先审核待确认的中文答案，再结算竞速。', RACE_STILL_RUNNING: '竞速尚未结束，请等待所有队伍正确提交或倒计时结束。',
  GAME_CONFIG_REQUIRED: '请先配置真实比赛任务，再开始比赛。', TASK_CONFIG_INVALID: '请填写125个不同任务编号，以及每项的标题、说明和正整数分值；旧版25项配置仍兼容。',
  BINGO_BOARD_CONFIG_INVALID: '125项任务须按boardId分到五张Bingo，每张25项。棋盘分类不限制哪队提交。', BINGO_SLOT_CONFIG_INVALID: '每张棋盘必须完整包含P01–P19和D01–D06，格位不能重复；也可整张省略格位使用既定布局。',
  ABILITY_FINISH_BLOCKED: '还有未处理的能力卡，请先确认、结算或填写原因终止效果。', GAME_PAUSED: '比赛已暂停，请由工作人员继续比赛。', GAME_NOT_RUNNING: '比赛尚未开始或已经结束。',
  NICKNAME_LOCKED_AFTER_START: '昵称在开赛后锁定，请在开赛前保存。', THREE_MEMBERS_REQUIRED: '请选择三位不同的本队注册成员。', COUNTS_REQUIRED: '请逐一填写所有成员实际完成的下蹲次数，范围0到20。',
  PREVIOUS_TASK_REQUIRED: '目标队伍还没有审核通过的普通任务，暂不能要求重演。', TASK_SWAP_INVALID: '只能交换两个不同、未计分、无待审核且未分配的任务。', ASSIGNED_TASK_REQUIRED: '请先完成交换卡指定的下一任务。',
  ASSIGNMENT_ALREADY_ACTIVE: '其中一队已有待完成的任务分配，请先处理。', TASK_RESTRICTED: '当前有任务限制，请先完成能力卡要求。',
  EXTRA_TASK_UNAVAILABLE: '目标队伍没有尚未抽到的备用任务，请工作人员补充任务池；卡牌未消耗。', RESERVE_TASK_CONFIG_INVALID: '备用任务需使用不同于棋盘的独立编号，并填写标题、要求和正整数分值，最多500项。', EXTRA_TASK_EVIDENCE_REQUIRED: '请先提交额外任务的现场图片或视频，再由工作人员确认完成。',
  CASTER_ALREADY_HIGHEST: '本队已为当前最高分，无法使用榜首援助。', CHOOSE_TIED_HIGHEST: '榜首并列，请选择其中一队。', HIGHEST_CHANGED: '榜首已变化，请打回此申请后重新选择目标。', HIGHEST_TEAM_UNAVAILABLE: '当前最高分队伍已完赛，不能指定其执行这张卡。',
  PHOTO_REQUIRED: '请先提交双方合照。', REDO_EVIDENCE_REQUIRED: '请提交重做任务的现场图片或视频。', TOUCH_EVIDENCE_REQUIRED: '请先核实其他队伍提交的接触图片或视频证据。',
};

export class GameClient {
  readonly base: string;
  constructor(base: string, readonly gameId: string, readonly token: string, readonly training = false) { this.base = validateTestApiBase(base); }
  get path() { return `${this.base}/api/${this.training ? 'testing/runs' : 'games'}/${encodeURIComponent(this.gameId)}`; }
  async request(suffix: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${this.path}${suffix}`, { method, headers: { Authorization: `Bearer ${this.token}`, ...(body !== undefined ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000), cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(messages[data.code] ?? data.message ?? `HTTP ${response.status}`); return data;
  }
  command(body: unknown) { return this.request('/commands', 'POST', body); }
  async media(id: string) { const response = await fetch(`${this.path}/media/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(20000) }); if (!response.ok) throw new Error('无法读取证据'); return response.blob(); }
}
export async function uploadMedia(file: File) {
  if (file.size > 8388608 || !['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type)) throw new Error('请上传 8 MB 内的 PNG、JPEG、WebP、MP4 或 WebM 文件');
  const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });
  return { name: file.name, mime: file.type, base64 };
}
