const { ObjectId } = require('mongodb');

module.exports = function (groupsIds) {
  return groupsIds
    .split(',')
    .map((groupId) => {
      return ObjectId.isValid(groupId.split('_').pop()) ? groupId : false;
    })
    .filter(Boolean);
};
