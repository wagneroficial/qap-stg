const { rules } = require("./data/rules");
const { requests } = require("./data/requests");
const { requestsWithRules } = require("./data/requestsWithRules");
const { validateEmail } = require("./data/validateEmail");
const { elementsToFind } = require("./data/elementsToFind");

const { verifyRules } = require("./functions/rules");
const { fetchApi } = require("./functions/api");
const { fetchApiWithRule } = require("./functions/requestsWithRules");
const { getCacheInfo } = require("../utils/getCacheInfo");
const processExtConfig = require("../utils/processExtConfig");
const { handleValidateEmail } = require("./functions/validateEmail");
const { fetchAndFind } = require("./functions/fetchAndFind");

function verifyAllowedRequests(allowedRequests, method, path) {
  return allowedRequests.some(
    (item) => item.method === method && item.path === path
  );
}

async function fetchInterceptors(
  config,
  ctx,
  caches,
  verifyTracing,
  endpointMapper
) {
  const port = config.port;

  const interceptors = [
    ...(requests?.map((item) => ({ ...item, interceptorType: "request" })) ||
      []),
    ...(rules?.map((item) => ({ ...item, interceptorType: "rule" })) || []),
    ...(validateEmail?.map((item) => ({
      ...item,
      interceptorType: "validate-email",
    })) || []),
    ...(requestsWithRules?.map((item) => ({
      ...item,
      interceptorType: "request-with-rule",
    })) || []),
    ...(elementsToFind?.map((item) => ({
      ...item,
      interceptorType: "fetch-and-find",
    })) || []),
  ]
    .filter(
      (item) =>
        item.port === port.toString() &&
        verifyAllowedRequests(
          item.allowed_requests,
          ctx.request.method,
          ctx.request.url.split("/")[1].toLowerCase()
        )
    )
    .sort((a, b) => a.position - b.position);

  for (const item of interceptors) {
    try {
      let newSpan = verifyTracing(
        ctx,
        `fetch interceptors - ${item.interceptorType}`
      );

      // getting cache info
      const formattedItem = await getCacheInfo(
        processExtConfig(item.interceptorType, item),
        caches,
        port
      );

      switch (item.interceptorType) {
        case "request":
          await fetchApi(ctx, formattedItem, endpointMapper);
          break;
        case "rule":
          await verifyRules(ctx, formattedItem);
          break;
        case "request-with-rule":
          await fetchApiWithRule(ctx, formattedItem, endpointMapper);
          break;
        case "fetch-and-find":
          await fetchAndFind(ctx, formattedItem, endpointMapper);
          break;
        case "validate-email":
          await handleValidateEmail(ctx, formattedItem);
          break;
        default:
          break;
      }
      newSpan?.end();
    } catch (error) {
      let errorMessage = error.message;
      switch (item.interceptorType) {
        // case "request":
        //   errorMessage = `Request to ${item.url} failed`;
        //   break;
        case "rule":
          if (error.message.search("Undefined fact") >= 0) {
            errorMessage = `Missing one of required fields: ${item.conditions.map(
              (cd) => cd.fact
            )}`;
            break;
          }
          errorMessage = `${error.message} - rules verified: ${ctx.body?.rules}`;
          break;
        case "apiWithRule":
          errorMessage = `Error occurred in apiWithRule interceptor: ${error.message}`;
          break;
        default:
          break;
      }

      try {
        if (item.on_error) {
          function executeScript(obj) {
            eval?.(`"use strict";(${obj})`);
          }
          executeScript(item.on_error);
        }
      } catch (catchError) {
        console.log(`Error running on error script: ${catchError.message}`);
      }

      if (item.block_on_error !== undefined ? item.block_on_error : true) {
        ctx.status = 400;
        ctx.body = {
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail:
            item.errorMessage ||
            `Error while running interceptor (${item.interceptorType}): ${errorMessage}`,
          status: 400,
        };
        return false;
      }
    }
  }
  return true;
}

module.exports = { fetchInterceptors };
