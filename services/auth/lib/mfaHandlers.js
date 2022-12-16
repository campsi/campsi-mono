const sendOtpCode = async (req, res) => {
  const verification = await req.verifyClient.verifications.create({ to: req.query.to, channel: req.query.channel });
  res.json(verification);
};

const verifyOtpCode = async (req, res) => {
  const verificationCheck = await req.verifyClient.verificationChecks.create({ to: req.query.to, code: req.body.code });
  res.json(verificationCheck);
};

const createTotpSeedFactor = async (req, res) => {
  // TODO: validate userId, check if present in DB
  const factor = await req.verifyClient.entities(req.query.userId).newFactors.create({
    friendlyName: req.query.friendlyName,
    factorType: 'totp'
  });

  res.json(factor);
};

const verifyTotpRegistrationCode = async (req, res) => {
  const verificationCheck = await req.verifyClient
    .entities(req.query.userId)
    .factors(req.query.factorSid)
    .update({ authPayload: req.query.code });
  // TODO: if success, store in db

  res.json(verificationCheck);
};

const verifyTotpCode = async (req, res) => {
  const challenge = await req.verifyClient
    .entities(req.query.userId)
    .challenges.create({ authPayload: req.query.code, factorSid: req.query.factorSid });
  res.json(challenge);
};

module.exports = { sendOtpCode, verifyOtpCode, createTotpSeedFactor, verifyTotpRegistrationCode, verifyTotpCode };
