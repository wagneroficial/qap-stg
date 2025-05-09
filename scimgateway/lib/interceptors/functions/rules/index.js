const { createEngine } = require("./engine");
let api;
try {
  api = require("@opentelemetry/api");
} catch (err) {}

async function verifyRules(ctx, rule) {
  const activeSpan = api?.trace.getSpan(api?.context.active());
  activeSpan?.addEvent("Interceptor: Verify business rule");

  let engine = await createEngine(rule.type, rule.conditions, ctx);

  await engine.run(ctx.request.body);
}

module.exports = { verifyRules };
