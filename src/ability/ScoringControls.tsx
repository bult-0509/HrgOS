import { useRef, useState, type ReactNode } from 'react';
import { getPhotoClue } from '../data/photoClues';

type Entry = Record<string, any>;
type Run = (body: Entry, rethrow?: boolean) => Promise<void>;

export function ScoringControls({ view, busy, run }: { view: Entry; busy: boolean; run: Run }) {
  const [finishTeams, setFinishTeams] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [failureTeam, setFailureTeam] = useState('');
  const [failureTask, setFailureTask] = useState('');
  const [count, setCount] = useState(1);
  const [failureReason, setFailureReason] = useState('');
  const attempt = useRef<{ id: string; body: Entry } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [recording, setRecording] = useState(false);
  const candidates = (view.taskCatalog ?? []).filter((task: Entry) => task.failurePenalty);
  const recordFailure = async () => {
    if (recording) return;
    const body = attempt.current?.body ?? { type: 'task_failure', teamId: failureTeam, taskId: failureTask, count, reason: failureReason, attemptId: crypto.randomUUID() };
    attempt.current ??= { id: body.attemptId, body };
    setRecording(true);
    try { await run(body, true); attempt.current = null; setRetrying(false); setFailureReason(''); }
    catch { setRetrying(true); } finally { setRecording(false); }
  };
  return <section className="ability-surface">
    <h2>积分与完赛确认</h2>
    <p>普通任务每区最多计分 {view.taskLimit ?? 5} 项；任务共享，最早有效完成者得分。{view.finishRewards ? `完赛第1–5名奖励：${view.finishRewards.join(' / ')} 分。` : '此赛局沿用原完赛分配置。'}</p>
    {view.status === 'READY' ? <button disabled={busy} onClick={() => void run({ type: 'scoring_preset', reason: '载入经确认的125项任务、格位和完赛奖励' })}>载入正式125项积分规则</button> : null}
    <details><summary>现场确认完赛</summary>
      <p>须通过龙翔桥入口审核，且本队任务和能力效果已结清。多队确实同时抵达时同批勾选，占据名次奖励取均值；同一毫秒的不同操作不会自动并列。</p>
      {view.teams.filter((team: Entry) => team.finishedAt == null).map((team: Entry) => <label key={team.id}><input type="checkbox" checked={finishTeams.includes(team.id)} onChange={event => setFinishTeams(current => event.target.checked ? [...current, team.id] : current.filter(id => id !== team.id))} />{team.name}</label>)}
      <label>确认依据<input value={reason} onChange={event => setReason(event.target.value)} placeholder="现场抵达与审核完成情况" /></label>
      <button disabled={busy || view.status !== 'RUNNING' || !finishTeams.length || !reason.trim()} onClick={() => { void run({ type: 'finish_team', teamIds: finishTeams, reason }, true).then(() => { setFinishTeams([]); setReason(''); }).catch(() => {}); }}>确认选中队伍完赛并发奖</button>
      {view.teams.filter((team: Entry) => team.finishedAt != null).map((team: Entry) => <p key={team.id}>{team.name} · 第{team.finishRank ?? '—'}名 · 完赛奖励 {team.finishPoints ?? '沿用原配置'} 分</p>)}
    </details>
    {candidates.length ? <details><summary>记录题面失败扣分</summary><p>仅记录尚未入账的真实失败；证据不清晰的普通打回不自动扣分。一次记录的重试使用相同编号，不重复扣分。</p>
      <label>队伍<select disabled={retrying} value={failureTeam} onChange={event => setFailureTeam(event.target.value)}><option value="">请选择</option>{view.teams.filter((team: Entry) => team.finishedAt == null && team.regionId).map((team: Entry) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label>任务<select disabled={retrying} value={failureTask} onChange={event => setFailureTask(event.target.value)}><option value="">请选择</option>{candidates.map((task: Entry) => <option key={task.id} value={task.id}>{task.id} · {task.title} · 每次−{task.failurePenalty}</option>)}</select></label>
      <label>尚未入账的失败次数<input disabled={retrying} type="number" min={1} max={100} step={1} value={count} onChange={event => setCount(Number(event.target.value))} /></label>
      <label>核验依据<input disabled={retrying} value={failureReason} onChange={event => setFailureReason(event.target.value)} /></label>
      <button disabled={busy || recording || !['RUNNING', 'PAUSED'].includes(view.status) || !failureTeam || !failureTask || !failureReason.trim() || !Number.isInteger(count) || count < 1 || count > 100} onClick={() => void recordFailure()}>{retrying ? '重试同一次失败记录' : '核验失败并扣分'}</button>
    </details> : null}
  </section>;
}

export function TaskReview({ item, tasks, busy, first, run, evidence, openingReference }: { item: Entry; tasks: Entry[]; busy: boolean; first: boolean; run: Run; evidence: ReactNode; openingReference?: ReactNode }) {
  const [reason, setReason] = useState('');
  const [performance, setPerformance] = useState('');
  const [failures, setFailures] = useState(0);
  const task = tasks.find(task => task.id === item.taskId);
  const reference = item.kind === 'photo' ? getPhotoClue(item.regionId, item.photoSlot) : null;
  const numericValid = Number.isSafeInteger(failures) && failures >= 0 && failures <= 100 && (!performance || Number.isSafeInteger(Number(performance)) && Number(performance) >= 0);
  const needsReason = failures > 0 || !!performance;
  const review = (result: string) => run({ type: 'review', submissionId: item.id, result, reason, ...(task?.failurePenalty ? { failedAttempts: failures } : {}), ...(task?.bonus && performance !== '' ? { performanceScore: Number(performance) } : {}) });
  return <article className="ability-use"><p>{item.teamId} · {item.kind === 'photo' ? `图寻 #${Number(item.photoSlot.slice(1))} · ${item.regionId}` : item.kind === 'arrival' ? `${item.regionId} 开场谜题审核` : `${item.taskId} · ${task?.title ?? ''}`}</p>
    {openingReference ? <section aria-label="开场谜题参考照片">{openingReference}{item.openingPuzzle.prompt ? <p>{item.openingPuzzle.prompt}</p> : null}<p>通过后仅推进该队区域，五张棋盘的19张任务图一起更新。</p></section> : null}
    {reference ? <figure className="photo-review-reference"><img src={reference.detail} alt={`图寻 #${reference.number} 参考图`} loading="lazy" /><figcaption>核对所在地点与拍摄角度；通过后只解锁本队五个对应任务，不计任务分、不换区。</figcaption></figure> : null}
    {evidence}
    {task?.bonus ? <label>核验课题成绩（至少 {task.bonus.threshold} 额外 +{task.bonus.points}；不填则仅基础分）<input type="number" min={0} step={1} value={performance} onChange={event => setPerformance(event.target.value)} /></label> : null}
    {task?.failurePenalty ? <label>本次尚未记账的真实失败次数（每次−{task.failurePenalty}）<input type="number" min={0} max={100} step={1} value={failures} onChange={event => setFailures(Number(event.target.value))} /></label> : null}
    <input aria-label="任务审核说明" value={reason} onChange={event => setReason(event.target.value)} placeholder="审核说明（打回或数值判定必填）" />
    <div className="ability-actions"><button disabled={busy || !first || !numericValid || needsReason && !reason.trim()} onClick={() => void review('approve')}>通过审核</button><button disabled={busy || !first || !numericValid || !reason.trim()} onClick={() => void review('reject')}>打回</button></div>
  </article>;
}
