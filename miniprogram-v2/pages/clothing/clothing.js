// pages/clothing/clothing.js
const app = getApp();
const { measureAPI, clothingAPI } = require('../../utils/api.js');

Page({
  data: {
    id: '',
    projectId: '',
    
    // 服装数据
    clothingList: [],
    clothingRows: [],
    
    // 加载状态
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
    // 加载服装列表
    this.loadClothingList();
  },

  // 加载数据
  async loadData(id) {
    this.setData({ loading: true });
    
    try {
      const res = await measureAPI.get(id);
      const data = res.data;
      
      // 加载服装数据，同时保存量体数据用于计算推荐尺码
      let clothingRows = data.clothing_rows || [];
      // 如果是字符串，尝试解析为JSON
      if (typeof clothingRows === 'string') {
        try {
          clothingRows = JSON.parse(clothingRows);
        } catch (e) {
          clothingRows = [];
        }
      }
      this.setData({
        clothingRows: clothingRows,
        gender: data.gender,
        height: data.height,
        chest_circumference: data.chest_circumference,
        waist_circumference: data.waist || '',  // 腰围
        head_circumference: data.head || '',     // 头围
        shoe_size: data.shoe_size || '',        // 鞋号
        loading: false
      });
    } catch (err) {
      console.error('加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 加载服装列表
  async loadClothingList() {
    try {
      // 使用API获取服装列表
      const res = await clothingAPI.list();
      if (res.data && res.data.length > 0) {
        // 获取每个服装的尺码详情
        const clothingList = [];
        for (const item of res.data) {
          const sizeRes = await clothingAPI.getSizes(item.name);
          const sizes = sizeRes.data || [];
          clothingList.push({
            ...item,
            sizes: sizes
          });
        }
        this.setData({ clothingList });
        wx.setStorageSync('clothingList', clothingList);
      } else {
        // API没有数据，使用本地默认列表
        this.loadLocalClothingList();
      }
    } catch (err) {
      console.error('获取服装列表失败', err);
      // 失败时使用本地列表
      this.loadLocalClothingList();
    }
  },
  
  // 加载本地服装列表
  loadLocalClothingList() {
    let clothingList = wx.getStorageSync('clothingList') || [];
    
    if (clothingList.length === 0) {
      clothingList = [
        { id: '1', name: '春秋常服', category: '上衣', sizes: [] },
        { id: '2', name: '冬执勤服', category: '上衣', sizes: [] },
        { id: '3', name: '夏作训服', category: '上衣', sizes: [] }
      ];
      wx.setStorageSync('clothingList', clothingList);
    }
    
    this.setData({ clothingList });
  },

  // 添加服装行
  addClothingRow() {
    const { clothingRows } = this.data;
    clothingRows.push({
      name: '',
      recommendedSize: '',
      size: '',
      remark: ''
    });
    this.setData({ clothingRows });
  },

  // 删除服装行
  removeClothingRow(e) {
    const index = e.currentTarget.dataset.index;
    const { clothingRows } = this.data;
    clothingRows.splice(index, 1);
    this.setData({ clothingRows });
  },

  // 服装品名选择
  onClothingNameChange(e) {
    const index = e.currentTarget.dataset.index;
    const listIndex = e.detail.value;  // picker返回的是索引
    const { clothingRows, clothingList } = this.data;
    
    // 从完整列表中获取选中的服装
    const clothing = clothingList[listIndex];
    
    // 检查是否被其他行已选择
    const selectedNames = clothingRows
      .map((row, i) => ({ name: row.name, index: i }))
      .filter(item => item.name && item.index !== index)
      .map(item => item.name);
    
    if (clothing && selectedNames.includes(clothing.name)) {
      wx.showToast({
        title: '该服装已选择',
        icon: 'none'
      });
      return;
    }
    
    // 计算推荐尺码
    let recommendedSize = '';
    if (clothing && clothing.sizes && clothing.sizes.length > 0) {
      // 如果尺码是对象数组，使用智能推荐
      if (typeof clothing.sizes[0] === 'object') {
        recommendedSize = this.calculateRecommendedSize(clothing);
      } else {
        // 如果尺码是字符串数组，使用简单的默认推荐（第一个尺码）
        recommendedSize = clothing.sizes[0];
      }
    }
    
    clothingRows[index].name = clothing ? clothing.name : '';
    clothingRows[index].recommendedSize = recommendedSize;
    clothingRows[index].size = recommendedSize; // 默认使用推荐尺码
    
    this.setData({ clothingRows });
  },

  // 服装尺码输入
  onClothingSizeInput(e) {
    const index = e.currentTarget.dataset.index;
    const size = e.detail.value;
    const { clothingRows } = this.data;
    clothingRows[index].size = size;
    this.setData({ clothingRows });
  },

  // 服装备注输入
  onClothingRemarkInput(e) {
    const index = e.currentTarget.dataset.index;
    const remark = e.detail.value;
    const { clothingRows } = this.data;
    clothingRows[index].remark = remark;
    this.setData({ clothingRows });
  },

  // 计算推荐尺码 - 与后台管理系统逻辑一致
  // 上衣类: 性别+身高+胸围 | 下衣类: 性别+身高+腰围 | 帽类: 头围 | 鞋类: 鞋号
  calculateRecommendedSize(clothing) {
    const { gender, height, chest_circumference, waist_circumference, head_circumference, shoe_size } = this.data;
    
    if (!clothing || !clothing.name) {
      return '';
    }
    
    const category = clothing.category || '';
    const sizes = clothing.sizes || [];
    
    if (sizes.length === 0) {
      return '';
    }
    
    // 上衣类: 性别+身高+胸围
    if (category === '上衣' || category === '上装' || clothing.name.includes('T恤') || clothing.name.includes('衬衫') || clothing.name.includes('外套')) {
      if (!gender || !height || !chest_circumference) {
        return '';
      }
      const h = parseInt(height) || 0;
      const c = parseInt(chest_circumference) || 0;
      
      for (const size of sizes) {
        // 检查性别
        if (size.gender && size.gender !== gender) continue;
        
        // 检查身高范围
        if (size.height_range) {
          const hr = size.height_range.replace(/[^\d\-]/g, '').split('-');
          if (hr.length === 2) {
            if (h < parseInt(hr[0]) || h > parseInt(hr[1])) continue;
          }
        }
        
        // 检查胸围范围
        if (size.chest_range) {
          const cr = size.chest_range.replace(/[^\d\-]/g, '').split('-');
          if (cr.length === 2) {
            if (c < parseInt(cr[0]) || c > parseInt(cr[1])) continue;
          }
        }
        
        return size.size || size.name || '';
      }
    }
    // 下衣类: 性别+身高+腰围
    else if (category === '下衣' || category === '下装' || clothing.name.includes('裤') || clothing.name.includes('裙')) {
      if (!gender || !height || !waist_circumference) {
        return '';
      }
      const h = parseInt(height) || 0;
      const w = parseInt(waist_circumference) || 0;
      
      for (const size of sizes) {
        if (size.gender && size.gender !== gender) continue;
        
        if (size.height_range) {
          const hr = size.height_range.replace(/[^\d\-]/g, '').split('-');
          if (hr.length === 2) {
            if (h < parseInt(hr[0]) || h > parseInt(hr[1])) continue;
          }
        }
        
        if (size.waist_range) {
          const wr = size.waist_range.replace(/[^\d\-]/g, '').split('-');
          if (wr.length === 2) {
            if (w < parseInt(wr[0]) || w > parseInt(wr[1])) continue;
          }
        }
        
        return size.size || size.name || '';
      }
    }
    // 帽类: 头围
    else if (category === '帽类' || category === '帽子' || clothing.name.includes('帽')) {
      if (!head_circumference) {
        return '';
      }
      const hd = parseInt(head_circumference) || 0;
      
      for (const size of sizes) {
        if (size.head_range) {
          const hedr = size.head_range.replace(/[^\d\-]/g, '').split('-');
          if (hedr.length === 2) {
            if (hd < parseInt(hedr[0]) || hd > parseInt(hedr[1])) continue;
          }
        }
        return size.size || size.name || '';
      }
    }
    // 鞋类: 鞋号
    else if (category === '鞋类' || category === '鞋子' || clothing.name.includes('鞋') || clothing.name.includes('靴')) {
      if (!shoe_size) {
        return '';
      }
      const ss = String(shoe_size).trim();
      
      for (const size of sizes) {
        if (String(size.shoe_size || '').trim() === ss) {
          return size.size || size.name || '';
        }
      }
    }
    // 默认: 性别+身高+胸围 (兼容旧数据)
    else {
      if (!gender || !height || !chest_circumference) {
        return '';
      }
      const h = parseInt(height) || 0;
      const c = parseInt(chest_circumference) || 0;
      
      for (const size of sizes) {
        if (size.gender && size.gender !== gender) continue;
        
        if (size.height_range) {
          const hr = size.height_range.replace(/[^\d\-]/g, '').split('-');
          if (hr.length === 2) {
            if (h < parseInt(hr[0]) || h > parseInt(hr[1])) continue;
          }
        }
        
        if (size.chest_range) {
          const cr = size.chest_range.replace(/[^\d\-]/g, '').split('-');
          if (cr.length === 2) {
            if (c < parseInt(cr[0]) || c > parseInt(cr[1])) continue;
          }
        }
        
        return size.size || size.name || '';
      }
    }
    
    return '';
  },

  // 保存服装数据并跳转收件信息页面
  async onSave() {
    const { id, clothingRows } = this.data;
    
    if (!id) {
      wx.showToast({ title: '数据ID不存在', icon: 'none' });
      return;
    }
    
    this.setData({ saving: true });
    
    try {
      const res = await measureAPI.update(id, {
        clothing_rows: clothingRows
      });
      
      wx.showModal({
        title: '保存成功',
        content: '服装数据已保存',
        showCancel: false,
        confirmText: '确定',
        confirmColor: '#667eea',
        success: () => {
          wx.navigateTo({
            url: `/pages/detail/detail?id=${id}&projectId=${this.data.projectId}`
          });
        }
      });
    } catch (err) {
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
    
    this.setData({ saving: false });
  },

  // 返回
  goBack() {
    wx.navigateBack();
  }
});
