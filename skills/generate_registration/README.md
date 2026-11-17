# 赛事报名表工具

输入比赛项目及名额（如 `Mens Singles Grade A=16`），生成网站报名页。报名数据写入俱乐部自己的 Google 表格（Google Apps Script），取代以往 Eventbrite、SportsLogic、ClassHub 的报名功能。报名费尚未实现，方案见文末。需要 Node.js 18 或以上，无运行依赖。开发记录见 [workflow.md](../../workflow.md)。

## 组成

| 文件 | 作用 |
|---|---|
| [generate_registration.js](generate_registration.js) | 生成器：写入报名配置和页面 |
| `_data/registration/<id>.yml` | 报名配置：项目、名额、年龄、来源地、声明等，可直接修改 |
| `<year>/register.md` 或 `test/<year>/register.md` | 页面，只包含 include |
| [registration_form.html](../../_includes/registration_form.html) | 表单模板 |
| [registration.js](../../js/registration.js)、[registration.css](../../css/registration.css) | 前端交互与样式 |
| [registration/forms.json](../../registration/forms.json) | 发布全部报名配置，供后端读取 |
| [registration.gs](../../scripts/registration.gs) | Google Apps Script 后端（不发布到网站） |
| [test-registration.js](../../scripts/test-registration.js) | 后端模拟测试 |

## 生成

```powershell
node skills/generate_registration/generate_registration.js --year 2028 --events "Mens Singles Grade A=16; Womens Doubles=20; Seniors Doubles 50-70=10"
```

- 每项写成 `项目名=名额`，用分号或换行分隔，`:`、`：` 也可。也可用 `--file events.txt`（UTF-8）或 `--file -`（标准输入）。
- 名额：单打按人数，双打按对数，范围 2–512。
- 项目名必须含 Singles/Doubles 或 单打/双打/混双。另可识别 Mens/Womens/Mixed、男子/女子/混合、Grade A/A级别、`50-70`、`50+`、`50岁以上`、Seniors/中年。
- 能完全识别时，自动生成与 2026 一致的中英文名称，如“男子单打 A级别 / Men's Singles Grade A”。无法完全识别时保留原文并给出警告；可写成 `中文名 | English name` 同时指定两种语言。
- 项目 ID 如 `singles_a`、`doubles_w`、`doubles_s`、`doubles_x`。`requirements` 使用同名键，显示 `_data/tournament.yml` 中对应的参赛要求。两个项目得到相同 ID 时报错。
- `--test` 生成 `test-<year>` 配置和 noindex 页面 `/test/<year>/register/`；默认生成 `<year>` 配置和 `/<year>/register/`。`--title` 指定赛事名称，`--dry-run` 只打印结果。
- 已有文件拒绝覆盖。

## 配置

生成的 YAML 带英文注释，主要字段：

- `endpoint`：Apps Script 网址。为空时是预览模式：可以试填并查看将提交的信息，但不发送数据。
- `status`、`opens`、`closes`（及 `*_text`）：自动开放/截止，或用 `status: "open"` / `"closed"` 手动控制。前端和后端都检查。
- `waitlist`：满额后是否继续接受等候名单登记，默认 `true`。
- `age`：默认 17–70 岁，按“赛事年份 − 出生年份”计算；项目可用自己的 `age` 覆盖（如中年组 50–70）。
- `origins`：来源地选项，默认中国大陆、香港、澳门、台湾。
- `days`：每位球员每个比赛日只能有一个有效报名；默认单打、双打各一天，`date_text` 可填日期。
- `events`：`id`、`name`、`name_en`、`day`、`format`（singles/doubles）、`gender`（male/female/mixed/open）、`capacity`、可选 `age`、`requirements`。
- `declarations`：报名前的勾选声明；`required` 必选，`doubles_only` 仅双打显示。文字可按当年规程修改。
- `fee_note`：报名费说明文字。

修改名额等配置后推送即可。后端约 15 分钟内读到新配置（GitHub Pages 缓存约 10 分钟，加上脚本缓存 5 分钟）。

## 收集的信息

| 信息 | 用途 / 依据 |
|---|---|
| 项目 | 必填，下拉显示名额及剩余名额 |
| 姓、名（与驾照或护照一致） | 参赛者须知要求按证件填写 |
| 英文名 | 可选，用于分组和成绩显示 |
| 性别 | 仅混合双打需要，须一男一女 |
| 出生年份 | 年龄限制和中年组；规则按出生年份界定，因此不收完整生日 |
| 来自（大陆/香港/澳门/台湾） | 参赛资格 |
| NTRP 自评 | A/B 级别资格 |
| UTR（两年内最高；双打项目填单、双打中较高者） | 资格，可留空 |
| 专业经历；如有，填退役年份及说明 | 退役年限、纯业余规定 |
| 手机（两位球员必填）、电邮（报名人必填，搭档可选）、微信（可选） | 联络、确认邮件 |
| 紧急联系人、备注 | 可选 |
| 声明 | 规程与资格、健康、保险、免责、退赛退款、个人信息为必选；双打另需搭档同意；照片授权可选 |

前端和后端都会校验上述规则。双打每对只需一人报名，并填写搭档信息。

## 页面行为

- 已连接后端时显示各项目剩余名额；满额后提示“提交后将列入等候名单”。报名成功后显示报名编号、状态和提交内容汇总。
- `?event=<id>` 可预选项目。正式开放时，把 `_data/tournament.yml` 的 `registration.url` 设为 `/<year>/register/`，各项目 `reg_url` 设为 `/<year>/register/?event=<id>`。
- 等候名单已内置，不需要另建等候名单页面。

## 部署后端（每届一次）

1. 用俱乐部 Google 账号新建表格，打开“扩展程序 → Apps Script”，粘贴 [registration.gs](../../scripts/registration.gs)，确认 `CONFIG_URL`。
2. 选择“部署 → 新部署 → 网页应用”，执行身份选“我”，访问权限选“任何人”，并授权访问表格、外部网址和发送邮件。
3. 把 `/exec` 网址填入 YAML 的 `endpoint` 并推送。确认 `https://actc.org.au/registration/forms.json` 可以访问。
4. 先在测试页提交一条测试报名，检查新标签页和确认邮件，然后删除测试数据。

修改脚本后，需在“管理部署 → 编辑”中选择新版本，网址不变。

## 日常管理

- 每个配置对应一个标签页，脚本按表头读取。可以新增列（如“已付款”）或调整列顺序，但不要改表头名称。
- `Status`：`registered` 占用名额，`waitlist` 按先后排队，改为 `withdrawn`（或其他值）即释放名额。
- 有人退赛时，先把该行改为 `withdrawn`，再把同项目最早的 `waitlist` 改为 `registered` 并联系对方。只要仍有人等候，新报名一律进入等候名单，以保证先后顺序。
- 同一球员（姓名加出生年份，忽略大小写、空格和姓名顺序）每个比赛日只能有一个有效报名，包括作为搭档。
- 单元格以文本保存，导出 CSV 时不会被当作公式执行。
- 确认邮件使用 MailApp 每日配额（个人 Google 账号约 100 位收件人/天，Workspace 约 1500）。`Confirmation email` 列记录 `sent`、`quota` 或 `failed`；不需要时把 `SEND_CONFIRMATION` 改为 `false`。

## 隐私

只收集办赛所需信息，出生日期只收年份。数据保存在俱乐部 Google 账号中，表格只与组委会共享，赛后按需删除。不要把任何凭据写入仓库。

## 验证

```powershell
node --test skills/generate_registration/generate_registration.test.js
node --test scripts/test-registration.js
```

后端测试在 Node 的 vm 中运行 `registration.gs`，表格、锁、缓存、网络请求和邮件均为内存模拟，不调用 Google 服务。真实部署需按上面的步骤手动测试。

## 报名费方案（未实现）

依据：2026 年 11 月 16 日查阅的公开资料，正式实施前请再核对。

- 澳洲储备银行（RBA）的改革自 2026 年 10 月 1 日起禁止对 eftpos、Mastercard、Visa 卡收取附加费，网上付款同样适用，非营利组织也没有豁免（[RBA](https://www.rba.gov.au/media-releases/2026/mr-26-10.html)、[ACCC](https://www.accc.gov.au/business/pricing/card-surcharges)）。
- 因此不应再写“$40 + 手续费”这种只针对刷卡的费用。应标示含手续费的总价，例如单打 $41、双打每对 $62，或维持 $40/$60 由俱乐部吸收约 $1 的手续费。
- 对所有付款方式都收取的统一费用仍然允许，但必须计入标示的总价。PayID 优惠也允许，前提是全价同样醒目地标示。

推荐方案：先报名占位，再用 Stripe Payment Links 网上付款，PayID 转账作为备选。

1. 每种价格建一个 Stripe Payment Link（如单打、双打）。Stripe 澳洲本地卡费率为 1.65% + A$0.30，$40 约 $0.96，$60 约 $1.29，无月费（[价格](https://stripe.com/au/pricing)）。
2. 提交报名后，状态为 `pending`（占名额）。成功页和确认邮件显示“立即付款”按钮，链接为 `<Payment Link>?client_reference_id=<报名编号>&prefilled_email=<电邮>`（[URL 参数](https://docs.stripe.com/payment-links/url-parameters)）。
3. Apps Script 定时触发器每 10–15 分钟用只读受限密钥查询已完成的 Checkout Session，按 `client_reference_id` 把对应行标为已付款，记录金额和时间。
   - 密钥存放在脚本属性中，不进仓库。
   - 不使用 webhook，因为 Apps Script 读不到请求头，无法验证 Stripe 签名。
4. 设付款期限（如 48 小时）。逾期未付改为 `expired`，名额按顺序给等候名单。
5. 核准的退赛在 Stripe 后台退款；原交易手续费不退还。
6. 备选 PayID：显示俱乐部 PayID，附言填报名编号，由财务手动核对后标记已付款。免手续费，但需人工处理。

按每年约 200 个报名估算：Stripe 手续费约 A$190–260；TryBooking 或 Humanitix 非营利价约 A$300–400；Eventbrite 约 A$670–880。其他可选方案：

- Square 付款链接，2.2%；
- PayPal 慈善费率，1.10% + A$0.30，需申请；
- 继续用第三方平台收费，但报名者要重复填写，不推荐。

实施时需要修改：

- 配置：增加项目价格和付款链接，以及付款期限；
- 后端：增加 `pending`、`expired` 状态和付款列，新增 Stripe 同步触发器；
- 前端：成功页和邮件增加付款按钮；
- 文档：更新本说明。

实施前请先确认价格、付款期限和收款账户。
