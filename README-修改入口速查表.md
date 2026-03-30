# BLEACH-Phone 修改入口速查表

这份文档用于快速判断：

> **某个功能要改，应该先打开哪个文件。**

适合在后续维护时直接查阅，不用每次都从头翻整个工程。

---

## 1. 总原则
先判断你要改的是哪一层：

### A. 宿主层（SillyTavern 外层浮窗）
负责：
- 扩展菜单入口
- 浮层打开/关闭
- 手机位置与缩放
- iframe 容器
- 与酒馆页面的点击穿透关系

优先看：
- `BLEACH-Phone/index.js`
- `BLEACH-Phone/style.css`

### B. 手机页面层（iframe 内的手机 UI）
负责：
- 手机界面
- app 内容
- 按键事件
- 屏保、音乐、视频、AI、联系人、设置

优先看：
- `BLEACH-Phone/bleach.html`
- `BLEACH-Phone/scripts/main.js`
- `BLEACH-Phone/scripts/apps/*`
- `BLEACH-Phone/styles/core/*`
- `BLEACH-Phone/styles/apps/*`

---

## 2. 常见修改需求 → 对应入口

## 2.1 改扩展菜单入口
例如：
- 菜单名称
- 点击菜单后打开逻辑
- 菜单注册失败时的 fallback

先看：
- `BLEACH-Phone/index.js`

建议搜索关键词：
- `registerExtensionsMenuItem`
- `MENU_ITEM_ID`
- `MENU_API_ID`
- `open`

---

## 2.2 改手机浮层大小 / 初始画布大小
例如：
- 整个宿主画布太大/太小
- 动画容易被裁切
- 想改宿主基础尺寸

先看：
- `BLEACH-Phone/index.js`
- `BLEACH-Phone/style.css`

建议搜索关键词：
- `BASE_DIALOG_WIDTH`
- `BASE_DIALOG_HEIGHT`
- `bleach-phone-modal__dialog`

---

## 2.3 改打开时居中逻辑
例如：
- 移动端每次打开都居中
- 桌面端保留上次位置
- 想统一改成每次都居中

先看：
- `BLEACH-Phone/index.js`

建议搜索关键词：
- `centerModal`
- `shouldCenterOnOpen`
- `setModalPosition`

---

## 2.4 改拖拽方式
例如：
- 右键拖拽
- 整机拖动
- 拖动时是否允许超出屏幕

先看：
- `BLEACH-Phone/index.js`

建议搜索关键词：
- `drag`
- `pointer`
- `mouse`
- `touch`
- `setModalPosition`

---

## 2.5 改缩放方式
例如：
- `Ctrl/Meta + 滚轮` 缩放
- 双指捏合缩放
- 缩放上限/下限
- 自动缩放策略

先看：
- `BLEACH-Phone/index.js`

建议搜索关键词：
- `MIN_SCALE`
- `MAX_SCALE`
- `SCALE_STEP`
- `getAutoScale`
- `wheel`
- `pinch`

---

## 2.6 改点击穿透 / 宿主挡点击问题
例如：
- 手机外区域不该挡住酒馆点击
- 动画时需要临时扩大可交互区
- 正常时只让手机本体可点击

先看：
- `BLEACH-Phone/index.js`
- `BLEACH-Phone/style.css`

建议搜索关键词：
- `pointer-events`
- `clipPath`
- `compactInteractionRegion`
- `expandInteractionRegion`
- `scheduleCompactInteraction`
- `COMPACT_INTERACTION_PADDING`

---

## 2.7 改手机整体 DOM 结构
例如：
- 加一个新按钮
- 调整屏幕区层级
- 改某个 app 的 HTML 骨架
- 改 script / css 引入顺序

先看：
- `BLEACH-Phone/bleach.html`

建议搜索关键词：
- `<script src=`
- `app-window`
- `screen-saver`
- `phone`
- `grid-item`

---

## 2.8 改全局初始化流程
例如：
- 页面加载时先恢复哪些状态
- 初始化主题/字号/列表数据
- 首次打开默认行为

先看：
- `BLEACH-Phone/scripts/main.js`
- `BLEACH-Phone/scripts/state.js`
- `BLEACH-Phone/scripts/storage.js`

建议搜索关键词：
- `getStored`
- `applyTheme`
- `applyFontSize`
- `updateTime`
- `fitPhoneToViewport`

---

## 2.9 改菜单首页逻辑
例如：
- 九宫格菜单内容
- 菜单选中态
- 数字快捷打开 app
- 菜单项点击后进入哪个 app

先看：
- `BLEACH-Phone/scripts/main.js`
- `BLEACH-Phone/bleach.html`

建议搜索关键词：
- `grid-item`
- `getMenuItems`
- `updateMenuSelection`
- `openMenuShortcut`
- `openApp`

---

## 2.10 改 app 打开/关闭逻辑
例如：
- 打开某个 app 时显示什么
- 关闭 app 时回到哪里
- ESC / 返回键逻辑

先看：
- `BLEACH-Phone/scripts/main.js`

建议搜索关键词：
- `openApp`
- `closeApp`
- `renderAppWindow`
- `confirmCurrentSelection`
- `Escape`

---

## 2.11 改统一点击事件分发
例如：
- 某个按钮点了没反应
- 新增按钮但没有绑定事件
- 某些事件被 stopPropagation 影响

先看：
- `BLEACH-Phone/scripts/main.js`

建议搜索关键词：
- `addEventListener('click'`
- `addEventListener('input'`
- `addEventListener('keydown'`
- `app-window`
- `closest(`

> 说明：现在很多 app 的点击不是在 HTML 内单独绑，而是在 `main.js` 里统一代理分发。

---

## 2.12 改主题
例如：
- 黑红主题 / 白色主题
- 主题变量
- 主题切换后的颜色

先看：
- `BLEACH-Phone/scripts/apps/settings/index.js`
- `BLEACH-Phone/styles/core/themes.css`

建议搜索关键词：
- `applyTheme`
- `theme-black`
- `theme-white`
- `--`

---

## 2.13 改字号
例如：
- 小/中/大/特大
- 字号倍率
- 不同 app 的字过大或过小

先看：
- `BLEACH-Phone/scripts/apps/settings/index.js`
- `BLEACH-Phone/styles/core/base.css`

建议搜索关键词：
- `applyFontSize`
- `fontSize`
- `font-scale`

---

## 2.14 改屏保
例如：
- 屏保图片列表
- 随机屏保
- 锁屏显示
- 外屏时间与壁纸缩略图

先看：
- `BLEACH-Phone/scripts/apps/settings/index.js`
- `BLEACH-Phone/styles/apps/screensaver/index.css`
- `BLEACH-Phone/bleach.html`

建议搜索关键词：
- `screenSaver`
- `screen-saver`
- `prepareRandomScreenSaver`
- `setScreenSaverVisual`
- `lid-open-thumb`

---

## 2.15 改音乐功能
例如：
- 音乐列表
- 音乐新增/删除
- 播放器 UI
- 进度条拖动
- 上一首下一首 / 循环模式

先看：
- `BLEACH-Phone/scripts/apps/music/index.js`
- `BLEACH-Phone/styles/apps/music/index.css`
- `BLEACH-Phone/scripts/main.js`

建议搜索关键词：
- `musicEntries`
- `renderMusic`
- `openMusicPlayer`
- `toggleMusicPlayback`
- `seekMusicPlayback`
- `data-music-control`

> 如果是“按钮能显示但点了没反应”，通常还要回头查 `main.js` 里的统一点击代理。

---

## 2.16 改视频 / 网络播放器功能
例如：
- 视频列表
- URL 输入
- 载入视频
- 横屏观影
- 全屏/恢复

先看：
- `BLEACH-Phone/scripts/apps/network/index.js`
- `BLEACH-Phone/styles/apps/network/index.css`
- `BLEACH-Phone/scripts/main.js`

建议搜索关键词：
- `networkVideoEntries`
- `renderNetwork`
- `loadNetworkVideoUrl`
- `toggleNetworkFullscreen`
- `network-cinema`
- `network-cinema-landscape`

---

## 2.17 改新闻 / news
例如：
- 新闻列表内容
- 新闻详情打开/关闭
- 选中逻辑

先看：
- `BLEACH-Phone/scripts/apps/news/index.js`
- `BLEACH-Phone/styles/apps/news/index.css`
- `BLEACH-Phone/scripts/main.js`

建议搜索关键词：
- `newsEntries`
- `openNewsDetail`
- `closeNewsDetail`
- `news-item`

---

## 2.18 改联系人 / AI 对话
例如：
- 联系人列表
- 联系人编辑
- 聊天界面
- 删除联系人
- 发送消息

先看：
- `BLEACH-Phone/scripts/apps/contact/index.js`
- `BLEACH-Phone/styles/apps/contact/index.css`
- `BLEACH-Phone/scripts/main.js`

建议搜索关键词：
- `aiContacts`
- `openAiContactList`
- `openAiContactChat`
- `closeAiContactEditor`
- `contact-saved-item`
- `ai-contact-chat-input`

---

## 2.19 改 AI 设置 / 模型 / 参数
例如：
- API 地址
- key
- 模型列表
- 参数配置
- system prompt
- 主聊天规则

先看：
- `BLEACH-Phone/scripts/apps/ai/index.js`
- `BLEACH-Phone/scripts/apps/settings/index.js`
- `BLEACH-Phone/styles/apps/ai/index.css`
- `BLEACH-Phone/styles/apps/settings/index.css`

建议搜索关键词：
- `aiSettings`
- `persistAiSettings`
- `openAiConfig`
- `openAiModelList`
- `openAiParamConfig`
- `openAiSystemPromptEditor`
- `openAiMainChatConfig`

---

## 2.20 改本地存储
例如：
- 改 localStorage key
- 新增持久化字段
- 改默认值和数据清洗

先看：
- `BLEACH-Phone/scripts/storage.js`

建议搜索关键词：
- `storageKeys`
- `getStored`
- `save`
- `persist`
- `normalize`

---

## 2.21 改全局状态默认值
例如：
- 默认选中索引
- 默认 app
- 默认主题
- 默认临时变量

先看：
- `BLEACH-Phone/scripts/state.js`

建议搜索关键词：
- `let`
- `const`
- `selected`
- `pending`
- `current`

---

## 2.22 改 app 的通用外壳样式
例如：
- 通用标题
- 列表行布局
- 通用软键栏
- 通用窗口边距

先看：
- `BLEACH-Phone/styles/core/app-shell.css`

建议搜索关键词：
- `app-window`
- `softkey`
- `setting-row`
- `list`

---

## 2.23 改机身外观
例如：
- 翻盖机外壳
- 转轴
- 按键区
- 外屏外观
- 手机整体阴影与边框

先看：
- `BLEACH-Phone/styles/core/phone-shell.css`
- `BLEACH-Phone/styles/core/phone-screen.css`
- `BLEACH-Phone/bleach.html`

建议搜索关键词：
- `flip-phone`
- `upper-flip`
- `lower-body`
- `speaker`
- `keypad`
- `dpad`

---

## 2.24 改透明背景
例如：
- 不要黑底
- 不要遮罩
- iframe 页面必须透明

先看：
- `BLEACH-Phone/bleach.html`
- `BLEACH-Phone/styles/core/base.css`
- `BLEACH-Phone/style.css`

建议搜索关键词：
- `background: transparent`
- `html`
- `body`
- `overlay`

---

## 3. 改动前的快速判断模板
每次准备修改时，可以先问自己这 4 个问题：

### 1）这是宿主层还是手机页面层？
- 宿主层：`index.js` / `style.css`
- 页面层：`bleach.html` / `scripts/*` / `styles/*`

### 2）这是结构、逻辑还是样式？
- 结构：`bleach.html`
- 逻辑：`scripts/*.js`
- 样式：`styles/*.css`

### 3）这是通用逻辑还是 app 私有逻辑？
- 通用逻辑：`main.js`
- 私有逻辑：`scripts/apps/<app>/index.js`

### 4）这是运行时状态还是持久化数据？
- 状态：`state.js`
- 存储：`storage.js`

---

## 4. 最常用的几个入口
如果你不确定从哪开始，优先按下面顺序看：

### 改宿主行为
1. `BLEACH-Phone/index.js`
2. `BLEACH-Phone/style.css`

### 改某个 app
1. `BLEACH-Phone/scripts/apps/<app>/index.js`
2. `BLEACH-Phone/styles/apps/<app>/index.css`
3. `BLEACH-Phone/scripts/main.js`

### 改整体页面
1. `BLEACH-Phone/bleach.html`
2. `BLEACH-Phone/scripts/main.js`
3. `BLEACH-Phone/styles/core/*`

### 改存储/恢复
1. `BLEACH-Phone/scripts/storage.js`
2. `BLEACH-Phone/scripts/state.js`
3. `BLEACH-Phone/scripts/main.js`

---

## 5. 建议维护方式
当前项目已经拆到一个比较实用的层级，后续建议：

- **优先小改，不要大拆**
- 改动集中在当前需求对应的入口文件
- 每次改完至少刷新验证一次
- 如果改动涉及 `main.js` 的事件分发，尽量立刻测试点击

---

## 6. 一句话版速查

### 改“酒馆外层浮窗”
看：`index.js` / `style.css`

### 改“手机里面的 app 行为”
看：`scripts/apps/*` / `main.js`

### 改“页面骨架和脚本顺序”
看：`bleach.html`

### 改“主题/字号/屏保/设置”
看：`scripts/apps/settings/index.js`

### 改“音乐”
看：`scripts/apps/music/index.js`

### 改“视频/横屏”
看：`scripts/apps/network/index.js`

### 改“联系人/聊天”
看：`scripts/apps/contact/index.js`

### 改“AI 配置/模型/请求”
看：`scripts/apps/ai/index.js`

### 改“本地存储”
看：`storage.js`

### 改“全局状态”
看：`state.js`
