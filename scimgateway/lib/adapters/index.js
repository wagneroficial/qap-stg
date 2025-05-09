const { notifications } = require("./data/notifications");
const { slackMessages } = require("./data/slackMessages");
const { twilioMessages } = require("./data/twilioMessages");

const { fetchNotification } = require("./functions/notifications");
const { sendSlackMessage } = require("./functions/slackMessages");
const { sendTwilioMessage } = require("./functions/twilioMessages");
const { getCacheInfo } = require("../utils/getCacheInfo");
const processExtConfig = require("../utils/processExtConfig");

function verifyAllowedRequests(allowedRequests, method, path) {
  return allowedRequests.some(
    (item) => item.method === method && item.path === path
  );
}

async function fetchAdapters(
  config,
  ctx,
  type,
  caches,
  verifyTracing,
  scimData
) {
  const port = config.port;

  const adapters = [
    ...(notifications?.map((item) => ({
      ...item,
      adapterType: "notification",
    })) || []),
    ...(slackMessages?.map((item) => ({
      ...item,
      adapterType: "slackMessage",
    })) || []),
    ...(twilioMessages?.map((item) => ({
      ...item,
      adapterType: "twilioMessage",
    })) || []),
  ].filter(
    (item) =>
      item.port === port.toString() &&
      item.type === type &&
      verifyAllowedRequests(
        item.allowed_requests,
        ctx.request.method,
        ctx.request.url.split("/")[1].toLowerCase()
      )
  );

  for (const item of adapters) {
    try {
      let newSpan = verifyTracing(ctx, `fetch adapter - ${item.adapterType}`);

      // getting cache info
      const formattedItem = await getCacheInfo(
        processExtConfig(item.adapterType, item),
        caches,
        port
      );

      switch (item.adapterType) {
        case "notification":
          await fetchNotification(ctx, formattedItem, scimData);
          break;
        case "slackMessage":
          await sendSlackMessage(ctx, formattedItem, scimData);
          break;
        case "twilioMessage":
          await sendTwilioMessage(ctx, formattedItem, scimData);
          break;
        default:
          break;
      }
      newSpan?.end();
    } catch (error) {
      console.error(`Error running adapter - ${item.adapterType}`);
      console.log(error);
    }
  }
  return true;
}

module.exports = { fetchAdapters };
