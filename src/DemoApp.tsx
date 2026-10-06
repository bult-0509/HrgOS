import { useCallback, useRef, useState } from "react";
import { ToastStack } from "./components/ui";
import { WaitingScreen } from "./components/WaitingScreen";
import type { LoginSession } from "./domain/loginAccess";
import { initialAuditQueue, initialCards, initialMessages, teams as initialTeams } from "./data/mock";
import { initialSharedBingoTasks } from './data/sharedBingoTasks';
import { enqueueAuditItem } from "./domain/auditQueue";
import { reviewAudit, type ReviewState } from './domain/regionProgress';
import { canRevealTask } from './domain/photoFind';
import { PlayerApp } from "./player/PlayerApp";
import { StaffApp } from "./staff/StaffApp";
import type { GameCard, GameMessage, Task, ToastState, UserMode } from "./types";

function nowLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

export default function DemoApp({ mode, account, onLogout }: { mode: UserMode; account: LoginSession; onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>(initialSharedBingoTasks);
  const [cards, setCards] = useState<GameCard[]>(initialCards);
  const [messages, setMessages] = useState<GameMessage[]>(() => {
    const team = initialTeams.find((candidate) => candidate.id === account.teamId);
    return initialMessages.map((message) => ({
      ...message,
      body: team ? message.body.replaceAll("Phigros队", team.name) : message.body
    }));
  });
  const [reviewState, setReviewState] = useState<ReviewState>({
    auditQueue: initialAuditQueue, teams: initialTeams, regionAuditLog: [], photoFinds: {},
    regionProgress: {
      'team-1': {currentRegionId:'stage-b',version:2}, 'team-2': {currentRegionId:'stage-b',version:2},
      'team-3': {currentRegionId:'stage-a',version:1}, 'team-4': {currentRegionId:'stage-c',version:3},
      'team-5': {currentRegionId:'stage-a',version:1}
    }
  });
  const { auditQueue, teams, regionProgress, regionAuditLog } = reviewState;
  const playerTeam = teams.find((team) => team.id === account.teamId);
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((toast: Omit<ToastState, "id">) => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  const handleSubmitTask = (taskId: string, filename: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !playerTeam) return;
    const regionId = regionProgress[playerTeam.id]?.currentRegionId ?? null;
    if (!canRevealTask(task.sharedSlot, regionId, reviewState.photoFinds?.[playerTeam.id]?.[regionId ?? ''])) return;

    setTasks((current) => current.map((item) => (
      item.id === taskId
        ? { ...item, state: "pending", pendingCount: (item.pendingCount ?? 0) + 1 }
        : item
    )));
    setReviewState((current) => ({ ...current, auditQueue: enqueueAuditItem(current.auditQueue, {
        id: `A-${Date.now()}`,
        kind: "普通任务",
        team: playerTeam.name,
        teamId: playerTeam.id,
        task: task.title,
        submittedAt: `${nowLabel()}:00`,
        waitingSeconds: 0,
        imageTone: task.imageTone,
        checklist: ["符合任务画面要求", "包含有效队伍信息", "为活动现场原图"]
      }) }));
    setMessages((current) => [
      {
        id: `M-${Date.now()}`,
        type: "review",
        title: "本地演示提交已记录",
        body: `“${task.title}”的文件名 ${filename} 已加入本页演示队列；图片未上传，其他设备的工作人员不会收到。`,
        time: nowLabel(),
        unread: true
      },
      ...current
    ]);
    notify({ tone: "warning", title: "仅本地演示", body: "已记录文件名，图片未上传到服务器，工作人员设备不会收到。" });
  };

  const handleSubmitPhotoFind = (slot: string, filename: string) => {
    if (!playerTeam) return;
    const regionId = regionProgress[playerTeam.id]?.currentRegionId;
    if (!regionId || reviewState.photoFinds?.[playerTeam.id]?.[regionId]?.[slot]?.status === 'approved' || reviewState.photoFinds?.[playerTeam.id]?.[regionId]?.[slot]?.status === 'pending') return;
    const id = `P-${crypto.randomUUID()}`;
    setReviewState(current => ({ ...current,
      photoFinds: { ...current.photoFinds, [playerTeam.id]: { ...current.photoFinds?.[playerTeam.id], [regionId]: { ...current.photoFinds?.[playerTeam.id]?.[regionId], [slot]: { status: 'pending', submissionId: id } } } },
      auditQueue: enqueueAuditItem(current.auditQueue, { id, kind: '格位图寻', teamId: playerTeam.id, team: playerTeam.name, photoSlot: slot, photoRegionId: regionId, task: `图寻 #${Number(slot.slice(1))}`, submittedAt: `${nowLabel()}:00`, waitingSeconds: 0, imageTone: 'tone-cyan', checklist: ['复刻参考图所在地点', '复刻参考图拍摄角度'] })
    }));
    notify({ tone: 'warning', title: '图寻已加入本地演示队列', body: `${filename} 仅记录文件名，不会上传到工作人员设备；须审核通过后才解锁任务。` });
  };

  const handleUseCard = (cardId: string, target: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card) return;
    setCards((current) => current
      .map((item) => item.id === cardId ? { ...item, uses: item.uses - 1 } : item)
      .filter((item) => item.uses > 0));
    setMessages((current) => [
      {
        id: `M-${Date.now()}`,
        type: "card",
        title: card.needsConfirmation ? "道具卡等待确认" : "道具卡已生效",
        body: `“${card.name}”已对${target}使用。${card.needsConfirmation ? "工作人员确认后生效。" : "效果已写入活动账本。"}`,
        time: nowLabel(),
        unread: true
      },
      ...current
    ]);
    notify({
      tone: card.needsConfirmation ? "warning" : "success",
      title: card.needsConfirmation ? "等待工作人员确认" : "道具卡已生效",
      body: `${card.name} → ${target}`
    });
  };

  const handleReview = (itemId: string, result: "approve" | "reject") => {
    const item = auditQueue.find((queueItem) => queueItem.id === itemId);
    if (!item) return;
    const command = {itemId,result,actor:mode,operatorId:account.username,reviewedAt:new Date().toISOString()};
    const next = reviewAudit(reviewState, command);
    if (next === reviewState) {
      notify({tone:'warning',title:'未更改区域',body:'请检查队首、队伍和下一地区的审核目标。'});
      return;
    }
    setReviewState(current => reviewAudit(current, command));
    const entrance = item.kind === '图寻题';
    const photo = item.kind === '格位图寻';
    setMessages((current) => [
      {
        id: `M-${Date.now()}`,
        type: "review",
        title: result === "approve" ? (photo ? '图寻审核通过' : entrance ? "区域入口审核通过" : "任务审核通过") : "需要重新提交",
        body: result === "approve"
          ? (photo ? `${item.task}已通过，五张 Bingo 的对应任务已解锁。` : entrance ? `${item.team}的区域入口已通过，本队 19 张图寻图片统一更新；任务和分数保留。` : `“${item.task}”已审核通过，结果已写入账本。`)
          : `“${item.task}”已打回；任务完成状态不变，请重新上传照片。`,
        time: nowLabel(),
        unread: true
      },
      ...current
    ]);
    notify({
      tone: result === "approve" ? "success" : "warning",
      title: result === "approve" ? "审核已通过" : "已打回重交",
      body: `${item.team} · ${item.task}`
    });
  };

  const handleFinishTeam = (teamId: string) => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    setReviewState((current) => ({...current,teams:current.teams.map((item) => item.id === teamId
      ? {
          ...item,
          status: "finished",
          region: "工作人员包厢",
          lastSeen: `${nowLabel()} 完赛`,
          color: "#c89217"
        }
      : item)}));
    notify({ tone: "success", title: "已确认完赛", body: `${team.name}的位置标记已固定为金色。` });
  };

  return (
    <>
      {mode === "player" ? (playerTeam ? (
        <PlayerApp
          team={playerTeam}
          tasks={tasks}
          approvedRegionId={regionProgress[playerTeam.id]?.currentRegionId ?? null}
          cards={cards}
          messages={messages}
          onLogout={onLogout}
          onSubmitTask={handleSubmitTask}
          photoFinds={reviewState.photoFinds?.[playerTeam.id]?.[regionProgress[playerTeam.id]?.currentRegionId ?? ''] ?? {}}
          onSubmitPhotoFind={handleSubmitPhotoFind}
          onUseCard={handleUseCard}
          onReadMessage={(messageId) => setMessages((current) => current.map((message) => (
            message.id === messageId ? { ...message, unread: false } : message
          )))}
        />
      ) : <WaitingScreen />) : (
        <StaffApp
          regionAuditLog={regionAuditLog}
          auditQueue={auditQueue}
          teams={teams}
          onReview={handleReview}
          onFinishTeam={handleFinishTeam}
          onLogout={onLogout}
        />
      )}
      <ToastStack toasts={toasts} />
    </>
  );
}
