const SESSION_KEY = 'standupindo_public_promo_popup_v1';

export function hasPublicPromoPopupShown() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === 'shown';
  } catch {
    return false;
  }
}

export function claimPublicPromoPopup() {
  try {
    if (hasPublicPromoPopupShown()) return false;
    window.sessionStorage.setItem(SESSION_KEY, 'shown');
  } catch {
    return true;
  }
  return true;
}
