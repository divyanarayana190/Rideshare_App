/**
 * NandiIcon — Legacy icon (superseded by YooIcon).
 *
 * Structure (matches the reference image exactly):
 *   • Two wide curving horns — left: navy→blue, right: amber
 *   • Front-view car sitting in the fork between the horns
 *   • V/Y body (navy-blue) below the car, connecting horns to stem
 *   • Shoulder flares left and right
 *   • Rectangular base/hoof at the bottom
 */
import Svg, {
  Path, Rect, Ellipse, Defs, LinearGradient, Stop,
} from "react-native-svg";

interface Props { size?: number }

export default function NandiIcon({ size = 160 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        {/* Left horn: navy → vivid blue (the same look as in the logo) */}
        <LinearGradient id="ni_lh" x1="100%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#1E82D2" />
          <Stop offset="100%" stopColor="#1B3A6B" />
        </LinearGradient>

        {/* Right horn: amber → dark amber */}
        <LinearGradient id="ni_rh" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#F5A623" />
          <Stop offset="100%" stopColor="#C97D10" />
        </LinearGradient>

        {/* V-body and shoulders: deep navy → mid blue */}
        <LinearGradient id="ni_body" x1="0%" y1="0%" x2="60%" y2="100%">
          <Stop offset="0%"   stopColor="#1E82D2" />
          <Stop offset="50%"  stopColor="#1B3A6B" />
          <Stop offset="100%" stopColor="#152E5A" />
        </LinearGradient>

        {/* Left shoulder: blue-tinted */}
        <LinearGradient id="ni_ls" x1="100%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#1E82D2" />
          <Stop offset="100%" stopColor="#1B3A6B" />
        </LinearGradient>

        {/* Right shoulder: navy-tinted */}
        <LinearGradient id="ni_rs" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%"   stopColor="#1B3A6B" />
          <Stop offset="100%" stopColor="#1E82D2" />
        </LinearGradient>

        {/* Car body */}
        <LinearGradient id="ni_car" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%"   stopColor="#3AA3F0" />
          <Stop offset="100%" stopColor="#1E82D2" />
        </LinearGradient>
      </Defs>

      {/* ══════ LEFT HORN ══════
          Sweeps from the top of the V-joint up and to the left.
          Thick stroke with round cap mimics the filled arc in the logo. */}
      <Path
        d="M 80 90
           Q 58 72 34 56
           Q 16 44 8 54
           Q 2 64 10 70
           Q 28 76 54 84"
        fill="none"
        stroke="url(#ni_lh)"
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Specular highlight on left horn */}
      <Path
        d="M 80 90 Q 58 72 34 56 Q 18 46 10 54"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* ══════ RIGHT HORN ══════ */}
      <Path
        d="M 120 90
           Q 142 72 166 56
           Q 184 44 192 54
           Q 198 64 190 70
           Q 172 76 146 84"
        fill="none"
        stroke="url(#ni_rh)"
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Specular highlight on right horn */}
      <Path
        d="M 120 90 Q 142 72 166 56 Q 182 46 190 54"
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* ══════ CAR — front view, sits in the fork of the V ══════ */}
      {/* Main body */}
      <Rect x="74" y="46" width="52" height="26" rx="7" fill="url(#ni_car)" />
      {/* Roof dome */}
      <Path
        d="M 82 46 Q 100 30 118 46 Z"
        fill="url(#ni_car)"
      />
      {/* Windshield */}
      <Path
        d="M 84 46 Q 100 33 116 46 L 112 52 L 88 52 Z"
        fill="rgba(255,255,255,0.38)"
      />
      {/* Left headlight */}
      <Ellipse cx="79"  cy="63" rx="6.5" ry="4.5" fill="#F5A623" />
      <Ellipse cx="79"  cy="63" rx="10"  ry="7"   fill="#F5A623" fillOpacity="0.2" />
      {/* Right headlight */}
      <Ellipse cx="121" cy="63" rx="6.5" ry="4.5" fill="#F5A623" />
      <Ellipse cx="121" cy="63" rx="10"  ry="7"   fill="#F5A623" fillOpacity="0.2" />
      {/* Grille */}
      <Rect x="86" y="67" width="28" height="3.5" rx="1.5" fill="rgba(255,255,255,0.28)" />

      {/* ══════ V / Y BODY ══════
          The forked neck that connects the two horns and car to the stem. */}
      <Path
        d="M 93 86
           L 81 118
           L 89 120
           L 100 92
           L 111 120
           L 119 118
           L 107 86
           Z"
        fill="url(#ni_body)"
      />

      {/* ══════ CENTRE STEM ══════ */}
      <Rect x="88" y="116" width="24" height="50" rx="5" fill="url(#ni_body)" />

      {/* ══════ LEFT SHOULDER FLARE ══════ */}
      <Path
        d="M 89 120
           Q 72 125 55 134
           Q 43 140 46 149
           Q 49 156 62 151
           Q 78 145 90 133
           Z"
        fill="url(#ni_ls)"
      />

      {/* ══════ RIGHT SHOULDER FLARE ══════ */}
      <Path
        d="M 111 120
           Q 128 125 145 134
           Q 157 140 154 149
           Q 151 156 138 151
           Q 122 145 110 133
           Z"
        fill="url(#ni_rs)"
      />

      {/* ══════ BASE / HOOF ══════ */}
      <Path
        d="M 87 163
           L 83 174
           Q 83 179 87 179
           L 113 179
           Q 117 179 117 174
           L 113 163
           Z"
        fill="#152E5A"
      />
    </Svg>
  );
}
