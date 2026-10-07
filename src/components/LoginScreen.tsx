import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, Smartphone } from "lucide-react";
import type { UserMode } from "../types";
import posterArtwork from "../../previews/hrg-teaser-poster/ver3.png";
import "./LoginScreen.css";

export function LoginScreen({ onLogin }: { onLogin: (mode: UserMode, username: string, password: string) => void }) {
  const [mode, setMode] = useState<UserMode>("player");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const selectMode = (nextMode: UserMode) => {
    setMode(nextMode);
  };

  return (
    <main className="login-page login-page--event" id="main-content">
      <section className="login-hero login-hero--event" aria-labelledby="login-title">
        <h1 id="login-title" className="login-event-title"><span>失序</span><span>重奏</span></h1>
        <div className="login-event-art" aria-hidden="true">
          <div className="login-event-art__window">
            <img src={posterArtwork} alt="" width={724} height={2172} decoding="async" />
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel__inner">
          <div>
            <p className="eyebrow">ACCESS GATE / 01</p>
            <h2>进入比赛</h2>
            <p className="muted-copy">选择身份，登录活动账号。</p>
          </div>

          <div className="role-switch" role="tablist" aria-label="账号类型">
            <button
              role="tab"
              aria-selected={mode === "player"}
              className={mode === "player" ? "is-active" : ""}
              onClick={() => selectMode("player")}
            >
              <Smartphone size={18} aria-hidden="true" />
              玩家账号
            </button>
            <button
              role="tab"
              aria-selected={mode === "staff"}
              className={mode === "staff" ? "is-active" : ""}
              onClick={() => selectMode("staff")}
            >
              <ShieldCheck size={18} aria-hidden="true" />
              工作人员
            </button>
          </div>

          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault();
              onLogin(mode, username, password);
            }}
          >
            <label>
              <span>账号</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入账号" />
            </label>
            <label>
              <span>密码</span>
              <span className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </span>
            </label>
            <button className="button button--primary button--full" type="submit">
              登录
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
