# BLEACH-Phone 插件结构说明

## 1. 插件定位
`BLEACH-Phone` 是一个 **SillyTavern UI 扩展**。

它的工作分成两层：

1. **宿主层**：由 SillyTavern 扩展加载，负责菜单注册、浮动窗口、拖拽缩放、移动端居中、iframe 交互桥接。
2. **手机页面层**：实际手机 UI 运行在 `bleach.html` 中，负责手机外观、各应用界面、应用状态与本地存储。

---

## 2. 当前目录结构

```text
BLEACH-Phone/
├── manifest.json
├── index.js
├── style.css
├── bleach.html
├── README-结构说明.md
├── scripts/
│   ├── state.js
│   ├── storage.js
│   ├── main.js
│   └── apps/
│       ├── ai/
│       │   └── index.js
│       ├── contact/
│       │   └── index.js
│       ├── music/
│       │   └── index.js
│       ├── network/
│       │   └── index.js
│       ├── news/
│       │   └── index.js
│       └── settings/
│           └── index.js
└── styles/
    ├── core/
    │   ├── base.css
    │   ├── themes.css
    │   ├── phone-shell.css
    │   ├── phone-screen.css
    │   └── app-shell.css
    └── apps/
        ├── ai/
        │   └── index.css
        ├── contact/
        │   └── index.css
        ├── music/
        │   └── index.css
        ├── network/
        │   └── index.css
        ├── news/
        │   └── index.css
        ├── screensaver/
        │   └── index.css
        └── settings/
            └── index.css
```

---

## 3. 入口文件说明

### 3.1 `manifest.json`
SillyTavern 扩展清单。

主要作用：
- 声明扩展显示名称
- 指定宿主层入口 JS / CSS

当前关键字段：
- `display_name`: `BLEACH-Phone`
- `js`: `index.js`
- `css`: `style.css`

---

### 3.2 `index.js`
**宿主层主入口**。

负责：
- 注册 `BLEACH-Phone` 菜单项
- 创建浮动宿主容器
- 加载 `bleach.html` 到 iframe
- 保存宿主层位置 / 缩放
- 处理桌面端右键拖拽
- 处理 `Ctrl/Meta + 滚轮` 缩放
- 处理移动端双指缩放 / 双指移动
- 控制“紧凑交互区域”和“动画扩展区域”切换

### 适合修改它的情况
如果你要改下面这些，优先看 `index.js`：
- 菜单注册
- 手机浮层位置
- 打开时居中策略
- 宿主缩放范围
- 拖动 / 缩放方式
- iframe 点击区域裁切逻辑

---

### 3.3 `style.css`
**宿主层样式**。

负责：
- 浮动容器定位
- 宿主画布大小
- iframe 可点击策略
- 与酒馆页面的层级关系

### 适合修改它的情况
如果你要改下面这些，优先看 `style.css`：
- 宿主浮层是否挡点击
- 宿主画布大小
- pointer-events / clip-path 行为
- z-index

---

### 3.4 `bleach.html`
**手机页面入口壳文件**。

当前职责：
- 提供手机 DOM 骨架
- 引入模块化 CSS
- 按顺序加载脚本

它现在不是大一统逻辑文件了，而是一个“页面壳”。

当前脚本加载顺序：

```html
<script src="./scripts/state.js"></script>
<script src="./scripts/storage.js"></script>
<script src="./scripts/apps/network/index.js"></script>
<script src="./scripts/apps/music/index.js"></script>
<script src="./scripts/apps/news/index.js"></script>
<script src="./scripts/apps/ai/index.js"></script>
<script src="./scripts/apps/settings/index.js"></script>
<script src="./scripts/apps/contact/index.js"></script>
<script src="./scripts/main.js"></script>
```

### 顺序原则
- 先有 **状态**
- 再有 **存储/规范化函数**
- 再有 **应用函数**
- 最后由 `main.js` 做总调度和事件绑定

---

## 4. 脚本层结构

## 4.1 `scripts/state.js`
**全局状态与基础配置**。

主要放：
- 当前主题
- 当前 app
- menu / records / news / settings / contact 各种选中索引
- 音乐 / 视频 / AI / 屏保的运行状态
- 主题顺序、设置项顺序等常量

### 原则
- 这里只放“状态”和少量基础常量
- 不放复杂业务流程

---

## 4.2 `scripts/storage.js`
**本地存储与数据规范化**。

主要放：
- `storageKeys`
- `localStorage` 读写
- 各类 normalize / clamp 函数
- AI、屏保、音乐、视频、联系人、聊天记录的持久化

### 当前存储分两类
#### A. 宿主层存储
由 `index.js` 通过 SillyTavern 扩展设置保存：
- `bleach_phone.left`
- `bleach_phone.top`
- `bleach_phone.scale`

#### B. 手机页面本地存储
由 `storage.js` 通过 `localStorage` 保存，例如：
- `bleach.theme`
- `bleach.fontSize`
- `bleach.screenSaverWallpapers`
- `bleach.networkVideoEntries`
- `bleach.musicEntries`
- `bleach.aiSettings`
- `bleach.aiContacts`
- `bleach.aiChatHistory`

---

## 4.3 `scripts/apps/`
按应用拆分的脚本目录。

### `apps/network/index.js`
负责视频 / 网络播放相关逻辑：
- 视频条目增删改
- 视频列表/编辑/播放器渲染
- 横屏进入/退出
- 网络播放器布局

### `apps/music/index.js`
负责音乐相关逻辑：
- 音乐条目增删改
- 音乐播放器 UI
- 播放/暂停/上一首/下一首
- 进度条拖动
- 封面与唱片状态

### `apps/news/index.js`
负责新闻相关逻辑：
- 新闻列表
- 新闻详情
- 新闻滚动

### `apps/ai/index.js`
负责 AI 相关逻辑：
- ST 主聊天读取
- AI 配置、模型获取
- 主聊天预览与规则处理
- AI 回复请求
- 与 contact 对话所需的 AI 调用函数

### `apps/settings/index.js`
负责设置相关逻辑：
- 主题切换
- 字号切换
- 屏保管理
- 设置页渲染
- 设置页选择移动

### `apps/contact/index.js`
负责联系人和对话相关逻辑：
- 联系人增删改
- 聊天历史
- 聊天发送
- 联系人列表 / 编辑 / 聊天页渲染

---

## 4.4 `scripts/main.js`
**当前仍然是总控层**。

它现在主要负责：
- 手机基础 UI 控制
- 菜单网格切换
- 应用窗口总调度
- 统一点击/按键/方向键/侧键事件分发
- 打开/关闭 app
- 页面初始化
- 各模块之间的串联调用

### 注意
`main.js` 现在仍然是全局控制中心。
所以如果出现：
- 点击无效
- 某 app 明明函数存在但不工作
- 打开 app 后界面没刷新

优先检查：
- `bleach.html` 中脚本加载顺序
- `main.js` 里的统一事件分发
- 对应 app 模块是否已成功加载

---

## 5. 样式层结构

## 5.1 `styles/core/`
放共享基础样式。

### `base.css`
- 字体
- `html/body` 基础布局
- 页面基础环境

### `themes.css`
- 主题变量
- 黑色主题 / 白色主题

### `phone-shell.css`
- 机身外壳
- 上盖 / 下盖 / 转轴 / 外屏等

### `phone-screen.css`
- 屏幕区
- 状态栏
- keypad / dpad
- 屏幕层动画相关基础样式

### `app-shell.css`
- app-window 通用壳
- 公共列表、标题、底部软键等样式

---

## 5.2 `styles/apps/`
按应用分样式。

- `news/index.css`
- `network/index.css`
- `music/index.css`
- `contact/index.css`
- `settings/index.css`
- `ai/index.css`
- `screensaver/index.css`

### 原则
- app 私有样式尽量只放到自己的目录
- 通用容器/列表/壳层样式放在 `core/app-shell.css`

---

## 6. 运行流程

## 6.1 启动流程
1. SillyTavern 加载扩展 `manifest.json`
2. 执行宿主层 `index.js`
3. `index.js` 注册菜单并创建 iframe 宿主
4. 宿主加载 `bleach.html`
5. `bleach.html` 按顺序加载状态、存储、各 app、主控脚本
6. `main.js` 初始化当前主题、字号、存储内容和事件绑定

---

## 6.2 交互分层
### 宿主层
负责：
- 整个手机浮层的位置、缩放、拖拽
- iframe 的交互区域控制

### 手机页面层
负责：
- 手机 app 内部按钮点击
- app 切换
- AI / 音乐 / 视频 / 新闻 / 联系人等业务

---

## 7. 维护建议

## 7.1 改动前优先判断改哪一层
### 改菜单、浮层、拖拽、缩放
看：
- `index.js`
- `style.css`

### 改手机页面结构或 app 行为
看：
- `bleach.html`
- `scripts/apps/*`
- `scripts/main.js`

### 改页面视觉
看：
- `styles/core/*`
- `styles/apps/*`

---

## 7.2 当前不建议再激进拆分
当前应用层已经基本拆开，继续拆分主要会进入：
- `main.js` 主控层
- 输入事件分发层
- `renderAppWindow()` 的总调度

这些部分耦合较高，继续拆分的风险会明显高于收益。

### 当前建议
以“稳定优先”为主：
- 先保证功能完整可用
- 再做小幅清理
- 非必要不继续大拆

---

## 7.3 新增功能时的建议
### 新增一个新 app
建议同时新增两处：
1. `scripts/apps/<app>/index.js`
2. `styles/apps/<app>/index.css`

并在：
- `bleach.html` 中加入对应 CSS / JS 引用
- `main.js` 的 app 总调度里接入
- 菜单 DOM 中加入入口

---

## 8. 常见排查路径

## 8.1 点击没反应
先查：
1. `bleach.html` 脚本加载顺序
2. `main.js` 是否语法正常
3. 对应 app 的脚本是否语法正常
4. 事件是否在 `main.js` 中被正确分发

## 8.2 某 app 界面不显示
先查：
1. `renderAppWindow()` 是否有该 app 分支
2. 对应 `renderXxxContent()` 是否存在
3. 对应样式文件是否已被 `bleach.html` 引入

## 8.3 宿主层挡点击
先查：
1. `BLEACH-Phone/style.css`
2. `BLEACH-Phone/index.js` 中的 `clip-path` / `pointer-events`
3. 是否处于动画扩展交互区状态

## 8.4 横屏动画异常
先查：
1. `scripts/apps/network/index.js`
2. `styles/apps/network/index.css`
3. `styles/core/phone-shell.css`
4. 宿主层大画布与交互区域逻辑

---

## 9. 当前状态总结
当前插件已经处于“可维护的模块化状态”：

- **宿主层** 已独立
- **页面壳** 已独立
- **状态与存储** 已独立
- **主要 app** 已按目录拆分
- **样式** 已按 core/apps 分层

这已经足够支持后续维护与小范围迭代。

如果后续没有明确需求，**可以先不继续拆分**。
