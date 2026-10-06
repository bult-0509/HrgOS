# 一键规则联调

域名按 `hrgos.skyseiun.com` 配置，作为异地后端 API 地址。部署后的测试页面连接 `https://hrgos.skyseiun.com`；本机前端与异地后端通过明确的 CORS 来源联调。

## 本机启动

安装 Node.js 24 LTS，在项目目录运行：

```powershell
npm ci
npm run test:lab
```

也可以双击 `启动规则测试.bat`。终端打印测试页面 URL，通常为 `http://127.0.0.1:3001/?test=rules`，端口占用时会选择其他空闲端口。复制 `local-private/rules-test-key.txt` 中的密钥到页面，点击“一键执行规则测试”。程序不会把密钥写入前端资源、浏览器存储或测试报告。

默认启动本机 PGlite（PostgreSQL WASM）数据库与真实 HTTP / WebSocket API，用于开发验证。它不能证明异地 PostgreSQL、TLS、代理或卷挂载已经通过验收。测试创建随机账号和独立赛局，结束时删除该赛局。清理失败会记为失败；记录两小时后不可访问，下次创建赛局时清理过期数据。

定位节流和排名等规则使用可控赛局时钟，避免等待四十分钟。页面可选择真实 GPS 与相机检查：浏览器需要用户授权，定位会发送至输入的后端并写入独立赛局，报告不含经纬度；相机仅打开并立即停止，不拍照、不上传画面。自动接口检查失败时不会启动设备检查。

## 异地部署

需要 Linux 服务器上的 Docker Engine + Compose、可通过密钥登录的 SSH 主机、可用的 80/443 端口，以及解析至该服务器的域名。当前 DNS 返回 Cloudflare 代理地址，不能从这些地址推断 SSH 源站；请提供真实 SSH 主机别名或服务器地址。

本机使用 PowerShell 7 执行：

```powershell
pwsh -File deploy/deploy-remote.ps1 `
  -SshHost your-ssh-alias `
  -ApiDomain hrgos.skyseiun.com `
  -FrontendOrigins 'http://127.0.0.1:3001,http://localhost:3001,https://hrgos.skyseiun.com'
```

将 `your-ssh-alias` 替换成实际主机别名；SSH 非默认端口和密钥路径在本机 `~/.ssh/config` 中配置。前端来源必须与实际使用的协议、主机和端口一致。例如启动器选择 3002 时，部署参数也要允许 3002。

脚本先检查 SSH 和 Compose，再打包、上传并启动独立 Compose 项目 `hrgos-rule-tests`。配置和随机生成的数据库密码、测试密钥保存在被 Git 忽略的 `local-private/remote-rule-tests.env`；页面使用密钥文件 `local-private/remote-rule-tests-key.txt`。重复执行保留凭据和数据库卷，并更新允许的前端来源。脚本不安装服务器软件，不修改 DNS，也不删除已有数据库卷。

服务器使用 PostgreSQL 17、Node API、Caddy HTTPS 网关。数据库没有公网端口，只有 API 网关开放 80/443。本部署包现同时提供前端、正式比赛 API 和独立测试接口，部署步骤见 deploy/README.md。若服务器已运行占用 80/443 的网站，需要将 `/api/*` 接入已有反向代理后再启动，避免端口冲突。Cloudflare 代理及源站 HTTPS 配置需要保证证书申请、HTTPS 和 WebSocket 可用。

部署后连接异地后端：

```powershell
$env:HRG_TEST_API_URL = 'https://hrgos.skyseiun.com'
npm run test:lab
```

按终端 URL 打开测试页面，使用 **remote-rule-tests-key.txt** 中的远端密钥，一键执行测试。成功报告必须显示 `数据库：postgresql`，才能确认走的是异地 PostgreSQL。不要使用本机密钥或把密钥加上 `VITE_` 前缀。

已部署前端如需显示测试入口，构建时设置 `VITE_ENABLE_TEST_LAB=true` 和 `VITE_TEST_API_BASE_URL=https://hrgos.skyseiun.com`，访问 `/?test=rules`。正式前端默认关闭这个入口。测试 API 自身还需要服务器的 `TEST_API_ENABLED=true` 和访问密钥。

## 覆盖范围

浏览器按钮与命令行运行同一个 `src/testing/ruleSuite.ts`，通过实际接口验证结果：

| 规则 | 验证内容 |
| --- | --- |
| 登录与权限 | 随机个人账号、固定身份、同队共享、伪造会话拒绝、后台操作和精确位置权限 |
| 区域与任务 | 到达审核、顺序推进、任务详情解锁、换区保留同一任务ID的状态与分值；隔离测试25项，正式配置125项 |
| 图片与队列 | 原始字节和 SHA-256、缩略图、跨队隔离、伪装图片拒绝、全局 FIFO、打回与重交 |
| 计分 | 唯一任务归属、重复通过不重复计分、每区上限、可配置分值、棋盘奖励、追加更正账本 |
| 卡牌与事件 | 同队两设备并发只成功一次、高影响确认、确认后计时、暂停冻结、候选和重抽留痕、一次发放 |
| 排名与消息 | 四十分钟快照、两分钟窗口、未读补取、按设备标记动画、位置和排名不进入推送记录 |
| 定位 | 队长限定、前台条件、三秒节流、六十秒采样、二十秒离线、保留最后位置、完赛金色箭头 |
| 状态和恢复 | 五十个真实 WebSocket 连接、配置版本、存储预警、备份校验、新赛局恢复、工作人员手动结束 |
| 前端定位生命周期 | 单元测试验证 `watchPosition` 的启动、前后台切换、暂停、完赛停止及尾部节流发送 |

31 项自动通过之外，以下 4 项始终单独列为待验收，不会伪报成功：

- NC-01 / NC-02：iPhone 主屏幕 PWA 锁屏通知和 Android 后台通知。当前后端只验证消息记录，尚未接入 VAPID/Web Push。
- TC-06：异地服务器异常退出后恢复持久化状态。本机子进程强制退出与重启测试已经实现，远端进程和卷仍需部署后实测。
- TC-10：正式活动开赛条件，包括生产 API、推送、完整素材与真实设备验收。

测试后端是独立规则沙箱。新增 ?live=cards 比赛界面已经接通正式账号后端校验、卡牌、任务审核和定位，正式赛局保存在独立 hrg_games 表；旧 DemoApp 仍为原型。正式和测试媒体暂存于受权限控制的数据库字段，生产对象存储仍待增加。24 张能力卡测试见 docs/ability-cards.md；部署前后端按 deploy/README.md 配置 GAME_ADMIN_KEY，联调时临时启用 TEST_API_ENABLED。

事件创作、文本收件、最低队伍特殊挑战及区域奖励卡另有“专项功能验收”按钮，缺失功能会标为失败。当前结果及动效修复见 [功能专项验收](feature-readiness.md)；命令行为 `npm run test:readiness:local`，异地为 `npm run test:readiness`。

## 命令行、报告与备份

```powershell
npm test
npm run build
npm run test:backend
npm run test:rules:local
```

`test:backend` 包括 HTTP 权限、规则联调、FIFO/限制和持久化重启检查。`test:rules:local` 生成 `artifacts/rules-test-report.json`；浏览器提供“下载测试报告”。报告包含每项结果、耗时和待验收说明，不含测试账号密码、媒体或真实坐标。有失败时命令行返回非零退出码。

连接异地后端的命令行测试：

```powershell
$env:HRG_TEST_API_URL = 'https://hrgos.skyseiun.com'
$env:TEST_API_KEY = (Get-Content local-private/remote-rule-tests-key.txt -Raw).Trim()
npm run test:rules
Remove-Item Env:TEST_API_KEY
```

在服务器部署目录运行 `sh deploy/backup.sh`，会执行 `pg_dump`，保存 SQL 和 SHA-256 文件，权限受 `umask 077` 限制。整库恢复请先在独立验证库演练并核对数据；浏览器的备份恢复测试只创建新测试赛局，不覆盖原库。

服务端写操作使用数据库事务和行锁，任务归属还有 `(run_id, task_id)` 主键约束。并发语义依据 [PostgreSQL SELECT 文档](https://www.postgresql.org/docs/current/sql-select.html) 和 [行锁说明](https://www.postgresql.org/docs/17/explicit-locking.html)。
