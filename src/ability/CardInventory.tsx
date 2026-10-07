import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/ui';
import { CardCast } from '../cards/CardReceipt';
import { CardHand, TacticCard, abilityCardModel, type TacticCardModel } from '../cards/TacticCard';
import { automaticCardTarget } from '../domain/abilityCard';

type Entry = Record<string, any>;
const labels: Record<string, string> = { AVAILABLE: '可使用', USED: '已使用', PENDING: '待确认' };

export function CardInventory({ cards, catalog, teams, teamId, staff, busy, running, onUse }: { cards: Entry[]; catalog: Entry[]; teams: Entry[]; teamId?: string; staff: boolean; busy: boolean; running: boolean; onUse: (id: string, target: string) => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const [casting, setCasting] = useState<TacticCardModel | null>(null);
  const submitting = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const entries = cards.flatMap(instance => {
    const definition = catalog.find(definition => definition.number === instance.number);
    return definition ? [{ instance, definition, model: abilityCardModel({ id: instance.id, number: instance.number }, { title: definition.title, description: definition.description, target: definition.target }) }] : [];
  });
  const available = entries.filter(entry => entry.instance.status === 'AVAILABLE');
  const current = entries.find(entry => entry.instance.id === selected);
  const automaticTarget = automaticCardTarget(current?.definition.target);
  const history = staff ? entries : entries.filter(entry => entry.instance.status !== 'AVAILABLE');
  const play = async () => {
    if (!current || submitting.current) return;
    submitting.current = true; setError('');
    try {
      await onUse(current.instance.id, target);
      if (alive.current) { setSelected(null); setCasting(current.model); }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : '出牌失败，请重试。');
    } finally { submitting.current = false; }
  };
  return <section className="hrg-card-inventory" aria-label="能力卡牌库"><h2>{staff ? '卡牌库存' : '我的能力卡'}</h2>
    {!staff && available.length ? <CardHand cards={available.map(entry => entry.model)} onSelect={id => { setSelected(id); setTarget(''); setError(''); }} /> : null}
    {history.length ? <details open={staff}><summary>{staff ? `全部库存 · ${history.length}` : `已使用 · ${history.length}`}</summary><div className="ability-grid">{history.map(({ instance, model }) => <article className="ability-card hrg-inventory-card" key={instance.id}><div className="hrg-inventory-card__face"><TacticCard card={model} /></div><small>{labels[instance.status] ?? instance.status}{staff ? ` · ${teams.find(team => team.id === instance.teamId)?.name ?? ''}` : ''}</small></article>)}</div></details> : null}
    {!cards.length ? <p>还没有能力卡。开赛后每30分钟、全体每完成10个任务各队会获得一张，也可由工作人员发放。</p> : !staff && !available.length ? <p>当前没有可使用的卡牌。</p> : null}
    {current && !staff ? <Modal title={current.model.title} closeDisabled={busy} onClose={() => setSelected(null)}>
      <div className="hrg-card-detail"><TacticCard card={current.model} /></div>
      <form className="hrg-card-use-form" onSubmit={event => { event.preventDefault(); void play(); }}>
        {automaticTarget ? <p className="hrg-card-target-note">作用目标：{current.definition.target === 'self' ? teams.find(team => team.id === teamId)?.name ?? '本队' : automaticTarget}</p> : <label>{current.definition.target === 'highest' ? '并列榜首时指定队伍' : '目标队伍'}<select value={target} disabled={busy} required={current.definition.target === 'other'} onChange={event => setTarget(event.target.value)}><option value="">{current.definition.target === 'highest' ? '由服务器判定榜首' : '请选择队伍'}</option>{teams.filter(team => !team.finished && team.id !== teamId).map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
        <p>具体目标和生效条件由服务器按本卡规则确认。</p>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={busy || !current.definition.enabled || !running || current.instance.status !== 'AVAILABLE' || current.definition.target === 'other' && !target}>{busy ? '提交中…' : '打出这张牌'}</button>
      </form>
    </Modal> : null}
    {casting ? <CardCast card={casting} onDone={() => setCasting(null)} /> : null}
  </section>;
}
