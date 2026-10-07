# 更新日志

> **README 只留「现在该怎么用」的最终结论**；本文件记录过程 —— 为什么这么改、试错过什么、每个时间点的历史数据快照。
>

## 2026-10-07

### 设置页：「合并官方默认看点」换成「一键更新住宿与看点」

**背景**：素材管理后台已下线，本机的住宿 / 看点**不再有人工手填的来源** ——
随代码打包的那份（住宿 `src/data/stays.json` → `SEED_STAYS`，看点 `curated_sights.json` →
`DEFAULT_SIGHTS`）就是唯一权威，不需要再为了「别覆盖用户手填」而做幂等合并。

**改动**：
1. `src/lib/storage.ts` 删掉 `mergeDefaultSights`，新增 **`syncBundleAssets()`** —— 按 `route.code`
   把真源的住宿与看点**整段覆盖**进本机路线，`store.setRoutes` 落库。
   只动 `hotels` / `sights`，路线、行程篮、行前清单、相册一律不动。
2. `DataContext` 暴露 `syncBundleAssets`（旧的 `mergeDefaultSights` 一并删除，没留墓碑）。
3. 设置页按钮改为「一键更新住宿与看点」，结果 toast：`已更新：29 条路线、116 家住宿、20 处看点`。
4. `test/storage.test.ts` 加 3 条：残留条目必须消失、真源没有该路线时清空、其它字段不动。

**已知的副作用**：行程篮里锁定的住宿若在新数据里已不存在（真源删了），锁定会失效 ——
这是数据更新的正常结果，已在确认弹窗里写明。

### 修：真源删掉的住宿，还赖在行程篮的推荐列表里

**现象**：清掉 854 条抓取住宿后，页面上住宿确实少了，但**行程篮「今晚住哪」的候选里它们还在**。

**根因**：`DataContext.mergeStays` 判断「这条是不是后台手填」用的是
`!bundleIds.has(h.id)` —— **当前 bundle 里没有 = 手填，保留**。
被删的那些 id 恰好都不在 bundle 里，于是每一条都被当成「用户在后台手填的」留了下来，
真源删数据这个动作对旧 localStorage 副本完全无效。

**改法**：改为**按 id 命名空间判定来源**（`src/lib/staySource.ts` 的 `isBundleStay`）：
`osm_` / `tourapi_` / `kakao_` / `manual_` 开头的都是 bundle 来源 ——
**bundle 里没有 = 真源不想要了，删**；只有 `hotel_` 开头（`emptyHotel()` 用 `uid('hotel')` 生成的）
才当后台手填保留。这样不用清 localStorage，刷新即生效。

**顺带**：`mergeStays` 从 `DataContext.tsx` 移到 `src/lib/staySource.ts`（纯函数），
新增 `test/staySource.test.ts` 7 条，把「删掉的不能残留 / 手填的不能冲掉」锁住。

### 隐藏素材管理后台的所有入口

导航菜单 + 页面里 7 处「去素材管理」链接**全部注释掉**（原文一行不删，都留在 JSX 注释里，
取消注释即可恢复）。`/admin` 路由本身没删，直接输地址仍能进后台。

| 位置 | 原入口 |
|---|---|
| `src/App.tsx` | 顶部导航「素材管理」 |
| `src/pages/RoutesPage.tsx` | 工具栏「管理素材」按钮、空状态「去添加第一条路线」 |
| `src/pages/RouteDetailPage.tsx` | 详情页「编辑」按钮 |
| `src/components/DayBoard.tsx` ×3 | 今晚住 / 附近没住宿 / 前一晚住 三处空态引导 |
| `src/components/StayPickerDrawer.tsx` | 抽屉空态引导 |

**顺带调了两处标点**（不然句子会断在破折号上）：DayBoard 前夜卡「…也推不出所在区域 ——」改句号、
StayPickerDrawer「还没有录入任何住宿 ——」改句号。
**顺带注释了 `StayPickerDrawer.tsx` 的 `Link` import** —— 它是唯一只因这些入口才 import Link 的文件，
留着会触发 `noUnusedLocals`。

**未动**：`AdminPage.tsx` 及其子组件（后台页面本身完整保留）。

### 清掉「脚本抓取」的住宿条目（删除 854 / 970 条）

**用户口径**：`src/data/stays.json` 里凡是**同时没有中文名和英文名**的条目（即脚本从 OSM / Overpass
抓来、没有人工给过名字的那批），全部删掉。**只删数据，抓取脚本一律保留**。

**判定规则**：`nameZh` 与 `nameEn` 均为空（null 或空串）→ 删；只要有一个非空就保留。
删除 854 条，保留 116 条（人工补录 21 条 + 已带中英文名的抓取 / TourAPI 条目）。

**做法**：新增 `scripts/drop_scraped_stays.py`（`--dry-run` 可先看会删多少，幂等）。
直接从 `towns[].hotels` 里移除，并同步 `town.count = len(hotels)`（源头 `fetch_stays.py` 就是这个口径，
不让它和实际条数对不上）。顶层留一条 `_dropped`（规则 / 数量 / 时间 / 还原命令）。

**还原**：`git checkout -- src/data/stays.json`；抓取脚本都还在，也可以重跑 `fetch_stays*.py` 重新生成全量。
保留的脚本：`fetch_stays.py`（OSM / Overpass）、`fetch_stays_tourapi.py`、`fetch_stays_kakao.py`
、`fetch_stays_manual.py`（人工补录入口）。

**试错两轮（都是我理解偏了口径）**：
1. 第一版做成「条目移出 `hotels`、原文存进 `_commentedHotels`」—— 用户：*「我让你注释，没让你删除」*。
   确实，原位置空了，在他眼里就是删除。
2. 第二版改成真行注释（原地 `// {...}`，前端加 `jsonc.ts` + `?raw` 导入来剥注释）—— 用户随后改主意：
   *「还是按照原计划删除 json 里的数据吧，但是原来爬取酒店列表的脚本还是保留」*。
   于是行注释方案整体回滚（`src/lib/jsonc.ts`、`test/jsonc.test.ts`、`comment_out_stays.py` 已删，
   `seedStays.ts` / `DataContext.tsx` 回到直接 import），最终按真删除落地。

**收益**：`dist/assets/index.js` 575 KB → **282 KB**（gzip 154 → 115 KB）。

**影响**：추자도（楸子岛）27 条全被删 → 该镇住宿池为 0，路线 **18-1 / 18-2** 的住宿列表为空。
要补回楸子岛，往 `scripts/data/curated_stays.json` 里人工加条目再跑 `fetch_stays_manual.py`。

## 2026-10-05

### 修：「需住宿 N 晚」在行程单上变成 N+1 晚

**现象**：按天 tab 汇总写「需住宿 3 晚」，导出的行程单头部却写「4 晚住宿」。

**根因**：两处各写了一遍公式，口径不同 ——

- 按天 tab（`PlanPage`）：`有路线的天数 + 1`
- 行程单（`PlanPrintSheet`）/ Markdown：`印出来的天数 + 1`，而「印出来的天」= 有路线 **或有当天备注** 的空天

于是只要某天**没排路线、只写了备注**（自由活动 / 交通 / 休整日），它会被印进行程单、把住宿数 +1，
但那一节根本没有 🛏 住宿行（`StayCard` 对空天 return null，行程单的空天分支也只印备注）—— 数字凭空多一晚。

**改动**：

1. `src/lib/dayPlan.ts` 新增纯函数 `stayNights(days)`：**出发前一晚 + 每个有徒步路线的天当晚**；一趟都没排 → 0。
2. 三处一律改用它：按天 tab 汇总、行程单头部、Markdown 行程单的「住宿：N 晚」。
3. 行程单头部与 Markdown 在 `nights === 0` 时整项不出现（原来是「0 晚住宿」，属于误导）。
4. `test/dayPlan.test.ts` 加 `stayNights` 一组（含「写了备注的空天不算一晚」这条复现用例）。

**未动**：空天当晚到底要不要给住宿建议 —— 那是产品口径问题，本次只保证数字与实际印出来的住宿条数一致。

### 行前清单只留「要买 / 要准备 / 要做的流程」

**用户口径**：待办清单里只放需要动手的条目；纯认知、纯立场（「别把 XX 当主力」「注意 XX」）一律挪到下方速查卡片里当信息补充，
清单里不留这类「看了也不知道要干啥」的条目。

**改动**（`src/lib/prep.ts`）：

1. **删除 `money.alipay`**（「别把支付宝 / 微信扫码刷卡当主力」）：意识形态条目，没有对应动作。
   内容搬进新增的 **`pay`（钱）速查 section**：「主力：现金 + 国际信用卡」「韩元现金怎么换」两张卡片，
   并给第一条挂 `warn`（实测经验、非官方条款）。
2. **删除 `safety.busstop`**（「在天黑前结束路线，或确认末班车时间已留足」）：与 `transit.lastbus` 重复，
   且前半句是行为准则。信息并入 `transit.lastbus` 的 note（海岸线夜路无照明 → 按天黑前收工倒推出发时间）。
3. **`safety.tide` 由「注意潮汐、湿滑」改写为动作**：「涉水段出发前查当日潮汐时间」，note 保留涨潮切断通行段的事实。
4. **`transit.balance` 由「记住怎么查余额」改写为动作**：「上车前查一次余额」。

顺带把 `GUIDE_SECTIONS` 的 id 联合类型放开 `'pay'`，`PrepPage` 标题改为「吃喝住行与支付速查」
（目录与卡片渲染都是数组驱动，加 section 不需要改页面逻辑）。

**未动**：`PREP_PRESETS`（徒步装备 / 女士男士 / 大疆 / 相机 / 无人机）是候选池，由用户自己挑着加入，
不套用这条「必须是动作」的标准。

### 续：公交与打车组整体下沉到「行」速查卡片

**用户反馈**：「公交与打车模块里有很多这种啊，你怎么完全没懂」——上一轮只删了 2 条，判得太松。
用户选定的粒度是**最狠那档**：清单只留出发前能办完的事，落地后的操作整体搬进速查卡片。

**改动**：

1. `transit` 组 9 条 → 3 条，标题改为「交通与出行」：
   - 留：`transit.naver`（装 Naver Map 并试通定位）、`transit.taxi`（出发前在国内注册 Uber 并绑卡）、
     `transit.lastbus`（查回程末班车）。
   - 删：`transit.card`（买卡）、`transit.balance`（查余额）、`transit.charge`（充值）、
     `transit.tapout`（下车刷卡）、`transit.stop`（按铃挥手）、`transit.multi`（多人共用一张卡）——
     全是「到了济州怎么坐车」，不是行前准备，且下方「行」卡片里已写了同样的内容（两边重复）。
   - 顺带净化文案：`taxi` 从「确认支付方式再发单」改成动作句；`naver` 的兜底 App 清单下沉到卡片。
2. **图文教程跟着下沉**：`GuideCard` 新增可选 `tutorials?: string[]`（`PREP_TUTORIALS` 的 key），
   三份教程分别挂到「T-money：办卡与充值」（charge + balance）和「T-money：乘车操作要点」（tapout），
   卡片底部就地展开，复用原有的 `prepTutorialsOpen` 状态与 `TutorialBody`。
   `PrepPage.module.less` 加 `.guide-tutorials`（虚线分隔 + 教程面板贴左）。
3. 「T-money：办卡与充值」卡片补全被搬过来的内容：实体卡 / iPhone 电子卡二选一、开卡费不退、
   充值找收银台店员（带现金最稳，国际信用卡常被拒）。
4. `olle.ribbon` 由「认蓝 / 橙丝带走」改成动作句「沿路跟蓝 / 橙丝带走」。
5. 页头说明改写：明确「清单只收要买 / 要准备 / 要做的流程，落地后的操作在下方「行」卡片里」。

**没删的东西**：条目级教程机制（`tutorialOf(item.id)` + 就地展开）保留 —— 其他分组随时可以再挂教程；
三组教程本身也保留在 `PREP_TUTORIALS` 里，只是入口改在卡片上。

### 续 2：`偶来小路专属` 清单组整体删除，改为速查卡片

同一条口径的延续：这 6 条（买偶来护照、带护照盖章、跟丝带走、存离线轨迹、查天气、凑 100km）
**全是落地后才办得成的事**，一件都不属于行前准备 —— 整组删掉。

内容迁进新增的 **`olle`（偶来）速查 section**，放在「吃」之前（本 App 独有信息，不该沉到最后）：

- 「济州偶来护照」：落地买（约 ₩20,000 备现金）、盖章换完步证书与奖牌、景点折扣；
  完步证书只在西归浦偶来游客中心领取（从「住」卡片里已有的信息并过来）；
  warn 写「走完回头补章不可能，每天出发前把护照塞进包里」。
- 「路标：蓝 / 橙丝带」：跟丝带走、橙色双条是绕行段、别跟成别的主题步道。
- 「路线记录与天气」：离线轨迹、风浪预警、行程篮凑够 100km 后对照海拔剖面排体力。

`GuideSection['id']` 再加 `'olle'`（现在是 `'olle' | 'eat' | 'drink' | 'stay' | 'pay' | 'go'`）；
页面仍是数组驱动，目录与卡片自动带出。

### 续 3：`健康与安全` 从默认清单移入备选清单

- `PREP_GROUPS` 删掉 `safety` 组，`PREP_PRESETS` 新增同 id 的一份（`safety` / 标题「健康与安全」/ 短标签「安全」），
  排在第一份。**item id 沿用 `safety.*`** —— 状态按 id 记，旧勾选不丢（与 `gear` 当年同一个理由）。
- `PresetId` 加 `'safety'`；`PrepPage` 两处列举备选清单的文案、页头说明同步加上「安全」。
- 待办清单现在只剩 **证件与入境 / 钱与通信 / 交通：出发前要办** 三组（共 17 条），
  其余全部走「备选清单按需加入 + 速查卡片查信息」。

### 续 4：交通组补「提前办 T-money 电子卡」

`transit` 组新增首条 `transit.ecard`：出发前在国内装 mobile T-money App 线上开卡充值（标 `verify`）。
note 写清 iPhone 不能走 Apple Wallet、iOS 限制随版本变、电子卡在便利店充不了只能在 App 里充、
App 端过不了就落地买实体卡兜底。速查卡片「T-money：办卡与充值」同步加一句「电子卡可出发前办好、落地直接刷」，
两边口径一致不打架。交通组现有 4 条，清单合计 18 条。

### 续 5：`transit.ecard` 加图文教程 —— 顺带修正「电子卡便利店充不了」的错误

新教程 `PREP_TUTORIALS['transit.ecard']`（6 步 + 5 条 tips + warn + 3 个来源），绑在清单条目上就地展开。
内容来自**多源交叉验证**（Verified Korea / 中文攻略 / 去哪儿攻略，2026-10 检索）：

1. App Store 装 Mobile Tmoney（不用人在韩国）；
2. **别点 Start**（韩国手机号实名），走「Browsing / Foreigner」入口；
3. Add to Apple Wallet，选 iPhone / Apple Watch，无开卡费；
4. 设置 → 钱包与 Apple Pay → 特快交通卡 → 选 T-money（贴手机顶部，关机后备用电量还能刷约 5 小时）；
5. 充值：App 内 Apple Pay 只认 Mastercard / AMEX / 银联 / JCB（Visa 常被拒，最低 ₩1,000）；现金走便利店或地铁站充值机；
6. **服务模式**：钱包 → 卡 → 右上角「…」→ 卡的详细资料 → 服务模式 → 验证，约 1 分钟内有效 —— 现金充值不开这个机器感应不到。

⚠️ **顺带修正一处旧错误**：之前多处写着「电子卡在便利店一般充不了，只能在 App 里充」，与实测不符 ——
电子卡**能**用现金在便利店 / 充值机充，只是 iPhone 要先开服务模式。三处同步改掉了：
`transit.ecard` 的 note、`transit.charge` 教程的 tips、「T-money：办卡与充值」卡片。
另外补上「Apple Wallet 里直接开卡那条路要韩国发行的卡，走不通」这个关键前提。

⚠️ 教程文案不能用 markdown 加粗：`Tutorial.tsx` 是纯文本渲染，`**` 会原样显示。

### 续 6：交通组改名

`transit` 组标题改回 **「交通与出行」**；desc 里的「三件事」同步改成「四件事」（补了电子卡那条）。
清单现状：**证件与入境 / 钱与通信 / 交通与出行** 三组共 18 条。

### 续 7：立规矩 —— 对客文案禁止「更新日志式」元描述

用户原话：「像『这里只放出发前就能办完的四件事…不占清单 —— 看下方「行」速查卡片…』这种
类似于更新日志的文案禁止出现在网站里对客」。

**规则**（已写进 `.workbuddy/memory/MEMORY.md`）：页面文案只讲「要做什么 / 为什么重要 / 怎么做」，
不解释内容是怎么组织的；不出现日期、版本号、「移入 / 删除 / 原 X 组 / 只放 N 条 / 不占清单 / 看下方 X 卡片」等词。
沿革只进 `CHANGELOG.md` 与代码注释。例外：页尾「数据来源与边界」是合规声明，保留。

**本次清掉的违规文案**：

| 位置 | 原 | 现 |
|---|---|---|
| `transit` 组 desc | 「这里只放出发前就能办完的四件事…不占清单 —— 看下方「行」速查卡片…」 | 「出发前先把交通卡、导航和打车账号办妥，落地当天直接就能上路。」 |
| `olle` 速查 section desc | 「…都要落地才办得成，不占待办清单…」 | 「走偶来才有的那几件事：护照怎么领、路标怎么认、天气与潮汐在哪查。」 |
| 页头说明 | 「清单只收「要买 / 要准备 / 要做的流程」—— 落地之后…放在下方「行」卡片里」 | 只留「标临行复核的再确认一遍；不会动手的点图文教程；因人而异的到备选清单挑」 |
| female / male preset desc | 「通用清单之外的补充项」 | 「日常随身的小东西，按自己的习惯挑。」 |
| dji preset desc | 「不带无人机的那部分大疆装备」 | 「口袋云台相机、运动相机、无线麦克风这类随身影像装备。」 |
| camera preset desc | 「背微单 / 单反走的补充项。条目基本围绕…」 | 「背微单 / 单反走海岸线的取舍：按克算重量，重点防盐雾和沙粒。」 |
| drone preset desc | 「这一份大半是「能不能飞」」 | 直接写「起飞前先把禁飞区和许可要求看完，再决定带不带」 |
| `custom` / `extras` 组 desc（PrepPage） | 「官方清单没覆盖到的」「从「健康与安全 / 徒步装备 /…」几份备选清单里挑进来的」 | 「想加什么就加什么，随时能删。」「从备选清单挑进来、并进总清单一块算进度的条目…」 |

### 续 8：偶来护照 / 完步证书的服务点写细（护照在哪买 · 证书在哪领）

**用户要求**：「哪些服务站可以买护照和认证在偶来模块里写清楚」——原来只有一句「落地当天在机场 / 市区游客中心 /
起点附近店铺买」，等于没说。

**改动**（`GUIDE_SECTIONS` 的 `olle` section）：原 1 张「济州偶来护照」卡片拆成 2 张。

1. **护照在哪买（₩20,000，备现金）** —— 按「买了就能用」排序列出四类渠道：
   - 西归浦总部「济州偶来游客中心」（중정로 22，7 号线起点）—— 最稳；
   - 济州机场一楼国内到达出口对面咨询台（08:00–21:00，12:00–13:00 午休）；
   - 济州市 간세라운지 Ganse Lounge（관덕로8길 7-5，约 10:00–18:00，公休日休）；
   - 沿线起点咨询中心（1 / 4 / 5 / 10 / 11 / 14·14-1 / 15 / 16 / 18 / 19 / 21，7-1 在西归浦客运站内），
     多 08:00–17:00、午休 12:00–13:00、春节中秋休，18 号线周一休；
   - 不想跑腿：App「Olle Pass」买电子护照扫码盖章，或 ollestore.com 网购到机场取。
2. **完步证书在哪领** —— 只西归浦总部一楼一处，本人到场、不代领不补发；办理 09:00–11:30 / 13:00–16:30，
   午休与春节中秋不发；认定口径：起终点章要齐（含 -1 支线）、中途章最多缺 3 枚、纸盖章 / 拍照也算凭证；
   App 电子护照另出 100km 与全程两种证书；奖牌蓝 / 橙二选一。

**资料来源与取舍**：服务中心清单与营业时间取自官方英文站 jejuolletrailguide.net 的 Contact 页
与官方宣传册（ollestore.com / 各 안내센터）。⚠️ 关于「Ganse Lounge 也能发完步证书」有二手游记这么写，
**官方口径是只有西归浦总部一楼发**，卡片按官方写，并在 warn 里提示营业时间随季节调整、出发前确认。

**用户当场纠错（同一天）**：济州机场的偶来咨询台**只提供咨询与地图，不卖护照也不办认证**。
原先我按「机场咨询台 = 官方服务点」想当然地把它列进购买渠道（还有一句「ollestore 网购到机场取」）——
已把机场从购买渠道移到卡片末尾并注明只做咨询与地图，网购取货那句删掉。
教训：**「有官方咨询台」≠「能办业务」**，列服务点时要把该点实际办理的业务逐条对齐，不要按「官方网点」笼统归类。

**用户补的官方口径（同一天，据官方公告）** —— 修正我前面两处错误：

| 项 | 我原来写的（错） | 官方口径（现） |
|---|---|---|
| 颁发地点 | 「只有西归浦总部一楼一处」 | **偶来官方咨询处**：1、4、5、7、7-1、10、11、14、15、16、18、18-1、19、21 号线的咨询处都办（7 号即西归浦总部，7-1 在西归浦客运站内）；**机场咨询处除外** |
| 受理时间 | 只写时段 | 上午 09:00–11:30（11:30 截止受理）/ 下午 13:00–16:30（16:30 截止）；12:00–13:00 午休、春节与中秋当天停办 |
| 需带材料 | 只写「章要齐」 | 盖齐累计 100 公里所需起点 / 中间点 / 终点印章的护照，护照填好本人姓名与联系方式 |
| 代领 | 「不代领也不补发」 | 只保留「必须本人到场、不可代领」（「不补发」是官方另一处条款，不混进这张卡片） |

同步修正的两处连带错误：①「护照在哪买」里的沿线网点列表对齐官方编号（去掉 14-1、补 18-1，并注明 7 号 = 西归浦总部）；
②「住」卡片里「西归浦…也是唯一的完步证书领取处」改为「偶来游客中心（总部）所在地，7 号线起点」。

### 行程篮「选择住宿 / 取消住宿」点了没反应：住宿改为按天存储

**症状**：「按天」视图里点「住这家」，或点已锁定那家的「取消锁定」，界面都纹丝不动 —— 依旧显示旧的「已定：XXX」。

**先排除的**：不是 CSS。`DayBoard.module.less` / `StayPickerDrawer.module.less` / `global.less`
都没有 `pointer-events: none`、`opacity: 0`、`z-index` 冲突或 `disabled`，抽屉走 `createPortal` 挂到
`document.body`，不存在遮挡或裁剪。按钮的 `onClick` 也一路绑到了 `lockStay`，没有孤儿函数。

**根因**：住宿 `stayId` 存在 `PlanItem` 上，而读写用了两个不同的定位规则 ——

| 操作 | 函数 | 定位规则 |
|---|---|---|
| 写 | `setStayItems()` | 当天 **items 数组里最后一条**（`sameDayIdx[len-1]`） |
| 读 | `stayIdOfDay()` | 当天 **第一条带 `stayId` 的**（遍历即 return） |

`addRoute` 永远把新 item append 到数组尾部，所以**只要某天锁定过住宿、之后又往这天加了一条路线**，
「最后一条」就换人了：写落到新那条上，读仍然读到旧那条 → 改选和取消双双静默失效。

**修复**（住宿属于「这一天」，不属于某条路线）：

1. `types.ts`：`PlanItem` 删掉 `stayId` / `stayNote`；`Plan` 新增 `stays?: Record<number, string>`（天号 → 酒店 id）。
2. `dayPlan.ts`：`setStayItems` → **`setPlanStay(plan, day, stayId)`**（解锁后 map 为空则整个字段删掉）；
   `stayIdOfDay(plan, day)`；新增 **`removeDayStays()`** —— 删掉一整天时，后面几天的锁定跟着整体前移。
   `assignDayItems` / `removeDayItems` 里删 `stayId` 的语句一并去掉：**挪路线、删路线不再连带丢掉已订住宿**。
3. `stayMatch.ts`：`suggestStay()` 的第四参由 `items: PlanItem[]` 改为 `plan: Plan | undefined`。
4. `useActivePlan.ts`：`lockStay` 去掉从未被传值的第 3 参 `note`（连带删掉 `PlanItem.stayNote` 这条死路径），改调 `setPlanStay`。
5. `DayBoard.tsx` / `PlanPage.tsx`：`buildStays(days, plan, hotels)` 及 `dayStayGeo` 调用点同步。

**顺带修的两个「压根选不到住宿」**：

- `collectHotels()` 注释写着「按 hotel.id 去重」，实际**根本没去重**。`routeTowns` 是多对多，
  同一家会被多条同镇路线重复挂进来 → 候选列表出现重复项，React 的 `key` 也跟着撞车。已加 `seen` 集合。
- `StayCard` 推不出住宿建议（`suggestStay` 返回 `null`）时只给一段「去素材管理补录」，**没有任何入口** ——
  即使当天落脚点附近录过住宿也选不了。已对齐 `PrevStayCard`，补上「查看全部住宿（N 家）」按钮。

**验证**：`npx tsc --noEmit` 与 `npm run build` 均通过；另用 `tsc` 编译产物跑脚本复现旧 bug 并验证
新行为（改选 / 取消 / JSON 往返 / 删天后前移全部正确）。

**已知取舍**：改结构会丢掉本地已有行程篮里锁过的住宿（`PlanItem.stayId` 字段没了）。按本项目
「不做 localStorage 历史数据兼容 / 迁移」的约定处理，用户在页面上重新点一次即可。

### 新建 `test/` —— 纯逻辑单测（Vitest）

**动机**（用户原话）：「以后改代码的时候，不要把现在已有的功能给改错了、改乱了、或改漏了」。

**为什么只做逻辑层、不做 UI 单测**：项目里真正容易改崩的是 `src/lib` 的纯函数 ——
页面上的「第几天走哪条」「这天会不会太重」「今晚住哪」「爬升多少」全由它们算出来，
而这一层的错误不会报红，只是安静地显示错的东西（那天住宿「点了没反应」的 bug 根因就在
`dayPlan.ts` 的读写错位）。组件层重度依赖 Leaflet / CSS Modules / localStorage，
上 `@testing-library` 要造一堆 mock，收益不抵维护成本；真需要时把 `vitest.config.ts`
的 `environment` 改成 `jsdom` 即可，不用动别的东西。

**落地**：

- `vitest.config.ts`（新建）：只收 `test/**/*.test.ts`，`environment: 'node'`；
- `package.json`：`npm test`（单次跑）/ `npm run test:watch`（监听）；
- `tsconfig.json`：`include` 加 `test` —— 测试代码同样过 `tsc --noEmit`，
  `npm run build` 会因为测试里的类型问题一起失败，避免「测试本身已经写错了却还在跑」；
- `test/fixtures.ts`：造 `Route` / `Plan` / `Hotel` 的工厂。两个纪律写进文件头 ——
  ① id 必须写死（随机 id 会让去重类用例失去意义）；② 坐标用真实量级的济州岛经纬度
  （0/0 会让 8km 候选半径、1km 接驳断口这类断言失效）。

**六个测试文件，147 条**：

| 文件 | 覆盖 |
|---|---|
| `dayPlan.test.ts` | 分天与时辰、离岛、反穿取端点、items 增删移、住宿按天锁定、按天告警 |
| `geo.test.ts` | 距离、爬升（3m 噪声阈值）、断口分段、画线几何、徽标落点 |
| `stayMatch.test.ts` | 每晚 / 前夜建议的构成、锁定不改写区域建议、候选去重与全量兜底 |
| `staySearch.test.ts` | 大小写不敏感、分隔符、多词且关系、罗马音 ↔ 英文惯用拼写 |
| `storage.test.ts` | 归一化、备份导入导出（replace / merge）、脏 JSON、设置白名单 |
| `display.test.ts` | 三语名称回退、官方耗时/路面/路线类型、清单 id 唯一等数据不变量 |

**写断言的口径**：给**现象级的期望**（起床时刻应该是几点、删第 1 天后第 3 天那晚的住宿
落到第几天），不照着实现抄公式 —— 后者只防得住重构，防不住算错。

**测试顺带抓出的真实 bug（已修）**：`src/lib/storage.ts` 的 `normalizeRoute` 里
`elevationSegments` 的注释写着「脏段直接丢」，实现却是 `...(segs.length ? { 字段 } : {})` ——
而该对象是从 `...route` 展开来的，没有合法分段时展开空对象等于什么都不做，
那段单点 segment 原样留在了「已经归一化过」的路线对象上。改成命中 `Array.isArray`
时显式赋值 / `delete`。影响面已核过：唯一消费方 `geo.trackSegs` 本来就过滤 `length >= 2`，
所以是「文档与实现不一致」，不是用户可见问题。

### 人工补录住宿：城山「胡安酒店」Hu An Stay Hotel（휴안스테이 호텔）

**背景**：用户给了东线城山一家经济舒适型酒店的完整档案（位置、规模、评分、设施、周边距离、优缺点），录入口径同上一家 Playce Camp。

**落地**：`scripts/data/curated_stays.json` 新增 `manual_hu-an-stay-hotel`（排在 `manual_playce-camp-jeju` 之后），
`matchKeys` 覆盖韩文（휴안스테이 / 휴안스테이 호텔 / 휴안스테이호텔）、英文（Hu An Stay / Hu An Stay Hotel）、
中文（胡安酒店 / 济州胡安酒店 / 城山胡安酒店）三种写法；`nameZh`/`nameEn` 带 `nameZhOfficial`/`nameEnOfficial` 保护，
`gen_stay_zh.py` 不会把用户给的中文名清空。跑完 `fetch_stays_manual.py → gen_stay_zh.py → gen_stay_en.py`，
城山镇 54 → 55 家，全库 970 条（去重 782）。

**坐标来源要记一笔**：本次 Nominatim 两次空返回、Overpass（`overpass-api.de` 返 HTML 错误页、`overpass.kumi.systems` 空返回）都没拿到这家酒店的 OSM 节点，
坐标 `126.9332 / 33.4586` 是**按地址 성산중앙로 37번길 9 落在城山里村核心区推算**的：到官方航点「Seongsan Ilchul-bong(peak)」
（`126.935676 / 33.462152`，见 `src/lib/waypointsData.ts`）直线约 420m、到广崎其海滩约 600m，与平台给的「日出峰 610m / 广崎其 1.1km 步行」比例吻合。
**待核验**：下次 Overpass 通了按 `name~휴안` 复核一次，误差应在 100–200m 内，不影响 8km 候选半径与「离路线 N km」的判定。

**对客文案**：intro 按 Playce Camp 的同构格式写（基础信息 / 入住政策 / 设施 / 位置与周边 / 优缺点 / 适合谁 / 订房建议）。
用户档案里「设施按经济型期待」「不要默认含早」这类判断都写进去了；**没写**任何「本条由 XX 整理 / 补录于」之类的编辑动作词。

### 顺带：README 住宿数字对齐实测

四语种 README 的「沿途住宿」一行还写着「OSM 抓来的 239 家（12 条线命中）」，是合并 TourAPI 与人工核对源之前的旧值。
实测：全库 970 条、按 id 去重 782 家、`routeTowns` 映射下来 **29 条线全部有住宿镇**。
已把四份 README 统一改成「782 家（OSM / TourAPI / 人工核对合并，29 条线全部命中）」。

## 2026-10-03（续·9）

### 删掉「近似剖面」：`olleeElevation.ts` 改为由真实轨迹派生

**结论**：那张沿「起终点直线 / 环线圆周」采样 SRTM 的**估算表彻底不用了**。29 条线已全部有真实轨迹（见续·8），
高程序列直接取轨迹点本身 —— `scripts/build_elevation_from_tracks.py` 从 `public/tracks.json` 派生 `src/lib/olleeElevation.ts`，
`basis` 只有 `'track'` 一种，`scripts/fetch_elevation.py` 与 `scripts/.cache/elevation.json` 一并删除。

**为什么值得做**：此前 seed 用估算表、运行时 `DataContext.mergeTrack` 用真实轨迹覆盖，两者口径不同，
首屏会看到「估算剖面 → 被真实剖面换掉」的跳变；`basis` 也有 `line` / `loop` 两个估算口径要维护文案与分支。
现在 seed 与运行时**同源同值**，跳变消失，`ElevBasis` 收窄为 `'track'`（`types.ts`），
`RouteDetailPage` 的「环线圆周采样估算 / 直线采样估算」两条文案随之删除。

**顺带修的两个数据问题**：

1. **`06` / `07` 的轨迹点整条 `ele: null`**（当年导入时没加 `--elevation`），爬升一直显示「—」。
   新脚本 `scripts/fill_track_elevation.py` 就地补采（复用 `import_tracks.py` 的 `fill_elevations` + 缓存 + 限速）：
   06 = 爬升 213 m / 最高 71 m，07 = 爬升 391 m / 最高 144 m。
   ⚠️ `tracks.json` 是**单行**紧凑 JSON，`json.dump` 重写会让整行变成 diff 噪声，
   所以脚本做**字符串感知的花括号配平**、只替换 `"<code>":{...}` 那一块，其余字节不动（已校验：只有 06/07 两块变化）。
2. **`src/data/olle-endpoints.json` 缺 `03-A` / `03-B` / `15-A` / `15-B` 四条**（`check_endpoints.py` 报的 ❌）。
   根因是 `build_endpoints_data.py` 的 `parse_specs()` 正则 `([\d-]+)` **认不出带字母的编号**，
   拆 A/B 后重跑就把这 4 条整体漏掉（`tracks.json` 当时也没有 `03-B`/`15-B`，于是旧键也消失了），
   结果这 4 条线的权威起终点退回了 `PLACES` 的**城镇级近似坐标**。正则放开为 `([\d\-AB]+)` 后重跑，
   29 条齐了，且已有 25 条**一字未变**；`check_endpoints.py` 现在 ✅ 三向对账通过。
   交叉验证：03-A 与 03-B 的端点相距 10~30 m、15-A 与 15-B 相距 40~80 m，两条走法独立吻合。

**生成时的精度坑**：GPX 自带海拔是 0.1 m 级小数（`09 / 14-1 / 18-1 / 18-2`），一开始统一 `int(round())` 取整，
导致这 4 条的累计爬升少算 2~6 m（如 18-1 记 525 m、算出 523 m）。改成保留原始精度后与 `tracks.json` 完全对齐。

**现在的数字**（口径：`tracks.json`，`npx tsc scripts/check-elevation.ts` 逐条核对）：
29 条全部 `profile/track`、爬升缺失 0 条，合计爬升 **6504 m**；海拔来源 4 条轨迹自带 + 25 条 SRTM 沿轨迹补采。
四语种 README 的「海拔与爬升怎么算」优先级链、偏差条数（16 条 ±5% 内 / 13 条超出）、
爬升合计、目录结构与脚本清单已同步。

**验证**：`npm run build` ✅（exit 0）；`check_official_consistency.py` ✅ 29/29 有轨迹；
`check_endpoints.py` ✅ 三向对账通过；`check-elevation.ts` ✅ 爬升缺失 0 条。

## 2026-10-03（续·8）

### 15-B 轨迹到手：29 条全部有轨迹（28 实测 + 1 路网推断）

**结论**：`15-B` = 12.26 km / 爬升 45 m，**由 OSM 步行路网按「贴海最短路」缝合**，不是 GPS 实测。
`check_official_consistency.py` 现在报「29 条官方路线；有轨迹 29 条，**缺轨迹 0 条**」，15-B 偏差 -5.7%（⚠️ 复核级，与 08/14 同档）。

**前面那三个源为什么全灭（补记，别再重复试）**：

| 源 | 结果 |
| --- | --- |
| OSM route 关系 | 全岛 22 个 올레 관계 里**没有 15 号线**。bbox (33.39,126.23,33.49,126.37) 内 `rel[route]` 只有 8 个关系，含 `올레길 16코스`（`r cn`），无 15 |
| 官网 `jejuolle.org/trail#/road/15_B` | 只能拿到**图片版路线图**。`assets/trail-*.js` → `trail_ko_router-*.js` → `Road-*.js`（522 KB）逐层跟下来，路线数据是一堆 `road_15-B_map_pc.jpg` / `_level_2025.jpg` 之类的**位图 URL**，没有矢量坐标 |
| 社区站 `pamnjeff.com` | `JejuOlle15a/15b` 全 404（上一轮已记） |

**改成路网推断**。这条路能走通，靠的是三件事：

1. **bbox 内沿海路网其实是连通的**。翰林港→高内浦口之间 `highway=*` 有 1702 条 way（residential 746 / unclassified 286 / **footway 225** / tertiary 123 / secondary 112 / **path 27** / cycleway 19）+ 7 条 `natural=coastline`（2361 点）。沿海岸采样查「最近路网距离」，>250m 的缺口只有 2 处（翰林港西侧 365m、金城里东 316m），**主走廊连续**。
2. **有一条现成的沿海长 cycleway**：`way 1200721740`（5.39 km → 修正 haversine 后 **10.8 km**，`离海 2m`）从 (126.3109,33.4589) 一路贴海到 (126.3994,33.4813)，**高内浦口距它最近仅 6m**。这就是「한림해안산책로（翰林海岸散步路）」的骨架。
3. **官方途经点可以拿来验走向**。visitjeju 韩文页点名 4 个：`운용곶 무인등대`（云龙岬无人灯塔）、`제주 해수풀해녀학교`（济州海水浴场海女学校）、`금성리 바다`（金城里大海）、`곽지해수욕장`（郭支海水浴场）。Dijkstra 出来的路径到这 4 点的最近距离分别是 **60m / 10m / 79m** —— 4 个全中，说明走向不是随便一条沿海路。

**代价函数**（`/tmp` 里的一次性脚本，没进仓库，因为是一次性取数）：`cost = 段长 × 道路类型系数 × (离海距离惩罚)`。
调了 6 组参数，长度在 11.4~15.4 km 之间摆，最终取「严类型系数 + 幂 1.5 海距惩罚」那组：
`HW_PEN`（cycleway/footway/path 1.0 … tertiary 3.5 … secondary 5.0）× `1 + (min(离海,1500)/80)^1.5`。
**12.41 km / 平均离海 54 m**。选这组而不是更长的 15.38 km 那组，是因为类型占比更合理（tertiary 5.5 + cycleway 2.3 + footway 2.1 + residential 1.8），官方原文说的是「**해안도로를 따라**（沿着海岸道路）走」，tertiary 占比高是符合的；15.38 km 那组 cycleway 占 5.2km，形状反而更像在骑自行车道。

**⚠️ 踩到的坑（重要）**：

- **haversine 少乘了 2**，一度把 5.39 km 的 way 算成 2.7 km、Dijkstra 结果 5.41 km（比直线距离还短，一眼假）。
  正确写法是 `2*R*asin(√h)`，我写成了 `R*asin(√h)`。**任何距离算出来小于起终点直线距离，就是公式错了**，别去怀疑数据。
- **Overpass 会间歇性返回 HTML 错误页**（`Dispatcher_Client::request_read_and_idx::timeout`）而**不是 4xx**，脚本里不判 `Content-Type` 就 `json.load` 会炸。`overpass-api.de` 挂了可换 `overpass.kumi.systems`（本机实测 kumi 更慢，大 bbox 会超时）。
- **大 bbox + 无索引正则容易 504**。`way(bbox)["name"~"해안|산책|..."]` 直接超时；换成 `way(bbox)["highway"]["name"]`（两个有索引的 tag）拉回来 446 条再本地过滤，7 秒就完了。

**顺带确认的官方起终点**（`Road-*.js` 里 `15_B` 的字面量，可信度高于任何二手资料）：
`15_B` start `33.41915303841233,126.26240096054971` / end `33.46695997752249,126.3382369838655`；
`15_A` start **同一点**，end `33.467186372727156,126.33876127190888`。
→ **A/B 确实同起点**，与项目里「A/B 同起终点」的既定口径一致，误差 2~8m。

**同批清掉的过期表述**（`15-B` 不再是「缺轨迹」，留着就是错的）：
`src/lib/olleeElevation.ts` 头注释、`src/lib/seed.ts:254` 注释、`src/lib/tripPlans.ts` 的 15-B 提示（改为写明「推断非实测 + 短 5.7% + 途经点已核对」）、
四语 README 的数据来源表 / 轨迹小节 / 线型说明。

## 2026-10-03（续·7）

### 修复：03 / 15 的封面图与官方路线图整块消失

- **根因**：封面不是写死在路线数据里的，而是 `DataContext.mergeAssets()` 拿 `route.code` 去 `public/photos/manifest.json`（风景照）和 `public/photos/maps.json`（官方路线图）里查键。上一轮把编号从 `03`/`15` 改成 `03-A`/`03-B`/`15-A`/`15-B` 时，**按 code 索引的数据改了，这两个素材清单的键漏了** → `photos[code]` / `maps[code]` 全部 miss，页面不报错，只是回落到 `cover-placeholder` 灰块，看起来就是「图没了」。
- **教训（值得记住的排查顺序）**：编号类重构，**「按 code 索引」的清单不止代码里的那几处** —— `public/` 下的静态素材清单（`manifest.json` / `maps.json` / `CREDITS.md` / `tracks.json`）同样是按 code 索引的，只是不在 TS 里，grep `src/` 永远找不到。下次改编号，先 `grep -r '"03"\|"15"'` 整个仓库（含 `public/`），而不是只 grep 代码目录。
- 修法：
  - `public/photos/manifest.json`：`03`→`03-A`、`15`→`15-A`，并新增 `03-B` / `15-B` 条目；caption 跟着编号走并标出山线/海线。
  - `public/photos/maps.json`：只改 `03`→`03-A`、`15`→`15-A`，**不给 B 线登记** —— 官方路线图 PDF 是 2017 版（拆分前才有 3/15 的图），把 A 线的示意图登记成 B 线的走向是张冠李戴。B 线详情页相册因此没有官方路线图，这是对的。
  - `public/photos/CREDITS.md`：署名清单的编号列同步（`| 03 |`→`| 03-A |` ×5、`| 15 |`→`| 15-A |` ×3）。
  - B 线**复用 A 线已有图文件**（`photos/scenes/olle-03.webp`、`olle-15.webp`），不新增、不复制文件 —— A/B 同起终点同一带，共用一张该区域的风景照不构成误导；B 线不给 gallery，避免相册里 A 线的图重复出现。
  - caption 的 A/B 标注用**中点**而非括号（`温坪 → 表善 · A 山线`）：`split_route_map.py` 的 caption 模板是 `偶来 X 官方路线图（{label}）`，label 里再带括号会嵌套。`fetch_photos.py` 的 `CODE_LABEL` 一并改成中点，两个脚本共用同一份 label 才不会漂移。
  - `scripts/split_route_map.py` 的 `PAGE_CODES`（PDF 页码 → 编号）同步 `03`→`03-A`、`15`→`15-A`。
- **顺带修掉一处同源隐患**：看点 id 由 `build_sights_data.py` 按 `cur-{code}-{序号}` 生成，code 改成 `15-A` 后重跑会产出 `cur-15-A-1`，与现存的 `cur-15-1` 对不上。已把 `src/lib/sightsData.ts` 的 id、`scripts/fetch_sight_photos.py` 的 `SIGHT_LOCAL` / 名称表、`public/photos/CREDITS_SIGHTS.md` 一并改成 `cur-15-A-1`，图片文件 `public/photos/sights/cur-15-1.webp` → `cur-15-A-1.webp`（`git` 里体现为改名）。
- 校验脚本（一次性跑通）：29 条逐条查「风景照/路线图/轨迹 命中 + 引用文件真实存在」→ 无缺文件；manifest 与 maps 均无多余键。当前只有 `15-B` 缺轨迹、`03-B`/`15-B`/`18-2` 缺官方路线图，都是已知且合理的。
- `npm run build` ✅，`dist/` 下 manifest 已同步为 29 键。

> 这些内容原先直接写在 README 里，读的人得先跑完整条排查链才能拿到一句结论。挪到这里之后，README 只回答问题，本文件负责解释。

---

## 2026-10-03（续·6）

### 补轨迹：03-B 拿到了（29 条里 28 条有实测轨迹），15-B 仍缺

**先纠正一个存了两轮的错误判断**：此前一直记着「本机 OSM / Overpass 不通」，据此把两条 B 线判成「抓不到」。
实际情况是 **Overpass 一直通**，之前的 406 只是 curl 没带 `User-Agent`（Overpass 明确要求可识别 UA，
`scripts/fetch_olle_osm.py` 里本来就有 UA，所以脚本一直能跑）。教训：判定「网络不通」前先看是不是请求头的问题，
别把「我这条命令被拒」写成「这个源不可用」。

**03-B 的取法**（这条路以后补别的分叉线还能用）：
OSM 的 `올레길3`（rel 5458299）是个 superroute，成员 = **两个子关系** `올레길3A`(6089470)、`올레길3B`(6089589)
**+ 父关系自己直属的 32 条 way**。关键是 `ways_of()` 展开后 `A∩B = 0` —— A、B 两条走法**一条 way 都不共用**，
父关系那 32 条才是两线共用的首尾段。所以：

| 组合 | way 数 | 缝合结果 | 对官方 |
| --- | --- | --- | --- |
| 3B 关系单独 | 25 | 7.43 km（1 段） | 14.6 的 51% |
| 3A 关系单独 | 54 | 14.87 km（2 段） | 20.9 的 71% |
| **父 32 + 3B 25** | 57 | **14.88 km（1 段）** | **14.6 的 102% ✅** |
| 父 32 + 3A 54 | 86 | 22.32 km（2 段） | 20.9 的 107%（与现有 03-A 22.22 km 同源） |

算术也自洽：父关系全缝 29.76 km（A∪B）− B 独有 7.43 = 22.33 ≈ A 线，反过来 29.76 − A 独有 14.87 = 14.89 ≈ B 线。
**之前脚本把 B 当「闭合旁路（parallel）」剔掉了**（docstring 里那句「实测证据只有 03：剔前 29.76→剔后 22.71」
说的就是这事）—— 对「A/B 分叉」这种结构，被剔的那段恰恰是另一条完整走法，不是绕路。

产出的 `tracks/osm/olle-03-B.geojson` 经 `import_tracks.py --elevation` 入库：14.75 km / 爬升 48 m /
最高 19 m（03-A 是爬升 260 m、最高 146 m）—— 海岸线与山线的地形特征对得上，可作交叉验证。
另有一份独立社区 KML（`Jeju Olle 3B`，14.84 km，首末点一致）与 OSM 结果吻合，两个源互相印证。

**15-B 为什么没拿到**（三个源都试过，如实记录）：
1. **OSM 里 15 号线根本没有 route 关系** —— 全岛 22 个 올레 关系里没有它，只有散 way；
2. 散 way 里标了 A 的 7 条、标了 B 的 **1 条**，其余 96 条叫 `Ollegil 15` 没区分 A/B。
   把 104 条全缝起来只有 **9.93 km / 15 段**，是碎片，够不上可用门槛（宁可缺、不可假）；
3. 社区 KML 站（pamnjeff.com，`JejuOlle<编号>.kml` 命名）有 `JejuOlle3b.kml`、`JejuOlle3a.kml`、
   `JejuOlle15.kml`，但 15 的 A/B 变体（`15a`/`15A`/`15B`/`15b`/`15-B`/`15-1`）**全是 404**。

**顺带查清了 15-A 为什么超长 19%**（这个此前只标了「⛔ 打折看」，没给原因）：
官方是**改线后**才把 15 号线拆成 A/B 的（visitjeju：先前的 15 号线变更为 15-A、15-B 后重新开放），
而现有 15-A 的轨迹来自改线**之前**的旧 15 号线（18.67 km，来自 `JejuOlle15.kml`）。
新的 15-A 是 15.5 km，旧线自然更长 —— 不是缝合失误，是数据年代问题。要修得等 OSM 或社区有人按新走向补。

落地改动：`public/tracks.json` 新增 `03-B`（其余 28 条一字未动，导入器的「保留已有对应数据」生效）；
`tracks/osm/olle-03-B.geojson`；四语种 README 的轨迹数 27→28、`03-B` 标注已有轨迹、15-A 超长原因、
以及「实际走完一圈设 403」。

---

## 2026-10-03（续·5）

### 拆分：3 号线 / 15 号线按官方口径分成 A 山线 · B 海线（27 条 → 29 条）

- **为什么要拆**：官方 Olle App 的路线列表里 3 号线、15 号线各是两条（`03-A`/`03-B`、`15-A`/`15-B`），
  而本项目只记了 A 线（`03`=3A 20.9km、`15`=15A 15.5km）。结果是 `check_official_consistency.py`
  每次都报「App 有、seed 缺：03-B / 15-B」，而页面上也根本没法把海线单独排进行程。
- **官方口径（多来源交叉核对）**：A = 山线（内陆 / 中山间，翻岳穿林），B = 海线（海岸，官方称 바당올레，
  바당 = 济州方言「海」）。两条同起终点、是同一段路的二选一，走完任意一条都算走完该号。

  | 编号 | 走法 | 里程 | 耗时 | 难度 |
  | --- | --- | --- | --- | --- |
  | `03-A` | 山线（桶岳·独子峰） | 20.9 km | 6~7h | 上（★4） |
  | `03-B` | 海线（온평숲길→신산포구→환해장성，在 신풍신천바다목장 与 A 汇合） | 14.6 km | 4~5h | 下（★2） |
  | `15-A` | 山线（锦山公园·纳邑林道·과오름） | 15.5 km | 5~6h | 中（★3） |
  | `15-B` | 海线（翰林港→귀덕→곽지→한담산책로→애월→고내포구） | 13.0 km | 4~5h | 下（★2） |

  依据：官方 App 路线列表快照 `scripts/data/olle-app-routes.json`、Jeju Weekly 对 3-B「Badang Olle」开通的
  报道、visitjeju.net 15-B 官方页、plusplanner 的官方线路介绍。visitjeju 写 15-B = 13.5km，与 App 的
  13.0km 有出入，**以 App 现行值为准**。
- **编号改成与官方一致**（不是「保留 03 另加 03-B」）：`03`→`03-A`、`15`→`15-A`，新增 `03-B`、`15-B`。
  连带把**所有按 code 索引的数据**改名 —— `public/tracks.json`（含 `mainlineJoinFrom` 的 `03`→`03-A`、
  `15`→`15-A` 引用）、`src/data/olle-endpoints.json`、`src/lib/olleeElevation.ts`、`olleSurfaces.ts`、
  `waypointsData.ts`、`sightsData.ts`、`olleDurations.ts`、`src/data/stays.json` 的 `routeTowns`、
  `src/lib/tripPlans.ts`，以及脚本侧的 `fetch_stays.py` / `add_stay_return.py` / `fetch_photos.py` /
  `curated_sights.json` / `olle-waypoints.json`。
  `public/tracks.json` 是紧凑格式，**用精确文本替换而不是 json.dump 重写** —— 重写会把 14 万字符压成
  上万行，产生毫无意义的 diff。
- **B 线暂缺轨迹**（决定：等用户拿到 GPX / GeoJSON 再接，不手工编一条近似折线）：
  `tracks.json` 里没有 `03-B`/`15-B`，页面上按现有「无轨迹」逻辑走**灰绿虚线**示意，爬升显示「—」。
  拿到文件后跑 `scripts/import_tracks.py` 即可自动接管，不用改代码。
  ⚠️ 为此顺手修了 `import_tracks.py` 的 `guess_code()`：它把文件名里的字母全剔成 `_`，
  `olle-03-B.gpx` 会被识别成 `03` 而漏判。现在**在纯数字判定之前**先匹配「数字 + A/B」，
  `03-A`/`03-B`/`15b`/`03_B` 这些写法都能认。
- **`fetch_olle_osm.py` 的 `DEFAULT_ALIAS` 置空**：原先 `{"03-A": "03"}` 是「把 OSM 的 3-A 归到主线 03」
  的换算层；编号与官方对齐后这层不再需要（3-A 就该落成 `03-A`）。留着它会让重跑时 B 线静默丢数据。
- **对账脚本同步**：`check_official_consistency.py` 的 SPECS 正则 `[\d-]+` 认不出带字母的编号（会导致
  29 条被解析成 25 条而静默失效），放开成 `[\d\-AB]+`；同时删掉 `APP_TO_SPEC = {"03-A":"03","15-A":"15"}`
  别名映射 —— 编号已对齐，再归一等于把 B 线永远藏在「App 有、seed 缺」的 ⚠️ 里。
  `check_endpoints.py` 同样放开正则，并把「tracks.json 无此线」从 **problem 降级为 info** ——
  缺轨迹是已知待补状态，混在 problem 里会跟「轨迹被改名 / 删了」分不清。
- **全程合计 402.8 → 430 km**：按用户决定，29 条全计（与官方 App 的 29 个编号一一对应）。
  代价是 A/B 是二选一，同一段路被算了两次（+27.6 km），注释与 README 都写明「想按实际走完算就把目标设成 403」。
- **已知待办（未修，先记下来）**：
  - `15-A` 的轨迹 18.44km 比官方 15.5km 长 **+19%**（对账脚本判 ⛔），爬升与地图形状请打折看。
  - 官方航点里 **03 与 15 的 A/B 点是混在一起的**（例如 15 号线航点含 Handam Seaside Walkway，
    那是 B 线的点；3 号线第一个点就叫 "Forked Road of Route A and B"）。补 B 线轨迹时要把航点一并拆开。
- 验证：`check_official_consistency.py` → App 29 / seed 29、里程逐条一致、缺轨迹仅 `03-B`/`15-B`；
  `check_endpoints.py` → ✅ 三向对账通过；`npm run build` 通过。

---

## 2026-10-03（续·4）

### 新增：19 号线（朝天→金宁）4 处看点
- 用户提供：19 号线途经 4·3 纪念馆、咸德海水浴场、犀牛峰、北村村落。
- 核对结果：**这 4 处官方航点里本来就有**（`olle-waypoints.json` 的 19 号线，字段是 `distance` 不是 `km`）：Hamdeok Beach 6.3km / Seowoo-bong Sunset Spot 7.4km（viewpoint）/ Neobeunsoongee April 3 Memorial Hall 9.1km（viewpoint）/ Bukchon-pogu 10.1km。之所以看着像"缺"，是因为报告「核心景点」只列 `type=viewpoint`，咸德（normal）和北村（transport）被过滤掉了。
- 仍然补进人工补充层：19 号线的详情页「路边景色」卡片原本是空的（此前只补了 01/06/07/08/14/15/20）。**两个图层用途不同** —— 官方航点是地图标记，本层是带简介+配图的卡片。已同步改掉 `curated_sights.json` 的 `_note`（原写"不重复官方已列的点"，与实际数据矛盾）。
- 坐标不是估的：直接取自 `src/lib/waypointsData.ts`（`build_waypoints_data.py` 已按官方里程用 haversine 投影到真实轨迹上的成品坐标）。
- 配图：全量搜本地图库，`File:Hamdeok_Beach.jpg` 挂在 **18 号线**封面（图在 18 号线路段上、景点属 19 号线），已登记进 `SIGHT_LOCAL` → 咸德海水浴场拿到封面（`photos/scenes/olle-18.webp`，Hong Da Hyeon / CC0）。犀牛峰、4·3 纪念馆、北村本地无对应图，留空。
- 顺手修：`--local` 的署名标签原先只查 `SIGHT_LABEL` 字典、漏登记就退化成裸 id（本次出现过 `cur-19-1 (cur-19-1)`）。改为缺省回落到数据里的真实名称。
- 现状：8 条线 / 12 处看点。`tsc --noEmit` 0 错误；报告 `docs/route-attractions.html` 已重生成（routes=27, viewpoints=33, curated=12）。

---

## 2026-10-03（续·3）

### 修复：fetch_sight_photos.py 一启动就 KeyError: 'id'
- 现象：`python3 scripts/fetch_sight_photos.py` 在 `sid = s["id"]` 直接崩。
- 根因：`curated_sights.json` 的条目**本身没有 id 字段** —— id 是 `build_sights_data.py` 生成 `sightsData.ts` 时按位置拼出来的（`cur-{code}-{序号}`）。脚本 docstring 写着要"复刻 build_sights_data 的 id 规则"，但 `flat_sights()` 只返回 `(code, idx, item)`、从没真的把 id 拼出来，调用方却直接读 `s["id"]`。
- 修法：新增 `sight_id(code, idx)` 复算 id，`flat_sights()` 返回 `(code, idx, sid, item)`，循环直接用算出的 sid；`--ids` 过滤改按 sid 并校验未知 id（给出可用 id 列表）；默认只处理 `SIGHT_QUERIES` 里登记过的 id，没登记的显式提示而非静默跳过。
- 附带清理：删掉只写不读的 `file_basename`；"图片已存在"分支补齐 width/height（用 Pillow 读，缺失则静默降级）。
- 验证（离线，无网络也能跑）：打桩 `fp.search` 跑 `--dry`，8 个 id 全部正确生成且与 `SIGHT_QUERIES` 完全对齐；`--ids` 精确筛选 + 未知 id 告警均正常。

### 新增：`--local` 模式（Wikimedia 不可达时的无网兜底）
- 背景：`commons.wikimedia.org` / `upload.wikimedia.org` 在本机与沙箱均不可达 —— 表现为 **TLS handshake timeout**（TCP 能连、TLS 被掐），不是脚本 bug，也不是简单的"慢"。example.com / api.github.com 正常，说明是针对性不可达。
- 做法：`--local` 完全不联网，直接复用 `public/photos/` 里已随仓库分发的 CC 图，来源 `manifest.json`（自带 credit/source）。
- **只登记精确匹配**（`SIGHT_LOCAL`）：`cur-08-1` 柱状节理带 ← olle-08 主图（Jungmun Daepo Jusangjeolli Cliff）、`cur-15-1` 挟才海滩 ← olle-14 主图（Hyeopjae Beach）。其余 6 处本地无对应图，**宁可留空也不用邻近景点照片顶替**（例如不拿「城山日出峰」的图当「涉地可支」，那是张冠李戴）。
- 本次实跑结果：2 处拿到封面（`photos/scenes/olle-08.webp` 1600×1200、`photos/scenes/olle-14.webp` 1600×1071），署名写进 `public/photos/CREDITS_SIGHTS.md`（独立文件，避开被 `fetch_photos.py` 整体重写的 `CREDITS.md`）。

### 环境备忘
- Pillow 装在托管 venv `/Users/chenxin/.workbuddy/binaries/python/envs/default`（基于 Python 3.13.12）。**不要用 `pip3 install`** —— 那是 macOS 系统 Python 3.9.6，PEP 668 外部受管环境会拒绝；也不要 `--break-system-packages`。
- 本环境 Bash 的 `grep` 对 `scripts/*.py` 不返回任何内容（Python 读同一文件却有内容），核对函数签名请改用 Python `inspect` 内省，别信空 grep 结果。

---

## 2026-10-03

### 新增：扫码把 PC 本地数据迁移到手机（方案 A · 局域网直传，零后端）
- 动机：用户想在手机上扫 PC 端二维码，把 PC 浏览器里的本地数据导入手机。可行性结论：二维码只当"连接凭证"（容量上限 ~2.9KB，真实备份远超），数据走局域网中转。
- 实现：
  - `scripts/transfer-relay.mjs`：Node 原生 http 一次性中继，`/info`（返回局域网 IP）、`/push`（PC 推备份）、`/api/data`（手机一次性拉取，取走即删）、`/`（状态页）；含 CORS `*` 与 TTL 自毁（拉取后 3s / 无操作 5min）。默认端口 18080（可 `TRANSFER_PORT` 覆盖）。
  - `src/lib/transfer.ts`：`pingRelay` / `makeToken` / `generateTransferQr`（把 `exportBackup()` 推到中继，拼出 `<app-base>#/receive?src=<中继地址>` 二维码）。
  - `src/pages/ReceivePage.tsx`：手机扫码落点，拉取 `src` 调 `importBackup(text,'merge')` 写进手机 localStorage。
  - `App.tsx` 注册 `/receive` 路由（懒加载）；`SettingsPage` 加「扫码迁移到手机」按钮 + `Modal` 二维码弹窗；`package.json` 加 `relay` 脚本与 `qrcode` 依赖。
- 已知缺口（本期未做）：`exportBackup` 只含 routes/plans/settings；用户上传图片在 IndexedDB、按 `ImageRef{kind:'local'}` 引用，换设备 key 失效 → 图片不随迁移过来，接收端回落占位图。要带图迁移需另做 base64 打包。
- 使用约束：手机与 PC 必须同 WiFi；App 须以 http 在局域网内打开（https 页面拉取 http 中继会触发混合内容拦截）；公共 WiFi 的 AP 隔离 / PC 防火墙可能挡端口。
- 验证：`tsc` 通过；中继冒烟测试 info/push/一次性拉取/CORS 均正常。
- **定位（2026-10-03 澄清）**：此功能面向**下载源码并在本地运行**的开发者 / 自托管用户，已收进设置页「高级（开发者 / 自托管）」分区；已部署的在线版本**不提供**该能力（无后端中转），普通用户请使用「导出 / 导入 JSON」在设备间迁移数据。

### 新增：人工补充「看点 / 路边景色」默认数据（curated_sights）
- 动机：用户指出官方航点文件 `olle-waypoints.json`（2017 线路图 + 官方 App 航点）漏掉若干沿线标志性景点（如**涉地可支 Seopjikoji**）。项目里 `route.sights`（看点 / 路边景色）默认骨架是空的（`seed.ts` 原写 `sights: []`），"留给你在后台补"。
- 约定：不污染官方源，仿 `curated_stays.json` 建独立人工补充层。
  - `scripts/data/curated_sights.json`：按路线 code 分组的人工补充看点（名称中+原、WGS-84 估算坐标、SightType、`desc` 来源说明）。本期补 7 条线共 8 处：涉地可支(01)、正房瀑布(06)、天地渊瀑布(07)、柱状节理带(08)、翰林公园+飞扬岛(14)、挟才海滩(15)、万丈窟(20)。
  - `scripts/build_sights_data.py`：搬运 + 补 `id`/`images` 字段，生成 `src/lib/sightsData.ts` 的 `DEFAULT_SIGHTS`（与 `build_waypoints_data.py` 同模式）。
  - `src/lib/seed.ts`：`sights: []` → `sights: DEFAULT_SIGHTS[spec.code] ?? []`，默认路线即带上看点；后台 `SightsEditor` 仍可增删改。
- 坐标性质：**非官方勘测、估算值**，仅供定位参考，需在官方/实地核实。报告 `docs/route-attractions.html` 已同步把这些"✚ 人工补充看点"单列（虚线黄框）标注。
- 验证：`tsc --noEmit` 通过（0 错误）。
- 生效说明：App 首次打开才写 seed；若浏览器已有旧 localStorage 路线（空 sights），需清掉该站点 localStorage 才会用上新默认看点（本项目约定不做历史数据迁移）。

### 新增：设置页「合并官方默认看点」按钮（把默认看点主动同步进老路线）
- 动机：上一条的 `DEFAULT_SIGHTS` 只在首次打开写 seed，老用户（本机已有路线、sights 为空）永远看不到新补看点。用户希望不用清数据也能拿到。
- 设计取舍：**不**把合并塞进既有的「重新加载数据」按钮**（那个是中性重读、不回写）**，而在「数据」区同一行新增一个显式按钮「合并官方默认看点」——用户主动触发、幂等、不覆盖已有看点、不碰路线/行程篮/住宿，与「导入备份」同属显式动作，不违反"不做自动迁移"约定。
- 实现：
  - `src/lib/storage.ts`：新增 `mergeDefaultSights()`，读现有 routes，按 `id` 把 `DEFAULT_SIGHTS[code]` 里缺失的看点并入（已存在 id 跳过），写回 localStorage，返回 `{ lines, added }`。
  - `src/store/DataContext.tsx`：接口加 `mergeDefaultSights`，实现先调 storage 合并再 `reload()` 刷新状态。
  - `src/pages/SettingsPage.tsx`：btn-row 加按钮 + 确认弹窗，toast 显示「N 条线新增 M 处看点」。
- 同步删掉临时方案 `docs/merge_sights_snippet.js`（一次性 Console 脚本，已被按钮取代）。
- 验证：`tsc --noEmit` 通过（0 错误）。

### 新增：看点封面图抓取管线（Wikimedia Commons 自由授权）
- 动机：上一轮补的 8 处人工看点 `images` 为空，详情页 SightGallery 只显示文字、没有封面。用户要求从网络公开图片库爬封面。
- 合规红线：不抓 OTA；只用 **Wikimedia Commons（CC0 / CC-BY / CC-BY-SA / 公共领域）**——复用 `fetch_photos.py` 已有的 `FREE_RE`/`JEJU_RE`/`JUNK_RE` 许可与济州相关性过滤，署名进独立的 `public/photos/CREDITS_SIGHTS.md`（**不写 CREDITS.md**，因为后者由 `fetch_photos.py` 每次整体重写会冲掉看点署名）。
- 实现：
  - `scripts/fetch_sight_photos.py`（新建）：复用 `fetch_photos.py` 的检索/许可过滤/WebP 压缩原语（按看点 id 而非路线编号），抓 8 处看点的 CC 封面 → 落 `public/photos/sights/<sight-id>.webp` → 回写 `curated_sights.json` 的 `images` → 重生成 `sightsData.ts` → 写 `CREDITS_SIGHTS.md`。支持 `--ids / --dry / --force / --proxy / --url / --no-cache`；`--url` 模式不下载、直接把 Commons 缩略图 URL 写进 `images`（运行时由用户浏览器直连 Wikimedia，省去本机下载）。
  - `scripts/build_sights_data.py`：原先硬编码 `images: []`，改为**透传**源 `images` 字段（看点的图片随源走，不另起 manifest）。
  - `src/lib/storage.ts` 的 `mergeDefaultSights()`：扩展为「缺失 id 补入 + 已存在且空图则补全图片」，返回 `{ lines, added, updated }`；否则已合并过的老路线再点合并也拿不到新封面。
  - `src/store/DataContext.tsx` / `src/pages/SettingsPage.tsx`：同步返回类型与 toast（提示「补全 N 处封面」）。
- 注意：本环境 `commons.wikimedia.org` / `upload.wikimedia.org` 网络不可达（其它外网 200），且沙箱 Python 未装 Pillow，故脚本**未在本会话实跑**；需在能访问 Wikimedia 的机器上执行（或 `--proxy` / `--url`）。执行：`python3 scripts/fetch_sight_photos.py`（需 `pip install Pillow`），完成后 `npm run build`。
- 验证：`py_compile` 通过；`build_sights_data.py` 重生成 `sightsData.ts` 含 `images` 字段；`tsc --noEmit` 通过（0 错误）。

---

## 2026-10-02（续·2）

### 新增住宿：枫树酒店（메이플 호텔 / Maple Hotel）
- 用户手填公开信息要求补库。排查：库里无此酒店（无 OSM/OTA 重复记录）。
- 按既定「人工核对源 + 合并脚本」机制补：`scripts/data/curated_stays.json` 加一条 `manual_jeju-maple-hotel`（matchKeys 含 Maple/메이플/枫树/Maple Hotel），`fetch_stays_manual.py` 归到最近城镇 **제주시（济州市）**（老衡洞在济州市区，距该镇中心约 3.6km，是市区兜底城镇）。
- 字段：`name` 메이플 호텔、`nameZh` 枫树酒店（官方标记）、`nameEn` Maple Hotel（官方标记）、`note` 酒店（gen_stay_zh 按业态词归一）、地址、无电话（用户未给）。坐标用老衡洞街区级近似（126.4635, 33.4765），非地址精确打点。
- 合规：未落价格/图片/评论（房价区间仅口头告知，不入库）。
- 结果：总数 960→961；`tsc`、`npm run build` 通过，数据已打进 index chunk。`gen_stay_zh.py` 显示中文名 2→3 条、英文名 +1（100）。

---

## 2026-10-02（续）

### 住宿数据收敛为单一数据源（去掉 3.6 万行 seedStays 副本 + 运行时 fetch）
- 痛点：住宿数据在源码里物理存在两份 —— `public/stays.json`（真源）+ `src/lib/seedStays.ts`（build_seed_stays.py 把同一份 960 家整段抄进去的 3.6 万行烘焙副本），每次改数据都要重跑生成脚本重新抄一遍。
- 改法：
  - 唯一真源定为 **`src/data/stays.json`**（从 `public/stays.json` 移入，与 `olle-endpoints.json` 同目录同模式），7 个读写脚本（`fetch_stays*.py` / `gen_stay_*.py` / `gen_stays_preview.py`）路径同步改为 `src/data/stays.json`。
  - `src/lib/seedStays.ts` 重写为约 30 行的**派生模块**：`import` 真源后按 `routeTowns` 归集到每条路线（与 `DataContext` 的 `mergeStays` 行为一致），不再内联任何住宿数据。删掉 `scripts/build_seed_stays.py`（不再需要生成步骤）。
  - `src/store/DataContext.tsx` 改为直接 `import` 同一份 JSON 作住宿池，**去掉运行时 `fetch('stays.json')`**；`stays` 不再是 `null` 状态、改为取自导入数据。`context.stays` 接口签名由 `StaysManifest | null` 变为 `StaysManifest`（外部无消费方，纯内部派生变量）。
  - 删除 `public/stays.json`（运行时不再 fetch，由 bundle 内联提供）。
- 代价：住宿数据随包打包进 JS，**改完 `src/data/stays.json` 后需重新 `npm run build`**（原本 seed 路径本就要重建；"刷新即生效"便利放弃，因为实际工作流本就是跑脚本+构建）。
- 验证：`tsc --noEmit` 与 `npm run build` 通过；`dist/stays.json` 不再生成、bundle 无 `stays.json` 字符串残留、住宿数据已打进 index chunk；`seedStays.ts` 35,915 行 → 34 行。

## 2026-10-02

### 新增住宿：济州托维斯公寓（제주토비스콘도미니엄 / Jeju Tovice Condo）
- 用户手填该酒店公开信息（中文/英文/地址/电话），要求补进库。排查发现它**本来就在 OSM 库里**，但被重复映射成 4 条（涯月 3 条 + 翰林 1 条，两簇坐标差约 460m，属同一酒店被重复录入），且缺中文名/英文名/地址/电话。
- 不抓 OTA（携程/Airbnb/Booking 等 ToS 禁止且 MIT 再分发风险高），缺失知名住宿只走「人工整理并核对的公开信息」这一合规来源。
- 新增 `scripts/data/curated_stays.json`（人工核对源）+ `scripts/fetch_stays_manual.py`（与 TourAPI/Kakao 同构的合并脚本）：按 `matchKeys` 删掉全部命中条目（跨镇去重），再把规范条目补进最近城镇（涯月），带 `nameZhOfficial`/`nameEnOfficial` 标记，gen 脚本不会覆盖手填名。幂等，重跑若干次结果一致；即便 `fetch_stays.py` 全量重抓把重复带回来，重跑本脚本会再次去重 + 补回。
- 同步把 `gen_stay_zh.py` 的官方中文名保护从「只认 source=tourapi」改为「认 nameZhOfficial 不限来源」，否则手填中文名会被自动生成覆盖（`gen_stay_en.py` 本就来源无关，保持一致）。
- 顺手归一 7 个城镇的 `count` 字段（Tourapi/Kakao 合并追加时没同步 count，历史遗留，现 count 求和=真实总条数 960）。
- 结果：中文名由 1 条变 2 条（新增「济州托维斯公寓」），英文名 +1（99），该酒店进入路线 15、16 的 `seedStays.ts`。`tsc --noEmit` 与 `npm run build` 通过。
- 中文名取「托维斯」（Tovice 更通用音译）；用户另提「多维斯」变体，如需切换改 `curated_stays.json` 的 `nameZh` 即可。

### 住宿中文名：排除「纯地名」误导值 + 前端显示优先级 中文>英文>韩文
- 用户发现多条 `nameZh: "济州"`（제주민박 等「地名+业态词」被翻译成只剩城市名）。根因：剥离业态词后整个品牌只剩地名，退化成城市名，丢失「这是个住宿」的身份。
- `scripts/gen_stay_zh.py` 新增 `brand_is_place_only()`：剥离业态词后若品牌整个是法定地名（제주/한라산/Jeju…）则 nameZh 置空，界面回退韩文原名（仍带 민박/호텔 业态词，身份清楚）。
- 两条规则叠加（非纯中文置空 + 纯地名置空）：963 条里只剩 **1 条**纯中文名（"君悦 济州" = Grand Hyatt Jeju，真实国际品牌中文名），其余 962 条回退英文名或韩文 —— 这是规则的必然结果；要更多中文名需放宽口径（用户待定）。
- 新增前端 helper `src/lib/stayName.ts`：`stayName()` 统一「中文(nameZh) > 英文(nameEn) > 韩文(name)」优先级，`staySubName()` 补韩文原名副行。DayBoard / StayPickerDrawer / PlanPage / PlanPrintSheet / RouteDetailPage / RouteMap / stayMatch 全部改用该 helper。
- 顺带发现 **数据重复 bug**：同一 OSM 节点被归入多个镇，导致 164 组、353 条真重复（同名同 id），地图/搜索会重复出现。未在本轮修复，待用户确认是否做跨镇去重。
- 校验：`tsc --noEmit` 与 `npm run build` 均通过。

### 住宿搜索：统一到 `staySearch.ts`，中 / 韩 / 英 / 罗马音都能搜

- **背景**：两处住宿列表各写了一套搜索 —— `StayPickerDrawer`（行程篮抽屉）已经连着
  `nameEn` / `nameRomaja`，但 `RouteDetailPage` 的 `StayDrawer` 只匹配 `nameZh` + `name`（韩文原名），
  同一个英文名在这个抽屉搜得到、换个入口就搜不到。
- **收敛**：新增 `src/lib/staySearch.ts`，导出 `matchStayName(hotel, query)`，两个抽屉都改调它。
  规则：大小写不敏感；忽略空格与 `- _ . ' " ( ) / & ·` 等分隔符（`RamadaPlaza` 能命中 `Ramada Plaza Jeju`）；
  多关键词是「且」关系且不分先后（`jeju hyatt` 能命中 `Grand Hyatt Jeju`）。
  输入框 placeholder 同步改成「搜索名称（中文 / 韩文 / 英文）」。
- **英文拼写兜底（关键）**：全岛 774 家（去重后）里 `nameEn` 只有 79 家、`nameZh` 17 家，
  `nameRomaja`（韩式罗马音）才是 100% 覆盖的那个字段。而 OSM 给的是
  펜션→`pensyeon`（125 家）、리조트→`rijoteu`、게스트하우스→`geseuteuhauseu` 这套写法，
  用户实际会敲的却是 `pension` / `resort` / `guesthouse` —— 不做归一的话搜 `pension` 只能命中 8 家。
  于是加了「同词异写」表（`pensyeon|penseon→pension`、`rijoteu|risoteu|lijoteu→resort`、`kondo→condo`、
  `geseuteuhauseu?→guesthouse`、`hoseutel→hostel`、`yeogwan|yeoinsuk→inn`）；
  归一串是**追加**不覆盖原文，所以 `pensyeon` 和 `pension` 都能搜到同一批。
  实测效果（774 家去重口径）：`pension` 8 → 133 家、`resort` 0 → 36、`guesthouse` → 47、
  `condo` → 10、`inn` → 12；`hotel` 一直是 154 家、`grand hyatt` → 1、`ramada` → 2 不受影响。
- **为什么不在数据层补英文名**：项目约定 `nameEn` 只抄 OSM 真实拉丁名（`name:en`），不翻译、不罗马转写，
  所以上面这套写法差异只能留在搜索层兜，不能写进数据。
- **详情页 `HotelCard` 补英文名副行**：搜英文命中的条目多为 `nameEn` / 罗马音，卡片上只印中文名或韩文名时
  认不出搜到的是哪一家。现在主标题之外按「韩文原名 · 英文名」补一行（都不与主标题重复才显示）。
- **仍未解决的数据短板**：`nameEn` 只覆盖 79 家是采集阶段的取舍（当前这批 OSM 抓取没取 `name:en`），
  要拿全量得重跑 `scripts/fetch_stays.py`（本机 Overpass 不通，得换能出网的环境）。
  TourAPI 的英文/简中数据集实测不含济州住宿，补不了这块。

### 按天看板：「查看全部住宿」抽屉（每晚 + 出发前一晚）

- 需求：住宿卡只陈列前 5 条候选，8 km 以外的根本露不出来 —— 有车 / 愿意多走一段时挑不到。
  所以卡片底部加「查看全部住宿（N 家）›」，点击从右侧滑出抽屉列出全量并可选中一家。
- 新增 `src/components/StayPickerDrawer.tsx` + 同名 `.module.less`：mask + 滑入动画 + Esc 关闭 +
  中/韩/英/罗马音搜索 + 顶部锁定条（已锁定那家可能排得很后，不用翻列表也能取消）。
- `stayMatch.ts`：`StayCandidate` / `PrevStayCandidate` 加 `near`（是否在 8 km 内）；
  `rankCandidates` / `rankByStart` 加 `maxKm` 参数；导出 `rankAllStays()` / `rankAllByStart()`
  —— 传 `Infinity` 即不截断的全量排序，远的照列并标「较远」，**不隐藏**。
- **两种口径共用一个组件**：「每晚」按「0.6 × 距今晚终点 + 0.4 × 距明早起点」排序，
  「出发前一晚」按「距第一天出发点」排序。为了不复制一份组件，抽屉改成吃中性行结构
  `StayPickerRow { hotel, distanceKm, distance2Km, near }`，由 `variant: 'night' | 'prev'`
  决定标题/提示/距离文案；`DayBoard` 里用 `nightRow()` / `prevRow()` 两个映射函数转。
  早先版本让 `toEndKm` 直接承载「距出发点」能少写几行，但字段名在说谎，改回中性结构。
- 锁定后若那家超出 8 km（不在自动候选里），会被顶到卡片候选列表第一位 ——
  从抽屉里挑了远处的住宿、卡片上却看不见，会让人以为没选上。前夜卡同样处理。
- 空态兜底：前夜推不出区域（`prev` 为 null）但起点附近录过住宿时，入口照常出现 ——
  推不出区域名不等于没得住。
- **踩坑（文案）**：抽屉里一行曾显示成「瓦夏夏 民宿」+ 副文本「… · 民宿 / Guesthouse」，
  业态写了两遍 —— 中文名是「地名义译 + 业态中译」生成的（名字本身就带业态），
  而 `hotel.note` 是同一件事的中英对照。加 `typeSuffix(title, note)`：标题里已含该业态词
  就不再打印，只有标题是韩文/英文原名（无中文名）时才补，否则整行看不出业态。
  **通用口径**：任何「中文名 + note」并排展示的地方都要走这个判断
  （详情页 `RouteDetailPage` 的 `HotelCard` 仍是 note 单独成行，同样重复，尚未改）。

### 行程位置地图：住宿从「显示/隐藏」开关改成三选一模式

- 之前的「显示住宿」复选框只能二选一，够不到一种很常见的看图需求：**只看自己定下来的那几家**。
  全量住宿一次十几个紫标铺满全岛，压得路线看不清；全关掉又完全看不到落脚点在哪。
- 改成三个模式按钮（「行程位置」标题右侧，`PlanPage` 的 `MAP_STAY_MODES`）：
  - `none` 仅路径 —— 画路线与编号，不画住宿；
  - `all` 全量住宿 —— 行程篮里每条路线挂着的所有住宿（改造前的默认行为）；
  - `confirmed` 已确认住宿 —— 只画「按天」里点「住这家」锁定下来的，含出发前一晚。
- 「已确认」的数据源是 `stays.get(day)?.lockedHotel` + `prevNight?.lockedHotel`（`stayMatch` 里
  已经把 `plan.items[].stayId` / `plan.prevStayId` 解析成 `Hotel` 了），**没有另开一条口径** ——
  自动推荐出来的候选不算确认，必须用户点过「住这家」。
  排序按「前夜 → 第 1 天 → 第 2 天…」，与行程单上的顺序一致；同一家连住两晚按 id 去重只画一个。
- `RouteMap` 新增可选 `hotelBadges`（`hotel.id` → 短标签）与 `hotelNotes`（`hotel.id` → tooltip 小字）：
  「已确认」模式下住宿标从「住」字水滴换成**紫色药丸 + 天数**（前夜 / 第2天 / 第1-2天），
  与路线编号的黑药丸同形异色；不传就完全照旧（详情页 / 后台选点不受影响）。
- 天数标签会合并连住：同一家连住几晚合成「第1-2天」，而不是每晚在同一坐标摞一个一样的紫标。
  天序里 `day = 0` 表示出发前一晚，排在第一天之前。
- **修 bug（用户实测反馈）**：第 1 天和第 3 天选了同一家、中间那晚没定住宿时，标签显示成
  「第1-3天」—— 凭空多出一晚，与行程单对不上。根因是合并条件只看了「数组相邻两项 id 是否相同」，
  没校验天号是否紧挨着：第 2 天没锁定住宿时它在序列里根本不存在，于是 1 和 3 在数组里成了邻居。
  改成按「天号 +1」切连续段，不连续的写成「第1、3天」（段数 > 3 时截断加「…」）。
  真连住（1,2 / 1,2,3）仍然并成「第1-2天」「第1-3天」。
- **踩坑**：`badgeWidth()` 原来按 `label.length * 7.6` 估算，那是 13px 粗体**数字**的宽度；
  中文全角字在同样字号下约 **13px/字**，照原公式算「第2天」只有 49px，文字会顶出药丸两端。
  改成逐字符判断（`charCodeAt(0) > 0x2e80` 算全角 13px），路线编号（纯数字/连字符）宽度不变。
- 存储字段从 `planMapHotels: boolean` 换成 `planMapStayMode: 'none' | 'all' | 'confirmed'`，
  默认 `all`（保持改造前「默认看得到住宿」的行为）。项目在研发阶段、不做旧数据兼容，
  直接改类型；`normalizeUi` 用白名单校验，非法值回落 `all`。
- 「已确认」模式下若一家都没锁，地图上方补一行提示，指回「按天」去点「住这家」 ——
  否则切过去看到一张没变化的图会以为功能坏了。

### 住宿漏知名酒店：确认是数据源天花板，改接韩国观光公社 TourAPI

- 用户反馈「济州亚洲酒店根本没看到」。核查：该酒店在济州市抓取圈内（노연로 53，距机场 2.75 km，
  中心 126.490/33.500 半径 7 km）、业态也匹配，却不在库里 → **OSM 里就没有这条记录**。
- 不是孤例。933 条里民宿 357 + 家庭民宿 192 = **59% 是小民宿**，酒店只有 184 条；
  知名连锁有的有（하얏트 / 롯데시티 / JW 메리어트 / 파라다이스 / 베스트웨스턴 / 하워드존슨 / 대한항공 칼호텔），
  有的缺（亚洲、新罗、君悦、Maison Glad）。抓取本身也有缺口：目标 17 镇只抓到 15 个
  （缺 대평리 大坪里、가파도 加波岛），文件头至今 `partial: true`。
- **根因是数据源天花板**：OSM 是志愿者数据，济州小民宿录得密、中大型酒店反而常缺。
  重抓 OSM 只是在同一份不完整数据里再捞一遍，解决不了。
- 本机无法在线复核（overpass-api.de 忙、kumi 与 private.coffee 空响应、Nominatim 无返回），
  按「试两次即停」停下，结论依据位置与类型匹配。
- 选定方案：TourAPI 4.0（韩国观光公社官方）。新增 `scripts/fetch_stays_tourapi.py`：
  - `KorService2/areaBasedList2`，`areaCode=39`（济州）+ `contentTypeId=32`（住宿）翻页抓全量；
    可选再抓 `ChsService2` / `EngService2` 拿官方中文名与英文名（**三个语言是独立数据集，key 分别申请**）。
  - 合并去重：坐标 < 150 m 判为同一家 → 不新增，只把官方中文名 / 英文名 / 地址 / 电话补到已有条目；
    否则按最近城镇归入，标 `source=tourapi`。
  - `gen_stay_zh.py` / `gen_stay_en.py` 改为跳过有官方名称的 tourapi 条目，避免被自动中译覆盖。
  - **待办**：key 未申请，脚本尚未实跑。申请后 `export TOURAPI_KEY_KOR=...` 再
    `python3 scripts/fetch_stays_tourapi.py --dry` 验样本，去掉 `--dry` 全量跑，最后重跑 `build_seed_stays.py`。

### 中文名不是纯中文就置空

- 需求：nameZh 大量是半中半韩（"西归浦칼"）或中英混排（"JW 万豪 济州"），读着别扭也搜不到。
- 改：`gen_stay_zh.py` 加 `pure_zh()` —— 只有「汉字 + 空格」才写入 nameZh，含韩文/拉丁/数字的一律置 null。
- 结果：963 条里**只有 23 条留下**（城山 / 日出峰 / 汉拿山 / 翰林 / 西归浦 / 表善 / 和顺 / 金宁 / 下摹 / 君悦 济州），
  940 条置空，界面回退显示韩文原名。搜索不受影响：抽屉里韩文原名 / 英文名 / 罗马音仍可搜。
- 顺带清掉 `PLACES` 表里的普通名词（해안→海岸、해변→海边、폭포→瀑布、계곡→溪谷、공원→公园、
  오름→岳、정원→庭院、궁전→宫殿、숙소→住宿、동굴→洞窟）：它们不是地名，意译出来就是编造的店名
  （"오름모텔"→"岳"、"공원민박"→"公园"）。只留法定地名的汉字表记。

### 中文名不再拼业态词（nameZh 与 note 去重）

- 需求：nameZh 生成成「济州신라 酒店」「포구 家庭民宿」，业态词既在名称里又在 `note` 里，读着重复。
- 改：`scripts/gen_stay_zh.py` 的 `make()` 只返回名称本身（地名义译 + 品牌保留原文），
  业态照旧只写 `note`。963 条全量重算，**nameZh 含业态词的条目 0 条**、空值 0 条。
- 连带：`StayPickerDrawer` 的 `typeSuffix()` 原是「标题已含业态就不再补」的去重补丁（当时注释里
  举的例子是「瓦夏夏 民宿 · 民宿 / Guesthouse」），现在标题一律不含业态，它退化成照常补业态；
  注释改写为描述当前行为，保留 `includes` 判断仅防后台把 nameZh 手写成带业态。
- 有 154 条 nameZh 与韩文原名相同（名称里既无可译地名也无业态词可剥离，如 솔트 / 하늘이），
  属正常；前端 `nameZh !== name` 才补原名行，不会重复显示。

### TourAPI 首跑：补进 30 家官方收录住宿，但亚洲酒店仍缺

- 结果：`public/stays.json` 933 → **963 条**（新增 30，另 19 家与已有 OSM 条目按坐标 < 150 m 判为同一家、只补字段）。
  seed 回填 4143 → 4250。
- **实测覆盖（推翻了写脚本时的预期）**：
  - 韩文 KorService2 的济州住宿 `contentTypeId=32` **只有 49 条**，`searchStay2` 同样是 49 —— 官方库收录的是精选住宿，不是全量。
  - 简中 ChsService2 / 英文 EngService2 **不含住宿**：全国 `contentTypeId=32` 的 totalCount 都是 0（济州全类型只剩 171 / 163 条）。
    所以「拿官方中文名 / 英文名」这条路**走不通**，本轮 `nameZhOfficial` / `nameEnOfficial` 均为 0，
    49 条的中文名仍走 `gen_stay_zh.py` 既有口径。脚本头那句「外语服务直接给出官方中英文名」已改正。
- **cat3 映射表按实测重校准**（原先照文档推断，错得离谱）：`B02011100` 被映射成「汗蒸房」，
  而它下面 18 条是 나이스호텔 / 엠버리조트 / 천지연크리스탈호텔 这类酒店度假村；`B02010700` 映射成「度假村」，
  实际 12 条清一色是 펜션（已改「民宿」）。现在 cat3 **只作兜底**，业态一律由 `gen_stay_zh.py`
  按名称里的业态词判定，与 OSM 条目同一口径。
- **踩坑**：note 原先只在为空时才补，导致上一轮写错的「汗蒸房」永久留在库里（솔트 / 제주브릭스 / 해성파크텔）。
  改成每次重跑都按校准后的 cat3 刷新，污染值可自愈。同理「官方名保护」改用显式标记
  `nameZhOfficial` / `nameEnOfficial`，不再用 `source=tourapi and nameZh` 判断 —— 否则自动生成的中译
  会被误当成官方名保护起来，永远刷不掉。
- **仍未解决**：用户点名的 제주아시아호텔（济州亚洲酒店）TourAPI 里也没有。要补得换数据源
  （Kakao Local API）或人工补录。

### TourAPI key 改存本地文件，不进 git

- 需求：上一轮要求 key 靠 `export` 传，每次开新终端都要重设，还容易手滑粘进命令历史。
- 做法：新增 `.env.example`（提交，只有空键名 + 三个申请链接）与 `.env`（`cp` 自模板，填真实 key，
  `.gitignore` 已忽略）。`scripts/fetch_stays_tourapi.py` 加 `load_env()`：启动即读项目根 `.env`。
- 优先级：**已 export 的同名环境变量 > .env** —— 临时换 key 不用改文件。空值、纯注释、
  无 `=` 的行一律跳过，所以模板原样复制也不会读出空 key。
- 坑：`.gitignore` 里 `#` 只在行首才是注释。最初把说明写在 `!.env.example` 行尾，整段中文被当成
  pattern 的一部分，导致模板反而被 `.env.*` 挡住无法提交 —— 说明必须单独成行。
- 校验：`git check-ignore -v` 确认 `.env` 被忽略、`.env.example` 不在忽略列表。

### 住宿英文名：只抄 OSM 真实拉丁名，98 条有、835 条留空

- 用户要求「只要真实的英文名，没有就留空，不要拿中文/韩文翻译」。所以**没有任何翻译与转写**，
  全部照抄 OSM 里本来就存在的拉丁字母字符串。
- 三个来源：① 名称本身是拉丁字母（OSM 的 `name` 即英文，79 条，如 `White Castle Pension`）；
  ② 韩文名括号里带的拉丁串（如 `성문모텔 (Seongmun Motel)`）；③ 韩英混合名里成段的英文部分
  （`JW Marriott Jeju Resort & Spa - JW 메리어트…` 取前半）。
- **纯罗马音串不进 nameEn**：`Haeddeuneunjip`、`Eondeokwiuihayanjip` 这类是韩语罗马转写不是英文，
  它们的位置在 `nameRomaja`。括号内噪声（`Yongnam Reports Park (free)` 的 `free`）同样排除。
  「CF 모텔」「제주JJ게스트하우스」的拉丁只是缩写碎片，不构成英文名，不填。
- 933 条里 98 条取到、835 条留空 —— OSM 对济州这些民宿绝大多数没记录拉丁名，这是数据现状，不是遗漏。
- **没走补抓**：想拿全量 `name:en` 只能重查 Overpass，本机两次都失败（overpass-api.de 返回
  Dispatcher 超时、kumi 镜像空响应），按「试两次即停」停下。已在 `fetch_stays.py` 里存下
  `tags["name:en"]`，将来网络通了重跑爬虫即可自动带上，不必再改脚本。

### 住宿中文名：从「音译假汉字」改成「只补可靠中文」，933 条全覆盖

- **为什么缺**：`gen_stay_zh.py` 只在早先 5 个镇（表善 / 西归浦 / 涯月 / 金宁等）跑过，
  后来新增的 10 个镇没重跑，所以 933 条里只有 239 条有 `nameZh`，城山 0/51、济州市 0/269 整片为空。
- **为什么不直接补齐了事**：原口径是「韩文音节 → 汉字」硬凑，产出 `와하하 → 瓦夏夏`、
  `고망난돌 → 高马罗道`、`일성 → 伊徐培徐` 这类名字。住宿方根本没有这个中文名，
  拿去订房 / 导航 / 问路全都搜不到，属于误导，所以没有沿用，改成新口径重写。
- **新口径（只补三类可靠中文）**：① 行政区标准汉字（제주→济州、서귀포→西归浦、성산→城山）；
  ② 业态词中译；③ 国际连锁官方中文名（Marriott→万豪、Hyatt→凯悦）。
  品牌是固有词、无对应汉字的（파도소리、해뜨는아침、와하하）**一律保留韩文原名**，不再硬凑。
- **业态按名称识别，不再信 OSM 的 tourism 子类型**：OSM 常把 민박 标成 `motel`，
  直译出来是「汽车旅馆」，与实情差得远。改成从名称里的业态词判定后，
  「汽车旅馆」305 → 102，민박 归位到「家庭民宿」192 条。
- 新增 `nameRomaja`（Revised Romanization 简化转写），供在韩国地图里搜索；
  界面上中文名旁边保留韩文原名小字，打印版括注原名 —— 打印版要带在路上，问路时原名比中文名管用。

### 行程位置地图：住宿标可隐藏（默认显示）

- 行程篮里路线一多，住宿（紫标）能铺出十几个，压在线上看不清路线走向，所以加了「显示住宿」开关，
  放在「行程位置」标题右侧；只在当前行程篮确有住宿数据时才出现。
- 开关状态存在本机视图偏好 `jejuolle100k.ui` 的 `planMapHotels`（与 `planHideDone` 同一处），
  **不进备份文件** —— 导入别人的备份不该顺手改掉我的地图显示偏好。
- 默认值走 `raw.planMapHotels !== false`：这个字段是「默认开」，不能沿用其他开关 `=== true` 的兜底写法，
  否则首次进来的用户（本地还没有这个键）会直接看不到住宿。
- 隐藏时给 `RouteMap` 传 `hotels={[]}`，顺带让视野自适应也不再把住宿算进包围盒。
- 图例跟着改：住宿 / 看点只在图里真有这类标记时才列出，之前是无条件常驻 ——
  收起住宿后留一个「住宿」图例项会对不上图。离线示意图（底图挂掉的降级视图）同样处理。

### 「重新加载数据」：文案不再闪跳，改成箭头转圈

- 原实现是点击后把按钮文案从「重新加载数据」换成「加载中…」，跑完再换回来。但 `reload()` 是
  `setLoading(true)` + 一帧 `requestAnimationFrame` 就读完 localStorage，全程只有一两帧，
  结果就是文案「闪一下」再弹 toast，观感像 bug。
- 现在文案恒定，按钮内左侧放一个循环箭头 SVG（`SettingsPage.module.less` 的 `.reload-icon`），
  点击后加 `.is-spinning` 匀速转，完成后撤掉类名并弹 toast。
- 加了 `RELOAD_MIN_SPIN_MS = 450` 的下限：真正的数据读取早就结束了，但 toast 会等满这段时间才弹，
  否则图标同样只转一两帧、等于没改。
- 按钮不再用 `disabled` 阻断重复点击（`.btn:disabled` 有 `opacity: .5`，转圈会发灰看不见），
  改成在 `handleReload` 里 `if (reloading) return`，另加 `aria-busy` 给读屏。

---

## 2026-10-01

### 轨迹覆盖终于补齐到 27/27

`check_official_consistency.py` 当前输出：**官方 27 条全部有轨迹，缺轨迹 0 条**。
这是三轮反复的结果 —— 09-28 首轮 23 条、09-29 复核降回 22 条（主动撤下两条不可信几何）、
到 09-29~09-30 把 `07` / `14-1` / `18-2` 逐条重建后才补满。

- `07`：`tracks.json` 的 source 写作 `2022-12-24 olle-07 GPX + official app map digitization`
  （对应提交 `573e918` *Add reconstructed Jeju Olle route 7 track*）。
- `14-1`：`olle-14-1-walk.gpx`，端点改为跟随真实 GPX（提交 `37dbad0`）。
- `18-2`：`olle-18-2-walk.gpx`（三源都拿不到后，另找的单条步行 GPX）。

### 仍有 12 条里程偏差超 ±5%（爬升数字要打折看）

| 编号 | 官方 | 轨迹 | 偏差 |
| --- | --- | --- | --- |
| 15 | 15.5 | 18.44 | **+19.0%** ⛔ |
| 08 | 19.3 | 17.01 | **−11.9%** ⛔ |
| 01-1 | 13.2 | 12.00 | −9.1% |
| 14 | 19.9 | 18.11 | −9.0% |
| 05 | 13.4 | 14.53 | +8.5% |
| 18 | 17.1 | 18.51 | +8.2% |
| 17 | 19.5 | 18.04 | −7.5% |
| 07 | 12.9 | 11.95 | −7.4% |
| 06 | 10.1 | 9.40 | −6.9% |
| 21 | 11.3 | 10.57 | −6.4% |
| 03 | 20.9 | 22.22 | +6.3% |
| 13 | 16.2 | 15.37 | −5.1% |

官方逐条合计 **402.8 km**，有轨迹部分合计 **398.8 km**。

### 行前清单：「支持折叠展开」到底指什么（用户纠偏）

- 首版给「图文教程」做了弹窗。用户原话：「**待办清单单项想要支持折叠展开图文教程的能力呢？你不搞个折叠，你搞个弹窗也行啊**」
  —— 主诉求是**条目就地展开**，弹窗只是次选。
- 于是把 `TutorialModal` 拆出 `TutorialBody`（正文）与弹窗壳，条目下就地展开面板 + 弹窗作为「大图查看」补充入口。
- 随后用户又要求把弹窗 UI 与逻辑**全删**、只留折叠：组件改名为 `Tutorial.tsx`，只导出 `TutorialBody`，
  Modal / `useIsMobile` 依赖、面板里的「大图查看」按钮、`tutorialId` state 一并删除。
- **沉淀：用户说「支持折叠展开」= 就地手风琴，不是弹窗**；弹窗只能做补充入口，不能当作折叠的实现。

### 行程单：重排版式 / 移动端存图 / 备用信息页

- 行程单改「Day 卡片 + 胶囊标签」，并加「起床/出发/收工」时间标签 —— 时间全是**派生估算**（Plan 类型没有时间字段）：
  一天一条线按 16:00 收工、两天及以上按 17:00，起床 = 收工 − 总步行估算 − 2.5h 缓冲。
- 离岛线额外计入「买票排队 0.5h + 坐船往返」（牛岛 0.5 / 加波岛 0.7 / 楸子岛 2.5h），会反向改变起床时刻。
- 备用信息页（紧急电话 + 中韩求助用语）默认关闭、勾选才进打印/截图。
- 打印横向溢出：`.tbl` 单元格的 `white-space: nowrap` 遇到邮箱/带连字符号码/长韩文会撑破表格 →
  改 `table-layout: fixed` + `overflow-wrap: anywhere`。

### 住宿数据接入（OSM Overpass）

- `public/stays.json`：17 城镇 / 239 家；OSM **不提供** rating / priceRange，全为 null，页面不编造（无数据就不渲染标签）。
- `scripts/gen_stay_zh.py` 生成中文名：分类词取自韩文原名 + 品牌音译（初/中/终声映射），无法音译的音节回落韩文原字，**绝不编假汉字**。
- `scripts/build_seed_stays.py` → `src/lib/seedStays.ts`，把爬来的住宿变成后台可编辑的一等数据（覆盖 12 条线）。

### 相册 loading 占位

所有 loading 卡片此前同高（回落 `DEFAULT_RATIO=4/5`），图片解码完才突然变高回流。
改为把原始宽高写进 `manifest.json` / `maps.json`（`scripts/backfill_photo_dims.py` 回填），
`Thumb` 优先用 `image.width/image.height` 算 `aspect-ratio`。回填后实测 1.33~6.99 不等，证实此前确实全落的同一个兜底值。

### 其他

- 构建分包：单 chunk 超 1M → react / leaflet / echarts 手动拆 chunk + 路由级懒加载，主包降到 236KB(gzip 64KB)。
- 新增 MIT `LICENSE`（代码 MIT、OSM 数据 ODbL、配图 CC BY 各自边界写在文末）。

---

## 2026-09-30

### 07-1 终点钉官方 GPS 并重绘尾段（提交 `f0e0dc8`）

- 上游 GPX 尾段跑到了别处，改为**按官网景点序列重绘尾段**，并移除 legacy 途经点标记机制。
- 结果是 `07-1` 现在能被**官方 GPS 端点判据**认可（端点 ≤0.2km），成为 27 条里极少数有官方实测端点锚定的线。
- 同时清理了 `snapRouteEnds` / `isUntouchedSeed` 等端点吸附死代码。

### 卡片封面改用风景照，官方路线图退到详情页相册

- 原因很直接：官方路线图缩到卡片尺寸只剩一片灰白，风景照一眼能认出这条线。
- 于是出现两套素材 + 一份 manifest，封面优先级变成「后台自设 cover > 风景照 > 官方路线图」。

### 徒步装备清单移进「备选清单」候选池

id 仍沿用 `gear.*`（从必选清单分组搬过来时刻意不改）—— **本机已存的勾选/放弃状态按 id 记录，换 id 会让用户之前勾过的项全部「失忆」**。

### 项目改名 jeju-100k → jeju-olle-100k

改名伴随着一次 v1 重置；此后**不做 localStorage 历史数据兼容/迁移**，`SEED_VERSION` 迁移逻辑一并移除。

### 样式：CSS → Less + CSS Modules

组件样式各自成 `.module.less`，`print.less` 用 `[class*='sheet']` 这类子串匹配选择器去命中 CSS Modules 改写后的类名 —— **不用具体类名，因为类名会被哈希**。

---

## 2026-09-29

### 官方里程口径确立：两个现行基准，且只认它们

偶来各线的**起终点与里程改过好几轮**，第三方手绘路线图（小红书/旅游门户那类）大多是**改线前**的口径。
拿它当基准去「纠错」，会把已经对的改错。

| 基准 | 内容 | 固化在哪 |
| --- | --- | --- |
| ① jejuolle.org 官网编号表 | 编号 / 起终点 / 里程 / 难度 | `src/lib/seed.ts` 的 `SPECS`（唯一真源） |
| ② 官方 Olle App 的路线列表 | 编号 / 中文起终点 / 里程 / 建议用时 | `scripts/data/olle-app-routes.json`（截图快照） |

`check_official_consistency.py` 会**先拿 ② 对一遍 `SPECS`**（外部权威基准），再拿 `SPECS` 对 `tracks.json`（内部几何）—— 两层分开查。

**逐条核对结果：27 条里程全对、起终点全对。** 两基准唯一差别是 App 把 3 号线与 15 号线各列成 A/B 两条走法
（3-B 14.6km、15-B 13.0km），本项目记作主线（`03`=3A 20.9km、`15`=15A 15.5km）。

⚠️ **爬升不在这两个基准里**：App 只给海拔剖面小图不给数字，官网也不公布。爬升一律来自轨迹点 + SRTM 30m 地形。

### 官网「437km」vs 逐条相加 402.8km

官网首页写「총 437km 27코스」是**宣传口径**，`SPECS` 逐条相加是 **402.8km**。两个数都对，差约 34km 未明
（疑似官方把「连接路段」也算进 437）。**不要为它去改任何一边**，页面用哪份在文案上说清即可。

### 改线前的旧图 vs 现行口径（留档）

| 编号 | 官网现行 | 网上手绘图 | 差在哪 |
| --- | --- | --- | --- |
| 1 | 시흥-광치기 **15.1** | 15.6 | 里程 |
| 2 | 광치기-온평 **14.8** | 10.5 | 里程（旧的 10.5 配 5-6 小时不合常理） |
| 6 | 쇠소깍-**제주올레여행자센터** **10.1** | 牛沼河口-**独立岩** 14 | **终点变了** |
| 7 | **여행자센터-서귀포버스터미널** **12.9** | **独立岩-月坪** 13.8 | **起终点都变了** |
| 7-1 | **서귀포버스터미널-여행자센터** **15.7** | 世界杯竞技场-独立岩 15.1 | **整条换掉** |
| 9 | 대평-화순 **12.3** | 大坪-和顺 7.1 | 里程（9 线延长过） |
| 16 | 고내-**광령** **14.8** | 高内-**光令1里事务所** 16 | **终点变了** |
| 17 | 광령-**김만덕기념관** **19.5** | 光令-观德亭-**甘穗休息室** 18.1 | **终点变了** |
| 18 | **김만덕기념관**-조천 **17.1** | **济州原都心**-朝天万岁公园 19.7 | **起点变了** |

官网 `코스 안내` 公告栏的改线通知与上表完全对得上：

```
제주올레 16코스 종점 스탬프&루트 변경 안내     2025-06-24
제주올레 17코스 시작점 스탬프&루트 변경 안내   2025-06-24
제주올레 7코스  법환포구 구간 변경             2026-07-01
제주올레 17코스 창오교~우평로 우회             2026-07-09
```

🚨 **踩过**：曾经拿一张手绘路线图当「官方数据」，据此把 `07` 的终点从 `seogwipoTerminal` 改成 `wolpyeong` ——
正好改反了（`07-1` 才不走那里）。同图上的「6=牛沼河口-独立岩」也对不上官网现行的 6 线。
**口径冲突时一律以 jejuolle.org 当前值为准。**

### 走过的一段弯路：曾把 07、14-1 撤下（后已重建）

这一轮的结论是「22/27」，与现在不同 —— 当时的处理是主动做减法：

- **撤 `07`**：端点闸门抓出来的。它有几何，长度也「正好」12.75km（官方 12.9，98%，**光看里程完全看不出来**），
  但终点落在**月坪**、离官网的 `seogwipoTerminal` 3.7km —— 走的是**旧走向**。这是「里程对了 ≠ 走向对了」的活例子。
- **撤 `14-1`**：OSM 的 19 条 en way 缝出来是 4 段且首尾乱跳；GPX 段 17.55km = 官方 9.3km 的 **189%**，也是改线前旧走向。
- **`07-1` 方向强制翻转**（`--reverse 07-1`）：自动走向校正没兜住它 —— 它靠「相邻课程首尾相接」反推，
  而上游把 `07` 撤掉后 `06↔07-1` 的接点相距 0.44km（> 80m 阈值），没被判成相邻课程。
  **首尾相接的自动校正只在链条完整时才灵。**

两条线后来按官方现行资料重建可用几何后才重新上线（见 2026-09-30 / 10-01）。

### 当轮偏差快照（只列非 ✅）

| 编号 | 官方 | 轨迹 | 偏差 | 说明 |
| --- | --- | --- | --- | --- |
| 15 | 15.5 | 18.44 | **+19.0%** | 起终点（翰林/高内）对得上，但比公布里程长 2.9km |
| 08 | 19.3 | 17.01 | **−11.9%** | 少画一段 |
| 14 | 19.9 | 18.10 | −9.0% | |
| 18 | 17.1 | 18.51 | +8.2% | |
| 05 | 13.4 | 14.44 | +7.7% | |
| 17 | 19.5 | 18.04 | −7.5% | |
| 21 | 11.3 | 10.57 | −6.4% | |
| 03 | 20.9 | 22.20 | +6.2% | 取的是 3-A 走法 |
| 07-1 | 15.7 | 14.73 | −6.2% | |
| 13 | 16.2 | 15.37 | −5.1% | |

### 官方里程一度在脚本里存了副本（导致误判）

脚本曾手抄过一份官方里程副本，写着 09=8.0（官方 12.3）、18=19.8（官方 17.1）、15=19.0（官方 15.5），
13 条是旧资料口径 —— 结果把 99% 正常的 **09 判成「153%、比官方长」**，白查了一轮缝合算法。
现改为从 `src/lib/seed.ts` 的 `SPECS` 解析（`load_official_km`，解析不出来就大声报错）。
**判「超长」之前，先用官方站的里程表核一遍基准。**

---

## 2026-09-28

### OSM 三源比选首版上线（23/27）

**23/27 条导出**（比只查 relation 时的 14 条多 9 条），**20 条零断口**。剩下 3 条 `01-1 / 18-1 / 18-2` 是离岛支线，保持示意虚线。

| 编号 | 选中源 | 实走 | 官方 | 覆盖 | 断口 |
| --- | --- | --- | --- | --- | --- |
| 01 | relation | 15.22 | 15.1 | 101% | — |
| 02 | relation | 14.68 | 14.8 | 99% | 123m |
| 03 | **gpx（3-A）** | 22.34 | 20.9 | 107% | — |
| 04 | relation | 19.01 | 19.0 | 100% | 98m |
| 05 | gpx | 14.54 | 13.4 | 108% | — |
| 06 | both-gpx | 9.85 | 10.1 | 98% | 1.6km |
| 07 | **gpx** | 12.75 | 12.9 | 99% | — |
| 07-1 | gpx | 14.82 | 15.7 | 94% | — |
| 08 | gpx | 17.14 | 19.3 | 89% | — |
| 09 | relation | 12.23 | 12.3 | 99% | 366m |
| 10 | gpx | 15.66 | 15.6 | 100% | — |
| 10-1 | gpx | 4.30 | 4.2 | 102% | — |
| 11 | relation | 17.05 | 17.3 | 98% | — |
| 12 | **gpx** | 17.20 | 17.5 | 98% | — |
| 13 | **gpx** | 15.60 | 16.2 | 96% | — |
| 14 | **gpx** | 18.26 | 19.9 | 92% | — |
| 15 | **gpx** | 18.67 | 15.5 | 120% ⚠️ | — |
| 16 | gpx | 15.74 | 14.8 | 106% | — |
| 17 | **gpx** | 18.18 | 19.5 | 93% | — |
| 18 | gpx | 18.79 | 17.1 | 110% | — |
| 19 | gpx | 19.00 | 19.4 | 98% | — |
| 20 | gpx | 17.78 | 17.4 | 102% | — |
| 21 | **gpx** | 10.65 | 11.3 | 94% | — |

### 只看 relation 会得出完全错误的结论

本项目一度判「12、13、14、15、17、21 在 OSM 里没有数据」—— **relation 确实没有，但散 way 有**。
全岛 `highway` + 名字含「올레 / Olle」的 way **722 条**，12 有 77 条、13 有 74 条、15 有 96 条。
前端当时只能把 `seed.ts` 的**城镇级近似坐标**连起来 —— 就是地图上那根从西南直插东北的假直线。
**判断「某个源没有」之前，先把别的源都查一遍。**

### OSM 覆盖实况

- 框内 `route=hiking` 关系共 **25 个**，名字含「올레」的 **20 个**；其余 3 个是汉拿山登山道
  （관음사코스 / 사라오름코스 / 성판악코스）—— 加 `--broad` 复查过，没漏掉偶来的线。
- relation 覆盖 **01–06、08–11、16、18、19、20**；**12、13、14、15、17、21 没有 relation**，靠散 way / GPX 补。
- OSM / GPX 都是**历史快照**，官方改线它不会自动跟上。拿走向前先核官方里程、再核官方 GPS 端点。

### 三个坑（都踩过，都静默）

1. **两套命名习惯覆盖同一段路**：`올레길 12`（韩文，零散 7 条）与 `Ollegil 12`（英文，完整 70 条）。
   混在一个池子里缝 = 同一段路喂两遍（12 只能画出 43%）。`named_ways()` 按 **(编号, 命名习惯)** 分组。
2. **`Ollegil N` 几乎全是 `footway`**（12 号：73 条 footway + 4 条 unclassified，中位 138m），
   只覆盖离路段步道，被村道隔成 16 段 —— 光靠散 way 也拼不出完整线路（这是整条 GPX 那个源存在的理由）。
3. **`<trkpt lat=".." lon="..">` 是 lat 在前**。解析时读成 `(lng, lat)` 才对，摆反**不报错**，
   但里程全是垃圾（实测摆反 374.6km，正确值 384.6km）。

### 缝合算法的取舍（why）

1. **缝合按节点级匹配**，不是只看端点 —— 一条长 way 的中途节点被别的 way 接上是常态，
   只比端点会把它误判成断口，图上凭空多出一段跳线。岔路口按**直行优先**选下一段。
2. **接不上就收尾分段，不用直线硬连**。段与段之间就是 OSM 真没画的地方，导出成 `MultiLineString`，
   前端按段画 → 地图上是**真的缺口**，不伪造。被拆成「父关系 + 子关系」的线，`out geom` 不会递归下去，
   脚本**按 id 精确补一次**（不依赖 `rel(br.r)`，部分镜像不支持它、直接回 400）。
3. **拒绝「闭合旁路」**：走完候选 way 会落回链子**内部**已走过的节点 → 说明它是绕一圈回到原路的**替代支线**
   （OSM 常把 A/B 变体、无障碍路线塞在同一关系里）。这类段剔出几何与里程，报表如实写明剔了多长；
   加 `--keep-parallel` 可保留原样。实测证据只有 **03**（剔前 29.76km/142% → 剔后 22.71km/109%）与 05（15.33→14.60，剔 0.74km）
   —— **别拿它解释所有超长**。
4. **段内折返单独报数**：同一节点在一段里被走了两次 → 中间那几公里是白走的，而且**剔不掉**（它长在这段里面），
   报表给「折返 N 处 / 共 X km」。
5. **补缺只「补缺」，不取并集**：`uncovered_ways()` 只剪出 base 上真没有的那几段，且**逐套命名分别做**。
   不变量：**合并结果不得比 base 短**（`add_merge`），否则放弃候选并写明原因。
6. **明确排除清单 `SKIP`**：当时只有 `14-1`。**故意写成「对某一条线的判断」而不是继续调阈值** ——
   阈值是全局的，为一条线放宽会连带影响另外 20 多条。

⭐ **一条极灵的判伪口径：实走里程 ≤ 官方里程**。一条线不可能比它自己长。倒挂只有三种原因，诊断区分开报：
① 替代支线/变体混进关系（**并联段**，两端挂回主线）→ 剔掉；
② 段内折返（**同一节点走两次**）→ 剔不掉，只报数；
③ **这个源映射的根本不是那条线**（官方已改线、OSM 还留着旧走向）→ 几何完全自洽，
内部一致性检查查不出来，**只能靠里程倒挂发现**（实测 `07` 的 relation = 154%）。

📌 **不桥接。** 脚本有 `--bridge M`（把 ≤M 米的两段用直线接起来，默认关）。
本项目不用：剩下的断口最大 366m，在地图上约 1px 肉眼看不见；而直线桥接是**假几何**。

### 走向自动校正首轮生效

自动校正实测判出 `06`、`11` 需要翻转（这两条的几何来自 relation 侧，拼接时方向随机）—— **判对了**：
翻转后 11 = 「摹瑟浦 → 武陵」、06 = 「牛沼端 → 济州偶来旅行者中心」，与官方一致。23 条回头逐条比 GPX 首末点，全部同向。

### 底图：腾讯地图 → Leaflet + CARTO → Leaflet + OSM/OpenTopoMap

- 一开始用腾讯地图：站点定位在济州岛（海外），腾讯地图对**海外区域没有瓦片**，
  页面看起来「地图组件展示出来了但没有任何内容、一片纯灰」，把地图缩小能看到济州岛轮廓但看不到任何地图信息，
  图例上直接显示 `api key required`。先换成 Leaflet + CARTO。
- 再发现 **CARTO 现在对匿名请求强制返回带 "API key required" 水印的瓦片**，需要自己申请 Key。
- 最终落到 **OpenStreetMap / OpenTopoMap**（真免 Key）。教训：**海外定位的项目，底图要先验证目标区域有没有瓦片，再谈选型。**

### 官方 Route Map PDF 切页作封面

- 页码 ↔ 路线号必须逐页核对：`PAGE_CODES` 按每页右下角印的粗体路线号整理（PDF 第 1 页是封面，2~27 页才是路线）。
- **不要裁切**：官方页地图铺满整页，裁掉上下 30% 会切到路线本体（01 线南端、10-1 的济州本岛侧都会被切）。
- 这份 2017.10 版**没有 Route 18-2 那一页**。
- 一份图出两个尺寸（详情页原图 + 卡片封面压缩版）的理由与尺寸详见 README §6。

---

## 附：仍然通用的判伪口径

- **实走里程 ≤ 官方里程** —— 一条线不可能比它自己长，倒挂必有因，见上文 2026-09-28 那节列出的三类成因。
- **里程对了 ≠ 走向对了** —— 必须另外拿官方 GPS 端点卡一遍（这是撤下旧 `07` 几何的唯一线索）。
- **别用 `seed.ts` 的 PLACES 坐标判「走向对不对」**：那里是城镇级近似坐标（实测 `siheung` 偏 10km、`yongsu` 偏 13km），判不了。
  判走向用 `endpoint_verdict()`，它拿标了 `// 官方 GPS` 的点去卡轨迹两端（容差 2km）。
- **能抛错就别静默**：`lat/lon` 写反、`SPECS` 解析不出来这类问题，静默吞掉是最贵的 bug —— 现在都会大声报错。
