const AggregationCursor = require('mongodb').AggregationCursor;
// eslint-disable-next-line no-unused-vars
const FindCursor = require('mongodb').FindCursor;

const PAGINATE_DEFAULTS = {
  page: 1,
  perPage: 100
};

/**
 *
 * @param {FindCursor|AggregationCursor} cursor
 * @param {Object} [options]
 * @param {Number} [options.page]
 * @param {Number} [options.perPage]
 * @return {Promise}
 */
module.exports = function paginateCursor(cursor, options) {
  return new Promise((resolve, reject) => {
    const params = Object.assign({}, PAGINATE_DEFAULTS, options);
    // page, perPage
    const page = parseInt(params.page);
    const perPage = parseInt(params.perPage);
    const skip = (page - 1) * parseInt(params.perPage);
    const limit = parseInt(params.perPage);

    if (options.infinite === true) {
      return resolve({ skip, limit, page, perPage });
    }

    cursor
      .toArray()
      .then(documents => {
        const count = documents.length;
        cursor.rewind();
        cursor.skip(skip).limit(limit);
        return resolve(preparePagination(count, skip, limit, page, perPage));
      })
      .catch(error => {
        reject(error);
      });
  });
};

/**
 * @param {Number} count
 * @param {Number} skip
 * @param {Number} limit
 * @param {Number} page
 * @param {Number} perPage
 * @returns {{perPage: number, lastPage: number, count: number, limit:number, skip:number, page: number}}
 */
const preparePagination = (count, skip, limit, page, perPage) => {
  // lastPage, bounded page
  const lastPage = count === 0 ? 1 : Math.ceil(count / perPage);
  page = Math.min(Math.max(page, 1), lastPage);
  return {
    count,
    skip,
    limit,
    page,
    perPage,
    lastPage
  };
};

/**
 * prepare an object for pagination results
 * @param {Object} collectionConnection  mongodb connection to the collection
 * @param {Object|Array}  query either a query filter object, or an aggregation pipeline array
 * @param {?Object}  paginationOptions pagination options
 * @returns {Promise<{skip: number, limit: number, count: number, page: number, perPage: number, nav: { first: number, last: number, previous: ?number, next: ?number}}>}
 */
module.exports.paginateQuery = async (collectionConnection, query, paginationOptions = {}) => {
  const isAggregation = Array.isArray(query);
  let count;
  if (!isAggregation) {
    count = await collectionConnection.countDocuments(query);
  } else {
    const aggregateCount = await collectionConnection
      .aggregate([...query, { $group: { _id: null, count: { $sum: 1 } } }])
      .toArray();
    count = aggregateCount[0]?.count || 0;
  }

  const params = { ...PAGINATE_DEFAULTS, ...paginationOptions };

  let page = parseInt(params.page);
  const perPage = parseInt(params.perPage);
  const skip = (page - 1) * parseInt(params.perPage);
  const limit = parseInt(params.perPage);
  const lastPage = count === 0 ? 1 : Math.ceil(count / perPage);
  page = Math.min(Math.max(page, 1), lastPage);

  return {
    skip,
    limit,
    count,
    page,
    perPage,
    nav: {
      first: 1,
      last: lastPage,
      previous: page > 1 ? page - 1 : undefined,
      next: page < lastPage ? page + 1 : undefined
    }
  };
};

module.exports.defaults = PAGINATE_DEFAULTS;
