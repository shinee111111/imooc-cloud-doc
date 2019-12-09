const qiniu = require('qiniu');
const axios = require('axios');
const fs = require('fs');

class QiniuManager {
  // common configure
  constructor(accessKey, secretKey, bucket) { // 密+钥不同,仓库不同
    // genertate mac
    this.mac = new qiniu.auth.digest.Mac(accessKey, secretKey); // 鉴权
    this.bucket = bucket; // 仓库名

    // init config class
    this.config = new qiniu.conf.Config();
    this.config.zone = qiniu.zone.Zone_z0; // 地区机房

    // resource upload or download necessary
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, this.config); // 仓库操作实例
  }

  // 1、文件上传
  uploadFile(key, localFilePath) { // 云端文件名，本地文件路径
    // generate uploadToken
    const options = {
      scope: this.bucket + ":" + key
    };
    const putPolicy = new qiniu.rs.PutPolicy(options);
    const uploadToken = putPolicy.uploadToken(this.mac);
    const putExtra = new qiniu.form_up.PutExtra();
    const formUploader = new qiniu.form_up.FormUploader(this.config); // 上传实例

    return new Promise((resolve, reject) => {
      formUploader.putFile(uploadToken, key, localFilePath, putExtra, this._handleCallback(resolve, reject));
    });
  }

  // 2、文件删除
  deleteFile(key) {
    return new Promise((resolve, reject) => {
      this.bucketManager.delete(this.bucket, key, this._handleCallback(resolve, reject));
    });
  }

  // 3、下载文件
  downloadFile(key, downloadPath) {
    // step 1 get the download link
    // step 2 send the request to download link, return a readable stream
    // step 3 create a writeable stream and pipe to it
    // step 4 return a promise based result
    return this.generateDownloadLink(key).then(link => {
      const timeStamp = new Date().getTime();
      const url = `${link}?timeStamp=${timeStamp}`;
      return axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: { 'Cache-Control': 'no-cache' } // 防止缓存
      })
    }).then(response => {
      const writer = fs.createWriteStream(downloadPath);
      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    }).catch(err => {
      return Promise.reject({ err: err.response });
    });
  }

  // 4、重命名
  renameFile(oldKey, newKey) {
    return new Promise((resolve, reject) => {
      this.bucketManager.move(this.bucket, oldKey, this.bucket, newKey, {}, this._handleCallback(resolve, reject));
    });
  }

  // 获取仓库域名
  getBucketDomain() {
    const reqURL = `http://api.qiniu.com/v6/domain/list?tbl=${this.bucket}`;
    const digest = qiniu.util.generateAccessToken(this.mac, reqURL);
    return new Promise((resolve, reject) => {
      qiniu.rpc.postWithoutForm(reqURL, digest, this._handleCallback(resolve, reject));
    });
  }

  // 获取文件信息
  getStat(key) {
    return new Promise((resolve, reject) => {
      this.bucketManager.stat(this.bucket, key, this._handleCallback(resolve, reject));
    });
  }

  // 获取下载路径
  generateDownloadLink(key) {
    const domainPromise = this.publicBucketDomain
      ? Promise.resolve([this.publicBucketDomain])
      : this.getBucketDomain();
    return domainPromise.then(data => {
      if (Array.isArray(data) && data.length > 0) {
        const pattern = /^https?/;
        this.publicBucketDomain = pattern.test(data[0]) ? data[0] : `http://${data[0]}`;
        return this.bucketManager.publicDownloadUrl(this.publicBucketDomain, key);
      } else {
        throw Error('域名未找到,请查看存储空间是否已经过期');
      }
    });
  }

  // 获取全部文件信息
  getFileList() {
    const options = {};
    return new Promise((resolve, reject) => {
      this.bucketManager.listPrefix(this.bucket, options, this._handleCallback(resolve, reject));
    });
  }

  // 高阶函数，返回另一个函数，通用处理异步回调
  _handleCallback(resolve, reject) {
    return (respErr, respBody, respInfo) => {
      if (respErr) {
        throw respErr;
      }
      if (respInfo.statusCode === 200) {
        resolve(respBody);
      } else {
        reject({
          statusCode: respInfo.statusCode,
          body: respBody
        });
      }
    };
  }
}

module.exports = QiniuManager;