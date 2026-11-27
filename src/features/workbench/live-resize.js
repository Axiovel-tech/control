/**
 * @file Makes the panels of the workbench follow the splitter while it is
 * being dragged.
 *
 * golden-layout only moves the splitter during a drag and resizes the panels
 * when the mouse button is released. It offers no option for resizing them
 * continuously, so the three drag handlers of its rows and columns are
 * replaced here.
 */

import GoldenLayout from 'golden-layout';

/**
 * Distance in pixels that the mouse has to travel before a splitter starts
 * to move. The library waits for 10 pixels, which shows as a jump when the
 * panels follow the splitter.
 */
const DRAG_START_DISTANCE = 1;

/**
 * Replaces the splitter drag handlers of golden-layout with ones that resize
 * the panels on both sides of the splitter during the drag.
 *
 * Must be called before the first layout is created: every splitter binds
 * its handlers when it is created.
 */
export function enableLiveSplitterResizing() {
  const proto = GoldenLayout?.__lm?.items?.RowOrColumn?.prototype;
  if (!proto || proto._resizesLive) {
    return;
  }

  const createSplitter = proto._createSplitter;
  const onSplitterDragStart = proto._onSplitterDragStart;

  proto._resizesLive = true;

  proto._createSplitter = function (index) {
    const splitter = createSplitter.call(this, index);
    splitter._dragListener._nDistance = DRAG_START_DISTANCE;
    return splitter;
  };

  proto._onSplitterDragStart = function (splitter) {
    // Calculates the range in which the splitter may move
    onSplitterDragStart.call(this, splitter);

    const { before, after } = this._getItemsForSplitter(splitter);
    this._liveResize = {
      frame: undefined,
      sizeAfter: after.element[this._dimension](),
      sizeBefore: before.element[this._dimension](),
      totalRelativeSize:
        before.config[this._dimension] + after.config[this._dimension],
    };
  };

  proto._onSplitterDrag = function (splitter, offsetX, offsetY) {
    const live = this._liveResize;
    if (!live) {
      return;
    }

    // Offsets are relative to the place where the drag started
    const offset = Math.min(
      Math.max(this._isColumn ? offsetY : offsetX, this._splitterMinPosition),
      this._splitterMaxPosition
    );
    const ratio =
      (live.sizeBefore + offset) / (live.sizeBefore + live.sizeAfter);
    const { before, after } = this._getItemsForSplitter(splitter);

    before.config[this._dimension] = ratio * live.totalRelativeSize;
    after.config[this._dimension] = (1 - ratio) * live.totalRelativeSize;

    // The mouse may move several times between two frames; one layout pass
    // per frame is enough
    if (live.frame === undefined) {
      live.frame = requestAnimationFrame(() => {
        live.frame = undefined;
        this.callDownwards('setSize');
      });
    }
  };

  proto._onSplitterDragStop = function () {
    const live = this._liveResize;
    this._liveResize = undefined;

    if (live?.frame !== undefined) {
      cancelAnimationFrame(live.frame);
    }

    this.callDownwards('setSize');
  };
}
