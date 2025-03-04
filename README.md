# Hexo Theme Stellar Showcase

这是一个基于 GitHub 的自动化工具，用于管理和展示使用 Stellar 主题的 Hexo 网站。该工具可以自动检测网站是否正在使用 Stellar 主题，并通过 GitHub Issues 来管理和展示这些网站。

## 快速开始

1. Fork 本仓库到你的 GitHub 账号下
2. 修改 `config.yml` 文件中的配置信息
3. 在你的仓库中创建一个新的 Issue 来提交网站信息

## 功能特点

- 自动解析包含网站信息的 GitHub Issues
- 定期检查网站的可访问性和主题使用状态
- 自动更新 Issue 标签以反映网站状态

## 配置说明
### Issue 解析器配置

```yaml
issue_parser:
  enabled: true
  repo: owner/repo-name  # 修改为你的仓库地址（格式：用户名/仓库名）
  sort: updated-desc     # 排序方式（按最近更新）
  exclude: ["审核中", "非Stellar站点", "无法访问"]  # 黑名单标签，包含这些标签的 issue 将被过滤
```

### 网站检查器配置

```yaml
site_checker:
  enabled: true
  timeout: 10000    # 请求超时时间（毫秒）
  retry_times: 3    # 重试次数
```

## 工作流程

1. **Issue 解析**
   - 通过 GitHub Actions 定期运行
   - 解析带有指定标签的 Issues
   - 从 Issue 内容中提取网站信息
   - 生成 `v2/data.json` 数据文件

2. **网站检查**
   - 定期检查所有已收录网站
   - 验证网站是否使用 Stellar 主题
   - 检测主题版本信息
   - 更新 Issue 标签以反映检查结果

## 标签说明

- `审核中`: 网站正在审核中
- `x.x.x`: 网站正在使用的 Stellar 主题版本号
- `非Stellar站点`: 网站未使用 Stellar 主题
- `无法访问`: 网站无法访问

## 许可证

[MIT License](LICENSE)