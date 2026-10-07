import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile, FileBlob } from '@oai/artifact-tool';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const outDir = decodeURIComponent(dir);
if(process.argv.includes('--roster-adjust') || process.argv.includes('--review-roster')) {
 const source=path.join(outDir,'HRG125项任务_正式积分与Bingo对应.xlsx');
 const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(source));
 const main=wb.worksheets.getItem('任务总表'),policy=wb.worksheets.getItem('积分规则'),boards=wb.worksheets.getItem('Bingo对照'),photos=wb.worksheets.getItem('图片索引');
 const original=main.getRange('A7:AD131').values;
 const oldImages=photos.getRange('A7:G63').values;
 if(process.argv.includes('--review-roster')) {
  console.log((await wb.inspect({kind:'table',range:'积分规则!A17:H36',include:'values,formulas',tableMaxRows:20,tableMaxCols:8,maxChars:3000})).ndjson);
  const png=await wb.render({sheetName:'积分规则',range:'A17:H36',format:'png',scale:1.1});await fs.writeFile(path.join(outDir,'roster-before.png'),new Uint8Array(await png.arrayBuffer()));
  process.exit(0);
 }
 const input=JSON.parse(await fs.readFile(path.join(outDir,'roster-adjustment-inputs.json'),'utf8'));
 const baseline=JSON.parse(await fs.readFile(path.join(outDir,'bingo-score-plan.json'),'utf8'));
 const players=input.teams.flatMap(t=>t.members);
 if(players.length!==17||new Set(players).size!==17||input.teams.length!==5)throw new Error('Roster validation');
 const n=wb.worksheets.add('人数调整');n.showGridLines=false;n.tabColor='#527591';
 n.getRange('A1:O90').format.font={name:'Microsoft YaHei',size:11,color:'#1F2937'};
 n.getRange('A1:O90').format.verticalAlignment='center';
 const band=(row,labels)=>{n.getRange(`A${row}`).write([labels]);const end=String.fromCharCode(64+labels.length);n.getRange(`A${row}:${end}${row}`).format={fill:'#284766',font:{name:'Microsoft YaHei',size:11,bold:true,color:'#FFFFFF'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:42};};
 const wide=(row,text,end='H',height=42)=>{n.getRange(`A${row}:${end}${row}`).merge();n.getRange(`A${row}`).values=[[text]];n.getRange(`A${row}:${end}${row}`).format.wrapText=true;n.getRange(`A${row}:${end}${row}`).format.rowHeight=height;};
 n.getRange('A2:H2').merge();n.getRange('A2').values=[['17 人分组 · 人数校正与结算']];n.getRange('A2').format.font={name:'Microsoft YaHei',size:17,bold:true,color:'#284766'};n.getRange('A2:H2').format.rowHeight=34;
 wide(4,'五队共17人：4／3／3／4／3。五张棋盘对所有队伍开放，按实际提交队伍校正TASK基础分；不会按所选棋盘主题决定系数。', 'H',36);
 wide(5,'人数参数为新策划稿，尚未回写正式配置或正在运行的比赛。队员姓名仅作名单，不据此推断水平；来源为本轮用户提供的17人名单。','H',36);
 band(7,['队伍','人数','TASK系数','每缺1次下蹲扣分','成员名单','下蹲全员零次最大罚分','跨棋盘15项最高基础实领','最多落地脚']);
 input.teams.forEach((team,i)=>{
  const row=8+i;
  n.getRange(`A${row}:H${row}`).values=[[team.name,team.members.length,null,null,team.members.join('、'),null,null,null]];
  n.getRange(`C${row}`).formulas=[[`=IF(B${row}=$B$17,1,IF(B${row}=4,$B$18,NA()))`]];
  n.getRange(`D${row}`).formulas=[[`=$B$20*$B$17/B${row}`]];
  n.getRange(`F${row}`).formulas=[[`=-B${row}*$B$21*D${row}`]];
  n.getRange(`G${row}`).formulas=[[`=ROUND($B$26*C${row},$B$19)`]];
  n.getRange(`H${row}`).formulas=[[`=B${row}`]];
 });
 n.getRange('A8:H12').format.wrapText=true;n.getRange('A8:H12').format.rowHeight=52;n.getRange('C8:C12').setNumberFormat('0.00');n.getRange('D8:D12').setNumberFormat('0.00');n.getRange('F8:G12').setNumberFormat('0;[Red](0);"—"');n.getRange('B8:B12').format.fill='#FFF2D8';
 n.getRange('B8:B12').dataValidation={rule:{type:'list',values:['3','4']}};
 n.getRange('A13:B13').values=[['总人数',null]];n.getRange('B13').formulas=[['=SUM(B8:B12)']];
 band(16,['计算参数','数值','参数含义']);
 n.getRange('A17:C28').values=[
  ['基准队伍人数',input.referenceTeamSize,'所有人数敏感规则以3人队为参照。'],
  ['四人队普通TASK系数',null,'从理论0.909取到一位小数为0.90；不乘完赛奖励或固定事件奖惩。'],
  ['TASK保留小数位',input.taskScorePrecision,'逐笔四舍五入，不按整场总分二次乘系数。'],
  ['三人队每少一次下蹲罚分',input.squatBasePenalty,'下蹲实扣=缺次×25×3/队伍人数；该系数独立于TASK系数。'],
  ['每人要求下蹲次数',input.squatRepsPerMember,'全员实际参加；不通过挑3人规避全员要求。'],
  ['可随人数扩展的效率份额',input.scalableEffortShareAssumption,'策划假设30%的效率受检索、分工、替补影响；不是实测成功率。'],
  ['四人队未取整系数',null,'1 / (1 + 30% × (4/3−1))。对单人谱面不直接使用3/4的惩罚系数。'],
  ['全部125项任务中位底分',null,'中位数只用于说明分差量级，不等于预计完成分。'],
  ['跨棋盘最低15项底分',null,'忽略抢占、路线与成功率的低值组合边界。'],
  ['跨棋盘最高15项底分',null,'忽略抢占、路线与成功率的高值组合边界。'],
  ['第一名与第五名奖励差',null,'完赛名次奖励统一1000/750/500/300/100，不按人数缩放。'],
  ['三人队TASK系数',1,'三人队逐笔按底分全额计入TASK账本。']
 ];
 n.getRange('B18').formulas=[['=ROUND(B23,1)']];n.getRange('B23').formulas=[['=1/(1+B22*(4/B17-1))']];n.getRange('B24').formulas=[["=MEDIAN('任务总表'!H7:H131)"]];n.getRange('B25').formulas=[['=SUM(B72:B86)']];n.getRange('B26').formulas=[['=SUM(C72:C86)']];n.getRange('B27').formulas=[["='积分规则'!B18-'积分规则'!B22"]];
 n.getRange('C17:H28').format.wrapText=true;for(let row=17;row<=28;row++)n.getRange(`C${row}:H${row}`).merge();n.getRange('A17:H28').format.rowHeight=40;
 n.getRange('B18').setNumberFormat('0.00');n.getRange('B22').setNumberFormat('0%');n.getRange('B23').setNumberFormat('0.000');
 for(const row of [17,19,20,21,22,28])n.getRange(`B${row}`).format.fill='#FFF2D8';
 wide(30,'原来的800/600/400/250/100改为1000/750/500/300/100。相邻差250/250/200/200，首末差900。以底分2200为例，四人第一名2980、三人第二名2950，早到仍领先30；三人第二名多拿50底分即可反超20。','H',48);
 band(33,['比较案例','甲人数','甲TASK底分','甲系数','甲事件净分','甲完赛名次','甲总分','乙人数','乙TASK底分','乙系数','乙事件净分','乙完赛名次','乙总分','甲−乙','结论']);
 const scenarios=[
  ['四人先到仍胜同底分三人队',4,2200,null,0,1,null,3,2200,null,0,2],
  ['三人队多50底分反超先到四人队',4,2200,null,0,1,null,3,2250,null,0,2],
  ['第5名用任务分反超第1名',4,2200,null,0,1,null,3,2900,null,0,5],
  ['同为3人，第二名多300底分反超',3,2200,null,0,1,null,3,2500,null,0,2],
  ['转移100缩小前二差，早到仍领先',3,2200,null,-100,1,null,3,2200,null,100,2],
  ['相同最重下蹲罚分仍可改变胜负',4,2200,null,-1500,1,null,3,2200,null,0,5]
 ];
 n.getRange('A34:L39').values=scenarios;
 for(let row=34;row<=39;row++){
  n.getRange(`D${row}`).formulas=[[`=IF(B${row}=$B$17,$B$28,$B$18)`]];n.getRange(`J${row}`).formulas=[[`=IF(H${row}=$B$17,$B$28,$B$18)`]];
  n.getRange(`G${row}`).formulas=[[`=ROUND(C${row}*D${row},$B$19)+E${row}+INDEX('积分规则'!$B$18:$B$22,F${row})`]];
  n.getRange(`M${row}`).formulas=[[`=ROUND(I${row}*J${row},$B$19)+K${row}+INDEX('积分规则'!$B$18:$B$22,L${row})`]];
  n.getRange(`N${row}`).formulas=[[`=G${row}-M${row}`]];n.getRange(`O${row}`).formulas=[[`=IF(N${row}>0,"甲领先",IF(N${row}<0,"乙反超","同分，按同分规则"))`]];
 }
 n.getRange('A34:O39').format.wrapText=true;n.getRange('A34:O39').format.rowHeight=52;n.getRange('D34:D39').setNumberFormat('0.00');n.getRange('J34:J39').setNumberFormat('0.00');
 band(42,['调整项目','执行口径']);
 const rules=[
  ['普通任务基础分','底分×实际提交队伍系数，逐笔四舍五入到1位小数。所有125项都使用同一结算原则；四人队极难实领360，三人队400。'],
  ['题面与固定奖惩','Random3额外+50、ARC每失败−50，能力卡±5、−50、−100、转移100全部保持。不能把整场总分乘0.90。'],
  ['任务重演','最近一次实际TASK账本金额×50%；例如70底分四人实领63，重演31.5；不再重复乘0.90。'],
  ['下蹲（卡6）','实扣＝缺少总次数×25×3/实际队伍人数。三人每缺25、四人每缺18.75；全员未做均−1500。违规各自计数，不额外叠加TASK系数。'],
  ['三足限制（卡7）','三人队最多3只脚落地（少于4）；四人队最多4只脚落地（少于5）。持续5分钟、违规−5保持。'],
  ['固定三人参与的卡','昵称拼词（卡20）和圆周率（卡21）都限定选出的3名实际参与者；四人队第四人不补答。原三人队全员参加。'],
  ['人数与身份','系数绑定实际队伍，不绑定棋盘。所有人仍属同一队共享名额、能力库存和定位；本方案不授权拆队跨地区并行或增加每区名额。'],
  ['后端与历史','当前正式v1未接入人数系数。应用本稿须在未开赛配置中加入逐队系数、下蹲人数校正和卡7阈值；保留TASK实领快照供重演读取。已计分账本不自动回算。'],
  ['当前成员变动','本稿按用户确认的4/3/3/4/3锁定人数。退赛、迟到、换队须由工作人员统一确认是否修改后续参数，不由客户端临时改人数。'],
  ['最终同分规则','仍按总积分→实际TASK实领积分→完赛确认时间比较。人数校正后的TASK数值用于第二顺位。'],
  ['公平性依据','30%可扩展份额与0.90属于缺少实测时的保守策划选择。姓名不能提供技术水平信息；未知熟练度、设备数与分工效率不伪装成测量结果。']
 ];
 n.getRange('A43:B53').values=rules;for(let row=43;row<=53;row++)n.getRange(`B${row}:H${row}`).merge();n.getRange('A43:H53').format.wrapText=true;n.getRange('A43:H53').format.rowHeight=56;
 band(57,['四人队系数敏感性','四人第1名（底分2200）','三人第2名（底分2200）','前者−后者']);
 n.getRange('A58:A60').values=[[0.85],[input.fourPlayerTaskCoefficient],[1]];
 for(let row=58;row<=60;row++)n.getRange(`B${row}:D${row}`).formulas=[[`=ROUND(2200*A${row},$B$19)+'积分规则'!$B$18`,`=2200+'积分规则'!$B$19`,`=B${row}-C${row}`]];
 n.getRange('A58:A60').setNumberFormat('0.00');n.getRange('A58:D60').format.rowHeight=30;
 wide(62,'这些是分差敏感性，不是胜率。0.85会让本例先到四人队仍落后80，1.00则完全不校正人数，0.90使早到领先30。若活动强制同队只允许一个任务同时执行，额外人数优势会缩小，应据实复核系数。','H',52);
 wide(64,'所有125项题面、任务ID、照片编号和格位保持原样；主表AE:AI列逐项列出五队基础实领金额。Bingo棋盘继续显示共享底分，不把“主题棋盘”错误当成唯一可领取队伍。','H',48);
 band(66,['逐笔结算示例','三人队','四人队']);
 n.getRange('A67:A69').values=[['70底分普通TASK实领'],['上项TASK重演奖励（50%）'],['全员各少2次下蹲的罚分']];
 n.getRange('B67:C67').formulas=[['=ROUND(70*$B$28,$B$19)','=ROUND(70*$B$18,$B$19)']];
 n.getRange('B68:C68').formulas=[['=B67*0.5','=C67*0.5']];
 n.getRange('B69:C69').formulas=[['=-3*2*$B$20','=-4*2*$B$20*$B$17/4']];
 n.getRange('B67:C69').setNumberFormat('0.0;[Red](0.0);"—"');n.getRange('A67:C69').format.rowHeight=35;n.getRange('A67:A69').format.wrapText=true;
 band(71,['排序位次','全局低值15项','全局高值15项']);n.getRange('A72:A86').values=Array.from({length:15},(_,i)=>[i+1]);
 n.getRange('B72:C86').formulas=Array.from({length:15},(_,i)=>[`=SMALL('任务总表'!$H$7:$H$131,A${72+i})`,`=LARGE('任务总表'!$H$7:$H$131,A${72+i})`]);
 for(const [col,width]of [['A',200],['B',100],['C',120],['D',115],['E',385],['F',125],['G',140],['H',110],['I',115],['J',100],['K',110],['L',110],['M',120],['N',100],['O',150]])n.getRange(`${col}1:${col}86`).format.columnWidthPx=width;
 n.freezePanes.freezeRows(7);
 // The shared task prices and image assignments stay unchanged; five payment columns are new outputs.
 main.tables.items[0].delete();main.getRange('AE6:AI6').values=[input.teams.map(t=>`${t.name}（${t.members.length}人）基础实领`)];
 for(let i=0;i<5;i++){
  const col=['AE','AF','AG','AH','AI'][i],rosterRow=8+i;
  main.getRange(`${col}7:${col}131`).formulas=Array.from({length:125},(_,j)=>[`=ROUND(H${j+7}*'人数调整'!$C$${rosterRow},'人数调整'!$B$19)`]);
  main.getRange(`${col}1:${col}131`).format.columnWidthPx=145;
 }
 main.tables.add('A6:AI131',true,'ChallengeTasks').showFilterButton=true;
 main.getRange('AE6:AI6').format={fill:'#284766',font:{name:'Microsoft YaHei',size:11,bold:true,color:'#FFFFFF'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:50};
 main.getRange('AE7:AI131').format={font:{name:'Microsoft YaHei',size:11,color:'#184E77'},horizontalAlignment:'right',verticalAlignment:'center',numberFormat:'0.0'};
 for(let i=0;i<125;i++)main.getRange(`AE${i+7}:AI${i+7}`).format.fill=i%2===0?'#E8F0F8':'#F3F6FA';
 main.getRange('A2').values=[['HRG 125 项任务 · 17人调整']];main.getRange('F3').values=[['共享底分不变；实际提交队伍：四人0.90、三人1.00；五队实领金额见AE:AI列。']];main.getRange('F4').values=[['完赛1000/750/500/300/100；题面固定奖惩不缩放。成员名单与人数敏感能力规则见“人数调整”。']];
 main.getRange('K6').values=[['无校正底分＋达标奖励']];main.getRange('AC6').values=[['三人队重演奖励']];
 policy.getRange('A3').values=[['17人调整策划稿；共享底分和图片映射保留，人数结算与新完赛参数尚未回写线上赛局。']];
 policy.getRange('B18:B22').values=input.finishRewards.map(p=>[p]);
 policy.getRange('B17').values=[['17人调整奖励']];
 policy.getRange('C7').values=[['共享底分400；实际三人队400、四人队360，仍为每主题中心D03。']];
 policy.getRange('C12').values=[['卡12读取最近实际TASK实领金额的一半；四人校正不重复乘，保留小数。']];
 policy.getRange('C54').values=[['人数调整：每缺25×3/人数，三人25、四人18.75；最重均−1500。卡7最多落地脚=人数，细则见人数调整页。']];
 policy.getRange('B66').values=[['普通TASK底分×提交队伍系数 + 题面奖励 − 题面罚分 + 事件/能力净变动 + 统一完赛名次奖励；逐笔留账。']];
 policy.getRange('B73').values=[['新人数参数待接入；当前正式v1仍使用原计分。需逐队TASK系数、卡6人数校正、卡7阈值；既有赛局不自动改价。']];
 policy.getRange('A77').values=[['比较案例（以下均3人队）']];
 policy.getRange('A80').values=[['第5名凭跨棋盘3300底分反超']];policy.getRange('F80').values=[[3300]];
 policy.getRange('A81').values=[['转移100缩小前二差，未完全抹平']];
 policy.getRange('A85').values=[['三人队1000/750/500/300/100，首末差900、相邻200–250；上表均按三人队金额。四人队只对TASK底分乘0.90，固定事件与完赛奖励不缩放，详见人数调整页。交换总分或最多−1500下蹲罚分仍可能改变个别赛局；这些是可核算案例，不是胜率预测。']];
 policy.getRange('A148').values=[['本页排序按共享底分；实际人数系数与跨棋盘边界见人数调整页。H与AD原4000主题预算保持；四人队TASK实领0.90、三人1.00。上表各案例底分均能由全部125项中的至多15项组成，3300不限定单一主题。']];
 boards.getRange('A3').values=[['此页显示公共底分，五队均可跨棋盘领取。实际基础分按提交队伍系数（三人1.00、四人0.90），题面奖惩另计。D无需图片，P按区域换图；具体五队实领见任务总表AE:AI。']];
 for(let i=0;i<5;i++){const row=6+i*10,game=['Phigros','Arcaea','范式起源','maimai','通用'][i];boards.getRange(`A${row}`).values=[[`${game}主题棋盘 | 共享底分池4000 · 极难底分400 · 19图寻/6直接`]];}
 // Verify the added count/efficiency controls really recalculate the existing payment outputs, then restore the supplied roster.
 n.getRange('B8').values=[[3]];
 if(n.getRange('C8').values[0][0]!==1||n.getRange('D8').values[0][0]!==25||main.getRange('AE7').values[0][0]!==90)throw new Error('Headcount recalculation');
 n.getRange('B8').values=[[4]];
 n.getRange('B22').values=[[0.15]];
 if(n.getRange('B18').values[0][0]!==1||main.getRange('AE7').values[0][0]!==90)throw new Error('Assumption recalculation');
 n.getRange('B22').values=[[input.scalableEffortShareAssumption]];
 wb.recalculate();
 if(JSON.stringify(main.getRange('A7:AD131').values)!==JSON.stringify(original))throw new Error('Shared tasks changed');
 if(JSON.stringify(photos.getRange('A7:G63').values)!==JSON.stringify(oldImages))throw new Error('Images changed');
 const adjustedTasks=baseline.tasks.map((t,i)=>{
  if(main.getRange(`L${i+7}`).values[0][0]!==t.taskId)throw new Error('Baseline ID order');
  const payments=Object.fromEntries(input.teams.map(team=>[team.id,Math.round(t.score*(team.members.length===4?input.fourPlayerTaskCoefficient:1)*10)/10]));
  for(let j=0;j<5;j++)if(main.getRange(`${['AE','AF','AG','AH','AI'][j]}${i+7}`).values[0][0]!==payments[input.teams[j].id])throw new Error('Payment formula mismatch');
  return {...t,payments};
 });
 const expected=[30,-20,-20,-50,50,-820];for(let i=0;i<6;i++)if(n.getRange(`N${i+34}`).values[0][0]!==expected[i])throw new Error('New scenario mismatch');
 const oldExpected=[250,-50,-200,50,250,-100];for(let i=0;i<6;i++)if(policy.getRange(`J${i+78}`).values[0][0]!==oldExpected[i])throw new Error('Old scenario mismatch');
 for(let i=0;i<5;i++)if(n.getRange(`F${i+8}`).values[0][0]!==-1500)throw new Error('Squat maxima mismatch');
 if(n.getRange('B13').values[0][0]!==17)throw new Error('Roster total mismatch');
 console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#N/A|#NAME\\?|#NUM!',options:{useRegex:true},summary:'人数调整最终公式扫描',maxChars:800})).ndjson);
 const plan={...baseline,schema:'hrg-scoring-roster17-proposal',status:input.status,version:input.version,rules:{...baseline.rules,finishRewards:input.finishRewards},rosterAdjustment:input,tasks:adjustedTasks};
 await fs.writeFile(path.join(outDir,'bingo-score-plan-roster17.json'),JSON.stringify(plan,null,2));
 const renders=[['roster-summary','人数调整','A2:H30'],['roster-scenarios','人数调整','A33:O39'],['roster-payments','任务总表','AD6:AI15'],['roster-policy','积分规则','A17:H22']];
 for(const [name,sheetName,range]of renders){const image=await wb.render({sheetName,range,scale:1.15,format:'png'});await fs.writeFile(path.join(outDir,name+'.png'),new Uint8Array(await image.arrayBuffer()));}
 const file=path.join(outDir,'HRG125项任务_17人分组调整.xlsx');await(await SpreadsheetFile.exportXlsx(wb)).save(file);
 console.log(JSON.stringify({saved:file,players:17,taskPaymentValues:625,sourceTasksPreserved:125,coefficients:input.teams.map(t=>[t.name,t.members.length,t.members.length===4?0.9:1]),finishRewards:input.finishRewards,squatMax:1500,scenarios:expected}));
 process.exit(0);
}
if(process.argv.includes('--score-tasks') || process.argv.includes('--plan-only')) {
 const root=path.resolve(outDir,'../..');
 const records=JSON.parse(await fs.readFile(path.join(outDir,'integrated-data.json'),'utf8'));
 const inputs=JSON.parse(await fs.readFile(path.join(outDir,'score-inputs.json'),'utf8'));
 const slots=['D01','P02','P19','P05','P11','P04','P17','D02','P12','P01','P13','P14','D03','P16','D04','P18','D05','P06','P08','P10','P07','P03','P15','D06','P09'];
 const teams={Phigros:['team-1','PHI',[22,24,9,25,21,23]],Arcaea:['team-2','ARC',[16,25,12,15,23,21]],maimai:['team-4','MAI',[1,9,16,24,22,20]],'范式起源':['team-3','PAR',[6,7,23,21,25,22]],'通用':['team-5','ALL',[6,17,21,24,22,25]]};
 const anchors={'易':80,'中':130,'难':190,'极难':350};
 const regions=[['stage-a',1,'西湖文化广场'],['stage-b',2,'武林广场'],['stage-c',3,'龙翔桥']];
 const finish=[800,600,400,250,100];
 const boardBudget=4000,extremePoints=400,photoPremium=20,taskLimit=5;
 for(const r of records){
  const input=inputs[r.game][r.n-1],team=teams[r.game];
  if(!input||!team)throw new Error('Missing input');
  const [minutes,coop,variance,reason]=input;
  Object.assign(r,{teamId:team[0],taskId:team[1]+String(r.n).padStart(2,'0'),minutes,coop,variance,reason,anchor:anchors[r.difficulty],timePremium:minutes<=2?0:minutes<=5?10:minutes<=10?30:minutes<=15?50:70,type:team[2].includes(r.n)?'直接':'图寻'});
  r.photoPremium=r.type==='图寻'?photoPremium:0;
  r.raw=r.anchor+r.timePremium+r.coop+r.variance+r.photoPremium;
  r.bonus=r.game==='Phigros'&&r.n===21?50:0;
  r.penalty=r.game==='Arcaea'&&[4,11].includes(r.n)?50:0;
 }
 const groups=[];
 let seed=20261007; const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 for(const [game,team]of Object.entries(teams)){
  const tasks=records.filter(r=>r.game===game),normal=tasks.filter(r=>r.difficulty!=='极难');
  const coefficient=(boardBudget-extremePoints)/normal.reduce((a,r)=>a+r.raw,0);
  for(const r of tasks){r.coefficient=r.difficulty==='极难'?null:coefficient;r.score=r.difficulty==='极难'?extremePoints:Math.floor(r.raw*coefficient/10)*10;}
  let remaining=boardBudget-tasks.reduce((a,r)=>a+r.score,0);
  const order=[...normal].sort((a,b)=>(b.raw*coefficient-b.score)-(a.raw*coefficient-a.score)||a.n-b.n);
  for(let i=0;remaining>0;i++,remaining-=10)order[i%order.length].score+=10;
  const allocation=slots.map(slot=>slot.startsWith('D')?tasks.find(r=>r.n===team[2][Number(slot.slice(1))-1]):null);
  const photoTasks=tasks.filter(r=>r.type==='图寻'),positions=slots.map((s,i)=>s.startsWith('P')?i:-1).filter(i=>i>=0);
  positions.forEach((p,i)=>allocation[p]=photoTasks[i]);
  const objective=board=>{
   const row=Array(5).fill(0),col=Array(5).fill(0);
   board.forEach((r,i)=>{row[Math.floor(i/5)]+=r.score;col[i%5]+=r.score;});
   return row.concat(col).reduce((a,v)=>a+(v-boardBudget/5)**2,0);
  };
  let best=allocation.slice(),bestLoss=objective(best),loss=bestLoss;
  for(let i=0;i<30000;i++){
   const a=positions[Math.floor(random()*19)],b=positions[Math.floor(random()*19)];
   if(a===b)continue;
   [allocation[a],allocation[b]]=[allocation[b],allocation[a]];
   const next=objective(allocation),temperature=5000*(1-i/30000)+1;
   if(next<loss||random()<Math.exp((loss-next)/temperature)){loss=next;if(next<bestLoss){best=allocation.slice();bestLoss=next;}}
   else [allocation[a],allocation[b]]=[allocation[b],allocation[a]];
  }
  best.forEach((r,i)=>{
   r.slot=slots[i];r.cellIndex=i+1;r.cellId=r.teamId+':'+r.slot;r.row=Math.floor(i/5)+1;r.col=i%5+1;
   r.photoNo=r.type==='图寻'?Number(r.slot.slice(1)):null;
   r.images=regions.map((reg)=>r.type==='图寻'?`public/images/photo-clues/region-${reg[1]}/${r.slot.slice(1)}.png`:null);
   r.imageKeys=regions.map(reg=>r.type==='图寻'?`${reg[0]}:${r.slot}`:null);
  });
  const sorted=tasks.map(r=>r.score).sort((a,b)=>a-b),sum=a=>a.reduce((x,y)=>x+y,0);
  const rows=Array(5).fill(0),cols=Array(5).fill(0);best.forEach((r,i)=>{rows[Math.floor(i/5)]+=r.score;cols[i%5]+=r.score;});
  groups.push({game,teamId:team[0],coefficient,total:sum(sorted),median:sorted[12],bottom15:sum(sorted.slice(0,15)),top15:sum(sorted.slice(10)),photoCount:tasks.filter(r=>r.type==='图寻').length,directCount:tasks.filter(r=>r.type==='直接').length,rows,cols,min:sorted[0],max:sorted[24]});
 }
 for(const r of records)for(const f of r.images.filter(Boolean))await fs.access(path.join(root,f));
 if(records.length!==125||new Set(records.map(r=>r.taskId)).size!==125||new Set(records.map(r=>r.cellId)).size!==125)throw new Error('125 mapping failure');
 for(const g of groups)if(g.total!==4000||g.photoCount!==19||g.directCount!==6||g.max!==400)throw new Error('Board validation');
 const allScores=records.map(r=>r.score).sort((a,b)=>a-b);
 const globalBottom15=allScores.slice(0,15).reduce((a,b)=>a+b,0),globalTop15=allScores.slice(-15).reduce((a,b)=>a+b,0);
 const plan={schema:'hrg-scoring-design-v1',status:'已接入正式配置hrg-20261007-v1；线上生效以部署与赛局配置为准',rules:{boardBudget,extremePoints,photoPremium,taskLimit,regionCount:3,maximumOrdinaryTaskAwardsPerTeam:15,globalBottom15,globalTop15,finishRewards:finish,anchors,timeBands:[[2,0],[5,10],[10,30],[15,50],[999,70]],roundingStep:10,boardLineBonus:0,ordinaryTaskFailurePenalty:0},groups,tasks:records};
 await fs.writeFile(path.join(outDir,'bingo-score-plan.json'),JSON.stringify(plan,null,2));
 console.log(JSON.stringify({groups,top15Spread:Math.max(...groups.map(g=>g.top15))/Math.min(...groups.map(g=>g.top15))-1,uniqueImages:new Set(records.flatMap(r=>r.images).filter(Boolean)).size}));
 if(process.argv.includes('--plan-only'))process.exit(0);
 const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(outDir,'HRG挑战任务汇总_任务命名版.xlsx')));
 const main=wb.worksheets.getItem('任务总表');
 const original=main.getRange('A7:G131').values;
 const oldAudit=main.getRange('I2:K19').values;
 main.getRange('H1:K131').clear({applyTo:'all'});
 main.tables.items[0].delete();
 const policy=wb.worksheets.add('积分规则'),boards=wb.worksheets.add('Bingo对照'),photos=wb.worksheets.add('图片索引');
 for(const sheet of [policy,boards,photos]){
  sheet.showGridLines=false;sheet.tabColor='#284766';
  sheet.getRange('A1:M150').format.font={name:'Microsoft YaHei',size:11,color:'#1F2937'};
  sheet.getRange('A1:M150').format.verticalAlignment='center';
 }
 const headers=['基础积分','题面额外加分','题面失败扣分/次','首次无失败含达标奖励','唯一任务 ID','主题棋盘 ID','Bingo 格位','棋盘坐标','图号','西湖文化广场图片','武林广场图片','龙翔桥图片','逐项定价依据','估计单次耗时/分钟','技能基准','时间附加','协作附加','不确定性附加','图寻附加','原始权重','主题系数','重演基础奖励','取整补分'];
 main.getRange('H6:AD6').values=[headers];
 const extra=records.map(r=>[null,r.bonus,r.penalty,null,r.taskId,r.teamId,r.slot,`第${r.row}行第${r.col}列`,r.photoNo??'无需图片',...r.images.map(f=>f??'直接任务，无需图片'),r.reason,r.minutes,r.anchor,r.timePremium,r.coop,r.variance,r.photoPremium,null,r.coefficient??'极难固定400',null,r.difficulty==='极难'?0:r.score-Math.floor(r.raw*r.coefficient/10)*10]);
 main.getRange('H7:AD131').values=extra;
 main.getRange('H7:H131').formulas=records.map((r,i)=>[`=IF(D${i+7}="极难",'积分规则'!$B$7,INT(AA${i+7}*AB${i+7}/'积分规则'!$B$14)*'积分规则'!$B$14+AD${i+7})`]);
 for(let i=0;i<records.length;i++)if(records[i].difficulty!=='极难')main.getRange(`AB${i+7}`).formulas=[[`='积分规则'!G${29+groups.findIndex(g=>g.game===records[i].game)}`]];
 main.getRange('K7:K131').formulas=records.map((r,i)=>[`=H${i+7}+I${i+7}`]);
 main.getRange('AA7:AA131').formulas=records.map((r,i)=>[`=SUM(V${i+7}:Z${i+7})`]);
 main.getRange('AC7:AC131').formulas=records.map((r,i)=>[`=H${i+7}*'积分规则'!$B$12`]);
 main.tables.add('A6:AD131',true,'ChallengeTasks').showFilterButton=true;
 main.getRange('A2').values=[['HRG 125 项任务积分表']];
 main.getRange('F3').values=[['五主题各25格；19图寻+6直接；各主题分池4000，极难400。所有队伍均可跨棋盘做任务。']];
 main.getRange('F4').values=[['题面奖惩单列；区域换图不重置任务归属。详细规则、五队棋盘及 57 张图片见右侧页签。']];
 main.getRange('H6:AD6').format={fill:'#284766',font:{name:'Microsoft YaHei',size:11,bold:true,color:'#FFFFFF'},wrapText:true,verticalAlignment:'center',horizontalAlignment:'center',rowHeight:50};
 main.getRange('H7:AD131').format.font={name:'Microsoft YaHei',size:11,color:'#1F2937'};
 main.getRange('H7:AD131').format.wrapText=true;
 for(let i=0;i<125;i++)main.getRange(`H${i+7}:AD${i+7}`).format.fill=i%2===0?'#FFFFFF':'#F3F6FA';
 main.getRange('H7:H131').format={fill:'#E8F0F8',font:{name:'Microsoft YaHei',size:12,bold:true,color:'#184E77'},horizontalAlignment:'right'};
 main.getRange('I7:J131').setNumberFormat('0;[Red](0);"—"');
 main.getRange('H7:H131').setNumberFormat('0');main.getRange('K7:K131').setNumberFormat('0');main.getRange('U7:AA131').setNumberFormat('0');main.getRange('AB7:AB131').setNumberFormat('0.000');main.getRange('AC7:AC131').setNumberFormat('0.0');
 for(const [col,width]of [['H',95],['I',100],['J',110],['K',150],['L',100],['M',95],['N',95],['O',120],['P',100],['Q',345],['R',345],['S',345],['T',400],['U',110],['V',100],['W',100],['X',100],['Y',110],['Z',100],['AA',100],['AB',100],['AC',110],['AD',100]])main.getRange(`${col}1:${col}131`).format.columnWidthPx=width;
 main.freezePanes.freezeRows(6);main.freezePanes.freezeColumns(5);
 const title=(s,text)=>{s.getRange('A2').values=[[text]];s.getRange('A2:H2').merge();s.getRange('A2').format.font={name:'Microsoft YaHei',size:18,bold:true,color:'#284766'};s.getRange('A2:H2').format.rowHeight=36;};
 const heading=(s,row,labels)=>{s.getRange(`A${row}`).write([labels]);s.getRange(`A${row}:${String.fromCharCode(64+labels.length)}${row}`).format={fill:'#284766',font:{name:'Microsoft YaHei',size:11,bold:true,color:'#FFFFFF'},rowHeight:32,wrapText:true};};
 title(policy,'积分规则与名次影响');
 policy.getRange('A3:H3').merge();policy.getRange('A3').values=[['正式配置hrg-20261007-v1已接入源码；新赛局默认载入，已开赛历史赛局不自动改价。']];
 heading(policy,5,['参数','数值','口径']);
 const params=[['每主题25格基础分池',boardBudget,'预算约束；所有队伍可跨棋盘做任务，不是参赛队伍的得分上限。'],['单个极难任务',extremePoints,'每主题一个；固定400，直接置于D03中心格。'],['每区普通计分任务上限',taskLimit,'沿用项目规则；三地区合计最多15项普通任务计分。'],['区域数',3,'西湖文化广场 → 武林广场 → 龙翔桥。'],['Bingo连线额外分',0,'活动文案未定义连线奖励，本策划不新增。'],['普通任务失败默认扣分',0,'仅题面写明或事件能力卡指定时扣分；普通打回不扣。'],['重演奖励比例',0.5,'卡12沿用最近一次实际TASK账本积分的一半；不是含其他事件后的总分。'],['图寻权重附加',20,'反映复刻证据成本；包含在基础分内，不另发第二份。'],['基础分取整单位',10,'按主题系数分配，向下取整后按余数从大到小补10。']];
 policy.getRange('A6:C14').values=params;
 policy.getRange('A6:C14').format.wrapText=true;policy.getRange('A6:C14').format.rowHeight=42;policy.getRange('B6:B14').setNumberFormat('0.0');
 heading(policy,17,['完赛名次','正式奖励','较下一名优势']);
 policy.getRange('A18:B22').values=finish.map((p,i)=>[i+1,p]);
 policy.getRange('C18:C21').formulas=finish.slice(0,4).map((p,i)=>[`=B${i+18}-B${i+19}`]);policy.getRange('C22').values=[['最后一名仍有完赛奖励']];
 policy.getRange('A24:H25').merge();policy.getRange('A24').values=[['末区域审核通过、本队待审证据及能力效果结清后，工作人员按有效完赛确认顺序发奖。确实同时抵达须同批勾选，平分占用名次奖励，下一名跳位；未完赛不给奖励。相同服务器毫秒不自动并列。']];policy.getRange('A24:H25').format.wrapText=true;policy.getRange('A24:H25').format.rowHeight=34;
 heading(policy,28,['主题','25格总分','主题内低值15项','主题内高值15项','单格中位数','图寻/直接','非极难系数','高值组合偏差']);
 groups.forEach((g,i)=>{
  const row=29+i,start=records.findIndex(r=>r.game===g.game)+7,end=start+24;
  policy.getRange(`A${row}:H${row}`).values=[[g.game,null,g.bottom15,g.top15,g.median,`${g.photoCount}/${g.directCount}`,g.coefficient,null]];
  policy.getRange(`B${row}`).formulas=[[`=SUM('任务总表'!H${start}:H${end})`]];
  policy.getRange(`G${row}`).formulas=[[`=($B$6-$B$7)/SUMIF('任务总表'!D${start}:D${end},"<>极难",'任务总表'!AA${start}:AA${end})`]];
  const sortedCol=String.fromCharCode(66+i);
  policy.getRange(`C${row}`).formulas=[[`=SUM(${sortedCol}122:${sortedCol}136)`]];
  policy.getRange(`D${row}`).formulas=[[`=SUM(${sortedCol}132:${sortedCol}146)`]];
  policy.getRange(`E${row}`).formulas=[[`=MEDIAN('任务总表'!H${start}:H${end})`]];
  policy.getRange(`H${row}`).formulas=[[`=D${row}/AVERAGE($D$29:$D$33)-1`]];
 });
 policy.getRange('G29:G33').setNumberFormat('0.000');policy.getRange('H29:H33').setNumberFormat('0.0%');
 policy.getRange('F29:F33').format.horizontalAlignment='center';
 policy.getRange('A35:H36').merge();policy.getRange('A35').values=[[`上表仅为各主题内部组合。所有队伍可跨125项取任务：全局最低15项${globalBottom15}分，最高15项${globalTop15}分；忽略抢占、耗时和路线，不代表成功率或实际成绩。耗时为策划估计，不含寻图、排队和重试，未经现场校准。`]];policy.getRange('A35:H36').format.wrapText=true;policy.getRange('A35:H36').format.rowHeight=32;
 heading(policy,39,['定价步骤','规则']);
 const pricing=[['1 技能基准','易80 / 中130 / 难190 / 极难350；沿用既有难度标签。'],['2 时间附加','≤2分钟0；≤5分钟10；≤10分钟30；≤15分钟50；>15分钟70。'],['3 协作附加','0/10/20/30：单目标；附加证据；双人或多条件；多任务同步/三人组织。'],['4 不确定性','0/10/20：自选稳定；控分或重试；随机抽取、精准复刻、寻物或严格AP叠加。'],['5 图寻附加','P格权重+20；D格+0；寻图并不是完成一次后再加20分。'],['6 队池标准化','极难固定400；其余24项原始权重乘队池系数，使其合计3600。'],['7 最终基础分','先以10分为步长向下取整，再按小数余数优先补10；同余数按任务序号。'],['8 额外账本','题面+50、失败−50与事件/能力卡单独记录；不把惩罚乘队池系数。']];
 policy.getRange('A40:B47').values=pricing;policy.getRange('B40:H47').format.wrapText=true;
 for(let row=40;row<=47;row++)policy.getRange(`B${row}:H${row}`).merge();policy.getRange('A40:H47').format.rowHeight=42;
 heading(policy,50,['机制','现有数值','对结算的含义']);
 const effects=[
  ['默认奖励/违规','±5','保留；相对任务分较小，主要改变时间与行动机会。'],
  ['微笑朗诵','失败−100','保留卡4；约一次低值任务的量级。'],
  ['榜首援助','转移100','保留卡5；双方总分差改变200，不是只影响100。'],
  ['下蹲挑战','每少一次−25','保留卡6；两人全缺最大−1000，三人全缺最大−1500；可能超过首末完赛差700。'],
  ['循环唱词/最难曲','违规/失败−50','保留卡9/13；各目标队伍独立审核。'],
  ['任务重演','实际TASK分×50%','保留卡12；不占普通任务归属和新的普通计分格。'],
  ['圆周率接力','每核对正确一位+1','保留卡21；随正确位数变动，不假设固定奖励。'],
  ['合照换分','交换当前总积分','保留卡1；会直接翻转既有分差，是最大方差来源；完成队不能发起新能力。'],
  ['Random3达标','额外+50','PHI21完成后且成绩按题面达标才加；只发一次，不包含在4000池。'],
  ['联动/曲师问答','每失败−50','ARC04/ARC11按工作人员记录失败次数独立扣分，可负分，不设未经授权的封顶。'],
  ['区域随机事件','无完整正式数值池','当前源码仅+2测试事件；不得当作活动正式数值。本方案不虚构事件清单。'],
  ['区域奖励卡','旧五项发卡已停止','沿用普通任务累计10次全队发卡、每30分钟全队发卡；不额外给区域积分。']
 ];
 policy.getRange('A51:C62').values=effects;policy.getRange('A51:C62').format.wrapText=true;policy.getRange('A51:C62').format.rowHeight=60;
 heading(policy,65,['结算口径','说明']);
 const settlement=[
  ['总积分','普通任务基础分 + 题面奖励 − 题面失败扣分 + 事件/能力卡净变动 + 完赛名次奖励。可出现负分与0.5分。'],
  ['普通任务唯一性','以唯一任务ID归属；首次有效提交通过FIFO审核后计一次。切换地区图片不重置归属，不重复领取基础分/达标奖励。'],
  ['125格的共享归属','125个不同任务ID，格位是主题棋盘ID+共享格位，实际提交队伍由服务器会话决定。P01复用图片不代表同一个任务。'],
  ['重复题面','ARC23与ALL22均为卸载音游；同一删除行为不能重复申领，须各有一次独立行为及证据，由工作人员核验。'],
  ['普通区域上限','每队每区最多5项普通基础奖励。审核通过未计分的首次完成仍计入全体十任务发卡；按队伍+任务ID去重。'],
  ['最终同分','沿用后端：总积分降序→普通TASK基础分降序→现场确认完赛时间升序；三者全同并列。'],
  ['题面歧义','ARC01的换行“-100000”、ARC05的“11/11 /12”原样保留，不当作额外积分扣罚；定门槛前由工作人员明确。'],
  ['正式规则接入','前后端共读src/data/scoringRules.json；支持125项固定格位、逐项奖惩及完赛名次/并列奖励。READY可载入预设，已开赛赛局不自动改价。'],
  ['偏差控制','任务标签、耗时与定价因子为策划判断；需用实测重试率、排队和寻图时间复核，不把归一化说成已经验证的公平。']
 ];
 policy.getRange('A66:B74').values=settlement;for(let row=66;row<=74;row++)policy.getRange(`B${row}:H${row}`).merge();policy.getRange('A66:H74').format.wrapText=true;policy.getRange('A66:H74').format.rowHeight=54;
 heading(policy,77,['比较案例','甲任务分','甲事件净分','甲完赛名次','甲总分','乙任务分','乙事件净分','乙完赛名次']);
 const cases=[['任务/事件相同，早到有优势',2200,0,1,null,2200,0,2],['后一名靠多拿任务反超',2200,0,1,null,2500,0,2],['第5名凭15项高值任务反超（乙为Phigros）',2200,0,1,null,2940,0,5],['转移100只抹平前二名差',2200,-100,1,null,2200,100,2],['任务分相同，纯速度决胜',2600,0,2,null,2600,0,3],['高额事件可以压过首末完赛差',2200,-1000,1,null,2200,0,5]];
 policy.getRange('A78:H83').values=cases;policy.getRange('I77:K77').values=[['乙总分','甲−乙','结论']];policy.getRange('I77:K77').format={fill:'#284766',font:{bold:true,color:'#FFFFFF',size:11},rowHeight:32};
 for(let row=78;row<=83;row++){
  policy.getRange(`E${row}`).formulas=[[`=SUM(B${row}:C${row})+INDEX($B$18:$B$22,D${row})`]];
  policy.getRange(`I${row}`).formulas=[[`=SUM(F${row}:G${row})+INDEX($B$18:$B$22,H${row})`]];
  policy.getRange(`J${row}`).formulas=[[`=E${row}-I${row}`]];
  policy.getRange(`K${row}`).formulas=[[`=IF(J${row}>0,"甲领先",IF(J${row}<0,"乙反超","总分持平，按同分规则"))`]];
 }
 policy.getRange('A78:K83').format.wrapText=true;policy.getRange('A78:K83').format.rowHeight=48;
 policy.getRange('A85:K87').merge();policy.getRange('A85').values=[['这些是可核算的分差案例，不是胜率预测。800/600/400/250/100意味着相邻名次优势150–200、首末差700；任务差超过相应完赛差可反超。保留总分交换和每缺一次−25，意味着任何有限的完赛奖励都无法保证其作用在每场一致。上述总分方案满足速度有显著优势、策略可反超，但不承诺事件不会主导个别赛局。']];policy.getRange('A85:K87').format.wrapText=true;policy.getRange('A85:K87').format.rowHeight=32;
 heading(policy,90,['已有删减及复评','原序号','理由']);policy.getRange('A91:C108').values=oldAudit;
 policy.getRange('A91:C108').format.wrapText=true;policy.getRange('A91:C108').format.rowHeight=60;
 heading(policy,112,['依据','定位']);
 policy.getRange('A113:B117').values=[['活动人数/区域/19+6/每区5项','previews/hrg-event-announcement-v2/海报文案.md'],['24张卡数值与发放规则','docs/ability-cards.md；server/abilityCards.mjs'],['逐项积分/完赛/排名','docs/scoring-rules.md；src/data/scoringRules.json；server/rules.mjs'],['图寻格位与地区换图','src/data/photoClues.ts'],['棋盘队伍顺序/最终图片编号','src/player/teamBingoThemes.ts；outputs/photo-final-20261006/区域编号对应表.csv']];
 for(let row=113;row<=117;row++)policy.getRange(`B${row}:H${row}`).merge();policy.getRange('A113:H117').format.wrapText=true;policy.getRange('A113:H117').format.rowHeight=38;
 heading(policy,120,['排序序号',...groups.map(g=>g.game)]);
 policy.getRange('A122:A146').values=Array.from({length:25},(_,i)=>[i+1]);
 for(let i=0;i<5;i++){
  const col=String.fromCharCode(66+i),start=records.findIndex(r=>r.game===groups[i].game)+7,end=start+24;
  policy.getRange(`${col}122:${col}146`).formulas=Array.from({length:25},(_,j)=>[`=SMALL('任务总表'!$H$${start}:$H$${end},$A${j+122})`]);
 }
 policy.getRange('A148:H150').merge();policy.getRange('A148').values=[['积分排序用于计算15项组合边界。H基础积分由权重、队池系数、AD取整补分计算；AD记录本次最大余数分配的0或10，修改定价因子后须重新分配AD，不能假定仍自动凑足4000。案例中的2200、2500、2600及Phigros的2940均已检验可由至多15项组成。']];policy.getRange('A148:H150').format.wrapText=true;policy.getRange('A148:H150').format.rowHeight=30;
 for(const [col,width]of [['A',220],['B',130],['C',370],['D',110],['E',110],['F',110],['G',110],['H',125],['I',110],['J',110],['K',200]])policy.getRange(`${col}1:${col}117`).format.columnWidthPx=width;
 policy.freezePanes.freezeRows(5);
 title(boards,'五队 Bingo · 格位、任务与积分');
 boards.getRange('A3:J4').merge();boards.getRange('A3').values=[['保留项目现有5×5格位布局；D直接任务无需图片；P按同编号读取区域A/B/C图片。棋盘格中的基础积分与总表联动。无连线额外积分。']];boards.getRange('A3:J4').format.wrapText=true;boards.getRange('A3:J4').format.rowHeight=30;
 for(let i=0;i<5;i++){boards.getRange(`${String.fromCharCode(65+i*2)}1:${String.fromCharCode(65+i*2)}60`).format.columnWidthPx=275;boards.getRange(`${String.fromCharCode(66+i*2)}1:${String.fromCharCode(66+i*2)}60`).format.columnWidthPx=20;}
 for(const [index,game]of ['Phigros','Arcaea','范式起源','maimai','通用'].entries()){
  const start=6+index*10, tasks=records.filter(r=>r.game===game),g=groups.find(x=>x.game===game);
  boards.getRange(`A${start}:I${start}`).merge();boards.getRange(`A${start}`).values=[[`${g.teamId} · ${game} | 基础分池4000 · 极难400 · 19图寻/6直接`]];boards.getRange(`A${start}:I${start}`).format={fill:'#284766',font:{bold:true,color:'#FFFFFF',size:13},rowHeight:32};
  for(const r of tasks){
   const col=String.fromCharCode(65+(r.col-1)*2),row=start+r.row,source=records.indexOf(r)+7,cell=boards.getRange(`${col}${row}`);
   cell.formulas=[[`='任务总表'!L${source}&" · "&'任务总表'!N${source}&CHAR(10)&'任务总表'!E${source}&CHAR(10)&'任务总表'!D${source}&" · "&'任务总表'!H${source}&" 分"&CHAR(10)&"${r.type==='图寻'?`A/B/C 图片 #${r.photoNo}`:'直接完成，无需图片'}"`]];
   const color={易:'#E2F0E7',中:'#FFF2D8',难:'#F9E3E3',极难:'#D81B60'}[r.difficulty];cell.format={fill:color,font:{name:'Microsoft YaHei',size:11,color:r.difficulty==='极难'?'#FFFFFF':'#1F2937'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:105,borders:{top:{style:'thin',color:'#FFFFFF'},bottom:{style:'thin',color:'#FFFFFF'},left:{style:'thin',color:'#FFFFFF'},right:{style:'thin',color:'#FFFFFF'}}};
  }
  boards.getRange(`A${start+7}:I${start+7}`).merge();boards.getRange(`A${start+7}`).values=[[`五行基础分：${g.rows.join(' / ')}；五列：${g.cols.join(' / ')}。仅为价值分布检查，不发连线奖励。`]];boards.getRange(`A${start+7}:I${start+7}`).format.rowHeight=27;
 }
 title(photos,'57 张地区图片索引');
 photos.getRange('A3:G4').merge();photos.getRange('A3').values=[['每个P格在三个地区各对应一张图片；五队共享图片编号，任务ID独立。图中缩略图来自项目预览图，仅作识别；原图路径见F列。D格不在此索引。']];photos.getRange('A3:G4').format.wrapText=true;photos.getRange('A3:G4').format.rowHeight=30;
 heading(photos,6,['地区图键','区域','共享格位','图号','缩略图','项目原图路径','可辨认线索']);
 const csv=JSON.parse((await fs.readFile(path.join(outDir,'photo-index-source.json'),'utf8')).replace(/^\uFEFF/,''));
 const photoRows=[];
 for(const reg of regions)for(let n=1;n<=19;n++){
  const slot='P'+String(n).padStart(2,'0'),relative=`public/images/photo-clues/region-${reg[1]}/${slot.slice(1)}.png`,source=csv.find(x=>Number(x['区域'])===reg[1]&&x['共享格位']===slot);
  if(!source)throw new Error('Photo CSV match');
  photoRows.push([`${reg[0]}:${slot}`,reg[2],slot,n,'',relative,source['保留线索']]);
 }
 photos.getRange('A7:G63').values=photoRows;photos.getRange('A7:G63').format.wrapText=true;photos.getRange('A7:G63').format.rowHeight=95;
 for(const [col,width]of [['A',155],['B',140],['C',90],['D',55],['E',160],['F',375],['G',300]])photos.getRange(`${col}1:${col}63`).format.columnWidthPx=width;
 for(let i=0;i<57;i++){
  const file=path.join(outDir,'photo-thumbs',String(Math.floor(i/19)+1)+'-'+String(i%19+1).padStart(2,'0')+'.png');
  const png=await fs.readFile(file).catch(async()=>{const{default:sharp}=await import('sharp');return sharp(path.join(root,'public/images/photo-clues',`region-${Math.floor(i/19)+1}`,`${String(i%19+1).padStart(2,'0')}-preview.webp`)).png().toBuffer();});photos.images.add({dataUrl:'data:image/png;base64,'+png.toString('base64'),anchor:{from:{row:i+6,col:4},extent:{widthPx:150,heightPx:90}}});
 }
 photos.tables.add('A6:G63',true,'PhotoIndex');photos.freezePanes.freezeRows(6);
 wb.recalculate();
 const after=main.getRange('A7:G131').values;
 if(JSON.stringify(original)!==JSON.stringify(after))throw new Error('Original content changed');
 for(let i=0;i<125;i++)if(main.getRange(`H${i+7}`).values[0][0]!==records[i].score||main.getRange(`K${i+7}`).values[0][0]!==records[i].score+records[i].bonus||main.getRange(`AC${i+7}`).values[0][0]!==records[i].score/2)throw new Error('Score formulas mismatch');
 for(let i=0;i<5;i++)if(policy.getRange(`B${29+i}`).values[0][0]!==4000)throw new Error('Budget formula mismatch');
 const expected=[200,-100,-40,0,200,-300];for(let i=0;i<6;i++)if(policy.getRange(`J${78+i}`).values[0][0]!==expected[i])throw new Error('Scenario mismatch');
 console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#N/A|#NAME\\?|#NUM!',options:{useRegex:true},summary:'最终公式错误扫描',maxChars:1200})).ndjson);
 const previews=[['score-main','任务总表','G6:P10'],['score-opening','任务总表','A1:I10'],['score-policy','积分规则','A17:H36'],['score-scenarios','积分规则','A77:K87'],['score-board','Bingo对照','A6:I13'],['score-photos','图片索引','A6:G9']];
 for(const [name,sheetName,range]of previews){const img=await wb.render({sheetName,range,scale:1.2,format:'png'});await fs.writeFile(path.join(outDir,name+'.png'),new Uint8Array(await img.arrayBuffer()));}
 const file=path.join(outDir,'HRG125项任务_正式积分与Bingo对应.xlsx');await(await SpreadsheetFile.exportXlsx(wb)).save(file);
 console.log(JSON.stringify({saved:file,preserved:125,uniqueCells:125,photoAssociations:95,directTasks:30,uniqueImageFiles:57,formulaScenarios:expected}));
 process.exit(0);
}
if(process.argv.includes('--name-tasks')) {
 const file=path.join(outDir,'HRG挑战任务汇总_各组25项.xlsx');
 const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
 const s=wb.worksheets.getItem('任务总表');
 const original=s.getRange('A7:F131').values;
 const names={
  'Phigros':['板子别动！','红键外包','一手包办动画','课题三连红','曲库统计员','IN级查户口','唱打','二次元扫书行动','蒙眼代打？！','人形平板支架','魔王曲速写','谷子认亲大会','全连低分王','白V断连大师','冷手热谱','credits不是片尾？','Rr精准控分','闭眼也能d0EZ','左右护法','一指宇宙','Random3开盲盒','一指全红','986000复刻现场','零零五说的道理','HD一手拿捏'],
  'Arcaea':['镜中追分','只能看不能摸','光暗双生','来自隔壁的你','困难角色带我飞','67，不能再多了','GUY，你干嘛','这歌我会唱','小p收集癖','快慢都是你','曲师连连看','拆开也要千万','迟到是不可能的','早到也不行','井水不犯河水','质数强迫症','分数复读机','天翻地覆色号','强碱体验卡','d0ez出来挨打','风暴二人转','曲绘照进现实','卸载冷静一下','猫猫喘口气','三连批发商'],
  'maimai':['？！初见！？','不许爆G','长条绝缘体','键盘大师？','每日325','福瑞？！','张雪峰','长跑冠军','单手挑战','路人夺权','高速狂飙','首字母捉迷藏','交叉手挑战','全程解说','极极？！','小拇指也要上分','深海闭嘴挑战','星星单手承包','彩虹提前报到','边打边建王国','GDP精准扶贫','致敬传奇心态王','乌冬面上分套餐','废物三项','这不是我们屁屁肉的歌吗'],
  '范式起源':['范式也能Dynamix','冬日方块少丢点','时间到了，满分！','elegante双向奔赴','inner norm侧面出击','bpm=rt达标打卡','席替（换座位）','重返新手村','ternion三道关','慢速带师','入侵二选一','曲师猜猜乐','曲绘找找茬之我爱para','纵连打信者','曲名何意味','谁笑谁重开','命运交给路人','人形街机','倒转脑回路','双小拇指冲百万','零号车单手司机','十六级全收','数据乱流','控速挑战','大麻烦！！！'],
  '通用':['空中音游','双手打结','边打边画','走着也能AP','初音巡回打卡','柠檬水补给站','慢到怀疑人生','反面教材','地板音游','音游字母表','曲师点名册','跨游爬楼梯','b键加班中','你打歌我跳一跳','旁白正在加载','板子三周转','事已至此，先吃饭吧','冰手挑战','你打歌我平板','这口水不能吐','镜像倒打二人转','音游减法','曲绘团建','325在哪里','名场面返场']
 };
 for(const [game,list]of Object.entries(names))if(list.length!==25)throw new Error('Name count '+game);
 const labels=original.map(r=>names[r[1]][r[2]-1]);
 if(labels.some(x=>!x)||new Set(labels).size!==125)throw new Error('Missing or duplicate names');
 // Move the existing notes area and descriptions one column right without changing their content or styles.
 s.getRange('K2:K19').copyFrom(s.getRange('J2:J19'),'all');
 s.getRange('J2:J19').copyFrom(s.getRange('I2:I19'),'all');
 s.getRange('I2:I19').copyFrom(s.getRange('H2:H19'),'all');
 s.getRange('H2:H19').clear({applyTo:'all'});
 s.tables.items[0].delete();
 s.getRange('G6:G131').copyFrom(s.getRange('F6:F131'),'all');
 s.getRange('F6:F131').copyFrom(s.getRange('E6:E131'),'all');
 s.getRange('F3:F4').copyFrom(s.getRange('E3:E4'),'all');
 s.getRange('E3:E4').clear({applyTo:'all'});
 s.getRange('E6').values=[['任务名称']];
 s.getRange('E7:E131').values=labels.map(x=>[x]);
 const table=s.tables.add('A6:G131',true,'ChallengeTasks');table.showFilterButton=true;
 s.getRange('A6:G6').format={fill:'#284766',font:{name:'Microsoft YaHei',size:11,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:30};
 s.getRange('E7:E131').format.font={name:'Microsoft YaHei',size:11,bold:true,color:'#284766'};
 s.getRange('E7:E131').format.verticalAlignment='center';
 s.getRange('E7:E131').format.wrapText=true;
 for(const [col,width]of [['E',230],['F',730],['G',300],['H',25],['I',120],['J',70],['K',550]])s.getRange(`${col}1:${col}131`).format.columnWidthPx=width;
 // Reapply alternating name-cell fills so the new field follows the existing row layout.
 for(let i=0;i<labels.length;i++)s.getRange(`E${i+7}`).format.fill=i%2===0?'#FFFFFF':'#F3F6FA';
 s.freezePanes.freezeRows(6);
 wb.recalculate();
 const after=s.getRange('A7:G131').values;
 for(let i=0;i<after.length;i++){
  const restored=[...after[i].slice(0,4),after[i][5],after[i][6]];
  if(JSON.stringify(restored)!==JSON.stringify(original[i]))throw new Error('Task content changed '+(i+1));
  if(after[i][4]!==labels[i])throw new Error('Name mismatch');
 }
 console.log(JSON.stringify({named:labels.length,unique:new Set(labels).size,groups:Object.keys(names).map(game=>({game,count:names[game].length})),unchanged:'task text, difficulty, numbering, notes'}));
 console.log((await wb.inspect({kind:'table',range:'任务总表!A57:G60',include:'values',tableMaxRows:4,tableMaxCols:7,maxChars:1800})).ndjson);
 const previews=[['named-opening','A1:G10'],['named-arc','B32:G38'],['named-mai','B57:G63'],['named-paradigm','B91:G96'],['named-common','B123:G131'],['named-sidebar','I2:K19']];
 for(const [name,range]of previews){
  const preview=await wb.render({sheetName:s.name,range,scale:1.1,format:'png'});
  await fs.writeFile(path.join(outDir,name+'.png'),new Uint8Array(await preview.arrayBuffer()));
 }
 const outputPath=path.join(outDir,'HRG挑战任务汇总_任务命名版.xlsx');
 const output=await SpreadsheetFile.exportXlsx(wb);await output.save(outputPath);
 const records=JSON.parse(await fs.readFile(path.join(outDir,'integrated-data.json'),'utf8'));
 records.forEach((r,i)=>r.name=labels[i]);
 await fs.writeFile(path.join(outDir,'integrated-data.json'),JSON.stringify(records,null,2));
 console.log('SAVED '+outputPath);
 process.exit(0);
}
if(process.argv.includes('--review-names')) {
 const existing=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(outDir,'HRG挑战任务汇总_各组25项.xlsx')));
 console.log(existing.help('range.insert',{include:'index,examples,notes',maxChars:5000}).ndjson);
 const preview=await existing.render({sheetName:'任务总表',range:'A1:F10',scale:1.1,format:'png'});
 await fs.writeFile(path.join(outDir,'before-names.png'),new Uint8Array(await preview.arrayBuffer()));
 console.log((await existing.inspect({kind:'table',range:'任务总表!A7:F8',include:'values',tableMaxRows:2,tableMaxCols:6,maxChars:1300})).ndjson);
 process.exit(0);
}
if(process.argv.includes('--normalize-25')) {
 const baseFile=path.join(outDir,'normalization-base.json');
 try {await fs.access(baseFile);} catch {await fs.copyFile(path.join(outDir,'integrated-data.json'),baseFile);}
 const base=JSON.parse(await fs.readFile(baseFile,'utf8'));
 const gameOrder=['Phigros','Arcaea','maimai','范式起源','通用'];
 const removals={maimai:new Map([[10,'随机游玩仅要求完成，辨识度较低。'],[16,'成绩取决于朋友水平，缺少统一门槛。'],[18,'与原第 8 项同为白南十字途中附加任务。'],[19,'依赖特定对象和双方水平，完成门槛不固定。']]),'范式起源':new Map([[18,'吃东西的任务与通用组的吃饭、饮料任务相近。'],[19,'路人划拳与游戏操作无关，优先保留本游戏挑战。']])};
 const changes={
  'Phigros:9':['极难','蒙眼、由队友引导，并要求大于 15 级谱面 AP，叠加限制最多。'],
  'Arcaea:4':['中','没有限时要求，主要考验曲目知识与随机抽取。'],
  'Arcaea:10':['难','极高、极低流速下都要维持较高成绩。'],
  'Arcaea:11':['中','主要考验 30 秒内的曲包检索与曲师熟悉度。'],
  'Arcaea:12':['极难','三次分别只接一种音符，仍要求合计达到 10000000，容错较小。'],
  'Arcaea:15':['易','可选任意曲目，只要求 track complete；补评原未标注难度。'],
  'Arcaea:16':['易','可通过调整残片数量满足末两位为质数，没有操作限制。'],
  'maimai:12':['中','10.0 流速叠加 13 级谱面和 90% 成绩门槛。'],
  'maimai:14':['中','全程交叉手限制操作范围，需保持规定评级。'],
  'maimai:20':['极难','仅使用双小拇指，13.4 及以上谱面仍要求达成率至少 100%。'],
  'maimai:26':['难','低流速、缩小谱面，并须精确限定为 AP-2 且 2 GOOD。'],
  '范式起源:22':['难','双小拇指、15 级及以上、1000000 分，操作限制较强。'],
  '范式起源:25':['极难','16 级以上谱面叠加音频 -200、画面 +100 延迟，仍要求 1000000 分。']
 };
 const additions={
  'Phigros':[
   ['难','课题模式通过随机选择到 Random3 难度并游玩（不严格要求顺序），若成绩在 2990000 以上额外 +50'],
   ['易','单指 AP 一张任意难度谱面'],
   ['中','在课题模式下，游玩 d0EZ，并完全复刻 986000 场面（分数相同，爆点相同）'],
   ['易','把自己的昵称改为零零五即可，但之后的所有任务开始前需要先溜一遍说的道理'],
   ['易','单手游玩一张 HD 谱面并 AP']
  ],
  '通用':[
   ['极难','镜像倒打双人合作一首最高难度的谱面，并拿到这个游戏倒数第二评级以上（不包含）的成绩'],
   ['难','删除游玩设备上的任意一款音游'],
   ['难','还原任意含三人及以上的曲绘姿势'],
   ['中','在任意一款音游中找到“325”字样'],
   ['易','还原任意除 Phigros 音游外的名场面']
  ]
 };
 const records=[],removed=[];
 for(const game of gameOrder) {
  const items=[];
  for(const item of base.filter(x=>x.game===game)) {
   if(removals[game]?.has(item.n)) {removed.push({...item,reason:removals[game].get(item.n)});continue;}
   const updated={...item,sourceNumber:item.n};
   const change=changes[game+':'+item.n];
   if(change) {
    updated.difficulty=change[0];
    updated.note=game==='Arcaea'&&item.n===15?change[1]:[item.note,`难度复评：${item.difficulty} → ${change[0]}。${change[1]}`].filter(Boolean).join('\n');
   }
   items.push(updated);
  }
  for(const [difficulty,text] of additions[game]||[]) items.push({game,difficulty,text,note:'新增任务。',sourceNumber:null});
  if(items.length!==25)throw new Error(`${game} count is ${items.length}`);
  if(!items.some(x=>x.difficulty==='极难'))throw new Error('Missing extreme: '+game);
  items.forEach((r,i)=>{
   r.n=i+1;
   if(r.sourceNumber!==null&&r.sourceNumber!==r.n) r.note=[`原任务序号：${r.sourceNumber}。`,r.note].filter(Boolean).join('\n');
   records.push(r);
  });
 }
 const wb=Workbook.create();
 const s=wb.worksheets.add('任务总表');
 s.showGridLines=false;s.tabColor='#284766';
 s.getRange('A1:F131').format.font={name:'Microsoft YaHei',size:11,color:'#1F2937'};
 s.getRange('A1:F131').format.verticalAlignment='center';
 s.getRange('A2').values=[['HRG 挑战任务总表']];
 s.getRange('A2:D2').merge();
 s.getRange('A2').format.font={name:'Microsoft YaHei',size:17,bold:true,color:'#284766'};
 s.getRange('A2:F2').format.rowHeight=30;
 s.getRange('A2:F2').format.borders={bottom:{style:'thin',color:'#A6B6C5'}};
 s.getRange('E3').values=[['共 125 项：Phigros、Arcaea、maimai、范式起源、通用各 25 项。']];
 s.getRange('E4').values=[['易：绿色；中：黄色；难：红色；极难：玫瑰红。各组至少 1 项极难任务。']];
 s.getRange('E3:E4').format.font={name:'Microsoft YaHei',size:10,color:'#596679'};
 s.getRange('A6:F6').values=[['总序号','游戏 / 侧别','任务序号','任务难度','任务内容与完成要求','备注']];
 const matrix=records.map((r,i)=>[i+1,r.game,r.n,r.difficulty,r.text,r.note]);
 s.getRange('A7:F131').values=matrix;
 const table=s.tables.add('A6:F131',true,'ChallengeTasks');table.showFilterButton=true;
 s.getRange('A6:F6').format={fill:'#284766',font:{name:'Microsoft YaHei',size:11,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:30};
 s.getRange('A7:A131').setNumberFormat('0');s.getRange('C7:C131').setNumberFormat('0');
 s.getRange('A7:A131').format.horizontalAlignment='right';s.getRange('C7:C131').format.horizontalAlignment='right';s.getRange('D7:D131').format.horizontalAlignment='center';
 s.getRange('E7:F131').format.wrapText=true;s.getRange('E7:F131').format.verticalAlignment='top';
 for(const [col,width] of [['A',60],['B',130],['C',75],['D',90],['E',730],['F',300],['G',25],['H',120],['I',70],['J',550]])s.getRange(`${col}1:${col}131`).format.columnWidthPx=width;
 const units=t=>[...t].reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0);
 for(let i=0;i<records.length;i++){
  const row=i+7,r=records[i];
  const lines=(t,max)=>t.split('\n').reduce((n,p)=>n+Math.max(1,Math.ceil(units(p)/max)),0);
  s.getRange(`A${row}:F${row}`).format.rowHeight=Math.max(34,Math.max(lines(r.text,81),lines(r.note,33))*19+12);
  s.getRange(`A${row}:F${row}`).format.fill=i%2===0?'#FFFFFF':'#F3F6FA';
  if(i%25===0)s.getRange(`A${row}:F${row}`).format.borders={top:{style:'medium',color:'#A6B6C5'}};
 }
 const diff=s.getRange('D7:D131');
 for(const [label,bg,fg] of [['易','#E2F0E7','#21613D'],['中','#FFF2D8','#825900'],['难','#F9E3E3','#9B3232'],['极难','#D81B60','#FFFFFF']])diff.conditionalFormats.addCustom(`$D7="${label}"`,{fill:bg,font:{color:fg,bold:true}});
 diff.dataValidation={rule:{type:'list',values:['易','中','难','极难']}};
 s.freezePanes.freezeRows(6);
 s.getRange('H2').values=[['删减说明（不计入任务数）']];
 s.getRange('H2').format.font={name:'Microsoft YaHei',size:13,bold:true,color:'#284766'};
 s.getRange('H6:J6').values=[['游戏 / 侧别','原序号','删减任务与原因']];
 s.getRange('H6:J6').format.font={name:'Microsoft YaHei',size:10,bold:true,color:'#284766'};
 const removalTitles=['抽卡达人','你选我打','白南十字途中吃麦当劳','假装萌新后拼机胜过对方','薯条二重奏限时吃完','路人划拳连胜三次'];
 const removalReasons=['仅要求随机游玩完成，辨识度较低。','门槛依赖朋友水平。','与原第 8 项主题相近。','门槛依赖对象及双方水平。','与通用组吃饭、饮料任务相近。','优先保留本游戏操作挑战。'];
 s.getRange('H7:J12').values=removed.map((r,i)=>[r.game,r.n,removalTitles[i]+'：'+removalReasons[i]]);
 s.getRange('H7:J12').format.font={name:'Microsoft YaHei',size:10,color:'#596679'};
 s.getRange('H7:J12').format.verticalAlignment='top';s.getRange('J7:J12').format.wrapText=true;
 s.getRange('H14').values=[['难度评估口径']];s.getRange('H14').format.font={name:'Microsoft YaHei',size:11,bold:true,color:'#284766'};
 s.getRange('J15').values=[['以原难度为基础，综合操作限制、成绩门槛、精确复刻及条件叠加评估；未逐项实测。']];
 s.getRange('J16').values=[['难度会随选曲与玩家水平变化；调整理由见任务备注。']];
 s.getRange('J17').values=[['Phigros 与通用新增任务保留用户指定难度。']];
 s.getRange('J18').values=[['资料：原文档、上传图片、用户提供的 maimai 难度及新增任务。']];
 s.getRange('J19').values=[['maimai 评分机制核对：https://maimai.sega.jp/news/2019-08-07/']];
 s.getRange('J15:J19').format.font={name:'Microsoft YaHei',size:10,color:'#596679'};s.getRange('J15:J19').format.wrapText=true;
 const sources=[['E7','tiaozhan (1).docx，Phigros；新增 21–25 由用户提供。'],['E32','5a0c6691100637b2944bea5b3bbc4bce.jpg，Arcaea 新版任务。'],['E57','tiaozhan (1).docx，Maimai；原难度由用户提供，已删减原 10、16、18、19 并复评。'],['E82','40315d723ae54167b180ea3e3896d0cb.png 与 d037a42b33e54e9b3c21f5f5f0c5008b.png；删减原 18、19 并复评。'],['E107','tiaozhan (1).docx，通用；新增 21–25 由用户提供。']];
 for(const [address,text]of sources)wb.notes.add({id:s.name+':'+address,target:{cell:{sheetName:s.name,sheetId:s.sheetId,address}},authorId:'',createdAt:'',body:{plainText:text}});
 wb.recalculate();
 if(JSON.stringify(s.getRange('A7:F131').values)!==JSON.stringify(matrix))throw new Error('Data mismatch');
 const summaries=gameOrder.map(game=>({game,count:records.filter(r=>r.game===game).length,difficulties:records.filter(r=>r.game===game).reduce((a,r)=>(a[r.difficulty]=(a[r.difficulty]||0)+1,a),{})}));
 if(records.length!==125||records.some(x=>!['易','中','难','极难'].includes(x.difficulty)))throw new Error('Invalid results');
 console.log(JSON.stringify({total:125,summaries,deleted:removed.map(r=>({game:r.game,originalNumber:r.n})),extreme:records.filter(r=>r.difficulty==='极难').map(r=>({game:r.game,number:r.n,text:r.text}))}));
 console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:10},maxChars:1000})).ndjson);
 for(const [name,range]of [['normalized-opening','A1:F10'],['normalized-phi','A26:F31'],['normalized-arc','A42:F47'],['normalized-mai','A70:F75'],['normalized-paradigm','A102:F106'],['normalized-common','A127:F131'],['normalized-removals','H2:J19']]){
  const preview=await wb.render({sheetName:s.name,range,scale:1.2,format:'png'});
  await fs.writeFile(path.join(outDir,name+'.png'),new Uint8Array(await preview.arrayBuffer()));
 }
 const output=await SpreadsheetFile.exportXlsx(wb);await output.save(path.join(outDir,'HRG挑战任务汇总_各组25项.xlsx'));
 await fs.writeFile(path.join(outDir,'integrated-data.json'),JSON.stringify(records,null,2));
 await fs.writeFile(path.join(outDir,'normalization-audit.json'),JSON.stringify({summaries,removed,changes},null,2));
 console.log('SAVED '+path.join(outDir,'HRG挑战任务汇总_各组25项.xlsx'));
 process.exit(0);
}
const paragraphs = JSON.parse(await fs.readFile(path.join(outDir, 'source-paragraphs.json'), 'utf8')).map(s=>s.trim()).filter(Boolean);
if (process.argv.includes('--review-colors') || process.argv.includes('--update-colors')) {
 const file=path.join(outDir,'HRG挑战任务汇总.xlsx');
 const existing=await SpreadsheetFile.importXlsx(await FileBlob.load(file));
 const s=existing.worksheets.getItem('任务总表');
 if(process.argv.includes('--review-colors')) {
  const preview=await existing.render({sheetName:s.name,range:'A6:F10',scale:1.2,format:'png'});
  await fs.writeFile(path.join(outDir,'before-colors.png'),new Uint8Array(await preview.arrayBuffer()));
  console.log((await existing.inspect({kind:'table',range:'任务总表!A7:F10',include:'values',tableMaxRows:4,tableMaxCols:6,maxChars:1800})).ndjson);
  process.exit(0);
 }
 const original=s.getRange('A7:F127').values;
 const colorParas=JSON.parse(await fs.readFile(path.join(outDir,'source-colors.json'),'utf8')).filter(x=>x.text.trim()).map(x=>({...x,text:x.text.trim()}));
 const difficultyMap={green:'易',yellow:'中',red:'难'};
 const beforeRecords=JSON.parse(await fs.readFile(path.join(outDir,'integrated-data.json'),'utf8'));
 let currentGame='',phiNumber=0,commonNumber=0;
 const mappings=new Map();
 for(const p of colorParas) {
  if(['Phigros','Arcaea','Maimai','Paradigm：Reboot','通用：'].includes(p.text)) { currentGame=p.text;continue; }
  if(!['Phigros','通用：'].includes(currentGame)) continue;
  const highlights=[...new Set(p.colors.flatMap(x=>[...x.matchAll(/<w:highlight\s+w:val="(green|yellow|red)"/g)].map(m=>m[1])))];
  if(highlights.length>1) throw new Error('Conflicting highlight colors: '+p.text);
  let n;
  if(currentGame==='Phigros') {
   const explicit=p.text.match(/^(\d+)[.、]/);
   if(explicit) { n=Number(explicit[1]);phiNumber=n; }
   else if(/^(不转板|请和你|单手ap|课题模式|本挑战)/.test(p.text)) {n=++phiNumber;}
   else n=phiNumber;
  } else {
   const explicit=p.text.match(/^(\d+)[.、]/);
   if(explicit) {n=Number(explicit[1]);commonNumber=n;} else n=commonNumber;
  }
  if(highlights.length) {
   const key=(currentGame==='Phigros'?'Phigros':'通用')+':'+n;
   const diff=difficultyMap[highlights[0]];
   if(mappings.has(key)&&mappings.get(key)!==diff) throw new Error('Task color mismatch '+key);
   mappings.set(key,diff);
  }
 }
 if(mappings.size!==40) throw new Error('Expected 40 highlighted tasks, got '+mappings.size);
 for(let i=0;i<original.length;i++) {
  const row=original[i],key=row[1]+':'+row[2];
  if(mappings.has(key)) {
   s.getRange(`D${i+7}`).values=[[mappings.get(key)]];
   beforeRecords[i].difficulty=mappings.get(key);
  }
 }
 s.getRange('E4').values=[['文档荧光色：绿色易、黄色中、红色难；Arcaea、范式起源用图片；maimai 难度按用户提供。']];
 const colored=s.getRange('D7:D127');
 colored.conditionalFormats.deleteAll();
 for(const [name,bg,fg] of [['易','#E2F0E7','#21613D'],['中','#FFF2D8','#825900'],['难','#F9E3E3','#9B3232'],['未标注','#E9EDF2','#657186']]) colored.conditionalFormats.addCustom(`$D7="${name}"`,{fill:bg,font:{color:fg,bold:true}});
 existing.recalculate();
 const after=s.getRange('A7:F127').values;
 let changed=0;
 for(let i=0;i<original.length;i++) for(let j=0;j<6;j++) {
  if(original[i][j]!==after[i][j]) {if(j!==3||!['Phigros','通用'].includes(original[i][1]))throw new Error('Unexpected change');changed++;}
 }
 if(changed!==40) throw new Error('Changed count mismatch '+changed);
 for(let i=0;i<after.length;i++) {const key=after[i][1]+':'+after[i][2];if(mappings.has(key)&&after[i][3]!==mappings.get(key))throw new Error('Difficulty mismatch');}
 console.log(JSON.stringify({updated:changed,difficulty:after.reduce((a,r)=>(a[r[3]]=(a[r[3]]||0)+1,a),{}),unmarked:after.filter(r=>r[3]==='未标注').map(r=>({game:r[1],number:r[2]}))}));
 for(const [name,range] of [['after-colors-phi','A6:F12'],['after-colors-common','A108:F113']]) {
  const preview=await existing.render({sheetName:s.name,range,scale:1.3,format:'png'});
  await fs.writeFile(path.join(outDir,name+'.png'),new Uint8Array(await preview.arrayBuffer()));
 }
 await fs.writeFile(path.join(outDir,'integrated-data.json'),JSON.stringify(beforeRecords,null,2));
 const output=await SpreadsheetFile.exportXlsx(existing);
 await output.save(file);
 console.log('UPDATED '+file);
 process.exit(0);
}
function section(name, next) { return paragraphs.slice(paragraphs.indexOf(name)+1, paragraphs.indexOf(next)); }
function numbered(lines) {
  const records=[];
  for(const line of lines) {
    const m=line.match(/^(\d+)[.．、]?\s*(.*)$/);
    if(m) records.push({n:Number(m[1]),text:m[2]});
    else { if(!records.length) throw new Error('Unexpected continuation'); records.at(-1).text+='\n'+line; }
  }
  return records;
}
const phiLines=section('Phigros','Arcaea');
const phigros=[
 {n:1,text:phiLines[0]},
 {n:2,text:phiLines[1]+'\n'+phiLines[2]},
 {n:3,text:phiLines[3]},
 {n:4,text:phiLines[4]},
 {n:5,text:phiLines[5]+'\n'+phiLines[6]},
 {n:6,text:phiLines[7]+'\n'+phiLines[8]},
 ...numbered(phiLines.slice(9))
];
const maimai=numbered(section('Maimai','Paradigm：Reboot'));
const common=numbered(paragraphs.slice(paragraphs.indexOf('通用：')+1));
const maiDifficulties='易，中，难，难，易，易，中，中，易，易，易，易，中，易，难，中，中，难，难，难，中，中，中，难，易，中，难，易，易'.split('，');
const arcaea=[
 ['中','镜像游玩任意一首 10 级及以上的歌，超过自己本地的记录\n-100000','图片中“-100000”另起一行，按原文保留。'],
 ['难','游玩任意等级的 ftr 曲目，要求达到全部红蛇，有音弧判定上得分则重开（本身就能做到全红）'],
 ['易','可以对换光暗侧的歌曲使用光对立前后打两次，保持在同一评级'],
 ['难','在选曲列表随歌，直到随到联动曲目为止，并说出联动曲目在本家的主难度定数（每失败一次积分 -50）'],
 ['难','使用任意困难角色通关任意一首 11/11 /12','图片原文为“11/11 /12”，未显示加号。'],
 ['难','在任意难度任意曲目打出 far/lost 为 6/7 的结算成绩（允许使用拉格兰）'],
 ['易','连续游玩首字母为 g、u、y 的曲目（要求 ftr 及以上），总成绩达到 29550000 以上'],
 ['中','唱打 xterfusion'],
 ['难','以超过 100 小 p 的成绩 pm 任意一首歌'],
 ['中','以 max 速度和 min 速度游玩同一首 ftr 及以上曲子，结算成绩达到 19200000 及以上'],
 ['难','从进入主界面开始计时，30s 内通过选取曲包的方式找到 4 首同个曲师的作品（每失败一次 -50）'],
 ['难','选取任意一首 ftr9 及以上，连续三次游玩，分别只接蛇/地键/天键，总结算成绩达到 10000000 及以上'],
 ['易','游玩任意 ftr，不能出现 late 判定'],
 ['易','游玩任意 ftr，不能出现 early 判定'],
 ['未标注','一只手接天键和蛇，不同于那只手的另一只手接地键，track complete 任意曲目','图片未标注难度。'],
 ['中','残片数量末尾两位为质数'],
 ['易','任意谱面结算分数的 7–8 位数中有至少 4 个数字相同（不能是 0）'],
 ['中','倒打色号，5000000 以上'],
 ['易','被姛炷强碱一次'],
 ['易','随机选歌直到抽选到 d0ez'],
 ['中','风暴 byd 双人合作，左边的人用右手，右边的人用左手，达到 7000000'],
 ['中','拍摄出多次元 & testify & Oshama Scramble 曲绘姿势'],
 ['难','卸载掉游玩设备上的任意一款音游'],
 ['难','暂停 10 次使用猫对立完成 Libertas BYD clear'],
 ['易','给 bult_0509 一键三连十次']
].map(([difficulty,text,note],i)=>({n:i+1,difficulty,text,note:note||''}));
const paradigm=[
 ['易','名无宣教师 ctc 拟，双人或三人协力，分数达到 990000（模拟 dynamix 站位）'],
 ['中','winter cube ctc ■，双人或三人协力，lost 总数不超过 30'],
 ['中',"time's up ctc 止，1000000"],
 ['易','elegante ctc 双，990000'],
 ['易','inner norm ctc 侧，990000'],
 ['易','bpm=rt ctc，990000'],
 ['易','席替（换座位），massive 难度全连'],
 ['中','以下任务任选其一：\nA. 新手教程，数据紊乱段全连。\nB. 新手教程，教程段 AD 通过（特殊要求：将蓝色 tap 视为白色 tap 击打，即手指需要离开屏幕，不可在屏幕上滑动）。'],
 ['易','ternion massive 难度，达成以下要求：开异象；三押段全连；尾杀降速段 AD'],
 ['难','慢速带师：cybernetic vampire massive 难度，在满足以下要求的条件下分数达到 980000：谱面流速 0.4；音符出现距离 3'],
 ['中','nox silva/labyrinthox 两者任选其一，invaded 谱面分数达到 1009000'],
 ['中','【special】曲师猜猜乐：请找出范式起源游戏内收录曲目数量大于 6 首的一个曲师，并选择其任意一首曲目 massive 难度进行游玩，分数达到 1009000'],
 ['中','【special】曲绘找找茬之我爱 para：请在全游收录曲目中找到 3 首满足“曲绘中有 para 且她手中（或手旁）有花束”的曲目，并游玩其中任意一首，分数达到 1005000'],
 ['中','【special】纵连打信者：选择一首有长纵连的曲目游玩其 massive 难度，分数达到 1000000'],
 ['易','【special】曲名何意味：找到曲名除去字母、汉字、日语假名后含有至少两个圈的曲目，并游玩 massive 难度，分数达到 1000000'],
 ['中','在商场过道罚站军姿 3min，保持面部严肃，眼神坚毅，不许笑（），若没绷住则重新开始计时'],
 ['难','随机找一个路人点击一次范式全曲随机键，得到一首随机曲目，游玩该曲目的最高难度且分数须达到 1005000，若否，重复上一步骤（即重新寻找路人），直至达到分数要求'],
 ['易','麦门？！：在附近的麦当劳购买薯条二重奏并在计时 10min 内吃完，则该任务完成'],
 ['中','随机寻找路人进行划拳，连胜三次（平局不计入）则任务完成，若在中途失败则须重新寻找路人'],
 ['中','由任一队员手持平板或手机站立，设备所在平面和地面垂直，另一队员与之面对面站立，游玩指定曲目 [Re:Layered massive]，要求分数达到 1006000'],
 ['难','转板倒打指定曲目 rebooted mind massive 难度，分数达到 1000000'],
 ['中','用双手小拇指游玩一首难度为 15 及以上曲目，分数达到 1000000'],
 ['易','单手游玩零号车辆 detected 谱面，并取得全连击，则该任务完成'],
 ['中','AD 一首 16 级难度歌曲'],
 ['难','【special】数据乱流：将音频延迟参数 -200，画面延迟参数 +100，完成一首 16 级或以上曲目，要求分数达到 1000000'],
 ['难','控速挑战：指定曲目 Aleph0 massive 难度，从以下两项中任选一项完成：\nA. 结算时 received 总数达到 200 或以上，lost 总数不超过 20。\nB. 将谱面流速调至 1.6，音符出现距离调至 1，在此设置下游玩该谱面，要求分数达到 1000000。'],
 ['难','大麻烦！！！：游玩 Giganto Machina reboot 难度，分数达到 1007500']
].map(([difficulty,text],i)=>({n:i+1,difficulty,text,note:''}));

const groups=[['Phigros',phigros,20],['Arcaea',arcaea,25],['maimai',maimai,29],['范式起源',paradigm,27],['通用',common,20]];
const records=[];
for(const [game,items,count] of groups) {
 if(items.length!==count) throw new Error(`${game} count ${items.length} != ${count}`);
 items.forEach((item,i)=>{
  if(item.n!==i+1) throw new Error(`${game} numbering error`);
  records.push({game,...item,difficulty:game==='maimai'?maiDifficulties[i]:item.difficulty||'未标注',note:item.note||''});
 });
}
if(records.length!==121||maiDifficulties.length!==29) throw new Error('Total mismatch');
await fs.writeFile(path.join(outDir,'integrated-data.json'),JSON.stringify(records,null,2));
const wb=Workbook.create();
const sheet=wb.worksheets.add('任务总表');
sheet.showGridLines=false;
sheet.tabColor='#284766';
const end=records.length+6;
const all=sheet.getRange(`A1:F${end}`);
all.format.font={name:'Microsoft YaHei',size:11,color:'#1F2937'};
all.format.verticalAlignment='center';
sheet.getRange('A2').values=[['HRG 挑战任务总表']];
sheet.getRange('A2').format.font={name:'Microsoft YaHei',size:17,bold:true,color:'#284766'};
sheet.getRange('A2:F2').format.rowHeight=30;
sheet.getRange('A2:F2').format.borders={bottom:{style:'thin',color:'#A6B6C5'}};
sheet.getRange('E3').values=[['共 121 项：Phigros 20 · Arcaea 25 · maimai 29 · 范式起源 27 · 通用 20']];
sheet.getRange('E4').values=[['文档：Phigros、maimai、通用；图片：Arcaea、范式起源；maimai 难度：用户提供。']];
sheet.getRange('E3:E4').format.font={name:'Microsoft YaHei',size:10,color:'#596679'};
sheet.getRange('A6:F6').values=[['总序号','游戏 / 侧别','任务序号','任务难度','任务内容与完成要求','备注']];
const matrix=records.map((r,i)=>[i+1,r.game,r.n,r.difficulty,r.text,r.note]);
sheet.getRange(`A7:F${end}`).values=matrix;
const table=sheet.tables.add(`A6:F${end}`,true,'ChallengeTasks');
table.showFilterButton=true;
sheet.getRange('A6:F6').format={fill:'#284766',font:{name:'Microsoft YaHei',size:11,bold:true,color:'#FFFFFF'},horizontalAlignment:'center',verticalAlignment:'center',rowHeight:30};
sheet.getRange(`A7:A${end}`).setNumberFormat('0');
sheet.getRange(`C7:C${end}`).setNumberFormat('0');
sheet.getRange(`A7:A${end}`).format.horizontalAlignment='right';
sheet.getRange(`C7:C${end}`).format.horizontalAlignment='right';
sheet.getRange(`D7:D${end}`).format.horizontalAlignment='center';
sheet.getRange(`E7:F${end}`).format.wrapText=true;
sheet.getRange(`E7:F${end}`).format.verticalAlignment='top';
for(const [col,width] of [['A',60],['B',130],['C',75],['D',90],['E',730],['F',250]]) sheet.getRange(`${col}1:${col}${end}`).format.columnWidthPx=width;
function visualUnits(text) { return [...text].reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0); }
for(let i=0;i<records.length;i++) {
 const row=i+7,r=records[i];
 const lines=r.text.split('\n').reduce((n,t)=>n+Math.max(1,Math.ceil(visualUnits(t)/81)),0);
 const noteLines=Math.max(1,Math.ceil(visualUnits(r.note)/27));
 sheet.getRange(`A${row}:F${row}`).format.rowHeight=Math.max(34,Math.max(lines,noteLines)*19+12);
 sheet.getRange(`A${row}:F${row}`).format.fill=i%2===0?'#FFFFFF':'#F3F6FA';
 if(i===0||r.game!==records[i-1].game) sheet.getRange(`A${row}:F${row}`).format.borders={top:{style:'medium',color:'#A6B6C5'}};
}
const diffRange=sheet.getRange(`D7:D${end}`);
for(const [name,bg,fg] of [['易','#E2F0E7','#21613D'],['中','#FFF2D8','#825900'],['难','#F9E3E3','#9B3232'],['未标注','#E9EDF2','#657186']]) diffRange.conditionalFormats.add('cellIs',{operator:'equal',formula:`"${name}"`,format:{fill:bg,font:{color:fg,bold:true}}});
diffRange.dataValidation={rule:{type:'list',values:['易','中','难','未标注']}};
sheet.freezePanes.freezeRows(6);
const sourceNotes=[
 ['E7','来源：tiaozhan (1).docx，Phigros 段落。'],
 ['E27','来源：5a0c6691100637b2944bea5b3bbc4bce.jpg，Arcaea 新版任务及难度。'],
 ['E52','来源：tiaozhan (1).docx，Maimai 段落；难度按用户提供的 29 项顺序对应。'],
 ['E81','来源：40315d723ae54167b180ea3e3896d0cb.png（1–15）和 d037a42b33e54e9b3c21f5f5f0c5008b.png（16–27）。'],
 ['E108','来源：tiaozhan (1).docx，通用段落。']
];
for(const [address,text] of sourceNotes) wb.notes.add({id:`${sheet.name}:${address}`,target:{cell:{sheetName:sheet.name,sheetId:sheet.sheetId,address}},authorId:'',createdAt:'',body:{plainText:text}});
wb.recalculate();
const actual=sheet.getRange(`A7:F${end}`).values;
if(JSON.stringify(actual)!==JSON.stringify(matrix)) throw new Error('Workbook data mismatch');
console.log(JSON.stringify({total:records.length,groups:groups.map(([g,t])=>[g,t.length]),difficulty:records.reduce((x,r)=>(x[r.difficulty]=(x[r.difficulty]||0)+1,x),{})}));
console.log((await wb.inspect({kind:'table',range:'任务总表!A27:F29',include:'values',tableMaxRows:3,tableMaxCols:6,maxChars:1600})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:10},maxChars:1000})).ndjson);
for(const [name,range] of [['opening','A1:F10'],['arc-details','A37:F43'],['paradigm-end','A102:F107']]) {
 const image=await wb.render({sheetName:sheet.name,range,scale:1.4,format:'png'});
 await fs.writeFile(path.join(outDir,`${name}.png`),new Uint8Array(await image.arrayBuffer()));
}
const output=await SpreadsheetFile.exportXlsx(wb);
await output.save(path.join(outDir,'HRG挑战任务汇总.xlsx'));
console.log('SAVED '+path.join(outDir,'HRG挑战任务汇总.xlsx'));
