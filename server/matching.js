'use strict';

/* Split a name into lowercase words with accents and punctuation removed.
   "Amina  Mensah-Boateng" -> ["amina", "mensah", "boateng"] */
function tokens(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/* Two names match when they have the same words in any order
   ("Mensah Amina" = "Amina Mensah"), or when the shorter name has at least
   two words and all of them appear in the longer one
   ("Amina Mensah" matches "Amina Akua Mensah"). A single shared word such as
   "Kwame" is not enough. */
function namesMatch(a, b) {
  var A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return false;
  var small = A.size <= B.size ? A : B, big = small === A ? B : A;
  for (var t of small) if (!big.has(t)) return false;
  return small.size === big.size || small.size >= 2;
}

module.exports = { tokens, namesMatch };
