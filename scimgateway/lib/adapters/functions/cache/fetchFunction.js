const { formatAuth } = require("../../../utils/formatAuth");
const axios = require("axios");
let api;
try {
  api = require("@opentelemetry/api");
} catch (err) {}

async function createCacheFetchFunction(request) {
  const activeSpan = api?.trace.getSpan(api?.context.active());
  let accountant = 0;
  const maxAttempts = request.retryCount || 1;

  while (accountant < maxAttempts) {
    try {
      console.log(`Attempt ${accountant + 1} of ${maxAttempts}`);

      let headers = {
        Authorization: (
          await formatAuth(request.auth, `http://localhost:${request.port}`)
        ).token,
        ...request.headers,
      };

      activeSpan?.addEvent("Getting Cache");

      const response = await axios
        .request({
          url: request.url,
          method: request.method,
          headers,
          data: request.body,
        })
        .then((res) => res.data);

      let responseAttrs = request.defaultBody || {};
      request.mapping.forEach((item) => {
        responseAttrs[item.mapTo] = response[item.name];
      });

      console.log("Response received and processed successfully");
      return responseAttrs;
    } catch (error) {
      activeSpan?.addEvent("Adapter: Error sending notification");
      console.log("Error caching information:", error.message);

      accountant++;
      if (accountant >= maxAttempts) {
        console.log("Max attempts reached");
        if (request.blockOnError) {
          throw new Error("Error caching information: " + error.message);
        }

        let responseAttrs = request.defaultBody || {};
        request.mapping.forEach((item) => {
          responseAttrs[item.mapTo] = responseAttrs[item.name];
        });
        return responseAttrs;
      }
      console.log("Retrying...");
    }
  }
}

module.exports = { createCacheFetchFunction };
