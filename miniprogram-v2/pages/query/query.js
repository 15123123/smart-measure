// pages/query/query.js
const app = getApp();
const { measureAPI } = require('../../utils/api.js');

Page({
  data: {
    id: '',
    projectId: '',
    projectName: '',
    loading: true,
    
    // 核心信息
    supplyNo: '',  // 供给证号
    searchNo: '',  // 检索号
    name: '',      // 姓名
    
    // 其他信息
    gender: '',
    height: '',
    weight: '',
    top_size: '',
    bottom_size: '',
    receiver_name: '',
    receiver_phone: '',
    receiver_address: ''
  },

  onLoad(options) {
    if (options.id && options.projectId) {
      this.setData({
        id: options.id,
        projectId: options.projectId,
        projectName: decodeURIComponent(options.projectName || '')
      });
      wx.setNavigationBarTitle({ title: '信息确认' });
      this.loadData(options.id);
    }
  },

  async loadData(id) {
    this.setData({ loading: true });
    
    try {
      const res = await measureAPI.get(id);
      const data = res.data;
      
      this.setData({
        supplyNo: data.supply_no || '-',  // 供给证号
        searchNo: data.search_no || '-',  // 检索号
        name: data.name || '-',           // 姓名
        gender: data.gender || '-',
        height: data.height || '-',
        weight: data.weight || '-',
        top_size: data.top_size || '-',
        bottom_size: data.bottom_size || '-',
        receiver_name: data.receiver_name || '',
        receiver_phone: data.receiver_phone || '',
        receiver_address: data.receiver_address || '',
        loading: false
      });
    } catch (err) {
      console.error('加载失败', err);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 进入详情页面
  goToDetail() {
    wx.navigateTo({
      url: '/pages/detail/detail?id=' + this.data.id + '&projectId=' + this.data.projectId
    });
  },

  // 返回首页
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});
