module.exports.getDocumentLockServiceOptions = function getDocumentLockServiceOptions(req) {
  return req.service.options?.editLock || { collectionName: 'doc-lock', lockTimeoutSeconds: 3600 };
};
