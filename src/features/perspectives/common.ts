import { type PerspectiveName, type PerspectiveObject } from 'perspective';

/* Object holding well-known panel layouts that may potentially be used in
 * multiple configuration files. Perspective configurations may refer to these
 * by their names only */
const commonLayouts: Record<PerspectiveName, PerspectiveObject> = {
  /* The working layout of a show: the venue and the fleet side by side with
   * the show sequence, which stays in view at all times */
  default: {
    label: 'Default',
    layout: {
      type: 'columns',
      contents: [
        {
          type: 'rows',
          contents: [
            {
              type: 'stack',
              contents: [
                { type: 'panel', component: 'map', id: 'map' },
                { type: 'panel', component: 'three-d-view', id: 'threeDView' },
              ],
              height: 58,
            },
            {
              type: 'stack',
              contents: [
                { type: 'panel', component: 'uav-list', id: 'uavList' },
                { type: 'panel', component: 'rtls-tags', id: 'rtlsTags' },
                { type: 'panel', component: 'rtls-anchors', id: 'rtlsAnchors' },
              ],
            },
          ],
        },
        {
          type: 'rows',
          contents: [
            {
              type: 'stack',
              contents: [
                { type: 'panel', component: 'lcd-clock-panel', id: 'clocks' },
                { type: 'panel', component: 'layer-list', id: 'layers' },
              ],
              height: 22,
            },
            {
              type: 'stack',
              contents: [
                { type: 'panel', component: 'show-control', id: 'show' },
                { type: 'panel', component: 'light-control', id: 'lights' },
              ],
            },
          ],
          width: 30,
        },
      ],
    },
  },

  /* Narrow windows: every panel is a tab of a single stack, in the order an
   * operator walks through them. Applied automatically; see
   * `features/workbench/ResponsiveLayout`. */
  compact: {
    label: 'Compact',
    layout: {
      type: 'stack',
      contents: [
        { type: 'panel', component: 'show-control', id: 'show' },
        { type: 'panel', component: 'uav-list', id: 'uavList' },
        { type: 'panel', component: 'map', id: 'map' },
        { type: 'panel', component: 'rtls-tags', id: 'rtlsTags' },
        { type: 'panel', component: 'rtls-anchors', id: 'rtlsAnchors' },
        { type: 'panel', component: 'lcd-clock-panel', id: 'clocks' },
        { type: 'panel', component: 'light-control', id: 'lights' },
        { type: 'panel', component: 'three-d-view', id: 'threeDView' },
      ],
    },
  },
};

export default commonLayouts;
