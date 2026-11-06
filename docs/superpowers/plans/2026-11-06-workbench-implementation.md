# 研究工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 在 Windows 交付可运行的 Copilot 研究工作台，页面可配置订阅模型和推理等级。

**Architecture:** React 页面调用本地 Node API，SQLite 持久化业务数据，独立 runner 管理 Copilot 原生研究与会话。复用已登录的 CLIProxyAPI，任务模型配置快照同时应用到 Copilot 和本地请求入口，以核对研究代理的实际模型。

**Tech Stack:** TypeScript、React、Vite、Node.js 24、node:sqlite、node-pty、Express、Markdown、YAML。

**Spec:** docs/superpowers/specs/2026-11-06-local-research-workbench-design.md

## Global Constraints

- Copilot 原生 /research 承担研究，ChatGPT 订阅承担模型推理。
- Windows 优先，平台相关的终端、进程与常驻管理独立封装。
- UI 使用中文，模型和推理等级支持全局默认、模板及每次启动覆盖，运行保存快照。
- 凭据位于已忽略的数据目录，页面只接收脱敏状态。
- 单用户回环服务，默认并发 1，每次默认预算 60 分钟。

## Review Focus

1. 切换模型后旧推理等级失效，前后端都能校验并给出可选值。
2. 研究子代理自行选择模型，最终请求也必须符合用户本轮选择并记录实际值。
3. 中文/空格目录、停止与续写、服务重启不会重复启动同一运行。
4. 请求只返回应用数据，模型上下文与日志不包含本地凭据。
5. 候选提炼与研究分开，重复启动或保存保持幂等。

## File Structure and Interfaces

- src/shared/types.ts 为 API 对象和配置类型。
- src/server/store.ts 为 SQLite 课题、标签、模板、任务、运行和产出物。
- src/server/models.ts 为模型目录、推理等级、研究配置校验和提示词。
- src/server/proxy.ts 为已有 CLIProxyAPI 生命周期、账号状态及模型请求入口。
- src/server/research.ts、runner.ts 为独立进程与原生研究事件管理。
- src/server/index.ts 为业务 API、认证、静态页面、事件和文件读取。
- src/client/ 为中文工作台、配置表单、任务详情、文档和后续处理。
- scripts/ 为启动、停止、系统常驻适配与 task.yaml 启动。
- tests/ 使用真实 SQLite 和本地模拟模型端验证边界，实时订阅小任务单独验收。

### Task 1. 模型配置及执行能力

- [x] 定义共享 API 和 ResearchConfig，页面模型与推理等级组合携带到运行。
- [x] 先写测试验证无效组合拒绝、旧配置补默认、请求模型和 reasoning.effort 生效，运行确认失败。
- [x] 实现目录归一化、配置校验及提示词，运行测试通过。
- [x] 用小规模原生 /research 验证当前 Copilot 的交互、模型路由、报告和收尾事件。

### Task 2. 持久化业务

- [x] 先写真实 SQLite 测试，覆盖重启、标签继承、优先级、配置快照、重复启动、候选保存幂等和目录关联。
- [x] 实现 store.ts，测试通过。

### Task 3. 中文页面

- [x] 实现共享 API 对应的课题、任务、模板、标签、产出物与执行设置页面。
- [x] 模型表单联动推理等级，显示默认来源与本轮配置，支持编辑、启动及续写。
- [x] 页面测试验证模型切换、校验、保存与任务快照，构建和类型检查通过。

### Task 4. 执行与后续处理

- [x] 使用生命周期、持久化、心跳恢复测试及真实 Copilot 小任务验证完成判定与续写。
- [x] 实现独立 runner、会话事件读取、模型请求约束、预算、日志和报告登记。
- [x] 实现五类后续处理，候选生成单独作业并返回结构化候选。
- [x] 测试通过，实际订阅小任务及续写验收。

### Task 5. API 与启动

- [x] 先写 API 配置持久化、非法模型拒绝、原文路径边界、Origin 校验测试，确认失败。
- [x] 实现 API、SSE、文件阅读下载、YAML 导入导出和登录状态。
- [x] 提供 Windows 前后台启动、停止与可选登录启动适配，文档记录 macOS 入口。
- [x] 全套测试、类型检查、构建、浏览器主流程验证通过。

### Task 6. 审阅与交付

- [x] 独立代码审阅，修复重要问题并复跑测试。
- [x] 保存验证记录，启动工作台，交付入口并说明实测范围。

## Execution decisions

用户已明确要求开始实现，因此本计划随实施交付。在现有空白项目目录工作，当前无 Git 仓库，采用本地文件及测试记录验收。
