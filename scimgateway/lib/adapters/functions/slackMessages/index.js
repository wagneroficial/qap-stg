let WebClient;
try {
  const slackWebApi = require("@slack/web-api");
  WebClient = slackWebApi.WebClient;
} catch (err) {}

let api;
try {
  api = require("@opentelemetry/api");
} catch (err) {}

async function sendSlackMessage(ctx, item, scimData) {
  const web = new WebClient(item.token);

  const hasScimData = scimData && scimData.length;
  let formattedBody = hasScimData ? scimData[0] : ctx.request.body;

  if (ctx.request.url.split("/").length > 2) {
    formattedBody.userName =
      formattedBody?.userName || ctx.request.url.split("/").at(-1);
  }

  const activeSpan = api?.trace.getSpan(api?.context.active());
  activeSpan?.addEvent("Adapter: Sending Slack message");

  await web.chat
    .postMessage({
      channel: item.channel_id,
      username: `QSCIM Notifications - ${ctx.request.url
        .split("/")[1]
        .toLowerCase()} - ${item.type}`,
      // icon_emoji: ":robot_face:",
      text: `Notification: ${ctx.request.url.split("/")[1].toLowerCase()} - ${
        item.type
      }
     \`\`\` ${JSON.stringify(
       item.payload === "response" ? ctx.body : formattedBody,
       null,
       2
     )} \`\`\``,
    })
    .then((res) => {
      console.log("Message sent to Slack!");
    })
    .catch((err) => {
      activeSpan?.addEvent("Adapter: Error sending Slack message");
      throw new Error(err);
    });
}

module.exports = { sendSlackMessage };
