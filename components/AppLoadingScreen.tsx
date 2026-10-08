import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  Dimensions,
  Platform,
} from "react-native";
import Svg, { Path, Circle, Ellipse, Rect, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";

const { width: SW } = Dimensions.get("window");

// ─── Inline car icon — side-view silhouette ───────────────────────────────────
function CarIcon({ width = 110 }: { width?: number }) {
  const h = width * 0.52;
  return (
    <Svg width={width} height={h} viewBox="0 0 110 57">
      <Defs>
        <SvgGrad id="car_body" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%"   stopColor="#FFD600" />
          <Stop offset="100%" stopColor="#FF8C00" />
        </SvgGrad>
        <SvgGrad id="car_roof" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%"   stopColor="#FF9A00" />
          <Stop offset="100%" stopColor="#A78BFA" />
        </SvgGrad>
        <SvgGrad id="car_wheel" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#1A1040" />
          <Stop offset="100%" stopColor="#0D0820" />
        </SvgGrad>
      </Defs>

      <Ellipse cx="55" cy="55" rx="44" ry="4" fill="rgba(0,0,0,0.35)" />

      <Path
        d="M 6 40 Q 5 48 13 48 L 97 48 Q 106 48 106 40 L 106 35
           Q 98 24 86 20 Q 74 16 60 16 Q 46 16 34 20 Q 18 28 10 35 Z"
        fill="url(#car_body)"
      />
      <Path
        d="M 30 35 Q 36 18 52 14 Q 64 10 78 14 Q 92 18 98 35 Z"
        fill="url(#car_roof)"
      />
      <Path
        d="M 36 35 Q 42 20 56 16 Q 68 13 80 16 Q 92 20 94 35 Z"
        fill="rgba(180,225,255,0.38)"
      />
      <Path
        d="M 48 18 Q 58 14 70 16 Q 60 15 52 18 Z"
        fill="rgba(255,255,255,0.45)"
      />
      <Path
        d="M 32 35 Q 34 25 40 20 Q 36 26 34 35 Z"
        fill="rgba(180,225,255,0.22)"
      />
      <Path
        d="M 60 35 L 60 47"
        stroke="rgba(255,255,255,0.12)" strokeWidth="1.2"
      />
      <Rect x="102" y="38" width="5" height="9" rx="2" fill="#0D47A1" />
      <Ellipse cx="104" cy="38" rx="4.5" ry="3.5" fill="#16A34A" />
      <Ellipse cx="104" cy="38" rx="7"   ry="5.5" fill="#16A34A" fillOpacity="0.22" />
      <Rect x="3" y="40" width="4" height="7" rx="2" fill="#E53935" />
      <Rect x="3" y="40" width="4" height="7" rx="2" fill="#E53935" fillOpacity="0.3" />
      <Circle cx="84" cy="48" r="11" fill="url(#car_wheel)" />
      <Circle cx="84" cy="48" r="6.5" fill="#1A2744" />
      <Circle cx="84" cy="48" r="3"   fill="#243A5E" />
      <Circle cx="82" cy="46" r="1.5" fill="rgba(255,255,255,0.3)" />
      <Circle cx="28" cy="48" r="11" fill="url(#car_wheel)" />
      <Circle cx="28" cy="48" r="6.5" fill="#1A2744" />
      <Circle cx="28" cy="48" r="3"   fill="#243A5E" />
      <Circle cx="26" cy="46" r="1.5" fill="rgba(255,255,255,0.3)" />
    </Svg>
  );
}

const ND = false;

type AV = InstanceType<typeof Animated.Value>;

const spring = (val: AV, to: number, delay: number, friction = 7, tension = 58) =>
  Animated.sequence([
    Animated.delay(delay),
    Animated.spring(val, { toValue: to, friction, tension, useNativeDriver: ND }),
  ]);

const fadeIn = (val: AV, delay: number, dur = 180) =>
  Animated.sequence([
    Animated.delay(delay),
    Animated.timing(val, { toValue: 1, duration: dur, useNativeDriver: ND }),
  ]);

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AppLoadingScreen() {

  // ── Car icon ──────────────────────────────────────────────────────────────
  const iconSc = useRef(new Animated.Value(0)).current;
  const iconOp = useRef(new Animated.Value(0)).current;
  const carY   = useRef(new Animated.Value(-18)).current;

  // ── Letter entrance transforms (Y, O, O) ──────────────────────────────────
  const yY   = useRef(new Animated.Value(-240)).current;  // Y: crashes from top
  const yOp  = useRef(new Animated.Value(0)).current;
  const o1Y  = useRef(new Animated.Value(240)).current;   // O1: rockets from bottom
  const o1Op = useRef(new Animated.Value(0)).current;
  const o2X  = useRef(new Animated.Value(240)).current;   // O2: slides from right
  const o2Op = useRef(new Animated.Value(0)).current;

  // ── Shimmer sweep ─────────────────────────────────────────────────────────
  const sweepX  = useRef(new Animated.Value(-220)).current;
  const sweepOp = useRef(new Animated.Value(0)).current;

  // ── Ripple float ──────────────────────────────────────────────────────────
  const fy0 = useRef(new Animated.Value(0)).current;
  const fy1 = useRef(new Animated.Value(0)).current;
  const fy2 = useRef(new Animated.Value(0)).current;

  // ── Glow pulse ────────────────────────────────────────────────────────────
  const glowPulse = useRef(new Animated.Value(0)).current;

  // ── Background aura ───────────────────────────────────────────────────────
  const bgAura = useRef(new Animated.Value(0.1)).current;

  // ── Tagline ───────────────────────────────────────────────────────────────
  const tagOp = useRef(new Animated.Value(0)).current;
  const tagY  = useRef(new Animated.Value(20)).current;

  // ── Progress bar ─────────────────────────────────────────────────────────
  const prog = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(bgAura, { toValue: 0.55, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: ND }),
      Animated.timing(bgAura, { toValue: 0.10, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: ND }),
    ])).start();

    Animated.timing(prog, { toValue: 1, duration: 4000, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: ND }).start();

    // Phase 1: Letters converge
    spring(yY,   0,    0, 7, 45).start(); fadeIn(yOp,    0, 250).start();
    spring(o1Y,  0,  280, 7, 45).start(); fadeIn(o1Op, 280, 250).start();
    spring(o2X,  0,  560, 7, 42).start(); fadeIn(o2Op, 560, 250).start();

    // Phase 2: Car pops in at 900ms
    Animated.sequence([
      Animated.delay(900),
      Animated.parallel([
        Animated.timing(iconOp, { toValue: 1, duration: 220, useNativeDriver: ND }),
        Animated.spring(carY,   { toValue: 0, friction: 5, tension: 100, useNativeDriver: ND }),
        Animated.spring(iconSc, { toValue: 1, friction: 4, tension: 110, useNativeDriver: ND }),
      ]),
    ]).start();

    // Car hover
    Animated.sequence([
      Animated.delay(1400),
      Animated.loop(Animated.sequence([
        Animated.timing(carY, { toValue: -7, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
        Animated.timing(carY, { toValue:  0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
      ])),
    ]).start();

    // Phase 3: Shimmer sweep at 1400ms
    Animated.sequence([
      Animated.delay(1400),
      Animated.timing(sweepOp, { toValue: 1, duration: 120, useNativeDriver: ND }),
      Animated.timing(sweepX,  { toValue: 340, duration: 750, easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), useNativeDriver: ND }),
      Animated.timing(sweepOp, { toValue: 0, duration: 250, useNativeDriver: ND }),
    ]).start();

    // Phase 4: Letter ripple float at 1700ms
    const floatLetter = (val: AV, phaseDelay: number) =>
      Animated.sequence([
        Animated.delay(1700 + phaseDelay),
        Animated.loop(Animated.sequence([
          Animated.timing(val, { toValue: -10, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
          Animated.timing(val, { toValue:   0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
        ])),
      ]);
    floatLetter(fy0,   0).start();
    floatLetter(fy1, 340).start();
    floatLetter(fy2, 680).start();

    // Glow pulse at 1700ms
    Animated.sequence([
      Animated.delay(1700),
      Animated.loop(Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: ND }),
        Animated.timing(glowPulse, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: ND }),
      ])),
    ]).start();

    // Phase 5: Tagline at 2100ms
    Animated.sequence([
      Animated.delay(2100),
      Animated.parallel([
        Animated.timing(tagOp, { toValue: 1, duration: 650, useNativeDriver: ND }),
        Animated.spring(tagY,  { toValue: 0, friction: 7, tension: 38, useNativeDriver: ND }),
      ]),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- all Animated.Values are stable refs

  return (
    <View style={s.container}>

      {/* ── Atmospheric background auras ── */}
      <Animated.View style={[s.auraBlue,  { opacity: bgAura }]} />
      <Animated.View style={[s.auraGreen, { opacity: bgAura }]} />
      <View style={s.auraCenter} />

      {/* ── Car icon ── */}
      <Animated.View style={{
        opacity: iconOp,
        marginBottom: 14,
        transform: [{ translateY: carY }, { scale: iconSc }],
      }}>
        <CarIcon width={108} />
      </Animated.View>

      {/* ── Y O O letters ── */}
      <View style={s.lettersRow}>

        {/* Y — crashes from top */}
        <Animated.View style={{ transform: [{ translateY: fy0 }] }}>
          <Animated.Text
            style={[s.letter, s.letterY, { opacity: yOp, transform: [{ translateY: yY }],
              ...Platform.select({ web: { textShadow: `0 0 22px rgba(255,180,0,0.9)` }, default: {
                textShadowColor: "rgba(255,180,0,0.9)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18 } }) }]}
          >Y</Animated.Text>
        </Animated.View>

        {/* O — rockets from bottom */}
        <Animated.View style={{ transform: [{ translateY: fy1 }] }}>
          <Animated.Text
            style={[s.letter, s.letterO1, { opacity: o1Op, transform: [{ translateY: o1Y }],
              ...Platform.select({ web: { textShadow: `0 0 22px rgba(99,102,241,0.9)` }, default: {
                textShadowColor: "rgba(99,102,241,0.9)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 18 } }) }]}
          >O</Animated.Text>
        </Animated.View>

        {/* O — slides from right */}
        <Animated.View style={{ transform: [{ translateY: fy2 }] }}>
          <Animated.Text
            style={[s.letter, s.letterO2, { opacity: o2Op, transform: [{ translateX: o2X }],
              ...Platform.select({ web: { textShadow: `0 0 24px rgba(124,58,237,0.95)` }, default: {
                textShadowColor: "rgba(124,58,237,0.95)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 } }) }]}
          >O</Animated.Text>
        </Animated.View>

        {/* Shimmer sweep */}
        <Animated.View
          style={[s.sweep, { opacity: sweepOp, transform: [{ translateX: sweepX }] }]}
          pointerEvents="none"
        />
      </View>

      {/* ── Tagline ── */}
      <Animated.Text style={[s.tagline, { opacity: tagOp, transform: [{ translateY: tagY }] }]}>
        RIDESHARE APP
      </Animated.Text>

      {/* ── Slim progress bar ── */}
      <View style={s.barOuter}>
        <Animated.View
          style={[s.barInner, {
            width: prog.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          }]}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles_letter_base = {
  fontSize: 52,
  fontWeight: "900" as const,
  color: "#FFFFFF",
  letterSpacing: 4,
  includeFontPadding: false,
};

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#090618",
    overflow: "hidden",
  },

  auraBlue: {
    position: "absolute",
    top: -SW * 0.6,
    left: -SW * 0.3,
    width: SW * 1.6,
    height: SW * 1.6,
    borderRadius: SW,
    backgroundColor: "rgba(255,160,0,0.10)",
  },
  auraGreen: {
    position: "absolute",
    bottom: -SW * 0.5,
    right: -SW * 0.2,
    width: SW * 1.0,
    height: SW * 1.0,
    borderRadius: SW,
    backgroundColor: "rgba(99,102,241,0.12)",
  },
  auraCenter: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(124,58,237,0.05)",
  },

  lettersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    marginBottom: 16,
    overflow: "visible",
    position: "relative",
  },

  letter: {
    ...styles_letter_base,
    paddingHorizontal: 3,
  },
  letterY: {
    color: "#FFD600",
  },
  letterO1: {
    color: "#A78BFA",
  },
  letterO2: {
    color: "#7C3AED",
  },

  sweep: {
    position: "absolute",
    top: -60,
    left: -40,
    width: 80,
    height: 200,
    backgroundColor: "rgba(255,210,80,0.22)",
    transform: [{ skewX: "-18deg" }],
    borderRadius: 4,
  },

  tagline: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 4,
    textTransform: "uppercase",
    marginBottom: 36,
    ...Platform.select({
      web:     { textShadow: "0 0 14px rgba(99,102,241,0.6)" },
      default: {
        textShadowColor: "rgba(99,102,241,0.55)",
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 12,
      },
    }),
  },

  barOuter: {
    position: "absolute",
    bottom: 44,
    width: SW * 0.5,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  barInner: {
    height: "100%",
    borderRadius: 1,
    backgroundColor: "#FF8C00",
  },
});
