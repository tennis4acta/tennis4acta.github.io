---
name: generate-tennis-scoreboard
description: '为 ACTC Jekyll 网站新增网球比赛实时积分页。用户提到新赛事、比赛项目、分组、签表、实时比分或调用 /generate-tennis-scoreboard 时使用；基于现有 event.html 系统生成赛事配置并接入页面。'
argument-hint: '赛事名称、页面位置、分组名单和赛制；也可提供赛程文件'
user-invocable: true
---

# 生成网球实时积分页面

为新的网球比赛项目接入仓库现有的实时积分系统。系统已经由 `_includes/event.html`、`js/tournament.js`、`css/tournament.css` 和 `_config.yml` 提供；通常只需新增赛事 YAML，并在目标赛事页面加入 Liquid include。不要为每个新项目复制或改写共享组件。

## 工作流程

1. **定位目标页面和现有赛事。** 查看用户指定的比赛资料和页面；检查 `_data/events/` 中的配置、`events/scores/` 中的比分文件，以及页面中已有的 `{% include event.html id="..." %}`。参考 `_data/events/demo.yml` 的字段和同类型正式赛事配置。先阅读 `ai_tools/scoreboard.md` 了解现行设计、使用和计分规则。保留工作区已有改动。

2. **确认必要输入。** 从用户提供的资料提取赛事名称、唯一 ID、分组与名单、每组出线人数、计分规则、排名顺序、淘汰赛规则，以及要接入的页面。资料没有明确的赛制参数时，先询问缺少的信息；不要自行推断或更改比赛规则。若分组名单尚未确定，可以先做用户明确要求的配置部分，并说明未完成项。

3. **生成赛事配置。** 新增 `_data/events/<id>.yml`，配置结构遵循 `demo.yml`：
   - `name` 是页面标题；`groups` 将组名映射到选手名单。双打组合按系统约定写为一个名称，例如 `张三 & 李四`。
   - `rules.advance` 表示每组出线人数，`0` 表示只进行小组循环赛。
   - `rules.points`、`rules.tiebreakers`、可选的 `rules.draw`、`rules.third_place`、`rules.show_set_column` 和 `rules.score_hint` 必须与主办方给出的规则一致。每组固定提供 Table / Match 切换，旧 `rules.show_order` 已忽略，不再为新项目添加。只有在规则已确认或用户明确授权采用模板默认值时才填默认值。
   - `id` 使用唯一的小写英文字母、数字和连字符；先检查配置文件和比分文件，不能覆盖已存在或正在使用的赛事 ID。
   - 保持姓名稳定、准确。赛事开始后改动姓名会使相应旧比分无法匹配。

4. **接入赛事页面。** 在用户指定的页面中加入 `{% include event.html id="<id>" %}`，ID 必须与 YAML 文件名一致。若创建新页面，遵循相邻赛事页面的 Jekyll front matter 和布局习惯；页面可以参考 `2026/womens_spring.md`。只有页面宽度需要时才设置 `wide: true`。一个页面可放多个项目，各自使用不同 ID。

5. **保护比分和凭据。** 不要改动 `_includes/event.html`、`js/tournament.js`、`css/tournament.css` 或 `_config.yml`，除非用户明确要求修改共享系统。比分 JSON 在首次录入比分时由系统创建；不要伪造比分，也不要覆盖 `events/scores/<id>.json` 中已有记录。不要创建、请求或写入 GitHub PAT、令牌或其他凭据；裁判令牌应只由裁判在页面登录时输入，并保存在其浏览器本地。

6. **验证接入。** 检查 YAML 文件名与 ID、页面 include 与 ID 完全一致，分组名单和赛制字段结构正确，没有重复 ID，也没有触碰现有成绩。若环境具备 Jekyll，运行项目现有构建检查；否则至少审阅相关 diff，并运行可用的 `git diff --check`。不要为验证而安装依赖。若用户提供了真实页面或本地预览环境，检查积分区块能正确显示。

7. **汇报结果。** 简要列出新增或修改的文件、赛事 ID、配置的赛制要点和验证结果。明确指出尚未提供或无法验证的信息；不要声称已测试 GitHub API 写入，除非确实执行了真实写入测试。

## 赛制参考

赛事配置的数据结构、比分解析、排名指标和淘汰赛行为以 `ai_tools/scoreboard.md` 及当前 `js/tournament.js` 实现为准；修改系统设计、规则约定或使用流程时，必须在同一次变更中同步更新该文档和相关公开指南。`score_board/score_system.md` 仅作历史参考。常见排名指标包括 `points`、`wins`、`h2h`、`set_diff`、`game_diff`、`set_ratio`、`game_ratio`、`sets_won`、`games_won` 和 `games_lost`。不要把系统不支持的规则写进配置；遇到跨组排名等不支持的晋级规则时，说明限制并先与用户确认处理方案。