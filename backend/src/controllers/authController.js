const env = require('../config/env');
const authService = require('../services/authService');
const { httpError } = require('../utils/errors');

function setRefreshCookie(res, refreshToken) {
  const cookie = env.auth.cookie;
  res.cookie(cookie.name, refreshToken, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    domain: cookie.domain,
    path: cookie.path,
    maxAge: cookie.maxAgeMs,
  });
}

function clearRefreshCookie(res) {
  const cookie = env.auth.cookie;
  res.clearCookie(cookie.name, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    domain: cookie.domain,
    path: cookie.path,
  });
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await authService.verifyCredentials(email, password);
  const session = await authService.createSession(user);
  setRefreshCookie(res, session.refreshToken);
  res.status(200).json({ accessToken: session.accessToken, user: session.user });
}

async function refresh(req, res) {
  const cookieName = env.auth.cookie.name;
  const refreshToken = req.cookies && req.cookies[cookieName];
  if (typeof refreshToken !== 'string' || refreshToken === '') {
    throw httpError(401, 'REFRESH_TOKEN_REQUIRED', 'Refresh token is required');
  }
  const rotated = await authService.rotateRefreshToken(refreshToken);
  setRefreshCookie(res, rotated.refreshToken);
  res.status(200).json({ accessToken: rotated.accessToken, user: rotated.user });
}

async function logout(req, res) {
  const cookieName = env.auth.cookie.name;
  const refreshToken = req.cookies && req.cookies[cookieName];
  await authService.revokeSession(refreshToken);
  clearRefreshCookie(res);
  res.status(204).send();
}

async function me(req, res) {
  res.status(200).json({ user: req.user });
}

module.exports = {
  login,
  refresh,
  logout,
  me,
  setRefreshCookie,
  clearRefreshCookie,
};
