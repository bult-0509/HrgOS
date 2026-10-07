import { useState } from 'react';

type Entry = Record<string, any>;
type Run = (body: Entry, rethrow?: boolean) => Promise<any>;

/** 工作人员现场创作事件：先创作内容，再由服务器确认发放。 */
export function EventComposer({ view, busy, run }: { view: Entry; busy: boolean; run: Run }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [rewardPoints, setRewardPoints] = useState(0); const [teamId, setTeamId] = useState('');
  const teams = (view.teamChoices ?? []).filter((team: Entry) => !team.finished);
  const submit = async () => {
    // 创作与发放是两个服务端步骤：先固定内容，再按目标队伍入账并通知。
    const created = await run({ type: 'event_create', title, description, rewardPoints, targetTeamId: teamId }, true);
    const eventId = created?.event?.id;
    if (eventId) await run({ type: 'event_confirm', eventId, targetTeamId: teamId }, true);
    setTitle(''); setDescription(''); setRewardPoints(0);
  };
  return <section className="ability-surface" aria-label="现场创作事件">
    <h2>现场创作事件</h2>
    <p>临时加的事件：创作内容后发给目标队伍。奖励分写入账本，填 0 表示只发通知不加分。</p>
    <form onSubmit={event => { event.preventDefault(); void submit().catch(error => run({ type: '__client_error', message: String(error) })); }}>
      <label>事件标题<input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：声音侦探" /></label>
      <label>事件说明<textarea required maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="写清楚要做什么、怎样算完成、有没有禁区" /></label>
      <label>奖励分<input type="number" min={0} max={10000} value={rewardPoints} onChange={event => setRewardPoints(Number(event.target.value))} /></label>
      <label>目标队伍<select required value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">请选择</option>{teams.map((team: Entry) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <button disabled={busy || !title.trim() || !description.trim() || !teamId || view.status !== 'RUNNING'}>创作并发放</button>
    </form>
  </section>;
}

/** 特殊人物（线下游走的工作人员）抓到队伍后下发挑战；分数由工作人员用更正功能手动结算。 */
export function ChallengeComposer({ view, busy, run }: { view: Entry; busy: boolean; run: Run }) {
  const lowest = view.lowestTeamId ?? '';
  const [teamId, setTeamId] = useState('');
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [rewardPoints, setRewardPoints] = useState(0);
  const teams = (view.teamChoices ?? []).filter((team: Entry) => !team.finished);
  const selected = teamId || lowest;
  const lowestName = (view.teamChoices ?? []).find((team: Entry) => team.id === lowest)?.name;
  return <section className="ability-surface" aria-label="特殊挑战">
    <h2>特殊挑战</h2>
    <p>抓到队伍后下发挑战。系统只负责通知与留痕，加减分请用「积分更正」手动结算。</p>
    {lowest ? <p className="ability-alert">当前分数最低：<strong>{lowestName ?? lowest}</strong>（已默认选中）</p> : null}
    <form onSubmit={event => { event.preventDefault(); void run({ type: 'send_challenge', teamId: selected, title, description, rewardPoints }); setTitle(''); setDescription(''); setRewardPoints(0); }}>
      <label>目标队伍<select required value={selected} onChange={event => setTeamId(event.target.value)}>{teams.map((team: Entry) => <option key={team.id} value={team.id}>{team.name}{team.id === lowest ? '（最低分）' : ''}</option>)}</select></label>
      <label>挑战标题<input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：逆转挑战" /></label>
      <label>挑战说明<textarea required maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="例如：碰到对方并与之合照，即可将自己积分与对方积分交换" /></label>
      <label>奖励分（仅记录，不自动入账）<input type="number" min={0} max={10000} value={rewardPoints} onChange={event => setRewardPoints(Number(event.target.value))} /></label>
      <button disabled={busy || !title.trim() || !description.trim() || !selected || view.status !== 'RUNNING'}>下发挑战</button>
    </form>
  </section>;
}

/** 玩家把文本发给工作人员。 */
export function PlayerMessageForm({ busy, run }: { busy: boolean; run: Run }) {
  const [text, setText] = useState('');
  return <section className="ability-surface" aria-label="联系工作人员">
    <h2>联系工作人员</h2>
    <p>发文本给工作人员。任务与能力卡的图片、视频证据请在对应位置提交。</p>
    <form onSubmit={event => { event.preventDefault(); void run({ type: 'send_message', recipient: 'staff', text }); setText(''); }}>
      <label>内容<textarea required maxLength={2000} value={text} onChange={event => setText(event.target.value)} placeholder="例如：请求工作人员确认区域入口" /></label>
      <button disabled={busy || !text.trim()}>发送给工作人员</button>
    </form>
  </section>;
}

/** 工作人员收件箱：只列玩家主动发来的文本，避免淹没在系统通知里。 */
export function StaffInbox({ messages, busy, run }: { messages: Entry[]; busy: boolean; run: Run }) {
  const incoming = messages.filter(message => message.type === 'player_text').reverse();
  return <section className="ability-surface" aria-label="玩家来件">
    <h2>玩家来件{incoming.length ? `（${incoming.length}）` : ''}</h2>
    {incoming.length ? incoming.slice(0, 30).map(message => <p key={message.id}>
      <strong>{message.fromTeamId ?? message.reference ?? '未知队伍'}</strong>：{message.text}
      <small> {new Date(message.at).toLocaleTimeString()}</small>
      {!message.read ? <button disabled={busy} onClick={() => void run({ type: 'read_message', messageId: message.id, deviceId: 'ability-web', played: false })}>标记已读</button> : null}
    </p>) : <p>还没有玩家发来文本。</p>}
  </section>;
}
