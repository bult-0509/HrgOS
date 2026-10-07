import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Flag,
  ImagePlus,
  LocateFixed,
  LockKeyhole,
  Navigation,
  Radio,
  Route,
  ShieldAlert,
  Sparkles,
  Trophy,
  Upload,
  Wifi,
  Zap
} from "lucide-react";
import type { GameCard, GameMessage, Task, TeamStatus } from "../types";
import { Modal, StatusChip } from "../components/ui";
import { getPhotoClue, photoRegions } from '../data/photoClues';
import { BingoDeck } from './BingoDeck';
import { groupBingoTasks } from '../data/bingoBoards';
import { teams } from '../data/mock';
import { canRevealTask, difficultyLevel, type PhotoFindProgress } from '../domain/photoFind';
import { PhotoFindNotice, TaskChallenge } from './TaskChallenge';
import { CardHand, CardDeckDock, TacticCard, gameCardModel } from '../cards/TacticCard';
import { CardReceipt, CardCast } from '../cards/CardReceipt';
import { useOverlayBusy } from '../components/overlay';
import { automaticCardTarget } from '../domain/abilityCard';

interface PlayerAppProps {
  team: TeamStatus;
  tasks: Task[];
  /** 后台审核状态的只读输入。玩家端不持有区域 setter。 */
  approvedRegionId: string | null;
  cards: GameCard[];
  /** 仅本地开发预览可选择卡池中的牌，不添加到持有库存。 */
  cardCatalog?: GameCard[];
  messages: GameMessage[];
  onLogout: () => void;
  onSubmitTask: (taskId: string, filename: string) => void;
  photoFinds?: PhotoFindProgress;
  onSubmitPhotoFind?: (slot: string, filename: string) => void;
  onUseCard: (cardId: string, target: string) => void;
  onReadMessage: (messageId: string) => void;
}

export function PlayerApp({
  team,
  tasks,
  approvedRegionId,
  cards,
  cardCatalog,
  messages,
  onLogout,
  onSubmitTask,
  photoFinds = {},
  onSubmitPhotoFind,
  onUseCard,
  onReadMessage
}: PlayerAppProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [playingCard, setPlayingCard] = useState<GameCard | null>(null);
  const [receipt, setReceipt] = useState<{ card: GameCard; preview: boolean } | null>(null);
  const [rewardQueue, setRewardQueue] = useState<GameCard[]>([]);
  const knownCards = useRef({ teamId: team.id, ids: new Set(cards.map(card => card.id)) });
  const overlayBusy = useOverlayBusy();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cardTarget, setCardTarget] = useState(() => teams.find(candidate => candidate.id !== team.id)!.name);
  const [showMessages, setShowMessages] = useState(false);
  const [previewCardId, setPreviewCardId] = useState('');
  const previewCards = cardCatalog ?? cards;
  const previewCard = previewCards.find(card => card.id === previewCardId) ?? previewCards[0];
  const automaticTarget = automaticCardTarget(selectedCard?.target);
  const [pageVisible, setPageVisible] = useState(true);
  const region = photoRegions.find(item => item.id === approvedRegionId);
  const regionId = region?.id ?? '';
  const currentTasks = useMemo(() => tasks, [tasks]);
  const bingoBoards = useMemo(() => groupBingoTasks(currentTasks, team.id, team.name), [currentTasks, team.id, team.name]);
  const selectedPhoto = selectedTask ? getPhotoClue(regionId, selectedTask.sharedSlot ?? '') : null;
  const taskRevealed = !!selectedTask && canRevealTask(selectedTask.sharedSlot, approvedRegionId, photoFinds);
  const selectedPhotoStatus = photoFinds[selectedTask?.sharedSlot ?? '']?.status ?? 'locked';
  const motionPaused = !pageVisible || Boolean(selectedTask || selectedCard || showMessages || playingCard || receipt);
  const unreadCount = messages.filter((message) => message.unread).length;

  // 推进地区不替换任务集合，也不清空得分。关闭旧地区上传草稿，避免错交旧图。
  useEffect(() => {
    setSelectedTask(null);
    setSelectedFile(null);
  }, [approvedRegionId, team.id]);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const closeTask = () => {
    setSelectedTask(null);
    setSelectedFile(null);
  };

  useEffect(() => {
    if (knownCards.current.teamId !== team.id) {
      knownCards.current = { teamId: team.id, ids: new Set(cards.map(card => card.id)) };
      setRewardQueue([]); setReceipt(null); setSelectedCard(null); setPlayingCard(null);
      return;
    }
    const added = cards.filter(card => !knownCards.current.ids.has(card.id));
    cards.forEach(card => knownCards.current.ids.add(card.id));
    if (added.length) setRewardQueue(queue => [...queue, ...added]);
  }, [cards, team.id]);

  useEffect(() => {
    if (receipt || selectedTask || selectedCard || showMessages || playingCard || overlayBusy || !rewardQueue.length || document.querySelector('dialog[open]')) return;
    const [next, ...remaining] = rewardQueue;
    setRewardQueue(remaining);
    if (cards.some(card => card.id === next.id)) setReceipt({ card: next, preview: false });
  }, [rewardQueue, receipt, selectedTask, selectedCard, showMessages, playingCard, overlayBusy, cards]);

  const playCard = () => {
    if (!selectedCard) return;
    const card = selectedCard;
    setPlayingCard(card);
    setSelectedCard(null);
    onUseCard(card.id, automaticTarget ? card.target === 'self' ? team.name : automaticTarget : cardTarget);
  };

  return (
    <div className={`app-shell app-shell--player player-console ${motionPaused ? 'photo-motion-paused' : ''}`}>
      <a className="skip-link" href="#main-content">跳到主要内容</a>

      <header className="topbar player-topbar player-console__topbar">
        <button className="brand-lockup" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="回到页面顶部">
          <span className="brand-mark" aria-hidden="true">H</span>
          <div><strong>HRG // LIVE</strong><span>{team.name} · {region?.name ?? '等待区域审核'}</span></div>
        </button>
        <div className="player-scoreline" aria-label={`${team.name}当前信息`}>
          <span><Trophy size={16} aria-hidden="true" /><b>{team.score}</b> PTS</span>
          <span>RANK <b>#{String(team.rank).padStart(2, '0')}</b></span>
          <span><Clock3 size={16} aria-hidden="true" />公开排名 18:04</span>
        </div>
        <div className="topbar__actions">
          <span className="live-pill"><Radio size={14} aria-hidden="true" />进行中</span>
          <button className="icon-button message-button" onClick={() => setShowMessages(true)} aria-label={`消息，${unreadCount} 条未读`}>
            <Bell size={20} aria-hidden="true" />
            {unreadCount ? <i className="icon-badge">{unreadCount}</i> : null}
          </button>
          <button className="avatar-button" onClick={onLogout} aria-label="退出演示账号"><CircleUserRound size={22} aria-hidden="true" /></button>
        </div>
      </header>

      <main className="player-game-layout" id="main-content" tabIndex={-1}>
        <div className="mission-column">
          <section className="bingo-panel bingo-panel--themed" aria-label="任务栏">
            <BingoDeck
              actorTeamId={team.id}
              approvedRegionId={approvedRegionId}
              paused={motionPaused}
              boards={bingoBoards.map(board => ({ ...board, items: board.tasks.map(task => ({
                id: task.id,
                slot: task.sharedSlot,
                difficulty: difficultyLevel(task.scoreDifficulty ?? task.difficulty),
                photoStatus: task.sharedSlot?.startsWith('P') ? photoFinds[task.sharedSlot]?.status ?? 'locked' : undefined,
                completed: task.state === 'awarded',
                points: task.configured === false || task.pointsConfigured === false ? undefined : task.points,
                state: task.configured === false ? 'unconfigured' : canRevealTask(task.sharedSlot, approvedRegionId, photoFinds) ? task.state : 'locked',
                pendingCount: task.pendingCount
              })) }))}
              onSelect={id => setSelectedTask(currentTasks.find(task => task.id === id) ?? null)}
            />
          </section>

          <section className="hand-section" aria-labelledby="hand-title">
            <div className="hand-section__header">
              <div><p className="eyebrow">LOADOUT · {String(cards.length).padStart(2, "0")}</p><h2 id="hand-title">战术道具</h2></div>
              {import.meta.env.DEV && previewCard ? <div className="hrg-card-preview-controls"><label><span>卡面预览 · {previewCards.length} 种</span><select aria-label="选择功能卡预览" value={previewCard.id} onChange={event => setPreviewCardId(event.target.value)}>{previewCards.map(card => <option key={card.id} value={card.id}>{card.number == null ? '' : `${String(card.number).padStart(2, '0')} · `}{card.name}</option>)}</select></label><button className="hrg-card-preview-button" onClick={() => setReceipt({ card: previewCard, preview: true })}>收卡动效预览</button></div> : null}
            </div>
            {cards.length ? (
              <CardHand cards={cards.map(gameCardModel)} onSelect={id => setSelectedCard(cards.find(card => card.id === id) ?? null)} />
            ) : (
              <div className="hand-empty"><Sparkles size={26} aria-hidden="true" /><span>手里没牌</span></div>
            )}
          </section>
        </div>

        <aside className="location-sidebar" aria-labelledby="location-title">
          <div className="location-sidebar__heading">
            <div><p className="eyebrow">LIVE TRACKING</p><h2 id="location-title">队长定位</h2></div>
            <StatusChip tone="success"><Wifi size={14} aria-hidden="true" />在线</StatusChip>
          </div>

          <div className="player-map" aria-label="队长当前位置示意图">
            <span className="player-map__scan" />
            <span className="player-map__path player-map__path--one" />
            <span className="player-map__path player-map__path--two" />
            <span className="player-map__label player-map__label--lake">ZONE {region?.letter ?? '—'} / {region?.number ?? '—'}</span>
            <span className="player-map__label player-map__label--region">{region?.name ?? '等待区域审核'}</span>
            <span className="player-map__marker"><Navigation size={28} fill="currentColor" aria-hidden="true" /><i>{team.shortName}</i></span>
            <span className="player-map__target"><Flag size={18} aria-hidden="true" /><i>终点包厢</i></span>
          </div>

          <div className="location-readout">
            <div><span>最后更新</span><strong>刚刚</strong></div>
            <div><span>定位精度</span><strong>约 8 米</strong></div>
            <div><span>队长设备</span><strong>前台运行</strong></div>
          </div>

          <div className="route-card">
            <span className="route-card__icon"><Route size={20} aria-hidden="true" /></span>
            <div><small>当前区域</small><strong>{region?.name ?? '等待审核'}</strong><p>入口图寻由工作人员审核，通过后才能推进地区。</p></div>
            <ChevronRight size={19} aria-hidden="true" />
          </div>

          <div className="location-alert">
            <LocateFixed size={20} aria-hidden="true" />
            <div><strong>保持页面在前台</strong><p>位置停更 20 秒后，工作人员端会显示“离线中”。</p></div>
          </div>

          <article className="event-ticket">
            <span><Sparkles size={19} aria-hidden="true" />随机事件</span>
            <strong>DOUBLE INPUT</strong>
            <small>下一项标准任务额外加 2 分</small>
          </article>
        </aside>
      </main>

      {selectedTask ? (
        <Modal title={taskRevealed ? selectedTask.title : `图寻 #${Number(selectedTask.sharedSlot?.slice(1))}`} onClose={closeTask}>
          {taskRevealed ? <TaskChallenge brief={selectedTask.brief} difficulty={difficultyLevel(selectedTask.scoreDifficulty ?? selectedTask.difficulty)} points={selectedTask.pointsConfigured === false ? undefined : selectedTask.points} bonus={selectedTask.bonus} failurePenalty={selectedTask.failurePenalty} /> : null}
          {selectedPhoto ? <figure className="task-photo" key={selectedPhoto.detail}>
            <a className="task-photo__image" href={selectedPhoto.original} target="_blank" rel="noopener noreferrer" aria-label={`查看图寻图片 #${selectedPhoto.number} 原尺寸清晰图`}><img src={selectedPhoto.detail} alt={`${region?.name} 图寻图片 #${selectedPhoto.number}`} decoding="async" /></a>
            <figcaption><span>图寻 #{selectedPhoto.number}</span><a href={selectedPhoto.original} target="_blank" rel="noopener noreferrer">打开原尺寸图 ↗</a></figcaption>
          </figure> : <div className="task-direct-note">{selectedTask.sharedSlot?.startsWith('P') ? <><LockKeyhole size={22} aria-hidden="true" /><span>区域入口尚未审核通过，图寻图片未开放。</span></> : <><Zap size={22} aria-hidden="true" /><span>此格无需图寻，按任务要求完成即可。</span></>}</div>}
          {!taskRevealed && region ? <PhotoFindNotice status={selectedPhotoStatus} /> : null}
          {taskRevealed && selectedTask.pendingCount ? <p role="status">已有 {selectedTask.pendingCount} 队提交任务审核。</p> : null}
          {!region && selectedTask.sharedSlot?.startsWith('P') ? <div className="locked-panel"><LockKeyhole size={24} aria-hidden="true" /><div><strong>等待入口审核</strong><p>工作人员通过后才开放本区域图片。</p></div></div> : selectedTask.configured === false ? <div className="locked-panel"><Camera size={24} aria-hidden="true" /><div><strong>任务待配置</strong><p>图片已接入，正式任务与分值尚未填写，暂不开放提交。</p></div></div> : selectedTask.state === "locked" && taskRevealed ? (
            <div className="locked-panel"><LockKeyhole size={24} aria-hidden="true" /><div><strong>还没解锁</strong><p>先通过本区图寻题。</p></div></div>
          ) : selectedPhotoStatus === 'pending' && !taskRevealed ? null : (
            <>
              <label className={`upload-dropzone ${previewUrl ? "has-preview" : ""}`}>
                {previewUrl ? <img src={previewUrl} alt="待上传照片预览" /> : <ImagePlus size={28} aria-hidden="true" />}
                <span>{selectedFile ? selectedFile.name : taskRevealed ? "选择任务完成证据" : "拍摄或选择图寻复刻照"}</span>
                <input type="file" accept="image/*" capture="environment" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
              </label>
              <button className="button button--primary button--full" disabled={!selectedFile || (!taskRevealed && !onSubmitPhotoFind)} onClick={() => {
                if (!selectedFile) return;
                if (taskRevealed) onSubmitTask(selectedTask.id, selectedFile.name);
                else if (selectedTask.sharedSlot) onSubmitPhotoFind?.(selectedTask.sharedSlot, selectedFile.name);
                closeTask();
              }}><Upload size={18} aria-hidden="true" />{taskRevealed ? '提交任务审核' : '提交图寻审核'}</button>
            </>
          )}
        </Modal>
      ) : null}

      {selectedCard ? (
        <Modal title={selectedCard.name} onClose={() => setSelectedCard(null)}>
          <div className="hrg-card-detail"><TacticCard card={gameCardModel(selectedCard)} /></div>
          {automaticTarget ? <p className="hrg-card-target-note">作用目标：{selectedCard.target === 'self' ? team.name : automaticTarget}</p> : <label className="field"><span>{selectedCard.target === 'highest' ? '并列榜首时指定队伍' : '目标队伍'}</span><select value={cardTarget} onChange={(event) => setCardTarget(event.target.value)}>{teams.filter(candidate => candidate.id !== team.id && candidate.status !== 'finished').map(candidate => <option key={candidate.id}>{candidate.name}</option>)}</select></label>}
          {selectedCard.needsConfirmation ? <p className="inline-alert"><ShieldAlert size={18} aria-hidden="true" />出牌后等待工作人员确认。</p> : null}
          <button className="button button--primary button--full" onClick={playCard}><Zap size={18} aria-hidden="true" />打出这张牌</button>
        </Modal>
      ) : null}

      {showMessages ? (
        <Modal title="消息" onClose={() => setShowMessages(false)}>
          <div className="compact-message-list">
            {messages.map((message) => (
              <button key={message.id} className={message.unread ? "is-unread" : ""} onClick={() => onReadMessage(message.id)}>
                <span>{message.type === "review" ? <Check size={18} aria-hidden="true" /> : <Bell size={18} aria-hidden="true" />}</span>
                <div><strong>{message.title}</strong><p>{message.body}</p></div><time>{message.time}</time>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      <CardDeckDock count={cards.length} onClick={() => document.querySelector('.hand-section')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })} />
      {playingCard ? <CardCast card={gameCardModel(playingCard)} onDone={() => setPlayingCard(null)} /> : null}
      {receipt ? <CardReceipt key={`${receipt.preview ? 'preview' : 'new'}-${receipt.card.id}`} card={gameCardModel(receipt.card)} sourceLabel={receipt.preview ? '本地演示' : '新补给'} preview={receipt.preview} onConfirm={async () => {}} onDone={() => setReceipt(null)} /> : null}
    </div>
  );
}
