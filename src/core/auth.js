// Аккаунты: вход через Microsoft (почта Microsoft / Xbox) и офлайн-режим.
const crypto = require('crypto');
const { Auth } = require('msmc');
const { offlineUuid } = require('./minecraft');

/** Открывает окно входа Microsoft — пользователь вводит свою почту и пароль. */
async function loginMicrosoft() {
  const auth = new Auth('select_account');
  const xbox = await auth.launch('electron', {
    width: 520, height: 680, resizable: false, title: 'Вход в аккаунт Microsoft',
  });
  return finishMicrosoft(xbox);
}

async function refreshMicrosoft(saved) {
  const auth = new Auth('select_account');
  const xbox = await auth.refresh(saved.refreshToken);
  return finishMicrosoft(xbox);
}

async function finishMicrosoft(xbox) {
  const mc = await xbox.getMinecraft();
  if (!mc.profile) throw new Error('На этом аккаунте Microsoft нет лицензии Minecraft: Java Edition');
  return {
    type: 'microsoft',
    name: mc.profile.name,
    uuid: mc.profile.id,
    accessToken: mc.mcToken,
    xuid: mc.xuid,
    refreshToken: xbox.save(),
    expires: mc.exp,
  };
}

function loginOffline(name) {
  const clean = String(name || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) {
    throw new Error('Ник: 3–16 символов, только латиница, цифры и «_»');
  }
  return {
    type: 'offline',
    name: clean,
    uuid: offlineUuid(clean),
    accessToken: crypto.randomBytes(16).toString('hex'),
  };
}

module.exports = { loginMicrosoft, refreshMicrosoft, loginOffline };
