const { remote, ipcRenderer } = require('electron');
const Store = require('electron-store');
const settingsStore = new Store({ name: 'Settings' });
const qiniuConfigArr = ['#savedFileLocation', '#accessKey', '#secretKey', '#bucketName'];

const $ = (selector) => {
  const result = document.querySelectorAll(selector);
  return result.length > 1 ? result : result[0];
};

document.addEventListener('DOMContentLoaded', () => {
  // 初始化数据
  qiniuConfigArr.forEach(selector => {
    const savedValue = settingsStore.get(selector.substr(1));
    if (savedValue) {
      $(selector).value = savedValue;
    }
  });

  // 选择路径
  $('#select-new-location').addEventListener('click', () => {
    remote.dialog.showOpenDialog({
      properties: ['openDirectory'],
      message: '选择文件的存储路径'
    }).then(({ filePaths: [path] }) => {
      if (!path) {
        return;
      }
      $('#savedFileLocation').value = path;
    });
  });

  // 保存路径
  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    qiniuConfigArr.forEach(selector => {
      let { id, value } = $(selector);
      settingsStore.set(id, value ? value : '');
    });
    // sent a event back to main process to enable menu items if qiniu is configed
    ipcRenderer.send('config-is-saved');
    remote.getCurrentWindow().close(); // 获取当前渲染进程窗口，关闭
  });

  // 切换选项卡
  $('.nav-tabs').addEventListener('click', (e) => {
    e.preventDefault();
    // 选项卡移除active
    $('.nav-link').forEach(element => {
      element.classList.remove('active');
    });
    // 选项卡添加active
    e.target.classList.add('active');
    // 内容全部display: none
    $('.config-area').forEach(element => {
      element.style.display = 'none';
    });
    // 将data-tab对应的tab显示出来
    $(e.target.dataset.tab).style.display = 'block';
  });
});
