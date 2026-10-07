import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoginScreen } from './LoginScreen';

describe('失序重奏登录页', () => {
  const html = () => renderToStaticMarkup(<LoginScreen onLogin={() => {}} />);

  it('左侧只保留企划主标题，不展示旧英文、小字、功能栏或计时', () => {
    const hero = html().match(/<section class="login-hero[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(hero).toContain('<h1 id="login-title" class="login-event-title"><span>失序</span><span>重奏</span></h1>');
    expect(hero.replace(/<[^>]*>/g, '')).toBe('失序重奏');
    expect(hero).not.toContain('ENTER');
    expect(hero).not.toContain('HRG // LIVE');
    expect(hero).not.toContain('SESSION');
    expect(hero).not.toContain('login-hero__features');
    expect(hero).not.toContain('login-signal');
  });

  it('沿用海报美术作为装饰，保留登录控件与自动填充', () => {
    const markup = html();
    expect(markup).toContain('class="login-event-art" aria-hidden="true"');
    expect(markup).toContain('alt="" width="724" height="2172"');
    expect(markup).toContain('玩家账号');
    expect(markup).toContain('工作人员');
    expect(markup).toContain('autoComplete="username"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('aria-label="显示密码"');
    expect(markup).toContain('type="submit">登录</button>');
    expect(markup).not.toContain('device-note');
    expect(markup).not.toContain('正式活动需安装 PWA');
    expect(markup).not.toContain('比赛会检查通知、相机和定位权限');
  });
});
