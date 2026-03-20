// pages/address/address.js
const app = getApp();
const { measureAPI } = require('../../utils/api.js');

Page({
  data: {
    measureId: '',
    projectId: '',
    loading: false,
    saving: false,
    
    // 收件信息
    receiver_name: '',
    receiver_phone: '',
    receiver_address: '',
    
    // 原量体数据（用于显示）
    name: '',
    top_size: '',
    bottom_size: ''
  },

  onLoad(options) {
    if (options.id && options.projectId) {
      this.setData({
        measureId: options.id,
        projectId: options.projectId
      });
      this.loadData(options.id);
    } else {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  // 加载数据
  async loadData(id) {
    this.setData({ loading: true });
    
    try {
      const res = await measureAPI.get(id);
      const data = res.data;
      
      this.setData({
        name: data.name || '',
        top_size: data.top_size || '',
        bottom_size: data.bottom_size || '',
        receiver_name: data.receiver_name || '',
        receiver_phone: data.receiver_phone || '',
        receiver_address: data.receiver_address || ''
      });
    } catch (err) {
      console.error('加载失败', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  // 输入处理
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [field]: e.detail.value
    });
  },

  // 保存收件信息
  async onSave() {
    const { measureId, receiver_name, receiver_phone, receiver_address } = this.data;
    
    if (!receiver_name || !receiver_phone || !receiver_address) {
      wx.showToast({
        title: '请填写完整的收件信息',
        icon: 'none'
      });
      return;
    }
    
    // 简单的手机号验证
    if (!/^1[3-9]\d{9}$/.test(receiver_phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ saving: true });
    
    try {
      const userId = wx.getStorageSync('userId');
      
      await measureAPI.saveAddress(measureId, {
        receiver_name,
        receiver_phone,
        receiver_address,
        user_id: userId
      });
      
      wx.showModal({
        title: '保存成功',
        content: '收件信息已保存',
        showCancel: false,
        confirmText: '确定',
        confirmColor: '#667eea',
        success: () => {
          wx.navigateTo({
            url: '/pages/clothing/clothing?id=' + measureId + '&projectId=' + this.data.projectId
          });
        }
      });
    } catch (err) {
      console.error('保存失败', err);
    } finally {
      this.setData({ saving: false });
    }
  }
});
