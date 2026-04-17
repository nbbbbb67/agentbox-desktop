# AgentBox Windows 构建指南

本文档说明如何将 AgentBox（含微信插件）构建为 Windows .exe 安装包。

## 方式一：通过 GitHub Actions 自动构建（推荐，最稳定）

### 第一步：创建 GitHub 仓库

1. 打开 https://github.com 并登录（如果没有账号先注册）
2. 点击右上角 **+** → **New repository**
3. 填写：
   - **Repository name**: `agentbox-desktop`（或其他名字）
   - **Private** 或 **Public**：都可以
   - **不要**勾选任何初始化选项（不要加 README）
4. 点击 **Create repository**

### 第二步：将代码推送至你的 GitHub 仓库

在 WSL2/Linux 终端执行（将 `YOUR_USERNAME` 和 `REPO_NAME` 替换为你的实际值）：

```bash
cd /home/zsh/openclaw-wechat-desktop

# 添加你的 GitHub 仓库为远程仓库
git remote set-url origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# 推送代码（可能需要输入 GitHub 用户名和 Personal Access Token）
git branch -M main
git push -u origin main
```

> **提示**：如果 `git push` 要求输入密码，需要创建一个 Personal Access Token：<br>
> GitHub → 右上角头像 → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token<br>
> 权限勾选 `repo` 即可。Token 即当密码使用。

### 第三步：创建版本标签并触发构建

```bash
cd /home/zsh/openclaw-wechat-desktop
git tag -a v0.6.6+agentbox.1 -m "AgentBox 0.6.6 with WeChat channel support"
git push origin v0.6.6+agentbox.1
```

**或者**用 GitHub 网页手动触发（不需要 tag）：

1. 打开你的仓库页面
2. 点击 **Actions** 标签
3. 点击左侧 **Release** 工作流
4. 点击右侧 **Run workflow**
5. 填入 `tag`（例如 `v0.6.6+agentbox.1`，必须与 package.json 的 `version` 一致）
6. 点击 **Run workflow**

### 第四步：等待构建完成

- **Actions** 页面会显示构建进度（约 10-15 分钟）
- 构建分几步：
  1. ✅ Verify — 代码检查
  2. 🔨 Package Windows Installer — 在真实 Windows 环境打包（约 10 分钟）
  3. 📦 Publish GitHub Release — 自动发布

### 第五步：下载 .exe

1. 进入 **Releases** 页面（或点击 Actions 里构建完成的 run）
2. 下载 `AgentBox-Setup-*.exe` 文件
3. 双击安装，运行在 Windows 桌面

---

## 方式二：本地 Windows 构建（需要 Windows 电脑）

如果你有 Windows 电脑（Windows 10/11），可以本地构建：

### 在 Windows 上配置构建环境

1. 安装 **Git**：https://git-scm.com
2. 安装 **Node.js 22.x**：https://nodejs.org（选 LTS 版）
3. 安装 **pnpm**：
   ```powershell
   npm install -g pnpm
   ```
4. 克隆仓库：
   ```powershell
   git clone https://github.com/YOUR_USERNAME/REPO_NAME.git
   cd REPO_NAME
   ```
5. 安装依赖：
   ```powershell
   pnpm install --frozen-lockfile
   ```
6. 下载 OpenClaw 和 Node.js 运行时：
   ```powershell
   pnpm run download-node
   pnpm run download-openclaw
   ```
7. 打包 Windows 安装包：
   ```powershell
   pnpm run package:win
   ```
8. 生成的 .exe 在 `dist/` 目录

---

## 构建产物

| 文件 | 说明 |
|------|------|
| `AgentBox-Setup-x.x.x.exe` | Windows 一键安装包 |
| `bundle-manifest.json` | 包含的 OpenClaw 版本信息 |

## 常见问题

**Q: 构建失败，显示签名错误**
> 忽略即可，未签名包一样可以正常运行（只是 Windows 会有个"安全提示"，点"仍要运行"即可）

**Q: Actions 显示失败**
> 点击失败的 job 查看日志，把错误信息发给我帮你分析

**Q: 微信二维码不显示**
> 确保 OpenClaw 的 `openclaw-weixin` 插件已正确配置，微信公众平台需要完成认证

---

## 技术说明

- **构建工具**：Electron + electron-builder
- **运行时**：Node.js 22.x（打包进安装包，用户无需单独安装）
- **OpenClaw 版本**：2026.4.2
- **产品名称**：AgentBox
- **包名**：agentbox-desktop
