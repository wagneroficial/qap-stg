const dot = require("dot-object");
let api;
try {
  api = require("@opentelemetry/api");
} catch (err) {}

const publicEmailDomains = [
  "gmail.com",
  "hotmail.com",
  "yahoo.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
  "globo.com",
  "zipmail.com.br",
  "r7.com",
];

/**
 * Checks if the email is valid and matches the specified type ("public" or "corporate").
 * @param {string} email - Email to check.
 * @param {"public" | "corporate"} type - Type to validate against.
 * @returns {boolean}
 */
function isEmailValid(email, type) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) return false;

  const domain = email.split("@")[1].toLowerCase();

  switch (type) {
    case "public":
      return publicEmailDomains.includes(domain);
    case "corporate":
      return !publicEmailDomains.includes(domain);
    default:
      return false;
  }
}

/**
 * Validates an email and throws an error if invalid.
 * @param {string} email - The email to validate.
 * @param {string} type - The type of email to allow ("public" or "corporate").
 * @param {string} errorMessage - The error message to throw if validation fails.
 */
function validateAndThrow(email, type, errorMessage) {
  if (!isEmailValid(email, type)) {
    throw new Error(errorMessage);
  }
}

async function handleValidateEmail(ctx, item) {
  const activeSpan = api?.trace.getSpan(api?.context.active());
  activeSpan?.addEvent("Interceptor: Validate Email");

  const flatObj = dot.dot(ctx.request.body);
  const regex = /^emails.*\.value$/; // Regex to match keys starting with "emails" and ending with ".value"

  // Validate username if required
  if (item.validade_username) {
    validateAndThrow(
      ctx.request.body.userName,
      item.type || "corporate",
      `Invalid email domain: ${ctx.request.body.userName} - accepting only ${item.type} emails`
    );
  }

  // Validate all email fields matching the regex
  for (const [key, value] of Object.entries(flatObj)) {
    if (regex.test(key)) {
      validateAndThrow(
        value,
        item.type || "corporate",
        `Invalid email domain: ${value} - accepting only ${item.type} emails`
      );
    }
  }
}

module.exports = { handleValidateEmail };
