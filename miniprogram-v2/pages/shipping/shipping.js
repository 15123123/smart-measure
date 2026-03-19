// pages/shipping/shipping.js
const app = getApp();
const { measureAPI } = require('../../utils/api.js');

Page({
  data: {
    id: '',
    projectId: '',
    
    // 收件信息
    receiver_name: '',
    receiver_phone: '',
    receiver_address: '',
    
    // 状态
    loading: false,
    saving: false
  },

  onLoad(options) {
    if (options.id && options.projectId) {
      this.setData({
        id: options.id,
        projectId: options.projectId
      });
      this.loadData(options.id);
    }
  },

  // 加载数据
  async loadData(id) {
    this.setData({ loading: true });
    
    try {
      const res = await measureAPI.get(id);
      const data = res.data;
      
      this.setData({
        receiver_name: data.receiver_name || '',
        receiver_phone: data.receiver_phone || '',
        receiver_address: data.receiver_address || '',
        loading: false
      });
    } catch (err) {
      console.error('加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 输入处理
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  // 验证手机号
  validatePhone(phone) {
    if (!phone) return true; // 允许空
    const reg = /^1[3-9]\d{9}$/;
    return reg.test(phone);
  },

  // 保存收件信息并跳转信息确认页面
  async onSave() {
    const { id, projectId, receiver_name, receiver_phone, receiver_address } = this.data;
    
    if (!id) {
      wx.showToast({ title: '数据ID不存在', icon: 'none' });
      return;
    }
    
    // 验证手机号
    if (receiver_phone && !this.validatePhone(receiver_phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    
    this.setData({ saving: true });
    
    try {
      await measureAPI.update(id, {
        receiver_name,
        receiver_phone,
        receiver_address
      });
      
      wx.showToast({ title: '保存成功', icon: 'success', duration: 1000 });
      
      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/detail/detail?id=' + id + '&projectId=' + projectId
        });
      }, 1000);
      
    } catch (err) {
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败: ' + err.message, icon: 'none', duration: 2000 });
    }
    
    this.setData({ saving: false });
  },

  // 返回
  goBack() {
    wx.navigateBack();
  }
});
