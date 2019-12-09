const fs = window.require('fs').promises;
const fsSync = window.require('fs');

const fileHelper = {
  readFile: (path) => {
    return fs.readFile(path, { encoding: 'utf8' });
  },
  writeFile: (path, content) => {
    return fs.writeFile(path, content, { encoding: 'utf8' })
  },
  renameFile: (path, newPath) => {
    return fs.rename(path, newPath)
  },
  deleteFile: (path) => {
    return fs.unlink(path);
  },
  isFileExist: (path) => {
    try {
      fsSync.accessSync(path);
      return true;
    } catch (err) {
      return false;
    }
  }
};

export default fileHelper;