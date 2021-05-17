const defaults = {
  page: 1,
  perPage: 100
};

/**
 *
 * @param {Cursor} cursor
 * @param {object} [options]
 * @return {Promise}
 */
module.exports = function paginateCursor (cursor, options) {
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

    cursor
      .count()
      .then(count => {
        // lastPage, bounded page
        const lastPage = count === 0 ? 1 : Math.ceil(count / perPage);
        page = Math.min(Math.max(page, 1), lastPage);
        resolve({
          count: count,
          skip: skip,
          limit: limit,
          page: page,
          perPage: perPage,
          lastPage: lastPage
        });
      })
      .catch(error => {
        reject(error);
      });
  });
};

module.exports.defaults = defaults;
