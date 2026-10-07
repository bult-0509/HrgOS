import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Flag, Focus, MapPinned, Upload } from 'lucide-react';
import { photoRegions } from '../data/photoClues';
import './gameJourney.css';

export interface RegionJourneyState {
  required: boolean;
  targetRegionId: string | null;
  reason: 'first' | 'manual' | 'limit' | 'finish' | null;
  completed: number;
  limit: number;
  pending?: number;
}
export interface OpeningPuzzle {
  regionId: string;
  configured: boolean;
  title?: string;
  prompt?: string;
  mediaId?: string;
  imageSrc?: string;
  width?: number;
  height?: number;
  assetId?: string;
  sourceVersion?: string;
}
export interface ArrivalSubmission { id: string; kind?: string; regionId?: string; status: string; reason?: string }
interface Props {
  teamId: string;
  approvedRegionId: string | null;
  journey?: RegionJourneyState;
  puzzle?: OpeningPuzzle | null;
  submissions?: ArrivalSubmission[];
  reference?: ReactNode;
  busy?: boolean;
  running?: boolean;
  restriction?: string;
  finished?: boolean;
  onBegin?: (regionId: string) => Promise<void>;
  onSubmit?: (regionId: string, file: File) => Promise<void>;
  children: ReactNode;
}

/** 只消费审核后的区域。出发不等于换区；入口照片不属于19张任务照片。 */
export function RegionTaskArea({ teamId, approvedRegionId, journey, puzzle, submissions = [], reference, busy = false, running = true, restriction, finished = false, onBegin, onSubmit, children }: Props) {
  const region = photoRegions.find(item => item.id === approvedRegionId);
  const next = photoRegions.find(item => item.number === (region?.number ?? 0) + 1);
  const progress = journey ?? { required: !region, targetRegionId: next?.id ?? null, reason: region ? null : 'first', completed: 0, limit: 5 };
  const target = finished ? undefined : photoRegions.find(item => item.id === progress.targetRegionId);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const required = progress.required || starting || finished;
  const arrival = [...submissions].reverse().find(item => item.kind === 'arrival' && item.regionId === target?.id);
  const pending = arrival?.status === 'QUEUED';
  const configured = !!puzzle?.configured && puzzle.regionId === target?.id;
  useEffect(() => { setFile(null); setError(''); }, [teamId, approvedRegionId, target?.id]);
  useEffect(() => { if (required) heading.current?.focus({ preventScroll: true }); }, [required, target?.id]);
  useEffect(() => { if (!file && input.current) input.current.value = ''; }, [file]);
  const begin = async () => {
    if (!next || !onBegin || lock.current || busy) return;
    lock.current = true; setStarting(true); setError('');
    try { await onBegin(next.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { lock.current = false; setStarting(false); }
  };
  const send = async () => {
    if (!file || !target || !configured || !onSubmit || lock.current || busy || pending || !running || restriction) return;
    lock.current = true; setSending(true); setError('');
    try { await onSubmit(target.id, file); setFile(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { lock.current = false; setSending(false); }
  };

  if (required) return <section className={`opening-puzzle ${finished ? 'opening-puzzle--finished' : ''}`} aria-label={finished ? '已完赛' : '区域开场谜题'} data-region-target={target?.id ?? 'finish'}>
    <div className="opening-puzzle__heading"><span>{target ? `${String(target.number).padStart(2, '0')} / 03` : 'FINISH'}</span><span>{progress.completed} / {progress.limit}</span></div>
    <h2 ref={heading} tabIndex={-1}>{finished ? '已完赛' : target ? `${target.name} · ${puzzle?.title ?? '开场谜题'}` : '前往终点'}</h2>
    {!finished && (progress.reason === 'limit' || progress.reason === 'finish') ? <p className="opening-puzzle__reason">本区域已达到任务上限。</p> : null}
    {!target ? <div className="opening-puzzle__empty"><Flag size={36} aria-hidden="true" /><strong>{finished ? '完赛已由工作人员确认' : '抵达工作人员所在包厢'}</strong>{!finished ? <p>由工作人员在后台确认完赛。</p> : null}</div> : <>
      {configured ? <>
        <div className="opening-puzzle__reference" style={puzzle?.width && puzzle.height ? { aspectRatio: `${puzzle.width} / ${puzzle.height}` } : undefined}>{reference ?? (puzzle?.imageSrc ? <figure className="opening-puzzle__photo"><a href={puzzle.imageSrc} target="_blank" rel="noopener noreferrer"><img src={puzzle.imageSrc} width={puzzle.width} height={puzzle.height} decoding="async" alt={`${target.name}开场谜题参考照片`} /></a></figure> : null)}</div>
        {puzzle?.prompt ? <p className="opening-puzzle__prompt">{puzzle.prompt}</p> : null}
      </> : <div className="opening-puzzle__empty"><Focus size={36} aria-hidden="true" /><strong>开场照片待确认</strong><p>等待工作人员审核区域入口。工作人员确认开场照片后开放题目。</p></div>}
      {pending ? <p className="opening-puzzle__status" role="status">等待工作人员审核</p> : <form onSubmit={event => { event.preventDefault(); void send(); }}>
        {arrival?.status === 'REJECTED_RESUBMIT' ? <p className="opening-puzzle__error" role="alert">{arrival.reason || '开场谜题已打回，请重新提交。'}</p> : null}
        <label className="opening-puzzle__upload"><Upload size={22} aria-hidden="true" /><span>{file?.name ?? '选择开场照片复刻证据'}</span><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" disabled={!configured || starting || sending || busy} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <button type="submit" className="button button--primary button--full" disabled={!configured || !file || !onSubmit || starting || sending || busy || !running || !!restriction}>{sending ? '正在提交…' : '提交开场谜题审核'}</button>
      </form>}
      {restriction ? <p role="status">{restriction}</p> : null}
      <p className="opening-puzzle__hint">审核通过后，五张 Bingo 的 19 张图统一换成新区域。</p>
    </>}
    {error ? <p className="opening-puzzle__error" role="alert">{error}</p> : null}
  </section>;

  return <>
    {children}
    <div className="region-route"><span><MapPinned size={16} aria-hidden="true" />{progress.completed} / {progress.limit}{progress.pending ? <small> · {progress.pending} 项待审</small> : null}</span>
      {next && onBegin ? <button type="button" className="button button--secondary" disabled={busy || starting || !running || !!restriction} onClick={() => void begin()} aria-label="进入下一区域">前往区域 {String(next.number).padStart(2, '0')}</button> : null}
    </div>
    {restriction ? <p role="status">{restriction}</p> : null}
    {error ? <p className="opening-puzzle__error" role="alert">{error}</p> : null}
  </>;
}
