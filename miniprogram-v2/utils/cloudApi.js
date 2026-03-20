// utils/cloudApi.js - 云托管HTTP调用封装

const CLOUD_RUN_URL = 'https://koa-fl1j-229656-4-1408215646.sh.run.tcloudbase.com';

const cloudApi = {
  // 调用云托管API
  call(path, method = 'GET', data = {}) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${CLOUD_RUN_URL}${path}`,
        method,
        data,
        header: { 'Content-Type': 'application/json' },
        success: (res) => {
          if (res.data.code === 0) {
            resolve(res.data);
          } else {
            wx.showToast({ title: res.data.message || '请求失败', icon: 'none' });
            reject(res.data);
          }
        },
        fail: (err) => {
          wx.showToast({ title: '网络错误', icon: 'none' });
          reject(err);
        }
      });
    });
  },
  
  // 获取项目列表
  getProjects() {
    return this.call('/api/project/list');
  },
  
  // 搜索量体数据
  searchMeasure(keyword) {
    return this.call('/api/measure/search/' + keyword);
  },
  
  // 获取量体数据
  getMeasure(id) {
    return this.call('/api/measure/' + id);
  },
  
  // 创建量体数据
  createMeasure(data) {
    return this.call('/api/measure', 'POST', data);
  },
  
  // 更新量体数据
  updateMeasure(id, data) {
    return this.call('/api/measure/' + id, 'PUT', data);
  },
  
  // 获取项目量体数据
  getProjectMeasure(projectId) {
    return this.call('/api/measure/project/' + projectId + '/all');
  },
  
  // 管理员登录
  adminLogin(username, password) {
    return this.call('/api/admin/login', 'POST', { username, password });
  }
};

module.exports = cloudApi;
