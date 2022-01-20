const AggregationCursor = require('mongodb').AggregationCursor;
const FindCursor = require('mongodb').AggregationCursor;

const defaults = {
  page: 1,
  perPage: 100
};

/**
 *
 * @param {FindCursor|AggregationCursor} cursor
 * @param {object} [options]
 * @return {Promise}
 */
module.exports = function paginateCursor(cursor, options) {
  return new Promise((resolve, reject) => {
    const params = Object.assign({}, defaults, options);
    // page, perPage
    let page = parseInt(params.page);
    const perPage = parseInt(params.perPage);
    const skip = (page - 1) * parseInt(params.perPage);
    const limit = parseInt(params.perPage);
    cursor.skip(skip).limit(limit);

    if (options.infinite === true) {
      return resolve({
        skip: skip,
        limit: limit,
        page: page,
        perPage: perPage
      });
    }
    const isAggregationCursor = cursor instanceof AggregationCursor;
    if (!isAggregationCursor) {
      cursor
        .count()
        .then(count => {
          resolve(preparePagination(count, skip, limit, page, perPage));
        })
        .catch(error => {
          reject(error);
        });
    } else {
      /*
        since count() doesn't exist with AggregationCursor
        Note: I could have used the code below for both types of cursor (FindCursor and AggregationCursor), but since count() doesn't perform the query, I guessed that it would be better for performances to handle the count differently
       */
      cursor
        .toArray()
        .then(documents => {
          const count = documents.length;
          cursor.rewind();
          resolve(preparePagination(count, skip, limit, page, perPage));
        })
        .catch(error => {
          reject(error);
        });
    }
  });
};

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

module.exports.defaults = defaults;
