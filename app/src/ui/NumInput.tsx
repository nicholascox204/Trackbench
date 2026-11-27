import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { colors } from './kit';
import { px } from '../ui/theme';

// A numeric input that commits as you type but keeps your own text while editing
// (so "6." stays "6." and decimals work).
//
// The box itself never receives touches: a transparent layer over it does, and a tap on that layer focuses the box. On
// Android a touch that lands on a text box can keep a drag for itself, so scrolling the page stalled whenever a finger
// started on one of these. A plain pressable layer hands the drag to the page straight away and still opens the keyboard
// on a tap. (The whole text is selected on focus, so nothing is lost by not placing the cursor with the touch.)
export function NumInput({
  value, onCommit, onEnd, placeholder, disabled, style, maxLength,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  onEnd?: () => void; // when the box loses focus: for a number that should only take effect once you are done typing
  placeholder?: string;
  disabled?: boolean;
  style?: StyleProp<TextStyle>;
  maxLength?: number; // the most characters that can be typed
}) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const [txt, setTxt] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    const parsed = parseFloat(txt.replace(',', '.'));
    if (value === undefined) {
      if (txt !== '' && !Number.isNaN(parsed)) setTxt('');
    } else if (parsed !== value) {
      setTxt(String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View>
      <TextInput
        ref={ref}
        pointerEvents="none"
        style={[
          {
            backgroundColor: colors.raised, borderColor: colors.border, borderWidth: px(1), borderRadius: 6,
            color: colors.text, fontSize: 14, textAlign: 'center', paddingVertical: 6, paddingHorizontal: 2, height: 34,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
        value={txt}
        editable={!disabled}
        keyboardType="decimal-pad"
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.hint}
        selectTextOnFocus
        onBlur={onEnd}
        onChangeText={(t) => {
          setTxt(t);
          if (t.trim() === '') return onCommit(undefined);
          const p = parseFloat(t.replace(',', '.'));
          if (!Number.isNaN(p)) onCommit(p);
        }}
      />
      {disabled ? null : (
        <Pressable
          onPress={() => ref.current?.focus()}
          accessibilityRole="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
    </View>
  );
}
