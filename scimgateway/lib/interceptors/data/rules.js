const rules = [{
  "type": "all",
  "block_on_error": true,
  "allowed_requests": [
    {
      "path": "users",
      "method": "POST"
    }
  ],
  "conditions": [
    {
      "fact": "userName",
      "operator": "notEqual",
      "value": "admin"
    },
    {
      "fact": "userName",
      "operator": "notEqual",
      "value": "root"
    }
  ],
  "port": "8880",
  "position": 0
}];
            
module.exports = { rules };