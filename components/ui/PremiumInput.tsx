import { AUTH, D } from "@/constants/design";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";

interface PremiumInputProps {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: boolean;
  trailing?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  secureTextEntry?: boolean;
  editable?: boolean;
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function PremiumInput({
  label,
  icon,
  error,
  trailing,
  style,
  onFocus,
  onBlur,
  ...rest
}: PremiumInputProps) {
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? D.red
    : focused
      ? AUTH.borderFocus
      : AUTH.border;

  return (
    <View>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: AUTH.textMuted,
          marginBottom: 8,
          marginLeft: 4,
        }}
      >
        {label}
      </Text>
      <View style={{ position: "relative" }}>
        {icon ? (
          <View
            style={{
              position: "absolute",
              left: 16,
              top: 0,
              bottom: 0,
              justifyContent: "center",
              zIndex: 1,
            }}
          >
            <Ionicons
              name={icon}
              size={20}
              color={focused ? D.blue : AUTH.textSubtle}
            />
          </View>
        ) : null}
        <TextInput
          {...rest}
          placeholderTextColor={AUTH.textSubtle}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[
            {
              borderWidth: 1.5,
              borderColor,
              borderRadius: D.radius.lg,
              paddingVertical: 16,
              paddingLeft: icon ? 50 : 16,
              paddingRight: trailing ? 50 : 16,
              fontSize: 16,
              color: AUTH.text,
              backgroundColor: focused ? "rgba(30, 136, 255, 0.08)" : AUTH.surfaceInput,
            },
            style,
          ]}
        />
        {trailing ? (
          <View
            style={{
              position: "absolute",
              right: 14,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            {trailing}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function PasswordToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Ionicons
        name={visible ? "eye-off-outline" : "eye-outline"}
        size={22}
        color={AUTH.textSubtle}
      />
    </TouchableOpacity>
  );
}
