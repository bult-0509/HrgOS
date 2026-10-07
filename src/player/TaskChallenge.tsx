import { Clock3, Focus, LockKeyhole } from 'lucide-react';
import type { PhotoFindStatus } from '../domain/photoFind';
import './taskChallenge.css';

export function PhotoFindNotice({ status }: { status: PhotoFindStatus }) {
  const pending = status === 'pending';
  return <div className="photo-find-notice" data-status={status} role="status">
    {pending ? <Clock3 size={24} aria-hidden="true" /> : status === 'rejected' ? <Focus size={24} aria-hidden="true" /> : <LockKeyhole size={24} aria-hidden="true" />}
    <div><strong>任务锁定中，请先完成图寻。</strong>{pending ? <span className="sr-only">图寻审核中。</span> : status === 'rejected' ? <span className="sr-only">图寻已打回，可重新提交。</span> : null}</div>
  </div>;
}

export function TaskChallenge({ brief, difficulty, points, bonus, failurePenalty }: {
  brief?: string; difficulty?: string; points?: number;
  bonus?: { points: number; threshold: number }; failurePenalty?: number;
}) {
  return <section className="task-challenge" data-task-details data-difficulty={difficulty} aria-label="已解锁的任务内容">
    <div className="task-challenge__meta"><span>{difficulty ?? '任务'}</span>{points != null ? <strong>{points}<small>分</small></strong> : null}</div>
    <p className="task-challenge__brief">{brief ?? '任务内容尚未配置。'}</p>
    {bonus ? <p className="task-challenge__extra">核验成绩至少 {bonus.threshold}，额外 +{bonus.points} 分。</p> : null}
    {failurePenalty ? <p className="task-challenge__extra">每次真实失败 −{failurePenalty} 分，由工作人员记录。</p> : null}
  </section>;
}
