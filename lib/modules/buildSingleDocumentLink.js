module.exports = function buildSingleDocumentLink(req, id) {
  const pathFragments = req.path.split('/');
  let path = req.baseUrl;

  // path can be either /resource/id or /resource/id/state
  if (pathFragments.length >= 2) {
    path += '/' + pathFragments[1] + '/' + id;

    // this should be the state if it's present
    if (pathFragments.length === 4) {
      path += '/' + pathFragments[3];
    }
  }

  return '{0}://{1}{2}'.format(req.protocol, req.get('host'), path);
};
