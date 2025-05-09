// =================================================================================
// File:    plugin-FlatFile.js
//
// Author: Konneqt
//
// Purpose: Custom SCIM Connector
//
// =================================================================================
"use strict";

// mandatory plugin initialization - start
const path = require("path");
let ScimGateway = require("./scimgateway");
const scimgateway = new ScimGateway();
const pluginName = path.basename(__filename, ".js");
const configDir = path.join(__dirname, "..", "config");
const configFile = path.join(`${configDir}`, `${pluginName}.json`);
let config = require(configFile).endpoint;
config = scimgateway.processExtConfig(pluginName, config); // add any external config process.env and process.file
scimgateway.authPassThroughAllowed = false; // true enables auth passThrough (no scimgateway authentication). scimgateway instead includes ctx (ctx.request.header) in plugin methods. Note, requires plugin-logic for handling/passing ctx.request.header.authorization to be used in endpoint communication
// mandatory plugin initialization - end

if (config?.connection?.authentication?.options?.password) {
  const password = scimgateway.getPassword(
    "endpoint.connection.authentication.options.password",
    configFile
  );
  config.connection.authentication.options.password = password;
}

// imports
const FlatDB = require("flat-db");

// configure path to storage dir
FlatDB.configure({
  dir: `/home/node/app/data`,
});

function getDefaultSchemaValue(type) {
  switch (type) {
    case "array":
      return [];
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return "";
  }
}

let userSchema = {};
let groupSchema = {};
let relationshipSchema = {};

Object.keys(config.map.user).forEach((item, index) => {
  if (index > 0) {
    userSchema[item] = getDefaultSchemaValue(config.map.user[item].type);
  }
});

Object.keys(config.map.group).forEach((item, index) => {
  if (index > 0) {
    groupSchema[item] = getDefaultSchemaValue(config.map.group[item].type);
  }
});

Object.keys(config.map.relationship).forEach((item, index) => {
  relationshipSchema[item] = getDefaultSchemaValue(
    config.map.relationship[item].type
  );
});

// create user collection with schema
const User = new FlatDB.Collection(config.connection.userFileName, userSchema);
const Group = new FlatDB.Collection(
  config.connection.groupFileName,
  groupSchema
);
const Relationship = new FlatDB.Collection(
  config.connection.relationshipFileName,
  relationshipSchema
);

// =================================================
// getUsers
// =================================================
scimgateway.getUsers = async (baseEntity, getObj, attributes, ctx) => {
  //
  // "getObj" = { attribute: <>, operator: <>, value: <>, rawFilter: <>, startIndex: <>, count: <> }
  // rawFilter is always included when filtering
  // attribute, operator and value are included when requesting unique object or simpel filtering
  // See comments in the "mandatory if-else logic - start"
  //
  // "attributes" is array of attributes to be returned - if empty, all supported attributes should be returned
  // Should normally return all supported user attributes having id and userName as mandatory
  // id and userName are most often considered as "the same" having value = <UserID>
  // Note, the value of returned 'id' will be used as 'id' in modifyUser and deleteUser
  // scimgateway will automatically filter response according to the attributes list
  //
  const action = "getUsers";
  scimgateway.logger.debug(
    `${pluginName}[${baseEntity}] handling "${action}" getObj=${
      getObj ? JSON.stringify(getObj) : ""
    } attributes=${attributes}`
  );

  let filter;

  // mandatory if-else logic - start
  if (getObj.operator) {
    if (
      getObj.operator === "eq" &&
      ["id", "userName", "externalId"].includes(getObj.attribute)
    ) {
      // mandatory - unique filtering - single unique user to be returned - correspond to getUser() in versions < 4.x.x

      filter = {
        ...(await scimgateway
          .endpointMapper(
            "outbound",
            { userName: getObj.value },
            config.map.user
          )
          .then((res) => res[0])),
      };
    } else if (getObj.operator === "eq" && getObj.attribute === "group.value") {
      // optional - only used when groups are member of users, not default behavior - correspond to getGroupUsers() in versions < 4.x.x
      throw new Error(
        `${action} error: not supporting groups member of user filtering: ${getObj.rawFilter}`
      );
    } else {
      // optional - simpel filtering
      throw new Error(
        `${action} error: not supporting simpel filtering: ${getObj.rawFilter}`
      );
    }
  } else if (getObj.rawFilter) {
    // optional - advanced filtering having and/or/not - use getObj.rawFilter
    throw new Error(
      `${action} not error: supporting advanced filtering: ${getObj.rawFilter}`
    );
  } else {
    // mandatory - no filtering (!getObj.operator && !getObj.rawFilter) - all users to be returned - correspond to exploreUsers() in versions < 4.x.x
    filter = {};
  }
  // mandatory if-else logic - end

  if (!filter)
    throw new Error(
      `${action} error: mandatory if-else logic not fully implemented`
    );

  try {
    return await new Promise((resolve, reject) => {
      const ret = {
        // itemsPerPage will be set by scimgateway
        Resources: [],
        totalResults: null,
      };

      async function main() {
        let users;
        if (getObj.value) {
          let result = await User.find().equals(
            Object.keys(filter)[0],
            Object.values(filter)[0]
          ).entries[0];
          users = result ? [result] : [];
        } else {
          users = await User.all();
        }

        for (const row in users) {
          let relationships = await Relationship.find().equals(
            "user_id",
            users[row]._id_
          ).entries;

          let groups = [];
          await relationships.forEach(async (item) => {
            let group = await Group.get(item.group_id);
            if (group) groups.push(group);
          });

          const groupsList = await Promise.all(
            groups.map(async (user) => {
              const formattedUser = await scimgateway
                .endpointMapper("inbound", user, config.map.group)
                .then((res) => res[0]);

              return {
                value: formattedUser.id,
                display: formattedUser.displayName,
              };
            })
          );

          const scimUser = await scimgateway
            .endpointMapper("inbound", users[row], config.map.user)
            .then((res) => res[0]);
          ret.Resources.push({
            ...scimUser,
            id: scimUser.userName,
            groups: groupsList,
          });
        }
      }

      main()
        .then(async () => {
          resolve(ret); // all explored users
        })
        .catch(async (err) => {
          return reject(err);
        });
    }); // Promise
  } catch (err) {
    scimgateway.formatError(action, err);
  }
};

// =================================================
// createUser
// =================================================
scimgateway.createUser = async (baseEntity, userObj, ctx) => {
  const action = "createUser";
  scimgateway.logger.debug(
    `${pluginName}[${baseEntity}] handling "${action}" userObj=${JSON.stringify(
      userObj
    )}`
  );

  try {
    return await new Promise(async (resolve, reject) => {
      const body = await scimgateway
        .endpointMapper("outbound", userObj, config.map.user)
        .then((res) => res[0]);

      const userNameField = Object.keys(config.map.user).find(
        (key) => config.map.user[key].mapTo === "userName"
      );

      const allUsers = await User.all();
      const allUserNames = allUsers.map((user) => user[userNameField]);

      async function main() {
        if (allUserNames.includes(userObj.userName)) {
          throw new Error(`Duplicate key at userName: ${userObj.userName}`);
        } else {
          await User.add(body);
        }
      }

      main()
        .then(async () => {
          resolve(null);
        })
        .catch(async (err) => {
          return reject(err);
        });
    }); // Promise
  } catch (err) {
    scimgateway.formatError(action, err);
  }
};

// =================================================
// deleteUser
// =================================================
scimgateway.deleteUser = async (baseEntity, id, ctx) => {
  const action = "deleteUser";
  scimgateway.logger.debug(
    `${pluginName}[${baseEntity}] handling "${action}" id=${id}`
  );

  try {
    return await new Promise((resolve, reject) => {
      async function main() {
        const userNameField = Object.keys(config.map.user).find(
          (key) => config.map.user[key].mapTo === "userName"
        );

        const selectedUser = await User.find(id).equals(userNameField, id)
          .entries[0];

        if (!selectedUser) {
          throw new Error(`User ${id} not found`);
        }

        const relationshipsToRemove = Relationship.find().equals(
          "user_id",
          id
        ).entries;

        await relationshipsToRemove.forEach(async (item) => {
          await Relationship.remove(item._id_);
        });

        await User.remove(selectedUser._id_);
      }

      main()
        .then(async () => {
          resolve(null);
        })
        .catch(async (err) => {
          return reject(err);
        });
    }); // Promise
  } catch (err) {
    scimgateway.formatError(action, err);
  }
};

// =================================================
// modifyUser
// =================================================
scimgateway.modifyUser = async (baseEntity, id, attrObj, ctx) => {
  const action = "modifyUser";
  scimgateway.logger.debug(
    `${pluginName}[${baseEntity}] handling "${action}" id=${id} attrObj=${JSON.stringify(
      attrObj
    )}`
  );

  try {
    return await new Promise(async (resolve, reject) => {
      const body = await scimgateway
        .endpointMapper("outbound", attrObj, config.map.user)
        .then((res) => res[0]);

      async function main() {
        const userNameField = Object.keys(config.map.user).find(
          (key) => config.map.user[key].mapTo === "userName"
        );

        const selectedUser = await User.find(id).equals(userNameField, id)
          .entries[0];

        await User.update(selectedUser._id_, body);
      }

      main()
        .then(async () => {
          resolve({ ...attrObj, id });
        })
        .catch(async (err) => {
          return reject(err);
        });
    }); // Promise
  } catch (err) {
    scimgateway.formatError(action, err);
  }
};

// =================================================
// getGroups
// =================================================
scimgateway.getGroups = async (baseEntity, getObj, attributes, ctx) => {
  //
  // "getObj" = { attribute: <>, operator: <>, value: <>, rawFilter: <>, startIndex: <>, count: <> }
  // rawFilter is always included when filtering
  // attribute, operator and value are included when requesting unique object or simpel filtering
  // See comments in the "mandatory if-else logic - start"
  //
  // "attributes" is array of attributes to be returned - if empty, all supported attributes should be returned
  // Should normally return all supported group attributes having id, displayName and members as mandatory
  // id and displayName are most often considered as "the same" having value = <GroupName>
  // Note, the value of returned 'id' will be used as 'id' in modifyGroup and deleteGroup
  // scimgateway will automatically filter response according to the attributes list
  //
  const action = "getGroups";
  scimgateway.logger.debug(
    `${pluginName}[${baseEntity}] handling "${action}" getObj=${
      getObj ? JSON.stringify(getObj) : ""
    } attributes=${attributes}`
  );

  // mandatory if-else logic - start
  if (getObj.operator) {
    if (
      getObj.operator === "eq" &&
      ["id", "displayName", "externalId"].includes(getObj.attribute)
    ) {
      // mandatory - unique filtering - single unique user to be returned - correspond to getUser() in versions < 4.x.x
    } else if (
      getObj.operator === "eq" &&
      getObj.attribute === "members.value"
    ) {
      // mandatory - return all groups the user 'id' (getObj.value) is member of - correspond to getGroupMembers() in versions < 4.x.x
      // Resources = [{ id: <id-group>> , displayName: <displayName-group>, members [{value: <id-user>}] }]
    } else {
      // optional - simpel filtering
    }
  } else if (getObj.rawFilter) {
    // optional - advanced filtering having and/or/not - use getObj.rawFilter
  } else {
    // mandatory - no filtering (!getObj.operator && !getObj.rawFilter) - all groups to be returned - correspond to exploreGroups() in versions < 4.x.x
  }
  // mandatory if-else logic - end

  try {
    return await new Promise((resolve, reject) => {
      const ret = {
        // itemsPerPage will be set by scimgateway
        Resources: [],
        totalResults: null,
      };

      async function main() {
        let groups;
        if (getObj.value) {
          let result = Group.get(getObj.value);
          groups = result ? [result] : [];
        } else {
          groups = Group.all();
        }

        for (const row in groups) {
          let relationships = await Relationship.find().equals(
            "group_id",
            groups[row]._id_
          ).entries;

          let users = [];
          await relationships.forEach(async (item) => {
            let user = await User.get(item.user_id);
            if (user) users.push(user);
          });

          const members = await Promise.all(
            users.map(async (user) => {
              const formattedUser = await scimgateway
                .endpointMapper("inbound", user, config.map.user)
                .then((res) => res[0]);

              return {
                value: formattedUser.id,
                display: formattedUser.userName,
              };
            })
          );

          const scimGroup = await scimgateway
            .endpointMapper("inbound", groups[row], config.map.group)
            .then((res) => res[0]);
          ret.Resources.push({ ...scimGroup, members });
        }
      }

      main()
        .then(async () => {
          resolve(ret); // all explored groups
        })
        .catch(async (err) => {
          return reject(err);
        });
    }); // Promise
  } catch (err) {
    scimgateway.formatError(action, err);
  }
};

// =================================================
// createGroup
// =================================================
scimgateway.createGroup = async (baseEntity, groupObj, ctx) => {
  const action = "createGroup";
  scimgateway.logger.debug(
    `${pluginName}[${baseEntity}] handling "${action}" groupObj=${JSON.stringify(
      groupObj
    )}`
  );

  try {
    return await new Promise(async (resolve, reject) => {
      const body = await scimgateway
        .endpointMapper("outbound", groupObj, config.map.group)
        .then((res) => res[0]);

      async function main() {
        return await Group.add(body);
      }

      main()
        .then(async (res) => {
          resolve({ ...groupObj, id: res });
        })
        .catch(async (err) => {
          return reject(err);
        });
    }); // Promise
  } catch (err) {
    scimgateway.formatError(action, err);
  }
};

// =================================================
// deleteGroup
// =================================================
scimgateway.deleteGroup = async (baseEntity, id, ctx) => {
  const action = "deleteGroup";
  scimgateway.logger.debug(
    `${pluginName}[${baseEntity}] handling "${action}" id=${id}`
  );

  try {
    return await new Promise(async (resolve, reject) => {
      async function main() {
        const selectedGroup = await Group.get(id);

        if (!selectedGroup) {
          throw new Error(`Group ${id} not found`);
        }

        const relationshipsToRemove = Relationship.find().equals(
          "group_id",
          id
        ).entries;

        await relationshipsToRemove.forEach(async (item) => {
          await Relationship.remove(item._id_);
        });

        await Group.remove(id);
      }

      main()
        .then(async () => {
          resolve(null);
        })
        .catch(async (err) => {
          return reject(err);
        });
    }); // Promise
  } catch (err) {
    scimgateway.formatError(action, err);
  }
};

// =================================================
// modifyGroup
// =================================================
scimgateway.modifyGroup = async (baseEntity, id, attrObj, ctx) => {
  const action = "modifyGroup";
  scimgateway.logger.debug(
    `${pluginName}[${baseEntity}] handling "${action}" id=${id} attrObj=${JSON.stringify(
      attrObj
    )}`
  );

  try {
    return await new Promise(async (resolve, reject) => {
      const body = await scimgateway
        .endpointMapper("outbound", attrObj, config.map.group)
        .then((res) => res[0]);

      async function main() {
        const selectedGroup = await Group.get(id);
        if (!selectedGroup) {
          throw new Error(`Group ${id} not found`);
        }

        if (attrObj.members?.length) {
          for (const memberIndex in attrObj.members) {
            const member = attrObj.members[memberIndex];

            const userFilter = await scimgateway
              .endpointMapper(
                "outbound",
                { userName: member.value },
                config.map.user
              )
              .then((res) => res[0]);

            const user = await User.find().equals(
              Object.keys(userFilter)[0],
              member.value
            ).entries[0];

            if (!user) {
              throw new Error(`User ${member.value} not found`);
            }

            const relData = { user_id: user?._id_, group_id: id };
            const selectedRelationShip = Relationship.find()
              .equals("user_id", user._id_)
              .equals("group_id", id).entries[0];

            if (member.operation === "delete") {
              if (selectedRelationShip) {
                await Relationship.remove(selectedRelationShip._id_);
              }
            } else {
              if (!selectedRelationShip) {
                await Relationship.add(relData);
              } else {
                console.log("relationship already exists");
              }
            }
          }
        }

        // update group
        if (Object.keys(body).length) {
          await Group.update(id, body);
        }
      }

      main()
        .then(async () => {
          resolve(null);
        })
        .catch(async (err) => {
          return reject(err);
        });
    }); // Promise
  } catch (err) {
    scimgateway.formatError(action, err);
  }
};

// =================================================
// helpers
// =================================================

//
// Cleanup on exit
//
process.on("SIGTERM", () => {
  // kill
});
process.on("SIGINT", () => {
  // Ctrl+C
});
