function isAllowedTo (permission, method) {
  return (permission && (permission.includes(method) || permission === '*'));
}

const PUBLIC_ERR_MESSAGE = 'resource is not public for this state and method';

module.exports.can = function can (user, resource, method, state) {
  return new Promise((resolve, reject) => {
    if (typeof user === 'undefined') {
      const publicPermissions = resource.permissions['public'][state];
      const publicIsAllowed = isAllowedTo(publicPermissions, method);
      return publicIsAllowed ? resolve({}) : reject(new Error(PUBLIC_ERR_MESSAGE));
    }
    if (user.isAdmin) {
      return resolve({});
    }
    const allowedRoles = Object.keys(resource.permissions).filter(role => {
      return isAllowedTo(resource.permissions[role][state], method);
    }).concat(['owner']);
    // Because
    const filter = {
      [`users.${user._id}.roles`]: {$elemMatch: {$in: allowedRoles}}
    };
    return resolve(filter);
  });
};

module.exports.getAllowedStatesFromDocForUser = function (user, resource, method, doc) {
  if (!user) {
    const publicPermissions = resource.permissions['public'];
    const publicPermissionsStates = Object.keys(publicPermissions);
    return publicPermissionsStates.filter(stateName => isAllowedTo(publicPermissions[stateName], method));
  }
  if (user.isAdmin) {
    return Object.keys(resource.states);
  }
  const docUser = doc.users[user._id] || { roles: [] };
  let allowedStates = [];
  docUser.roles.forEach(role => {
    const permsForRole = resource.permissions[role];
    if (!permsForRole) {
      return;
    }
    const statesForRole = Object.keys(permsForRole);
    allowedStates = allowedStates.concat(
      statesForRole.filter(stateName => isAllowedTo(permsForRole[stateName], method))
    );
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
