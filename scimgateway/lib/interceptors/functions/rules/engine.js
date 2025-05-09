let Engine;
try {
  JsonRulesEngine = require("json-rules-engine");
  Engine = JsonRulesEngine.Engine;
} catch (err) {}

async function createEngine(type, conditions, ctx) {
  let engine = new Engine();

  let conditionsString = conditions.map((cd) => {
    return `${cd.fact} ${cd.operator} ${cd.value}`;
  });

  engine.addRule({
    conditions: {
      [type]: conditions,
    },
    onSuccess() {
      return;
    },
    onFailure() {
      let errorBody = ctx?.body || [];
      ctx.body = {
        rules: [...errorBody, ...conditionsString],
      };
      throw new Error("verification failed");
    },
    event: {
      type: "message",
    },
  });

  return engine;
}

module.exports = { createEngine };
