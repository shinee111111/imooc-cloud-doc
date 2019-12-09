import React, { Component } from 'react';
import defaultFiles from '../utils/defaultFiles';

class Test extends Component {
  constructor(props) {
    super(props);
    this.state = {
      files: defaultFiles
    }
  }

  handleInputChange(value) {
    const { files } = this.state;
    // 测试id默认为1
    const currentFile = files.find(file => file.id === '1');
    currentFile.body = value;
    this.state.files[0].body = '与redux混淆了';
    this.setState({ files });
    // console.log(files);1
  }

  render() {
    console.log('修改字段也触发render了');
    const { files } = this.state;
    return (
      <input
        onChange={(e) => this.handleInputChange(e.target.value)}
        value={files[0].body}
      />
    );
  }
}

export default Test;