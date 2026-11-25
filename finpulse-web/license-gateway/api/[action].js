const { dispatchLicenseRequest } = require('../handlers');

module.exports = async (req, res) => {
  const action = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;
  return dispatchLicenseRequest(action, req, res);
};

