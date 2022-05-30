module.exports.fetchUsers = async (users, options, server) => {
  if (typeof options.usersFetcher !== 'function') {
    throw new Error('usersFetcher should be defined as a function in service options');
  }
  return await options.usersFetcher(users, server);
};
