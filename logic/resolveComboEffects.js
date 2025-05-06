// logic/resolveComboEffects.js

import { duelState } from './duelState.js';
import { applyCardEffect } from './cardEffectHandler.js';
import { triggerAnimation } from './animationTrigger.js';

const COMBO_PAIRS = [
  {
    tags: ['burn', 'ignite'],
    name: 'Shock and Awe',
    bonusEffect: { type: 'damage', value: 50 },
    animation: 'explosion'
  },
  {
    tags: ['heal', 'regen'],
    name: 'Overheal Combo',
    bonusEffect: { type: 'heal', value: 30 },
    animation: 'heal'
  },
  {
    tags: ['poison', 'toxin'],
    name: 'Toxic Burst',
    bonusEffect: { type: 'damage', value: 40 },
    animation: 'poison'
  },
  {
    tags: ['trap', 'tripwire'],
    name: 'Ambush Combo',
    bonusEffect: { type: 'force_discard', value: 1 },
    animation: 'trap'
  },
  {
    tags: ['sniper', 'rangefinder'],
    name: 'Deadshot Combo',
    bonusEffect: { type: 'damage', value: 75 },
    animation: 'bullet'
  },
  {
    tags: ['steal', 'loot'],
    name: 'Loot Frenzy',
    bonusEffect: { type: 'steal', value: 1 },
    animation: 'loot'
  },
  {
    tags: ['infected', 'pounce'],
    name: 'Pack Hunter',
    bonusEffect: { type: 'damage', value: 40 },
    animation: 'infected'
  },
  {
    tags: ['gas', 'containment'],
    name: 'Quarantine Combo',
    bonusEffect: { type: 'force_discard', value: 2 },
    animation: 'poison'
  },
  {
    tags: ['shield', 'block'],
    name: 'Fortify Combo',
    bonusEffect: { type: 'heal', value: 20 },
    animation: 'shield'
  },
  {
    tags: ['melee', 'adrenaline'],
    name: 'Rage Combo',
    bonusEffect: { type: 'damage', value: 35 },
    animation: 'attack'
  }
];

// Utility to extract tag list from a card object
function getCardTags(card) {
  return card.tags || [];
}

export function checkAndResolveCombo(playerKey, fieldCards) {
  const combosTriggered = [];

  // Check all pairs of cards on the field
  for (let i = 0; i < fieldCards.length; i++) {
    for (let j = i + 1; j < fieldCards.length; j++) {
      const tags1 = getCardTags(fieldCards[i]);
      const tags2 = getCardTags(fieldCards[j]);

      for (const combo of COMBO_PAIRS) {
        if (
          combo.tags.every(tag =>
            tags1.includes(tag) || tags2.includes(tag)
          )
        ) {
          // Combo matched
          applyCardEffect(playerKey, { logicActions: [combo.bonusEffect] });
          triggerAnimation(combo.animation, playerKey);
          combosTriggered.push(combo.name);
        }
      }
    }
  }

  return combosTriggered;
}
