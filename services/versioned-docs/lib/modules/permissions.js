function isAllowedTo(permission, method) {
  return permission && (permission.includes(method) || permission === '*');
}

const PUBLIC_ERR_MESSAGE = 'resource is not public for this method';

module.exports.can = function can(user, resource, method) {
  if (typeof user === 'undefined') {
    if (!resource.permissions.public) {
      throw new Error(PUBLIC_ERR_MESSAGE);
    }
    const publicPermissions = resource.permissions.public;
    const publicIsAllowed = isAllowedTo(publicPermissions, method);
    if (!publicIsAllowed) {
      throw new Error(PUBLIC_ERR_MESSAGE);
    }
    return {};
  }
  if (user.isAdmin) {
    return {};
  }
  /*
    2 ways of allowing access to a document:
      - by role: method dependent
      - or if they share at least one common group
  */
  const allowedRoles = [
    ...new Set([...Object.keys(resource.permissions).filter(role => isAllowedTo(resource.permissions[role], method)), 'owner'])
  ];
  let filter = {
    [`users.${user._id}.roles`]: { $elemMatch: { $in: allowedRoles } }
  };
  if (user.groups && user.groups.length) {
    filter = { $or: [filter, { groups: { $in: user.groups } }] };
  }
  return filter;
};
