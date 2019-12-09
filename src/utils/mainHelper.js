const flattenArr = (arr, sign = 'id') => {
  return arr.reduce((result, item) => {
    result[item[sign]] = item;
    return result;
  }, {});
};

const objToArr = (obj) => {
  return Object.keys(obj).map(key => obj[key]);
};

module.exports = {
  flattenArr,
  objToArr
};