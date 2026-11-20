# 音频响应主题接入设计

目标是给 DSH 聊天正文加一层可随声音变化的背景。播报或音乐持续播放且用户长时间未操作时，可切换到覆盖应用窗口的沉浸视图。在 DSH 设置中调节效果，默认使用简体中文。本文基于本地最新 DSH `dsh-v0.2.2-rc.5`（`2e39e70496`），实现状态见 [README](../README.md)。

## 模板与渲染器

项目沿用官方 `decoration` 模板的 Cordis 配置行、Host 入口、Web 模块工厂及插件详情元数据，并声明对宿主布局与设置插槽的依赖。模板许可见 [DSH-TEMPLATE-LICENSE.txt](DSH-TEMPLATE-LICENSE.txt)。[官方模板](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.4/packages/preset/agent-preset/skills/dsh-doc/templates/decoration)

| 方式 | 适用场景 | 结论 |
| --- | --- | --- |
| npm 精确版本 + lockfile | 使用公开 API，跟随官方发版 | 首选。`4.5.4` 提供 ESM 入口和类型声明。已验证 npm 的 ESM 源文件与 GitHub 同版标签一致，打包输出通过了本地的 DSH 模块工厂模拟检查。 |
| GitHub tag 或 commit | 需要尚未发布的修复或修改渲染器内部实现 | 有明确缺口再采用，锁定 commit 并保留补丁说明和对应源码。 |

通过 `setOptions()` 更新渲染参数，通过 `registerGradient()` 更新自定义渐变。首版本使用 npm 固定版本，主题按 AGPL-3.0-or-later 提供，包内附带插件源码、构建脚本及上游 ESM 源码和许可证。[npm 包与 API](https://www.npmjs.com/package/audiomotion-analyzer) · [上游源码与许可证](https://github.com/hvianna/audioMotion-analyzer/tree/4.5.4)

## 音频来源

| 来源 | 已查实 | 接入方式 |
| --- | --- | --- |
| 小米 MiMo TTS | 浏览器服务 `xiaomiMimoTts.getPcmPlaybackSource()` 返回实际正在输出的流式 PCM 分析节点，等待或停播时返回空值。 | 首版已接入。媒体文件和浏览器 `speechSynthesis` 走不同的播放路径，当前未接入。 |
| DSH 录音／听写 | 官方语音输入将 `requesting`、`recording`、`transcribing`、`feedback` 映射到 `data-voice-activity`，采样节点留在组件内部，没有对外的分析信号。 | 观察当前对话输入区域与识别阶段，随挂载变化清理。`recording` 阶段在用户已授权的输入设备上另开一路共享麦克风采集驱动真实频谱（浏览器允许多个消费者共享同一输入设备，不干扰宿主录音；默认输入设备可在「声源设置 → 麦克风设备」覆盖）；`requesting`、`transcribing`、`feedback` 阶段显示静态状态并重置沉浸计时。可在「声源设置」关闭「语音输入（听写）」。 |
| DSH 内音乐 | `Aliboder/dsh-music-panel@0.37.2` 在页面挂载两路 `audio.mp-audio-host`，切歌时可交叉淡化。 | 从正在播放的音频元素读取分析用媒体流，暂停或换歌时释放旧支路，播放器原本的音频输出保持独立。跨域音轨由浏览器决定是否允许读取。 |
| 浏览器标签页／系统声音 | Web 可由用户在分享选择器中授权 `getDisplayMedia({ video: true, audio: true })`，实际音轨取决于浏览器、平台和被选中的分享范围。 | 单独提供「共享音频」开关，响应用户点击后请求，检查返回音轨，停止或撤回时释放全部轨道。只在本地分析，保留浏览器分享指示。远程 DSH 网页捕获的是打开该网页的设备。 |
| Windows 本机设备声音 | WASAPI loopback 可以读取启动时的默认输出设备，Windows PowerShell 编译并运行随包提供的本机助手。 | 由用户在设置页启动，只接受同源本机请求或 DSH Desktop 的受认证本机转发。断开即停止。远程 Web 端用浏览器共享自己的设备声音。macOS 与 Linux 使用浏览器所支持的共享范围。 |

[TTS 客户端契约](https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts/blob/main/src/client-api.ts) · [DSH 录音组件](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.4/packages/experimental/client-ui-voice-input/src/client/VoiceInput.tsx) · [音乐面板源码](https://github.com/Aliboder/dsh-music-panel) · [浏览器共享 API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) · [WASAPI 官方文档](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)

有声音时，听写录音和手动设备采集优先，其次是 TTS、音乐面板和可选的麦克风可视化；只显示一个来源，避免同一条音乐通过播放器和系统混音被重复计算。听写与设备采集只分析本地信号，录音阶段沉浸计时重置。没有 PCM 音轨的静音间隔不会持续触发沉浸。

## 聊天背景与空闲显示

- 普通模式的 Canvas 放在聊天正文的内容容器内，位于文字层下方。基线有 `[data-conversation-content]` 和 `[data-conversation-scroll]`，未找到公开的正文背景插槽。首版可从已注册组件使用 portal 挂入独立背景节点，限定到当前可见会话并在卸载时清理。增加宿主背景插槽后优先改用插槽。Canvas 忽略指针与辅助技术，验证滚动、复制文字、输入框、弹窗及浅深两色对比。
- 背景与沉浸视图都按窗口的水平、垂直中心定位频谱。沉浸视图使用 `shell.overlay` 和应用内对话框覆盖窗口，底色取宿主页面背景色（`--dsw-alias-bg-base`），以「背景透明度」和「背景模糊」控制可见度与模糊；支持上传自定义背景图，并可设置背景图铺放（铺满裁切、完整显示、拉伸、原始大小居中、平铺）和背景图缩放。持续播放后按无操作计时进入，鼠标、键盘、触摸、滚轮、Esc、停播、撤回共享或录音会触发退出；窗口失去焦点时默认保持沉浸（「离开DSH保持沉浸」默认开启，关闭后切到其他软件即淡出），但窗口最小化或页面隐藏仍会退出；因为任意输入都会自动退出，不提供额外的退出按钮。淡入淡出可以调整。
- 默认限制 Canvas 帧率。隐藏、切换源及卸载时释放主题自己的绘制和音频连接。系统开启减少动态效果时提供静态状态。

[会话内容容器](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.4/packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx) · [应用遮罩插槽](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.4/packages/client/ui-layout/src/client/AppFrame.tsx)

## 中文设置

通过 `settings.section` 注册「音频响应」。统一字段表用简体中文标注参数、枚举和单位，并复用同一份定义给浏览器本地配置做校验。设置支持边播放边预览和恢复默认。设置页顶部为吸顶的效果预览，右下角提供「按住透视」（按住时隐藏宿主设置面板，显示对话区的实时效果）和「恢复默认」；下方使用宿主 `SegmentedTabs` 同款分段标签切换五组：显示效果、声源设置、频谱声道、外观色彩、高级设置。「显示效果」提供 17 个命名预设（首次安装默认选中「默认柔光」；另有极简曲线、圆环脉冲、镜像声波、双声道对置、霓虹棱镜、复古 LED、彩虹律动、低频聚焦、静谧曲线、声场反射、深海幻境、星环闪耀、极光流线、像素方块、城市脉冲、暗夜荧光），选择后先重置预设涉及的参数再写入该预设，因此不会继承上一个预设的残留；之后再手动微调会自动回到「自定义」。调好的效果可「保存当前…」写入独立的本地「我的预设」，并从效果预设下拉中复用；「导出」「导入」使用简单 JSON 文件（`type: dsh-audio-reactive/presets`，`version: 1`，按名称合并、同名覆盖），预设数据与插件设置分开保存，恢复默认不会删除已保存的预设。按钮、开关、胶囊式弹出选项与输入控件按宿主 `ui-primitives` 的标记和 `--dsw-*` 令牌在本包内复刻，不直接依赖宿主 Client 包。空闲秒数、离开DSH是否保持沉浸、能见度、沉浸背景透明度、模糊、自定义图片、背景图铺放与缩放是插件自己的选项；「声源设置」提供流式朗读、音乐面板、语音输入（听写）、麦克风四路开关，以及本机/共享设备采集。

| 分组 | 参数 |
| --- | --- |
| 频段与响应 | 显示模式、声道布局、频标与加权、最小与最大频率、分贝范围、FFT 点数、平滑、线性振幅、线性增益 |
| 颜色与外观 | 渐变与左右声道渐变、自定义色标、着色方式、渐变分割、背景颜色与透明度、填充透明度、条距、线宽、描边、圆角、透明条、亮度条、LED 条 |
| 方向与频谱辅助 | 镜像、径向与反转、半径、旋转速度、反射比例／亮度／透明度、适配反射、刻度、音符标签、ANSI 频段 |
| 峰值与性能 | 显示峰值、峰值线、峰值淡出／保持、重力、帧率上限、帧率显示、低分辨率 |

依据 `4.5.4` 的 `Options` 建立逐项映射，新增版本对照类型定义复查。声道连接、输出音量、Canvas 尺寸、渲染启动、回调和播放源由插件控制。过时的 `stereo` 归并到声道布局。频段、分贝上下界与数值范围共同校验，特定模式下无效的选项在界面说明。调参时即时预览，持久化配置中只存可序列化且通过校验的数据。[audioMotion 参数文档](https://www.npmjs.com/package/audiomotion-analyzer)

## 实施顺序

1. 在宿主验证流式朗读、录音阶段和空闲遮罩。检查深浅色主题、切换会话、文本选择、设置弹窗和插件重载。
2. 为可解析的媒体文件路径补充信号，包括部分普通播报、试听和历史文件。
3. 核实目标音乐插件和播放所有者，验证暂停、切歌与面板关闭时源的交接，再加显式的浏览器共享。Desktop 原生系统音频采集另行验证。
