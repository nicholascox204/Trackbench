// Shared sizes. Change here, every screen follows.

export const ICON = { inline: 18, row: 22, card: 30, tile: 42, picker: 22 };
// The longest a person-chosen name may be. Names appear in the bottom bar, headers and cards, so a limit here is what
// keeps them from being cut off everywhere else; the places that show them still truncate with an ellipsis as a backstop.
export const LIMITS = { trackerName: 24, nameWarnAt: 18 };
export const TAP_TARGET = 44; // minimum comfortable touch size
export const CONTENT_MAX_WIDTH = 600;

// Separation: controls that open or choose must stand apart from what is around them, and the end of a
// list needs room so the last option does not run into the next control. Used by Dropdown and the builders.
export const SEPARATION = {
  controlBorder: 1.5, // choosing controls (dropdowns, option cards) use a firm border, cards use a hairline
  panelGap: 8, // between a dropdown's trigger and its open list
  rowPad: 13, // vertical padding of a list row
  endOfList: 18, // space after the last option, so the list does not blend into what follows
  section: 20, // between sections of a builder
  listMaxHeight: 280, // a long list scrolls inside itself instead of pushing the page down
};

// The bottom bar of trackers.
// minItem and maxItem bound an item's width; visible is how many to show at once when there is room.
// edge is a margin on each side that is always reserved, so an arrow can sit in it without covering anything.
// The measurements of a number box (steppers and hours-and-minutes share them): how wide a digit and a point are at the box's
// type size, the padding inside, and the gaps around a unit. Change them here and every number box follows.
// edge: the same space between the minus and the first digit as between the last character (or unit) and the plus.
export const NUMBER_BOX = { digit: 10.5, point: 5, edge: 8, unitGap: 5, partGap: 10, height: 40 };

// gap: room under the row, on top of the phone's own gesture/navigation area, so a press on the row never lands on the system bar.
export const NAV = { height: 54, icon: 22, minItem: 60, maxItem: 104, edge: 16, visible: 5, gap: 10 };

// Item width for this screen. The bar aims to show `NAV.visible` items at once whenever the screen has room for
// that many at the minimum width; with fewer trackers than that they share the width evenly (up to the maximum);
// with more, the row scrolls item by item and the edge arrows say so. On a narrow screen fewer are shown.
export function itemWidthFor(screenWidth: number, count: number): { width: number; fits: boolean; visible: number } {
  const visible = Math.max(1, Math.min(NAV.visible, Math.floor(screenWidth / NAV.minItem)));
  if (count <= visible) return { width: Math.min(screenWidth / count, NAV.maxItem), fits: true, visible: count };
  return { width: screenWidth / visible, fits: false, visible };
}
