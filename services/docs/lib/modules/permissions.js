function isAllowedTo(permission, method) {
  return permission && (permission.includes(method) || permission === '*');
}

const PUBLIC_ERR_MESSAGE = 'resource is not public for this state and method';

module.exports.can = function can(user, resource, method, state) {
  const isAnonymous = typeof user === 'undefined';
  const publicPermissions = resource.permissions.public?.[state];
  const publicIsAllowed = isAllowedTo(publicPermissions, method);

  // Resource is public, no need to go further
  if (publicIsAllowed) {
    return {};
  }
  // We handled the anonymous with public, meaning
  // we don't need additional tests and can reject
  // right now
  if (isAnonymous) {
    throw new Error(PUBLIC_ERR_MESSAGE);
  }

  // Admin is GOD MODE
  if (user.isAdmin) {
    return {};
  }

  /*
   2 ways of allowing access to a document:
      - by role: state and method dependent
      - or if they share at least one common group
   */
  const allowedRoles = Object.keys(resource.permissions)
    .filter(role => {
      return isAllowedTo(resource.permissions[role][state], method);
    })
    .concat(['owner']);

  let filter = {
    [`users.${user._id}.roles`]: { $elemMatch: { $in: allowedRoles } }
  };

  if (user.groups && user.groups.length) {
    filter = { $or: [filter, { groups: { $in: user.groups } }] };
  }
  return filter;
};

module.exports.getAllowedStatesFromDocForUser = function (user, resource, method, doc) {
  const getPublicStates = () => {
    const publicPermissions = resource.permissions.public;
    const publicPermissionsStates = Object.keys(publicPermissions);
    return publicPermissionsStates.filter(stateName => isAllowedTo(publicPermissions[stateName], method));
  };
  if (!user) {
    return getPublicStates();
  }
  if (user.isAdmin) {
    return Object.keys(resource.states);
  }

  if (!Object.keys(doc.users).length) {
    const userHasCommonGroup = doc.groups?.some(group => user.groups?.includes(group));
    if (userHasCommonGroup) {
      return Object.keys(resource.states);
    }
  }

  const docUser = doc.users[user._id] || { roles: [] };
  if (!Array.isArray(docUser.roles)) {
    return getPublicStates();
  }
  let allowedStates = [];
  docUser.roles.forEach(role => {
    const permsForRole = resource.permissions[role];
    if (!permsForRole) {
      return;
    }
    const statesForRole = Object.keys(permsForRole);
    allowedStates = allowedStates.concat(statesForRole.filter(stateName => isAllowedTo(permsForRole[stateName], method)));
  });
  return allowedStates;
};

module.exports.filterDocumentStates = function (document, allowedStates, requestedStates) {
  return Object.keys(document.states || {})
    .filter(docState => requestedStates.includes(docState))
    .filter(docState => allowedStates.includes(docState))
    .reduce((states, displayState) => {
      states[displayState] = document.states[displayState];
      return states;
    }, {});
};
