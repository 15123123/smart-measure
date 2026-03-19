// pages/detail/detail.js
const app = getApp();
const { measureAPI, clothingAPI } = require('../../utils/api.js');

// 日志工具
const logger = {
  info: (...args) => console.log('[DETAIL INFO]', new Date().toISOString(), ...args),
  warn: (...args) => console.warn('[DETAIL WARN]', new Date().toISOString(), ...args),
  error: (...args) => console.error('[DETAIL ERROR]', new Date().toISOString(), ...args)
};

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
    clothingSizes: {},  // 服装尺码数据
    
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
      // 先加载服装尺码，再加载数据
      this.initPage(options.id);
    }
  },
  
  // 初始化页面：先加载尺码，再加载数据
  async initPage(id) {
    wx.showLoading({ title: '加载中...' });
    try {
      // 先加载服装尺码数据
      await this.loadClothingSizes();
      // 再加载量体数据
      await this.loadData(id);
    } finally {
      wx.hideLoading();
    }
  },
  
  // 加载服装尺码数据
  async loadClothingSizes() {
    try {
      const res = await clothingAPI.list();
      if (res.data && Array.isArray(res.data)) {
        // 构建尺码映射表
        const sizesMap = {};
        
        // 获取每个服装的尺码
        for (const item of res.data) {
          try {
            const sizeRes = await clothingAPI.getSizes(item.name);
            if (sizeRes.data) {
              sizesMap[item.name] = sizeRes.data;
            }
          } catch (e) {
            console.warn('获取尺码失败:', item.name);
          }
        }
        
        this.setData({ clothingSizes: sizesMap });
        logger.info('加载服装尺码成功:', Object.keys(sizesMap).length, '个服装');
      }
    } catch (err) {
      logger.error('加载服装尺码失败:', err.message || err);
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
    let rows = [];
    if (Array.isArray(data)) {
      rows = data;
    } else if (typeof data === 'string') {
      try {
        rows = JSON.parse(data);
      } catch (e) {
        console.error('解析clothing_rows失败:', e);
        return [];
      }
    }
    
    // 如果没有recommendedSize字段，则自动计算
    return rows.map(row => {
      if (row.name && !row.recommendedSize) {
        // 需要计算推荐尺码
        const gender = this.data.gender || '';
        const height = parseFloat(this.data.height) || 0;
        const chest = parseFloat(this.data.chest_circumference) || 0;
        const waist = parseFloat(this.data.waist_circumference) || 0;
        const head = parseFloat(this.data.head_tail) || 0;
        const shoeSize = parseFloat(this.data.shoe_size) || 0;
        
        row.recommendedSize = this.calculateRecommendedSize(row.name, gender, height, chest, waist, head, shoeSize);
      }
      return row;
    });
  },
  
  // 计算推荐尺码
  calculateRecommendedSize(clothingName, gender, height, chest, waist, head, shoeSize) {
    // 获取服装尺码数据
    const clothingSizes = this.data.clothingSizes || [];
    const sizes = clothingSizes[clothingName] || [];
    
    if (sizes.length === 0) {
      return '-';
    }
    
    // 根据服装类型匹配
    for (const s of sizes) {
      // 上衣：根据胸围和身高
      if (s.gender === gender && chest > 0) {
        const chestMin = parseFloat(s.chest_range?.split('-')[0]) || 0;
        const chestMax = parseFloat(s.chest_range?.split('-')[1]) || 999;
        if (chest >= chestMin && chest <= chestMax) {
          // 检查身高范围
          if (height > 0) {
            const heightMin = parseFloat(s.height_range?.split('-')[0]) || 0;
            const heightMax = parseFloat(s.height_range?.split('-')[1]) || 999;
            if (height >= heightMin && height <= heightMax) {
              return s.size || s.shoe_size || '-';
            }
          } else {
            return s.size || s.shoe_size || '-';
          }
        }
      }
      // 下裤：根据腰围
      else if (s.waist_range && waist > 0) {
        const waistMin = parseFloat(s.waist_range?.split('-')[0]) || 0;
        const waistMax = parseFloat(s.waist_range?.split('-')[1]) || 999;
        if (waist >= waistMin && waist <= waistMax) {
          return s.size || '-';
        }
      }
      // 帽类：根据头围
      else if (s.head_range && head > 0) {
        const headMin = parseFloat(s.head_range?.split('-')[0]) || 0;
        const headMax = parseFloat(s.head_range?.split('-')[1]) || 999;
        if (head >= headMin && head <= headMax) {
          return s.size || '-';
        }
      }
      // 鞋类：根据鞋码
      else if (s.shoe_size && shoeSize > 0) {
        const shoeMin = parseFloat(s.shoe_size?.split('-')[0]) || 0;
        const shoeMax = parseFloat(s.shoe_size?.split('-')[1]) || 999;
        if (shoeSize >= shoeMin && shoeSize <= shoeMax) {
          return s.shoe_size || '-';
        }
      }
    }
    
    // 没有匹配到就返回第一个尺码
    return sizes[0]?.size || sizes[0]?.shoe_size || '-';
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
      const res = await measureAPI.getHistory(id);
      const historyData = res.data || [];
      
      // 处理历史数据，获取变更字段
      const processedHistory = historyData.map(item => {
        if (!item) return null;
        
        const changes = [];
        const oldData = (item.old_data && typeof item.old_data === 'object') ? item.old_data : {};
        const newData = (item.new_data && typeof item.new_data === 'object') ? item.new_data : {};
        
        try {
          const allKeys = [...new Set([...Object.keys(oldData), ...Object.keys(newData)])];
          
          allKeys.forEach(key => {
            if (!key) return;
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
        } catch (e) {
          logger.warn('处理变更字段失败:', e.message);
        }
        
        return {
          id: item.id || Date.now().toString(),
          action: item.action || '修改',
          create_time: item.create_time || item.createTime || '-',
          user_id: item.user_id || '-',
          changes: changes
        };
      }).filter(item => item !== null);
      
      this.setData({
        history: processedHistory
      });
    } catch (err) {
      logger.error('加载历史失败', err.message || err);
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
