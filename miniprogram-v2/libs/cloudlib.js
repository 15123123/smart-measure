// libs/cloudlib.js - 云托管调用库
const cloud = {
  callContainer: (options) => {
    return new Promise((resolve, reject) => {
      const defaultOptions = {
        config: {
          env: 'prod-2g2msnzi7f0f35d7'
        },
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      };
      
      wx.cloud.callContainer(Object.assign({}, defaultOptions, options));
    });
  }
};

module.exports = cloud;
