const { getUsersCollectionName } = require('./modules/collectionNames');
const createObjectId = require('../../../lib/modules/createObjectId');
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

  await req.campsi.db.collection(getUsersCollectionName()).updateOne(
    { _id: createObjectId(req.query.userId) },
    {
      $set: {
        'data.authenticationPreference.totpFactor': { sid: factor.sid, status: factor.status, uri: factor.binding.uri },
        'data.authenticationPreference.mode': 'totp'
      }
    }
  );

  res.json({
    sid: factor.sid,
    status: factor.status,
    uri: factor.binding.uri
  });
};

const verifyTotpRegistrationCode = async (req, res) => {
  // TODO: validate userId & factorSid, check if present in DB
  const verificationCheck = await req.verifyClient
    .entities(req.query.userId)
    .factors(req.query.factorSid)
    .update({ authPayload: req.query.code });

  const updates = {
    $set: { 'data.authenticationPreference.totpFactor.status': verificationCheck.status }
  };
  if (verificationCheck.status === 'verified') {
    updates.$unset = { 'data.authenticationPreference.totpFactor.uri': undefined };
  }

  await req.campsi.db.collection(getUsersCollectionName()).updateOne({ _id: createObjectId(req.query.userId) }, updates);

  res.json(verificationCheck);
};

const verifyTotpCode = async (req, res) => {
  // TODO: validate userId & factorSid, check if present in DB
  const challenge = await req.verifyClient
    .entities(req.query.userId)
    .challenges.create({ authPayload: req.query.code, factorSid: req.query.factorSid });
  res.json(challenge);
};

module.exports = { sendOtpCode, verifyOtpCode, createTotpSeedFactor, verifyTotpRegistrationCode, verifyTotpCode };
