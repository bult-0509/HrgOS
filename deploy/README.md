# 部署到 hrgos.skyseiun.com

本配置部署 HTTPS 前端、正式比赛 API、隔离联调 API 和 PostgreSQL 17。默认前端已接通比赛后端；24 张卡、区域/任务审核、账本和定位由服务端保存。旧版前端原型保留在开发环境。卡牌规则与审核边界见 [能力卡说明](../docs/ability-cards.md)。

## 首次部署

服务器需有 Linux、Git、OpenSSL、Docker Engine 和 Docker Compose。域名源站指向服务器，允许 80/443 入站；若已有网站占用端口，将本项目接入现有代理。

```sh
git clone https://github.com/bult-0509/HrgOS.git
cd HrgOS
umask 077
cp deploy/.env.example deploy/.env
```

分别执行三次 `openssl rand -hex 32`，将三份不同的值填写到 `POSTGRES_PASSWORD`、`TEST_API_KEY`、`GAME_ADMIN_KEY`。不要使用占位值，也不要提交 `.env`。

```dotenv
API_DOMAIN=hrgos.skyseiun.com
FRONTEND_ORIGINS=https://hrgos.skyseiun.com
POSTGRES_PASSWORD=独立随机64位十六进制值
TEST_API_KEY=第二份独立随机64位十六进制值
GAME_ADMIN_KEY=第三份独立随机64位十六进制值
TEST_API_ENABLED=false
```

```sh
chmod 600 deploy/.env
docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build --wait
curl --fail https://hrgos.skyseiun.com/api/health
```

健康检查数据库应为 `postgresql`。Caddy 自动申请 HTTPS 证书，`/api/*` 转发到 API，其他路径提供静态前端及 SPA 回退。数据库不开放公网端口，使用 `postgres-data` 持久卷。Cloudflare 用户需确认源站 HTTPS、WebSocket 和媒体请求正常。

## 创建正式比赛

1. 打开网站，展开“工作人员创建新比赛”，输入 `GAME_ADMIN_KEY`。管理密钥创建后清空，仅保存在当前页面内存。
2. 保存比赛编号，向选手提供 `https://hrgos.skyseiun.com/?game=比赛编号`。编号是公开入口，不具备管理权限。
3. 使用已经分发的工作人员账号登录。账号清单在部署负责人本机 `local-private/`，没有上传公共仓库；后端校验 `src/data/loginAccounts.ts` 的加盐密码摘要。角色和队伍由服务器决定。每队第一位注册成员为队长，只有 `hrg-staff-01` 可看完整定位和轨迹，其余工作人员可审核。
4. 在“配置正式比赛任务（25 项）”填写真实标题、说明、正整数分值及可选 `boardRewards`。未配置时服务器拒绝开始比赛，正式比赛不沿用测试任务和测试事件分值。
5. 使用第23张“无中生有”前，在“无中生有备用任务池”配置棋盘以外的真实任务 JSON（也可在上一步添加 `reserveTasks`）。空池或某队候选耗尽时不会消耗卡牌。旧赛局会自动补入23/24张卡，原有卡牌配置和历史记录保留。
6. 点击“开始比赛”。可手动发卡，全体每完成10个审核通过的普通任务，向每个队伍各发一张随机能力卡（同队成员共享）。高影响卡先由工作人员确认，目标接收后计时；全队事件所有目标接收后共同开始。
7. 结束比赛前结算待处理的卡；必要时填写理由终止效果。未结算卡会阻止结束比赛。

正式比赛存于 `hrg_games`，没有测试赛局的两小时过期限制；测试密钥、时钟和清理不能操作正式比赛。会话十二小时有效，重新登录可续会话。重启后旧位置标为离线，收到新 GPS 后恢复；比赛时间仍按服务器时钟推进，维护前请暂停比赛。

开赛后每累计30分钟，API自带后台时钟向各队独立随机发一张能力卡，允许重复；与全体十任务发卡独立运行。无需额外 cron，也不依赖玩家在线。暂停期间不计时，结束后停止；运行中停机则重启补发。轮次、共享库存和个人展示确认保存在 `hrg_games`，多API实例共用行锁避免重复。升级旧赛局会补发已经达到的半小时轮次；计划维护时先暂停比赛。更新后需要同时重新构建 API 和前端，工作人员可用“预览发卡动效”验收卡牌展示。

## 一键验收

临时设置 `TEST_API_ENABLED=true` 并重新执行 `up -d --build --wait`，访问 `https://hrgos.skyseiun.com/?test=rules`，输入 `TEST_API_KEY`：

- “一键测试 24 张能力卡”：预期 26 项通过（24张卡、全体十任务发卡、半小时发卡）、0 项失败、1 项待实机验收。
- “一键执行规则测试”：预期 31 项通过、0 项失败、4 项待验收。
- “专项功能验收”：全体每10个任务向各队发卡已实现；自创事件、通用文本收件、最低队伍特殊挑战仍会如实报告未实现。
- “打开能力卡联调界面”：输入测试密钥建立三队三人的独立赛局，可切换测试身份体验发卡、使用、接收、上传和审核，测试凭据只存在页面内存。

完成验收后恢复 `TEST_API_ENABLED=false`。比赛页面每两秒同步状态，队长前台 GPS 最多每三秒上报，轨迹每分钟采样。手机 GPS、短视频播放、现场动作、异地数据库恢复和公网延迟必须实测；后台持续 GPS、系统 Web Push 尚未实现。

开发机也可执行 `npm ci`、`npm run test:lab`、`npm run test:abilities:local`。远程脚本将 `HRG_TEST_API_URL` 和 `TEST_API_KEY` 写入忽略的 `.env.test.local`，运行 `npm run test:abilities`。密钥和数据库连接不能写进任何 `VITE_` 变量。

## 更新与备份

```sh
git pull --ff-only
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build --wait
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail=100 api gateway
sh deploy/backup.sh
```

保留原 `.env` 和数据库密码；不要执行 `docker compose down -v` 删除持久卷。数据库备份含账号摘要、照片和定位，应妥善保管。图片/短视频原件目前存于受权限保护的数据库字段，单文件 8 MB，大规模活动需增加对象存储及容量监控。

Windows 可使用 `deploy/deploy-remote.ps1`，已支持打包前后端、保留旧数据库密码并补充独立比赛管理密钥。本次未提供服务器访问，尚未验证异地 Compose 启动，部署人员应执行以上步骤。
