module.exports.fetchUsers = (users, options, server) => new Promise((resolve, reject) => {
  if (typeof options.usersFetcher === 'function') {
    return options.usersFetcher(users, server).then(users => resolve(users)).catch(err => reject(err));
  }
  resolve(users);
});
