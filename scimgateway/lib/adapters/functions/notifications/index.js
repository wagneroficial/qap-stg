const { formatAuth } = require("../../../utils/formatAuth");
const { formatURL } = require("../../../utils/formatURL");
const axios = require("axios");
let api;
try {
  api = require("@opentelemetry/api");
} catch (err) {}

async function fetchNotification(ctx, item, scimData) {
  const hasScimData = scimData && scimData.length;
  let formattedBody = hasScimData ? scimData[0] : ctx.request.body;

  if (ctx.request.url.split("/").length > 2) {
    formattedBody.userName =
      formattedBody?.userName || ctx.request.url.split("/").at(-1);
  }

  let formattedURL = formatURL(
    ctx.request.body,
    item.use_url ? `${item.url}${ctx.request.url}` : `${item.url}`
  );

  let formattedAuth = (
    await formatAuth(item.auth, `http://localhost:${item.port}`)
  ).token;

  const headers = {
    Authorization: formattedAuth,
    ...(item.headers || {}),
  };

  const activeSpan = api?.trace.getSpan(api?.context.active());
  activeSpan?.addEvent("Adapter: Sending notification");

  const response = await axios
    .request({
      url: formattedURL,
      method: item.method,
      headers,
      data: {
        info: {
          url: ctx.request.url,
          method: ctx.request.method,
          type: item.type,
          payload: item.payload,
        },
        data: item.payload === "response" ? ctx.body : formattedBody,
      },
    })
    .catch((err) => {
      activeSpan?.addEvent("Adapter: Error sending notification");
      throw new Error(`Error sending notification ${err}}`);
    });
}

module.exports = { fetchNotification };
