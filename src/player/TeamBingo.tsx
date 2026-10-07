import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Clock3, Image, LockKeyhole, Pause, Play, Zap } from 'lucide-react';
import { bingoSlots, getPhotoClue, photoRegions } from '../data/photoClues';
import { PhotoPreview } from './PhotoPreview';
import { getTeamBingoTheme } from './teamBingoThemes';
import type { PhotoFindStatus } from '../domain/photoFind';
import './teamBingo.css';
import './taskDifficulty.css';

export interface BingoItem {
  id: string;
  slot?: string;
  points?: number;
  difficulty?: '易' | '中' | '难' | '极难';
  photoStatus?: PhotoFindStatus;
  completed?: boolean;
  state: 'available' | 'pending' | 'awarded' | 'locked' | 'unconfigured';
  pendingCount?: number;
}
interface Props {
  teamId: string;
  teamName: string;
  approvedRegionId: string | null;
  items: BingoItem[];
  onSelect: (id: string) => void;
  paused?: boolean;
  motionEnabled?: boolean;
  onToggleMotion?: () => void;
}

export function photoSlotFor(item: Pick<BingoItem,'slot'>, index: number) {
  return item.slot && /^(P(0[1-9]|1[0-9])|D0[1-6])$/.test(item.slot) ? item.slot : bingoSlots[index];
}

/** 美术层只消费本队已批准状态，不修改区域、得分、任务或审核权限。 */
export function TeamBingo({teamId,teamName,approvedRegionId,items,onSelect,paused=false,motionEnabled:controlledMotion,onToggleMotion}: Props) {
  const theme=getTeamBingoTheme(teamId);
  const region=photoRegions.find(r=>r.id===approvedRegionId);
  const [localMotion,setMotionEnabled]=useState(true);
  const motionEnabled=controlledMotion??localMotion;
  const [visible,setVisible]=useState(true);
  useEffect(()=>{
    const update=()=>setVisible(document.visibilityState!=='hidden');update();
    document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);
  },[]);
  const root=`${import.meta.env.BASE_URL}images/team-bingo/`;
  const finished=items.filter(item=>item.completed||item.state==='awarded').length;
  const pending=items.filter(item=>item.state==='pending').length;
  const style={'--tb-accent':theme?.accent??'#bdc9db','--tb-surface':theme?.surface??'#182936'} as CSSProperties;
  const motionPaused=paused||!motionEnabled||!visible;
  return <section className={`team-bingo ${motionPaused?'photo-motion-paused tb-paused':''}`} data-bingo-theme={theme?.id??'neutral'} style={style} aria-label={`${teamName} Bingo`}>
    <h2 className="sr-only">{teamName} 5×5任务棋盘</h2>
    <div className="tb-stage">
      <div className="tb-board-surface" aria-hidden="true" />
      {theme ? <img className="tb-frame" src={`${root}frame-${theme.id}.svg`} alt="" aria-hidden="true" width="1000" height="1000" /> : null}
      <div className="tb-core">
        <div className="tb-header">
          <ol className="bingo-regions tb-regions" aria-label="本队区域进度，只能由工作人员审核推进">
            {photoRegions.map(r=><li key={r.id} className={region?.id===r.id?'is-current':region&&r.number<region.number?'is-passed':'is-locked'} aria-current={region?.id===r.id?'step':undefined} aria-label={`${r.name}，${region?.id===r.id?'当前区域':region&&r.number<region.number?'已通过':'待工作人员审核'}`}><span>{String(r.number).padStart(2,'0')}</span>{!region||r.number>region.number?<LockKeyhole size={11} aria-hidden="true"/>:null}</li>)}
          </ol>
          <span className="tb-progress" aria-label={`已完成 ${finished} 格，待审核 ${pending} 格，共 ${items.length} 格`}><Check size={15} aria-hidden="true"/><b>{String(finished).padStart(2,'0')}</b><span>/{items.length}</span></span>
          <button className="tb-motion" type="button" aria-label={motionEnabled?'暂停动效':'开启动效'} aria-pressed={!motionEnabled} onClick={onToggleMotion??(()=>setMotionEnabled(v=>!v))}>{motionEnabled?<Pause size={15}/>:<Play size={15}/>}</button>
        </div>
        <p className="sr-only" role="status">{region?`当前：${region.name}。工作人员通过本队下一地区入口审核后，19 张图统一更新，任务和分数保留。`:'等待工作人员审核区域入口，尚未开放图寻图片。'}</p>
        <div className="bingo-board bingo-board--photos tb-grid" role="group" aria-label={`${region?.name??'待区域审核'} 5乘5任务棋盘`}>
          {items.map((item,index)=>{
            const slot=photoSlotFor(item,index);
            const photo=getPhotoClue(region?.id??'',slot??'');
            const isPhoto=slot?.startsWith('P');
            const completed=!!item.completed||item.state==='awarded';
            const status=completed?'任务已完成':item.photoStatus==='pending'?'图寻审核中':item.state==='pending'?'任务审核中':item.state==='locked'?'任务未解锁':item.state==='unconfigured'?'待配置':'可提交';
            return <button key={item.id} type="button" className={`bingo-cell bingo-cell--${item.state} ${isPhoto?'bingo-cell--photo':'bingo-cell--direct'} tb-cell`} data-task-id={item.id} data-slot={slot} data-difficulty={item.difficulty} data-photo-state={item.photoStatus} data-completed={completed} onClick={()=>onSelect(item.id)} style={{'--cell-order':index} as CSSProperties} aria-label={`第 ${index+1} 格，${isPhoto?`图寻图片 #${Number(slot?.slice(1))}`:'无需图寻'}，${item.difficulty ?? ''}，${item.points != null ? `${item.points}分，` : ''}${status}，${item.state==='locked'?'打开图寻图片':'打开任务详情'}`}>
              {photo?<PhotoPreview key={photo.preview} photo={photo} order={index}/>:isPhoto?<span className="bingo-cell__direct-art" aria-hidden="true"><LockKeyhole size={22}/></span>:null}
              <span className="bingo-cell__footer">{item.points!=null?<b>{item.points}</b>:<span aria-label="待配置">—</span>}</span>
              {completed||item.state==='pending'||item.state==='locked'?<span className="bingo-cell__state" aria-hidden="true">{completed?<Check size={12}/>:item.state==='pending'||item.photoStatus==='pending'?<Clock3 size={12}/>:<LockKeyhole size={12}/>}</span>:null}
            </button>;
          })}
        </div>
        <div className="tb-footer" aria-label="19 个图寻任务，6 个直接任务"><Image size={14} aria-hidden="true"/><b>19</b><i/><Zap size={14} aria-hidden="true"/><b>06</b></div>
      </div>
    </div>
  </section>;
}
