import YooCarLogo from "./YooCarLogo";

interface Props { size?: number }

/** Brand logo — renders assets/brand/yoo-logo.svg */
export default function YooIcon({ size = 160 }: Props) {
  return <YooCarLogo size={Math.round(size * 0.62)} />;
}
