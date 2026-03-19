// 小程序入口文件
/**
 * 微信小程序 - 智能量体系统
 * 正式环境配置
 */

// 日志工具
const logger = {
  info: (...args) => console.log('[APP INFO]', new Date().toISOString(), ...args),
  warn: (...args) => console.warn('[APP WARN]', new Date().toISOString(), ...args),
  error: (...args) => console.error('[APP ERROR]', new Date().toISOString(), ...args)
};

App({
  // 全局数据
  globalData: {
    userInfo: null,
    userId: null,
    token: null,
    // 微信云托管API地址
    apiBaseUrl: 'https://koa-l3a0-229656-4-1408215646.sh.run.tcloudbase.com',
    currentProjectId: null,
    systemName: '智能量体系统',
    isHarmonyOS: false,
    // 云开发环境ID
    cloudEnv: 'prod-2g2msnzi7f0f35d7'
  },

  /**
   * 小程序初始化
   */
  onLaunch(options) {
    logger.info('应用启动，参数:', options);
    
    // 初始化云开发
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: this.globalData.cloudEnv,
          traceUser: true
        });
        logger.info('云开发初始化成功');
      } catch (err) {
        logger.error('云开发初始化失败:', err.message || err);
      }
    } else {
      logger.warn('当前环境不支持云开发');
    }
    
    // 检测HarmonyOS
    this.checkHarmonyOS();
    
    // 获取系统设置
    this.getSettings();
    
    // 扫码进入项目
    if (options?.query?.projectId) {
      this.globalData.currentProjectId = options.query.projectId;
      logger.info('扫码进入项目:', options.query.projectId);
    }
  },

  /**
   * 检测HarmonyOS设备
   */
  checkHarmonyOS() {
    try {
      const deviceInfo = wx.getDeviceInfo();
      if (deviceInfo?.platform === 'ohos') {
        this.globalData.isHarmonyOS = true;
        logger.info('检测到HarmonyOS设备');
      }
    } catch (err) {
      logger.warn('检测设备信息失败:', err.message || err);
    }
  },

  /**
   * 小程序显示（从后台切换到前台）
   */
  onShow(options) {
    logger.info('应用显示，参数:', options);
    
    // 扫码进入项目
    if (options?.query?.projectId) {
      this.globalData.currentProjectId = options.query.projectId;
      logger.info('扫码进入项目:', options.query.projectId);
    }
  },

  /**
   * 获取系统设置（云数据库）
   */
  getSettings() {
    // 检查云开发是否可用
    if (!wx.cloud) {
      logger.warn('云开发不可用，跳过获取系统设置');
      return;
    }
    
    try {
      const db = wx.cloud.database();
      db.collection('settings').doc('system').get({
        success: (res) => {
          if (res?.data?.systemName) {
            this.globalData.systemName = res.data.systemName;
            logger.info('加载系统设置:', res.data.systemName);
            
            // 更新导航栏标题
            wx.setNavigationBarTitle({
              title: res.data.systemName
            });
          }
        },
        fail: (err) => {
          logger.warn('获取系统设置失败:', err.message || err);
        }
      });
    } catch (err) {
      logger.error('获取系统设置异常:', err.message || err);
    }
  },

  /**
   * 获取用户信息
   * @returns {Promise<Object>} 用户信息
   */
  getUserInfo() {
    return new Promise((resolve, reject) => {
      // 优先使用全局数据中的用户信息
      if (this.globalData.userInfo) {
        resolve(this.globalData.userInfo);
        return;
      }
      
      // 从本地存储获取
      try {
        const userInfo = wx.getStorageSync('userInfo');
        const userId = wx.getStorageSync('userId');
        
        if (userInfo && userId) {
          this.globalData.userInfo = userInfo;
          this.globalData.userId = userId;
          resolve(userInfo);
        } else {
          reject(new Error('未登录'));
        }
      } catch (err) {
        logger.error('读取用户信息失败:', err.message || err);
        reject(err);
      }
    });
  },

  /**
   * 检查登录状态
   * @returns {boolean} 是否已登录
   */
  checkLogin() {
    const hasUserId = !!wx.getStorageSync('userId');
    logger.info('登录状态检查:', hasUserId ? '已登录' : '未登录');
    return hasUserId;
  }
});
