module.exports.getUserService = (options, server) => {
  const auth = server.services.get('auth');

  return auth;
};
