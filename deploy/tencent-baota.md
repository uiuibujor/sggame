# 腾讯云轻量服务器 + 宝塔面板部署指南

本文按你这个仓库当前结构来写：

- 前端：`Vite + React`
- 构建产物：`dist/`
- 后端：`server/index.js`
- 后端作用：作为 `/api/*` 的 Node 代理，转发到 SiliconFlow

也就是说，这个项目不是“只上传 `dist` 就结束”。
如果你要保留 AI 推演功能，服务器上还必须额外跑一个 Node 进程，并让 Nginx 把 `/api/` 转发给它。

## 一、推荐部署结构

推荐在宝塔上按下面的结构部署：

- 站点根目录：`/www/wwwroot/sggame`
- 前端静态文件目录：`/www/wwwroot/sggame/dist`
- Node 服务监听：`127.0.0.1:8787`
- Nginx 对外提供网站，并反代 `/api/` 到 `127.0.0.1:8787`

这样做的好处是：

- 前端走 Nginx，稳定且适合静态资源缓存
- API 不直接暴露端口
- `SILICONFLOW_API_KEY` 只保存在服务器 `.env` 中，不会泄漏到前端

## 二、宝塔里先装什么

进入宝塔面板后，先安装：

1. `Nginx`
2. `Node.js 版本管理器`
3. `PM2 管理器`

建议 Node 版本用 `18` 或更高，最好 `20 LTS`。
因为服务端代码直接使用了 Node 原生 `fetch`。

## 三、把项目传到服务器

你有两种常见方式。

### 方式 A：直接上传整个项目

适合先跑起来再说。

把本地整个项目上传到：

```bash
/www/wwwroot/sggame
```

上传后目录里至少应该有这些内容：

```bash
package.json
package-lock.json
src/
server/
public/
vite.config.js
```

### 方式 B：用 Git 拉代码

服务器已装 Git 的情况下：

```bash
cd /www/wwwroot
git clone 你的仓库地址 sggame
cd sggame
```

如果仓库里已经提交了 `.env`，不建议继续保留这种做法。
至少把线上密钥改成服务器单独维护的一份。

## 四、服务器上配置环境变量

在项目根目录创建或修改：

```bash
/www/wwwroot/sggame/.env
```

内容示例：

```env
SILICONFLOW_API_KEY=你的线上密钥
SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V3.2
AI_PROXY_PORT=8787
```

注意：

- `AI_PROXY_PORT` 要和后面反代配置一致
- 线上密钥建议重新生成，不要继续使用已经出现在本地仓库里的旧 key
- `.env` 不要放进公开仓库

## 五、安装依赖并构建前端

在宝塔终端或 SSH 中执行：

```bash
cd /www/wwwroot/sggame
npm install
npm run build
```

成功后会生成：

```bash
/www/wwwroot/sggame/dist
```

这就是网站前端实际要访问的目录。

## 六、在宝塔创建站点

在宝塔面板中：

1. 打开“网站”
2. 新增站点
3. 域名填你的域名，例如 `sg.example.com`
4. 网站目录填：

```bash
/www/wwwroot/sggame/dist
```

创建后，去这个站点的“配置文件”，把核心规则改成下面这种。

## 七、Nginx 配置

把站点配置改成类似下面这样。
其中域名、证书路径按你自己的环境替换。

```nginx
server
{
    listen 80;
    server_name sg.example.com;
    index index.html;
    root /www/wwwroot/sggame/dist;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 3600;
    }
}
```

如果你已经开了 HTTPS，`443` 的 server 块也要放同样的 `location /` 和 `location /api/`。

这里有两个关键点：

- `try_files $uri $uri/ /index.html;`
  作用：保证 React 单页路由刷新不 404
- `proxy_pass http://127.0.0.1:8787;`
  作用：把前端请求的 `/api/battle/stream` 转给 Node 服务

## 八、用 PM2 启动 Node 服务

因为我已经给 `package.json` 加了启动脚本，所以你在服务器上可以直接运行：

```bash
cd /www/wwwroot/sggame
pm2 start npm --name sggame-api -- run start
pm2 save
pm2 startup
```

如果你习惯在宝塔 PM2 面板里操作，也可以：

- 项目目录填：`/www/wwwroot/sggame`
- 启动命令填：`npm run start`
- 项目名称填：`sggame-api`

## 九、验证是否部署成功

先看 Node 服务是否正常：

```bash
pm2 list
pm2 logs sggame-api
```

再访问：

```bash
http://你的域名/api/health
```

正常应该返回类似：

```json
{"ok":true,"model":"deepseek-ai/DeepSeek-V3.2","hasApiKey":true}
```

然后再打开首页：

```bash
http://你的域名
```

进入页面后发起一次 AI 推演。
只要浏览器里不是直接请求 `127.0.0.1:8787`，而是请求当前域名下的 `/api/battle/stream`，说明前后端链路就是对的。

## 十、以后怎么更新

以后更新代码基本就是这几步：

```bash
cd /www/wwwroot/sggame
git pull
npm install
npm run build
pm2 restart sggame-api
```

如果你不是用 Git，而是重新上传文件，也一样：

1. 覆盖项目文件
2. 执行 `npm install`
3. 执行 `npm run build`
4. 执行 `pm2 restart sggame-api`

## 十一、常见问题

### 1. 页面能打开，但 AI 推演报错

优先检查：

- `pm2 logs sggame-api`
- `.env` 是否存在
- `SILICONFLOW_API_KEY` 是否正确
- Nginx 是否正确转发了 `/api/`

### 2. 刷新页面 404

说明 Nginx 缺少这句：

```nginx
try_files $uri $uri/ /index.html;
```

### 3. 浏览器提示 502 Bad Gateway

说明 Nginx 找不到 Node 服务，通常是：

- PM2 没启动
- Node 服务启动失败
- `AI_PROXY_PORT` 不是 `8787`
- Nginx 反代端口写错

### 4. Node 服务启动失败

先确认 Node 版本：

```bash
node -v
```

如果低于 `18`，升级到 `18+` 或 `20 LTS`。

## 十二、最适合你这个项目的最终方案

你这个仓库当前最稳的部署方式就是：

1. 宝塔建一个静态站点，根目录指向 `dist`
2. PM2 跑 `node server/index.js`
3. Nginx 把 `/api/` 反代到 `127.0.0.1:8787`
4. `.env` 只放服务器，不进前端

如果你愿意，我下一步可以继续帮你补两样东西：

1. 生成一份可直接粘贴到宝塔里的完整 Nginx 配置
2. 顺手给项目补一个 `.env.example`，把线上部署需要的环境变量整理好
