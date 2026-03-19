// pages/detail/detail.js
const app = getApp();
const { measureAPI } = require('../../utils/api.js');

Page({
  data: {
    id: '',
    projectId: '',
    projectName: '',
    loading: true,
    
    // 基本信息
    name: '',
    supplyNo: '',
    searchNo: '',
    gender: '',
    
    // 量体数据
    height: '',
    weight: '',
    head_tail: '',
    neck_circumference: '',
    shoulder_width: '',
    chest_circumference: '',
    waist_circumference: '',
    hip_circumference: '',
    pants_length: '',
    shoe_size: '',
    remark: '',
    
    // 服装数据
    clothingRows: [],
    
    // 收件信息
    receiver_name: '',
    receiver_phone: '',
    receiver_address: '',
    
    // 修改历史
    history: [],
    showHistory: false,
    
    // 当前查看的详情
    selectedHistory: null,
    showCompare: false
  },

  onLoad(options) {
    if (options.id && options.projectId) {
      this.setData({
        id: options.id,
        projectId: options.projectId,
        projectName: decodeURIComponent(options.projectName || '')
      });
      wx.setNavigationBarTitle({ title: '信息详情' });
      this.loadData(options.id);
    }
  },

  async loadData(id) {
    this.setData({ loading: true });
    
    try {
      const res = await measureAPI.get(id);
      const data = res.data;
      
      // 基本信息
      this.setData({
        name: data.name || data.search_no || '-',
        supplyNo: data.supply_no || data.police_no || '-',
        searchNo: data.search_no || data.name || '-',
        gender: data.gender || '-',
        
        // 量体数据 - 使用多种可能的字段名
        height: data.height || '-',
        weight: data.weight || '-',
        head_tail: data.head_tail || data.head || '-',
        neck_circumference: data.neck_circumference || data.neck || '-',
        shoulder_width: data.shoulder_width || data.shoulder || '-',
        sleeve_length: data.sleeve_length || data.sleeve || '-',
        chest_circumference: data.chest_circumference || data.chest || '-',
        waist_circumference: data.waist_circumference || data.waist || '-',
        hip_circumference: data.hip_circumference || data.hip || '-',
        pants_length: data.pants_length || data.bottom_length || '-',
        shoe_size: data.shoe_size || '-',
        remark: data.remark || '-',
        
        // 服装数据 - 处理多种格式
        clothingRows: this.parseClothingRows(data.clothing_rows),
        
        // 收件信息
        receiver_name: data.receiver_name || data.receiver || '-',
        receiver_phone: data.receiver_phone || data.phone || '-',
        receiver_address: data.receiver_address || data.address || '-',
        
        loading: false
      });
      
      // 加载历史记录
      this.loadHistory(id);
      
    } catch (err) {
      console.error('加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },
  
  // 解析服装数据
  parseClothingRows(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        console.error('解析clothing_rows失败:', e);
        return [];
      }
    }
    return [];
  },

  // 字段名中文映射
  fieldNameCN: {
    'name': '检索号',
    'police_no': '供给证号',
    'gender': '性别',
    'height': '身高',
    'weight': '体重',
    'head_tail': '头围',
    'neck_circumference': '颈围',
    'shoulder_width': '肩宽',
    'chest_circumference': '胸围',
    'waist_circumference': '腰围',
    'hip_circumference': '臀围',
    'pants_length': '裤长',
    'shoe_size': '鞋码',
    'remark': '备注',
    'clothing_rows': '服装数据',
    'receiver_name': '收件人',
    'receiver_phone': '联系电话',
    'receiver_address': '收件地址',
    'status': '状态',
    'user_id': '操作人'
  },

  // 获取字段中文名
  getFieldNameCN(field) {
    if (!field) return '-';
    return this.fieldNameCN[field] || field;
  },

  // 加载历史
  async loadHistory(id) {
    try {
      const res = await measureAPI.getModifyHistory(id);
      const historyData = res.data || [];
      
      // 处理历史数据，获取变更字段
      const processedHistory = historyData.map(item => {
        const changes = [];
        const oldData = item.old_data || {};
        const newData = item.new_data || {};
        
        const allKeys = [...new Set([...Object.keys(oldData), ...Object.keys(newData)])];
        
        allKeys.forEach(key => {
          const oldVal = oldData[key];
          const newVal = newData[key];
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes.push({
              field: this.getFieldNameCN(key),
              oldValue: this.formatValue(oldVal),
              newValue: this.formatValue(newVal)
            });
          }
        });
        
        return {
          ...item,
          changes: changes,
          user_id: item.user_id || '-'
        };
      });
      
      this.setData({
        history: processedHistory
      });
    } catch (err) {
      console.error('加载历史失败', err);
      this.setData({ history: [] });
    }
  },

  // 格式化值显示
  formatValue(val) {
    if (val === null || val === undefined || val === '') return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  },

  // 切换历史显示
  toggleHistory() {
    this.setData({
      showHistory: !this.data.showHistory,
      selectedHistory: null,
      showCompare: false
    });
  },

  // 查看历史详情对比
  showHistoryDetail(e) {
    const index = e.currentTarget.dataset.index;
    const historyItem = this.data.history[index];
    
    this.setData({
      selectedHistory: historyItem,
      showCompare: true
    });
  },

  // 关闭对比弹窗
  closeCompare() {
    this.setData({
      showCompare: false,
      selectedHistory: null
    });
  },

  // 阻止事件冒泡
  stopPropagation() {},

  // 返回首页
  goHome() {
    wx.reLaunch({
      url: '/pages/index/index'
    });
  }
});
