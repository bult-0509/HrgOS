import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { seedState, executeCommand, stateView, exportBackup, restoreBackup, visibleMedia } from './rules.mjs';

const staff = { id: 'staff', role: 'staff', manage: true, review: true };
const player = { id: 'player', role: 'player', teamId: 'team-1' };
const other = { id: 'other', role: 'player', teamId: 'team-2' };
const slots = [...Array.from({length:19},(_,i)=>`P${String(i+1).padStart(2,'0')}`), ...Array.from({length:6},(_,i)=>`D${String(i+1).padStart(2,'0')}`)];
const tasks = Array.from({length:5},(_,i)=>`team-${i+1}`).flatMap(boardId=>slots.map((sharedSlot,n)=>({id:`${boardId}-${sharedSlot}`,boardId,sharedSlot,title:`秘密任务-${boardId}-${sharedSlot}`,brief:'完成后才可看见的任务要求',points:5,difficulty:['易','中','难'][n%3]})));
const media = {name:'replica.png',mime:'image/png',base64:(await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer()).toString('base64')};
const run = (state, actor, command, key=crypto.randomUUID()) => executeCommand(state,actor,command,key);
async function fixture() {
  const state=seedState([]);state.mode='live';
  await run(state,staff,{type:'game_configure',tasks,reason:'测试图寻门槛'});
  await run(state,staff,{type:'transition',status:'RUNNING'});
  for(const team of state.teams){team.regionId='stage-b';team.regionVersion=2;}
  return state;
}
test('图寻通过前API不返回任务文案，但保留难度与分数；审核后一次解锁本队五个任务',async()=>{
  const state=await fixture();const before=stateView(state,player);
  assert.equal(before.tasks.filter(task=>task.title).length,30);
  assert(before.tasks.every(task=>task.completed===false));
  assert(before.tasks.filter(task=>task.sharedSlot.startsWith('P')).every(task=>!task.title&&!task.brief&&task.difficulty&&task.points===5&&!task.taskUnlocked));
  await assert.rejects(run(state,player,{type:'submit',kind:'task',taskId:'team-2-P01',regionId:'stage-b',media}),/PHOTO_FIND_REQUIRED/);
  const photo=await run(state,player,{type:'submit',kind:'photo',photoSlot:'P01',teamId:'team-2',regionId:'stage-b',media});
  assert.equal(photo.submission.teamId,'team-1');assert.equal(stateView(state,player).tasks.find(task=>task.id==='team-2-P01').photoStatus,'pending');
  await assert.rejects(run(state,player,{type:'submit',kind:'photo',photoSlot:'P01',regionId:'stage-b',media}),/PHOTO_REVIEW_PENDING/);
  await assert.rejects(run(state,{...player,review:true},{type:'review',submissionId:photo.submission.id,result:'approve'}),/FORBIDDEN/);
  const key=crypto.randomUUID(),review={type:'review',submissionId:photo.submission.id,result:'approve'};
  await run(state,staff,review,key);await run(state,staff,review,key);
  const after=stateView(state,player);
  assert.equal(after.tasks.filter(task=>task.sharedSlot==='P01'&&task.title).length,5);
  assert(after.tasks.filter(task=>task.sharedSlot==='P02').every(task=>!task.title));
  assert(stateView(state,other).tasks.filter(task=>task.sharedSlot==='P01').every(task=>!task.title));
  assert.equal(after.team.score,0);assert.equal(state.events.length,0);assert.equal(Object.keys(state.awards).length,0);assert.equal(after.team.regionId,'stage-b');
  assert(after.tasks.every(task=>task.completed===false));
  assert.throws(()=>visibleMedia(state,other,photo.media.id),/FORBIDDEN/);
  await run(state,player,{type:'submit',kind:'task',taskId:'team-2-P01',regionId:'stage-b',media});
  await run(state,staff,{type:'review',submissionId:state.submissions.at(-1).id,result:'approve'});
  assert.equal(stateView(state,player).team.score,5);
  assert.equal(stateView(state,player).tasks.filter(task=>task.sharedSlot==='P01'&&task.completed).length,1);
  const hiddenCompleted=stateView(state,other).tasks.find(task=>task.id==='team-2-P01');
  assert.equal(hiddenCompleted.completed,true);assert.equal(hiddenCompleted.taskUnlocked,false);assert.equal(hiddenCompleted.title,undefined);
  const restored=restoreBackup(exportBackup(state));assert.equal(stateView(restored,player).tasks.filter(task=>task.sharedSlot==='P01'&&task.title).length,5);
});

test('任务待审和打回不泛红，已通过但不计分的完成仍公开完成状态',async()=>{
  const state=await fixture();
  const submit=async taskId=>run(state,player,{type:'submit',kind:'task',taskId,regionId:'stage-b',media});
  const first=await submit('team-1-D01');
  await run(state,staff,{type:'review',submissionId:first.submission.id,result:'approve'});
  const second=await submit('team-1-D02');
  assert.equal(stateView(state,player).tasks.find(task=>task.id==='team-1-D02').completed,false);
  await run(state,staff,{type:'review',submissionId:second.submission.id,result:'reject',reason:'需补充完成证据'});
  assert.equal(stateView(state,player).tasks.find(task=>task.id==='team-1-D02').completed,false);
  const retry=await submit('team-1-D02');
  // 已入队后现场调低上限：保留完成记录，但不追加基础积分。
  await run(state,staff,{type:'configure',patch:{taskLimit:1},reason:'现场调低任务上限'});
  await run(state,staff,{type:'review',submissionId:retry.submission.id,result:'approve'});
  const completed=stateView(state,player).tasks.find(task=>task.id==='team-1-D02');
  assert.equal(state.submissions.at(-1).status,'APPROVED_NON_SCORING');
  assert.equal(completed.completed,true);assert.equal(completed.awarded,false);
  assert.equal(stateView(state,player).team.score,5);
});
test('打回重交仍隐藏任务；进入开场后旧区不得继续提交，换区重新锁定图寻',async()=>{
  const state=await fixture();
  let photo=await run(state,player,{type:'submit',kind:'photo',photoSlot:'P02',regionId:'stage-b',media});
  await run(state,staff,{type:'review',submissionId:photo.submission.id,result:'reject',reason:'拍摄角度不一致'});
  assert.equal(stateView(state,player).tasks.find(task=>task.sharedSlot==='P02').photoStatus,'rejected');
  photo=await run(state,player,{type:'submit',kind:'photo',photoSlot:'P02',regionId:'stage-b',media});
  await run(state,staff,{type:'review',submissionId:photo.submission.id,result:'approve'});
  assert.equal(stateView(state,player).tasks.filter(task=>task.sharedSlot==='P02'&&task.title).length,5);
  const arrival=await run(state,player,{type:'submit',kind:'arrival',regionId:'stage-c',media});
  await assert.rejects(run(state,player,{type:'submit',kind:'photo',photoSlot:'P03',regionId:'stage-b',media}),/REGION_OPENING_REQUIRED/);
  await run(state,staff,{type:'review',submissionId:arrival.submission.id,result:'approve'});
  await assert.rejects(run(state,player,{type:'submit',kind:'photo',photoSlot:'P03',regionId:'stage-b',media}),/REGION_NOT_UNLOCKED/);
  const after=stateView(state,player);assert.equal(after.team.regionId,'stage-c');
  assert(after.tasks.filter(task=>task.sharedSlot.startsWith('P')).every(task=>!task.title));
  assert.equal(state.photoFinds['team-1']['stage-b'].P02.status,'approved');
  await assert.rejects(run(state,player,{type:'submit',kind:'photo',photoSlot:'P03',regionId:'stage-b',media}),/REGION_NOT_UNLOCKED/);
  const direct=await run(state,player,{type:'submit',kind:'task',taskId:'team-3-D01',regionId:'stage-c',media});
  await run(state,staff,{type:'review',submissionId:direct.submission.id,result:'approve'});
  assert.equal(stateView(state,player).team.score,5);
});
