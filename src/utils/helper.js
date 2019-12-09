// 扁平化数组
export const flattenArr = (arr) => {
  return arr.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {});
}

// 还原数组
export const objToArr = (obj) => {
  return Object.keys(obj).map(key => obj[key]);
}

// 冒泡节点至对应的className节点
export const getParentNode = (node, parentClassName) => {
  let current = node;
  while (current !== null) {
    if (current.classList.contains(parentClassName)) {
      return current;
    }
    current = current.parentNode;
  }
  return false;
}

// 获取标准时间
export const timestampToString = (timestamp) => {
  const data = new Date(timestamp);
  return data.toLocaleDateString() + ' ' + data.toLocaleTimeString();
}