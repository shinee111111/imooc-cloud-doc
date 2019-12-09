import React, { useState, useEffect } from 'react';
import { faPlus, faFileImport } from '@fortawesome/free-solid-svg-icons';
import SimpleMDE from 'react-simplemde-editor';
import uuidv4 from 'uuid/v4';
import { flattenArr, objToArr, timestampToString } from './utils/helper';
import fileHelper from './utils/fileHelper';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'easymde/dist/easymde.min.css';
import FileSearch from './components/FileSearch';
import FileList from './components/FileList';
import BottomBtn from './components/BottomBtn';
import TabList from './components/TabList';
import Loader from './components/Loader';
import useIpcRenderer from './hooks/useIpcRenderer';

// require node.js modules
const { join, dirname, basename, extname } = window.require('path');
const { remote, ipcRenderer } = window.require('electron');
const Store = window.require('electron-store');
const fileStore = new Store({ name: 'Files Data' });
const settingsStore = new Store({ name: 'Settings' });

// 获取仓库的七牛云配置信息
const getAutoSync = () => {
  return [
    'accessKey', 'secretKey', 'bucketName', 'enableAutoSync'
  ].every(key => !!settingsStore.get(key));
}

// 保存文件信息到store仓库
const saveFilesToStore = (files) => {
  // we don't have to store any info in file system, eg: isNew, body, etc
  const filesStoreObj = objToArr(files).reduce((result, file) => {
    // 解构同时起到过滤作用
    const { id, path, title, createdAt, isSynced, updatedAt } = file;
    result[id] = {
      id,
      path,
      title,
      createdAt,
      isSynced,
      updatedAt
    };
    return result;
  }, {});
  fileStore.set('files', filesStoreObj);
}

function App() {
  useEffect(() => {
    console.log('呃...啥东西更新了');
  })

  // 状态管理(驱动性数据)
  const [files, setFiles] = useState(fileStore.get('files') || {}); // 文件数据源[object]
  const [activeFileID, setActiveFileID] = useState(''); // 激活
  const [openedFileIDs, setOpenedFileIDs] = useState([]); // 已打开
  const [unsavedFileIDs, setUnsavedFileIDs] = useState([]); // 未保存
  const [searchedFiles, setSearchedFiles] = useState([]); // 搜索数据源[array]
  const [isLoading, setLoading] = useState(false);

  // 数据源封装数据
  const filesArr = objToArr(files); // [array]
  const openedFiles = openedFileIDs.map(openID => files[openID]);
  const activeFile = files[activeFileID];
  const fileListArr = (searchedFiles.length) ? searchedFiles : filesArr;
  const savedLocation = settingsStore.get('savedFileLocation') || remote.app.getPath('documents'); // 优先选择用户个性化位置

  // 左侧面板文件点击打开(若自动同步尝试从云端读取)
  const fileClick = (fileID) => {
    if (!checkFileExist(fileID)) {
      return;
    }
    setActiveFileID(fileID);
    // just read file body
    const currentFile = files[fileID];
    const { id, title, path, isLoaded } = currentFile;
    // if not load, to load,attention to sync
    if (!isLoaded) {
      if (getAutoSync()) {
        ipcRenderer.send('download-file', { key: `${title}.md`, path, id });
      } else {
        fileHelper.readFile(currentFile.path).then((value) => {
          const newFile = { ...currentFile, body: value, isLoaded: true };
          setFiles({ ...files, [fileID]: newFile });
        });
      }
    }
    // if oepnedFiles don't have the current ID
    // then add new fileID to openedFiles
    if (!openedFileIDs.includes(fileID)) {
      // append current ID to files
      setOpenedFileIDs([...openedFileIDs, fileID]);
    }
  }

  // 选项卡点击 
  const tabClick = (fileID) => {
    setActiveFileID(fileID);
  }

  // tab to close
  const tabClose = (id) => {
    const tabsWithout = openedFileIDs.filter(fileID => fileID !== id);
    setOpenedFileIDs(tabsWithout);
    // 如果当前标签为激活状态
    if (tabsWithout.length > 0) {
      if (id === activeFileID) {
        setActiveFileID(tabsWithout[0]);
      }
    } else {
      setActiveFileID('');
    }
  }

  // MD onChange
  const fileChange = (id, value) => {
    // filter the ctrl ,alt ,etc...
    if (value === files[id].body) {
      return;
    }
    const newFile = { ...files[id], body: value };;
    setFiles({ ...files, [id]: newFile });
    // update unsavedIDs
    if (!unsavedFileIDs.includes(id)) {
      setUnsavedFileIDs([...unsavedFileIDs, id]);
    }
  }

  // left panel remove file
  const deleteFile = (id) => {
    // if isNew, not to with fs
    if (files[id].isNew) {
      handleDelete(id);
      return;
    }
    fileHelper.deleteFile(files[id].path).then(() => {
      handleDelete(id);
      if (getAutoSync()) {
        ipcRenderer.send('delete-file', { key: `${files[id].title}.md` });
      }
    });
  }

  // update filename | maybe write new file
  const updateFileName = (id, title, isNew) => {
    // if title already exist, to return
    if (filesArr.find(file => file.title === title)) {
      console.log('文件名已存在咯')
      return;
    }
    // newPath should be different based on isNew
    // if isNew is false, path should be old dirname + new title
    const newPath = join(
      isNew ? savedLocation : dirname(files[id].path),
      `${title}.md`
    );
    const modifiedFile = {
      ...files[id],
      title,
      isNew: false,
      path: newPath // add path 
    };
    const newFiles = { ...files, [id]: modifiedFile };
    if (isNew) {
      // if field has isNew, just to write file
      fileHelper.writeFile(newPath, files[id].body).then(() => {
        setFiles(newFiles);
        saveFilesToStore(newFiles);
      });
    } else {
      const oldPath = files[id].path;
      // normal update filename
      fileHelper.renameFile(oldPath, newPath).then(() => {
        // sync qiniu filename
        if (getAutoSync()) {
          ipcRenderer.send('rename-file', { oldKey: `${files[id].title}.md`, newKey: `${title}.md` });
        }
        setFiles(newFiles);
        saveFilesToStore(newFiles);
      });
    }
  }

  // search file
  const fileSearch = (keyword) => {
    if (!keyword) {
      setSearchedFiles([]);
      return;
    }
    const newFiles = filesArr.filter(file => file.title.includes(keyword));
    setSearchedFiles(newFiles);
  }

  // build new file -> updateFilename to save
  const createNewFile = () => {
    // if already have ,not build
    if (filesArr.find(file => file.isNew)) {
      return;
    }
    const newID = uuidv4();
    const newFile = {
      id: newID,
      title: '',
      body: '## 请输入 markdown',
      createdAt: new Date().getTime(),
      isNew: true
    };
    setFiles({ ...files, [newID]: newFile });
  }

  const saveCurrentFile = () => {
    const { path, body, title } = activeFile;
    fileHelper.writeFile(path, body).then(() => {
      setUnsavedFileIDs(unsavedFileIDs.filter(id => id !== activeFileID));
      // sync qiniu
      if (getAutoSync()) {
        // 云端保存文件的名称，和文件路径
        ipcRenderer.send('upload-file', { key: `${title}.md`, path })
      }
    });
  }

  const checkFileExist = (fileID) => {
    if (!fileHelper.isFileExist(files[fileID].path)) {
      // to handleDelete file & store
      remote.dialog.showMessageBox({
        type: 'warning',
        title: '本地文件不存在',
        message: '本地文件不存在，或被移动，已自动帮您清除该项'
      });
      handleDelete(fileID);
      return false;
    } else {
      return true;
    }
  }

  const handleDelete = (id) => {
    const { [id]: file, ...restFiles } = files;
    setFiles(restFiles);
    saveFilesToStore(restFiles);
    // close the tab if opened
    tabClose(id);
  }

  const importFiles = () => {
    remote.dialog.showOpenDialog({
      title: '选择导入的 Markdown 文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Markdown files', extensions: ['md'] }
      ]
    }).then(({ filePaths: paths }) => {
      // filter out the path we already have in electron store
      const filteredPaths = paths.filter(path => {
        const alreadyAdded = filesArr.some(file => file.path === path);
        return !alreadyAdded;
      });
      // extend the path array to an array contains files info
      // [{id: '5', path: '...', title: '', createdAt:''}, {}]
      const importFilesArr = filteredPaths.map(path => {
        return {
          id: uuidv4(),
          title: basename(path, extname(path)),
          path
        }
      });
      // get the new files object in flattenArr
      const newFiles = { ...files, ...flattenArr(importFilesArr) };
      // if importFiles exist:
      if (importFilesArr.length) {
        setFiles(newFiles);
        saveFilesToStore(newFiles);
        // setState and update electron store
        // show message
        remote.dialog.showMessageBox({
          type: 'info',
          title: `成功导入了${importFilesArr.length}个文件`,
          message: `成功导入了${importFilesArr.length}个文件`,
        });
      }
    });
  }

  // 云端同步完毕后
  const activeFileUploaded = (event, message) => {
    const { id } = activeFile;
    const { timestamp } = message;
    const modifiedFile = { ...files[id], isSynced: true, updatedAt: timestamp };
    const newFiles = { ...files, [id]: modifiedFile };
    setFiles(newFiles);
    saveFilesToStore(newFiles);
  }

  // 云文件下载返回情况
  const activeFileDownloaded = (event, message) => {
    const { status, id, timestamp } = message;
    const currentFile = files[id];
    const { path } = currentFile;
    fileHelper.readFile(path).then(value => {
      let newFile;
      if (status === 'download-success') {
        newFile = { ...files[id], body: value, isLoaded: true, isSynced: true, updatedAt: timestamp };
      } else {
        newFile = { ...files[id], body: value, isLoaded: true };
      }
      const newFiles = { ...files, [id]: newFile };
      setFiles(newFiles);
      saveFilesToStore(newFiles);
    });
  }

  // [全部文件]同步完毕
  const filesUploaded = (event, message) => {
    const { timestamp } = message;
    const newFiles = objToArr(files).reduce((result, file) => {
      result[file.id] = { ...file, updatedAt: timestamp, isSynced: true };
      return result;
    }, {});
    setFiles(newFiles);
    saveFilesToStore(newFiles);
  }

  // [全部文件]下载完毕
  const syncAllDownloaded = () => {
    // 读取最新Store，并setFiles
    const newFiles = fileStore.get('files');
    setFiles(newFiles);
  }

  useIpcRenderer({
    'create-new-file': createNewFile,
    'import-file': importFiles,
    'save-edit-file': saveCurrentFile,
    'active-file-uploaded': activeFileUploaded, // 当前文件保存到云
    'file-downloaded': activeFileDownloaded, // 云下载
    'files-uploaded': filesUploaded, // 全部文件上传
    'file-renamed': () => { }, // 云重命名
    'file-deleted': () => { }, // 云删除
    'sync-all-downloaded': syncAllDownloaded,
    'loading-status': (event, status) => setLoading(status)
  })

  return (
    <div className="App container-fluid px-0">
      {isLoading && <Loader />}
      <div className="row no-gutters">
        <div className="col-3 left-panel">
          <FileSearch
            onFileSearch={fileSearch}
          />
          <FileList
            files={fileListArr}
            onFileClick={fileClick}
            onFileDelete={deleteFile}
            onSaveEdit={updateFileName}
          />
          <div className="row no-gutters button-group">
            <div className="col">
              <BottomBtn
                text="新建"
                colorClass="btn-primary"
                icon={faPlus}
                onBtnClick={createNewFile}
              />
            </div>
            <div className="col">
              <BottomBtn
                text="导入"
                colorClass="btn-success"
                icon={faFileImport}
                onBtnClick={importFiles}
              />
            </div>
          </div>
        </div>
        <div className="col-9 right-panel">
          {!activeFile &&
            <div className="start-page">
              选择或者创建新的 Markdown 文档
            </div>
          }
          {activeFile &&
            <>
              <TabList
                files={openedFiles}
                activeId={activeFileID}
                unsaveIds={unsavedFileIDs}
                onTabClick={tabClick}
                onCloseTab={tabClose}
              />
              <SimpleMDE
                key={activeFile && activeFile.id}
                value={activeFile && activeFile.body}
                onChange={(value) => fileChange(activeFile.id, value)}
                options={{
                  minHeight: '235px',
                  spellChecker: false
                }}
              />
              {activeFile.isSynced &&
                <span className="sync-status">
                  已同步云，上次同步{timestampToString(activeFile.updatedAt)}
                </span>}
            </>
          }
        </div>
      </div>
    </div>
  );
}

export default App;
