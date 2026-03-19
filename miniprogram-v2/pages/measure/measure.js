// pages/measure/measure.js
/**
 * 量体页面 - 数据录入
 * 代码规范改进版 (v2)
 */
const app = getApp();
const { measureAPI } = require('../../utils/api.js');

// 日志工具
const logger = {
  info: (...args) => console.log('[INFO]', new Date().toISOString(), ...args),
  warn: (...args) => console.warn('[WARN]', new Date().toISOString(), ...args),
  error: (...args) => console.error('[ERROR]', new Date().toISOString(), ...args)
};

Page({
  data: {
    id: '',
    projectId: '',
    loading: false,
    saving: false,
    
    // 基本信息
    supply_no: '',
    search_no: '',
    name: '',
    gender: '',
    
    // 量体数据
    height: '',
    weight: '',
    head_tail: '',
    neck_circumference: '',
    shoulder_width: '',
    chest_circumference: '',
    waist_circumference: '',
    sleeve_length: '',
    hip_circumference: '',
    pants_length: '',
    shoe_size: '',
    
    // 备注
    remark: '',
    
    // 项目状态
    projectClosed: false,
    deadline: ''
  },

  /**
   * 页面加载
   */
  onLoad(options) {
    // 参数校验
    const { id, projectId } = options;
    
    if (!id || !projectId) {
      logger.error('缺少必要参数:', { id, projectId });
      wx.showToast({
        title: '参数错误',
        icon: 'none',
        duration: 2000
      });
      // 延迟返回
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
      return;
    }
    
    this.setData({ id, projectId });
    this.loadData(id);
    this.checkProjectDeadline();
  },

  /**
   * 检查项目是否已截止
   */
  async checkProjectDeadline() {
    try {
      const projectRes = await measureAPI.getProjectDeadline(this.data.projectId);
      
      if (projectRes?.data?.deadline) {
        const deadlineDate = new Date(projectRes.data.deadline);
        const now = new Date();
        
        if (now > deadlineDate) {
          this.setData({
            projectClosed: true,
            deadline: projectRes.data.deadline
          });
          logger.info(`项目已截止，截止时间: ${projectRes.data.deadline}`);
          wx.showToast({
            title: '⚠️ 项目已截止',
            icon: 'none',
            duration: 3000
          });
        }
      }
    } catch (err) {
      logger.warn('获取项目截止时间失败:', err.message || err);
    }
  },

  /**
   * 加载量体数据
   * @param {string} id - 数据ID
   */
  async loadData(id) {
    this.setData({ loading: true, errorMsg: '' });
    wx.showLoading({ title: '加载中...' });
    
    try {
      const res = await measureAPI.get(id);
      
      if (!res?.data) {
        throw new Error('数据不存在');
      }
      
      const data = res.data;
      
      // 安全地设置数据，避免 undefined
      this.setData({
        supply_no: data.supply_no ?? '',
        search_no: data.search_no ?? '',
        name: data.name ?? '',
        gender: data.gender ?? '',
        height: this.toString(data.height),
        weight: this.toString(data.weight),
        head_tail: this.toString(data.head_tail),
        neck_circumference: this.toString(data.neck_circumference),
        shoulder_width: this.toString(data.shoulder_width),
        chest_circumference: this.toString(data.chest_circumference),
        waist_circumference: this.toString(data.waist_circumference),
        sleeve_length: this.toString(data.sleeve_length),
        hip_circumference: this.toString(data.hip_circumference),
        pants_length: this.toString(data.pants_length),
        shoe_size: this.toString(data.shoe_size),
        remark: data.remark ?? '',
        loading: false
      });
      
      logger.info(`加载数据成功: ${data.name || data.search_no || '未知姓名'}`);
      
    } catch (err) {
      logger.error('加载量体数据失败:', err.message || err);
      wx.showToast({
        title: '加载失败',
        icon: 'none',
        duration: 2000
      });
      this.setData({ loading: false });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 安全转换为字符串
   * @param {any} value - 值
   * @returns {string} 字符串值
   */
  toString(value) {
    if (value === undefined || value === null) return '';
    return String(value);
  },

  /**
   * 安全转换为数字
   * @param {any} value - 值
   * @returns {number|null} 数字或null
   */
  toNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  },

  /**
   * 输入事件处理
   */
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({ [field]: value });
  },

  /**
   * 性别选择
   */
  onGenderSelect(e) {
    const gender = e.currentTarget.dataset.gender;
    this.setData({ gender });
  },

  /**
   * 保存数据
   * @param {string} userIdType - 用户ID类型: 'onsite' | 'offsite'
   */
  async saveData(userIdType) {
    // 项目截止检查
    if (this.data.projectClosed) {
      wx.showToast({
        title: '项目已截止，无法保存',
        icon: 'none'
      });
      return;
    }
    
    // 输入校验
    if (!this.data.supply_no && !this.data.search_no) {
      wx.showToast({
        title: '请输入供给证号或检索号',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    
    try {
      // 获取或生成用户ID
      let userId = wx.getStorageSync('userId');
      if (!userId) {
        userId = `guest_${Date.now()}`;
        wx.setStorageSync('userId', userId);
      }
      
      // 根据确认类型设置user_id
      let finalUserId = userId;
      if (userIdType === 'onsite') {
        finalUserId = 'admin_onsite';
      } else if (userIdType === 'offsite') {
        finalUserId = 'admin_offsite';
      }
      
      // 准备更新数据
      const updateData = {
        supply_no: this.data.supply_no,
        search_no: this.data.search_no,
        name: this.data.name,
        gender: this.data.gender,
        height: this.toNumber(this.data.height),
        weight: this.toNumber(this.data.weight),
        head_tail: this.toNumber(this.data.head_tail),
        neck_circumference: this.toNumber(this.data.neck_circumference),
        shoulder_width: this.toNumber(this.data.shoulder_width),
        chest_circumference: this.toNumber(this.data.chest_circumference),
        waist_circumference: this.toNumber(this.data.waist_circumference),
        sleeve_length: this.toNumber(this.data.sleeve_length),
        hip_circumference: this.toNumber(this.data.hip_circumference),
        pants_length: this.toNumber(this.data.pants_length),
        shoe_size: this.toNumber(this.data.shoe_size),
        remark: this.data.remark,
        user_id: finalUserId,
        status: 'confirmed'
      };
      
      await measureAPI.update(this.data.id, updateData);
      
      logger.info(`保存成功: userId=${finalUserId}, dataId=${this.data.id}`);
      
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });
      
      // 保存成功后跳转到服装页面
      setTimeout(() => {
        wx.navigateTo({
          url: `/pages/clothing/clothing?id=${this.data.id}&projectId=${this.data.projectId}`
        });
      }, 1500);
      
    } catch (err) {
      logger.error('保存失败:', err.message || err);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },

  /**
   * 现场确认保存
   */
  onSiteConfirm() {
    this.saveData('onsite');
  },

  /**
   * 非现场确认保存
   */
  onOffSiteConfirm() {
    this.saveData('offsite');
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack();
  }
});
