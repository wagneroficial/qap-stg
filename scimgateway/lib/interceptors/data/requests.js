const requests = [{
  "url": "https://viacep.com.br/ws/01001000/json/",
  "method": "GET",
  "allowed_requests": [
    {
      "path": "users",
      "method": "POST"
    }
  ],
  "auth": {
    "type": "none"
  },
  "errorMessage": "Error occurred",
  "mapping": {
    "logradouro": {
      "mapTo": "addresses.work.streetAddress",
      "type": "string"
    }
  },
  "port": "121",
  "position": 0
}];
            
module.exports = { requests };