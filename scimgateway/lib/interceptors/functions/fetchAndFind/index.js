const { formatAuth } = require("../../../utils/formatAuth");
const { formatURL } = require("../../../utils/formatURL");
const axios = require("axios");

let api;
try {
  api = require("@opentelemetry/api");
} catch (err) {}

async function fetchAndFind(ctx, request, endpointMapper) {
  const activeSpan = api?.trace.getSpan(api?.context.active());
  activeSpan?.addEvent("Interceptor: Fetch to API");

  const port = ctx.request.header.host.split(":")[1];
  let formattedURL = formatURL(ctx.request.body, request.url);

  let formattedAuth = (
    await formatAuth(request.auth, `http://localhost:${port}`)
  ).token;

  const headers = {
    Authorization: formattedAuth,
    ...(request.headers || {}),
  };

  const response = await axios
    .request({
      url: formattedURL,
      method: request.method,
      headers,
      data: request.body,
    })
    .then((res) => {
      return request.dataField ? res.data[request.dataField] : res.data;
    })
    .catch((err) => {
      console.log(err);
    });

  let selectedElement = response.find(
    (item) =>
      item[request.response_field] === ctx.request.body[request.request_field]
  );

  if (!selectedElement) {
    throw new Error(
      `Referece element not found: ${ctx.request.body[request.request_field]}`
    );
  } else {
    console.log("Reference element found!");
    const path = selectedElement.id.split("%2C").slice(1).join("%2C");
    const decoded = decodeURIComponent(path);
    console.log(decoded);

    const entitlements = [{ type: "userbase", value: decoded }];

    ctx.request.body = {
      ...ctx.request.body,
      entitlements,
      externalId: undefined,
    };
  }
}

module.exports = { fetchAndFind };
