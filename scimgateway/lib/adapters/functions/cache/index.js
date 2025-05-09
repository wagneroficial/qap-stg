const { DataCache } = require("./DataCache");
const { caches } = require("../../data/caches");
const { createCacheFetchFunction } = require("./fetchFunction");
const processExtConfig = require("../../../utils/processExtConfig");

function cache() {
  let cachesObj = {};
  caches.forEach((item) => {
    const formattedItem = processExtConfig(item.name, item);

    cachesObj[formattedItem.name] = new DataCache(
      async () => await createCacheFetchFunction(formattedItem),
      formattedItem.port,
      formattedItem.expires_in
    );
  });

  return cachesObj;
}

module.exports = { cache };
