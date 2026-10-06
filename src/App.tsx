import { lazy, Suspense, useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { WaitingScreen } from "./components/WaitingScreen";
import { resolveLoginSession } from "./domain/loginAccess";
import type { LoginSession } from "./domain/loginAccess";

// 正式比赛构建移除包含完整题面的本地演示分包；开发预览仍可使用。
const DemoApp = import.meta.env.DEV || import.meta.env.VITE_ENABLE_LIVE_GAME !== 'true' ? lazy(() => import("./DemoApp")) : null;
const TestLab = lazy(() => import("./testing/TestLab"));
const AbilityApp = lazy(() => import("./ability/AbilityApp"));

// 临时测试开关只对本机开发服务生效，生产构建继续校验账号。
const temporaryPreviewAccess = import.meta.env.DEV && import.meta.env.VITE_TEMP_PREVIEW_ACCESS === "true";

function simulationSession(role: LoginSession["role"], username: string, password: string): LoginSession | null {
  if (!temporaryPreviewAccess) return null;
  const expectedUsername = role === "player" ? import.meta.env.VITE_SIM_PLAYER_USERNAME : import.meta.env.VITE_SIM_STAFF_USERNAME;
  const expectedPassword = role === "player" ? import.meta.env.VITE_SIM_PLAYER_PASSWORD : import.meta.env.VITE_SIM_STAFF_PASSWORD;
  if (!expectedUsername || !expectedPassword || username !== expectedUsername || password !== expectedPassword) return null;
  // 模拟玩家绑定 Phigros 队，只创建页面会话，不加入正式报名或后端账号。
  return { username, role, teamId: role === "player" ? "team-1" : undefined };
}

function previewSession(role: LoginSession["role"], username?: string): LoginSession {
  const requestedTeam = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("team");
  return {
    username: username?.trim() || `local-preview-${role}`,
    role,
    teamId: role === "player" ? (requestedTeam && /^team-[1-5]$/.test(requestedTeam) ? requestedTeam : "team-1") : undefined,
  };
}

export default function App() {
  const [access, setAccess] = useState<LoginSession | "waiting" | null>(() => {
    if (!temporaryPreviewAccess || typeof window === "undefined") return null;
    const role = new URLSearchParams(window.location.search).get("preview");
    return role === "staff" || role === "player" ? previewSession(role) : null;
  });

  if ((import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_LAB === 'true') && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('test') === 'rules') {
    return <Suspense fallback={<WaitingScreen />}><TestLab /></Suspense>;
  }

  if (typeof window !== 'undefined' && (import.meta.env.VITE_ENABLE_LIVE_GAME === 'true' || new URLSearchParams(window.location.search).get('live') === 'cards')) {
    return <Suspense fallback={<WaitingScreen />}><AbilityApp /></Suspense>;
  }

  if (access === "waiting") {
    return <WaitingScreen />;
  }

  if (access === null) {
    return (
      <LoginScreen onLogin={(mode, username, password) => {
        setAccess(
          resolveLoginSession(mode, username, password)
          ?? simulationSession(mode, username, password)
          ?? (temporaryPreviewAccess ? previewSession(mode, username) : "waiting")
        );
      }} />
    );
  }

  return (
    <Suspense fallback={<WaitingScreen />}>
      {DemoApp ? <DemoApp mode={access.role} account={access} onLogout={() => setAccess(null)} /> : <WaitingScreen />}
    </Suspense>
  );
}
