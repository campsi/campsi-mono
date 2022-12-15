const accountSid = 'REDACTED';
const authToken = 'REDACTED';
const client = require('twilio')(accountSid, authToken);
const serviceSID = 'REDACTED';

const verifyClient = client.verify.v2.services(serviceSID);

const sendOtpCode = async (req, res) => {
  const verification = await verifyClient.verifications.create({ to: req.query.to, channel: req.query.channel });
  res.json(verification);
};

const verifyOtpCode = async (req, res) => {
  const verificationCheck = await verifyClient.verificationChecks.create({ to: req.query.to, code: req.body.code });
  res.json(verificationCheck);
};

const createTotpSeedFactor = async (req, res) => {
  const factor = await verifyClient.entities(req.query.userId).newFactors.create({
    friendlyName: req.query.friendlyName,
    factorType: 'totp'
  });
  res.json(factor);
};

const verifyTotpCode = async (req, res) => {
  const verificationCheck = await verifyClient
    .entities(req.query.userId)
    .factors(req.query.factorSid)
    .update({ authPayload: req.query.code });
  res.json(verificationCheck);
};

module.exports = { sendOtpCode, verifyOtpCode, createTotpSeedFactor, verifyTotpCode };
