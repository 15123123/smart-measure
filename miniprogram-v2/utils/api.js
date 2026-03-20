// utils/api.js - 微信云托管版本
/**
 * API 请求封装
 * 正式环境 - 使用微信云托管
 */

// 云托管配置
const CLOUD_ENV = 'prod-2g2msnzi7f0f35d7';
const SERVICE_NAME = 'koa-l3a0';

// 请求配置
const REQUEST_TIMEOUT = 15000; // 15秒超时

// 日志工具
const logger = {
  info: (...args) => console.log('[API INFO]', new Date().toISOString(), ...args),
  warn: (...args) => console.warn('[API WARN]', new Date().toISOString(), ...args),
  error: (...args) => console.error('[API ERROR]', new Date().toISOString(), ...args)
};

/**
 * 统一请求封装
 */
const request = (options) => {
  return new Promise((resolve, reject) => {
    if (!options || !options.url) {
      logger.error('请求配置无效:', options);
      reject({ code: -1, message: '请求配置无效' });
      return;
    }
    
    const path = options.url.startsWith('http')
      ? new URL(options.url).pathname
      : options.url;
    
    logger.info(`${options.method || 'GET'} ${path}`);
    
    // 使用定时器实现超时
    let timeoutId = null;
    const timeoutPromise = new Promise((_, rejectTimeout) => {
      timeoutId = setTimeout(() => {
        rejectTimeout({ code: -2, message: '请求超时' });
      }, REQUEST_TIMEOUT);
    });
    
    // 请求Promise
    const requestPromise = new Promise((resolve, rejectRequest) => {
      wx.cloud.callContainer({
        config: {
          env: CLOUD_ENV
        },
        path: path,
        header: {
          'Content-Type': 'application/json',
          'X-WX-SERVICE': SERVICE_NAME,
          ...(options.header || {})
        },
        method: options.method || 'GET',
        data: options.data || {},
        success: (res) => {
          logger.info(`${path} <- code=${res.data?.code}`);
          
          if (res.data) {
            if (res.data.code === 0 || res.data.code === undefined) {
              resolve(res.data);
            } else {
              const message = res.data.message || '请求失败';
              logger.warn(`${path} 业务错误: ${message}`);
              wx.showToast({ title: message, icon: 'none', duration: 2000 });
              reject(res.data);
            }
          } else {
            logger.error(`${path} 无响应数据`);
            wx.showToast({ title: '服务器无响应', icon: 'none' });
            reject({ code: -1, message: '服务器无响应' });
          }
        },
        fail: (err) => {
          logger.error(`${path} 请求失败:`, err);
          wx.showToast({ title: '网络连接失败', icon: 'none', duration: 2000 });
          reject({ code: -3, message: '网络连接失败', error: err });
        }
      });
    });
    
    // 竞速：请求或超时
    Promise.race([requestPromise, timeoutPromise])
      .then(resolve)
      .catch(reject)
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
  });
};

// ========== API 模块 ==========

/**
 * 项目相关API
 */
const projectAPI = {
  /**
   * 获取项目列表
   */
  list() {
    return request({ url: '/api/project/list' });
  },
  
  /**
   * 获取单个项目
   * @param {string} id - 项目ID
   */
  get(id) {
    return request({ url: `/api/project/${id}` });
  },
  
  /**
   * 创建项目
   * @param {Object} data - 项目数据
   */
  create(data) {
    return request({ url: '/api/project/create', method: 'POST', data });
  },
  
  /**
   * 删除项目
   * @param {string} id - 项目ID
   */
  delete(id) {
    return request({ url: `/api/project/${id}`, method: 'DELETE' });
  }
};

/**
 * 量体数据API
 */
const measureAPI = {
  /**
   * 获取量体列表
   * @param {string} projectId - 项目ID
   */
  list(projectId) {
    return request({ url: `/api/measure/project/${projectId}/all` });
  },
  
  /**
   * 获取单条量体数据
   * @param {string} id - 数据ID
   */
  get(id) {
    return request({ url: `/api/measure/${id}` });
  },
  
  /**
   * 创建量体数据
   * @param {Object} data - 量体数据
   */
  create(data) {
    return request({ url: '/api/measure', method: 'POST', data });
  },
  
  /**
   * 更新量体数据
   * @param {string} id - 数据ID
   * @param {Object} data - 更新数据
   * @param {string} source - 来源: 'miniprogram'(小程序) | 'admin'(后台)
   */
  update(id, data, source = 'miniprogram') {
    return request({ url: `/api/measure/${id}`, method: 'PUT', data: { ...data, source } });
  },
  
  /**
   * 删除量体数据
   * @param {string} id - 数据ID
   */
  delete(id) {
    return request({ url: `/api/measure/${id}`, method: 'DELETE' });
  },
  
  /**
   * 精确查询（按供给证号+检索号）
   * @param {string} projectId - 项目ID
   * @param {string} police_no - 供给证号
   * @param {string} name - 检索号
   */
  exactQuery(projectId, police_no, name) {
    const params = `police_no=${encodeURIComponent(police_no || '')}&name=${encodeURIComponent(name || '')}`;
    return request({ url: `/api/measure/project/${projectId}/exact?${params}` });
  },
  
  /**
   * 搜索
   * @param {string} projectId - 项目ID
   * @param {string} keyword - 关键词
   */
  search(projectId, keyword) {
    return request({ url: `/api/measure/project/${projectId}/search?keyword=${encodeURIComponent(keyword)}` });
  },
  
  /**
   * 获取项目截止时间
   * @param {string} projectId - 项目ID
   */
  getProjectDeadline(projectId) {
    return request({ url: `/api/project/${projectId}/deadline` });
  },
  
  /**
   * 获取修改历史
   * @param {string} id - 数据ID
   */
  getHistory(id) {
    return request({ url: `/api/measure/${id}/history` });
  },
  
  /**
   * 获取修改历史（别名）
   * @param {string} id - 数据ID
   */
  getModifyHistory(id) {
    return request({ url: `/api/measure/${id}/history` });
  }
};

/**
 * 服装数据API
 */
const clothingAPI = {
  /**
   * 获取服装列表
   */
  list() {
    return request({ url: '/api/clothing/list' });
  },
  
  /**
   * 获取服装尺码详情
   * @param {string} name - 服装名称
   */
  getSizes(name) {
    return request({ url: `/api/clothing/sizes/${encodeURIComponent(name)}` });
  },
  
  /**
   * 添加服装
   * @param {Object} data - 服装数据
   */
  create(data) {
    return request({ url: '/api/clothing', method: 'POST', data });
  },
  
  /**
   * 删除服装
   * @param {string} id - 服装ID
   */
  delete(id) {
    return request({ url: `/api/clothing/${id}`, method: 'DELETE' });
  }
};

module.exports = { projectAPI, measureAPI, clothingAPI };
