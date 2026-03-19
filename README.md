# 智能量体系统

微信小程序 + 后台管理系统的量体数据管理解决方案。

---

## 系统架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   微信小程序    │────▶│   微信云托管    │────▶│    云数据库     │
│ (miniprogram-v2)│     │   (Koa API)    │     │  (CloudBase)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  后台管理系统    │
                        │   (admin)       │
                        └─────────────────┘
```

---

## 功能特点

### 小程序端
- ✅ 项目选择
- ✅ 量体数据录入（身高、体重、头围、胸围、腰围等）
- ✅ 服装选择
- ✅ 收件信息登记
- ✅ 数据查询

### 后台管理系统
- ✅ 项目管理
- ✅ 人员数据管理（增删改查）
- ✅ Excel导入/导出
- ✅ 数据分析统计
- ✅ 服装品类管理
- ✅ 用户登录日志

---

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端小程序 | 微信小程序云开发 |
| 后端 | Node.js + Express + MySQL |
| 数据库 | 腾讯云MySQL |
| 部署 | Docker + 腾讯云托管 |

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```env
# 腾讯云配置
TENCENTCLOUD_ENV=prod-2g2msnzi7f0f35d7

# MySQL数据库
MYSQL_HOST=your_mysql_host
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=smart_measure

# 服务端口
PORT=80
```

### 3. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 4. Docker部署

```bash
docker-compose up -d
```

---

## 目录结构

```
F:\V5.5+隐藏AI已完结\
├── app.js                    # Express后端入口
├── app.js.bak.004           # 备份文件
├── package.json             # 项目依赖
├── .env                     # 环境变量（敏感）
├── .env.example             # 环境变量模板
├── .gitignore               # Git忽略配置
├── Dockerfile               # Docker镜像配置
├── cloudbase.yaml          # 腾讯云托管配置
│
├── admin/                   # 管理后台
│   ├── index.html          # 单页应用入口
│   └── index.html.bak.003  # 备份文件
│
├── miniprogram-v2/         # 微信小程序
│   ├── app.js              # 小程序入口
│   ├── app.json            # 小程序配置
│   ├── project.config.json # 项目配置（已优化）
│   ├── pages/              # 页面
│   │   ├── index/         # 首页（项目列表）
│   │   ├── measure/       # 量体数据录入
│   │   └── clothing/      # 服装选择
│   ├── utils/             # 工具函数
│   │   └── api.js        # API封装
│   └── cloudfunctions/    # 云函数
│       └── measure-api/  # 量体数据接口
│
├── uploads/                # 上传文件目录
├── public/                 # 静态资源
│   └── qrcodes/          # 二维码图片
│
├── server/                 # 服务端模块（新增）
│   └── utils/
│       └── logger.js     # 日志工具
│
├── PROJECT_STRUCTURE.md   # 项目结构说明
├── CODING_STANDARDS.md    # 代码规范文档
└── README.md             # 项目说明文档
```

---

## API 列表

### 项目管理

| 路径 | 方法 | 说明 |
|------|------|------|
| `GET /api/project/list` | GET | 获取项目列表 |
| `GET /api/project/:id` | GET | 获取项目详情 |
| `POST /api/project/create` | POST | 创建项目 |
| `DELETE /api/project/:id` | DELETE | 删除项目 |
| `GET /api/project/:id/deadline` | GET | 获取项目截止状态 |
| `POST /api/project/:id/import` | POST | Excel导入 |
| `POST /api/project/:id/import/replace` | POST | Excel替换导入 |
| `GET /api/project/:id/export` | GET | Excel导出 |

### 量体数据

| 路径 | 方法 | 说明 |
|------|------|------|
| `GET /api/measure/:id` | GET | 获取量体详情 |
| `PUT /api/measure/:id` | PUT | 更新量体数据 |
| `DELETE /api/measure/:id` | DELETE | 删除量体数据 |
| `GET /api/measure/:id/history` | GET | 获取修改历史 |
| `GET /api/measure/project/:id/all` | GET | 获取项目下所有数据 |
| `GET /api/measure/project/:id/exact` | GET | 精确查询 |
| `GET /api/measure/project/:id/search` | GET | 模糊搜索 |
| `POST /api/measure/create` | POST | 创建量体记录 |

### 服装管理

| 路径 | 方法 | 说明 |
|------|------|------|
| `GET /api/clothing/list` | GET | 获取服装列表 |
| `POST /api/clothing` | POST | 添加服装 |
| `DELETE /api/clothing/:id` | DELETE | 删除服装 |
| `GET /api/clothing/sizes/:name` | GET | 获取尺码详情 |
| `POST /api/clothing/sizes` | POST | 保存尺码 |

### 系统

| 路径 | 方法 | 说明 |
|------|------|------|
| `GET /health` | GET | 健康检查 |
| `GET /api/settings` | GET | 获取系统设置 |
| `POST /api/settings` | POST | 保存系统设置 |
| `POST /api/admin/login` | POST | 管理员登录 |

---

## 安全配置

### ⚠️ 重要：首次部署必做

1. **修改管理后台密码**
   - 默认用户名: `admin`
   - 默认密码: `Admin@123456`
   - 首次登录后请立即修改！

2. **配置CORS白名单**
   - 编辑 `miniprogram-v2/cloudfunctions/measure-api/index.js`
   - 修改 `ALLOWED_ORIGINS` 数组中的域名

3. **配置MySQL密码**
   - 编辑 `.env` 文件设置强密码

---

## 代码规范

项目遵循以下规范：

- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - 代码注释规范
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) - 项目结构说明

---

## 更新日志

### v6.0 (2026-03-19)
- ✅ 小程序编译配置优化（ES6、增强编译、SWC）
- ✅ 云函数安全增强（CORS、参数校验、频率限制）
- ✅ 管理后台密码安全（SHA-256哈希、强密码要求）
- ✅ API响应格式统一
- ✅ 小程序代码规范化
- ✅ 云函数字段名映射修复
- ✅ 添加日志工具
- ✅ 添加环境变量管理
- ✅ 添加代码注释规范文档

---

## 配置说明

### 小程序配置

```javascript
// 云环境ID
cloudEnv: 'prod-2g2msnzi7f0f35d7'

// API地址
apiBaseUrl: 'https://koa-l3a0-229656-4-1408215646.sh.run.tcloudbase.com'
```

### 云托管配置

| 项目 | 值 |
|------|------|
| 环境ID | `prod-2g2msnzi7f0f35d7` |
| 服务名 | `koa-l3a0` |

---

## 许可证

MIT License

---

最后更新: 2026-03-19
