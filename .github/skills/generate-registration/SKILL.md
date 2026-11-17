---
name: generate-registration
description: '为 ACTC 网站生成赛事报名表。用户提供年份和比赛项目及名额（如 "Mens Singles Grade A=16"），要求新建报名页、报名表预览、等候名单或连接 Google 表格收集报名时使用。工具位于 skills/generate_registration。'
argument-hint: '年份、项目=名额列表；可选赛事名称、是否先生成隐藏测试页'
user-invocable: true
---

# 赛事报名表生成

## 入口

先读根目录 `AGENTS.md` 和 [工具说明](../../../skills/generate_registration/README.md)。使用 [现有脚本](../../../skills/generate_registration/generate_registration.js)、[表单模板](../../../_includes/registration_form.html) 和 [后端](../../../scripts/registration.gs)，不要另写一套表单或后端。

## 流程

1. 确认年份和“项目=名额”列表。单打名额按人数，双打按对数；用户未说明时须确认。询问是否先生成隐藏测试页（`--test`）。
2. 先 `--dry-run` 核对，再生成：

   ```powershell
   node skills/generate_registration/generate_registration.js --year 2028 --events "Mens Singles Grade A=16; Womens Doubles=20" --test
   ```

   含中文的列表优先写入 UTF-8 文件后用 `--file`，不要经 Windows PowerShell 管道传入。
3. 处理警告：
   - 无法识别的名称：改写为 `中文名 | English name`；
   - 中年组未写年龄：在 YAML 中补 `age`。

   生成器不会覆盖已有文件，不要删除旧配置来强行重建。
4. 核对 YAML：
   - `days[].date_text`、`opens`/`closes`、`age`、`origins`；
   - 声明文字是否符合当年规程；
   - `requirements` 键是否在 `_data/tournament.yml` 中存在。
5. `endpoint` 为空时页面为预览模式。本机没有 Jekyll 时，可在 git 忽略的 `tmp/` 中用 LiquidJS 渲染预览，不改动仓库依赖。
6. 连接后端时按 README 部署 Apps Script 并填写 `endpoint`。不要把令牌、密钥或报名数据写入仓库。
7. 正式开放时，把 `_data/tournament.yml` 的 `registration.url` 改为报名页，各项目 `reg_url` 设为 `?event=<id>`。

## 验证

```powershell
node --test skills/generate_registration/generate_registration.test.js
node --test scripts/test-registration.js
git diff --check
```

后端测试为模拟验证，不能写成真实 Google 表格写入或邮件已通过。修改表单字段时，须同时修改 `registration.gs`、`js/registration.js` 和测试，并在 `workflow.md` 记录。

## 报名费

尚未实现，方案见 README 末节。实施前须与用户确认价格、付款期限和收款账户。卡附加费已禁止，标示价须为含手续费的总价。
