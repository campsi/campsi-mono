class ValidationError extends Error {
  constructor(validationErrors) {
    super('Validation Error');
    this.validationErrors = validationErrors;
  }
}

module.exports = ValidationError;
