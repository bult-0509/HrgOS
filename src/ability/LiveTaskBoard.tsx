import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/ui';
import { getPhotoClue, photoRegions } from '../data/photoClues';
import { photoSlotFor } from '../player/TeamBingo';
import { BingoDeck } from '../player/BingoDeck';
import { groupBingoTasks } from '../data/bingoBoards';
import { uploadMedia } from './client';

interface LiveTask {
  id: string;
  boardId?: string;
  sharedSlot?: string;
  title?: string;
  brief?: string;
  points?: number;
  difficulty?: '易' | '中' | '难' | '极难';
  bonus?: { points: number; threshold: number };
  failurePenalty?: number;
  awarded?: boolean;
  pendingCount?: number;
}
interface Props {
  team: { id: string; name: string; regionId: string | null; regionVersion?: number; finishedAt?: number | null };
  tasks: LiveTask[];
  status: string;
  busy: boolean;
  blocked: boolean;
  assignment?: { kind: string; taskId: string } | null;
  submissions: { id: string; taskId?: string; regionId?: string; status: string }[];
  submit: (body: Record<string, unknown>) => Promise<void>;
}

/** 正式比赛的任务入口。棋盘与图片仅使用服务器已批准的本队区域。 */
export function LiveTaskBoard({ team, tasks, status, busy, blocked, assignment, submissions, submit }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [taskFile, setTaskFile] = useState<File | null>(null);
  const [arrivalFile, setArrivalFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const region = photoRegions.find(item => item.id === team.regionId);
  const nextRegion = photoRegions.find(item => item.number === (region?.number ?? 0) + 1);
  const selected = tasks.find(task => task.id === selectedId);
  const boards = groupBingoTasks(tasks, team.id, team.name);
  const selectedBoard = selected ? boards.find(board => board.tasks.includes(selected)) : undefined;
  const selectedSlot = selected ? photoSlotFor({ slot: selected.sharedSlot }, selectedBoard?.tasks.indexOf(selected) ?? 0) : '';
  const selectedPhoto = getPhotoClue(team.regionId ?? '', selectedSlot ?? '');
  const currentRegion = useRef(team.regionId);
  currentRegion.current = team.regionId;
  const uploadLock = useRef(false);
  const arrivalInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!arrivalFile && arrivalInput.current) arrivalInput.current.value = ''; }, [arrivalFile]);

  useEffect(() => {
    setSelectedId(null);
    setTaskFile(null);
    setArrivalFile(null);
    setError('');
    setNotice('');
  }, [team.id, team.regionId, team.regionVersion]);

  const closeTask = () => { setSelectedId(null); setTaskFile(null); setError(''); };
  const send = async (kind: 'task' | 'arrival') => {
    const file = kind === 'task' ? taskFile : arrivalFile;
    const destination = kind === 'task' ? team.regionId : nextRegion?.id;
    if (!file || !destination || uploadLock.current || busy) return;
    uploadLock.current = true;
    setSending(true); setError(''); setNotice('');
    const approvedAtUpload = team.regionId;
    try {
      const media = await uploadMedia(file);
      // 图片读取期间后台可能刚好换区，旧草稿不能随新状态提交。
      if (currentRegion.current !== approvedAtUpload) throw new Error('区域已更新，请重新选择现场图片。');
      await submit({ type: 'submit', kind, regionId: destination, ...(kind === 'task' ? { taskId: selectedId } : {}), media });
      if (kind === 'task') closeTask(); else setArrivalFile(null);
      setNotice('已提交，等待工作人员审核。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { uploadLock.current = false; setSending(false); }
  };
  const cannotSubmit = busy || sending || status !== 'RUNNING' || team.finishedAt != null;

  return <section className="live-task-board" aria-label="任务栏">
    <BingoDeck actorTeamId={team.id} approvedRegionId={team.regionId} paused={!!selected || sending}
      boards={boards.map(board => ({ ...board, items: board.tasks.map(task => ({ id: task.id, slot: task.sharedSlot, points: task.points, difficulty: task.difficulty,
        state: task.awarded ? 'awarded' : task.pendingCount ? 'pending' : team.regionId ? 'available' : 'locked', pendingCount: task.pendingCount })) }))}
      onSelect={id => { setTaskFile(null); setError(''); setSelectedId(id); }} />
    {assignment ? <p className="ability-alert">下一任务：{assignment.taskId}{assignment.kind === 'extra' ? '，请从对应能力卡提交证据。' : ''}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {!selected && error ? <p role="alert">{error}</p> : null}
    {nextRegion && team.finishedAt == null ? <details className="ability-surface live-arrival">
      <summary>区域 {String(nextRegion.number).padStart(2, '0')} · 到达审核</summary>
      <p>{nextRegion.name}。提交入口证据，工作人员通过后，本队 19 张图统一更新。</p>
      <form onSubmit={event => { event.preventDefault(); void send('arrival'); }}>
        <label>现场图片（8 MB 内）<input ref={arrivalInput} key={team.regionId} type="file" accept="image/png,image/jpeg,image/webp" required onChange={event => setArrivalFile(event.target.files?.[0] ?? null)} /></label>
        <button disabled={cannotSubmit || !arrivalFile}>提交到达审核</button>
      </form>
    </details> : null}
    <details className="ability-surface"><summary>提交记录</summary>{submissions.map(item => <p key={item.id}>{item.taskId ?? item.regionId} · {item.status}</p>)}</details>
    {selected ? <Modal title={selected.title ?? selected.id} description={selected.points != null ? `${selected.points} 分` : undefined} onClose={closeTask}>
      {selectedPhoto ? <figure className="task-photo-detail"><img src={selectedPhoto.detail} alt={`图寻图片 #${selectedPhoto.number}，点击格子后显示清晰图`} /><figcaption>#{selectedPhoto.number}</figcaption></figure> : selectedSlot?.startsWith('P') ? <p>等待工作人员通过区域入口审核。</p> : <p>无需图寻</p>}
      <p>{selected.brief ?? '等待区域解锁。'}</p>
      {selected.difficulty ? <p>任务难度：{selected.difficulty}</p> : null}
      {selected.bonus ? <p>成绩至少 {selected.bonus.threshold}，核验后额外 +{selected.bonus.points} 分；基础分只由最早有效完成者领取。</p> : null}
      {selected.failurePenalty ? <p>真实失败每次 −{selected.failurePenalty} 分，由工作人员记录；证据打回不会自动扣分。</p> : null}
      {selected.id === 'PHI24' ? <button disabled={cannotSubmit} onClick={() => void submit({ type: 'task_nickname' }).then(() => setNotice('昵称已改为零零五；之后每项任务开始前请先溜一遍说的道理。')).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))}>将本人的昵称改为零零五</button> : null}
      {selected.pendingCount ? <p role="status">已有 {selected.pendingCount} 队提交审核。</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <form onSubmit={event => { event.preventDefault(); void send('task'); }}>
        <label>现场完成图片或视频（8 MB 内）<input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" required onChange={event => setTaskFile(event.target.files?.[0] ?? null)} /></label>
        <button disabled={cannotSubmit || !team.regionId || !taskFile || blocked || assignment?.kind === 'extra'}>{sending ? '正在提交…' : '提交任务审核'}</button>
      </form>
    </Modal> : null}
  </section>;
}
