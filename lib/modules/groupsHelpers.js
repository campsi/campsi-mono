const { ObjectId } = require('mongodb');

module.exports.getValidGroupsFromString = function getValidGroupsFromString(
  groupIds
) {
  return groupsIds
    .split(',')
    .map((groupId) => {
      return ObjectId.isValid(groupId.split('_').pop()) ? groupId : false;
    })
    .filter(Boolean);
};
