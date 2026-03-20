require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const mysql = require('mysql2/promise');

// ========== 统一响应格式 (v2) ==========
/**
 * 统一API响应格式
 * 所有接口返回格式: { code: 0/错误码, message: '消息', data: 数据 }
 */
class ApiResponse {
  // 成功响应
  static success(data = null, message = '操作成功') {
    return { code: 0, message, data, timestamp: new Date().toISOString() };
  }
  
  // 错误响应
  static error(message = '操作失败', code = -1, data = null) {
    return { code, message, data, timestamp: new Date().toISOString() };
  }
  
  // 分页响应
  static page(data = [], total = 0, page = 1, pageSize = 20, message = '获取成功') {
    return {
      code: 0,
      message,
      data: { list: data, total, page: parseInt(page), pageSize: parseInt(pageSize), pages: Math.ceil(total / pageSize) },
      timestamp: new Date().toISOString()
    };
  }
}

// ========== 日志工具 ==========
/**
 * 统一日志工具
 * 使用方法: logger.info/warn/error/debug('消息', ...参数)
 */
const logger = {
  info: (...args) => console.log('[INFO]', new Date().toISOString(), ...args),
  warn: (...args) => console.warn('[WARN]', new Date().toISOString(), ...args),
  error: (...args) => console.error('[ERROR]', new Date().toISOString(), ...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
  }
};

// MySQL数据库配置 - 从环境变量读取
const dbConfig = {
  host: process.env.MYSQL_HOST || '10.12.107.158',
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'smart_measure'
};

logger.info('[MySQL] 配置', { host: dbConfig.host, port: dbConfig.port, database: dbConfig.database });

let pool = null;
// 微信云托管模式
let useMySQL = true;

// 强制内存模式（本地测试）
const FORCE_MEMORY_MODE = process.env.FORCE_MEMORY_MODE === 'true';

if (FORCE_MEMORY_MODE) {
  logger.info('[模式] 本地测试模式 - 强制使用内存模式');
}

// 初始化数据库
logger.info('[模式] ' + (FORCE_MEMORY_MODE ? '本地测试模式' : '微信云托管模式'));

async function initDatabase() {
  // 如果强制使用内存模式，跳过数据库连接
  if (FORCE_MEMORY_MODE) {
    logger.warn('[MySQL] ⚠️ 强制使用内存模式，跳过数据库连接');
    logger.warn('[MySQL] ⚠️  注意: 数据不会持久化保存！');
    useMySQL = false;
    return;
  }
  
  try {
    pool = mysql.createPool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    
    // 测试连接
    const connection = await pool.getConnection();
    logger.info('[MySQL] 连接成功');
    
    // 创建数据库
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    await connection.query(`USE \`${dbConfig.database}\``);
    
    // 创建表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        qrcode_url VARCHAR(500),
        status VARCHAR(50) DEFAULT 'active',
        excel_filename VARCHAR(255),
        deadline DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS measure_data (
        id VARCHAR(36) PRIMARY KEY,
        project_id VARCHAR(36),
        supply_no VARCHAR(100),
        search_no VARCHAR(100),
        name VARCHAR(100),
        gender VARCHAR(10),
        height DECIMAL(5,1),
        weight DECIMAL(5,1),
        head_tail DECIMAL(5,1),
        neck_circumference DECIMAL(5,1),
        shoulder_width DECIMAL(5,1),
        chest_circumference DECIMAL(5,1),
        waist_circumference DECIMAL(5,1),
        sleeve_length DECIMAL(5,1),
        hip_circumference DECIMAL(5,1),
        pants_length DECIMAL(5,1),
        shoe_size DECIMAL(5,1),
        remark TEXT,
        user_id VARCHAR(100),
        status VARCHAR(50) DEFAULT 'pending',
        receiver VARCHAR(100),
        phone VARCHAR(50),
        address TEXT,
        clothing_rows TEXT,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS measure_history (
        id VARCHAR(36) PRIMARY KEY,
        measure_id VARCHAR(36),
        old_data TEXT,
        new_data TEXT,
        user_id VARCHAR(100),
        action VARCHAR(50),
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS clothing (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        sizes TEXT,
        category VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 创建服装尺码详情表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS clothing_sizes (
        id VARCHAR(36) PRIMARY KEY,
        clothing_name VARCHAR(100) NOT NULL,
        size VARCHAR(50),
        gender VARCHAR(10),
        height_range VARCHAR(50),
        chest_range VARCHAR(50),
        waist_range VARCHAR(50),
        hip_range VARCHAR(50),
        head_range VARCHAR(50),
        shoe_size VARCHAR(20),
        remark VARCHAR(200),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_clothing_name (clothing_name)
      )
    `);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(36) PRIMARY KEY,
        system_name VARCHAR(100) DEFAULT '智能量体系统',
        admin_username VARCHAR(50) DEFAULT 'admin',
        admin_password VARCHAR(255) DEFAULT 'Admin@123456',  -- 请首次登录后修改此密码！
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // 创建登录日志表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS login_logs (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(50),
        ip VARCHAR(50),
        user_agent VARCHAR(500),
        success TINYINT(1) DEFAULT 0,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_create_time (create_time)
      )
    `);
    
    // 创建导出日志表
    await connection.query(`
      CREATE TABLE IF NOT EXISTS export_logs (
        id VARCHAR(36) PRIMARY KEY,
        operator VARCHAR(50),
        ip VARCHAR(50),
        export_type VARCHAR(50),
        record_count INT DEFAULT 0,
        export_data TEXT,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_create_time (create_time)
      )
    `);
    
    // 初始化设置
    const [settings] = await connection.query('SELECT * FROM settings LIMIT 1');
    if (settings.length === 0) {
      await connection.query('INSERT INTO settings (id, system_name, admin_username, admin_password) VALUES (?, ?, ?, ?)', 
        [uuidv4(), '智能量体系统', 'admin', 'Admin@123456']);
    }
    // 密码只存数据库，不加载到内存
    
    connection.release();
    useMySQL = true;
    logger.info('[MySQL] 数据库初始化成功');
  } catch (e) {
    logger.warn('[MySQL] 初始化失败:', e.message);
    useMySQL = false;
  }
}

// 数据初始化（必须在 initDatabase 之前）
let data = {
  projects: [],
  users: [],
  measureData: [],
  measureHistory: [],
  clothing: [],
  settings: {
    systemName: '智能量体系统'
    // 密码只存数据库，不存内存
  }
};

// 快速初始化（同步版本，用于不支持async的场景）
initDatabase();

// 服装数据操作（MySQL）
async function getClothingList() {
  if (!pool) return [];
  const [rows] = await pool.query('SELECT * FROM clothing ORDER BY created_at');
  // 按名称去重，只保留每个名称的第一条记录
  const uniqueMap = new Map();
  rows.forEach(r => {
    if (!uniqueMap.has(r.name)) {
      uniqueMap.set(r.name, r);
    }
  });
  // 解析sizes字段
  return Array.from(uniqueMap.values()).map(r => ({
    ...r,
    sizes: r.sizes ? JSON.parse(r.sizes) : []
  }));
}

async function addClothing(clothing) {
  if (!pool) return clothing;
  await pool.query('INSERT INTO clothing SET ?', clothing);
  return clothing;
}

async function deleteClothing(id) {
  if (!pool) return;
  await pool.query('DELETE FROM clothing WHERE id = ?', [id]);
}

// 数据集合名称
const SYSTEM_DATA_COLLECTION = 'system_data';

const security = {
  // 登录尝试记录 { ip: { attempts: [], lockedUntil: null } }
  loginAttempts: new Map(),
  // 配置
  maxAttempts: 5,        // 最多失败次数
  lockoutDuration: 15 * 60 * 1000, // 锁定15分钟
  windowDuration: 15 * 60 * 1000,  // 15分钟内的尝试
  cleanupInterval: 60 * 60 * 1000   // 1小时清理一次
};

// 清理过期的登录尝试记录
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of security.loginAttempts.entries()) {
    // 清理超过窗口期的记录
    record.attempts = record.attempts.filter(time => now - time < security.windowDuration);
    // 清理过期的锁定
    if (record.lockedUntil && now > record.lockedUntil) {
      record.lockedUntil = null;
      record.attempts = [];
    }
    // 删除空记录
    if (record.attempts.length === 0 && !record.lockedUntil) {
      security.loginAttempts.delete(ip);
    }
  }
}, security.cleanupInterval);

// 检查IP是否被锁定
function isIPLocked(ip) {
  const record = security.loginAttempts.get(ip);
  if (!record) return false;
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return true;
  }
  return false;
}

// 记录登录失败
function recordFailedAttempt(ip) {
  let record = security.loginAttempts.get(ip);
  if (!record) {
    record = { attempts: [], lockedUntil: null };
    security.loginAttempts.set(ip, record);
  }
  
  const now = Date.now();
  // 清理过期记录
  record.attempts = record.attempts.filter(time => now - time < security.windowDuration);
  // 添加新记录
  record.attempts.push(now);
  
  // 检查是否需要锁定
  if (record.attempts.length >= security.maxAttempts) {
    record.lockedUntil = now + security.lockoutDuration;
    logger.info(`[安全] IP ${ip} 已被锁定15分钟`);
  }
}

// 清除登录记录（登录成功时）
function clearLoginAttempts(ip) {
  security.loginAttempts.delete(ip);
}

// 初始化MySQL数据库
initDatabase();

const app = express();
// 服务端口 - 云托管使用80端口
const PORT = process.env.PORT || 80;

// 保存数据（MySQL模式下由各API直接保存，此函数保留兼容）
function saveData() {
  // MySQL模式下数据已直接保存，无需额外处理
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 自定义静态文件中间件，添加UTF-8字符集 - 必须在 express.static 之后
app.use('/admin', express.static(path.join(__dirname, 'admin'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/qrcodes', express.static(path.join(__dirname, 'public/qrcodes')));

// favicon 支持
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// 根目录重定向到管理后台
app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.get('/health', (req, res) => {
  res.json(ApiResponse.success({ status: 'ok', uptime: process.uptime() }, '服务正常'));
});

// 管理后台登录API（含安全防护）
app.post('/api/admin/login', async (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const { username, password } = req.body;
  
  console.log(`[登录] IP: ${clientIp}, 用户名: ${username}`);
  
  // 检查IP是否被锁定
  if (isIPLocked(clientIp)) {
    const record = security.loginAttempts.get(clientIp);
    const remainingTime = Math.ceil((record.lockedUntil - Date.now()) / 1000 / 60);
    console.log(`[安全] 拒绝登录 - IP已被锁定: ${clientIp}`);
    return res.status(403).json(ApiResponse.error(`登录尝试过多，请${remainingTime}分钟后再试`, 403));
  }
  
  // 每次登录只从数据库读取密码，不使用内存缓存
  let savedUsername = 'admin';
  let savedPassword = 'Admin@123456';
  
  // 尝试连接数据库读取密码
  try {
    // 检查是否需要重新连接
    if (!pool) {
      pool = mysql.createPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
    }
    
    const [settings] = await pool.query('SELECT * FROM settings LIMIT 1');
    if (settings.length > 0) {
      savedUsername = settings[0].admin_username || 'admin';
      savedPassword = settings[0].admin_password || 'Admin@123456';
      logger.info('[登录] 从数据库读取账号: ' + savedUsername + ', 密码: ' + savedPassword);
    } else {
      logger.warn('[登录] settings表为空，使用默认密码');
    }
  } catch (e) {
    logger.error('[登录] 读取数据库密码失败: ' + e.message + '，使用默认密码');
  }
  
  // 本地测试模式：允许多种密码登录（包括SHA-256哈希）
  if (FORCE_MEMORY_MODE) {
    // 计算输入密码的SHA-256哈希
    const crypto = require('crypto');
    const inputHash = crypto.createHash('sha256').update(password).digest('hex');
    
    // 接受的密码哈希值
    const validHashes = [
      '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // admin
      'ac0e7d037817094e9e0b4441f9bae3209d67b02fa484917065f71b16109a1a78', // admin123456
      'ad89b64d66caa8e30e5d5ce4a9763f4ecc205814c412175f3e2c50027471426d', // Admin@123456
      '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'  // 123456
    ];
    
    if (username === savedUsername && (validHashes.includes(inputHash) || validHashes.includes(password))) {
      clearLoginAttempts(clientIp);
      console.log(`[登录] 成功(测试模式) - IP: ${clientIp}`);
      // 记录登录日志
      recordLoginLog(username, clientIp, req.get('User-Agent'), true);
      return res.json(ApiResponse.success({ token: 'admin_token_' + Date.now() }, '登录成功'));
    }
  }
  
  if (username === savedUsername && password === savedPassword) {
    // 登录成功
    clearLoginAttempts(clientIp);
    console.log(`[登录] 成功 - IP: ${clientIp}, 用户名: ${username}`);
    // 记录登录日志
    recordLoginLog(username, clientIp, req.get('User-Agent'), true);
    return res.json(ApiResponse.success({ token: 'admin_token_' + Date.now() }, '登录成功'));
  } else {
    // 登录失败
    recordFailedAttempt(clientIp);
    const record = security.loginAttempts.get(clientIp);
    const remainingAttempts = security.maxAttempts - (record?.attempts?.length || 0);
    console.log(`[登录] 失败 - IP: ${clientIp}, 剩余尝试: ${remainingAttempts}`);
    // 记录登录日志
    recordLoginLog(username, clientIp, req.get('User-Agent'), false);
    return res.status(401).json(ApiResponse.error(
      remainingAttempts > 0 
        ? `用户名或密码错误，还剩${remainingAttempts}次尝试` 
        : '登录尝试过多，请15分钟后再试',
      401
    ));
  }
});

// 记录登录日志到数据库
async function recordLoginLog(username, ip, userAgent, success) {
  if (!useMySQL || !pool) return;
  try {
    const logId = uuidv4();
    await pool.query(
      'INSERT INTO login_logs (id, username, ip, user_agent, success) VALUES (?, ?, ?, ?, ?)',
      [logId, username, ip, userAgent || '', success ? 1 : 0]
    );
  } catch (e) {
    logger.error('[记录登录日志] 失败:', e.message);
  }
}

// 获取登录日志API
app.get('/api/login-logs', async (req, res) => {
  try {
    if (useMySQL && pool) {
      const [logs] = await pool.query('SELECT * FROM login_logs ORDER BY create_time DESC LIMIT 100');
      return res.json(ApiResponse.success(logs, '获取成功'));
    }
    res.json(ApiResponse.success([], '获取成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('获取失败: ' + e.message, 500));
  }
});

// 清空登录日志API
app.delete('/api/login-logs', async (req, res) => {
  try {
    if (useMySQL && pool) {
      await pool.query('DELETE FROM login_logs');
      return res.json(ApiResponse.success(null, '删除成功'));
    }
    res.json(ApiResponse.success(null, '删除成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('删除失败: ' + e.message, 500));
  }
});

// 导出日志记录
async function recordExportLog(operator, exportType, recordCount, exportData, ip) {
  if (!useMySQL || !pool) return;
  try {
    const logId = uuidv4();
    await pool.query(
      'INSERT INTO export_logs (id, operator, ip, export_type, record_count, export_data) VALUES (?, ?, ?, ?, ?, ?)',
      [logId, operator, ip, exportType, recordCount, JSON.stringify(exportData)]
    );
  } catch (e) {
    logger.error('[记录导出日志] 失败:', e.message);
  }
}

// 获取导出日志API
app.get('/api/export-logs', async (req, res) => {
  try {
    if (useMySQL && pool) {
      const [logs] = await pool.query('SELECT * FROM export_logs ORDER BY create_time DESC LIMIT 100');
      return res.json(ApiResponse.success(logs, '获取成功'));
    }
    res.json(ApiResponse.success([], '获取成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('获取失败: ' + e.message, 500));
  }
});

// 清空导出日志API
app.delete('/api/export-logs', async (req, res) => {
  try {
    if (useMySQL && pool) {
      await pool.query('DELETE FROM export_logs');
      return res.json(ApiResponse.success(null, '删除成功'));
    }
    res.json(ApiResponse.success(null, '删除成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('删除失败: ' + e.message, 500));
  }
});

// 记录导出日志API
app.post('/api/export-logs', async (req, res) => {
  try {
    const { operator, exportType, recordCount, exportData, ip } = req.body;
    if (useMySQL && pool) {
      const logId = uuidv4();
      await pool.query(
        'INSERT INTO export_logs (id, operator, ip, export_type, record_count, export_data) VALUES (?, ?, ?, ?, ?, ?)',
        [logId, operator || 'admin', ip || '', exportType || '', recordCount || 0, JSON.stringify(exportData || [])]
      );
      return res.json(ApiResponse.success(null, '记录成功'));
    }
    res.json(ApiResponse.success(null, '记录成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('记录失败: ' + e.message, 500));
  }
});

// 服装管理 API - MySQL版本
app.get('/api/clothing/list', async (req, res) => {
  try {
    if (useMySQL) {
      const clothing = await getClothingList();
      return res.json(ApiResponse.success(clothing, '获取成功'));
    }
    res.json(ApiResponse.success(data.clothing || [], '获取成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('获取失败: ' + e.message, 500));
  }
});

// 获取服装尺码详情
app.get('/api/clothing/sizes/:name', async (req, res) => {
  try {
    const name = req.params.name;
    if (useMySQL && pool) {
      const [rows] = await pool.query('SELECT * FROM clothing_sizes WHERE clothing_name = ?', [name]);
      return res.json(ApiResponse.success(rows, '获取成功'));
    }
    res.json(ApiResponse.success([], '获取成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('获取失败: ' + e.message, 500));
  }
});

// 保存服装尺码到数据库
app.post('/api/clothing/sizes', async (req, res) => {
  try {
    const { clothing_name, size, gender, height_range, chest_range, waist_range, hip_range, head_range, shoe_size, remark } = req.body;
    
    if (!clothing_name || !size) {
      return res.status(400).json(ApiResponse.error('缺少必要参数', 400));
    }
    
    if (useMySQL && pool) {
      const sizeId = uuidv4();
      await pool.query(
        `INSERT INTO clothing_sizes (id, clothing_name, size, gender, height_range, chest_range, waist_range, hip_range, head_range, shoe_size, remark) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sizeId, clothing_name, size, gender || '', height_range || '', chest_range || '', waist_range || '', hip_range || '', head_range || '', shoe_size || '', remark || '']
      );
      return res.json(ApiResponse.success(null, '保存成功'));
    }
    res.json(ApiResponse.success(null, '保存成功（内存模式）'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('保存失败: ' + e.message, 500));
  }
});

app.post('/api/clothing', async (req, res) => {
  const { name, sizes, category } = req.body;
  if (!name) {
    return res.status(400).json(ApiResponse.error('请输入服装名称', 400));
  }
  
  const clothing = {
    id: uuidv4(),
    name,
    sizes: JSON.stringify(sizes || []),
    category: category || '通用',
    created_at: new Date()
  };
  
  try {
    if (useMySQL) {
      await addClothing(clothing);
    }
    if (!data.clothing) data.clothing = [];
    data.clothing.push(clothing);
    res.json(ApiResponse.success(clothing, '添加成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('添加失败: ' + e.message, 500));
  }
});

app.delete('/api/clothing/:id', async (req, res) => {
  try {
    if (useMySQL && pool) {
      await deleteClothing(req.params.id);
    }
    // 内存模式也要删除
    if (data.clothing) {
      const idx = data.clothing.findIndex(c => c.id === req.params.id);
      if (idx > -1) data.clothing.splice(idx, 1);
    }
    res.json(ApiResponse.success(null, '删除成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('删除失败: ' + e.message, 500));
  }
});

// 根据名称删除服装及尺码
app.post('/api/clothing/deleteByName', async (req, res) => {
  try {
    logger.info('[删除服装] 请求头:', req.headers);
    logger.info('[删除服装] 请求体:', req.body);
    
    const { name } = req.body;
    logger.info('[删除服装] 解析的name:', name, typeof name);
    
    if (!name) {
      logger.warn('[删除服装] name为空或未定义');
      return res.status(400).json(ApiResponse.error('服装名称不能为空', 400));
    }
    
    const trimName = String(name).trim();
    if (!trimName) {
      logger.warn('[删除服装] name为空字符串');
      return res.status(400).json(ApiResponse.error('服装名称不能为空', 400));
    }
    
    logger.info('[删除服装] 将删除:', trimName);
    
    if (useMySQL && pool) {
      // 删除尺码
      await pool.query('DELETE FROM clothing_sizes WHERE clothing_name = ?', [trimName]);
      // 删除服装
      await pool.query('DELETE FROM clothing WHERE name = ?', [trimName]);
    }
    
    // 内存模式也要删除
    if (data.clothing) {
      const beforeCount = data.clothing.length;
      data.clothing = data.clothing.filter(c => c.name !== trimName);
      logger.info(`[删除服装] 内存模式: 删除了 ${beforeCount - data.clothing.length} 条`);
    }
    
    res.json(ApiResponse.success(null, '删除成功'));
  } catch (e) {
    logger.error('[删除服装] 失败:', e.message);
    res.status(500).json(ApiResponse.error('删除失败: ' + e.message, 500));
  }
});

// 系统设置 API
app.get('/api/settings', async (req, res) => {
  // 尝试从数据库读取最新设置
  let settings = { systemName: '智能量体系统' };
  try {
    if (!pool) {
      pool = mysql.createPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
    }
    const [rows] = await pool.query('SELECT * FROM settings LIMIT 1');
    if (rows.length > 0) {
      settings.systemName = rows[0].system_name || '智能量体系统';
    }
  } catch (e) {
    console.error('[设置] 读取失败:', e.message);
  }
  res.json(ApiResponse.success(settings, '获取成功'));
});

// 调试接口：查看当前密码状态
app.get('/api/debug/password', async (req, res) => {
  try {
    if (!pool) {
      pool = mysql.createPool({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
    }
    const [rows] = await pool.query('SELECT admin_username, admin_password FROM settings LIMIT 1');
    if (rows.length > 0) {
      return res.json(ApiResponse.success({
        username: rows[0].admin_username,
        password: rows[0].admin_password,
        message: '密码从数据库读取'
      }, '获取成功'));
    } else {
      return res.json(ApiResponse.success({
        username: 'admin',
        password: 'Admin@123456',
        message: '数据库无记录，使用默认密码'
      }, '获取成功'));
    }
  } catch (e) {
    return res.json(ApiResponse.success({
      username: 'admin',
      password: 'Admin@123456',
      message: '数据库连接失败: ' + e.message
    }, '获取成功'));
  }
});

app.post('/api/settings', async (req, res) => {
  const { systemName, adminUsername, adminPassword } = req.body;
  
  try {
    // 确保数据库连接正常
    if (!useMySQL || !pool) {
      // 尝试重新连接
      try {
        pool = mysql.createPool({
          host: dbConfig.host,
          port: dbConfig.port,
          user: dbConfig.user,
          password: dbConfig.password,
          database: dbConfig.database,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0
        });
        const testConn = await pool.getConnection();
        testConn.release();
        useMySQL = true;
        logger.info('[MySQL] 重新连接成功');
      } catch (e) {
        logger.warn('[MySQL] 重新连接失败:', e.message);
      }
    }
    
    // 同步更新数据库
    if (useMySQL && pool) {
      try {
        // 先确保 settings 记录存在
        let [existing] = await pool.query('SELECT id, admin_password FROM settings LIMIT 1');
        if (existing.length === 0) {
          await pool.query('INSERT INTO settings (id, system_name, admin_username, admin_password) VALUES (?, ?, ?, ?)', 
            [uuidv4(), '智能量体系统', 'admin', 'Admin@123456']);
          logger.info('[设置] 创建了新的settings记录');
          existing = await pool.query('SELECT id, admin_password FROM settings LIMIT 1');
        }
        
        if (systemName) {
          await pool.query('UPDATE settings SET system_name = ?', [systemName]);
        }
        if (adminUsername) {
          await pool.query('UPDATE settings SET admin_username = ?', [adminUsername]);
        }
        if (adminPassword) {
          await pool.query('UPDATE settings SET admin_password = ?', [adminPassword]);
          logger.info('[设置] 保存新密码到数据库: ' + adminPassword);
        }
        
        // 立即重新读取以确认保存成功
        const [updated] = await pool.query('SELECT * FROM settings LIMIT 1');
        if (updated.length > 0) {
          logger.info('[设置] 数据库中当前密码: ' + updated[0].admin_password);
        }
      } catch (e) {
        logger.error('[设置] 保存密码失败: ' + e.message);
      }
    } else {
      logger.warn('[设置] 数据库未连接，密码未保存');
    }
    
    // 不同步到内存，密码只存数据库
    res.json(ApiResponse.success(null, '保存成功'));
  } catch (e) {
    res.status(500).json(ApiResponse.error('保存失败: ' + e.message, 500));
  }
});

app.get('/api/project/list', (req, res) => {
  res.json(ApiResponse.success(data.projects, '获取成功'));
});

app.get('/api/project/:id', (req, res) => {
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json(ApiResponse.error('项目不存在', 404));
  }
  res.json(ApiResponse.success(project, '获取成功'));
});

app.post('/api/project/create', (req, res) => {
  const { name, description, deadline } = req.body;
  if (!name) {
    return res.status(400).json(ApiResponse.error('请输入项目名称', 400));
  }
  
  // 检查项目名称是否已存在（唯一性）
  const existingProject = data.projects.find(p => p.name && p.name.trim() === name.trim());
  if (existingProject) {
    return res.status(400).json(ApiResponse.error('项目名称已存在: ' + existingProject.name, 400));
  }
  
  const project = {
    id: uuidv4(),
    name,
    description: description || '',
    qrcode_url: null,
    status: 'active',
    excel_filename: null,
    deadline: deadline || null,
    created_at: new Date().toISOString()
  };
  
  data.projects.push(project);
  saveData();
  
  res.json(ApiResponse.success(project, '创建成功'));
});

const multer = require('multer');
const upload = multer({ dest: path.join(__dirname, 'uploads') });

app.post('/api/project/:id/import', upload.single('file'), (req, res) => {
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ code: 404, message: '项目不存在' });
  }
  
  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请上传文件' });
  }
  
  const xlsx = require('xlsx');
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);
    
    if (rows.length === 0) {
      return res.status(400).json({ code: 400, message: 'Excel文件为空' });
    }
    
    const excelHeaders = Object.keys(rows[0]);
    
    // 打印Excel表头用于调试
    console.log('Excel Headers:', excelHeaders);
    
    const fieldMap = {
      // 基本信息
      '检索号': 'name',
      '姓名': 'name',
      '供给证号': 'police_no',
      '警号': 'police_no',
      '个人警号': 'police_no',
      '性别': 'gender',
      // 量体数据
      '身高': 'height',
      '体重': 'weight',
      '头围': 'head',
      '颈围': 'neck',
      '领围': 'neck',
      '肩宽': 'shoulder',
      '胸围': 'chest',
      '袖长': 'sleeve',
      '腰围': 'waist',
      '臀围': 'hip',
      '裤长': 'bottom_length',
      '鞋号': 'shoe_size',
      '鞋码': 'shoe_size',
      // 收件信息
      '收件人': 'receiver',
      '联系电话': 'phone',
      '收件地址': 'address',
      '备注': 'remark'
    };
    
    const mapping = {};
    for (const header of excelHeaders) {
      const trimmedHeader = header ? header.trim() : '';
      if (fieldMap[trimmedHeader]) {
        mapping[fieldMap[trimmedHeader]] = header;
      }
    }
    
    console.log('Field Mapping:', mapping);
    
    if (!mapping.name) {
      return res.status(400).json({ code: 400, message: 'Excel表头缺少"姓名"列' });
    }
    if (!mapping.police_no) {
      return res.status(400).json({ code: 400, message: 'Excel表头缺少"个人警号"列' });
    }
    
    let importCount = 0;
    let duplicateCount = 0;
    const duplicates = [];
    
    rows.forEach(row => {
      let name = row[mapping.name];
      if (!name) return;
      name = String(name).trim();
      if (!name) return;
      
      const policeNo = String(row[mapping.police_no] || '');
      
      // 检查供给证号+检索号是否重复（所有项目之间都不能重复）
      const existingIndex = data.measureData.findIndex(m => 
        ((m.police_no || '') == policeNo) &&
        ((m.name || '') === name)
      );
      
      if (existingIndex >= 0) {
        const existingProject = data.projects.find(p => p.id === data.measureData[existingIndex].project_id);
        const projectName = existingProject ? existingProject.name : '未知项目';
        duplicateCount++;
        duplicates.push({
          name: name,
          police_no: policeNo,
          existing_id: data.measureData[existingIndex].id,
          project_name: projectName
        });
        return;
      }
      
      const now = new Date().toISOString();
      
      // 字段映射：将Excel中文表头转换为英文字段名
      const dataRow = {
        id: uuidv4(),
        project_id: project.id,
        name: name,
        police_no: policeNo,
        updated_at: now,
        created_at: now,
        // 基础字段
        gender: String(row[mapping.gender] || row['性别'] || ''),
        department: String(row[mapping.department] || row['部门'] || ''),
        level: String(row[mapping.level] || row['等级'] || ''),
        // 量体数据
        height: String(row[mapping.height] || row['身高'] || ''),
        weight: String(row[mapping.weight] || row['体重'] || ''),
        head: String(row[mapping.head] || row['头围'] || ''),
        neck: String(row[mapping.neck] || row['领围'] || ''),
        shoulder: String(row[mapping.shoulder] || row['肩宽'] || ''),
        chest: String(row[mapping.chest] || row['胸围'] || ''),
        sleeve: String(row[mapping.sleeve] || row['袖长'] || ''),
        top_length: String(row[mapping.top_length] || row['衣长'] || ''),
        waist: String(row[mapping.waist] || row['腰围'] || ''),
        hip: String(row[mapping.hip] || row['臀围'] || ''),
        bottom_length: String(row[mapping.bottom_length] || row['裤长'] || ''),
        shoe_size: String(row[mapping.shoe_size] || row['鞋号'] || row['鞋码'] || ''),
        // 收件信息
        receiver: String(row[mapping.receiver] || row['收件人'] || ''),
        phone: String(row[mapping.phone] || row['联系电话'] || ''),
        address: String(row[mapping.address] || row['收件地址'] || ''),
        remark: String(row[mapping.remark] || row['备注'] || ''),
        // 状态
        status: 'pending'
      };
      
      data.measureData.push(dataRow);
      importCount++;
    });
    
    project.excel_filename = req.file.originalname;
    saveData();
    
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    
    let message = `成功导入${importCount}条数据`;
    if (duplicateCount > 0) {
      message += `，发现${duplicateCount}条重复数据`;
    }
    
    res.json(ApiResponse.success({ import_count: importCount, duplicate_count: duplicateCount, duplicates: duplicates.slice(0, 50) }, message));
  } catch (e) {
    res.status(400).json(ApiResponse.error('Excel解析失败: ' + e.message, 400));
  }
});

// 批量替换重复数据API
app.post('/api/project/:id/import/replace', upload.single('file'), (req, res) => {
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ code: 404, message: '项目不存在' });
  }
  
  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请上传文件' });
  }
  
  const xlsx = require('xlsx');
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);
    
    if (rows.length === 0) {
      return res.status(400).json({ code: 400, message: 'Excel文件为空' });
    }
    
    const excelHeaders = Object.keys(rows[0]);
    
    const fieldMap = {
      '检索号': 'name',
      '姓名': 'name',
      '供给证号': 'police_no',
      '警号': 'police_no',
      '个人警号': 'police_no',
      '性别': 'gender',
      '身高': 'height',
      '体重': 'weight',
      '头围': 'head',
      '颈围': 'neck',
      '领围': 'neck',
      '肩宽': 'shoulder',
      '胸围': 'chest',
      '袖长': 'sleeve',
      '腰围': 'waist',
      '臀围': 'hip',
      '裤长': 'bottom_length',
      '鞋号': 'shoe_size',
      '鞋码': 'shoe_size',
      '收件人': 'receiver',
      '联系电话': 'phone',
      '收件地址': 'address',
      '备注': 'remark'
    };
    
    const mapping = {};
    for (const header of excelHeaders) {
      const trimmedHeader = header ? header.trim() : '';
      if (fieldMap[trimmedHeader]) {
        mapping[fieldMap[trimmedHeader]] = header;
      }
    }
    
    if (!mapping.name) {
      return res.status(400).json({ code: 400, message: 'Excel表头缺少"姓名"列' });
    }
    if (!mapping.police_no) {
      return res.status(400).json({ code: 400, message: 'Excel表头缺少"个人警号"列' });
    }
    
    let importCount = 0;
    let replaceCount = 0;
    
    rows.forEach(row => {
      let name = row[mapping.name];
      if (!name) return;
      name = String(name).trim();
      if (!name) return;
      
      const policeNo = String(row[mapping.police_no] || '');
      const now = new Date().toISOString();
      
      // 检查是否存在（所有项目之间）
      const existingIndex = data.measureData.findIndex(m => 
        ((m.police_no || '') == policeNo) &&
        ((m.name || '') === name)
      );
      
      const dataRow = {
        project_id: project.id,
        name: name,
        police_no: policeNo,
        updated_at: now,
        gender: String(row[mapping.gender] || row['性别'] || ''),
        department: String(row[mapping.department] || row['部门'] || ''),
        level: String(row[mapping.level] || row['等级'] || ''),
        height: String(row[mapping.height] || row['身高'] || ''),
        weight: String(row[mapping.weight] || row['体重'] || ''),
        head: String(row[mapping.head] || row['头围'] || ''),
        neck: String(row[mapping.neck] || row['领围'] || ''),
        shoulder: String(row[mapping.shoulder] || row['肩宽'] || ''),
        chest: String(row[mapping.chest] || row['胸围'] || ''),
        sleeve: String(row[mapping.sleeve] || row['袖长'] || ''),
        top_length: String(row[mapping.top_length] || row['衣长'] || ''),
        waist: String(row[mapping.waist] || row['腰围'] || ''),
        hip: String(row[mapping.hip] || row['臀围'] || ''),
        bottom_length: String(row[mapping.bottom_length] || row['裤长'] || ''),
        shoe_size: String(row[mapping.shoe_size] || row['鞋号'] || row['鞋码'] || ''),
        receiver: String(row[mapping.receiver] || row['收件人'] || ''),
        phone: String(row[mapping.phone] || row['联系电话'] || ''),
        address: String(row[mapping.address] || row['收件地址'] || ''),
        remark: String(row[mapping.remark] || row['备注'] || ''),
        status: 'pending'
      };
      
      if (existingIndex >= 0) {
        // 替换现有数据
        dataRow.id = data.measureData[existingIndex].id;
        dataRow.created_at = data.measureData[existingIndex].created_at;
        data.measureData[existingIndex] = dataRow;
        replaceCount++;
      } else {
        // 新增
        dataRow.id = uuidv4();
        dataRow.created_at = now;
        data.measureData.push(dataRow);
        importCount++;
      }
    });
    
    project.excel_filename = req.file.originalname;
    saveData();
    
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch(e) {}
    }
    
    res.json(ApiResponse.success({ import_count: importCount, replace_count: replaceCount }, `替换${replaceCount}条，新增${importCount}条数据`));
  } catch (e) {
    res.status(400).json(ApiResponse.error('Excel解析失败: ' + e.message, 400));
  }
});

app.delete('/api/project/:id', (req, res) => {
  const index = data.projects.findIndex(p => p.id === req.params.id);
  if (index < 0) {
    return res.status(404).json(ApiResponse.error('项目不存在', 404));
  }
  
  data.projects.splice(index, 1);
  data.measureData = data.measureData.filter(m => m.project_id !== req.params.id);
  saveData();
  
  res.json(ApiResponse.success(null, '删除成功'));
});

app.post('/api/user/login', (req, res) => {
  const { code, userInfo } = req.body;
  
  const user = {
    id: 'user_' + Date.now(),
    openid: 'openid_' + code,
    nickname: userInfo?.nickName || '用户',
    avatar: userInfo?.avatarUrl || '',
    phone: '',
    created_at: new Date().toISOString()
  };
  
  res.json(ApiResponse.success({
    user_id: user.id,
    openid: user.openid,
    nickname: user.nickname,
    avatar: user.avatar,
    phone: user.phone,
    token: 'token_' + Date.now()
  }, '登录成功'));
});

app.get('/api/user/info/:userId', (req, res) => {
  const user = data.users.find(u => u.id === req.params.userId);
  if (!user) {
    return res.status(404).json(ApiResponse.error('用户不存在', 404));
  }
  res.json(ApiResponse.success(user, '获取成功'));
});

app.get('/api/measure/query', (req, res) => {
  const { project_id, police_no } = req.query;
  
  const searchNo = String(police_no || '').trim();
  
  const results = data.measureData.filter(m => {
    if (m.project_id !== project_id) return false;
    const itemNo = String(m.police_no || m['个人警号'] || m['警号'] || m['供给证号'] || m['证号'] || '').trim();
    if (searchNo && !itemNo.includes(searchNo)) return false;
    return true;
  });
  
  res.json(ApiResponse.success(results, '查询成功'));
});

// 验证警号（第一步）
app.get('/api/measure/verify-police-no', (req, res) => {
  const { project_id, police_no } = req.query;
  
  if (!project_id || !police_no) {
    return res.status(400).json(ApiResponse.error('缺少参数', 400));
  }
  
  const searchNo = String(police_no).trim();
  
  // 查找匹配的记录
  const matches = data.measureData.filter(m => {
    if (m.project_id !== project_id) return false;
    const itemNo = String(m.police_no || m['个人警号'] || m['警号'] || m['供给证号'] || m['证号'] || '').trim();
    return itemNo === searchNo;
  });
  
  if (matches.length === 0) {
    return res.json(ApiResponse.success({ exists: false, names: [] }, '查询成功'));
  }
  
  // 返回匹配的人员姓名列表
  const names = matches.map(m => m.name || m['姓名'] || '');
  res.json(ApiResponse.success({ exists: true, names: [...new Set(names)] }, '查询成功'));
});

// 验证姓名（第二步）
app.get('/api/measure/verify-name', (req, res) => {
  const { project_id, police_no, name } = req.query;
  
  if (!project_id || !police_no || !name) {
    return res.status(400).json(ApiResponse.error('缺少参数', 400));
  }
  
  const searchNo = String(police_no).trim();
  const searchName = String(name).trim();
  
  const item = data.measureData.find(m => {
    if (m.project_id !== project_id) return false;
    const itemNo = String(m.police_no || m['个人警号'] || m['警号'] || m['供给证号'] || m['证号'] || '').trim();
    const itemName = String(m.name || m['姓名'] || '').trim();
    return itemNo === searchNo && itemName === searchName;
  });
  
  if (!item) {
    return res.json(ApiResponse.success({ valid: false }, '验证失败'));
  }
  
  res.json(ApiResponse.success({ valid: true, id: item.id }, '验证成功'));
});

app.get('/api/measure/project/:projectId/exact', (req, res) => {
  const { police_no, name } = req.query;
  const projectId = req.params.projectId;
  
  const searchNo = String(police_no || '').trim();
  const searchName = name ? String(name).trim() : null;
  
  const item = data.measureData.find(m => {
    if (m.project_id !== projectId) return false;
    const itemNo = String(m.police_no || '').trim();
    if (itemNo !== searchNo && searchNo) return false;
    if (searchName) {
      const itemName = String(m.name || '').trim();
      if (itemName !== searchName) return false;
    }
    return true;
  });
  
  res.json(ApiResponse.success(item || null, '查询成功'));
});

app.get('/api/measure/project/:projectId/search', (req, res) => {
  const { keyword } = req.query;
  const projectId = req.params.projectId;
  const kw = keyword ? String(keyword).trim().toLowerCase() : '';
  
  if (!kw) {
    return res.json(ApiResponse.success([], '查询成功'));
  }
  
  const results = data.measureData.filter(m => {
    if (m.project_id !== projectId) return false;
    const no = String(m.police_no || '').toLowerCase();
    const nm = String(m.name || '').toLowerCase();
    return no.includes(kw) || nm.includes(kw);
  });
  
  res.json(ApiResponse.success(results, '查询成功'));
});

// 旧的兼容API
app.get('/api/measure/exact', (req, res) => {
  const { project_id, police_no, name } = req.query;
  
  const searchNo = String(police_no || '').trim();
  const searchName = name ? String(name).trim() : null;
  
  const item = data.measureData.find(m => {
    if (m.project_id !== project_id) return false;
    const itemNo = String(m.police_no || m['个人警号'] || m['警号'] || m['供给证号'] || m['证号'] || '').trim();
    if (itemNo !== searchNo) return false;
    if (searchName) {
      const itemName = String(m.name || m['姓名'] || '').trim();
      // 精确匹配姓名
      if (itemName !== searchName) return false;
    }
    return true;
  });
  
  // 返回200，不管是否找到
  res.json(ApiResponse.success(item || null, '查询成功'));
});

app.get('/api/measure/:id', (req, res) => {
  const item = data.measureData.find(m => m.id === req.params.id);
  if (!item) {
    return res.status(404).json(ApiResponse.error('不存在', 404));
  }
  res.json(ApiResponse.success(mapFieldsReverse(item), '获取成功'));
});

// 删除量体数据（同时删除历史记录）
app.delete('/api/measure/:id', async (req, res) => {
  const { id } = req.params;
  
  if (useMySQL) {
    try {
      // 删除量体数据
      await pool.query('DELETE FROM measure_data WHERE id = ?', [id]);
      
      // 删除关联的历史记录
      await pool.query('DELETE FROM measure_history WHERE measure_id = ?', [id]);
      
      res.json(ApiResponse.success(null, '删除成功'));
    } catch (err) {
      logger.error('[删除量体数据失败]', err.message);
      return res.status(500).json(ApiResponse.error('删除失败: ' + err.message, 500));
    }
  } else {
    // 内存模式
    const index = data.measureData.findIndex(m => m.id === id);
    if (index < 0) {
      return res.status(404).json(ApiResponse.error('不存在', 404));
    }
    data.measureData.splice(index, 1);
    
    // 同时删除历史记录
    data.measureHistory = data.measureHistory.filter(h => h.measure_id !== id);
    
    saveData();
    res.json(ApiResponse.success(null, '删除成功'));
  }
});

// 创建量体数据
app.post('/api/measure/create', (req, res) => {
  const measureData = req.body;
  
  if (!measureData.project_id) {
    return res.status(400).json(ApiResponse.error('缺少项目ID', 400));
  }
  if (!measureData.police_no) {
    return res.status(400).json(ApiResponse.error('缺少供给证号', 400));
  }
  if (!measureData.name) {
    return res.status(400).json(ApiResponse.error('缺少检索号', 400));
  }
  
  // 检查供给证号+检索号是否重复（所有项目之间都不能重复）
  const checkPoliceNo = String(measureData.police_no || '').trim();
  const checkName = String(measureData.name || '').trim();
  
  console.log('Creating measure - police_no:', checkPoliceNo, 'name:', checkName);
  
  const existingIndex = data.measureData.findIndex(m => 
    String(m.police_no || '').trim() === checkPoliceNo &&
    String(m.name || '').trim() === checkName
  );
  
  console.log('Existing index:', existingIndex);
  
  if (existingIndex >= 0) {
    const existingProject = data.projects.find(p => p.id === data.measureData[existingIndex].project_id);
    const projectName = existingProject ? existingProject.name : '未知项目';
    return res.status(400).json(ApiResponse.error(
      `该供给证号(${measureData.police_no})+检索号(${measureData.name})已存在于项目「${projectName}」中，不能重复创建`,
      400,
      { existing_id: data.measureData[existingIndex].id, existing_project: projectName }
    ));
  }
  
  const newMeasure = {
    id: uuidv4(),
    project_id: measureData.project_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...measureData
  };
  
  // 直接保存数据
  data.measureData.push(newMeasure);
  saveData();
  
  // 返回数据给前端
  res.json(ApiResponse.success(newMeasure, '创建成功'));
});

app.post('/api/measure/update', (req, res) => {
  const { id, ...updateFields } = req.body;
  
  if (!id) {
    return res.status(400).json(ApiResponse.error('缺少ID', 400));
  }
  
  const index = data.measureData.findIndex(m => m.id === id);
  if (index === -1) {
    return res.status(404).json(ApiResponse.error('数据不存在', 404));
  }
  
  const oldData = { ...data.measureData[index] };
  
  // 直接更新字段
  Object.keys(updateFields).forEach(key => {
    data.measureData[index][key] = updateFields[key];
  });
  
  const newData = { ...data.measureData[index] };
  data.measureData[index].updated_at = new Date().toISOString();
  
  // 计算实际修改的字段
  const changedFields = [];
  Object.keys(updateFields).forEach(key => {
    if (oldData[key] !== updateFields[key]) {
      changedFields.push(key);
    }
  });
  
  const historyEntry = {
    id: uuidv4(),
    measure_id: id,
    old_data: oldData,
    new_data: newData,
    changes: changedFields.length,
    changed_fields: changedFields,
    create_time: new Date().toISOString()
  };
  data.measureHistory.push(historyEntry);
  
  saveData();
  
  res.json(ApiResponse.success(data.measureData[index], '保存成功'));
});

// 小程序字段名映射到后台字段名
const fieldMapping = {
  'neck_circumference': 'neck',
  'chest_circumference': 'chest',
  'shoulder_width': 'shoulder',
  'waist_circumference': 'waist',
  'pants_length': 'bottom_length',
  'hip_circumference': 'hip',
  'head_tail': 'head',
  'top_length': 'top_length',
  'receiver_name': 'receiver',
  'receiver_phone': 'phone',
  'receiver_address': 'address',
  'top_size': 'top_size',
  'bottom_size': 'bottom_size',
  'supply_no': 'police_no',
  'search_no': 'name',
  'sleeve_length': 'sleeve'
};

// 映射字段名
function mapFields(data) {
  if (!data) return data;
  const mapped = { ...data };
  Object.keys(fieldMapping).forEach(key => {
    if (mapped[key] !== undefined) {
      mapped[fieldMapping[key]] = mapped[key];
      delete mapped[key];
    }
  });
  return mapped;
}

// 后台字段名映射到小程序字段名（反向映射）
const reverseFieldMapping = {
  'neck': 'neck_circumference',
  'chest': 'chest_circumference',
  'shoulder': 'shoulder_width',
  'waist': 'waist_circumference',
  'bottom_length': 'pants_length',
  'hip': 'hip_circumference',
  'head': 'head_tail',
  'top_length': 'top_length',
  'receiver': 'receiver_name',
  'phone': 'receiver_phone',
  'address': 'receiver_address',
  'top_size': 'top_size',
  'bottom_size': 'bottom_size',
  'police_no': 'supply_no',
  'name': 'search_no',
  'sleeve': 'sleeve_length'
};

// 反向映射字段名
function mapFieldsReverse(data) {
  if (!data) return data;
  const mapped = { ...data };
  Object.keys(reverseFieldMapping).forEach(key => {
    if (mapped[key] !== undefined) {
      mapped[reverseFieldMapping[key]] = mapped[key];
    }
  });
  return mapped;
}

// 字段中文名映射
const fieldNameCN = {
  'police_no': '供给证号', 'name': '检索号', 'gender': '性别',
  'height': '身高', 'weight': '体重', 'head': '头围', 'neck': '领围', 'shoulder': '肩宽',
  'chest': '胸围', 'sleeve': '袖长', 'waist': '腰围', 'hip': '臀围', 'bottom_length': '裤长',
  'shoe_size': '鞋号', 'clothing_name': '服装品名', 'clothing_size': '已选尺码',
  'receiver': '收件人', 'phone': '联系电话', 'address': '收件地址', 'remark': '备注', 'status': '状态',
  'neck_circumference': '领围', 'chest_circumference': '胸围', 'shoulder_width': '肩宽',
  'waist_circumference': '腰围', 'pants_length': '裤长', 'hip_circumference': '臀围',
  'head_tail': '头围', 'receiver_name': '收件人', 'receiver_phone': '联系电话', 'receiver_address': '收件地址',
  'top_size': '上衣型号', 'bottom_size': '下衣型号'
};

function getFieldNameCN(field) { return fieldNameCN[field] || field; }

function convertHistoryFields(history) {
  return history.map(h => ({
    ...h,
    changed_fields_cn: (h.changed_fields || []).map(f => getFieldNameCN(f))
  }));
}

app.put('/api/measure/:id', async (req, res) => {
  // MySQL更新
  if (useMySQL && pool) {
    try {
      const { clothing_rows, ...otherFields } = req.body;
      const updateFields = { ...otherFields };
      
      // 处理clothing_rows
      if (clothing_rows) {
        updateFields.clothing_rows = typeof clothing_rows === 'string' ? clothing_rows : JSON.stringify(clothing_rows);
      }
      
      // 构建更新SQL
      const fields = Object.keys(updateFields);
      if (fields.length > 0) {
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const values = [...Object.values(updateFields), req.params.id];
        await pool.query(`UPDATE measure_data SET ${setClause}, update_time = NOW() WHERE id = ?`, values);
      }
      
      return res.json({ code: 0, message: '更新成功' });
    } catch (e) {
      console.error('[MySQL] measure update error:', e.message);
    }
  }
  
  // 内存更新（降级方案）
  const index = data.measureData.findIndex(m => m.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ code: 404, message: '不存在' });
  }
  
  console.log('[DEBUG] measure update, user_id received:', req.body.user_id);
  const mappedBody = mapFields(req.body);
  const oldData = { ...data.measureData[index] };
  
  // 处理user_id：只有当有实际值时才更新
  const userIdFromBody = req.body.user_id;
  const hasValidUserId = userIdFromBody && String(userIdFromBody).trim() !== '';
  const finalUserId = hasValidUserId ? userIdFromBody : oldData.user_id;
  console.log('[DEBUG] finalUserId:', finalUserId);
  
  // 处理clothing_rows
  if (req.body.clothing_rows) {
    mappedBody.clothing_rows = typeof req.body.clothing_rows === 'string' ? req.body.clothing_rows : JSON.stringify(req.body.clothing_rows);
  }
  
  // 直接更新字段
  data.measureData[index] = {
    ...data.measureData[index],
    ...mappedBody,
    user_id: finalUserId,
    updated_at: new Date().toISOString()
  };
  
  const newData = { ...data.measureData[index] };
  
  // 返回数据
  const changedFields = [];
  Object.keys(req.body).forEach(key => {
    if (oldData[key] !== req.body[key]) {
      changedFields.push(key);
    }
  });
  
  // 记录历史
  if (changedFields.length > 0) {
    const historyEntry = {
      id: uuidv4(),
      measure_id: req.params.id,
      old_data: oldData,
      new_data: newData,
      changes: changedFields.length,
      changed_fields: changedFields,
      create_time: new Date().toISOString()
    };
    data.measureHistory.push(historyEntry);
  }
  
  saveData();
  
  // 返回数据
  res.json({ code: 0, message: '更新成功', data: data.measureData[index] });
});

app.put('/api/measure/:id/address', (req, res) => {
  const index = data.measureData.findIndex(m => m.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ code: 404, message: '不存在' });
  }
  
  console.log('[DEBUG] address update, user_id received:', req.body.user_id);
  const { receiver_name, receiver_phone, receiver_address, user_id } = req.body;
  // 只有当user_id有实际值时才更新，否则保留原值
  const newUserId = (user_id && String(user_id).trim() !== '') ? user_id : data.measureData[index].user_id;
  console.log('[DEBUG] newUserId:', newUserId);
  
  // 直接更新字段
  data.measureData[index] = {
    ...data.measureData[index],
    receiver_name: receiver_name || '',
    receiver_phone: receiver_phone || '',
    receiver_address: receiver_address || '',
    user_id: newUserId,
    updated_at: new Date().toISOString()
  };
  saveData();
  
  // 返回数据
  res.json({ code: 0, message: '保存成功', data: data.measureData[index] });
});

app.get('/api/measure/:id/history', (req, res) => {
  const history = data.measureHistory
    .filter(h => h.measure_id === req.params.id)
    .sort((a, b) => new Date(b.create_time) - new Date(a.create_time));
  
  res.json(ApiResponse.success(convertHistoryFields(history), '获取成功'));
});

app.get('/api/measure/project/:projectId/all', (req, res) => {
  const { page = 1, pageSize = 100 } = req.query;
  
  const allData = data.measureData.filter(m => m.project_id === req.params.projectId);
  
  // 直接返回数据
  const decryptedData = allData;
  
  // 为没有status字段的数据设置默认值
  decryptedData.forEach(item => {
    if (!item.status) {
      item.status = 'pending';
    }
    // 确保user_id字段存在且不为空字符串
    if (item.user_id === undefined || item.user_id === '') {
      item.user_id = null;
    }
  });
  const start = (page - 1) * pageSize;
  
  // 对列表数据进行反向映射
  const mappedList = decryptedData.slice(start, start + parseInt(pageSize)).map(item => mapFieldsReverse(item));
  
  res.json(ApiResponse.page(mappedList, allData.length, page, pageSize, '获取成功'));
});

// 获取所有数据记录数量
app.get('/api/measure/all/count', (req, res) => {
  res.json(ApiResponse.success({
    total: data.measureData.length,
    projects: data.projects.length,
    users: data.users.length
  }, '获取成功'));
});

// 获取项目截止状态
app.get('/api/project/:id/deadline', (req, res) => {
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ code: 404, message: '项目不存在' });
  }
  res.json({ 
    code: 0, 
    data: { 
      id: project.id,
      name: project.name,
      deadline: project.deadline,
      status: project.status
    } 
  });
});

// 获取今日更新数量
app.get('/api/measure/today/count', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const count = data.measureData.filter(m => {
    const updated = m.updated_at || m.created_at;
    return updated && updated.split('T')[0] === today;
  }).length;
  res.json({
    code: 0,
    data: { count: count }
  });
});

// 全局搜索（按个人警号或姓名搜索所有项目）
app.get('/api/measure/search/:keyword', (req, res) => {
  const keyword = req.params.keyword.toLowerCase();
  const results = data.measureData.filter(m => {
    const policeNo = (m.police_no || m['个人警号'] || m['警号'] || m['供给证号'] || '').toString().toLowerCase();
    const name = (m.name || m['姓名'] || '').toString().toLowerCase();
    return policeNo === keyword || name === keyword;
  });
  
  // 获取关联的项目信息
  const resultsWithProject = results.map(m => {
    const project = data.projects.find(p => p.id === m.project_id);
    return {
      ...m,
      projectName: project ? project.name : '未知项目'
    };
  });
  
  res.json(ApiResponse.success(resultsWithProject, '查询成功'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/api/project/:id/export', (req, res) => {
  const project = data.projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ code: 404, message: '项目不存在' });
  }
  
  const projectData = data.measureData.filter(m => m.project_id === project.id);
  
  if (projectData.length === 0) {
    return res.status(400).json({ code: 400, message: '暂无数据' });
  }
  
  const xlsx = require('xlsx');
  
  const headers = ['供给证号','检索号','性别','身高','体重','头围','鞋号','领围','肩宽','胸围','袖长','腰围','臀围','裤长','上衣型号','下衣型号','收件人','联系电话','收件地址','备注'];
  
  const rows = projectData.map(d => {
    const row = {};
    headers.forEach(h => {
      if (h === '收件人') {
        row[h] = d.receiver_name || d['收件人'] || '';
      } else if (h === '联系电话') {
        row[h] = d.receiver_phone || d['联系电话'] || '';
      } else if (h === '收件地址') {
        row[h] = d.receiver_address || d['收件地址'] || '';
      } else if (h === '单位部门') {
        row[h] = d.department || d['单位部门'] || d['单位'] || '';
      } else if (h === '头围') {
        row[h] = d.head_tail || d['头围'] || '';
      } else if (h === '领围') {
        row[h] = d.neck_circumference || d['领围'] || '';
      } else if (h === '胸围') {
        row[h] = d.chest_circumference || d['胸围'] || '';
      } else if (h === '肩宽') {
        row[h] = d.shoulder_width || d['肩宽'] || '';
      } else if (h === '腰围') {
        row[h] = d.waist_circumference || d['腰围'] || '';
      } else if (h === '裤长') {
        row[h] = d.pants_length || d['裤长'] || '';
      } else if (h === '臀围') {
        row[h] = d.hip_circumference || d['臀围'] || '';
      } else if (h === '上衣型号') {
        row[h] = d.top_size || d['上衣型号'] || '';
      } else if (h === '下衣型号') {
        row[h] = d.bottom_size || d['下衣型号'] || '';
      } else if (h === '个人警号') {
        row[h] = d.police_no || d['个人警号'] || d['警号'] || d['供给证号'] || d['证号'] || '';
      } else {
        row[h] = d[h] || '';
      }
    });
    return row;
  });
  
  const worksheet = xlsx.utils.json_to_sheet(rows, { header: headers });
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, '量体数据');
  
  const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(project.name)}_量体数据.xlsx`);
  res.send(buffer);
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
