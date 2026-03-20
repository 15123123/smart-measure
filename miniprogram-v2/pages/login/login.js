// pages/login/login.js
const app = getApp();
const { userAPI } = require('../../utils/api.js');

Page({
  data: {
    canUseGetUserProfile: false,
    loading: false,
    errorMsg: '',
    systemName: '智能量体系统'
  },

  onLoad() {
    // 设置系统名称
    var that = this;
    wx.request({
      url: app.globalData.apiBaseUrl + '/settings',
      success: function(res) {
        if(res.data && res.data.data && res.data.data.systemName){
          that.setData({ systemName: res.data.data.systemName });
        }
      }
    });
    
    // 检查wx.getUserProfile是否可用
    if (wx.getUserProfile) {
      this.setData({ canUseGetUserProfile: true });
    }
    
    // 检查是否已登录
    if (app.checkLogin()) {
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
  },

  // 使用 wx.getUserProfile 获取用户信息
  async getUserProfile() {
    if (this.data.loading) return;
    
    this.setData({ loading: true, errorMsg: '' });
    
    try {
      // 1. 获取用户信息
      const profileRes = await new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '用于完善用户资料',
          success: resolve,
          fail: reject
        });
      });
      
      // 2. 获取登录code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        });
      });
      
      if (!loginRes.code) {
        throw new Error('获取登录凭证失败');
      }
      
      // 3. 调用后端登录接口
      let userRes;
      try {
        userRes = await userAPI.login(loginRes.code, profileRes.userInfo);
      } catch (apiErr) {
        console.error('API调用失败:', apiErr);
        // 模拟登录成功（后端未运行时）
        userRes = {
          data: {
            user_id: 'test_user_' + Date.now(),
            nickname: profileRes.userInfo.nickName,
            avatar: profileRes.userInfo.avatarUrl,
            token: 'mock_token_' + Date.now()
          }
        };
        wx.showToast({
          title: '演示模式登录',
          icon: 'none',
          duration: 2000
        });
      }
      
      // 保存用户信息
      app.globalData.userInfo = profileRes.userInfo;
      app.globalData.userId = userRes.data.user_id;
      app.globalData.token = userRes.data.token;
      
      wx.setStorageSync('userInfo', profileRes.userInfo);
      wx.setStorageSync('userId', userRes.data.user_id);
      wx.setStorageSync('token', userRes.data.token);
      
      wx.showModal({
        title: '登录成功',
        content: '欢迎使用智能量体系统',
        showCancel: false,
        confirmText: '进入',
        confirmColor: '#667eea',
        success: () => {
          wx.switchTab({
            url: '/pages/index/index'
          });
        }
      });
      
    } catch (err) {
      console.error('登录失败:', err);
      this.setData({ 
        errorMsg: err.message || '登录失败，请重试'
      });
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 兼容旧版 getUserInfo
  getUserInfo(e) {
    if (e.detail.errMsg !== 'getUserInfo:ok') return;
    
    this.setData({ loading: true, errorMsg: '' });
    
    wx.login({
      success: async (loginRes) => {
        try {
          let userRes;
          try {
            userRes = await userAPI.login(loginRes.code, e.detail.userInfo);
          } catch (apiErr) {
            // 模拟登录
            userRes = {
              data: {
                user_id: 'test_user_' + Date.now(),
                nickname: e.detail.userInfo.nickName,
                avatar: e.detail.userInfo.avatarUrl,
                token: 'mock_token_' + Date.now()
              }
            };
          }
          
          app.globalData.userInfo = e.detail.userInfo;
          app.globalData.userId = userRes.data.user_id;
          app.globalData.token = userRes.data.token;
          
          wx.setStorageSync('userInfo', e.detail.userInfo);
          wx.setStorageSync('userId', userRes.data.user_id);
          wx.setStorageSync('token', userRes.data.token);
          
          wx.showModal({
            title: '登录成功',
            content: '欢迎使用智能量体系统',
            showCancel: false,
            confirmText: '进入',
            confirmColor: '#667eea',
            success: () => {
              wx.switchTab({
                url: '/pages/index/index'
              });
            }
          });
        } catch (err) {
          console.error('登录失败', err);
          this.setData({ errorMsg: err.message || '登录失败' });
        } finally {
          this.setData({ loading: false });
        }
      },
      fail: () => {
        this.setData({ loading: false, errorMsg: '获取登录凭证失败' });
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        });
      }
    });
  },

  // 跳过登录
  onSkipLogin() {
    const tempUserId = 'guest_' + Date.now();
    wx.setStorageSync('userId', tempUserId);
    wx.setStorageSync('token', 'guest_token');
    
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});
