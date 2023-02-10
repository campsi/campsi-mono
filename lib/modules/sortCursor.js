/**
 * flips sorting order if field begins with minus '-'
 * @param {String} field
 * @param {String} prefix
 * @returns {Array<Array>}
 */
function getMongoSortArray(field, prefix) {
  return !field.startsWith('-') ? { [prefix + field]: 1 } : { [prefix + field.substr(1)]: -1 };
}

/**
 *
 * @link http://www.vinaysahni.com/best-practices-for-a-pragmatic-restful-api#advanced-queries
 * @param {Cursor} cursor
 * @param {String} [sort]
 * @param {String} [prefix]
 * @return {Cursor} cursor
 */
module.exports = (cursor, sort, prefix, getFields) => {
  if (typeof sort === 'undefined') {
    return cursor;
  }

  prefix = prefix === undefined ? '' : String(prefix);

  if (prefix?.includes('data.')) {
    sort = sort.replaceAll('data.', '');
  }

  let fields = {};

  sort.split(',').forEach(field => (fields = { ...fields, ...getMongoSortArray(field, prefix) }));

  if (getFields) {
    return fields;
  }

  cursor.sort(fields);
  return cursor;
};
