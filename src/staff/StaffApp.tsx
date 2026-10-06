import { useState, type CSSProperties } from "react";
import {
  Activity,
  BellRing,
  Check,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Clock3,
  Database,
  Flag,
  Gauge,
  House,
  LocateFixed,
  Map,
  MapPin,
  MessageSquareWarning,
  Navigation,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  UsersRound,
  WifiOff,
  X
} from "lucide-react";
import { SectionHeading, StatusChip } from "../components/ui";
import type { AuditItem, StaffTab, TeamStatus } from "../types";
import type { RegionAuditLog } from '../domain/regionProgress';
import { getPhotoClue, photoRegions } from '../data/photoClues';

interface StaffAppProps {
  auditQueue: AuditItem[];
  teams: TeamStatus[];
  onReview: (itemId: string, result: "approve" | "reject") => void;
  onFinishTeam: (teamId: string) => void;
  onLogout: () => void;
  regionAuditLog?: RegionAuditLog[];
}

const navItems: { id: StaffTab; label: string; icon: typeof House }[] = [
  { id: "overview", label: "总览", icon: Gauge },
  { id: "review", label: "审核", icon: ClipboardCheck },
  { id: "map", label: "位置", icon: Map },
  { id: "control", label: "控制", icon: ShieldCheck }
];

export function StaffApp({ auditQueue, teams, onReview, onFinishTeam, onLogout, regionAuditLog = [] }: StaffAppProps) {
  const [tab, setTab] = useState<StaffTab>("overview");
  const [gamePaused, setGamePaused] = useState(false);

  return (
    <div className="app-shell app-shell--staff">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="staff-sidebar">
        <button className="brand-lockup brand-lockup--staff" onClick={() => setTab("overview")} aria-label="返回工作人员总览">
          <span className="brand-mark" aria-hidden="true">H</span>
          <div><strong>HRG // OPS</strong><span>工作人员控制台</span></div>
        </button>
        <nav aria-label="工作人员导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>
                <Icon size={20} aria-hidden="true" />
                <span>{item.label}</span>
                {item.id === "review" && auditQueue.length ? <i>{auditQueue.length}</i> : null}
              </button>
            );
          })}
        </nav>
        <div className="staff-sidebar__footer">
          <div className="operator-card">
            <CircleUserRound size={28} aria-hidden="true" />
            <div><strong>STAFF 01</strong><span>全局操作权限</span></div>
          </div>
          <button className="text-button text-button--light" onClick={onLogout}>退出演示</button>
        </div>
      </aside>

      <div className="staff-workspace">
        <header className="staff-topbar">
          <div>
            <p className="eyebrow">LIVE SESSION 01 · HANGZHOU</p>
            <h1>{tab === "overview" ? "活动总览" : tab === "review" ? "审核队列" : tab === "map" ? "队长位置" : "比赛控制"}</h1>
          </div>
          <div className="topbar__actions">
            <span className={`live-pill ${gamePaused ? "live-pill--paused" : ""}`}>
              {gamePaused ? <Pause size={14} aria-hidden="true" /> : <Radio size={14} aria-hidden="true" />}
              {gamePaused ? "比赛已暂停" : "比赛进行中"}
            </span>
            <button className="icon-button" aria-label="通知"><BellRing size={20} aria-hidden="true" /><i className="icon-badge" /></button>
          </div>
        </header>

        <main className="staff-main" id="main-content" tabIndex={-1}>
          <div className="staff-view" key={tab}>
            {tab === "overview" ? <StaffOverview auditQueue={auditQueue} teams={teams} onNavigate={setTab} /> : null}
            {tab === "review" ? <ReviewWorkspace auditQueue={auditQueue} onReview={onReview} /> : null}
            {tab === "map" ? <LocationWorkspace teams={teams} /> : null}
            {tab === "control" ? (
              <ControlWorkspace
                teams={teams}
                gamePaused={gamePaused}
                onTogglePause={() => setGamePaused((current) => !current)}
                onFinishTeam={onFinishTeam}
                regionAuditLog={regionAuditLog}
              />
            ) : null}
          </div>
        </main>
      </div>

      <nav className="bottom-nav staff-bottom-nav" aria-label="工作人员移动导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>
              <span className="nav-icon-wrap"><Icon size={21} aria-hidden="true" />{item.id === "review" && auditQueue.length ? <i>{auditQueue.length}</i> : null}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function StaffOverview({
  auditQueue,
  teams,
  onNavigate
}: {
  auditQueue: AuditItem[];
  teams: TeamStatus[];
  onNavigate: (tab: StaffTab) => void;
}) {
  const onlineCount = teams.filter((team) => team.status === "online").length;
  const finishedCount = teams.filter((team) => team.status === "finished").length;
  return (
    <div className="page-stack">
      <section className="metric-grid">
        <article className="metric-card metric-card--dark">
          <div><span>比赛已运行</span><strong>01:47:32</strong></div>
          <Activity size={28} aria-hidden="true" />
          <p>下一次排名公开 <b>18 分钟后</b></p>
        </article>
        <article className="metric-card">
          <span>待审核</span><strong>{auditQueue.length}</strong><p>队首已等待 42 秒</p>
          <button onClick={() => onNavigate("review")}>立即处理<ChevronRight size={17} aria-hidden="true" /></button>
        </article>
        <article className="metric-card">
          <span>队长在线</span><strong>{onlineCount}/{teams.length}</strong><p>1 支队伍离线中</p>
          <button onClick={() => onNavigate("map")}>查看位置<ChevronRight size={17} aria-hidden="true" /></button>
        </article>
        <article className="metric-card">
          <span>已完赛</span><strong>{finishedCount}/{teams.length}</strong><p>全部完赛后手动结束</p>
          <button onClick={() => onNavigate("control")}>比赛控制<ChevronRight size={17} aria-hidden="true" /></button>
        </article>
      </section>

      <section className="staff-panel">
        <SectionHeading eyebrow="TEAM STATUS" title="队伍状态" action={<button className="text-button" onClick={() => onNavigate("control")}>管理队伍<ChevronRight size={16} /></button>} />
        <div className="team-table" role="table" aria-label="队伍状态表">
          <div className="team-table__head" role="row">
            <span>队伍</span><span>区域</span><span>积分</span><span>队长位置</span><span>状态</span>
          </div>
          {teams.map((team) => (
            <div className="team-table__row" role="row" key={team.id}>
              <span className="team-name"><i style={{ background: team.color }} />{team.name}</span>
              <span>{team.region}</span>
              <strong>{team.score}</strong>
              <span>{team.lastSeen}</span>
              <StatusChip tone={team.status === "finished" ? "gold" : team.status === "offline" ? "warning" : "success"}>
                {team.status === "finished" ? "已完赛" : team.status === "offline" ? "离线中" : "在线"}
              </StatusChip>
            </div>
          ))}
        </div>
      </section>

      <section className="staff-two-column">
        <article className="staff-panel">
          <SectionHeading eyebrow="RANDOM EVENTS" title="待发放事件" />
          <div className="event-queue-row">
            <span className="event-queue-row__icon"><Sparkles size={22} aria-hidden="true" /></span>
            <div><strong>Phigros队 · B 区</strong><p>候选事件：DOUBLE INPUT</p></div>
            <button className="button button--small">确认发放</button>
          </div>
          <div className="event-queue-row">
            <span className="event-queue-row__icon"><RotateCcw size={22} aria-hidden="true" /></span>
            <div><strong>全能队 · A 区</strong><p>尚未抽取事件候选</p></div>
            <button className="button button--ghost button--small">抽取</button>
          </div>
        </article>
        <article className="staff-panel system-health">
          <SectionHeading eyebrow="SYSTEM" title="运行状态" />
          <div><span><Database size={18} />数据库</span><strong>84 MB</strong><StatusChip tone="success">正常</StatusChip></div>
          <div><span><BellRing size={18} />Web Push</span><strong>15/16</strong><StatusChip tone="warning">1 台异常</StatusChip></div>
          <div><span><Clock3 size={18} />最近备份</span><strong>14:25</strong><StatusChip tone="success">3 分钟前</StatusChip></div>
        </article>
      </section>
    </div>
  );
}

function ReviewWorkspace({ auditQueue, onReview }: { auditQueue: AuditItem[]; onReview: (id: string, result: "approve" | "reject") => void }) {
  const current = auditQueue[0];
  if (!current) {
    return (
      <div className="review-empty">
        <ClipboardCheck size={48} aria-hidden="true" />
        <h2>审核队列已清空</h2>
        <p>新的提交会按服务器时间自动排入这里。</p>
      </div>
    );
  }
  return (
    <div className="review-layout">
      <section className="review-queue staff-panel">
        <div className="review-queue__header">
          <div><p className="eyebrow">FIFO QUEUE</p><h2>{auditQueue.length} 项待处理</h2></div>
          <StatusChip tone="warning">按提交时间</StatusChip>
        </div>
        <div className="review-queue__list">
          {auditQueue.map((item, index) => (
            <article className={`review-list-item ${index === 0 ? "is-current" : ""}`} key={item.id}>
              <span className="review-list-item__number">{String(index + 1).padStart(2, "0")}</span>
              <div><small>{item.kind} · {item.submittedAt}</small><strong>{item.task}</strong><p>{item.team}</p></div>
              <span>{item.waitingSeconds} 秒</span>
            </article>
          ))}
        </div>
      </section>

      <section className="review-detail staff-panel">
        <div className="review-detail__header">
          <div><p className="eyebrow">CURRENT REVIEW · {current.id}</p><h2>{current.task}</h2><p>{current.team} · 提交于 {current.submittedAt}</p></div>
          <StatusChip tone={current.kind !== "普通任务" ? "info" : "danger"}>{current.kind}</StatusChip>
        </div>
        <div className={`review-photo ${current.imageTone}`}>
          <span>原图审核预览</span>
          <LocateFixed size={42} aria-hidden="true" />
          <small>3024 × 4032 · JPEG · EXIF 已保留</small>
        </div>
        <div className="review-checklist">
          <h3>审核要点</h3>
          {current.checklist.map((item) => <label key={item}><input type="checkbox" /> <span>{item}</span></label>)}
        </div>
        <div className="review-actions">
          <button className="button button--reject" onClick={() => onReview(current.id, "reject")}><X size={19} aria-hidden="true" />打回重交</button>
          <button className="button button--approve" onClick={() => onReview(current.id, "approve")}><Check size={19} aria-hidden="true" />审核通过</button>
        </div>
        {current.kind === '图寻题' ? <p className="panel-intro">这是区域入口审核。通过后只推进{current.team}至{photoRegions.find(r => r.id === current.targetRegionId)?.name ?? '（目标缺失，不能推进）'}，本队 19 张图片统一替换；不重置任务、分数或其他队进度。打回时保持当前区域。</p> : null}
        {current.kind === '格位图寻' ? <figure className="photo-review-reference"><img src={getPhotoClue(current.photoRegionId ?? '', current.photoSlot ?? '')?.detail} alt="图寻参考图" /><figcaption>核对参考图所在地点与拍摄角度。通过后只解锁本队五个对应任务，不换区、不加任务分。本页只记录演示文件名，不代表收到了真实照片。</figcaption></figure> : null}
      </section>
    </div>
  );
}

function LocationWorkspace({ teams }: { teams: TeamStatus[] }) {
  const [mapAvailable, setMapAvailable] = useState(true);
  return (
    <div className="location-layout">
      <section className="map-panel staff-panel">
        <div className="map-panel__header">
          <div><p className="eyebrow">CAPTAIN LIVE MAP</p><h2>队长近实时位置</h2><p>前台最多每 3 秒更新 · 20 秒无数据标记离线</p></div>
          <button className="button button--ghost button--small" onClick={() => setMapAvailable((current) => !current)}>{mapAvailable ? "模拟地图故障" : "恢复地图"}</button>
        </div>
        {mapAvailable ? (
          <div className="live-map" aria-label="队长位置示意地图">
            <div className="map-water map-water--one" />
            <div className="map-water map-water--two" />
            <div className="map-road map-road--one" />
            <div className="map-road map-road--two" />
            <span className="map-label map-label--lake">GAME FIELD</span>
            <span className="map-label map-label--quyuan">B 区</span>
            <span className="map-label map-label--beishan">A 区</span>
            {teams.map((team) => (
              <button
                key={team.id}
                className={`team-marker team-marker--${team.status}`}
                style={{ left: `${team.x}%`, top: `${team.y}%`, "--team-color": team.color } as CSSProperties}
                aria-label={`${team.name}，${team.status === "finished" ? "已完赛" : team.status === "offline" ? "离线中" : "在线"}`}
              >
                <MapPin size={30} fill="currentColor" aria-hidden="true" />
                <span>{team.shortName}</span>
                {team.status === "offline" ? <i>离线中</i> : team.status === "finished" ? <i>已完赛</i> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="map-fallback">
            <WifiOff size={38} aria-hidden="true" />
            <h3>地图服务暂不可用</h3>
            <p>坐标与在线状态仍在持续更新，请使用右侧列表。</p>
          </div>
        )}
      </section>
      <section className="location-list staff-panel">
        <SectionHeading eyebrow="LIVE FEED" title="位置状态" />
        {teams.map((team) => (
          <article className="location-row" key={team.id}>
            <span className="location-row__marker" style={{ background: team.status === "finished" ? "#c89217" : team.color }}><Navigation size={17} aria-hidden="true" /></span>
            <div><strong>{team.name}</strong><p>{team.region} · {team.lastSeen}</p></div>
            <StatusChip tone={team.status === "finished" ? "gold" : team.status === "offline" ? "warning" : "success"}>
              {team.status === "finished" ? "已完赛" : team.status === "offline" ? "离线" : "在线"}
            </StatusChip>
          </article>
        ))}
      </section>
    </div>
  );
}

function ControlWorkspace({
  teams,
  gamePaused,
  onTogglePause,
  onFinishTeam,
  regionAuditLog
}: {
  teams: TeamStatus[];
  gamePaused: boolean;
  onTogglePause: () => void;
  onFinishTeam: (id: string) => void;
  regionAuditLog: RegionAuditLog[];
}) {
  const allFinished = teams.every((team) => team.status === "finished");
  return (
    <div className="page-stack">
      <section className={`game-control-hero ${gamePaused ? "is-paused" : ""}`}>
        <div>
          <p className="eyebrow eyebrow--light">GAME STATE</p>
          <h2>{gamePaused ? "比赛已暂停" : "比赛正在进行"}</h2>
          <p>{gamePaused ? "玩家新提交、卡牌和事件计时均已冻结。" : "全局计时 01:47:32 · 下一排名快照 18 分钟后"}</p>
        </div>
        <button className="button button--light" onClick={onTogglePause}>
          {gamePaused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
          {gamePaused ? "恢复比赛" : "暂停比赛"}
        </button>
      </section>

      {allFinished ? (
        <div className="all-finished-banner"><Trophy size={24} /><div><strong>所有队伍已完赛</strong><p>请核对审核与账本后手动结束比赛。</p></div><button className="button button--dark">结束比赛</button></div>
      ) : null}

      <section className="staff-panel">
        <SectionHeading eyebrow="FINISH CONTROL" title="现场完赛确认" />
        <p className="panel-intro">队伍抵达工作人员所在包厢后，由工作人员手动确认。确认后停止定位，地图箭头固定为金色。</p>
        <div className="finish-grid">
          {teams.map((team) => (
            <article className={`finish-card ${team.status === "finished" ? "is-finished" : ""}`} key={team.id}>
              <span className="finish-card__rank">#{team.rank}</span>
              <div><h3>{team.name}</h3><p>{team.region} · {team.score} 分</p></div>
              {team.status === "finished" ? (
                <StatusChip tone="gold"><Flag size={14} aria-hidden="true" />已完赛</StatusChip>
              ) : (
                <button className="button button--small button--primary" onClick={() => onFinishTeam(team.id)}><Flag size={16} aria-hidden="true" />确认到达</button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="staff-two-column">
        <article className="staff-panel">
          <SectionHeading eyebrow="RANK SNAPSHOT" title="公开节奏" />
          <div className="countdown-display"><Clock3 size={28} aria-hidden="true" /><div><strong>18:04</strong><span>后展示两分钟</span></div></div>
          <p className="panel-intro">快照展示队名、名次和总分，不触发系统推送，也不会阻断玩家操作。</p>
        </article>
        <article className="staff-panel">
          <SectionHeading eyebrow="AUDIT" title="最近操作" />
          <ul className="audit-mini-list">
            {regionAuditLog.slice(-5).reverse().map(log => <li key={log.auditId}><span>{new Date(log.reviewedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span><p><strong>{log.operatorId}</strong> {log.result === 'approve' ? '通过' : '打回'}了{teams.find(t=>t.id===log.teamId)?.name}的{photoRegions.find(r=>r.id===log.to)?.name}入口审核</p></li>)}
            <li><span>14:28</span><p><strong>STAFF 01</strong> 通过了“同步判定”</p></li>
            <li><span>14:26</span><p><strong>STAFF 02</strong> 发放了随机事件</p></li>
            <li><span>14:25</span><p><strong>系统</strong> 完成数据库备份</p></li>
          </ul>
        </article>
      </section>
    </div>
  );
}
