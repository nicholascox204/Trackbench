import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';
import { s } from './kit';

// A place arriving from one side: it slides a short way and fades in, from the right when it is further along the bar than the one you left, from the
// left when it is earlier. It is a short move on purpose: enough to read as a swipe and to cover the moment a page is measuring itself.
export function SwipeIn({ dir: arrived, children }: { dir: -1 | 0 | 1; children: ReactNode }) {
  const dir = useRef(arrived).current; // fixed when it arrives; a later re-render of the page must not restart or cancel the slide
  const t = useRef(new Animated.Value(dir === 0 ? 1 : 0)).current;
  useEffect(() => {
    if (dir === 0) return;
    Animated.timing(t, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [dir, t]);
  return (
    <Animated.View style={[s.screen, { opacity: t, transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [dir * 56, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}
