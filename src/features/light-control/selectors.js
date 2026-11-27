/**
 * Returns whether the light control panel is currently activated.
 */
export function isLightControlActive(state) {
  return state.lightControl.active;
}

/**
 * Returns the colour of the whole fleet, in hex notation.
 */
export function getFleetColorInLightControlPanel(state) {
  return state.lightControl.color;
}

/**
 * Returns the colour that the light control panel shows, in hex notation: the
 * fleet's, or the one last given to the selected drones.
 */
export function getCurrentColorInLightControlPanel(state) {
  return getLightControlTarget(state) === 'selected'
    ? (state.lightControl.selectedColor ?? '#ffffff')
    : state.lightControl.color;
}

/**
 * Returns which drones the colours of the light control panel go to.
 */
export function getLightControlTarget(state) {
  return state.lightControl.target ?? 'all';
}

/**
 * Returns whether the whole fleet shows the fleet colour while the lights are
 * controlled from the GCS.
 */
export function isFleetColorOn(state) {
  return state.lightControl.fleetColorOn ?? true;
}
