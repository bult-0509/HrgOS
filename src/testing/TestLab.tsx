import { useRef, useState } from 'react';
import { PlaceholderBoard } from '../adapters/board';
import type { BoardTaskView } from '../adapters/board';
import { runRuleSuite } from './ruleSuite';
import { runFeatureReadiness } from './featureReadiness';
import { runAbilitySuite } from './abilitySuite';
import type { RuleResult, SuiteReport } from './ruleSuite';
import { checkRealDevices } from './deviceChecks';
import './testLab.css';

export default function TestLab() {
  const [baseUrl, setBaseUrl] = useState(import.meta.env.VITE_TEST_API_BASE_URL ?? 'http://127.0.0.1:4000');
  const [key, setKey] = useState(''); const [realDevices, setRealDevices] = useState(false);
  const [results, setResults] = useState<RuleResult[]>([]); const [report, setReport] = useState<SuiteReport | null>(null);
  const [running, setRunning] = useState(false); const [error, setError] = useState('');
  const [board, setBoard] = useState<BoardTaskView[]>([]); const [selectedTask, setSelectedTask] = useState('');
  const controller = useRef<AbortController | null>(null);
  const append = (result: RuleResult) => setResults(current => [...current, result]);
  const start = async (readiness: boolean | 'abilities' = false) => {
    setError(''); setResults([]); setReport(null); setBoard([]); setSelectedTask(''); setRunning(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const completed = await (readiness === 'abilities' ? runAbilitySuite : readiness ? runFeatureReadiness : runRuleSuite)({ baseUrl: baseUrl.trim(), key, signal: abort.signal, onResult: append, onBoard: tasks => setBoard(tasks.map(task => ({ id: task.id, title: task.title ?? task.id, points: task.points ?? 0, state: task.awarded ? 'awarded' : 'available' }))) });
      if (realDevices && completed.failed === 0 && !abort.signal.aborted) {
        const deviceResults: RuleResult[] = [];
        await checkRealDevices(baseUrl.trim(), key, result => { deviceResults.push(result); append(result); });
        completed.results.push(...deviceResults);
        completed.passed += deviceResults.filter(result => result.status === 'passed').length;
        completed.failed += deviceResults.filter(result => result.status === 'failed').length;
        completed.manual += deviceResults.filter(result => result.status === 'manual').length;
        completed.finishedAt = new Date().toISOString();
      }
      setReport(completed);
    } catch (failure) { setError(abort.signal.aborted ? '测试已取消，正在运行的隔离赛局已尝试清理。' : failure instanceof Error ? failure.message : '测试无法启动'); }
    finally { setRunning(false); controller.current = null; }
  };
  const download = () => {
    if (!report) return;
    const file = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = file; link.download = `hrgos-rules-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(file);
  };
  const labels = { passed: '通过', failed: '失败', manual: '需实机验收' };
  return (
    <main className="rule-lab" id="main-content">
      <header className="rule-lab__header"><div><p className="eyebrow">HRG // INTEGRATION LAB</p><h1>一键规则联调</h1><p>连接异地测试后端，验证登录、区域审核、原图、计分、卡牌、事件、定位与完赛。每次建立独立测试赛局，结束后清理。</p></div><a href="/">返回登录页</a></header>
      <section className="rule-lab__config" aria-label="测试配置">
        <div className="rule-lab__actions"><button className="button button--primary" disabled={running || key.length < 32} onClick={() => { void start('abilities'); }}>一键测试 24 张能力卡</button><a href="/?live=cards&training=1">打开能力卡联调界面</a></div>
        <label>后端地址<input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} disabled={running} placeholder="https://test-api.example.com" /></label>
        <label>测试访问密钥<input type="password" value={key} onChange={event => setKey(event.target.value)} disabled={running} autoComplete="off" placeholder="粘贴服务器 TEST_API_KEY" /></label>
        <label className="rule-lab__device"><input type="checkbox" checked={realDevices} onChange={event => setRealDevices(event.target.checked)} disabled={running} />同时检查本机 GPS 和相机权限；定位将写入独立测试赛局，相机画面不上传。</label>
        <div className="rule-lab__actions"><button className="button button--primary" onClick={() => { void start(); }} disabled={running || key.length < 32}>一键执行规则测试</button><button className="button" onClick={() => { void start(true); }} disabled={running || key.length < 32}>专项功能验收</button>{running ? <button className="button" onClick={() => controller.current?.abort()}>停止测试</button> : null}<button className="button" onClick={download} disabled={!report}>下载测试报告</button></div>
        <p>密钥仅保留在当前页面内存中。卡牌测试覆盖24张能力卡、全体十任务发卡及半小时随机发卡，共26项自动检查；现场动作另行实机验收。专项功能验收会检测自创事件、文本收件、最低队伍挑战和全体任务发卡，未实现会如实显示失败。定位时钟使用虚拟时间。</p>
      </section>
      <section className="rule-lab__summary" aria-live="polite"><strong>{running ? '测试执行中' : report ? `自动通过 ${report.passed} · 失败 ${report.failed} · 待实机验收 ${report.manual}` : '等待运行'}</strong>{report ? <span>数据库：{report.database}</span> : null}{error ? <p role="alert">{error}</p> : null}</section>
      <ol className="rule-lab__results" aria-label="逐项测试结果">{results.map((result, index) => <li key={`${result.id}-${index}`} className={`rule-result rule-result--${result.status}`}><div><span>{result.id}</span><strong>{result.title}</strong></div><b>{labels[result.status]}</b><p>{result.detail}</p><small>{result.durationMs} ms</small></li>)}</ol>
      {board.length ? <section className="rule-lab__board"><PlaceholderBoard adapter={{ config: { id: 'test-live-board', version: 1, title: '真实接口返回的任务入口', placeholder: true }, tasks: board, onTaskSelected: setSelectedTask }} />{selectedTask ? <p role="status">已打开测试任务：{selectedTask}</p> : null}</section> : null}
    </main>
  );
}
