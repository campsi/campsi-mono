const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * The function `sanitizeHTMLFromXSS` is used to sanitize HTML strings and objects from potential
 * cross-site scripting (XSS) attacks.
 * @param obj - The `obj` parameter is the input object that you want to sanitize
 * from potential XSS (Cross-Site Scripting) attacks. It can be a string or an object containing strings.
 * @returns The function `sanitizeHTMLFromXSS` returns the sanitized version of the input object,
 * with any potentially harmful HTML tags or attributes removed.
 */
function sanitizeHTMLFromXSS(obj) {
  if (!obj) return obj;
  switch (typeof obj) {
    case 'string':
      return DOMPurify.sanitize(obj)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"');
    case 'object':
      return Object.entries(obj).reduce((acc, [key, value]) => {
        acc[key] = sanitizeHTMLFromXSS(value);
        return acc;
      }, obj);
    default:
      return obj;
  }
}

module.exports = sanitizeHTMLFromXSS;
