import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cyclicBoardOffset } from '../data/bingoBoards';
import { getPhotoClue } from '../data/photoClues';
import { getTeamBingoTheme } from './teamBingoThemes';
import { TeamBingo, photoSlotFor, type BingoItem } from './TeamBingo';
import './bingoDeck.css';

interface Board { id: string; name: string; items: BingoItem[] }
interface Props {
  boards: Board[];
  actorTeamId: string;
  approvedRegionId: string | null;
  paused?: boolean;
  onSelect: (taskId: string) => void;
}

/** 只切换任务分类，绝不切换登录身份、队伍区域或积分。 */
export function BingoDeck({ boards, actorTeamId, approvedRegionId, paused = false, onSelect }: Props) {
  const [selectedBoard, setSelectedBoard] = useState(actorTeamId);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const active = Math.max(0, boards.findIndex(board => board.id === selectedBoard));
  const viewport = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLElement>(null);
  const returnKeyboardFocus = useRef<'previous' | 'next' | null>(null);
  const previousOffsets = useRef(new Map<string, number>());
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { setSelectedBoard(actorTeamId); }, [actorTeamId]);

  // 循环从最左回到最右的卡片不横穿中心；取消旧帧，最终选择不依赖动画结束。
  useLayoutEffect(() => {
    if (returnKeyboardFocus.current) { container.current?.querySelector<HTMLButtonElement>(`.bingo-deck__arrow--${returnKeyboardFocus.current}`)?.focus({ preventScroll: true }); returnKeyboardFocus.current = null; }
    const jumping: HTMLElement[] = [];
    viewport.current?.querySelectorAll<HTMLElement>('.bingo-deck__card').forEach(card => {
      const next = Number(card.dataset.offset), previous = previousOffsets.current.get(card.dataset.boardId!);
      card.classList.remove('is-teleporting');
      if (previous != null && Math.abs(next - previous) > 2) { card.classList.add('is-teleporting'); jumping.push(card); }
      previousOffsets.current.set(card.dataset.boardId!, next);
    });
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => jumping.forEach(card => card.classList.remove('is-teleporting'))); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [active, boards.length]);

  const select = (index: number) => {
    if (paused || !boards.length) return;
    setSelectedBoard(boards[(index + boards.length) % boards.length].id);
  };
  const root = `${import.meta.env.BASE_URL}images/team-bingo/`;
  return <section ref={container} className={`bingo-deck ${!motionEnabled ? 'bingo-deck--paused' : ''}`} aria-roledescription="轮播" aria-label="共享任务棋盘，任何队伍均可提交" onKeyDown={event => {
    if (paused || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target as HTMLElement).closest('input,select,textarea,[contenteditable=true]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); returnKeyboardFocus.current = (event.target as HTMLElement).closest('.tb-cell') ? event.key === 'ArrowRight' ? 'next' : 'previous' : null; select(active + (event.key === 'ArrowRight' ? 1 : -1)); }
  }}>
    <div className="bingo-deck__viewport" ref={viewport} onPointerDown={event => {
      if (!paused && event.isPrimary && event.button === 0) { gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId }; suppressClick.current = false; }
    }} onPointerUp={event => {
      const start = gesture.current; gesture.current = null;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { suppressClick.current = true; select(active + (dx < 0 ? 1 : -1)); }
    }} onPointerCancel={() => { gesture.current = null; }} onClickCapture={event => {
      if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
    }}>
      {boards.map((board, index) => {
        const offset = cyclicBoardOffset(index, active, boards.length), theme = getTeamBingoTheme(board.id);
        return <div key={board.id} className="bingo-deck__card" data-board-id={board.id} data-offset={offset}>
          {offset === 0 ? <TeamBingo teamId={board.id} teamName={board.name} approvedRegionId={approvedRegionId} items={board.items} onSelect={onSelect} paused={paused} motionEnabled={motionEnabled} onToggleMotion={() => setMotionEnabled(value => !value)} /> : <>
            <div className="team-bingo bingo-peek" data-bingo-theme={theme?.id} style={{ '--tb-surface': theme?.surface, '--tb-accent': theme?.accent } as CSSProperties} aria-hidden="true">
              <div className="tb-stage">
                <div className="tb-board-surface" />
                {theme ? <img className="tb-frame" src={`${root}frame-${theme.id}.svg`} alt="" width="1000" height="1000" /> : null}
                <div className="tb-core"><div className="bingo-peek__head">{String(index + 1).padStart(2, '0')} / {String(boards.length).padStart(2, '0')}</div><div className="bingo-peek__grid">{board.items.map((item, n) => {
                  const slot = photoSlotFor(item, n), photo = getPhotoClue(approvedRegionId ?? '', slot ?? '');
                  const completed=!!item.completed||item.state==='awarded';
                  return <span key={item.id} className="bingo-peek__cell" data-difficulty={item.difficulty} data-completed={completed}>{photo ? <img src={photo.preview} alt="" width="480" height="480" loading="lazy" /> : null}{item.points!=null?<b>{item.points}</b>:null}{completed?<span className="bingo-peek__state"><Check size={12}/></span>:null}</span>;
                })}</div><div className="tb-footer">19 / 06</div></div>
              </div>
            </div>
          </>}
        </div>;
      })}
    </div>
    {boards.length > 1 ? <nav className="bingo-deck__controls" aria-label="切换任务棋盘">
      <button type="button" className="bingo-deck__arrow bingo-deck__arrow--previous" aria-label="上一张 Bingo" disabled={paused} onClick={() => select(active - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
      <button type="button" className="bingo-deck__arrow bingo-deck__arrow--next" aria-label="下一张 Bingo" disabled={paused} onClick={() => select(active + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
    </nav> : null}
    <p className="bingo-deck__announcement" role="status" aria-live="polite">{boards[active]?.name} Bingo，{active + 1}/{boards.length}。任务可由任意队伍提交，区域始终以本队审核结果为准。</p>
  </section>;
}
