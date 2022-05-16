const isObjectId = value => {
  return (typeof value === 'string' || value instanceof String) && /^[a-f\d]{24}$/.test(value);
};

module.exports = function findReferences(record, path) {
  const slugs = path.split('.');
  return slugs.reduce((content, slug, index) => {
    if (slug === '*') {
      // If we have '*' in the path, it must be the last element
      if (index === slugs.length - 1) {
        if (Array.isArray(content)) {
          // return all objectId found in the array at path
          return content.filter(candidate => isObjectId(candidate));
        } else {
          // It should be an array but we have no data
          return [];
        }
      } else {
        throw new Error('Malformed Path');
      }
    } else {
      if (index === slugs.length - 1) {
        if (content && Object.prototype.hasOwnProperty.call(content, slug)) {
          // Maybe we have a reference here
          return isObjectId(content[slug]) ? content[slug] : null;
        } else {
          // It should be a single reference, but we have no data
          return null;
        }
      } else {
        if (content && Object.prototype.hasOwnProperty.call(content, slug)) {
          return content[slug];
        } else {
          // It could be an array or simple reference, but we have no data
          // The 'reduce' loop will send the correct format at last
          return null;
        }
      }
    }
  }, record);
};
