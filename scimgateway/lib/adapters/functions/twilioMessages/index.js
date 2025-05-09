let api;
try {
  api = require("@opentelemetry/api");
} catch (err) {}

async function sendTwilioMessage(ctx, item) {
  const activeSpan = api?.trace.getSpan(api?.context.active());
  activeSpan?.addEvent("Adapter: Sending Twilio message");

  const client = require("twilio")(item.accountSid, item.authToken);

  await client.messages
    .create({
      from: item.from,
      contentSid: item.contentSid,
      contentVariables: `{"1":"${item.code}"}`,
      to: `whatsapp:${ctx.body.phoneNumbers[0].value}`,
    })
    .then((message) => console.log(message.sid));

  console.log({
    from: item.from,
    contentSid: item.contentSid,
    contentVariables: `{"1":"${item.code}"}`,
    to: `whatsapp:${ctx.body.phoneNumbers[0].value}`,
  });
}

module.exports = { sendTwilioMessage };
