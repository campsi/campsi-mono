module.exports = function buildLink(req, page, keptParams) {
  const params = {
    page
  };
  for (const keptParam of keptParams) {
    if (Object.prototype.hasOwnProperty.call(req.query, keptParam)) {
      params[keptParam] = req.query[keptParam];
    }
  }
  const path = req.baseUrl + req.path;
  const query = Object.keys(params)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  return '{0}://{1}{2}?{3}'.format(req.protocol, req.get('host'), path, query);
};

module.exports = function buildSingleDocumentLink(req, id) {
  const path = req.baseUrl + req.path.substring(0, req.path.lastIndexOf('/') + 1) + id;
  return '{0}://{1}{2}'.format(req.protocol, req.get('host'), path);
};
