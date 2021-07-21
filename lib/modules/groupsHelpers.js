const { ObjectId } = require('mongodb');

module.exports.getValidGroupsFromString = function getValidGroupsFromString(
  groupIds
) {
  return groupsIds
    .split(',')
    .map((groupId) => {
      return ObjectId.isValid(groupId.trim().split('_').pop())
        ? groupId.trim()
        : false;
    })
    .filter(Boolean);
};
