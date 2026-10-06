import { Clock3, Focus, LockKeyhole } from 'lucide-react';
import type { PhotoFindStatus } from '../domain/photoFind';
import './taskChallenge.css';

export function PhotoFindNotice({ status }: { status: PhotoFindStatus }) {
  const pending = status === 'pending';
  return <div className="photo-find-notice" data-status={status} role="status">
    {pending ? <Clock3 size={24} aria-hidden="true" /> : status === 'rejected' ? <Focus size={24} aria-hidden="true" /> : <LockKeyhole size={24} aria-hidden="true" />}
    <div><strong>{pending ? '图寻审核中' : status === 'rejected' ? '重新提交图寻' : '先完成图寻'}</strong><p>复刻参考图所在地点与拍摄角度。审核通过后，解锁五张 Bingo 对应的任务。</p></div>
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
