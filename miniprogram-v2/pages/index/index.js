// pages/index/index.js
/**
 * 首页 - 项目列表和量体搜索
 * 代码规范改进版 (v2)
 */
const app = getApp();
const { projectAPI, measureAPI } = require('../../utils/api.js');

// 日志工具
const logger = {
  info: (...args) => console.log('[INFO]', new Date().toISOString(), ...args),
  warn: (...args) => console.warn('[WARN]', new Date().toISOString(), ...args),
  error: (...args) => console.error('[ERROR]', new Date().toISOString(), ...args)
};

Page({
  data: {
    projects: [],
    loading: true,
    searchText: '',
    searchLoading: false,
    errorMsg: '',
    matchedData: null,
    matchedProject: null,
    systemName: '智能量体系统'
  },

  /**
   * 页面加载
   */
  onLoad() {
    this.loadSettings();
    this.loadData();
  },

  /**
   * 加载系统设置
   */
  async loadSettings() {
    try {
      const res = await wx.request({
        url: `${app.globalData.apiBaseUrl}/api/settings`,
        timeout: 10000, // 请求超时10秒
        method: 'GET'
      });
      
      if (res.data?.data?.systemName) {
        this.setData({ systemName: res.data.data.systemName });
      }
    } catch (err) {
      logger.error('加载系统设置失败:', err.message || err);
      // 设置失败不影响主流程，使用默认名称
    }
  },

  /**
   * 加载项目列表
   */
  async loadData() {
    try {
      // 显示加载状态
      this.setData({ loading: true, errorMsg: '' });
      
      const res = await projectAPI.list();
      
      if (res.data && Array.isArray(res.data)) {
        this.setData({
          projects: res.data,
          loading: false
        });
        logger.info(`加载了 ${res.data.length} 个项目`);
      } else {
        this.setData({
          projects: [],
          loading: false,
          errorMsg: '项目数据格式异常'
        });
      }
    } catch (err) {
      logger.error('加载项目列表失败:', err.message || err);
      this.setData({
        loading: false,
        errorMsg: '加载失败，请检查网络连接'
      });
      wx.showToast({
        title: '加载失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 搜索框输入事件
   */
  onSearchInput(e) {
    this.setData({
      searchText: e.detail.value,
      errorMsg: '',
      matchedData: null,
      matchedProject: null
    });
  },

  /**
   * 清除搜索
   */
  onClearSearch() {
    this.setData({
      searchText: '',
      errorMsg: '',
      matchedData: null,
      matchedProject: null
    });
  },

  /**
   * 判断输入类型：数字/字母=供给证号，中文=检索号
   * @param {string} input - 用户输入
   * @returns {string} 输入类型: 'police_no' | 'name' | 'both'
   */
  getSearchType(input) {
    const trimmed = (input || '').trim();
    
    // 空输入
    if (!trimmed) {
      return 'both';
    }
    
    // 如果包含中文，认为是检索号
    if (/[\u4e00-\u9fa5]/.test(trimmed)) {
      return 'name';
    }
    
    // 如果是纯数字或字母组合，认为是供给证号
    if (/^[a-zA-Z0-9]+$/.test(trimmed)) {
      return 'police_no';
    }
    
    // 混合输入，默认按供给证号+检索号组合搜索
    return 'both';
  },

  /**
   * 执行搜索
   */
  async onSearch() {
    const { projects, searchText } = this.data;
    const trimmed = (searchText || '').trim();
    
    // 输入校验
    if (!trimmed) {
      this.setData({ errorMsg: '请输入供给证号或检索号' });
      return;
    }
    
    if (!projects || projects.length === 0) {
      this.setData({ errorMsg: '暂无可用项目' });
      return;
    }
    
    // 开始搜索，显示loading
    this.setData({
      searchLoading: true,
      errorMsg: '',
      matchedData: null,
      matchedProject: null
    });
    
    wx.showLoading({ title: '搜索中...' });
    
    const searchType = this.getSearchType(trimmed);
    logger.info('[搜索类型]', searchType, '输入:', trimmed);
    
    try {
      // 在所有项目中精确搜索
      for (const project of projects) {
        try {
          let res;
          
          if (searchType === 'police_no') {
            // 按供给证号精确查询
            res = await measureAPI.exactQuery(project.id, trimmed, '');
          } else if (searchType === 'name') {
            // 按检索号精确查询
            res = await measureAPI.exactQuery(project.id, '', trimmed);
          } else {
            // 混合输入，同时查询
            res = await measureAPI.exactQuery(project.id, trimmed, trimmed);
          }
          
          if (res?.data?.id) {
            // 找到精确匹配
            wx.hideLoading();
            this.setData({
              searchLoading: false,
              matchedData: res.data,
              matchedProject: project
            });
            logger.info(`精确匹配成功: 项目=${project.name}, 姓名=${res.data.name || res.data.search_no}`);
            return;
          }
        } catch (err) {
          logger.warn(`项目[${project.name}]精确查询失败:`, err.message || err);
        }
      }
      
      // 精确查询没找到，尝试模糊搜索
      logger.info('精确匹配未找到，开始模糊搜索...');
      
      for (const project of projects) {
        try {
          const res = await measureAPI.search(project.id, trimmed);
          
          if (res?.data && res.data.length > 0) {
            // 取第一个匹配结果
            wx.hideLoading();
            this.setData({
              searchLoading: false,
              matchedData: res.data[0],
              matchedProject: project
            });
            logger.info(`模糊匹配成功: 项目=${project.name}, 姓名=${res.data[0].name || res.data[0].search_no}`);
            return;
          }
        } catch (err) {
          logger.warn(`项目[${project.name}]模糊搜索失败:`, err.message || err);
        }
      }
      
      // 未找到任何匹配
      wx.hideLoading();
      this.setData({
        searchLoading: false,
        errorMsg: '未找到匹配记录，请检查输入是否正确'
      });
      logger.info('搜索完成，未找到匹配记录');
      
    } catch (err) {
      wx.hideLoading();
      logger.error('搜索过程发生异常:', err.message || err);
      this.setData({
        searchLoading: false,
        errorMsg: '搜索失败，请稍后重试'
      });
      wx.showToast({
        title: '搜索失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 确认选择，进入量体页面
   */
  onConfirm() {
    const { matchedData, matchedProject } = this.data;
    
    if (!matchedData || !matchedProject) {
      wx.showToast({
        title: '请先搜索并选择记录',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 参数校验
    const id = matchedData.id || matchedData._id;
    const projectId = matchedProject.id || matchedProject._id;
    
    if (!id || !projectId) {
      logger.error('数据缺少必要字段:', { matchedData, matchedProject });
      wx.showToast({
        title: '数据异常，请重新搜索',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    logger.info('进入量体页面:', { id, projectId, name: matchedData.name || matchedData.search_no });
    
    // 跳转到量体页面
    wx.navigateTo({
      url: `/pages/measure/measure?id=${id}&projectId=${projectId}`
    });
  },

  /**
   * 重置搜索
   */
  onReset() {
    this.setData({
      searchText: '',
      errorMsg: '',
      matchedData: null,
      matchedProject: null
    });
  }
});
