const dot = require("dot-object");

function processExtConfig(pluginName, config, isMain) {
  const processEnv = "process.env.";
  const processFile = "process.file.";
  const processText = "process.text.";
  const dotConfig = dot.dot(config);
  const processTexts = new Map();
  const processFiles = new Map();

  for (const key in dotConfig) {
    let value = dotConfig[key];
    if (value && value.constructor === String && value.includes(processEnv)) {
      const envKey = value.substring(processEnv.length);
      value = process.env[envKey];
      dotConfig[key] = value;
      if (!value) {
        const newErr = new Error(
          `configuration failed - can't use none existing environment: "${envKey}"`
        );
        newErr.name = "processExtConfig";
        throw newErr;
      }
    } else if (
      value &&
      value.constructor === String &&
      value.includes(processText)
    ) {
      const filePath = value.substring(processText.length);
      try {
        if (!processTexts.has(filePath)) {
          // avoid reading previous file
          processTexts.set(filePath, fs.readFileSync(filePath, "utf8"));
        }
        value = processTexts.get(filePath); // directly a string
      } catch (err) {
        value = undefined;
        throw new Error(
          `configuration failed - can't read text from external file: "${filePath}"`
        );
      }
      dotConfig[key] = value;
    } else if (
      value &&
      value.constructor === String &&
      value.includes(processFile)
    ) {
      const filePath = value.substring(processFile.length);
      try {
        if (!processFiles.has(filePath)) {
          // avoid reading previous file
          processFiles.set(
            filePath,
            JSON.parse(fs.readFileSync(filePath, "utf8"))
          );
        }
        try {
          const jContent = processFiles.get(filePath); // json or json-dot-notation formatting is supported
          const dotContent = dot.dot(dot.object(jContent));
          let newKey = null;
          if (isMain) newKey = `${pluginName}.scimgateway.${key}`;
          else newKey = `${pluginName}.endpoint.${key}`;
          value = dotContent[newKey];
          if (value === undefined) {
            if (dotContent[newKey + ".0"]) {
              // check if array
              let i = 0;
              do {
                dotConfig[key + "." + i] = dotContent[newKey + "." + i];
                i += 1;
              } while (dotContent[newKey + "." + i]);
            } else {
              const newErr = new Error(
                `configuration failed - external JSON file "${filePath}" does not contain key: "${newKey}"`
              );
              newErr.name = "processExtConfig";
              throw newErr;
            }
          }
        } catch (err) {
          if (err.name && err.name === "processExtConfig") throw err;
          else {
            const newErr = new Error(
              `configuration failed - can't JSON parse external file: "${filePath}"`
            );
            newErr.name = "processExtConfig";
            throw newErr;
          }
        }
      } catch (err) {
        value = undefined;
        if (err.name && err.name === "processExtConfig") throw err;
        else
          throw new Error(
            `configuration failed - can't read external configuration file: ${err.message}`
          );
      }
      dotConfig[key] = value;
    }
  }
  processTexts.clear();
  processFiles.clear();
  return dot.object(dotConfig);
}

module.exports = processExtConfig;
