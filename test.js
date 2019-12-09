const QiniuManager = require('./src/utils/QiniuManager');
const path = require('path');

const accessKey = 'YnK9N_HM77GbAB5LXKFnCX986qIjLPbqd3mm6CyS';
const secretKey = 'cBfND1HPjwHNUOPDqaFkny66oSkQjntxLMyveCG4';
const bucket = 'imooc-cloud-doc';

// const localFile = "C:\\Users\\lenovo\\Desktop\\killer.md";
const key = 'shou2.md';
const downloadPath = path.join(__dirname, key)
const manager = new QiniuManager(accessKey, secretKey, bucket);

const key2 = '胖胖的第二天.md';
const localFile2 = path.join(__dirname, 'static/用户自定义文件夹', key2);

// 下载文件
// manager.downloadFile(key, downloadPath).then(() => {
//   console.log('下载写入文件完毕');
// }).catch(err => {
//   console.error(err);
// });

// 上传文件
// manager.uploadFile(key2, localFile2).then((data) => {
//   console.log('上传成功: ', data);
// });

// 删除文件
// manager.deleteFile(key).then((data) => {
//   console.log('删除成功: ', data);
// });

// 获取仓库名称
// manager.getBucketDomain().then((data) => {
//   console.log(data);
// });

// 获取文件下载链接
// manager.generateDownloadLink(key).then(data => {
//   console.log(data);
// });

// 获取文件信息
// manager.getStat('胖胖的第二天.md').then(data => {
//   console.log(data);
// });

// 重命名文件
// manager.renameFile('test1234.md', 'test172.md').then(resp => {
//   console.log(resp);
// })

// 获取全部文件信息
// manager.getFileList().then(({ items: list }) => {
//   console.log(list);
// });