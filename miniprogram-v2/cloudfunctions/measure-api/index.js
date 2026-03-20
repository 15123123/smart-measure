/**
 * 云函数 measure-api
 * 智能量体系统 - 数据管理接口
 * 
 * 安全改进版本 (v2)
 * - 增强CORS配置（生产环境应限制来源）
 * - 请求参数校验
 * - 请求频率限制
 * - 统一错误处理
 */

// 允许的来源域名（生产环境请替换为实际域名）
const ALLOWED_ORIGINS = [
  'https://your-app.weixin.qq.com',  // 替换为实际小程序域名
  'https://your-admin.example.com'    // 替换为实际管理后台域名
];

// 是否为生产环境
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

// 数据集合名称
const MEASURE_COLLECTION = 'measure_data';
const HISTORY_COLLECTION = 'measure_history';
const PROJECT_COLLECTION = 'projects';
const CLOTHING_COLLECTION = 'clothing_list';

// ========== 字段名映射 ==========
/**
 * 小程序字段名 -> 数据库字段名
 * 用于将小程序提交的字段名转换为数据库存储的字段名
 */
const FIELD_MAP_TO_DB = {
  // 基本信息
  'supply_no': 'police_no',        // 供给证号
  'search_no': 'name',             // 检索号
  // 量体数据
  'head_tail': 'head',             // 头围
  'neck_circumference': 'neck',     // 颈围
  'shoulder_width': 'shoulder',    // 肩宽
  'chest_circumference': 'chest',  // 胸围
  'waist_circumference': 'waist',  // 腰围
  'sleeve_length': 'sleeve',      // 袖长
  'hip_circumference': 'hip',      // 臀围
  'pants_length': 'bottom_length', // 裤长
};

/**
 * 数据库字段名 -> 小程序字段名
 * 用于将数据库返回的字段名转换为小程序期望的字段名
 */
const FIELD_MAP_FROM_DB = {
  // 基本信息
  'police_no': 'supply_no',
  'name': 'search_no',
  // 量体数据
  'head': 'head_tail',
  'neck': 'neck_circumference',
  'shoulder': 'shoulder_width',
  'chest': 'chest_circumference',
  'waist': 'waist_circumference',
  'sleeve': 'sleeve_length',
  'hip': 'hip_circumference',
  'bottom_length': 'pants_length',
};

/**
 * 将对象中的字段名从小程序格式转换为数据库格式
 * @param {object} data - 原始数据对象
 * @returns {object} 转换后的数据对象
 */
function mapFieldsToDB(data) {
  if (!data || typeof data !== 'object') return data;
  const mapped = {};
  for (const key of Object.keys(data)) {
    const dbKey = FIELD_MAP_TO_DB[key] || key;
    mapped[dbKey] = data[key];
  }
  return mapped;
}

/**
 * 将对象中的字段名从数据库格式转换为小程序格式
 * @param {object} data - 数据库数据对象
 * @returns {object} 转换后的数据对象
 */
function mapFieldsFromDB(data) {
  if (!data || typeof data !== 'object') return data;
  const mapped = {};
  for (const key of Object.keys(data)) {
    const appKey = FIELD_MAP_FROM_DB[key] || key;
    mapped[appKey] = data[key];
  }
  return mapped;
}

/**
 * 批量转换数组中的字段名
 * @param {array} list - 数据列表
 * @returns {array} 转换后的列表
 */
function mapFieldsListFromDB(list) {
  if (!Array.isArray(list)) return list;
  return list.map(item => mapFieldsFromDB(item));
}

// 请求频率限制（简单实现）
const requestLog = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1分钟内
const RATE_LIMIT_MAX = 100; // 最大请求数

/**
 * 检查请求频率
 * @param {string} openid - 用户openid
 * @returns {boolean} 是否允许请求
 */
function checkRateLimit(openid) {
  const now = Date.now();
  const key = openid || 'anonymous';
  
  if (!requestLog.has(key)) {
    requestLog.set(key, { count: 1, timestamp: now });
    return true;
  }
  
  const log = requestLog.get(key);
  
  // 清除过期记录
  if (now - log.timestamp > RATE_LIMIT_WINDOW) {
    requestLog.set(key, { count: 1, timestamp: now });
    return true;
  }
  
  // 检查频率
  if (log.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  log.count++;
  return true;
}

/**
 * 获取CORS响应头
 * @param {string} origin - 请求来源
 * @returns {object} CORS头
 */
function getCorsHeaders(origin) {
  // 生产环境检查来源是否在白名单中
  if (IS_PRODUCTION && !ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': '',
      'Access-Control-Allow-Methods': '',
      'Access-Control-Allow-Headers': ''
    };
  }
  
  return {
    'Access-Control-Allow-Origin': IS_PRODUCTION ? origin : '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, Authorization'
  };
}

/**
 * 统一响应格式
 * @param {boolean} success - 是否成功
 * @param {any} data - 响应数据
 * @param {string} message - 消息
 * @param {number} code - 状态码
 * @returns {object} 响应对象
 */
function response(success, data = null, message = '', code = 0) {
  return {
    success,
    code,
    message,
    data,
    timestamp: Date.now()
  };
}

/**
 * 验证必需参数
 * @param {object} params - 参数对象
 * @param {string[]} requiredFields - 必需字段列表
 * @throws {Error} 如果缺少必需字段
 */
function validateParams(params, requiredFields) {
  for (const field of requiredFields) {
    if (params[field] === undefined || params[field] === null || params[field] === '') {
      throw new Error(`缺少必需参数: ${field}`);
    }
  }
}

/**
 * 验证ID格式
 * @param {string} id - ID
 * @throws {Error} 如果ID格式无效
 */
function validateId(id) {
  if (!id || typeof id !== 'string' || id.length < 10) {
    throw new Error('无效的ID格式');
  }
}

/**
 * 清理字符串，防止注入
 * @param {string} str - 字符串
 * @returns {string} 清理后的字符串
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>'"]/g, '');
}

// 云函数入口
exports.main = async (event, context) => {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const corsHeaders = getCorsHeaders(origin);
  
  // 处理CORS预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  // 频率限制检查
  const openid = context?.openid || event.openid || 'anonymous';
  if (!checkRateLimit(openid)) {
    return {
      ...response(false, null, '请求过于频繁，请稍后再试', 429),
      headers: corsHeaders
    };
  }
  
  const { action, ...params } = event;
  
  // 记录请求日志
  console.log(`[${new Date().toISOString()}] ${action} - openid: ${openid}`);
  
  try {
    // 参数校验
    if (!action) {
      return {
        ...response(false, null, '缺少action参数', 400),
        headers: corsHeaders
      };
    }
    
    let result;
    
    switch (action) {
      // 获取项目列表
      case 'getProjects':
        result = await getProjects();
        break;
      
      // 根据证号/检索号查询
      case 'searchMeasure':
        result = await searchMeasure(params);
        break;
      
      // 获取量体数据
      case 'getMeasure':
        validateParams(params, ['id']);
        result = await getMeasure(params);
        break;
      
      // 创建量体数据
      case 'createMeasure':
        result = await createMeasure(params);
        break;
      
      // 更新量体数据
      case 'updateMeasure':
        validateParams(params, ['id', 'data']);
        result = await updateMeasure(params);
        break;
      
      // 获取修改历史
      case 'getHistory':
        validateParams(params, ['id']);
        result = await getHistory(params);
        break;
      
      // 删除量体数据（同时删除历史记录）
      case 'deleteMeasure':
        validateParams(params, ['id']);
        result = await deleteMeasure(params);
        break;
      
      // 获取服装列表
      case 'getClothingList':
        result = await getClothingList();
        break;
      
      default:
        result = response(false, null, '未知的操作类型', 404);
    }
    
    return {
      ...result,
      headers: corsHeaders
    };
    
  } catch (err) {
    console.error(`[ERROR] ${action}:`, err.message);
    
    // 根据错误类型返回适当的状态码
    let code = 500;
    if (err.message.includes('缺少') || err.message.includes('无效')) {
      code = 400;
    } else if (err.message.includes('不存在') || err.message.includes('未找到')) {
      code = 404;
    }
    
    return {
      ...response(false, null, err.message, code),
      headers: corsHeaders
    };
  }
};

// ========== 数据操作函数 ==========

/**
 * 获取项目列表
 */
async function getProjects() {
  const res = await db.collection(PROJECT_COLLECTION)
    .orderBy('create_time', 'desc')
    .get();
  
  return response(true, res.data, '获取成功');
}

/**
 * 根据证号/检索号查询
 * @param {object} params - 查询参数
 * @param {string} params.supplyNo - 供给证号（小程序的supply_no）
 * @param {string} params.searchNo - 检索号（小程序的search_no）
 * @param {string} params.projectId - 项目ID
 */
async function searchMeasure(params) {
  const { supplyNo, searchNo, projectId } = params;
  
  // 至少需要一个查询条件
  if (!supplyNo && !searchNo && !projectId) {
    throw new Error('请提供查询条件');
  }
  
  let query = {};
  
  if (supplyNo) {
    // 清理输入，防止注入
    // 转换字段名：小程序 supply_no -> 数据库 police_no
    query.police_no = sanitizeString(supplyNo);
  }
  
  if (searchNo) {
    // 转换字段名：小程序 search_no -> 数据库 name
    query.name = sanitizeString(searchNo);
  }
  
  if (projectId) {
    query.project_id = sanitizeString(projectId);
  }
  
  const res = await db.collection(MEASURE_COLLECTION)
    .where(query)
    .limit(50) // 限制返回数量
    .get();
  
  // 转换返回数据字段名：数据库 -> 小程序
  return response(true, mapFieldsListFromDB(res.data), '查询成功');
}

/**
 * 获取量体数据详情
 * @param {object} params - 参数
 * @param {string} params.id - 数据ID
 */
async function getMeasure(params) {
  const { id } = params;
  validateId(id);
  
  const res = await db.collection(MEASURE_COLLECTION).doc(id).get();
  
  if (!res.data) {
    throw new Error('数据不存在');
  }
  
  // 转换返回数据字段名：数据库 -> 小程序
  return response(true, mapFieldsFromDB(res.data), '获取成功');
}

/**
 * 创建量体数据
 * @param {object} params - 参数（使用小程序字段名）
 */
async function createMeasure(params) {
  // 将小程序字段名转换为数据库字段名
  const mappedParams = mapFieldsToDB(params);
  
  // 清理字符串字段
  const data = {};
  const stringFields = ['police_no', 'name', 'gender', 'project_id', 'receiver', 'phone', 'address', 'remark'];
  
  for (const field of stringFields) {
    if (mappedParams[field]) {
      data[field] = sanitizeString(String(mappedParams[field]));
    }
  }
  
  // 数字字段
  const numberFields = ['height', 'weight', 'head', 'neck', 'shoulder', 'chest', 'waist', 'sleeve', 'hip', 'bottom_length', 'shoe_size'];
  
  for (const field of numberFields) {
    if (mappedParams[field] !== undefined && mappedParams[field] !== null && mappedParams[field] !== '') {
      const num = parseFloat(mappedParams[field]);
      data[field] = isNaN(num) ? null : num;
    }
  }
  
  data.create_time = db.serverDate();
  data.update_time = db.serverDate();
  
  const res = await db.collection(MEASURE_COLLECTION).add({
    data
  });
  
  return response(true, { id: res._id }, '创建成功');
}

/**
 * 更新量体数据
 * @param {object} params - 参数
 * @param {string} params.id - 数据ID
 * @param {object} params.data - 更新数据
 * @param {string} params.userId - 用户ID
 */
/**
 * 更新量体数据
 * @param {object} params - 参数（使用小程序字段名）
 * @param {string} params.id - 数据ID
 * @param {object} params.data - 更新数据（小程序字段名）
 * @param {string} params.userId - 用户ID
 * @param {string} params.source - 来源: 'miniprogram'(小程序) | 'admin'(后台)
 */
async function updateMeasure(params) {
  const { id, data, userId, source } = params;
  validateId(id);
  
  if (!data || typeof data !== 'object') {
    throw new Error('无效的更新数据');
  }
  
  // 获取旧数据用于历史记录
  let oldData = null;
  try {
    const old = await db.collection(MEASURE_COLLECTION).doc(id).get();
    oldData = old.data;
  } catch (e) {
    console.warn('获取旧数据失败:', e.message);
  }
  
  // 将小程序字段名转换为数据库字段名
  const mappedData = mapFieldsToDB(data);
  
  // 准备更新数据
  const updateData = {};
  
  // 清理字符串字段
  const stringFields = ['police_no', 'name', 'gender', 'receiver', 'phone', 'address', 'remark', 'status', 'user_id'];
  
  for (const field of stringFields) {
    if (mappedData[field] !== undefined) {
      updateData[field] = sanitizeString(String(mappedData[field]));
    }
  }
  
  // 数字字段
  const numberFields = ['height', 'weight', 'head', 'neck', 'shoulder', 'chest', 'waist', 'sleeve', 'hip', 'bottom_length', 'shoe_size'];
  
  for (const field of numberFields) {
    if (mappedData[field] !== undefined && mappedData[field] !== null && mappedData[field] !== '') {
      const num = parseFloat(mappedData[field]);
      updateData[field] = isNaN(num) ? null : num;
    }
  }
  
  updateData.update_time = db.serverDate();
  
  // 更新数据
  await db.collection(MEASURE_COLLECTION).doc(id).update({
    data: updateData
  });
  
  // 记录历史（异步，不阻塞主流程）
  if (oldData) {
    try {
      // 计算变更字段（使用小程序字段名）
      const changedFields = [];
      for (const key of Object.keys(data)) {
        if (JSON.stringify(oldData[FIELD_MAP_TO_DB[key] || key]) !== JSON.stringify(data[key])) {
          changedFields.push(key); // 使用小程序字段名
        }
      }
      
      await db.collection(HISTORY_COLLECTION).add({
        data: {
          measure_id: id,
          old_data: oldData,
          new_data: mappedData,
          changed_fields: changedFields,
          user_id: userId || 'unknown',
          source: source || 'miniprogram',  // 来源: miniprogram(小程序) | admin(后台)
          action: data.action || '修改',
          create_time: db.serverDate()
        }
      });
    } catch (e) {
      console.warn('记录历史失败:', e.message);
    }
  }
  
  return response(true, null, '更新成功');
}

/**
 * 获取修改历史
 * @param {object} params - 参数
 * @param {string} params.id - 数据ID
 */
async function getHistory(params) {
  const { id } = params;
  validateId(id);
  
  const res = await db.collection(HISTORY_COLLECTION)
    .where({ measure_id: id })
    .orderBy('create_time', 'desc')
    .limit(50) // 限制返回数量
    .get();
  
  // 转换历史记录中的字段名
  const mappedData = res.data.map(h => ({
    ...h,
    old_data: mapFieldsFromDB(h.old_data),
    new_data: mapFieldsFromDB(h.new_data)
  }));
  
  return response(true, mappedData, '获取成功');
}

/**
 * 删除量体数据（同时删除历史记录）
 * @param {object} params - 参数
 * @param {string} params.id - 数据ID
 */
async function deleteMeasure(params) {
  const { id } = params;
  validateId(id);
  
  try {
    // 获取旧数据（用于日志）
    const old = await db.collection(MEASURE_COLLECTION).doc(id).get();
    const oldData = old.data;
    
    // 删除量体数据
    await db.collection(MEASURE_COLLECTION).doc(id).remove();
    
    // 删除关联的历史记录
    const historyRes = await db.collection(HISTORY_COLLECTION)
      .where({ measure_id: id })
      .get();
    
    if (historyRes.data && historyRes.data.length > 0) {
      // 批量删除历史记录
      for (const h of historyRes.data) {
        await db.collection(HISTORY_COLLECTION).doc(h.id).remove();
      }
      console.log(`删除 ${historyRes.data.length} 条历史记录`);
    }
    
    return response(true, null, '删除成功');
  } catch (e) {
    console.error('删除失败:', e.message);
    return response(false, null, '删除失败: ' + e.message, 500);
  }
}

/**
 * 获取服装列表
 */
async function getClothingList() {
  const res = await db.collection(CLOTHING_COLLECTION)
    .orderBy('sort', 'asc')
    .get();
  
  return response(true, res.data, '获取成功');
}
