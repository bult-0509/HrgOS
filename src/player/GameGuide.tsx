import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Modal } from '../components/ui';
import './gameJourney.css';

// 使用本次确认的原文；只加阅读分组，不改变规则或数值。
export const activityRules = [
  { title: '路线与积分', text: '探索者以队伍为单位，按照顺序途经指定地点、完成任务，并最终抵达终点。活动采取积分制，终点将根据到达位次给予较多的积分奖励。越快越有优势，但也可以通过博弈和策略争取任务、拖延其他队伍的时间，甚至反败为胜。' },
  { title: '活动网页', text: '请各位提前在指定网页登录账号。该网页是活动内容的主要载体，可查看自身定位信息、全体探索者的任务完成情况，并接收突发任务等信息。' },
  { title: 'BINGO 与图寻', text: '任务以 BINGO 形式展示，共有 5 个不同的棋盘，每盘 25 项任务，各任务分值不同。其中有19 项任务各对应一张图片，需要先在指定地点完成照片复刻，再完成任务，经审核后点亮对应任务格；另外 6 项任务可以直接完成。 可以使用 AI 或任意工具识别图片并定位。' },
  { title: '共享任务', text: '所有探索者共享任务，先到先得。每项任务的积分归首先完成的队伍所有，其他队伍不可再次获得该项积分。所以选择先做哪项、放弃哪项，也会影响最后的结果，请各位谨慎选择。' },
  { title: '连线奖励', text: '当任务在bingo中连成一条线时，全队有额外积分奖励。' },
  { title: '区域上限', text: '每队在每个地点最多完成 5 项任务。达到上限后，必须前往下一个区域。' },
  { title: '能力卡', text: '游戏每30分钟或全体队伍每完成10项任务，全体队伍会收到一张能力卡，请合理安排使用。' },
] as const;

/** 确认记录按比赛/账号隔离，仅记录阅读状态，不参与任何比赛判定。 */
export function GameGuide({ storageKey }: { storageKey: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(localStorage.getItem(`hrg:rules:v1:${storageKey}`) !== 'read'); }
    catch { setOpen(true); }
  }, [storageKey]);
  const confirm = () => {
    try { localStorage.setItem(`hrg:rules:v1:${storageKey}`, 'read'); } catch { /* 禁用存储时本次仍可继续。 */ }
    setOpen(false);
  };
  return <>
    <button type="button" className="icon-button" aria-label="查看活动规则" onClick={() => setOpen(true)}><BookOpen size={20} aria-hidden="true" /></button>
    {open ? <Modal title="开场引导" dismissible={false} onClose={confirm}>
      <div className="game-guide">
        <p className="game-guide__brand">失序<span>重奏</span></p>
        <ol className="game-guide__rules">{activityRules.map((rule, index) => <li key={rule.title}>
          <span className="game-guide__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <div><h3>{rule.title}</h3><p>{rule.text}</p></div>
        </li>)}</ol>
        <button type="button" className="button button--primary button--full" onClick={confirm}>了解规则，开始探索</button>
      </div>
    </Modal> : null}
  </>;
}
