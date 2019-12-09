const { app, Menu, ipcMain, dialog } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const menuTemplate = require('./src/menuTemplate');
const AppWindow = require('./src/AppWindow');
const Store = require('electron-store');
const QiniuManager = require('./src/utils/QiniuManager');
const uuidv4 = require('uuid/v4');
const { flattenArr, objToArr } = require('./src/utils/mainHelper');
const settingsStore = new Store({ name: 'Settings' });
const fileStore = new Store({ name: 'Files Data' });
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
let mainWindow, settingsWindow;

// 创建七牛云Manager实例
const createManager = () => {
  const accessKey = settingsStore.get('accessKey');
  const secretKey = settingsStore.get('secretKey');
  const bucketName = settingsStore.get('bucketName');
  return new QiniuManager(accessKey, secretKey, bucketName);
};

app.on('ready', () => {
  const mainWindowConfig = {
    width: 1024,
    height: 680
  };
  // loadURL 需使用file://协议
  const urlLocation = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, './build/index.html')}`; // 注意打包后的位置
  mainWindow = new AppWindow(mainWindowConfig, urlLocation);
  // life cycle
  mainWindow.on('closed', () => {
    mainWindow = null
  });

  // set the personalized menu
  let menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // hook up main to open second settings BrowserWindow 
  ipcMain.on('open-settings-window', () => {
    const settingsWindowConfig = {
      width: 640,
      height: 420,
      autoHideMenuBar: true,
      parent: mainWindow
    };
    const settingsFileLocation = `file://${path.join(__dirname, './settings/settings.html')}`;
    settingsWindow = new AppWindow(settingsWindowConfig, settingsFileLocation);
    // settingsWindow.removeMenu();
    // life cycle
    settingsWindow.on('closed', () => {
      settingsWindow = null
    });
  });

  // hook up main to update menuItem
  ipcMain.on('config-is-saved', () => {
    // watch out menu items index for mac and windows
    let qiniuMenu = process.platform === 'darwin'
      ? menu.items[3] : menu.items[2];
    const switchItems = (toggle) => {
      [1, 2, 3].forEach(number => {
        // 重置主进程菜单项
        qiniuMenu.submenu.items[number].enabled = toggle;
      });
    };
    const qiniuIsConfiged = ['accessKey', 'secretKey', 'bucketName'].every(key => !!settingsStore.get(key));
    if (qiniuIsConfiged) {
      switchItems(true);
    } else {
      switchItems(false);
    }
  });

  // hook up main to response qiniu demand
  ipcMain.on('upload-file', (event, data) => {
    const manager = createManager();
    const { key, path } = data;
    manager.uploadFile(key, path).then((data) => {
      // console.log(data);
      mainWindow.webContents.send('active-file-uploaded', { timestamp: Date.now() });
    }).catch(() => {
      dialog.showErrorBox('云同步失败', '请检查七牛云参数是否正确');
    });
  });

  // hook up main to download file
  // data => key, path, id 
  ipcMain.on('download-file', (event, data) => {
    const manager = createManager();
    const filesObj = fileStore.get('files');
    const { key, path, id } = data;
    manager.getStat(data.key).then((resp) => {
      const serverUpdatedTime = Math.floor(resp.putTime / 10000);
      const localUpdatedTime = filesObj[id].updatedAt;
      // 当云端时间戳大于本地 | 本地未上传过
      // console.log(serverUpdatedTime + ',' + localUpdatedTime)
      if (serverUpdatedTime > localUpdatedTime || !localUpdatedTime) {
        manager.downloadFile(key, path).then(() => {
          console.log('download from cloud');
          mainWindow.webContents.send('file-downloaded', { status: 'download-success', id, timestamp: serverUpdatedTime });
        });
      } else {
        console.log('open from local');
        mainWindow.webContents.send('file-downloaded', { status: 'no-new-file', id });
      }
    }, (error) => {
      if (error.statusCode === 612) {
        mainWindow.webContents.send('file-downloaded', { status: 'no-file', id });
      }
    });
  });

  // hook up main to sync all that from store
  ipcMain.on('upload-all-to-qiniu', () => {
    // loading 
    mainWindow.webContents.send('loading-status', true);
    const filesObj = fileStore.get('files') || {};
    const manager = createManager();
    const uploadPromiseArr = Object.keys(filesObj).map(key => {
      const file = filesObj[key];
      return manager.uploadFile(`${file.title}.md`, file.path);
    });
    Promise.all(uploadPromiseArr).then(result => {
      // console.log(result);
      const timestamp = new Date().getTime();
      // show uploaded message
      dialog.showMessageBox({
        type: 'info',
        title: `成功上传了${result.length}个文件`,
        message: `成功上传了${result.length}个文件`
      });
      mainWindow.webContents.send('files-uploaded', { timestamp });
    }).catch(err => {
      dialog.showErrorBox('云同步失败', '请检查七牛云参数是否正确');
    }).finally(() => {
      mainWindow.webContents.send('loading-status', false);
    });
  });

  // hook up main to sync qiniu relative filename
  ipcMain.on('rename-file', (event, data) => {
    const manager = createManager();
    const { oldKey, newKey } = data;
    manager.renameFile(oldKey, newKey).then(() => {
      mainWindow.webContents.send('file-renamed');
    }, ({ statusCode }) => {
      if (statusCode === 612) {
        dialog.showErrorBox('云重命名失败(自动同步)', '云端未找到该文件哦');
      }
    });
  });

  // hook up main to delete qiniu file
  ipcMain.on('delete-file', (event, data) => {
    const { key } = data;
    const manager = createManager();
    manager.deleteFile(key).then(() => {
      mainWindow.webContents.send('file-deleted');
    }, ({ statusCode }) => {
      if (statusCode === 612) {
        dialog.showErrorBox('云删除失败(自动同步)', '云端未找到该文件哦');
      }
    });
  });

  // hook up main to download all files
  ipcMain.on('download-all-to-qiniu', (event, data) => {
    mainWindow.webContents.send('loading-status', true);
    const manager = createManager();
    manager.getFileList().then(({ items: list }) => {
      /**
       * 基于updatedAt，因为只有同步到云端才会变化，所以云端数据绝对是最新的。
       *  但是考虑流量问题，若刚同步过的文件，则无需重新被拉取。
       *    且文件名相同，但未同步的文件，我们不能给予覆盖，可能是用户新文件。 // 基于再度思考，移除该条件。
       *   1、store的更新，仅追加 或 覆盖，需要保留其他的文件。
       *    2、若本地不存在文件，则读取Settings: savedFileLocation, [存在直接拿，不存在则获取documents的位置]
       */
      // 云文件扁平化  title: {}
      const cloudListObj = list.reduce((result, file) => {
        let { key: title, putTime: updatedAt } = file;
        title = title.slice(0, -3);
        result[title] = {
          title,
          updatedAt: Math.floor(updatedAt / 10000)
        };
        return result;
      }, {});
      // 仓库文件扁平化 title: {}
      const files = fileStore.get('files');
      const storeObj = flattenArr(objToArr(files), 'title');
      // 获取文件的存储路径
      const savedFileLocation = settingsStore.get('savedFileLocation') ? settingsStore.get('savedFileLocation') : app.getPath('documents');
      // 比较待贴合的全部文件
      const crowdObj = {};
      const promiseArr = [];
      let downloadPath;
      // console.log(cloudListObj, storeObj,savedFileLocation);
      Object.keys(cloudListObj).forEach(title => {
        if (!storeObj[title]) {
          // 如果仓库并没有云端文件，直接加入
          const id = uuidv4();
          downloadPath = path.join(savedFileLocation, `${title}.md`);
          const updatedAt = cloudListObj[title].updatedAt;
          crowdObj[title] = {
            id,
            path: downloadPath,
            title,
            createdAt: updatedAt,
            isSynced: true,
            updatedAt
          };
          promiseArr.push(manager.downloadFile(`${title}.md`, downloadPath)); // 待下载文件
        } else {
          downloadPath = path.join(savedFileLocation, `${title}.md`);
          // 仓库含有云端文件，覆盖未同步的文件，以及覆盖旧同步文件
          if (storeObj[title].updatedAt < cloudListObj[title].updatedAt || !storeObj[title].isSynced) {
            // 将该文件覆盖，并修改同步时间字段
            promiseArr.push(manager.downloadFile(`${title}.md`, downloadPath)); // 待下载文件
            storeObj[title] = { ...storeObj[title], isSynced: true, updatedAt: cloudListObj[title].updatedAt }; // 修改字段
          }
        }
      });
      // 先将待命文件下载，在存储最终store的数据
      Promise.all(promiseArr).then(() => {
        const finalStoreFiles = flattenArr(objToArr({ ...storeObj, ...crowdObj }));
        fileStore.set('files', finalStoreFiles);
        // 发给渲染进程去重获store
        mainWindow.webContents.send('sync-all-downloaded');
        dialog.showMessageBox({
          type: 'info',
          title: `下载全部云端文件至本地成功`,
          message: `已自动匹配，共更新了${promiseArr.length}个文件`
        })
      }).catch((err) => {
        dialog.showErrorBox('发送错误', `错误内容为：${err}`)
      }).finally(() => {
        mainWindow.webContents.send('loading-status', false);
      });
    });
  });

});