import { useRef, useState, type ReactNode } from 'react';
import { photoRegions } from '../data/photoClues';
import { uploadMedia } from './client';
import type { OpeningPuzzle } from '../player/RegionTaskArea';

export function OpeningPuzzleEditor({ puzzles, busy, finished, run, renderImage }: {
  puzzles: Record<string, OpeningPuzzle>;
  busy: boolean;
  finished: boolean;
  run: (body: Record<string, unknown>) => Promise<unknown>;
  renderImage: (id: string) => ReactNode;
}) {
  const [regionId, setRegionId] = useState<string>(photoRegions[0].id);
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const selected = puzzles[regionId];
  const loadConfirmed = async () => {
    if (saving || busy || finished) return;
    setSaving(true); setError('');
    try {
      await run({ type: 'opening_puzzle_preset', reason: '工作人员载入已确认的三张统一风格开场照片：区域1西湖文化广场、区域2浙江展览馆、区域3工联' });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };
  const save = async () => {
    if (!file || !reason.trim() || saving || busy || finished) return;
    setSaving(true); setError('');
    try {
      const media = await uploadMedia(file);
      await run({ type: 'opening_puzzle_configure', regionId, title: '开场谜题', prompt, media, reason });
      setFile(null); setReason(''); if (input.current) input.current.value = '';
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };
  return <section className="ability-surface"><h2>区域开场照片</h2>
    <p>已确认顺序：01 西湖文化广场外立面 → 02 浙江展览馆 → 03 工联招牌。三张开场图不占 19 张任务图、不计入每区 5 项任务。</p>
    <p>载入会替换三个区域的当前参考图；待审提交仍使用提交时的参考图，旧图不删除，修改留痕。</p>
    <div className="ability-actions"><button type="button" disabled={busy || saving || finished} onClick={() => void loadConfirmed()}>{saving ? '正在保存…' : '载入本次确认的三张开场图'}</button></div>
    {error ? <p role="alert">{error}</p> : null}
    <div className="ability-actions">{photoRegions.map(region => <span key={region.id}>{String(region.number).padStart(2, '0')} · {region.name} · {puzzles[region.id]?.configured ? '已配置' : '未载入'}</span>)}</div>
    <details><summary>配置开场参考照片</summary>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <label>区域<select value={regionId} disabled={busy || saving} onChange={event => { const next = event.target.value; setRegionId(next); setPrompt(puzzles[next]?.prompt ?? ''); setFile(null); setError(''); if (input.current) input.current.value = ''; }}>{photoRegions.map(region => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
        {selected?.configured && selected.mediaId ? renderImage(selected.mediaId) : null}
        <label>题目说明（可留空）<textarea value={prompt} maxLength={2000} onChange={event => setPrompt(event.target.value)} /></label>
        <label>已确认的开场照片<input ref={input} type="file" accept="image/png,image/jpeg,image/webp" required disabled={busy || saving || finished} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <label>配置依据<input value={reason} maxLength={300} required onChange={event => setReason(event.target.value)} /></label>
        <button disabled={busy || saving || finished || !file || !reason.trim()}>{saving ? '正在保存…' : '保存开场照片'}</button>
      </form>
    </details>
  </section>;
}
