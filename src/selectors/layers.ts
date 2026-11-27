/**
 * @file Selectors that are related to the map layers.
 */

import type { Layer } from '~/model/layers';
import type { AppSelector } from '~/store/reducers';
import type { Collection, Identifier } from '~/utils/collections';

/**
 * Selector that retrieves the list of layers on the map from the state object.
 *
 * @param state The state of the application.
 * @return The list of layers on the map.
 */
export const getLayers: AppSelector<Collection<Layer>> = (state) =>
  state.map.layers;

/**
 * Selector that retrieves a given layer by its identifier.
 *
 * @param id The identifier of the layer to get.
 * @return Object containing the properties of the selected layer.
 */
export const getLayerById =
  (id: Identifier): AppSelector<Layer | undefined> =>
  (state) =>
    getLayers(state).byId[id];
