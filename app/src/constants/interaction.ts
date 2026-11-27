// Every tap, press and scroll behavior lives here so it can be tuned in one place.
// Screens never set these themselves: they use Tap, Button, Chip and Scroll from ui/kit.

export const PRESS = {
  // Visual feedback while a finger is down, so people see what they are about to trigger.
  pressedOpacity: 0.6,
  // Sliding the finger further than this off the control cancels the press.
  retentionOffset: 12,
  // Extra tappable margin around small controls.
  hitSlop: 8,
  // Ignore a second press on the same control within this window (stops accidental double taps).
  doubleTapGuardMs: 350,
};

export const SCROLL = {
  // Keeps focused inputs visible above the keyboard (iOS adjusts insets; Android resizes the window).
  keyboardPersistTaps: 'handled' as const,
  dismissKeyboardOn: 'on-drag' as const,
  // Space kept between a focused field (or the bottom of its kept-together area, like a name box and its buttons) and the top
  // of the keyboard. Small on purpose: the field or its buttons sit just above the keyboard, without showing the next thing.
  // One value for every screen; change it here, everywhere follows.
  fieldMargin: 12,
  // For screens that show results under a search field: where the field sits from the top.
  fieldTopMargin: 6, // plus the phone's top safe area (notch, camera, status bar), so the field never sits behind it
  // Wait for the keyboard animation to settle before scrolling the field into view.
  focusDelayMs: 60,
  // Room under content when a fixed footer (Back / Next) sits over the bottom of the screen.
  footerPadding: 120,
  basePadding: 24,
};

// Hook point for haptics, sound and animation. Nothing is wired yet. When we add expo-haptics
// or a sound, it is called from here and every control picks it up.
export type FeedbackKind = 'tap' | 'select' | 'success' | 'warning';
export function feedback(_kind: FeedbackKind): void {
  // intentionally empty for now
}
