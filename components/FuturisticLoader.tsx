/**
 * FuturisticLoader — YOO Quantum Motion System
 *
 * Stack: Reanimated 3 (worklets) + React Native SVG (GPU vector + filters)
 * Pattern: strokeDashoffset on a pre-computed lemniscate path → zero JS-thread cost
 * Glow: SVG feGaussianBlur + feMerge (screen-blend bloom, layered falloff)
 * CA: three-layer logo with animated translateX divergence → convergence
 */
import React, { useMemo, useEffect } from "react";
import { View, StyleSheet, Dimensions, Platform, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  withSpring,
  Easing,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import Svg, {
  Path,
  Circle,
  Defs,
  RadialGradient,
  Stop,
  Filter,
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  Rect,
} from "react-native-svg";
import YooIcon from "./YooIcon";

// ─── Animated SVG primitives ──────────────────────────────────────────────────
// Cast to ComponentType<any> — Reanimated 4's createAnimatedComponent overload
// resolution falls back to FlatListProps<unknown> for third-party SVG elements,
// causing spurious type errors. The runtime behaviour is correct.
const AnimatedPath   = Animated.createAnimatedComponent(Path   as any) as React.ComponentType<any>;
const AnimatedCircle = Animated.createAnimatedComponent(Circle as any) as React.ComponentType<any>;

// ─── Design constants (independent of screen size) ───────────────────────────
const LOGO_SIZE = 220;
const LOGO_W    = LOGO_SIZE;
const LOGO_H    = LOGO_SIZE * (210 / 350);

const COLOR = {
  BLUE:      "#1E88FF",
  BLUE_DIM:  "#1565D8",
  EMERALD:   "#22C55E",
  EMLD_DIM:  "#166534",
  BG:        "#08152F",
};

// Phase timing (ms)
const T = {
  BG_FADE:      0,    BG_DUR:   500,
  TRAIL_START:  280,  TRAIL_IN: 700,
  LOGO_START:   1100, LOGO_IN:  500,
  TEXT_START:   1700, TEXT_IN:  500,
  PULSE_START:  1800,
  SHIMMER_START:2200,
  TRAIL_ORBIT:  3000,   // ms per full orbit, trail 1
  TRAIL_ORBIT2: 2600,   // trail 2 (slightly faster, phase offset = π)
} as const;

const TRAIL_STEPS        = 320;
const TRAIL_LENGTH_RATIO = 0.26; // visible fraction of total path
const PARTICLE_COUNT     = 22;

// ─── Lemniscate path builder (runs once) ─────────────────────────────────────
function buildLemniscate(cx: number, cy: number, A: number, steps: number) {
  let d = "";
  let len = 0;
  let px = 0, py = 0;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = cx + A * Math.sin(t);
    const y = cy + A * Math.sin(t) * Math.cos(t);
    if (i === 0) {
      d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    } else {
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      len += Math.hypot(x - px, y - py);
    }
    px = x; py = y;
  }
  return { path: d + " Z", length: len };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function FuturisticLoader() {
  // ── Screen-dependent geometry ─────────────────────────────────────────────
  // Dimensions.get inside useMemo runs during React render (not at module-eval
  // time), so the browser has a valid layout and never returns {0,0} on web.
  const geo = useMemo(() => {
    const { width, height } = Dimensions.get("window");
    const safeW = width  || 375;
    const safeH = height || 812;

    const LOGO_LEFT = safeW / 2 - LOGO_W / 2;
    const LOGO_TOP  = safeH / 2 - LOGO_H / 2 - 55;

    const vbToScreen = (vx: number, vy: number) => ({
      x: LOGO_LEFT + (vx / 350) * LOGO_W,
      y: LOGO_TOP  + (vy / 210) * LOGO_H,
    });

    const LEFT_O     = vbToScreen(190, 100);
    const RIGHT_O    = vbToScreen(278, 100);
    const O_R_SCREEN = (54 / 350) * LOGO_W;                           // ≈ 34 px
    const LEMN_CX    = (LEFT_O.x + RIGHT_O.x) / 2;
    const LEMN_CY    = (LEFT_O.y + RIGHT_O.y) / 2;
    const LEMN_A     = (RIGHT_O.x - LEFT_O.x) / 2 + O_R_SCREEN * 0.6;

    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x:     (i * 83.7  + 29) % safeW,
      y:     (i * 137.3 + 61) % safeH,
      size:  0.7 + (i % 5) * 0.45,
      op:    0.08 + (i % 6) * 0.04,
      color: i % 3 === 0 ? COLOR.BLUE : i % 3 === 1 ? COLOR.EMERALD : "#ffffff",
    }));

    return { LOGO_LEFT, LOGO_TOP, LEFT_O, RIGHT_O, O_R_SCREEN, LEMN_CX, LEMN_CY, LEMN_A, particles, safeW, safeH };
  }, []);

  const { LOGO_LEFT, LOGO_TOP, LEFT_O, RIGHT_O, O_R_SCREEN, LEMN_CX, LEMN_CY, LEMN_A, particles, safeW, safeH } = geo;

  // ── Pre-compute lemniscate ─────────────────────────────────────────────────
  const { path: lemnPath, length: lemnLen } = useMemo(
    () => buildLemniscate(LEMN_CX, LEMN_CY, LEMN_A, TRAIL_STEPS),
    [LEMN_CX, LEMN_CY, LEMN_A]
  );
  const trailVis  = lemnLen * TRAIL_LENGTH_RATIO;
  const dashArray = `${trailVis.toFixed(1)} ${(lemnLen - trailVis).toFixed(1)}`;

  // ── Shared values ────────────────────────────────────────────────────────────
  const bgOpacity    = useSharedValue(0);
  const trailT1      = useSharedValue(0);
  const trailT2      = useSharedValue(0);
  const trailOpacity = useSharedValue(0);
  const logoOpacity  = useSharedValue(0);
  const logoScale    = useSharedValue(0.86);
  const caOffset     = useSharedValue(11);    // chromatic aberration px spread
  const caOpacity    = useSharedValue(0);
  const glowT        = useSharedValue(0);     // continuous 0 → 2π for sin pulse
  const shimPos      = useSharedValue(0);     // 0→1 shimmer scan position
  const textOpacity  = useSharedValue(0);
  const exitProgress = useSharedValue(0);

  // ── Master timeline ───────────────────────────────────────────────────────
  useEffect(() => {
    // Background
    bgOpacity.value = withDelay(T.BG_FADE,
      withTiming(1, { duration: T.BG_DUR, easing: Easing.bezier(0.4, 0, 0.2, 1) })
    );

    // Energy trails emerge
    trailOpacity.value = withDelay(T.TRAIL_START,
      withTiming(1, { duration: T.TRAIL_IN, easing: Easing.bezier(0.4, 0, 0.2, 1) })
    );
    trailT1.value = withDelay(T.TRAIL_START,
      withRepeat(
        withTiming(-lemnLen, { duration: T.TRAIL_ORBIT, easing: Easing.linear }),
        -1, false
      )
    );
    trailT2.value = withDelay(T.TRAIL_START,
      withRepeat(
        withTiming(lemnLen * 0.5 - lemnLen, { duration: T.TRAIL_ORBIT2, easing: Easing.linear }),
        -1, false
      )
    );

    // Logo materialise
    logoOpacity.value = withDelay(T.LOGO_START,
      withTiming(1, { duration: T.LOGO_IN, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })
    );
    logoScale.value = withDelay(T.LOGO_START,
      withSequence(
        withSpring(1.04, { damping: 10, stiffness: 130 }),
        withSpring(1.00, { damping: 22, stiffness: 200 })
      )
    );
    // Chromatic aberration: bloom in, converge, vanish
    caOpacity.value = withDelay(T.LOGO_START,
      withSequence(
        withTiming(0.5,  { duration: 180 }),
        withDelay(380, withTiming(0, { duration: 320 }))
      )
    );
    caOffset.value = withDelay(T.LOGO_START,
      withTiming(0, { duration: 700, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })
    );

    // Glow heartbeat (continuous sin oscillator)
    glowT.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 1900, easing: Easing.linear }),
      -1, false
    );

    // Text
    textOpacity.value = withDelay(T.TEXT_START,
      withTiming(1, { duration: T.TEXT_IN, easing: Easing.bezier(0.4, 0, 0.2, 1) })
    );

    // Shimmer scan (starts after text is in)
    const t = setTimeout(() => {
      shimPos.value = withRepeat(
        withTiming(1, { duration: 3400, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
        -1, false
      );
    }, T.SHIMMER_START);
    return () => clearTimeout(t);
  }, [lemnLen]); // eslint-disable-line react-hooks/exhaustive-deps -- Reanimated shared values are stable refs

  // ── Animated props for SVG elements ──────────────────────────────────────────
  const trail1Props = useAnimatedProps(() => ({
    strokeDashoffset: trailT1.value,
    strokeOpacity:    trailOpacity.value,
  }));
  const trail1GlowProps = useAnimatedProps(() => ({
    strokeDashoffset: trailT1.value,
    strokeOpacity:    trailOpacity.value * 0.28,
  }));
  const trail1GhostProps = useAnimatedProps(() => ({
    strokeDashoffset: trailT1.value + lemnLen * 0.1,
    strokeOpacity:    trailOpacity.value * 0.1,
  }));

  const trail2Props = useAnimatedProps(() => ({
    strokeDashoffset: trailT2.value,
    strokeOpacity:    trailOpacity.value * 0.95,
  }));
  const trail2GlowProps = useAnimatedProps(() => ({
    strokeDashoffset: trailT2.value,
    strokeOpacity:    trailOpacity.value * 0.25,
  }));
  const trail2GhostProps = useAnimatedProps(() => ({
    strokeDashoffset: trailT2.value + lemnLen * 0.1,
    strokeOpacity:    trailOpacity.value * 0.08,
  }));

  // Glow rings — sin oscillator so no frame skips on repeat boundary
  const ring1PropsLeft = useAnimatedProps(() => {
    const v = (Math.sin(glowT.value) + 1) * 0.5;
    return {
      r:       O_R_SCREEN * 1.08 + v * O_R_SCREEN * 0.22,
      opacity: 0.12 + v * 0.28,
    };
  });
  const ring2PropsLeft = useAnimatedProps(() => {
    const v = (Math.sin(glowT.value) + 1) * 0.5;
    return {
      r:       O_R_SCREEN * 1.45 + v * O_R_SCREEN * 0.28,
      opacity: 0.04 + v * 0.10,
    };
  });
  const ring1PropsRight = useAnimatedProps(() => {
    const v = (Math.sin(glowT.value + 1.26) + 1) * 0.5; // +72° phase offset
    return {
      r:       O_R_SCREEN * 1.08 + v * O_R_SCREEN * 0.22,
      opacity: 0.10 + v * 0.24,
    };
  });
  const ring2PropsRight = useAnimatedProps(() => {
    const v = (Math.sin(glowT.value + 1.26) + 1) * 0.5;
    return {
      r:       O_R_SCREEN * 1.45 + v * O_R_SCREEN * 0.28,
      opacity: 0.04 + v * 0.08,
    };
  });

  // ── Animated styles ───────────────────────────────────────────────────────
  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));

  const logoContainerStyle = useAnimatedStyle(() => ({
    opacity:   logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const caRedStyle = useAnimatedStyle(() => ({
    opacity:  caOpacity.value,
    position: "absolute" as const,
    transform: [{ translateX: -caOffset.value }],
  }));
  const caCyanStyle = useAnimatedStyle(() => ({
    opacity:  caOpacity.value,
    position: "absolute" as const,
    transform: [{ translateX: caOffset.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  const shimmerStyle = useAnimatedStyle(() => {
    const x = interpolate(
      shimPos.value, [0, 0.45, 0.5, 0.55, 1],
      [-80, 60, 90, 120, 280], Extrapolation.CLAMP
    );
    const op = interpolate(
      shimPos.value, [0, 0.42, 0.5, 0.58, 1],
      [0, 0, 1, 0, 0], Extrapolation.CLAMP
    );
    return { transform: [{ translateX: x }], opacity: op };
  });

  const exitStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(exitProgress.value, [0, 0.15, 1], [1, 0.97, 5.5], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(exitProgress.value, [0, 0.5, 1], [1, 1, 0], Extrapolation.CLAMP),
  }));


  // ── Render ────────────────────────────────────────────────────────────────
  const TEXT_W = 220;
  const TEXT_Y = LOGO_TOP + LOGO_H + 26;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.container, exitStyle]}>

      {/* ── Deep space background ─────────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]}>
        <Svg width={safeW} height={safeH} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="bg" cx="50%" cy="44%" r="72%">
              <Stop offset="0%"   stopColor="#071428" />
              <Stop offset="50%"  stopColor="#040D1C" />
              <Stop offset="100%" stopColor={COLOR.BG} />
            </RadialGradient>
            <RadialGradient id="aura_b" cx="34%" cy="38%" r="48%">
              <Stop offset="0%"   stopColor={COLOR.BLUE}    stopOpacity="0.09" />
              <Stop offset="100%" stopColor={COLOR.BLUE}    stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="aura_g" cx="68%" cy="62%" r="44%">
              <Stop offset="0%"   stopColor={COLOR.EMERALD} stopOpacity="0.07" />
              <Stop offset="100%" stopColor={COLOR.EMERALD} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width={safeW} height={safeH} fill="url(#bg)" />
          <Rect width={safeW} height={safeH} fill="url(#aura_b)" />
          <Rect width={safeW} height={safeH} fill="url(#aura_g)" />
          {/* Static particle field — visual texture, zero animation cost */}
          {particles.map((p, i) => (
            <Circle
              key={i}
              cx={p.x} cy={p.y}
              r={p.size}
              fill={p.color}
              opacity={p.op}
            />
          ))}
        </Svg>
      </Animated.View>

      {/* ── Glow rings + energy trails ────────────────────────────────── */}
      <Svg width={safeW} height={safeH} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          {/* Layered bloom: outer soft haze */}
          <Filter id="bloom_outer" x="-80%" y="-80%" width="260%" height="260%">
            <FeGaussianBlur stdDeviation="14" result="blur" />
            <FeMerge>
              <FeMergeNode in="blur" />
              <FeMergeNode in="SourceGraphic" />
            </FeMerge>
          </Filter>
          {/* Inner tight glow */}
          <Filter id="bloom_inner" x="-40%" y="-40%" width="180%" height="180%">
            <FeGaussianBlur stdDeviation="5" result="blur" />
            <FeMerge>
              <FeMergeNode in="blur" />
              <FeMergeNode in="SourceGraphic" />
            </FeMerge>
          </Filter>
        </Defs>

        {/* Outer atmospheric rings */}
        <AnimatedCircle cx={LEFT_O.x}  cy={LEFT_O.y}  fill="none" stroke={COLOR.BLUE}    strokeWidth={1.5} animatedProps={ring2PropsLeft} />
        <AnimatedCircle cx={RIGHT_O.x} cy={RIGHT_O.y} fill="none" stroke={COLOR.EMERALD} strokeWidth={1.5} animatedProps={ring2PropsRight} />

        {/* Inner pulse rings */}
        <AnimatedCircle cx={LEFT_O.x}  cy={LEFT_O.y}  fill="none" stroke={COLOR.BLUE}    strokeWidth={2.5} animatedProps={ring1PropsLeft} />
        <AnimatedCircle cx={RIGHT_O.x} cy={RIGHT_O.y} fill="none" stroke={COLOR.EMERALD} strokeWidth={2.5} animatedProps={ring1PropsRight} />

        {/* Trail 1 ghost (wide, ultra-low opacity) */}
        <AnimatedPath
          d={lemnPath} fill="none"
          stroke={COLOR.BLUE} strokeWidth={22}
          strokeDasharray={`${(trailVis * 0.45).toFixed(1)} ${(lemnLen - trailVis * 0.45).toFixed(1)}`}
          strokeLinecap="round"
          animatedProps={trail1GhostProps}
        />
        {/* Trail 1 outer bloom */}
        <AnimatedPath
          d={lemnPath} fill="none"
          stroke={COLOR.BLUE} strokeWidth={9}
          strokeDasharray={dashArray} strokeLinecap="round"
          animatedProps={trail1GlowProps}
        />
        {/* Trail 1 bright core */}
        <AnimatedPath
          d={lemnPath} fill="none"
          stroke={COLOR.BLUE} strokeWidth={2.2}
          strokeDasharray={dashArray} strokeLinecap="round"
          animatedProps={trail1Props}
        />

        {/* Trail 2 ghost */}
        <AnimatedPath
          d={lemnPath} fill="none"
          stroke={COLOR.EMERALD} strokeWidth={22}
          strokeDasharray={`${(trailVis * 0.45).toFixed(1)} ${(lemnLen - trailVis * 0.45).toFixed(1)}`}
          strokeLinecap="round"
          animatedProps={trail2GhostProps}
        />
        {/* Trail 2 outer bloom */}
        <AnimatedPath
          d={lemnPath} fill="none"
          stroke={COLOR.EMERALD} strokeWidth={9}
          strokeDasharray={dashArray} strokeLinecap="round"
          animatedProps={trail2GlowProps}
        />
        {/* Trail 2 bright core */}
        <AnimatedPath
          d={lemnPath} fill="none"
          stroke={COLOR.EMERALD} strokeWidth={2.2}
          strokeDasharray={dashArray} strokeLinecap="round"
          animatedProps={trail2Props}
        />
      </Svg>

      {/* ── Logo + chromatic aberration ───────────────────────────────── */}
      <Animated.View style={[{ position: "absolute", left: LOGO_LEFT, top: LOGO_TOP, width: LOGO_W, height: LOGO_H }, logoContainerStyle]}>
        {/* CA — red-warm shifted copy */}
        <Animated.View style={caRedStyle}>
          <YooIcon size={LOGO_SIZE} />
        </Animated.View>
        {/* Main logo */}
        <YooIcon size={LOGO_SIZE} />
        {/* CA — cyan-cold shifted copy */}
        <Animated.View style={caCyanStyle}>
          <YooIcon size={LOGO_SIZE} />
        </Animated.View>
      </Animated.View>

      {/* ── Text + specular shimmer ───────────────────────────────────── */}
      <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: TEXT_Y, alignItems: "center" }, textStyle]}>
        <View style={{ overflow: "hidden", width: TEXT_W, height: 28 }}>
          <Text style={s.tagline}>RIDESHARE APP</Text>
          {/* Specular highlight strip that sweeps left → right */}
          <Animated.View style={[s.shimmer, shimmerStyle]} />
        </View>
      </Animated.View>

    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    backgroundColor: COLOR.BG,
  },
  tagline: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.38)",
    letterSpacing: 5,
    top: 6,
    ...Platform.select({
      web:     { textShadow: "0 0 12px rgba(26,115,232,0.5)" },
      default: {
        textShadowColor:  "rgba(26,115,232,0.45)",
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
      },
    }),
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 55,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.55)",
    ...Platform.select({
      web: { filter: "blur(6px)" } as any,
    }),
  },
});
