// src/db/utils.js - Universal Database Utilities

/**
 * HELPER FUNCTION: Convert undefined to null for MySQL2 compatibility
 * MySQL2 requires null instead of undefined for SQL NULL values
 * @param {any} value - The value to convert
 * @returns {any} The converted value (null if undefined)
 */
function convertUndefinedToNull(value) {
  return value === undefined ? null : value;
}

/**
 * Recursively convert all undefined values to null in an object
 * @param {any} obj - Object to convert
 * @returns {any} Object with undefined values converted to null
 */
function convertUndefinedToNullRecursive(obj) {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertUndefinedToNullRecursive);
  }

  if (typeof obj === "object") {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertUndefinedToNullRecursive(value);
    }
    return converted;
  }

  return obj;
}

/**
 * Prepare data for MySQL insertion by converting undefined to null
 * @param {Object} data - Data object to prepare
 * @param {Array} requiredFields - Array of required field names
 * @returns {Object} Prepared data object
 */
function prepareDataForMysql(data, requiredFields = []) {
  const prepared = convertUndefinedToNullRecursive(data);

  // Ensure required fields are not null/undefined
  for (const field of requiredFields) {
    if (prepared[field] === null || prepared[field] === undefined) {
      console.warn(`Warning: Required field '${field}' is null/undefined`);
    }
  }

  return prepared;
}

/**
 * Validate and sanitize string fields
 * @param {string} value - String value to validate
 * @param {number} maxLength - Maximum allowed length
 * @param {string} defaultValue - Default value if null/undefined
 * @returns {string|null} Validated string
 */
function validateString(value, maxLength = 255, defaultValue = null) {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return String(value).substring(0, maxLength);
}

/**
 * Validate and sanitize numeric fields
 * @param {any} value - Numeric value to validate
 * @param {number} defaultValue - Default value if invalid
 * @returns {number} Validated number
 */
function validateNumber(value, defaultValue = 0) {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Validate and sanitize boolean fields
 * @param {any} value - Boolean value to validate
 * @param {boolean} defaultValue - Default value if invalid
 * @returns {boolean} Validated boolean
 */
function validateBoolean(value, defaultValue = false) {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return Boolean(value);
}

/**
 * Validate and sanitize date fields
 * @param {any} value - Date value to validate
 * @returns {Date|null} Validated date or null
 */
function validateDate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Generic function to execute MySQL queries with proper error handling
 * @param {Object} connection - MySQL connection object
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Result object
 */
async function executeMysqlQuery(connection, query, params = []) {
  try {
    // Convert all undefined values to null in parameters
    const sanitizedParams = params.map(convertUndefinedToNull);

    const [result] = await connection.execute(query, sanitizedParams);
    return { success: true, result };
  } catch (error) {
    console.error("MySQL Query Error:", {
      query: query.substring(0, 100) + "...",
      error: error.message,
      params: params.map((p, i) => `${i}: ${typeof p} = ${p}`),
    });
    return { success: false, error: error.message };
  }
}

/**
 * Create a standardized error response
 * @param {string} message - Error message
 * @param {Error} error - Original error object
 * @returns {Object} Standardized error response
 */
function createErrorResponse(message, error = null) {
  return {
    success: false,
    error: message,
    details: error ? error.message : null,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a standardized success response
 * @param {Object} data - Success data
 * @param {string} message - Success message
 * @returns {Object} Standardized success response
 */
function createSuccessResponse(
  data = null,
  message = "Operation completed successfully"
) {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  convertUndefinedToNull,
  convertUndefinedToNullRecursive,
  prepareDataForMysql,
  validateString,
  validateNumber,
  validateBoolean,
  validateDate,
  executeMysqlQuery,
  createErrorResponse,
  createSuccessResponse,
};
