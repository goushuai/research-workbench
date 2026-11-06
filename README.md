# 本地研究工作台

使用 Copilot CLI 原生 `/research` 组织研究，通过本机 CLIProxyAPI 连接安装者自己的 ChatGPT 订阅账号。提供课题、任务、配置模板、独立报告阅读页与程序化 PDF 转换。

## 两种安装方式

### 自动安装

Windows 双击 `Install.cmd`。macOS 在终端进入仓库目录后运行下面的命令，也可执行 `Install.command`。

```sh
bash install.sh
```

脚本识别 Windows、macOS 及 x64、ARM64。缺少 Node.js 24 时下载官方便携版本并核对 SHA256。随后安装依赖、构建应用、安装 Copilot CLI 1.0.106 与 CLIProxyAPI 8.0.57。CLIProxyAPI 发行包使用固定 SHA256 校验。

PDF 转换优先使用已安装的 Edge 或 Chrome，缺少浏览器时通过 Playwright 下载 Chromium 到部署目录。安装需要访问 npm、GitHub 和相应官方分发服务。macOS 原生依赖编译可能需要 Xcode Command Line Tools，Windows 原生依赖编译可能需要 Python、Visual Studio C++ Build Tools。

Windows 安装入口在 HTTP 代理环境变量为空时沿用系统已配置的代理，也支持通过 WORKBENCH_NETWORK_PROXY 显式指定。

默认部署在仓库同级的 `<仓库名>-deploy`。安装完成后访问 [本地工作台](http://127.0.0.1:8765)，在“执行设置”中完成 ChatGPT 登录。授权由使用者在浏览器中完成。

Windows 使用 `Install.cmd -NoStart`，macOS 使用 `bash install.sh --no-start`，可以只完成安装。

### AI 引导的手工安装

把仓库内 `install.prompt` 的内容交给其他 AI。该提示词完整列出技术栈、依赖、工具来源、平台选择、目录布置、配置创建、启动和验收步骤，独立完成安装过程。

## 源码与部署目录

```text
workspace/
  research-workbench/                 Git 仓库与开发依赖
    src/ scripts/ tests/ config/
    install.prompt
  research-workbench-deploy/          本机部署
    app/                             可独立运行的源码快照、依赖与构建结果
    state/
      workbench/                     SQLite、会话、日志、研究材料与报告
      cliproxyapi/                   本机转接配置与 OAuth 凭据
    tools/                           Copilot、CLIProxyAPI、可选 Node 与 Chromium
    cache/                           npm 缓存
    tmp/                             下载和执行临时文件
    backups/                         迁移前数据及升级前的应用快照
    deployment.json                 本机部署信息
    Start-Workbench.cmd
    Start-Workbench.command
```

源码目录和部署目录可以独立备份。运行程序位于部署目录的 `app`，修改源码后重新执行安装即可更新应用。更新前先停止所有研究、等待候选生成结束，再停止网页服务。更新保留数据库和登录配置。

Windows 使用部署目录或源码目录的 `Start-Workbench.cmd`、`Stop-Workbench.cmd`。macOS 使用对应 `.command` 文件，也可在终端执行它们。停止网页服务后，独立研究进程仍会继续运行，停止研究使用页面中的停止按钮。

也可以在源码目录执行 `npm start`，它会转向已部署的应用。开发模式使用 `npm run dev`，运行数据仍进入部署目录。

## 可分享的默认配置

`config/defaults.json` 是可审查的配置种子。首次创建空数据库时，导入默认研究配置、自定义模板与内置模板隐藏设置。已有数据库继续使用自身配置。12 类内置任务模板及其提示词保存在源码中。

配置种子采用字段白名单，清除工作目录、输出目录和机器关联信息。新数据库的课题、任务、运行、候选、产出物、标签与归档目录初始为空。每台安装使用独立生成的本机访问密钥，并由安装者登录自己的订阅账号。

修改基础设置后，在源码目录执行下面的命令更新分享配置，再核对其中的模板名称、提示词和读者背景。

```sh
npm run export:setup
npm run audit:public
```

导出会读取当前部署的设置与模板。可通过 `--database` 指定数据库，通过 `--output` 指定输出配置路径。浏览器主题和后续处理草稿属于该浏览器的本地偏好。

## 技术栈与依赖

| 范围 | 组件与作用 |
| --- | --- |
| 运行时 | Node.js 24+、内置 `node:sqlite`、TypeScript、tsx |
| 前端 | React 19、React DOM、Vite 7、lucide-react 图标 |
| 服务端 | Express 5、node-pty 独立终端与研究进程 |
| 配置 | YAML、jsonc-parser、Zod |
| 报告 | marked 解析 Markdown、DOMPurify 清理 HTML |
| PDF | playwright-core 调用浏览器排版、pdfjs-dist 页面阅读 |
| 研究执行 | Copilot CLI 1.0.106 |
| 订阅转接 | CLIProxyAPI 8.0.57 |

精确应用依赖由 `package-lock.json` 锁定，安装使用 `npm ci`。平台发行包版本和校验值记录在 `scripts/install-support.mjs`。

## 日常使用

- 课题配置保存后可直接开始，已启动课题移出待研究列表。
- 任务页面显示每轮启动配置、执行日志、停止和同会话续写。
- 任务模板包含任务约束、报告类型、深度、篇幅、侧重点、读者和资料策略。
- 模型与推理等级可以按默认设置、模板或单次任务配置。
- 产出物以表格展示，MD 与 PDF 分别进入新阅读页。PDF 通过本地程序转换。
- 继续探索提供重写、术语提取、核验更新、深化问题与衍生课题。后两项支持多选章节。
- 删除清理归档记录。运行中任务需先停止，候选生成中需等待完成；历史文件保存在部署目录。
- `task.yaml` 提供通用课题示例，页面支持导入导出，也可使用 `npm run research -- task.yaml`。

## 部署配置与备份

| 环境变量 | 用途 |
| --- | --- |
| `WORKBENCH_DEPLOY_DIR` | 自定义部署目录，安装及后续运行使用同一值 |
| `PORT` | 工作台端口，默认 8765 |
| `WORKBENCH_NETWORK_PROXY` | 新安装时写入 CLIProxyAPI 的网络代理，支持按需使用现有 HTTP 代理环境变量 |
| `COPILOT_PATH` / `CLIPROXY_PATH` | 覆盖研究工具可执行文件 |
| `PDF_BROWSER_PATH` | 覆盖 PDF 排版浏览器 |
| `RESEARCH_DATA_DIR` / `CLIPROXY_DATA_DIR` | 高级数据目录覆盖选项 |

工作台与订阅转接仅监听本机回环地址。凭据、数据库、日志和报告保存在部署目录。备份前停止全部研究、网页与转接服务，再复制部署目录的 `state`。升级前应用快照在 `backups`，也可保留整个部署目录。

旧版仓库内的 `.local-state` 与 `.local-tools` 可以在停止网页、研究和转接进程后执行 `node scripts/migrate-legacy.mjs` 迁移。迁移更新数据库与会话路径，并保留迁移前数据副本。随后运行安装入口。

## 开发与验证

```sh
npm ci
npm test
npm run check
npm run build
npm run audit:public
```

Windows 安装和运行在本机验证。macOS 的发行包选择、脚本和共享逻辑有检查，原生终端、登录回调及睡眠恢复需在 macOS 实机验收。
